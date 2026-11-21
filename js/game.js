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
const ALBUM_KEY = 'gods-bathhouse-album-v1'; // 엔딩 앨범 (새로 시작해도 지워지지 않음)

/* ---------- 저장 ---------- */
function newMeta() {
  return { day: 1, coins: 0, score: 0, stars: [], served: 0, missed: 0, upgrades: [], clues: [], kChoice: null, kResult: null, specials: {} };
}
function saveMeta() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.meta)); } catch (e) { /* 저장 불가 환경 */ } }
function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ } }
/* ---------- 엔딩 앨범 ---------- */
function loadAlbum() {
  try { const s = localStorage.getItem(ALBUM_KEY); const a = s ? JSON.parse(s) : null; return a && a.endings ? a : { endings: {} }; }
  catch (e) { return { endings: {} }; }
}
function saveAlbum(a) { try { localStorage.setItem(ALBUM_KEY, JSON.stringify(a)); } catch (e) { /* 저장 불가 환경 */ } }
function epilogueKey(m) { return (m.kResult === 'failed' || m.kChoice === 'host') ? 'failed' : (m.kChoice || 'none'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
// 엔딩을 앨범에 기록. 처음 본 엔딩이면 true
function recordEnding(type, rank, m) {
  const a = loadAlbum();
  const isNew = !a.endings[type];
  const e = a.endings[type] || { first: todayStr(), count: 0, bestRank: null, bestScore: 0 };
  e.count++;
  if (!e.bestRank || RANK_ORDER.indexOf(rank) < RANK_ORDER.indexOf(e.bestRank)) e.bestRank = rank;
  e.bestScore = Math.max(e.bestScore || 0, m.score);
  e.lastRank = rank;
  e.lastHealed = healedIds(m);      // 다시 보기에서 그때 모신 손님·받은 선물을 그대로 보여 주려고
  e.lastEpilogue = epilogueKey(m);
  a.endings[type] = e;
  saveAlbum(a);
  return isNew;
}
function openAlbum(back) { UI.album(loadAlbum(), back); }

function hasUp(id) { return !!(Game.meta && Game.meta.upgrades.includes(id)); }
// 상점 줄(line)마다 산 단계 수 (0 = 안 삼)
function upLv(line, m = Game.meta) { return m ? UPGRADES.filter(u => u.line === line && m.upgrades.includes(u.id)).length : 0; }
// 단계별 효과 배수 — [안 삼, 1단계, 2단계, 3단계]
const UP_FX = {
  speed:  [1, 1.12, 1.24, 1.36],   // 이동 속도
  heat:   [1, 1.3, 1.6, 1.9],      // 탕 데우는 속도
  calm:   [1, 1.15, 1.3, 1.45],    // 손님 인내심
  gather: [1, 0.65],               // 채집 시간
  clean:  [1, 0.6],                // 청소 시간
  fuel:   [1, 0.75, 0.55],         // 보일러 장작 소모
  refuel: [1, 0.75, 0.55],         // 장작 넣는 시간
  warm:   [1, 0.65],               // 손님 없는 탕이 식는 속도
  tea:    [1, 1.25],               // 목욕 뒤 받는 돈
};
function upFx(line) { const a = UP_FX[line]; return a[Math.min(upLv(line === 'refuel' ? 'fuel' : line), a.length - 1)]; }
function invCap() { return 3 + upLv('bag') + (hasGift('basket') ? 1 : 0); }

/* ---------- 특별한 손님 진행 ---------- */
function isSpecial(type) { return !!SPECIALS[type]; }
function specialRec(id) {
  const m = Game.meta;
  if (!m.specials) m.specials = {};
  return m.specials[id] || (m.specials[id] = { choice: null, result: null });
}
function specialClueCount(id, m = Game.meta) { return cluesOf(id).filter(k => m.clues.includes(k)).length; }
function specialMet(id, m = Game.meta) { return !!(m.specials && m.specials[id] && m.specials[id].met); }
function specialLabel(id, m = Game.meta) { return specialMet(id, m) ? SPECIALS[id].name : SPECIALS[id].alias; }
// 특별한 손님이 남긴 선물 효과 (id: cool | basket | patience | fuel)
function hasGift(gid) {
  const m = Game.meta;
  if (!m || !m.specials) return false;
  return SPECIAL_ORDER.some(s => SPECIALS[s].gift && SPECIALS[s].gift.id === gid && m.specials[s] && m.specials[s].result === 'healed');
}
function giftsOf(m = Game.meta) {
  return SPECIAL_ORDER.filter(s => SPECIALS[s].gift && m.specials && m.specials[s] && m.specials[s].result === 'healed').map(s => SPECIALS[s].gift);
}
function healedIds(m = Game.meta) { return SPECIAL_ORDER.filter(s => m.specials && m.specials[s] && m.specials[s].result === 'healed'); }
function healedCount(m = Game.meta) { return healedIds(m).length; }
function setSpecialChoice(id, choice) {
  const r = specialRec(id);
  if (!r.choice) r.choice = choice;
  if (id === 'kaonashi' && !Game.meta.kChoice) Game.meta.kChoice = choice;
}
// 오늘 방문하기로 한 특별한 손님을 만나지 못하고 하루가 끝난 경우
function settleMissedSpecial() {
  const w = Game.world;
  if (w.cfg.special && !w.sEventDone) setSpecialChoice(w.cfg.special, 'none');
}

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
  // 타이틀 화면에서도 첫 클릭·키 입력 때 소리를 깨워 타이틀 배경음악이 나오게 (브라우저 자동재생 정책)
  const wake = () => Sfx.ensure();
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('keydown', wake, { once: true });
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
}
function restartDay() {
  if (!Game.daySnapshot) return;
  Game.meta = JSON.parse(Game.daySnapshot);
  startDay(Game.meta.day);
}
function quitToTitle() { showTitle(); }
function restartToTitle() { showTitle(); }

/* 영업 마감: 신규 접객 차단. 대기 중인 손님은 돌아가고,
 * 안내·입욕·목욕 중인 손님은 끝까지 마무리할 수 있다. (기획서 v2.0) */
function closeBusiness() {
  const w = Game.world, m = Game.meta;
  w.closed = true;
  w.endTimer = -1;
  for (const g of w.guests) {
    if (g.special) {
      if (g.state === 'kWait') { setSpecialChoice(g.type, 'none'); kaoLeave(g); }
      else if (g.state === 'waiting' || g.state === 'arriving') kaoLeave(g);
      else if (g.state === 'following') { g.noPatience = false; g.patience = g.patienceMax = 30; }
      continue;
    }
    if (g.state === 'arriving' || g.state === 'waiting') {
      g.state = 'leaving';
      g.queueIdx = null;
      g.path = npcPath(g.x, g.y, DOOR.x + 0.5, DOOR.y + 0.5);
      w.stats.missed++; m.missed++;
      w.stats.stars.push(0); m.stars.push(0);
      w.stats.log.push({ name: guestName(g), stars: 0, note: '영업 시간이 끝나 돌아감' });
    }
  }
  settleMissedSpecial();
  Sfx.play('bell');
  const left = w.guests.some(g => ['following', 'toTub', 'bathing'].includes(g.state));
  UI.toast('영업 시간이 끝났어요!', 'warn');   // 남은 손님 마무리 방법은 아래 안내 띠가 이어서 알려 준다
}

function endDay() {
  const w = Game.world, m = Game.meta;
  if (w.ended) return;
  for (const g of w.guests.slice()) {
    if (g.state === 'bathing' || g.state === 'toTub') { finishBath(g, true); continue; }
    if (g.special) {
      if (g.state === 'kWait') setSpecialChoice(g.type, 'none');
      continue;
    }
    if (['arriving', 'waiting', 'following'].includes(g.state)) {
      w.stats.missed++; m.missed++;
      w.stats.stars.push(0); m.stars.push(0);
      w.stats.log.push({ name: guestName(g), stars: 0, note: '영업 시간이 끝나 돌아감' });
    }
  }
  settleMissedSpecial();
  w.ended = true;
  UI.closeModal();
  UI.showHUD(false);
  Game.screen = 'dayEnd';
  UI.dayEnd(w.stats, m, w.day, afterDayEnd);
}
function afterDayEnd() {
  const day = Game.world.day;
  if (day < DAYS.length) UI.shop(Game.meta, () => startDay(day + 1));
  else showEnding();
}
function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id), m = Game.meta;
  if (!u || m.upgrades.includes(id) || m.coins < u.cost || upLv(u.line) !== u.lv - 1) return;   // 같은 줄은 단계 순서대로
  m.coins -= u.cost;
  m.upgrades.push(id);
  Sfx.play('good');
}
function showEnding() {
  const m = Game.meta;
  const type = 'h' + healedCount(m);   // 잘 모신 특별한 손님 수(0~5)에 따라 엔딩이 갈린다
  const avg = Util.avg(m.stars);
  const rank = avg >= 4.5 ? 'S' : avg >= 3.8 ? 'A' : avg >= 3 ? 'B' : 'C';
  clearSave();
  const newEntry = recordEnding(type, rank, m);
  Game.screen = 'ending';
  UI.showHUD(false);
  UI.ending(type, { rank, avg, meta: m, newEntry });
  Sfx.play(healedCount(m) >= 3 ? 'clue' : 'good');
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
    day, cfg, demo: !!demo, time: 0, length: cfg.length, ended: false, closed: false, endTimer: -1,
    objects: [], tubs: [], guests: [], gid: 0, schedule: [], clueItems: [],
    player: { x: PLAYER_START.x, y: PLAYER_START.y, face: 1, moving: false, t: 0, path: null, target: null, repath: 0, stuck: 0, busy: 0, busyTotal: 1, busyLabel: '', busyDone: null },
    inventory: [], effects: [], floats: [], follower: null, special: null, sEventDone: false, ghost: null, heatSfx: 0,
    fuel: BOILER.maxFuel, fuelWarned: false,
    stats: { served: 0, missed: 0, stars: [], coins: 0, score: 0, log: [] },
    scene: 'main', trans: null,
    blocks: Object.fromEntries(Object.entries(SCENES).map(([id, sc]) => [id, new Uint8Array(sc.w * sc.h)])),
  };
  for (const def of OBJECT_DEFS) {
    if (def.requires && !hasUp(def.requires)) continue;
    const o = { scene: 'main', ...def };
    if (o.kind === 'tub') { o.state = 'empty'; o.temp = START_TEMP; o.herbs = []; o.guest = null; o.steam = 0; w.tubs.push(o); }
    w.objects.push(o);
    if (o.block !== false) {
      const sw = SCENES[o.scene].w, blk = w.blocks[o.scene];
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) blk[y * sw + x] = 1;
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
    w.ghost = { x: 3.5, y: 7.6, scene: 'main', alpha: 0.32, show: true, timer: 0, life: 0 };
    return w;
  }
  w.schedule = makeSchedule(cfg);
  for (const id of cfg.clues || []) {
    if (Game.meta.clues.includes(id)) continue;
    w.clueItems.push({ id, scene: CLUES[id].scene || 'main', x: CLUES[id].x, y: CLUES[id].y, alpha: 1, collected: false, fading: false });
  }
  return w;
}

/* ---------- 이동 · 충돌 · 길찾기 ---------- */
// npc(손님)는 항상 메인 목욕탕 기준, 플레이어는 현재 장면 기준
function walkable(tx, ty, npc, sid) {
  const w = Game.world;
  sid = sid || (npc ? 'main' : w.scene);
  const sc = SCENES[sid];
  if (tx < 0 || ty < 0 || tx >= sc.w || ty >= sc.h) return false;
  const ch = sc.rows[ty][tx];
  if (ch === '#' || ch === '~' || ch === ' ') return false;
  if (ch === 'D') return !!npc;
  if (sc.portals[ch]) return !npc;
  if (w.blocks[sid][ty * sc.w + tx]) return false;
  return true;
}
function portalAt(x, y) {
  const sc = SCENES[Game.world.scene];
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= sc.w || ty >= sc.h) return null;
  return sc.portals[sc.rows[ty][tx]] || null;
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
  const inMain = w.scene === 'main';
  for (const g of w.guests) {
    if (inMain && ['waiting', 'following', 'kWait'].includes(g.state)) list.push({ type: 'guest', char: true, tall: !!g.special, ref: g, label: guestName(g) });
  }
  for (const c of w.clueItems) {
    if (c.collected || c.fading || c.scene !== w.scene) continue;
    if (CLUES[c.id].npc) list.push({ type: 'shadow', char: true, tall: true, ref: c, label: specialLabel(CLUES[c.id].guest) });
    else list.push({ type: 'clue', ref: c, rect: { x: c.x - 0.45, y: c.y - 0.45, w: 0.9, h: 0.9 }, pickH: 24, label: '반짝이는 무언가' });
  }
  for (const o of w.objects) {
    if (o.scene !== w.scene) continue;
    if (o.kind === 'tub') list.push({ type: 'tub', ref: o, rect: o, pickH: 20, label: o.label });
    else if (o.herbs) list.push({ type: 'herb', ref: o, rect: o, pickH: o.pickH || 16, label: o.label });
    else if (o.kind === 'furnace') list.push({ type: 'furnace', ref: o, rect: o, pickH: o.pickH || 16, label: o.label });
    else if (o.flavor) list.push({ type: 'deco', ref: o, rect: o, pickH: o.pickH || 16, label: o.label });
  }
  // 구역 이동 문: 마우스를 올리면 이름표, 클릭하면 걸어가서 넘어감
  const sc = SCENES[w.scene];
  sc.rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const P = sc.portals[ch];
    if (P) list.push({ type: 'portal', ref: P, rect: { x: i, y: j, w: 1, h: 1 }, pickH: 70, label: P.label });
  }));
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
  const sc = SCENES[Game.world.scene];
  const path = Path.bfs(Math.floor(p.x), Math.floor(p.y), goal, (x, y) => walkable(x, y, false) && !sc.portals[sc.rows[y][x]], sc.w, sc.h);
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
      if (o.state === 'occupied') return `목욕 중 · 온도 조절하기 (${Math.round(o.temp)}°C)`;
      if (o.state === 'dirty') return '청소하기';
      if (o.state === 'empty') return '물 받고 데우기';
      if (w.follower) {
        const comp = companyNotes(o, w.follower.type);
        return `${guestName(w.follower)} 모시기 (${Math.round(o.temp)}°C)${comp.length ? ' · ' + comp.join(', ') : ''}`;
      }
      return `탕 조절하기 (${Math.round(o.temp)}°C)`;
    }
    case 'herb': return '챙기기: ' + it.ref.herbs.map(h => HERBS[h].name).join(' · ');
    case 'clue': return '살펴보기';
    case 'shadow': return '말 걸기';
    case 'furnace': return `장작 넣기 (보일러 ${Math.round(w.fuel)}%)`;
    case 'deco': return '살펴보기';
    case 'portal': return Util.josa(it.ref.label, '으로', '로') + ' 가기';
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
    case 'furnace': refuelBoiler(); break;
    case 'deco': UI.toast(it.ref.flavor); break;
    case 'portal': startTransition(it.ref); break;
  }
}

/* ---------- 보일러 ---------- */
function refuelBoiler() {
  const w = Game.world, p = w.player;
  if (w.fuel >= BOILER.maxFuel - 5) { UI.toast('보일러가 이미 활활 타고 있어요'); return; }
  p.busy = p.busyTotal = BOILER.refuelTime * upFx('refuel'); p.busyLabel = '장작 넣는 중';
  p.target = null; p.path = null;
  Sfx.play('drop');
  p.busyDone = () => {
    w.fuel = BOILER.maxFuel;
    w.fuelWarned = false;
    Sfx.play('heat');
    addFloat(10, 14, '활활!', '#ffb36a', 14, 70);
  };
}
function boilerSpeed() { return Game.world.fuel > 0 ? 1 : BOILER.lowSpeed; }

/* ---------- 손님 궁합 ---------- */
function relationOf(a, b) {
  const has = list => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (has(GUEST_RELATIONS.dislike)) return 'dislike';
  if (has(GUEST_RELATIONS.like)) return 'like';
  return null;
}
function relationsOf(type) {
  const pick = list => list.filter(p => p.includes(type)).map(p => (p[0] === type ? p[1] : p[0]));
  return { dislike: pick(GUEST_RELATIONS.dislike), like: pick(GUEST_RELATIONS.like) };
}
function neighborTubs(tub) {
  const w = Game.world;
  return (TUB_NEIGHBORS[tub.id] || []).map(id => w.tubs.find(t => t.id === id)).filter(Boolean);
}
// 이 탕에 type 손님을 넣으면 옆 탕 손님과의 관계 설명
function companyNotes(tub, type) {
  const out = [];
  for (const n of neighborTubs(tub)) {
    const other = n.guest;
    if (!other || other.special || n.state !== 'occupied') continue;
    const rel = relationOf(type, other.type);
    if (rel === 'dislike') out.push(`옆 탕 ${guestName(other)}: 사이 나쁨!`);
    else if (rel === 'like') out.push(`옆 탕 ${guestName(other)}: 사이 좋음♪`);
  }
  return out;
}
function interactNearest() {
  // 따라오는 손님은 항상 곁에 있으므로 키 상호작용 대상에서 제외 (돌려보내기는 클릭으로)
  const list = interactables().filter(it => inRange(it) && !(it.type === 'guest' && it.ref.state === 'following'));
  if (!list.length) { UI.toast('주변에 상호작용할 대상이 없어요'); return; }
  // 손님·단서 > 탕·약재 > 장식(접수대 등) 순으로 우선
  const bonus = { guest: 0.8, shadow: 0.8, clue: 0.8, deco: -1.5 };
  const prio = it => targetDist(it) - (bonus[it.type] || 0);
  list.sort((a, b) => prio(a) - prio(b));
  interact(list[0]);
}

/* ---------- 플레이어 ---------- */
/* ---------- 장면 전환 (목욕탕 ↔ 정원 · 약재 창고) ---------- */
function startTransition(portal) {
  const w = Game.world, p = w.player;
  w.trans = { phase: 'out', t: 0, to: portal.to, at: portal.at };
  p.target = null; p.path = null; p.moving = false;
  if (w.follower) {
    const g = w.follower;
    w.follower = null;
    g.state = 'arriving';
    const home = homeSpot(g);
    g.path = npcPath(g.x, g.y, home[0], home[1]);
    UI.toast(`${Util.josa(guestName(g), '은', '는')} 목욕탕 밖으로는 따라올 수 없어요. 자리로 돌아갔어요.`, 'warn');
  }
  Sfx.play('click');
}
function updateTransition(dt) {
  const w = Game.world, tr = w.trans, p = w.player;
  tr.t += dt;
  if (tr.phase === 'out' && tr.t >= SCENE_FADE) {
    w.scene = tr.to;
    p.x = tr.at[0]; p.y = tr.at[1];
    p.face = 1;
    Game.cam.x = Iso.x(p.x, p.y); Game.cam.y = Iso.y(p.x, p.y) - 24;
    tr.phase = 'in'; tr.t = 0;
    if (w.scene !== 'main') w.awayArrivals = 0;
    UI.toast(SCENES[w.scene].name);
  } else if (tr.phase === 'in' && tr.t >= SCENE_FADE) {
    w.trans = null;
  }
}
function updatePlayer(dt) {
  const w = Game.world, p = w.player;
  p.t += dt;
  if (!p.moving) p.walkDist = 0;   // 멈췄다 다시 걸으면 첫 보폭부터
  if (w.trans) { updateTransition(dt); p.moving = false; return; }
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
  const speed = 3.3 * upFx('speed');
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
    p.walkDist = p.moving ? (p.walkDist || 0) + moved : 0;   // 걷기 프레임은 걸은 거리로 넘김
    const sdx = mx - my;
    if (Math.abs(sdx) > 0.1) p.face = sdx > 0 ? 1 : -1;
    if (p.target) {
      p.stuck = moved < speed * dt * 0.2 ? p.stuck + dt : 0;
      if (p.stuck > 0.7) { p.target = null; p.path = null; p.stuck = 0; }
    }
    const portal = portalAt(p.x, p.y);
    if (portal) startTransition(portal);
  } else p.moving = false;
}

/* ---------- 손님 ---------- */
function guestName(g) { return isSpecial(g.type) ? SPECIALS[g.type].name : GUEST_TYPES[g.type].name; }
function requestLine(g) {
  const T = GUEST_TYPES[g.type];
  const h = HERBS[g.request.herbs[0]].name;
  let s = T.line.replace('{temp}', g.request.temp).replace('{herb_eul}', Util.josa(h, '을', '를')).replace('{herb}', h);
  if (g.request.herbs[1]) s += `\n…아, 그리고 ${HERBS[g.request.herbs[1]].name}도 조금 넣어 줘.`;
  const dis = relationsOf(g.type).dislike;
  if (dis.length) s += `\n(참, ${dis.map(t => GUEST_TYPES[t].name).join('이나 ')} 옆 탕은 사양할게.)`;
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
  const herbs = [T.alt && Math.random() < 0.4 ? Util.pick(T.alt) : T.herb];
  if (cfg.twoHerb && Math.random() < cfg.twoHerb) herbs.push(Util.pick(Object.keys(HERBS).filter(h => h !== herbs[0])));
  const pm = T.patience * upFx('calm') * (hasGift('patience') ? 1.15 : 1);
  const g = {
    id: ++w.gid, type, x: DOOR.x + 0.5, y: DOOR.y + 0.5, face: -1, alpha: 0, moving: false,
    state: 'arriving', request: { temp, herbs }, known: false,
    patience: pm, patienceMax: pm, queueIdx: qi, path: null, tub: null, bathT: 0, repath: 0,
  };
  g.path = npcPath(g.x, g.y, QUEUE_SPOTS[qi][0], QUEUE_SPOTS[qi][1]);
  w.guests.push(g);
  if (w.scene !== 'main') w.awayArrivals = (w.awayArrivals || 0) + 1;
  Sfx.play('doorbell');   // 입구 방울 짤랑
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
      // 마감 후에는 안내 중인 손님도 남은 대기 시간 안에서만 마무리 가능
      if (w.closed && !g.noPatience) {
        g.patience -= dt;
        if (g.patience <= 0) { guestLeaveAngry(g); break; }
      }
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
      updateBathMood(g, dt);
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
  if (g.state === 'kWait') { specialDialog(g); return; }
  if (g.state === 'following') { sendBack(g); return; }
  if (g.state !== 'waiting') return;
  if (!g.known) {
    const readyTub = w.tubs.some(t => t.state === 'ready');
    const buttons = [{ label: '알겠습니다!', primary: true, onClick: () => { g.known = true; } }];
    if (readyTub && !w.follower) buttons.push({ label: '바로 탕으로 모실게요', onClick: () => { g.known = true; startFollow(g); } });
    UI.dialog({ portrait: g.type, name: guestName(g), text: requestLine(g), buttons, voice: g.type });
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
  UI.toast(`${Util.josa(guestName(g), '이', '가')} 따라옵니다.`);
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
  g.bathMax = g.special ? SPECIALS[g.type].bath : (GUEST_TYPES[g.type].bath || BATH_TIME);
  g.bathT = g.bathMax;
  g.x = tub.x + tub.w / 2;
  g.y = tub.y + tub.h / 2;
  g.face = 1;
  g.entryTemp = Math.round(tub.temp);
  g.offTime = 0; g.offNow = 0; g.complained = false;
  g.badCompany = false; g.goodCompany = false;
}
// 목욕 중: 탕 온도 유지 여부와 옆 탕 손님과의 궁합을 추적
function updateBathMood(g, dt) {
  const tub = g.tub;
  const diff = tub.temp - g.request.temp;
  const entryDiff = Math.abs(g.entryTemp - g.request.temp);
  // 들어올 때보다 확실히 나빠졌을 때만 불평 (입장 온도 감점과 중복 방지)
  const off = Math.abs(diff) >= TEMP_OFF_MARGIN && Math.abs(diff) > entryDiff + 0.5;
  g.offNow = off ? (diff < 0 ? -1 : 1) : 0;
  if (off) {
    g.offTime += dt;
    if (!g.complained) {
      g.complained = true;
      Sfx.play('bad');   // 불평과 해결 방법은 안내 띠(hintText)가 경고색으로 계속 보여 준다
    }
  }
  if (g.special) return;
  for (const n of neighborTubs(tub)) {
    const other = n.guest;
    if (!other || other.state !== 'bathing' || other.special) continue;
    const rel = relationOf(g.type, other.type);
    const cx = tub.x + tub.w / 2, cy = tub.y + tub.h / 2;
    if (rel === 'dislike' && !g.badCompany) {
      g.badCompany = true;
      addFloat(cx, cy, `${guestName(other)} 옆이라니…`, '#ff9a85', 13, 100, 2.4);
    } else if (rel === 'like' && !g.goodCompany) {
      g.goodCompany = true;
      addFloat(cx, cy, `${guestName(other)}, 반가워♪`, '#bff0b0', 13, 100, 2.4);
    }
  }
}
function rate(g, tub) {
  const temp = g.entryTemp ?? Math.round(tub.temp);
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
  // 목욕 중 온도 유지
  const offRatio = g.bathMax ? (g.offTime || 0) / g.bathMax : 0;
  if (offRatio > 0.5) { stars -= 2; notes.push('온도가 오래 어긋남'); }
  else if (offRatio > 0.2) { stars -= 1; notes.push('온도 유지 아쉬움'); }
  // 옆 탕 궁합
  if (g.badCompany) { stars -= 1; notes.push('옆 탕 손님과 불편'); }
  stars = Util.clamp(stars, 1, 5);
  const tip = g.goodCompany ? COMPANY_TIP : 0;
  if (tip) notes.push(`옆 탕 손님과 즐거움 +${tip}냥`);
  return {
    stars, notes,
    coins: Math.round((stars * 8 + (stars === 5 ? 12 : 0)) * upFx('tea')) + tip,
    score: stars * 20 + (stars === 5 ? 20 : 0),
    kaoOK: diff <= 1 && !missing && !extra && offRatio <= 0.5,
  };
}
function finishBath(g, forced) {
  const w = Game.world, m = Game.meta, tub = g.tub;
  const res = rate(g, tub);
  const cx = tub.x + tub.w / 2, cy = tub.y + tub.h / 2;
  if (g.special) {
    const S = SPECIALS[g.type], r = specialRec(g.type);
    r.result = res.kaoOK ? 'healed' : 'failed';
    if (g.type === 'kaonashi') m.kResult = r.result;
    if (res.kaoOK) {
      addFloat(cx, cy, S.thanks, '#f3d9ff', 16, 90, 3.2);
      Sfx.play('clue');
      for (let k = 0; k < 24; k++) {
        w.effects.push({ kind: 'spark', x: Iso.x(cx, cy), y: Iso.y(cx, cy) - 40, vx: Util.rand(-40, 40), vy: Util.rand(-60, -10), life: 1.5, max: 1.5 });
      }
      if (S.reward) {
        m.coins += S.reward; m.score += 100; w.stats.coins += S.reward; w.stats.score += 100;
        addFloat(cx, cy, `+${S.reward}냥`, '#ffd36a', 15, 70, 2.6);
      }
      w.stats.log.push({ name: S.name, stars: 5, note: S.gift ? `특별한 손님 · 선물: ${S.gift.name}` : '특별한 손님 · 마음을 열었다' });
      if (S.gift) UI.toast(`${S.name}의 선물 — ${S.gift.name}: ${S.gift.desc}`, 'kao');
    } else {
      addFloat(cx, cy, S.sad.split('」')[0] + (S.sad.includes('」') ? '」' : ''), '#d0c0e0', 16, 90, 2.5);
      w.stats.log.push({ name: S.name, stars: 0, note: '특별한 손님 · 맞는 탕이 아니었다' });
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
  if (tub.state === 'occupied') {
    if (!tub.guest || tub.guest.state !== 'bathing') { UI.toast('손님이 탕에 들어가는 중이에요'); return; }
    Game.tub = tub;
    UI.openTub(tub); // 목욕 중에는 온도만 조절 가능
    return;
  }
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
  p.busy = p.busyTotal = CLEAN_TIME * upFx('clean'); p.busyLabel = '탕 청소 중';
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
  if (tub.state === 'occupied') { UI.toast('목욕 중에는 약재를 바꿀 수 없어요', 'warn'); return; }
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
  if (tub.state === 'occupied') { UI.toast('목욕 중에는 약재를 바꿀 수 없어요', 'warn'); return; }
  if (w.inventory.length >= invCap()) { UI.toast('바구니가 가득 찼어요', 'warn'); return; }
  const h = tub.herbs.splice(i, 1)[0];
  if (h) { w.inventory.push(h); Sfx.play('pick'); }
}
function tubCool() {
  const tub = Game.tub;
  if (!tub) return;
  tub.temp = Math.max(TUB_MIN_TEMP, Math.round(tub.temp) - 1);
  Sfx.play('water');
}
function tubDrain() {
  const tub = Game.tub;
  if (!tub) return;
  if (tub.state === 'occupied') { UI.toast('목욕 중에는 물을 뺄 수 없어요', 'warn'); return; }
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
    // 물을 받은 탕은 서서히 식는다 (데우는 중인 탕 제외)
    if ((o.state === 'ready' || o.state === 'occupied') && !(Game.heatOn && Game.tub === o) && !w.demo) {
      o.temp = Math.max(TUB_MIN_TEMP, o.temp - TUB_COOL_RATE * (hasGift('cool') ? 0.7 : 1) * (o.state === 'ready' ? upFx('warm') : 1) * dt);
    }
    if ((o.state === 'ready' || o.state === 'occupied') && o.temp >= 39) {
      o.steam += dt * (o.temp - 37) * 0.9;
      while (o.steam > 1) {
        o.steam -= 1;
        const cx = Iso.x(o.x + o.w / 2, o.y + o.h / 2), cy = Iso.y(o.x + o.w / 2, o.y + o.h / 2) - 14;
        w.effects.push({ kind: 'steam', x: cx + Util.rand(-24, 24), y: cy + Util.rand(-8, 8), vx: Util.rand(-4, 4), vy: Util.rand(-26, -14), life: Util.rand(1.4, 2.2), max: 2.2, r: Util.rand(4, 7) });
      }
    }
  }
  const furnace = w.objects.find(o => o.kind === 'furnace');
  if (furnace) furnace.fuelRatio = w.fuel / BOILER.maxFuel;
  w.boilerRatio = w.fuel / BOILER.maxFuel;
  if (Math.random() < dt * 3 * (w.fuel > 0 ? 1 : 0.2)) {
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
function addFloat(wx, wy, text, color, size = 14, z = 50, life = 1.8, scene = 'main') {
  Game.world.floats.push({ x: Iso.x(wx, wy), y: Iso.y(wx, wy) - z, text, color, size, life, max: life, scene });
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
  p.busy = p.busyTotal = GATHER_TIME * upFx('gather'); p.busyLabel = '채집 중';
  p.target = null; p.path = null;
  p.busyDone = () => {   // 게이지가 다 찬 뒤에야 바구니에 넣는다
    if (w.inventory.length >= invCap()) { UI.toast('바구니가 가득 찼어요!', 'warn'); Sfx.play('bad'); return; }
    w.inventory.push(h);
    addFloat(p.x, p.y, `+${HERBS[h].name}`, '#eaffd2', 14, 56, 1.8, w.scene);
    Sfx.play('pick');
  };
}
function dropInventory(i) {
  const w = Game.world;
  const h = w.inventory.splice(i, 1)[0];
  if (h) { Sfx.play('drop'); UI.toast(`${Util.josa(HERBS[h].name, '을', '를')} 버렸어요`); }
}

/* ---------- 단서 · 특별한 손님 ---------- */
function collectClue(c) {
  const m = Game.meta;
  c.collected = true;
  if (!m.clues.includes(c.id)) m.clues.push(c.id);
  Sfx.play('clue');
  const def = CLUES[c.id], sid = def.guest;
  UI.dialog({
    portrait: def.npc ? sid : 'chihiro', silhouette: def.npc && !specialMet(sid),
    name: `단서 발견 — ${def.name}`,
    text: `${def.text}\n\n(${specialLabel(sid)}의 단서 ${specialClueCount(sid)}/${cluesOf(sid).length} · J 키로 단서 수첩을 볼 수 있다)`,
    buttons: [{ label: '수첩에 적어 둔다', primary: true }],
  });
}
function onShadowClick(c) {
  const def = CLUES[c.id];
  UI.dialog({
    portrait: def.guest, name: specialLabel(def.guest), silhouette: !specialMet(def.guest),   // 방문 전에는 외형을 가린다
    text: def.meet.text,
    buttons: [{ label: def.meet.button, primary: true, onClick: () => { c.fading = true; Sfx.play('kao'); } }],
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
      // 플레이어가 있는 장면에서만, 너무 가깝지 않은 곳에 나타남
      if (s[2] === w.scene && Util.dist(s[0], s[1], p.x, p.y) > 4.5) { gh.x = s[0]; gh.y = s[1]; gh.scene = s[2]; gh.show = true; gh.life = 7; }
      else gh.timer = 2;
    }
  } else {
    gh.life -= dt;
    gh.alpha = Math.min(0.5, gh.alpha + dt * 0.5);
    if (gh.life <= 0 || gh.scene !== w.scene || Util.dist(gh.x, gh.y, p.x, p.y) < 2.8) { gh.show = false; gh.timer = Util.rand(18, 30); }
  }
}
function spawnSpecial(id) {
  const w = Game.world, S = SPECIALS[id];
  const g = {
    id: ++w.gid, type: id, special: true, x: DOOR.x + 0.5, y: DOOR.y + 0.5, face: -1, alpha: 0, moving: false,
    state: 'arriving', request: { temp: S.request.temp, herbs: [...S.request.herbs] }, known: false, hidden: true,
    noPatience: true, patience: 1, patienceMax: 1, queueIdx: null, path: null, tub: null, bathT: 0, repath: 0,
  };
  g.path = npcPath(g.x, g.y, K_SPOT[0], K_SPOT[1]);
  w.guests.push(g);
  w.special = g;
  specialRec(id).met = true;
  Sfx.play('kao');
  UI.toast(S.arrive, 'kao');
}
function specialDialog(g) {
  if (g.type === 'kaonashi') { kaonashiDialog(g); return; }
  const S = SPECIALS[g.type], n = specialClueCount(g.type), total = cluesOf(g.type).length;
  UI.dialog({
    portrait: g.type, name: S.name, voice: g.type,
    text: S.greet,
    buttons: [
      {
        label: '"어서 오세요. 마음에 드실 탕을 준비해 드릴게요."',
        disabled: n < CLUES_NEEDED,
        note: n < CLUES_NEEDED ? `무엇을 좋아하시는지 조금 더 알았다면… (단서 ${n}/${total}, ${CLUES_NEEDED}개 필요)` : '단서를 떠올려 손님에게 맞는 탕을 준비하자',
        primary: n >= CLUES_NEEDED,
        onClick: () => {
          setSpecialChoice(g.type, 'host');
          g.hosted = true; g.known = true; g.state = 'waiting';
          Sfx.play('clue');
          UI.toast(`${Util.josa(S.name, '을', '를')} 손님으로 맞이했다.`, 'kao');
        },
      },
      { label: '"죄송해요, 오늘은 모실 수가 없어요."', onClick: () => { setSpecialChoice(g.type, 'refuse'); kaoLeave(g); } },
    ],
  });
}
function kaonashiDialog(g) {
  const m = Game.meta, n = specialClueCount('kaonashi'), total = cluesOf('kaonashi').length;
  UI.dialog({
    portrait: 'kaonashi', name: '얼굴 없는 손님', voice: 'kaonashi',
    text: '「……아…… 아……」\n그는 말없이 두 손을 내민다. 손바닥 위에서 금덩이가 반짝인다.',
    buttons: [
      { label: '금을 받는다', onClick: () => {
        setSpecialChoice('kaonashi', 'gold'); m.coins += 300;
        addFloat(g.x, g.y, '+300냥…?', '#f4cf55', 15, 80);
        kaoLeave(g);
      } },
      { label: '정중히 거절한다', onClick: () => { setSpecialChoice('kaonashi', 'refuse'); kaoLeave(g); } },
      {
        label: '"금은 필요 없어요. 대신 따뜻한 탕을 준비해 드릴게요."',
        disabled: n < CLUES_NEEDED,
        note: n < CLUES_NEEDED ? `그에 대해 조금 더 알았다면… (단서 ${n}/${total}, ${CLUES_NEEDED}개 필요)` : '단서를 떠올려 그에게 맞는 탕을 준비하자',
        primary: n >= CLUES_NEEDED,
        onClick: () => {
          setSpecialChoice('kaonashi', 'host');
          g.hosted = true; g.known = true; g.state = 'waiting';
          Sfx.play('clue');
          UI.toast('그를 손님으로 맞이하기로 했다.', 'kao');
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

/* ---------- 탐험 구역에 있을 때 목욕탕 소식 ---------- */
function awayAlerts() {
  const w = Game.world, out = [];
  if (w.closed) out.push({ text: '영업 종료 — 마감 정리 중', urgent: true });
  if (w.awayArrivals) out.push({ text: `새 손님 ${w.awayArrivals}명 도착`, urgent: false });
  for (const g of w.guests) {
    if (g.state === 'kWait') out.push({ text: `접수대 옆에 ${guestName(g)}이(가) 서 있다…`, urgent: true });
    else if ((g.state === 'waiting' || g.state === 'arriving') && !g.noPatience) {
      const r = g.patience / g.patienceMax;
      if (r < 0.35) out.push({ text: `${guestName(g)} 인내심 ${Math.max(0, Math.round(r * 100))}%`, urgent: true });
    } else if (g.state === 'bathing' && g.offNow) {
      out.push({ text: `${g.tub.label} ${g.offNow < 0 ? '식는 중!' : '너무 뜨거움!'}`, urgent: true });
    }
  }
  const dirty = w.tubs.filter(t => t.state === 'dirty').length;
  if (dirty) out.push({ text: `청소할 탕 ${dirty}개`, urgent: false });
  if (w.fuel < BOILER.warnAt) out.push({ text: '보일러 장작 부족', urgent: true });
  return out;
}

/* ---------- 튜토리얼 힌트 ---------- */
function hintText() {
  const w = Game.world;
  if (!w || w.demo) return null;
  const p = w.player;
  const cold = w.guests.find(g => g.state === 'bathing' && g.offNow);
  // [문구, 'warn'] 은 경고색으로 표시
  if (cold) return [`${guestName(cold)}: "${cold.offNow < 0 ? '물이 식었어!' : '앗, 뜨거워!'}" — ${cold.tub.label}을 클릭해 온도를 맞춰 주세요.`, 'warn'];
  if (w.fuel <= 0) return ['보일러 장작이 떨어져 불이 약해졌어요! 보일러실의 가마를 클릭해 장작을 넣으세요.', 'warn'];
  if (w.fuel < BOILER.warnAt) return ['보일러 장작이 얼마 남지 않았어요. 보일러실의 가마를 클릭해 장작을 넣으세요.', 'warn'];
  if (w.closed) return '영업 종료 — 안내 중인 손님을 탕에 모시고, 목욕이 끝나기를 기다리세요.';
  if (w.special && w.special.state === 'kWait') return `접수대 옆에 ${guestName(w.special)}이(가) 서 있다. 말을 걸어 보자.`;
  if (w.special && w.special.hosted && !['leaving', 'bathing'].includes(w.special.state)) return `${guestName(w.special)}에게 맞는 탕은? 단서 수첩(J)에 답이 있다.`;
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
    if (need.length) {
      const h = need[0], spot = OBJECT_DEFS.find(o => o.herbs && o.herbs.includes(h));
      const hs = (spot && spot.scene) || 'main';
      if (hs !== w.scene) {
        return w.scene === 'main'
          ? `${Util.josa(HERBS[h].name, '은', '는')} ${SCENES[hs].name}에 있어요. 복도 왼쪽 끝의 '${SCENES[hs].name}' 문으로 들어가세요.`
          : `${Util.josa(HERBS[h].name, '은', '는')} 여기 없어요. 아래쪽 '목욕탕' 문으로 돌아가세요.`;
      }
      return `${Util.josa(HERBS[h].name, '은', '는')} ${spot.label}에서 챙길 수 있어요. 다가가서 클릭!`;
    }
    if (w.scene !== 'main') return "약재를 챙겼다면 아래쪽 '목욕탕' 문으로 돌아가세요.";
    return `빈 탕을 클릭해 물을 받고, 불을 지펴 ${g.request.temp}°C에 맞춘 뒤 약재를 넣으세요.`;
  }
  return 'WASD로 이동, 클릭 또는 Space로 상호작용해요. 곧 손님이 옵니다.';
}

/* ---------- 메뉴 ---------- */
function toggleSound() {
  Sfx.muted = !Sfx.muted;
  try { localStorage.setItem(SOUND_KEY, Sfx.muted ? '1' : '0'); } catch (e) { /* noop */ }
  UI.setSoundIcon(Sfx.muted);
  if (!Sfx.muted) { Sfx.ensure(); Sfx.play('click'); } else Bgm.stop();   // 소리 끄면 배경음악도 멈춤
}
function openPause() { if (Game.screen === 'play' && !Game.modal) UI.pause(); }
function openJournal() { if (Game.screen === 'play' && !Game.modal) UI.journal(Game.meta); }

/* ---------- 업데이트 ---------- */
function updateWorld(dt) {
  const w = Game.world;
  if (w.ended) return;
  w.time += dt;
  if (!w.closed && w.time >= w.length) closeBusiness();
  for (const s of w.schedule) {
    if (!w.closed && !s.spawned && w.time >= s.at) {
      if (spawnGuest(s.type)) s.spawned = true; else s.at = w.time + 3;
    }
  }
  if (!w.closed && w.cfg.special && !w.sEventDone && w.time >= w.cfg.specialAt * w.length) {
    w.sEventDone = true;
    spawnSpecial(w.cfg.special);
  }
  updatePlayer(dt);
  for (const g of w.guests) updateGuest(g, dt);
  if (w.special && w.special.state === 'gone') w.special = null;
  w.guests = w.guests.filter(g => g.state !== 'gone');
  for (const c of w.clueItems) {
    if (c.fading) {
      c.alpha -= dt * 0.9;
      if (c.alpha <= 0) { c.fading = false; collectClue(c); }
    }
  }
  updateGhost(dt);

  // 탕을 Space로 연 경우, 키를 한 번 뗀 뒤부터 Space가 불 지피기로 동작
  if (!Input.keys.has('Space')) Game.spaceLatch = false;
  Game.heatOn = Game.modal === 'tub' && !!Game.tub && (Game.heating || (Input.keys.has('Space') && !Game.spaceLatch));
  if (Game.heatOn) {
    Game.tub.temp = Math.min(50, Game.tub.temp + 2.9 * upFx('heat') * boilerSpeed() * dt);
    w.fuel = Math.max(0, w.fuel - BOILER.heatDrain * (hasGift('fuel') ? 0.7 : 1) * upFx('fuel') * dt);
    w.heatSfx -= dt;
    if (w.heatSfx <= 0) { w.heatSfx = 0.12; Sfx.play('heat'); }
  }
  w.fuel = Math.max(0, w.fuel - BOILER.idleDrain * (hasGift('fuel') ? 0.7 : 1) * upFx('fuel') * dt);
  if (!w.fuelWarned && w.fuel < BOILER.warnAt) {
    w.fuelWarned = true;
    Sfx.play('bad');   // 경고 문구는 안내 띠(hintText)가 경고색으로 보여 준다
  }
  // 열어 둔 탕에서 손님이 나가 탕이 더러워지면 패널 닫기
  if (Game.modal === 'tub' && Game.tub && !['ready', 'occupied'].includes(Game.tub.state)) UI.closeModal();
  updateTubs(dt);
  updateEffects(dt);

  // 마감 후: 남은 손님이 모두 떠나면 정산 (안전장치로 CLOSING_GRACE초 뒤 강제 정산)
  if (w.closed) {
    if (w.time >= w.length + CLOSING_GRACE) { endDay(); return; }
    if (w.guests.length === 0) {
      if (w.endTimer < 0) w.endTimer = 1.5;
      w.endTimer -= dt;
      if (w.endTimer <= 0) endDay();
    }
    return;
  }
  const allDone = w.schedule.every(s => s.spawned) && w.guests.length === 0 && (!w.cfg.special || w.sEventDone);
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
    // Space/Enter는 강조된(기본) 선택지만 고른다 — 중요한 선택을 실수로 누르지 않도록
    if (P.has('Enter') || P.has('Space')) {
      if (UI.skipTyping()) { Game.spaceLatch = true; return; }   // 말하는 중이면 먼저 글을 끝까지 보여 준다
      const i = UI.primaryIndex();
      if (i >= 0) { Game.spaceLatch = true; UI.choose(i); }
      return;
    }
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
  if (!Game.modal && !Game.world.trans && (P.has('Space') || P.has('KeyE'))) {
    const p = Game.world.player;
    Game.spaceLatch = true;
    if (p.busy <= 0) interactNearest();
  }
}
function handleClicks() {
  const p = Game.world.player;
  if (Game.world.trans) return;
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
  const sc = SCENES[w.scene || 'main'];
  const xmin = Iso.x(0, sc.h), xmax = Iso.x(sc.w, 0), ymin = -90, ymax = Iso.y(sc.w, sc.h);
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
  if (Game.screen === 'title' || Game.screen === 'story') { Render.titleScene(ctx, W, H, Game.t, Game.dpr); return; }
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
  if (w.trans) {
    const k = Util.clamp(w.trans.t / SCENE_FADE, 0, 1);
    ctx.fillStyle = `rgba(6,4,14,${w.trans.phase === 'out' ? k : 1 - k})`;
    ctx.fillRect(0, 0, W, H);
  }
}
