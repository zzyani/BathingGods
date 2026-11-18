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
    }
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
  draw(ctx, key, x, y, flip = false, alpha = 1) {
    const a = this.imgs[key];
    if (!a || !a.img.complete || !a.img.naturalWidth) return false;
    const d = a.def;
    if (d.sheet) return this.drawAnim(ctx, key, 'idle', 0, x, y, flip, alpha);
    const w = d.w || a.img.naturalWidth, h = d.h || a.img.naturalHeight;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(a.img, -w * (d.ax ?? 0.5), -h * (d.ay ?? 1), w, h);
    ctx.restore();
    return true;
  },
};
