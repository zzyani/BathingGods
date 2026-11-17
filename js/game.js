'use strict';
/* =========================================================
 * 게임 로직 — 상태 관리, 영업일 루프, 손님 AI, 상호작용, 엔딩
 * ========================================================= */

const Game = {
  canvas: null, ctx: null, W: 0, H: 0, dpr: 1, zoom: 1,
  cam: { x: 64, y: 260 }, t: 0, last: 0,
  screen: 'title',      // title | story | dayIntro | play | dayEnd | ending
  modal: null,          // null | dialog | tub | journal | pause
  meta: null,           // 여러 날에 걸쳐 유지되는 진행 상황 (저장 대상)
  world: null,          // 하루 단위 월드 상태
  daySnapshot: null,
  hover: null, tub: null, heating: false, heatOn: false, hudT: 0,
};
const SAVE_KEY = 'gods-bathhouse-save-v1';
const SOUND_KEY = 'gods-bathhouse-muted';

/* ---------- 저장 ---------- */
function newMeta() {
  return { day: 1, coins: 0, score: 0, stars: [], served: 0, missed: 0, upgrades: [], clues: [], kChoice: null, kResult: null };
}
function saveMeta() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.meta)); } catch (e) { /* 저장 불가 환경 */ } }
function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ } }
function hasUp(id) { return !!(Game.meta && Game.meta.upgrades.includes(id)); }
function invCap() { return hasUp('basket') ? 5 : 3; }

/* ---------- 부팅 ---------- */
window.addEventListener('load', init);
function init() {
  Game.canvas = document.getElementById('game');
  Game.ctx = Game.canvas.getContext('2d');
  Input.init(Game.canvas);
  UI.init();
  Assets.load();
  try { Sfx.muted = localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { /* noop */ }
  UI.setSoundIcon(Sfx.muted);
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) openPause(); });
  showTitle();
  requestAnimationFrame(loop);
}
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  Game.dpr = dpr;
  Game.W = window.innerWidth;
  Game.H = window.innerHeight;
  Game.canvas.width = Math.round(Game.W * dpr);
  Game.canvas.height = Math.round(Game.H * dpr);
  Game.zoom = Util.clamp(Math.min(Game.W / 1000, Game.H / 680), 0.62, 1.6);
}
function loop(ts) {
  const dt = Math.min(0.05, (ts - (Game.last || ts)) / 1000);
  Game.last = ts;
  Game.t += dt;
  try {
    update(dt);
    render();
  } catch (e) { console.error(e); }
  Input.endFrame();
  requestAnimationFrame(loop);
}

/* ---------- 화면 흐름 ---------- */
function showTitle() {
  Game.screen = 'title';
  Game.meta = newMeta();
  Game.world = buildWorld(1, true);
  UI.closeModal();
  UI.showHUD(false);
  UI.title(loadSave());
}
function newGame() {
  Sfx.ensure();
  clearSave();
  Game.meta = newMeta();
  Game.screen = 'story';
  UI.story(STORY_PAGES, () => startDay(1));
}
function continueGame() {
  const s = loadSave();
  if (!s) return;
  Sfx.ensure();
  Game.meta = Object.assign(newMeta(), s);
  startDay(Game.meta.day);
}
function startDay(day) {
  Game.meta.day = day;
  Game.daySnapshot = JSON.stringify(Game.meta);
  saveMeta();
  Game.world = buildWorld(day, false);
  Game.cam.x = Iso.x(PLAYER_START.x, PLAYER_START.y);
  Game.cam.y = Iso.y(PLAYER_START.x, PLAYER_START.y);
  Game.screen = 'dayIntro';
  UI.closeModal();
  UI.showHUD(false);
  UI.dayIntro(day, DAYS[day - 1], Game.meta);
}
function beginPlay() {
  Game.screen = 'play';
  UI.hideScreen();
  UI.showHUD(true);
  UI.updateHUD();
  if (Game.world.day === 1) UI.toast('WASD로 이동, 마우스로 상호작용!', 'good');
}
function restartDay() {
  if (!Game.daySnapshot) return;
  Game.meta = JSON.parse(Game.daySnapshot);
  startDay(Game.meta.day);
}
function quitToTitle() { showTitle(); }
function restartToTitle() { showTitle(); }

function endDay() {
  const w = Game.world, m = Game.meta;
  if (w.ended) return;
  for (const g of w.guests.slice()) {
    if (g.state === 'bathing' || g.state === 'toTub') { finishBath(g, true); continue; }
    if (g.special) {
      if (g.state === 'kWait' && !m.kChoice) m.kChoice = 'none';
      continue;
    }
    if (['arriving', 'waiting', 'following'].includes(g.state)) {
      w.stats.missed++; m.missed++;
      w.stats.stars.push(0); m.stars.push(0);
      w.stats.log.push({ name: guestName(g), stars: 0, note: '영업 시간이 끝나 돌아감' });
    }
  }
  if (w.cfg.kaonashiAt && !w.kEventDone && !m.kChoice) m.kChoice = 'none';
  w.ended = true;
  UI.closeModal();
  UI.showHUD(false);
  Game.screen = 'dayEnd';
  UI.dayEnd(w.stats, m, w.day, afterDayEnd);
}
function afterDayEnd() {
  const day = Game.world.day;
  if (day < 5) UI.shop(Game.meta, () => startDay(day + 1));
  else showEnding();
}
function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id), m = Game.meta;
  if (!u || m.upgrades.includes(id) || m.coins < u.cost) return;
  m.coins -= u.cost;
  m.upgrades.push(id);
  Sfx.play('good');
}
function showEnding() {
  const m = Game.meta;
  const type = m.kResult === 'healed' ? 'special' : 'normal';
  const avg = Util.avg(m.stars);
  const rank = avg >= 4.5 ? 'S' : avg >= 3.8 ? 'A' : avg >= 3 ? 'B' : 'C';
  clearSave();
  Game.screen = 'ending';
  UI.showHUD(false);
  UI.ending(type, { rank, avg, meta: m });
  Sfx.play(type === 'special' ? 'clue' : 'good');
}

/* ---------- 월드 생성 ---------- */
function makeSchedule(cfg) {
  const n = cfg.guests;
  const types = [...cfg.forced];
  while (types.length < n) {
    let t;
    do { t = Util.pick(cfg.pool); } while (cfg.pool.length > 1 && t === types[types.length - 1]);
    types.push(t);
  }
  if (!cfg.keepOrder) Util.shuffle(types);
  const start = 0.02, end = 0.66;
  return types.slice(0, n).map((type, i) => ({
    type,
    at: Util.clamp(start + (end - start) * (n === 1 ? 0 : i / (n - 1)) + (i ? Util.rand(-0.025, 0.025) : 0), 0, 0.7) * cfg.length,
    spawned: false,
  }));
}

function buildWorld(day, demo) {
  const cfg = DAYS[day - 1];
  const w = {
    day, cfg, demo: !!demo, time: 0, length: cfg.length, ended: false, endTimer: -1,
    objects: [], tubs: [], guests: [], gid: 0, schedule: [], clueItems: [],
    player: { x: PLAYER_START.x, y: PLAYER_START.y, face: 1, moving: false, t: 0, path: null, target: null, repath: 0, stuck: 0, busy: 0, busyTotal: 1, busyLabel: '', busyDone: null },
    inventory: [], effects: [], floats: [], follower: null, kaonashi: null, kEventDone: false, ghost: null, heatSfx: 0,
    stats: { served: 0, missed: 0, stars: [], coins: 0, score: 0, log: [] },
    objBlock: new Uint8Array(MAP_W * MAP_H),
  };
  for (const def of OBJECT_DEFS) {
    if (def.requires && !hasUp(def.requires)) continue;
    const o = { ...def };
    if (o.kind === 'tub') { o.state = 'empty'; o.temp = START_TEMP; o.herbs = []; o.guest = null; o.steam = 0; w.tubs.push(o); }
    w.objects.push(o);
    if (o.block !== false) {
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) w.objBlock[y * MAP_W + x] = 1;
    }
  }
  if (demo) {
    const t1 = w.tubs[0], t2 = w.tubs[1];
    const g1 = { id: 1, type: 'moss', state: 'bathing', bathT: BATH_TIME * 0.4, tub: t1, x: t1.x + 1, y: t1.y + 1, alpha: 1, face: 1, request: { temp: 41, herbs: ['ssuk'] } };
    Object.assign(t1, { state: 'occupied', guest: g1, temp: 41, herbs: ['ssuk'] });
    Object.assign(t2, { state: 'ready', temp: 45, herbs: ['yuja'] });
    const g2 = { id: 2, type: 'river', state: 'waiting', x: QUEUE_SPOTS[0][0], y: QUEUE_SPOTS[0][1], alpha: 1, face: -1, known: true, noPatience: true, request: { temp: 39, herbs: ['changpo'] } };
    const g3 = { id: 3, type: 'fox', state: 'waiting', x: QUEUE_SPOTS[2][0], y: QUEUE_SPOTS[2][1], alpha: 1, face: -1, known: false, noPatience: true, request: { temp: 45, herbs: ['gyepi'] } };
    w.guests.push(g1, g2, g3);
    w.ghost = { x: 3.5, y: 7.6, alpha: 0.32, show: true, timer: 0, life: 0 };
    return w;
  }
  w.schedule = makeSchedule(cfg);
  for (const id of cfg.clues || []) {
    if (Game.meta.clues.includes(id)) continue;
    w.clueItems.push({ id, x: CLUES[id].x, y: CLUES[id].y, alpha: 1, collected: false, fading: false });
  }
  return w;
}

/* ---------- 이동 · 충돌 · 길찾기 ---------- */
function walkable(tx, ty, npc) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const ch = MAP_ROWS[ty][tx];
  if (ch === '#' || ch === '~') return false;
  if (ch === 'D') return !!npc;
  if (Game.world.objBlock[ty * MAP_W + tx]) return false;
  return true;
}
function solidAt(x, y) { return !walkable(Math.floor(x), Math.floor(y), false); }
function circleBlocked(x, y, r) {
  return solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
}
function moveWithCollision(p, dx, dy) {
  const r = 0.22, ox = p.x, oy = p.y;
  if (!circleBlocked(p.x + dx, p.y, r)) p.x += dx;
  if (!circleBlocked(p.x, p.y + dy, r)) p.y += dy;
  return Math.hypot(p.x - ox, p.y - oy);
}
function npcPath(fx, fy, tx, ty) {
  const gx = Math.floor(tx), gy = Math.floor(ty);
  const p = Path.bfs(Math.floor(fx), Math.floor(fy), (x, y) => x === gx && y === gy, (x, y) => walkable(x, y, true));
  if (!p) return [{ x: tx, y: ty }];
  p.shift();
  if (p.length) p[p.length - 1] = { x: tx, y: ty }; else p.push({ x: tx, y: ty });
  return p;
}
function moveAlong(e, dt, speed) {
  if (!e.path || e.path.length === 0) return true;
  let step = speed * dt;
  while (step > 0 && e.path.length) {
    const n = e.path[0];
    const dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy);
    if (d > 0.001) { const sdx = dx - dy; if (Math.abs(sdx) > 0.05) e.face = sdx > 0 ? 1 : -1; }
    if (d <= step) { e.x = n.x; e.y = n.y; e.path.shift(); step -= d; }
    else { e.x += dx / d * step; e.y += dy / d * step; step = 0; }
  }
  e.moving = true;
  return e.path.length === 0;
}

/* ---------- 상호작용 대상 ---------- */
function interactables() {
  const w = Game.world, list = [];
  for (const g of w.guests) {
    if (['waiting', 'following', 'kWait'].includes(g.state)) list.push({ type: 'guest', char: true, tall: g.type === 'kaonashi', ref: g, label: guestName(g) });
  }
  for (const c of w.clueItems) {
    if (c.collected || c.fading) continue;
    if (CLUES[c.id].npc) list.push({ type: 'shadow', char: true, tall: true, ref: c, label: '검은 그림자' });
    else list.push({ type: 'clue', ref: c, rect: { x: c.x - 0.45, y: c.y - 0.45, w: 0.9, h: 0.9 }, pickH: 24, label: '반짝이는 무언가' });
  }
  for (const o of w.objects) {
    if (o.kind === 'tub') list.push({ type: 'tub', ref: o, rect: o, pickH: 20, label: o.label });
    else if (o.herbs) list.push({ type: 'herb', ref: o, rect: o, pickH: o.pickH || 16, label: o.label });
    else if (o.flavor) list.push({ type: 'deco', ref: o, rect: o, pickH: o.pickH || 16, label: o.label });
  }
  return list;
}
function screenToWorldPx(cx, cy) {
  return { sx: (cx - Game.W / 2) / Game.zoom + Game.cam.x, sy: (cy - Game.H / 2) / Game.zoom + Game.cam.y };
}
function pickAt(cx, cy) {
  const { sx, sy } = screenToWorldPx(cx, cy);
  const items = interactables();
  let best = null, bestKey = -Infinity;
  for (const it of items) {
    if (!it.char) continue;
    const gx = Iso.x(it.ref.x, it.ref.y), gy = Iso.y(it.ref.x, it.ref.y);
    const h = it.tall ? 72 : 48;
    if (Math.abs(sx - gx) < 17 && sy > gy - h && sy < gy + 8) {
      const k = it.ref.x + it.ref.y;
      if (k > bestKey) { best = it; bestKey = k; }
    }
  }
  if (best) return best;
  for (const it of items) {
    if (it.char) continue;
    const r = it.rect;
    for (let z = 0; z <= it.pickH; z += 6) {
      const wp = Iso.toWorld(sx, sy + z);
      if (wp.x >= r.x - 0.1 && wp.x <= r.x + r.w + 0.1 && wp.y >= r.y - 0.1 && wp.y <= r.y + r.h + 0.1) {
        const k = r.x + r.w + r.y + r.h;
        if (k > bestKey) { best = it; bestKey = k; }
        break;
      }
    }
  }
  return best;
}
function targetDist(it) {
  const p = Game.world.player;
  return it.char ? Util.dist(p.x, p.y, it.ref.x, it.ref.y) : Util.distToRect(p.x, p.y, it.rect);
}
function inRange(it) { return targetDist(it) <= (it.char ? 1.6 : 1.15); }
function targetValid(it) {
  if (it.type === 'guest') return ['waiting', 'following', 'kWait'].includes(it.ref.state) && Game.world.guests.includes(it.ref);
  if (it.type === 'clue' || it.type === 'shadow') return !it.ref.collected && !it.ref.fading;
  return true;
}
function pathToTarget(it) {
  const p = Game.world.player;
  const goal = it.char
    ? (x, y) => Util.dist(x + 0.5, y + 0.5, it.ref.x, it.ref.y) <= 1.3
    : (x, y) => Util.distToRect(x + 0.5, y + 0.5, it.rect) <= 1.0;
  const path = Path.bfs(Math.floor(p.x), Math.floor(p.y), goal, (x, y) => walkable(x, y, false));
  if (!path) return null;
  if (path.length > 1) path.shift();
  return path;
}
function actionLabel(it) {
  const w = Game.world;
  switch (it.type) {
    case 'guest': {
      const g = it.ref;
      if (g.state === 'kWait') return '말 걸기';
      if (g.state === 'following') return '잠시 기다려 달라고 하기';
      if (!g.known) return '주문 듣기';
      if (w.follower) return '이미 다른 손님을 안내 중';
      return '탕으로 안내하기 (따라오게 하기)';
    }
    case 'tub': {
      const o = it.ref;
      if (o.state === 'occupied') return '목욕 중';
      if (o.state === 'dirty') return '청소하기';
      if (o.state === 'empty') return '물 받고 데우기';
      return w.follower ? `${guestName(w.follower)} 모시기` : `탕 조절하기 (${Math.round(o.temp)}°C)`;
    }
    case 'herb': return '챙기기: ' + it.ref.herbs.map(h => HERBS[h].name).join(' · ');
    case 'clue': return '살펴보기';
    case 'shadow': return '말 걸기';
    case 'deco': return '살펴보기';
  }
  return '';
}
function interact(it) {
  Sfx.ensure();
  const p = Game.world.player;
  const tx = it.char ? it.ref.x : it.rect.x + it.rect.w / 2, ty = it.char ? it.ref.y : it.rect.y + it.rect.h / 2;
  const sdx = (tx - p.x) - (ty - p.y);
  if (Math.abs(sdx) > 0.1) p.face = sdx > 0 ? 1 : -1;
  switch (it.type) {
    case 'guest': onGuestClick(it.ref); break;
    case 'tub': onTubClick(it.ref); break;
    case 'herb': onHerbSpot(it.ref); break;
    case 'clue': collectClue(it.ref); break;
    case 'shadow': onShadowClick(it.ref); break;
    case 'deco': UI.toast(it.ref.flavor); break;
  }
}
function interactNearest() {
  const list = interactables().filter(inRange);
  if (!list.length) { UI.toast('주변에 상호작용할 대상이 없어요'); return; }
  // 손님·단서를 오브젝트보다 우선
  const prio = it => targetDist(it) - (it.char ? 0.5 : it.type === 'clue' ? 0.8 : 0);
  list.sort((a, b) => prio(a) - prio(b));
  interact(list[0]);
}

/* ---------- 플레이어 ---------- */
function updatePlayer(dt) {
  const w = Game.world, p = w.player;
  p.t += dt;
  if (p.busy > 0) {
    p.busy -= dt;
    p.moving = false;
    if (p.busy <= 0 && p.busyDone) { const f = p.busyDone; p.busyDone = null; f(); }
    return;
  }
  if (Game.modal === 'tub') { p.moving = false; return; }
  const K = Input.keys;
  let u = 0, v = 0;
  if (K.has('KeyW') || K.has('ArrowUp')) v -= 1;
  if (K.has('KeyS') || K.has('ArrowDown')) v += 1;
  if (K.has('KeyA') || K.has('ArrowLeft')) u -= 1;
  if (K.has('KeyD') || K.has('ArrowRight')) u += 1;
  const speed = 3.3 * (hasUp('sandals') ? 1.22 : 1);
  let mx = 0, my = 0;
  if (u || v) {
    // 화면 방향 → 월드 방향 (W+D = 화면 오른쪽 위 = 월드 -y 축)
    p.path = null; p.target = null;
    const wx = u + v, wy = v - u, l = Math.hypot(wx, wy);
    mx = wx / l; my = wy / l;
  } else if (p.target) {
    if (!targetValid(p.target)) { p.target = null; p.path = null; }
    else if (inRange(p.target)) {
      const tg = p.target;
      p.target = null; p.path = null; p.moving = false;
      interact(tg);
      return;
    } else {
      p.repath -= dt;
      if (p.repath <= 0 || !p.path || !p.path.length) {
        p.repath = 0.5;
        p.path = pathToTarget(p.target);
        if (!p.path) { p.target = null; UI.toast('그곳까지 갈 수 없어요'); }
      }
      if (p.path && p.path.length) {
        const n = p.path[0];
        const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy);
        if (d < 0.08) p.path.shift();
        else { mx = dx / d; my = dy / d; }
      }
    }
  }
  if (mx || my) {
    const moved = moveWithCollision(p, mx * speed * dt, my * speed * dt);
    p.moving = moved > 0.0005;
    const sdx = mx - my;
    if (Math.abs(sdx) > 0.1) p.face = sdx > 0 ? 1 : -1;
    if (p.target) {
      p.stuck = moved < speed * dt * 0.2 ? p.stuck + dt : 0;
      if (p.stuck > 0.7) { p.target = null; p.path = null; p.stuck = 0; }
    }
  } else p.moving = false;
}

/* ---------- 손님 ---------- */
function guestName(g) { return g.type === 'kaonashi' ? '얼굴 없는 손님' : GUEST_TYPES[g.type].name; }
function requestLine(g) {
  const T = GUEST_TYPES[g.type];
  const h = HERBS[g.request.herbs[0]].name;
  let s = T.line.replace('{temp}', g.request.temp).replace('{herb_eul}', Util.josa(h, '을', '를')).replace('{herb}', h);
  if (g.request.herbs[1]) s += `\n…아, 그리고 ${HERBS[g.request.herbs[1]].name}도 조금 넣어 줘.`;
  return s;
}
function freeQueueIndex() {
  const used = new Set(Game.world.guests.filter(g => g.queueIdx != null).map(g => g.queueIdx));
  for (let i = 0; i < QUEUE_SPOTS.length; i++) if (!used.has(i)) return i;
  return -1;
}
function homeSpot(g) { return g.special ? K_SPOT : QUEUE_SPOTS[g.queueIdx]; }

function spawnGuest(type) {
  const w = Game.world, cfg = w.cfg, T = GUEST_TYPES[type];
  const qi = freeQueueIndex();
  if (qi < 0) return false;
  const temp = Util.randInt(T.temp[0], T.temp[1]);
  const herbs = [T.herb];
  if (cfg.twoHerb && Math.random() < cfg.twoHerb) herbs.push(Util.pick(Object.keys(HERBS).filter(h => h !== T.herb)));
  const pm = T.patience * cfg.patienceMul * (hasUp('incense') ? 1.25 : 1);
  const g = {
    id: ++w.gid, type, x: DOOR.x + 0.5, y: DOOR.y + 0.5, face: -1, alpha: 0, moving: false,
    state: 'arriving', request: { temp, herbs }, known: false,
    patience: pm, patienceMax: pm, queueIdx: qi, path: null, tub: null, bathT: 0, repath: 0,
  };
  g.path = npcPath(g.x, g.y, QUEUE_SPOTS[qi][0], QUEUE_SPOTS[qi][1]);
  w.guests.push(g);
  Sfx.play('bell');
  UI.toast(`손님이 도착했어요 — ${T.name}`);
  return true;
}

function updateGuest(g, dt) {
  const w = Game.world, p = w.player;
  g.moving = false;
  switch (g.state) {
    case 'arriving':
      g.alpha = Math.min(1, g.alpha + dt * 2.5);
      if (!g.noPatience) {
        g.patience -= dt;
        if (g.patience <= 0) { guestLeaveAngry(g); break; }
      }
      if (moveAlong(g, dt, 2.0)) { g.state = (g.special && !g.hosted) ? 'kWait' : 'waiting'; g.face = -1; }
      break;
    case 'waiting':
      if (!g.noPatience) {
        g.patience -= dt;
        if (g.patience <= 0) guestLeaveAngry(g);
      }
      break;
    case 'following': {
      const d = Util.dist(g.x, g.y, p.x, p.y);
      g.repath -= dt;
      if (d > 1.0) {
        if (g.repath <= 0 || !g.path || !g.path.length) {
          g.repath = 0.35;
          g.path = npcPath(g.x, g.y, p.x, p.y);
          g.path.pop();
        }
        moveAlong(g, dt, d > 3 ? 4.3 : 3.5);
      } else g.path = null;
      break;
    }
    case 'toTub':
      if (moveAlong(g, dt, 2.4)) startBath(g);
      break;
    case 'bathing':
      g.bathT -= dt;
      if (g.bathT <= 0) finishBath(g, false);
      break;
    case 'leaving':
      if (moveAlong(g, dt, 2.1)) {
        g.alpha -= dt * 2.5;
        if (g.alpha <= 0) g.state = 'gone';
      }
      break;
  }
}

function onGuestClick(g) {
  const w = Game.world;
  if (g.state === 'kWait') { kaonashiDialog(g); return; }
  if (g.state === 'following') { sendBack(g); return; }
  if (g.state !== 'waiting') return;
  if (!g.known) {
    const readyTub = w.tubs.some(t => t.state === 'ready');
    const buttons = [{ label: '알겠습니다!', primary: true, onClick: () => { g.known = true; } }];
    if (readyTub && !w.follower) buttons.push({ label: '바로 탕으로 모실게요', onClick: () => { g.known = true; startFollow(g); } });
    UI.dialog({ portrait: g.type, name: guestName(g), text: requestLine(g), buttons });
    return;
  }
  startFollow(g);
}
function startFollow(g) {
  const w = Game.world;
  if (w.follower && w.follower !== g) {
    UI.toast(`지금은 ${Util.josa(guestName(w.follower), '을', '를')} 안내하는 중이에요`, 'warn');
    return;
  }
  g.state = 'following';
  g.repath = 0;
  w.follower = g;
  Sfx.play('pick');
  UI.toast(`${Util.josa(guestName(g), '이', '가')} 따라옵니다. 준비된 탕을 클릭하세요.`);
}
function sendBack(g) {
  const w = Game.world;
  if (w.follower === g) w.follower = null;
  g.state = 'arriving';
  const s = homeSpot(g);
  g.path = npcPath(g.x, g.y, s[0], s[1]);
  UI.toast(`${guestName(g)}에게 잠시 기다려 달라고 했어요`);
}
function guestLeaveAngry(g) {
  const w = Game.world, m = Game.meta;
  if (w.follower === g) w.follower = null;
  g.state = 'leaving';
  g.angry = true;
  g.queueIdx = null;
  g.path = npcPath(g.x, g.y, DOOR.x + 0.5, DOOR.y + 0.5);
  w.stats.missed++; w.stats.stars.push(0);
  m.missed++; m.stars.push(0); m.score = Math.max(0, m.score - 15);
  w.stats.log.push({ name: guestName(g), stars: 0, note: '기다리다 화가 나서 돌아감' });
  addFloat(g.x, g.y, '흥! 돌아가겠어!', '#ff9a85', 14, 56);
  Sfx.play('bad');
  UI.toast(`${Util.josa(guestName(g), '이', '가')} 기다리다 지쳐 돌아갔어요`, 'bad');
}
function seatGuest(g, tub) {
  const w = Game.world;
  w.follower = null;
  g.state = 'toTub';
  g.tub = tub;
  g.queueIdx = null;
  tub.state = 'occupied';
  tub.guest = g;
  g.path = npcPath(g.x, g.y, tub.x + tub.w / 2, tub.y + tub.h + 0.45);
  Sfx.play('water');
  UI.toast(`${Util.josa(guestName(g), '을', '를')} ${tub.label}(으)로 모십니다`);
}
function startBath(g) {
  const tub = g.tub;
  g.state = 'bathing';
  g.bathT = BATH_TIME;
  g.x = tub.x + tub.w / 2;
  g.y = tub.y + tub.h / 2;
  g.face = 1;
}
function rate(g, tub) {
  const temp = Math.round(tub.temp);
  const diff = Math.abs(temp - g.request.temp);
  let stars = 5;
  const notes = [];
  if (diff === 0) notes.push('온도 완벽');
  else if (diff === 1) notes.push('온도 좋음');
  else if (diff === 2) { stars -= 1; notes.push('온도 조금 아쉬움'); }
  else if (diff <= 4) { stars -= 2; notes.push(temp > g.request.temp ? '너무 뜨거움' : '너무 미지근함'); }
  else { stars -= 3; notes.push(temp > g.request.temp ? '펄펄 끓음' : '차가움'); }
  const req = g.request.herbs, have = tub.herbs;
  const missing = req.filter(h => !have.includes(h)).length;
  const extra = have.filter(h => !req.includes(h)).length;
  if (missing) { stars -= 2 * missing; notes.push(`약재 ${missing}가지 빠짐`); }
  if (extra) { stars -= extra; notes.push('엉뚱한 약재'); }
  if (!missing && !extra) notes.push('약재 정확');
  if (!g.noPatience && g.patience / g.patienceMax < 0.25) { stars -= 1; notes.push('오래 기다림'); }
  stars = Util.clamp(stars, 1, 5);
  return {
    stars, notes,
    coins: stars * 8 + (stars === 5 ? 12 : 0),
    score: stars * 20 + (stars === 5 ? 20 : 0),
    kaoOK: diff <= 1 && !missing && !extra,
  };
}
function finishBath(g, forced) {
  const w = Game.world, m = Game.meta, tub = g.tub;
  const res = rate(g, tub);
  const cx = tub.x + tub.w / 2, cy = tub.y + tub.h / 2;
  if (g.special) {
    m.kResult = res.kaoOK ? 'healed' : 'failed';
    if (res.kaoOK) {
      addFloat(cx, cy, '「……따뜻해. 고마워.」', '#f3d9ff', 16, 90, 3.2);
      Sfx.play('clue');
      for (let k = 0; k < 24; k++) {
        w.effects.push({ kind: 'spark', x: Iso.x(cx, cy), y: Iso.y(cx, cy) - 40, vx: Util.rand(-40, 40), vy: Util.rand(-60, -10), life: 1.5, max: 1.5 });
      }
    } else {
      addFloat(cx, cy, '「……」', '#d0c0e0', 16, 90, 2.5);
      Sfx.play('bad');
    }
  } else {
    m.coins += res.coins; m.score += res.score; m.stars.push(res.stars); m.served++;
    w.stats.coins += res.coins; w.stats.score += res.score; w.stats.stars.push(res.stars); w.stats.served++;
    w.stats.log.push({ name: guestName(g), stars: res.stars, note: res.notes.join(' · ') });
    addFloat(cx, cy, `${'★'.repeat(res.stars)}${'☆'.repeat(5 - res.stars)}  +${res.coins}냥`, '#ffd36a', 15, 70, 2.2);
    addFloat(cx, cy, Util.pick(THANKS[res.stars]), '#fff', 13, 92, 2.2);
    Sfx.play(res.stars >= 4 ? 'good' : res.stars === 3 ? 'ok' : 'bad');
  }
  tub.state = 'dirty';
  tub.guest = null;
  tub.herbs = [];
  g.tub = null;
  g.state = 'leaving';
  if (!forced) {
    g.x = cx; g.y = tub.y + tub.h + 0.45;
    g.path = npcPath(g.x, g.y, DOOR.x + 0.5, DOOR.y + 0.5);
  }
}

/* ---------- 탕 ---------- */
function onTubClick(tub) {
  const w = Game.world;
  if (tub.state === 'occupied') { UI.toast(`${Util.josa(guestName(tub.guest), '이', '가')} 목욕 중이에요`); return; }
  if (tub.state === 'dirty') { startCleaning(tub); return; }
  if (tub.state === 'ready' && w.follower) { seatGuest(w.follower, tub); return; }
  if (tub.state === 'empty') {
    tub.state = 'ready'; tub.temp = START_TEMP; tub.herbs = [];
    Sfx.play('water');
  }
  Game.tub = tub;
  UI.openTub(tub);
}
function startCleaning(tub) {
  const p = Game.world.player;
  p.busy = CLEAN_TIME; p.busyTotal = CLEAN_TIME; p.busyLabel = '탕 청소 중';
  p.target = null; p.path = null;
  Sfx.play('clean');
  p.busyDone = () => {
    tub.state = 'empty'; tub.temp = START_TEMP; tub.herbs = [];
    Sfx.play('clean');
    addFloat(tub.x + tub.w / 2, tub.y + tub.h / 2, '반짝반짝!', '#cfefff', 13, 40);
  };
}
function tubAddHerb(i) {
  const w = Game.world, tub = Game.tub;
  if (!tub) return;
  const h = w.inventory[i];
  if (!h) return;
  if (tub.herbs.length >= 2) { UI.toast('약재는 두 가지까지만 넣을 수 있어요', 'warn'); return; }
  if (tub.herbs.includes(h)) { UI.toast('이미 넣은 약재예요', 'warn'); return; }
  w.inventory.splice(i, 1);
  tub.herbs.push(h);
  Sfx.play('drop');
}
function tubRemoveHerb(i) {
  const w = Game.world, tub = Game.tub;
  if (!tub) return;
  if (w.inventory.length >= invCap()) { UI.toast('바구니가 가득 찼어요', 'warn'); return; }
  const h = tub.herbs.splice(i, 1)[0];
  if (h) { w.inventory.push(h); Sfx.play('pick'); }
}
function tubCool() {
  const tub = Game.tub;
  if (!tub) return;
  tub.temp = Math.max(30, Math.round(tub.temp) - 1);
  Sfx.play('water');
}
function tubDrain() {
  const tub = Game.tub;
  if (!tub) return;
  tub.state = 'empty'; tub.temp = START_TEMP; tub.herbs = [];
  UI.closeModal();
  UI.toast('물을 뺐어요. 넣었던 약재도 함께 흘러갔어요.');
}
function tubSeat() {
  const w = Game.world, tub = Game.tub;
  if (!tub || !w.follower) return;
  UI.closeModal();
  seatGuest(w.follower, tub);
}
function updateTubs(dt) {
  const w = Game.world;
  for (const o of w.tubs) {
    if ((o.state === 'ready' || o.state === 'occupied') && o.temp >= 39) {
      o.steam += dt * (o.temp - 37) * 0.9;
      while (o.steam > 1) {
        o.steam -= 1;
        const cx = Iso.x(o.x + o.w / 2, o.y + o.h / 2), cy = Iso.y(o.x + o.w / 2, o.y + o.h / 2) - 14;
        w.effects.push({ kind: 'steam', x: cx + Util.rand(-24, 24), y: cy + Util.rand(-8, 8), vx: Util.rand(-4, 4), vy: Util.rand(-26, -14), life: Util.rand(1.4, 2.2), max: 2.2, r: Util.rand(4, 7) });
      }
    }
  }
  if (Math.random() < dt * 3) {
    const fx = Iso.x(10.95, 13.5), fy = Iso.y(10.95, 13.5) - 14;
    w.effects.push({ kind: 'ember', x: fx + Util.rand(-6, 6), y: fy, vx: Util.rand(-6, 6), vy: Util.rand(-30, -12), life: 1, max: 1 });
  }
}
function updateEffects(dt) {
  const w = Game.world;
  for (const e of w.effects) { e.life -= dt; e.x += e.vx * dt; e.y += e.vy * dt; }
  w.effects = w.effects.filter(e => e.life > 0);
  for (const f of w.floats) f.life -= dt;
  w.floats = w.floats.filter(f => f.life > 0);
}
function addFloat(wx, wy, text, color, size = 14, z = 50, life = 1.8) {
  Game.world.floats.push({ x: Iso.x(wx, wy), y: Iso.y(wx, wy) - z, text, color, size, life, max: life });
}

/* ---------- 약재 ---------- */
function onHerbSpot(o) {
  const w = Game.world;
  if (w.inventory.length >= invCap()) {
    UI.toast('바구니가 가득 찼어요! 바구니 칸의 × 로 버릴 수 있어요', 'warn');
    Sfx.play('bad');
    return;
  }
  if (o.herbs.length === 1) { gatherHerb(o.herbs[0]); return; }
  UI.dialog({
    portrait: 'chihiro', name: o.label, text: '어떤 약재를 챙길까?',
    buttons: o.herbs.map((h, i) => ({ label: HERBS[h].name, primary: i === 0, onClick: () => gatherHerb(h) }))
      .concat([{ label: '그만두기' }]),
  });
}
function gatherHerb(h) {
  const w = Game.world, p = w.player;
  if (w.inventory.length >= invCap()) return;
  w.inventory.push(h);
  p.busy = 0.3; p.busyTotal = 0.3; p.busyLabel = '';
  addFloat(p.x, p.y, `+${HERBS[h].name}`, '#eaffd2', 14, 56);
  Sfx.play('pick');
}
function dropInventory(i) {
  const w = Game.world;
  const h = w.inventory.splice(i, 1)[0];
  if (h) { Sfx.play('drop'); UI.toast(`${Util.josa(HERBS[h].name, '을', '를')} 버렸어요`); }
}

/* ---------- 단서 · 얼굴 없는 손님 ---------- */
function collectClue(c) {
  const m = Game.meta;
  c.collected = true;
  if (!m.clues.includes(c.id)) m.clues.push(c.id);
  Sfx.play('clue');
  const def = CLUES[c.id];
  UI.dialog({
    portrait: def.npc ? 'kaonashi' : 'chihiro',
    name: `단서 발견 — ${def.name}`,
    text: `${def.text}\n\n(단서 ${m.clues.length}/4 · J 키로 단서 수첩을 볼 수 있다)`,
    buttons: [{ label: '수첩에 적어 둔다', primary: true }],
  });
}
function onShadowClick(c) {
  UI.dialog({
    portrait: 'kaonashi', name: '검은 그림자',
    text: '……\n(복도 끝의 검은 손님이 가만히 이쪽을 바라보고 있다.)',
    buttons: [{ label: '저기… 괜찮으세요?', primary: true, onClick: () => { c.fading = true; Sfx.play('kao'); } }],
  });
}
function updateGhost(dt) {
  const w = Game.world;
  if (!w.cfg.ghost) return;
  if (!w.ghost) w.ghost = { x: 0, y: 0, alpha: 0, show: false, timer: Util.rand(10, 16), life: 0 };
  const gh = w.ghost, p = w.player;
  if (!gh.show) {
    gh.alpha = Math.max(0, gh.alpha - dt * 0.8);
    gh.timer -= dt;
    if (gh.timer <= 0) {
      const s = Util.pick(GHOST_SPOTS);
      if (Util.dist(s[0], s[1], p.x, p.y) > 4.5) { gh.x = s[0]; gh.y = s[1]; gh.show = true; gh.life = 7; }
      else gh.timer = 2;
    }
  } else {
    gh.life -= dt;
    gh.alpha = Math.min(0.5, gh.alpha + dt * 0.5);
    if (gh.life <= 0 || Util.dist(gh.x, gh.y, p.x, p.y) < 2.8) { gh.show = false; gh.timer = Util.rand(18, 30); }
  }
}
function spawnKaonashi() {
  const w = Game.world;
  const g = {
    id: ++w.gid, type: 'kaonashi', special: true, x: DOOR.x + 0.5, y: DOOR.y + 0.5, face: -1, alpha: 0, moving: false,
    state: 'arriving', request: { ...KAONASHI_REQUEST, herbs: [...KAONASHI_REQUEST.herbs] }, known: false, hidden: true,
    noPatience: true, patience: 1, patienceMax: 1, queueIdx: null, path: null, tub: null, bathT: 0, repath: 0,
  };
  g.path = npcPath(g.x, g.y, K_SPOT[0], K_SPOT[1]);
  w.guests.push(g);
  w.kaonashi = g;
  Sfx.play('kao');
  UI.toast('…… 안개와 함께, 얼굴 없는 손님이 들어왔다.', 'kao');
}
function kaonashiDialog(g) {
  const m = Game.meta, n = m.clues.length;
  UI.dialog({
    portrait: 'kaonashi', name: '얼굴 없는 손님',
    text: '「……아…… 아……」\n그는 말없이 두 손을 내민다. 손바닥 위에서 금덩이가 반짝인다.',
    buttons: [
      { label: '금을 받는다', onClick: () => {
        m.kChoice = 'gold'; m.coins += 300;
        addFloat(g.x, g.y, '+300냥…?', '#f4cf55', 15, 80);
        kaoLeave(g);
      } },
      { label: '정중히 거절한다', onClick: () => { m.kChoice = 'refuse'; kaoLeave(g); } },
      {
        label: '"금은 필요 없어요. 대신 따뜻한 탕을 준비해 드릴게요."',
        disabled: n < CLUES_NEEDED,
        note: n < CLUES_NEEDED ? `그에 대해 조금 더 알았다면… (단서 ${n}/4, ${CLUES_NEEDED}개 필요)` : '단서를 떠올려 그에게 맞는 탕을 준비하자',
        primary: n >= CLUES_NEEDED,
        onClick: () => {
          m.kChoice = 'host';
          g.hosted = true; g.known = true; g.state = 'waiting';
          Sfx.play('clue');
          UI.toast('그를 손님으로 맞이하기로 했다. 단서 수첩(J)을 떠올려 보자.', 'kao');
        },
      },
    ],
  });
}
function kaoLeave(g) {
  const w = Game.world;
  if (w.follower === g) w.follower = null;
  g.state = 'leaving';
  g.path = npcPath(g.x, g.y, DOOR.x + 0.5, DOOR.y + 0.5);
  Sfx.play('kao');
}

/* ---------- 튜토리얼 힌트 ---------- */
function hintText() {
  const w = Game.world;
  if (!w || w.demo) return null;
  const p = w.player;
  if (w.kaonashi && w.kaonashi.state === 'kWait') return '접수대 옆에 검은 손님이 서 있다. 말을 걸어 보자.';
  if (w.kaonashi && w.kaonashi.hosted && w.kaonashi.state !== 'leaving') return '얼굴 없는 손님에게 맞는 탕은? 단서 수첩(J)에 답이 있다.';
  if (w.day > 2) return null;
  if (p.busy > 0) return null;
  if (Game.modal === 'tub') return '불 지피기를 꾹 눌러 온도를 맞추고, 바구니의 약재를 눌러 탕에 넣으세요.';
  if (w.follower) return '준비된 탕(온도 태그가 붙은 탕)을 클릭하면 손님이 들어갑니다.';
  if (w.tubs.some(t => t.state === 'dirty')) return '사용한 탕은 클릭해서 청소해야 다시 쓸 수 있어요.';
  const known = w.guests.filter(g => g.known && g.state === 'waiting' && !g.special);
  const unknown = w.guests.filter(g => !g.known && g.state === 'waiting');
  if (unknown.length && !known.length) return '접수대 방석에서 기다리는 손님(!)을 클릭해 주문을 들어 보세요.';
  if (known.length) {
    const g = known[0];
    const match = w.tubs.find(t => t.state === 'ready' && g.request.herbs.every(h => t.herbs.includes(h)) && Math.abs(Math.round(t.temp) - g.request.temp) <= 1);
    if (match) return `${match.label} 준비 완료! ${Util.josa(guestName(g), '을', '를')} 클릭해 탕으로 안내하세요.`;
    const need = g.request.herbs.filter(h => !w.inventory.includes(h) && !w.tubs.some(t => t.state === 'ready' && t.herbs.includes(h)));
    if (need.length) return `${Util.josa(HERBS[need[0]].name, '은', '는')} ${HERBS[need[0]].where}에 있어요. 다가가서 클릭!`;
    return `빈 탕을 클릭해 물을 받고, 불을 지펴 ${g.request.temp}°C에 맞춘 뒤 약재를 넣으세요.`;
  }
  return 'WASD로 이동해 목욕탕을 둘러보세요. 곧 손님이 옵니다.';
}

/* ---------- 메뉴 ---------- */
function toggleSound() {
  Sfx.muted = !Sfx.muted;
  try { localStorage.setItem(SOUND_KEY, Sfx.muted ? '1' : '0'); } catch (e) { /* noop */ }
  UI.setSoundIcon(Sfx.muted);
  if (!Sfx.muted) { Sfx.ensure(); Sfx.play('click'); }
}
function openPause() { if (Game.screen === 'play' && !Game.modal) UI.pause(); }
function openJournal() { if (Game.screen === 'play' && !Game.modal) UI.journal(Game.meta); }

/* ---------- 업데이트 ---------- */
function updateWorld(dt) {
  const w = Game.world;
  if (w.ended) return;
  w.time += dt;
  for (const s of w.schedule) {
    if (!s.spawned && w.time >= s.at) {
      if (spawnGuest(s.type)) s.spawned = true; else s.at = w.time + 3;
    }
  }
  if (w.cfg.kaonashiAt && !w.kEventDone && w.time >= w.cfg.kaonashiAt * w.length) {
    w.kEventDone = true;
    spawnKaonashi();
  }
  updatePlayer(dt);
  for (const g of w.guests) updateGuest(g, dt);
  if (w.kaonashi && w.kaonashi.state === 'gone') w.kaonashi = null;
  w.guests = w.guests.filter(g => g.state !== 'gone');
  for (const c of w.clueItems) {
    if (c.fading) {
      c.alpha -= dt * 0.9;
      if (c.alpha <= 0) { c.fading = false; collectClue(c); }
    }
  }
  updateGhost(dt);

  Game.heatOn = Game.modal === 'tub' && !!Game.tub && (Game.heating || Input.keys.has('Space'));
  if (Game.heatOn) {
    Game.tub.temp = Math.min(50, Game.tub.temp + (hasUp('firewood') ? 4.6 : 2.9) * dt);
    w.heatSfx -= dt;
    if (w.heatSfx <= 0) { w.heatSfx = 0.12; Sfx.play('heat'); }
  }
  updateTubs(dt);
  updateEffects(dt);

  if (w.time >= w.length) { endDay(); return; }
  const allDone = w.schedule.every(s => s.spawned) && w.guests.length === 0 && (!w.cfg.kaonashiAt || w.kEventDone);
  if (allDone) {
    if (w.endTimer < 0) { w.endTimer = 3; UI.toast('오늘의 손님을 모두 맞이했어요! 곧 영업을 마칩니다.', 'good'); }
    w.endTimer -= dt;
    if (w.endTimer <= 0) endDay();
  } else w.endTimer = -1;
}

function handleKeys() {
  const P = Input.pressed;
  if (P.has('KeyM')) toggleSound();
  if (Game.modal === 'dialog') {
    for (let i = 0; i < 4; i++) if (P.has('Digit' + (i + 1)) || P.has('Numpad' + (i + 1))) { UI.choose(i); return; }
    if (P.has('Enter') && UI.hasDialogButton(0)) { UI.choose(0); return; }
  }
  if (Game.screen !== 'play') return;
  if (P.has('Escape')) {
    if (Game.modal === 'tub' || Game.modal === 'journal' || Game.modal === 'pause') UI.closeModal();
    else if (!Game.modal) openPause();
    return;
  }
  if (P.has('KeyJ')) {
    if (Game.modal === 'journal') UI.closeModal();
    else if (!Game.modal) openJournal();
    return;
  }
  if (!Game.modal && P.has('KeyE')) {
    const p = Game.world.player;
    if (p.busy <= 0) interactNearest();
  }
}
function handleClicks() {
  const p = Game.world.player;
  for (const c of Input.clicks) {
    Sfx.ensure();
    if (p.busy > 0) return;
    const it = pickAt(c.x, c.y);
    if (!it) continue;
    if (inRange(it)) { p.target = null; p.path = null; interact(it); }
    else { p.target = it; p.path = null; p.repath = 0; p.stuck = 0; }
    return;
  }
}
function updateHover() {
  if (Game.modal || !Input.mouse.inside) {
    Game.hover = null;
    UI.hideTooltip();
    Game.canvas.style.cursor = 'default';
    return;
  }
  const it = pickAt(Input.mouse.x, Input.mouse.y);
  Game.hover = it;
  Game.canvas.style.cursor = it ? 'pointer' : 'default';
  UI.tooltip(it, it && !inRange(it), Input.mouse.x, Input.mouse.y);
}
function updateCamera(dt) {
  const w = Game.world;
  if (!w) return;
  let tx, ty;
  if (w.demo) {
    const t = Game.t * 0.07;
    tx = Iso.x(10, 8) + Math.sin(t) * 200;
    ty = Iso.y(10, 8) + Math.cos(t * 0.7) * 50 - 20;
  } else {
    tx = Iso.x(w.player.x, w.player.y);
    ty = Iso.y(w.player.x, w.player.y) - 24;
  }
  const vw = Game.W / Game.zoom, vh = Game.H / Game.zoom, M = 80;
  const xmin = Iso.x(0, MAP_H), xmax = Iso.x(MAP_W, 0), ymin = -90, ymax = Iso.y(MAP_W, MAP_H);
  tx = (xmax - xmin + 2 * M <= vw) ? (xmin + xmax) / 2 : Util.clamp(tx, xmin - M + vw / 2, xmax + M - vw / 2);
  ty = (ymax - ymin + 2 * M <= vh) ? (ymin + ymax) / 2 : Util.clamp(ty, ymin - M + vh / 2, ymax + M - vh / 2);
  const k = 1 - Math.exp(-dt * 6);
  Game.cam.x += (tx - Game.cam.x) * k;
  Game.cam.y += (ty - Game.cam.y) * k;
}
function update(dt) {
  const w = Game.world;
  handleKeys();
  if (Game.screen === 'play' && w) {
    const frozen = Game.modal && Game.modal !== 'tub';
    if (!frozen) updateWorld(dt);
    if (Game.screen !== 'play') return; // 영업 종료로 화면이 바뀐 경우
    if (!Game.modal) handleClicks();
    updateHover();
    Game.hudT -= dt;
    if (Game.hudT <= 0) { Game.hudT = 0.1; UI.updateHUD(); }
    if (Game.modal === 'tub') UI.refreshTub();
  } else if (w && w.demo) {
    updateTubs(dt);
    updateEffects(dt);
  }
  updateCamera(dt);
}

/* ---------- 렌더 ---------- */
function render() {
  const ctx = Game.ctx, W = Game.W, H = Game.H;
  ctx.setTransform(Game.dpr, 0, 0, Game.dpr, 0, 0);
  Render.background(ctx, W, H, Game.t);
  const w = Game.world;
  if (!w) return;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(Game.zoom, Game.zoom);
  ctx.translate(-Game.cam.x, -Game.cam.y);
  Render.world(ctx, w, Game.t, Game.screen === 'play' ? Game.hover : null);
  ctx.restore();
  Render.vignette(ctx, W, H);
}
