'use strict';
/* =========================================================
 * 엔진 — 유틸 · 아이소메트릭 좌표 · 입력 · 사운드 · 길찾기 · 에셋
 * ========================================================= */

const Util = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: arr => arr[Math.floor(Math.random() * arr.length)],
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  distToRect(px, py, r) {
    const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
    const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
    return Math.hypot(dx, dy);
  },
  // 한글 받침 판별 → 조사 자동 선택
  hasBatchim(word) {
    const c = word.charCodeAt(word.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return false;
    return (c - 0xac00) % 28 !== 0;
  },
  josa(word, withB, withoutB) { return word + (Util.hasBatchim(word) ? withB : withoutB); },
  hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  rgb(a) { return `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`; },
  mixRgb(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
  fmtClock(frac) {
    const mins = OPEN_HOUR * 60 + Util.clamp(frac, 0, 1) * (CLOSE_HOUR - OPEN_HOUR) * 60;
    const h = Math.floor(mins / 60) % 24;
    const m = Math.floor((mins % 60) / 10) * 10;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },
  avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; },
};

/* 아이소메트릭(쿼터뷰) 변환: 월드(타일 단위) ↔ 화면(px) */
const Iso = {
  x: (x, y) => (x - y) * (TILE_W / 2),
  y: (x, y) => (x + y) * (TILE_H / 2),
  toWorld(sx, sy) {
    const a = sx / (TILE_W / 2), b = sy / (TILE_H / 2);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  },
};

/* 입력 — e.code 사용(한글 입력 상태에서도 WASD 동작) */
const Input = {
  keys: new Set(),
  pressed: new Set(),
  clicks: [],
  mouse: { x: -1, y: -1, inside: false },
  init(canvas) {
    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    });
    canvas.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.clicks.push({ x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },
  endFrame() { this.pressed.clear(); this.clicks.length = 0; },
};

/* 효과음 — WebAudio로 합성 (외부 파일 없음) */
const Sfx = {
  ctx: null,
  muted: false,
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx && !this.muted) Bgm.start();   // 첫 클릭·키 입력 뒤부터 배경음악 (브라우저 자동재생 정책)
  },
  tone(f, d, type = 'sine', v = 0.08, f2 = null, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + d + 0.03);
  },
  // 짧은 잡음(타격음·숨소리용): 대역 필터를 거친 흰 잡음
  noise(delay, dur, v, freq, q = 4, out = null) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out || c.destination);
    src.start(t); src.stop(t + dur + 0.02);
  },
  play(name) {
    if (this.muted || !this.ctx) return;
    switch (name) {
      case 'click': this.tone(520, 0.05, 'square', 0.025); break;
      case 'pick': this.tone(660, 0.12, 'triangle', 0.07, 990); break;
      case 'drop': this.tone(400, 0.12, 'triangle', 0.05, 220); break;
      case 'water': this.tone(180, 0.35, 'sine', 0.05, 520); break;
      case 'heat': this.tone(90 + Math.random() * 60, 0.07, 'sawtooth', 0.012); break;
      case 'bell': this.tone(880, 0.7, 'sine', 0.05); this.tone(1320, 0.5, 'sine', 0.025, null, 0.02); break;
      case 'good': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, 'sine', 0.06, null, i * 0.08)); break;
      case 'ok': [523, 659].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.05, null, i * 0.09)); break;
      case 'bad': this.tone(300, 0.35, 'sawtooth', 0.035, 140); break;
      case 'clue': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.045, null, i * 0.12)); break;
      case 'kao': this.tone(110, 1.4, 'sine', 0.09, 82); this.tone(165, 1.2, 'sine', 0.03, 123, 0.1); break;
      case 'clean': this.tone(900, 0.08, 'triangle', 0.03, 1400); break;
      case 'doorbell': {
        // 문 위에 매단 놋쇠 종 '딸랑-딸랑': 짧은 쇳소리(타격) + 종의 비조화 배음이 길게 울림, 두 번 흔들림
        const strike = (d, v) => {
          const base = 1046.5 * (1 + (Math.random() - 0.5) * 0.02);
          for (const [m, k, dur] of [[1, 1, 1.3], [2.0, 0.5, 0.9], [2.76, 0.35, 0.7], [5.4, 0.15, 0.35]]) this.tone(base * m, dur, 'sine', v * k, null, d);
          this.noise(d, 0.025, v * 0.6, 4200);   // 종을 치는 짧은 '틱'
        };
        strike(0, 0.045); strike(0.22, 0.032); strike(0.5, 0.016);
        break;
      }
    }
  },
};

/* 배경음악 — 파일 없이 WebAudio로 만드는 곡 두 개. 화면에 따라 자동으로 바뀌고(1.5초 겹쳐 넘김) 멜로디는 매번 조금씩 새로 만든다.
 *  - play  (영업 중): 요나누키 오음계(D·E·G·A·B), 거문고처럼 뜯는 소리 + 화음 바탕 + 베이스, 76bpm
 *  - title (타이틀·이야기·엔딩): 몽환적으로 — 맑은 7화음(Dmaj7·Bm7·Gmaj7·Aadd9)이 천천히 부풀었다 사라지고,
 *    그 위로 오르골·첼레스타 같은 종소리 분산화음이 흩어지며, 메아리를 길고 깊게 */
const BGM_SONGS = {
  play: {
    bpm: 76, lead: 'pluck', padVol: 0.022, bassVol: 0.05, echo: [0.32, 0.32, 0.3],
    scale: [196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25],
    roots: [146.83, 146.83, 196.0, 220.0, 146.83, 123.47, 196.0, 220.0],
    chance: [0.9, 0.25, 0.55, 0.2, 0.75, 0.3, 0.5, 0.15], rest: [3, 6],
  },
  title: {
    bpm: 64, lead: 'celesta', padVol: 0.014, bassVol: 0.03, echo: [0.42, 0.48, 0.5],   // [딜레이(초), 되먹임, 메아리 양]
    roots: [146.83, 123.47, 196.0, 220.0, 146.83, 123.47, 196.0, 220.0],
    chords: [   // 마디별 화음 구성음 (분산화음·바탕에 씀)
      [293.66, 369.99, 440.0, 554.37], [246.94, 293.66, 369.99, 440.0], [196.0, 246.94, 293.66, 369.99], [220.0, 277.18, 329.63, 493.88],
      [293.66, 369.99, 440.0, 554.37], [246.94, 293.66, 369.99, 440.0], [196.0, 246.94, 293.66, 369.99], [220.0, 277.18, 329.63, 493.88],
    ],
    chance: [0.9, 0.55, 0.7, 0.45, 0.8, 0.5, 0.6, 0.35],
  },
};
const Bgm = {
  on: false, chain: null, timer: 0, next: 0, step: 0, idx: 3, VOL: 0.5, song: 'title',
  // 지금 화면에 맞는 곡: 영업 중(일차 시작·정산 포함)이면 play, 나머지는 title
  want() { return typeof Game !== 'undefined' && ['play', 'dayIntro', 'dayEnd'].includes(Game.screen) ? 'play' : 'title'; },
  makeChain() {   // 곡마다 따로 출력 줄기(메아리 포함)를 만들어, 바꿀 때 이전 줄기만 서서히 끈다
    const c = Sfx.ctx, out = c.createGain(), bus = c.createGain(), [dTime, dFb, dWet] = BGM_SONGS[this.song].echo;
    out.gain.setValueAtTime(0.0001, c.currentTime);
    out.gain.exponentialRampToValueAtTime(this.VOL, c.currentTime + 2.5);
    const dl = c.createDelay(1); dl.delayTime.value = dTime;
    const fb = c.createGain(); fb.gain.value = dFb;
    const wet = c.createGain(); wet.gain.value = dWet;
    bus.connect(out); bus.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(out);
    out.connect(c.destination);
    return { out, bus };
  },
  fadeOut(chain, sec) {
    const c = Sfx.ctx, g = chain.out.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(Math.max(g.value, 0.0001), c.currentTime);
    g.exponentialRampToValueAtTime(0.0001, c.currentTime + sec);
    setTimeout(() => chain.out.disconnect(), sec * 1000 + 300);
  },
  start() {
    const c = Sfx.ctx;
    if (this.on || !c) return;
    this.on = true;
    this.song = this.want(); this.chain = this.makeChain();
    this.next = c.currentTime + 0.3; this.step = 0;
    this.timer = setInterval(() => this.tick(), 100);
  },
  stop() {
    if (!this.on || !Sfx.ctx) return;
    this.on = false;
    clearInterval(this.timer); this.timer = 0;
    this.fadeOut(this.chain, 0.6);
  },
  tick() {
    const c = Sfx.ctx, w = this.want();
    if (w !== this.song) {   // 화면이 바뀌면 곡을 겹쳐 넘김
      this.fadeOut(this.chain, 1.5);
      this.song = w; this.chain = this.makeChain();
      this.next = c.currentTime + 0.4; this.step = 0;
    }
    const S = BGM_SONGS[this.song], dt = 60 / S.bpm / 2;
    while (this.next < c.currentTime + 0.5) { this.note(S, this.step, this.next, dt); this.next += dt; this.step++; }
  },
  voice(f, t, dur, type, cutoff) {
    const c = Sfx.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = type; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    const bus = this.chain.bus;
    return { o, g, lp, connect: () => { o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.1); } };
  },
  pluck(f, t, v) {   // 거문고처럼 뜯는 소리: 빠르게 올라갔다 길게 사라짐 + 두 배 배음
    for (const [m, k] of [[1, 1], [2, 0.3]]) {
      const n = this.voice(f * m, t, 1.8, 'triangle', 2600);
      n.g.gain.exponentialRampToValueAtTime(v * k, t + 0.006);
      n.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      n.connect();
    }
  },
  celesta(f, t, v) {   // 오르골·첼레스타 같은 맑은 종소리: 사인파 + 옅은 배음, 부드럽게 시작해 길게 사라짐
    for (const [m, k, d] of [[1, 1, 2.6], [2, 0.22, 1.4], [3, 0.06, 0.8]]) {
      const n = this.voice(f * m, t, d, 'sine', 5000);
      n.g.gain.exponentialRampToValueAtTime(v * k, t + 0.012);
      n.g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      n.connect();
    }
  },
  dreamPad(tones, t, dur, v) {   // 몽환적인 바탕: 화음 구성음 전부를 천천히(2초) 부풀렸다가 길게 놓음, 고음은 잘라 포근하게
    for (const f of tones) for (const d of [-6, 6]) {
      const n = this.voice(f, t, dur + 2.5, 'triangle', 900);
      n.o.detune.value = d;
      n.g.gain.exponentialRampToValueAtTime(v, t + 2.0);
      n.g.gain.setValueAtTime(v, t + dur);
      n.g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2.5);
      n.connect();
    }
  },
  dreamNote(S, step, t, dt) {
    const bar = Math.floor(step / 8) % 8, pos = step % 8, tones = S.chords[bar];
    if (pos === 0) {
      this.dreamPad(tones, t, dt * 8, S.padVol);
      const b = this.voice(S.roots[bar] / 2, t, dt * 8, 'sine', 300);   // 아주 낮게 깔리는 근음
      b.g.gain.exponentialRampToValueAtTime(S.bassVol, t + 1.2);
      b.g.gain.exponentialRampToValueAtTime(0.0001, t + dt * 8);
      b.connect();
    }
    // 분산화음: 화음 구성음을 두 옥타브에 걸쳐 오르내리며, 가끔 건너뛰고 살짝 늦게(사람이 친 듯)
    if (Math.random() < S.chance[pos]) {
      const up = bar % 2 === 0, k = up ? pos : 7 - pos;
      const f = tones[k % 4] * (k < 4 ? 2 : 4) / (Math.random() < 0.2 ? 2 : 1);
      this.celesta(f, t + Math.random() * 0.03, pos === 0 ? 0.045 : 0.032);
    }
    if (Math.random() < 0.05) this.celesta(tones[Math.floor(Math.random() * 4)] * 8, t + dt / 2, 0.01);   // 반짝이는 높은 종
  },
  pad(f, t, dur, v) {   // 부드러운 바탕 화음 (살짝 어긋난 두 음으로 일렁임)
    for (const d of [-3, 3]) {
      const n = this.voice(f, t, dur + 1.2, 'triangle', 700);
      n.o.detune.value = d;
      n.g.gain.exponentialRampToValueAtTime(v, t + 1.0);
      n.g.gain.setValueAtTime(v, t + dur);
      n.g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
      n.connect();
    }
  },
  note(S, step, t, dt) {
    if (S.chords) return this.dreamNote(S, step, t, dt);
    const bar = Math.floor(step / 8) % 8, pos = step % 8, root = S.roots[bar];
    if (pos === 0) {
      this.pad(root * 2, t, dt * 8, S.padVol);                // 화음 바탕: 근음 한 옥타브 위 + 5도
      this.pad(root * 3, t, dt * 8, S.padVol * 0.55);
      const b = this.voice(root / 2, t, dt * 6, 'sine', 400);  // 낮은 베이스
      b.g.gain.exponentialRampToValueAtTime(S.bassVol, t + 0.02);
      b.g.gain.exponentialRampToValueAtTime(0.0001, t + dt * 6);
      b.connect();
    }
    if (Math.random() < S.chance[pos]) {
      if (pos === 6 && bar % 2 === 1) this.idx = S.rest[Math.random() < 0.5 ? 0 : 1];   // 근음·5도로 쉬어 가기
      else this.idx = Math.max(1, Math.min(S.scale.length - 1, this.idx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      this.pluck(S.scale[this.idx], t, pos === 0 ? 0.06 : 0.045);
    }
    if (Math.random() < 0.025) this.pluck(S.scale[S.scale.length - 1] * 2, t + dt / 2, 0.012);   // 가끔 풍경 소리
  },
};

/* BFS 길찾기 (8방향, 모서리 끼어가기 금지) */
const Path = {
  DIRS: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  bfs(sx, sy, isGoal, canWalk, W = MAP_W, H = MAP_H) {
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
    const prev = new Int16Array(W * H).fill(-2);
    const start = sy * W + sx;
    prev[start] = -1;
    const q = [start];
    let head = 0;
    while (head < q.length) {
      const c = q[head++];
      const cx = c % W, cy = (c - cx) / W;
      if (isGoal(cx, cy)) {
        const out = [];
        let n = c;
        while (n !== -1) {
          const nx = n % W;
          out.push({ x: nx + 0.5, y: (n - nx) / W + 0.5 });
          n = prev[n];
        }
        return out.reverse();
      }
      for (const [dx, dy] of this.DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -2) continue;
        if (!canWalk(nx, ny)) continue;
        if (dx && dy && (!canWalk(cx + dx, cy) || !canWalk(cx, cy + dy))) continue;
        prev[ni] = c;
        q.push(ni);
      }
    }
    return null;
  },
};

/* 에셋 — ASSET_MANIFEST에 등록된 이미지가 있으면 도형 대신 사용 */
const Assets = {
  imgs: {},
  load() {
    for (const [k, def] of Object.entries(ASSET_MANIFEST)) {
      const img = new Image();
      img.src = def.src;
      this.imgs[k] = { img, def };
    }
  },
  /* 스프라이트 시트 애니메이션: anim 이름과 진행값으로 프레임을 골라 그린다
   * 진행값 t는 fps 애니메이션이면 시간(초), perTile 애니메이션이면 걸은 거리(칸) */
  drawAnim(ctx, key, anim, t, x, y, flip = false, alpha = 1) {
    const a = this.imgs[key];
    if (!a || !a.img.complete || !a.img.naturalWidth || !a.def.sheet) return false;
    const d = a.def, sh = d.sheet, an = sh.anims[anim] || sh.anims.idle;
    const f = an.seq[Math.floor(t * (an.perTile ?? an.fps)) % an.seq.length];
    const s = (d.scale || 1) * (an.scale || 1), w = sh.fw * s, h = sh.fh * s;   // an.scale: 줄별 크기 보정
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(a.img, f * sh.fw, an.row * sh.fh, sh.fw, sh.fh, -w * (d.ax ?? 0.5), -h * (d.ay ?? 1), w, h);
    ctx.restore();
    return true;
  },
  /* skew: 기준점(바닥)은 고정하고 위로 갈수록 옆으로 밀어 기울인다 — 나무 흔들림용 (높이 1px당 밀리는 px) */
  draw(ctx, key, x, y, flip = false, alpha = 1, skew = 0) {
    const a = this.imgs[key];
    if (!a || !a.img.complete || !a.img.naturalWidth) return false;
    const d = a.def;
    if (d.sheet) return this.drawAnim(ctx, key, 'idle', 0, x, y, flip, alpha);
    const w = d.w || a.img.naturalWidth, h = d.h || a.img.naturalHeight;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (skew) ctx.transform(1, 0, skew, 1, 0, 0);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(a.img, -w * (d.ax ?? 0.5), -h * (d.ay ?? 1), w, h);
    ctx.restore();
    return true;
  },
};
