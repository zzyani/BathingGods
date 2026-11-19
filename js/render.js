'use strict';
/* =========================================================
 * 렌더링 — 쿼터뷰(아이소메트릭) 맵, 캐릭터, 오브젝트, 이펙트
 * 그래픽은 모두 캔버스 도형으로 그린 플레이스홀더입니다.
 * AI 제작 에셋은 data.js 의 ASSET_MANIFEST 에 등록하면 자동 교체됩니다.
 * ========================================================= */

const Render = (() => {
  const FONT = '"Gowun Dodum", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const SERIF = '"Gowun Batang", "Apple SD Gothic Neo", serif';
  const TW2 = TILE_W / 2, TH2 = TILE_H / 2;
  const sx = (x, y) => (x - y) * TW2;
  let S = SCENES.main; // 현재 그리는 장면
  const sy = (x, y) => (x + y) * TH2;

  /* ---------- 기본 도형 ---------- */
  function hash(i, j) {
    let h = (i * 374761393 + j * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
    ctx.closePath();
  }
  function rectPts(x, y, w, h, z = 0) {
    return [sx(x, y), sy(x, y) - z, sx(x + w, y), sy(x + w, y) - z,
      sx(x + w, y + h), sy(x + w, y + h) - z, sx(x, y + h), sy(x, y + h) - z];
  }
  function ell(ctx, x, y, rx, ry, color, rot = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  function circle(ctx, x, y, r, color) { ell(ctx, x, y, r, r, color); }
  function rrectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function rrect(ctx, x, y, w, h, r, color) { ctx.fillStyle = color; rrectPath(ctx, x, y, w, h, r); ctx.fill(); }
  function tri(ctx, x1, y1, x2, y2, x3, y3, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
  }
  function eyes(ctx, x, y, gap, r = 1.7, color = '#1b1512') {
    circle(ctx, x - gap, y, r, color);
    circle(ctx, x + gap, y, r, color);
  }
  // 아이소 박스: 윗면 + 보이는 두 옆면(+y 쪽 왼면, +x 쪽 오른면)
  function box(ctx, x, y, w, h, z, top, left, right, z0 = 0) {
    const ax = sx(x, y), ay = sy(x, y) - z0;
    const bx = sx(x + w, y), by = sy(x + w, y) - z0;
    const cx = sx(x + w, y + h), cy = sy(x + w, y + h) - z0;
    const dx = sx(x, y + h), dy = sy(x, y + h) - z0;
    if (left) { ctx.fillStyle = left; poly(ctx, [dx, dy, cx, cy, cx, cy - z, dx, dy - z]); ctx.fill(); }
    if (right) { ctx.fillStyle = right; poly(ctx, [cx, cy, bx, by, bx, by - z, cx, cy - z]); ctx.fill(); }
    if (top) { ctx.fillStyle = top; poly(ctx, [ax, ay - z, bx, by - z, cx, cy - z, dx, dy - z]); ctx.fill(); }
  }
  function text(ctx, str, x, y, size, color, opt = {}) {
    ctx.font = `${opt.bold ? 'bold ' : ''}${size}px ${opt.serif ? SERIF : FONT}`;
    ctx.textAlign = opt.align || 'center';
    ctx.textBaseline = opt.base || 'middle';
    if (opt.stroke) { ctx.lineWidth = opt.strokeW || 3; ctx.strokeStyle = opt.stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  /* ---------- 바닥 ---------- */
  const FLOOR = {
    '.': ['#8a5c3d', '#83573a'], D: ['#8a5c3d', '#83573a'], g: ['#4c7843', '#46703f'],
    s: ['#7c8991', '#75828a'], w: ['#6c4932', '#66442f'], b: ['#4a3b35', '#443630'], r: ['#b5a26b', '#ab9862'],
  };
  function floorTile(ctx, i, j, ch, t) {
    const pts = rectPts(i, j, 1, 1);
    if (ch === '~') {
      ctx.fillStyle = '#285f80'; poly(ctx, pts); ctx.fill();
      const ph = t * 1.3 + hash(i, j) * 6.28;
      ctx.strokeStyle = `rgba(180,225,255,${0.16 + 0.12 * Math.sin(ph)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(sx(i + 0.5, j + 0.5) + Math.sin(ph) * 4, sy(i + 0.5, j + 0.5), 9 + 3 * Math.sin(ph * 0.7), 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    const c = FLOOR[ch] || FLOOR['.'];
    ctx.fillStyle = c[(i + j) & 1]; poly(ctx, pts); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 1; ctx.stroke();
    if (ch === '.' || ch === 'w' || ch === 'D') {
      ctx.strokeStyle = 'rgba(40,20,10,0.2)';
      ctx.beginPath();
      for (const f of [0.34, 0.67]) { ctx.moveTo(sx(i, j + f), sy(i, j + f)); ctx.lineTo(sx(i + 1, j + f), sy(i + 1, j + f)); }
      ctx.stroke();
    } else if (ch === 'r') {
      ctx.strokeStyle = 'rgba(80,65,20,0.35)';
      poly(ctx, rectPts(i + 0.07, j + 0.07, 0.86, 0.86)); ctx.stroke();
    } else if (ch === 'g') {
      ctx.strokeStyle = 'rgba(30,60,25,0.55)';
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const fx = i + 0.2 + hash(i * 3 + k, j) * 0.6, fy = j + 0.2 + hash(i, j * 3 + k) * 0.6;
        const px = sx(fx, fy), py = sy(fx, fy);
        ctx.moveTo(px - 2, py); ctx.lineTo(px, py - 4); ctx.lineTo(px + 2, py);
      }
      ctx.stroke();
    } else if (ch === 's' && hash(i, j) > 0.6) {
      ctx.strokeStyle = 'rgba(40,50,60,0.25)';
      ctx.beginPath(); ctx.moveTo(sx(i + 0.3, j + 0.2), sy(i + 0.3, j + 0.2)); ctx.lineTo(sx(i + 0.55, j + 0.6), sy(i + 0.55, j + 0.6)); ctx.stroke();
    }
  }

  function pondDecor(ctx, t) {
    // 연못 가장자리 돌
    for (const [x, y] of [[2, 2], [5, 2], [2, 4], [5, 4], [3.5, 4], [3.5, 2], [2, 3], [5, 3]]) {
      ell(ctx, sx(x, y), sy(x, y), 7, 4, '#6f746f');
    }
    // 연잎과 연꽃
    const pads = [[2.5, 2.6, 1], [3.7, 3.3, 0], [4.3, 2.5, 1], [2.9, 3.6, 0], [3.3, 2.3, 0]];
    for (const [x, y, flower] of pads) {
      const bob = Math.sin(t * 1.4 + x * 2) * 1.2;
      const px = sx(x, y), py = sy(x, y) + bob;
      ell(ctx, px, py, 8, 4, '#4f8a3f');
      ctx.strokeStyle = '#3c6e30'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 7, py - 1); ctx.stroke();
      if (flower) {
        for (let k = 0; k < 5; k++) ell(ctx, px + Math.cos(k * 1.26) * 3, py - 3 + Math.sin(k * 1.26) * 1.5, 2.6, 4, '#ee9bbd', k * 1.26);
        circle(ctx, px, py - 3.5, 1.6, '#f6d36a');
      }
    }
    // 창포(갈대)
    for (const [x, y] of [[2.15, 2.15], [4.8, 3.85], [4.75, 2.2]]) {
      const px = sx(x, y), py = sy(x, y);
      ctx.strokeStyle = '#4c7a3a'; ctx.lineWidth = 1.6;
      for (let k = -2; k <= 2; k++) {
        const sw = Math.sin(t * 2 + k) * 1.5;
        ctx.beginPath(); ctx.moveTo(px + k * 2, py); ctx.quadraticCurveTo(px + k * 2.5, py - 10, px + k * 3 + sw, py - 20); ctx.stroke();
      }
      ell(ctx, px + 2, py - 20, 2, 3.5, '#7b5bb5');
      ctx.lineWidth = 1;
    }
  }

  function floorDecor(ctx, w, t, hover) {
    // 구역 이름
    for (const L of S.labels) {
      text(ctx, L.text, sx(L.x, L.y), sy(L.x, L.y), 15, 'rgba(255,240,210,0.26)', { bold: true, serif: true });
    }
    // 대기석 방석
    if (S === SCENES.main) for (const [x, y] of QUEUE_SPOTS) {
      ctx.fillStyle = 'rgba(122,46,42,0.75)';
      poly(ctx, rectPts(x - 0.3, y - 0.3, 0.6, 0.6)); ctx.fill();
      ctx.strokeStyle = 'rgba(240,200,120,0.4)'; ctx.stroke();
    }
    // 마우스 오버 하이라이트
    if (hover) {
      const a = 0.55 + 0.35 * Math.sin(t * 6);
      ctx.strokeStyle = `rgba(255,214,120,${a})`;
      ctx.lineWidth = 2.5;
      if (hover.char) {
        const g = hover.ref;
        ctx.beginPath(); ctx.ellipse(sx(g.x, g.y), sy(g.x, g.y), 16, 7, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (hover.rect) {
        const r = hover.rect;
        poly(ctx, rectPts(r.x - 0.05, r.y - 0.05, r.w + 0.1, r.h + 0.1)); ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
  }

  /* ---------- 벽 · 등롱 · 정문 ---------- */
  function isWall(i, j) { return i >= 0 && j >= 0 && i < S.w && j < S.h && S.rows[j][i] === '#'; }
  function wallHeight(i, j) {
    if (i === S.w - 1 || j === S.h - 1) return 14;
    if (i === 0 || j === 0) return 74;
    return 46;
  }
  function face(ctx, P1, P2, h, wood, plaster) {
    const band = (za, zb, col) => {
      ctx.fillStyle = col;
      poly(ctx, [P1[0], P1[1] - za, P2[0], P2[1] - za, P2[0], P2[1] - zb, P1[0], P1[1] - zb]);
      ctx.fill();
    };
    band(0, h, wood);
    if (h > 30) {
      band(h * 0.3, h * 0.86, plaster);
      ctx.strokeStyle = 'rgba(70,35,22,0.6)'; ctx.lineWidth = 2;
      const mx = (P1[0] + P2[0]) / 2, my = (P1[1] + P2[1]) / 2;
      ctx.beginPath(); ctx.moveTo(mx, my - h * 0.3); ctx.lineTo(mx, my - h * 0.86); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
  function wall(ctx, i, j, alpha) {
    const h = wallHeight(i, j);
    ctx.globalAlpha = alpha;
    const D = [sx(i, j + 1), sy(i, j + 1)], C = [sx(i + 1, j + 1), sy(i + 1, j + 1)], B = [sx(i + 1, j), sy(i + 1, j)];
    if (!(isWall(i, j + 1) && wallHeight(i, j + 1) >= h)) face(ctx, D, C, h, '#5a3224', '#e2d3b5');
    if (!(isWall(i + 1, j) && wallHeight(i + 1, j) >= h)) face(ctx, C, B, h, '#6b3c2b', '#eee0c5');
    ctx.fillStyle = '#2e211b'; poly(ctx, rectPts(i, j, 1, 1, h)); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function lantern(ctx, L, t) {
    const x = sx(L.x, L.y), y = sy(L.x, L.y) - 50;
    const sw = Math.sin(t * 1.5 + L.x) * 1;
    ctx.strokeStyle = '#2a1a12'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + sw, y - 8); ctx.stroke();
    ell(ctx, x + sw, y, 7, 9, '#d8452f');
    ell(ctx, x + sw, y, 4, 7, 'rgba(255,190,110,0.55)');
    ctx.fillStyle = '#2a1a12'; ctx.fillRect(x + sw - 4, y - 10, 8, 2.5); ctx.fillRect(x + sw - 4, y + 8, 8, 2.5);
  }
  // 문(기둥 + 노렌). orient 'y': 벽이 y축을 따라 이어짐(정문), 'x': 벽이 x축을 따라 이어짐(구역 이동 문)
  function door(ctx, t, dx = DOOR.x, dy = DOOR.y, orient = 'y', label = '湯', cloth = '#8e2a22') {
    const a = orient === 'y' ? [dx + 0.55, dy + 0.02] : [dx + 0.02, dy + 0.55];
    const b = orient === 'y' ? [dx + 0.55, dy + 0.98] : [dx + 0.98, dy + 0.55];
    const x1 = sx(a[0], a[1]), y1 = sy(a[0], a[1]);
    const x2 = sx(b[0], b[1]), y2 = sy(b[0], b[1]);
    const H = 62;
    ctx.fillStyle = '#3a221a';
    ctx.fillRect(x1 - 2.5, y1 - H, 5, H);
    ctx.fillRect(x2 - 2.5, y2 - H, 5, H);
    ctx.strokeStyle = '#3a221a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x1 - 6, y1 - H - 3); ctx.lineTo(x2 + 6, y2 - H - 3); ctx.stroke();
    ctx.lineWidth = 1;
    // 노렌(천)
    const wave = Math.sin(t * 1.8) * 1.5;
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(x1, y1 - H); ctx.lineTo(x2, y2 - H);
    ctx.lineTo(x2 + wave, y2 - H + 26); ctx.lineTo(x1 + wave, y1 - H + 26);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.moveTo((x1 + x2) / 2, (y1 + y2) / 2 - H); ctx.lineTo((x1 + x2) / 2 + wave, (y1 + y2) / 2 - H + 26); ctx.stroke();
    const fs = label.length > 2 ? 9 : label.length > 1 ? 11 : 13;
    text(ctx, label, (x1 + x2) / 2 + wave * 0.5, (y1 + y2) / 2 - H + 13, fs, '#f5e6c8', { bold: true, serif: true });
  }

  /* ---------- 오브젝트 ---------- */
  const COOL = [79, 159, 209], HOT = [226, 138, 76];
  function waterColor(o) {
    const k = Util.clamp((o.temp - 34) / 14, 0, 1);
    let c = Util.mixRgb(COOL, HOT, k);
    for (const h of o.herbs) c = Util.mixRgb(c, Util.hexToRgb(HERBS[h].color), 0.28);
    return Util.rgb(c);
  }
  function tub(ctx, o, t) {
    const z = 16;
    box(ctx, o.x, o.y, o.w, o.h, z, '#c99a66', '#9a6a3f', '#b07d4f');
    // 나무 테 줄무늬
    ctx.strokeStyle = 'rgba(80,45,20,0.35)';
    for (const f of [0.35, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(sx(o.x, o.y + o.h), sy(o.x, o.y + o.h) - z * f);
      ctx.lineTo(sx(o.x + o.w, o.y + o.h), sy(o.x + o.w, o.y + o.h) - z * f);
      ctx.lineTo(sx(o.x + o.w, o.y), sy(o.x + o.w, o.y) - z * f);
      ctx.stroke();
    }
    const ix = o.x + 0.16, iy = o.y + 0.16, iw = o.w - 0.32, ih = o.h - 0.32;
    ctx.fillStyle = '#6a4224'; poly(ctx, rectPts(ix, iy, iw, ih, z)); ctx.fill();
    let water = null;
    if (o.state === 'ready' || o.state === 'occupied') water = waterColor(o);
    else if (o.state === 'dirty') water = '#6d5d3c';
    if (water) {
      ctx.fillStyle = water; poly(ctx, rectPts(ix + 0.05, iy + 0.05, iw - 0.05, ih - 0.05, z - 3)); ctx.fill();
      const cx = sx(o.x + o.w / 2, o.y + o.h / 2), cy = sy(o.x + o.w / 2, o.y + o.h / 2) - z + 3;
      ctx.strokeStyle = o.state === 'dirty' ? 'rgba(210,190,140,0.5)' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) {
        const ph = t * 1.5 + k * 2;
        ctx.beginPath(); ctx.ellipse(cx + Math.sin(ph) * 10, cy + k * 6 - 3, 12 + k * 4, 3, 0, 0, Math.PI); ctx.stroke();
      }
      ctx.lineWidth = 1;
      if (o.state === 'dirty') {
        for (let k = 0; k < 7; k++) circle(ctx, cx - 22 + hash(k, 3) * 44, cy - 8 + hash(3, k) * 16, 1.5 + hash(k, k) * 2, 'rgba(235,225,200,0.6)');
      }
    } else {
      ctx.fillStyle = '#8a5f3a'; poly(ctx, rectPts(ix + 0.05, iy + 0.05, iw - 0.05, ih - 0.05, z - 7)); ctx.fill();
    }
    if (o.state === 'occupied' && o.guest && o.guest.state === 'bathing') {
      const cx = sx(o.x + o.w / 2, o.y + o.h / 2), cy = sy(o.x + o.w / 2, o.y + o.h / 2) - (z - 3);
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - 50, cy - 100, 100, 100); ctx.clip();
      drawChar(ctx, o.guest, cx, cy + guestBathY(o.guest), t, { bath: true });
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(cx, cy, 15 + Math.sin(t * 3) * 1.5, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,232,190,0.4)';
    poly(ctx, rectPts(o.x, o.y, o.w, o.h, z)); ctx.stroke();
  }
  function tree(ctx, o, t) {
    const cx = sx(o.x + 0.5, o.y + 0.5), cy = sy(o.x + 0.5, o.y + 0.5);
    ell(ctx, cx, cy, 24, 10, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = '#5b3a24'; ctx.fillRect(cx - 4, cy - 36, 8, 36);
    const sw = Math.sin(t * 1.2) * 1.5;
    ell(ctx, cx - 13 + sw, cy - 46, 17, 15, '#3d6b38');
    ell(ctx, cx + 13 + sw, cy - 48, 16, 14, '#487c41');
    ell(ctx, cx + sw, cy - 62, 19, 16, '#55904b');
    for (let k = 0; k < 7; k++) {
      circle(ctx, cx - 20 + hash(k, 1) * 40 + sw, cy - 70 + hash(1, k) * 34, 3.2, '#f2c230');
    }
  }
  function patch(ctx, o, t) {
    box(ctx, o.x + 0.05, o.y + 0.08, o.w - 0.1, o.h - 0.16, 5, '#5b4231', '#4a3426', '#553c2c');
    for (let k = 0; k < 12; k++) {
      const fx = o.x + 0.15 + hash(k, 7) * (o.w - 0.3), fy = o.y + 0.2 + hash(7, k) * (o.h - 0.4);
      const px = sx(fx, fy), py = sy(fx, fy) - 5;
      const sw = Math.sin(t * 2 + k) * 1.5;
      ctx.fillStyle = k % 2 ? '#7da453' : '#5f8a3c';
      ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.quadraticCurveTo(px - 4 + sw, py - 8, px + sw, py - 13); ctx.quadraticCurveTo(px + 3 + sw, py - 7, px + 3, py); ctx.fill();
      // 꽃밭이면 꽃송이
      if (o.flower && k % 2 === 0) {
        for (let q = 0; q < 5; q++) ell(ctx, px + sw + Math.cos(q * 1.26) * 2.6, py - 14 + Math.sin(q * 1.26) * 1.6, 2, 2.6, o.flower, q * 1.26);
        circle(ctx, px + sw, py - 14, 1.3, '#7a4a12');
      }
    }
  }
  // 소나무 (솔잎)
  function pine(ctx, o, t) {
    const cx = sx(o.x + 0.5, o.y + 0.5), cy = sy(o.x + 0.5, o.y + 0.5);
    ell(ctx, cx, cy, 22, 9, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = '#5a3a26'; ctx.fillRect(cx - 4, cy - 30, 8, 30);
    const sw = Math.sin(t * 1.1) * 1.2;
    const layers = [[-30, 24, '#24563a'], [-50, 20, '#2b6343'], [-68, 15, '#33704c'], [-82, 10, '#3c7d55']];
    for (const [y, r, c] of layers) tri(ctx, cx - r + sw, cy + y + 10, cx + sw * 1.5, cy + y - 16, cx + r + sw, cy + y + 10, c);
    for (let k = 0; k < 5; k++) circle(ctx, cx - 14 + hash(k, 4) * 28 + sw, cy - 70 + hash(4, k) * 44, 1.6, 'rgba(200,230,190,0.45)');
  }
  // 대추 항아리
  function jar(ctx, o) {
    const n = Math.max(1, Math.round(o.w * o.h * 1.5));
    for (let k = 0; k < n; k++) {
      const fx = o.x + (o.w * (k + 0.5)) / n, fy = o.y + o.h * 0.5 + (k % 2 ? 0.12 : -0.12);
      const cx = sx(fx, fy), cy = sy(fx, fy);
      ell(ctx, cx, cy, 11, 5, 'rgba(0,0,0,0.25)');
      ell(ctx, cx, cy - 13, 11, 14, '#8a5a3a');
      ell(ctx, cx - 3, cy - 16, 3, 7, 'rgba(255,220,180,0.18)');
      rrect(ctx, cx - 7, cy - 30, 14, 5, 2, '#6e432a');
      ell(ctx, cx, cy - 30, 7, 2.6, '#4a2c1a');
      for (let q = 0; q < 4; q++) circle(ctx, cx - 4 + q * 2.6, cy - 31 + (q % 2) * 1.2, 1.7, o.herbs ? HERBS[o.herbs[0]].color : '#9b2d2d');
    }
  }
  // 생강 바구니
  function basket(ctx, o) {
    const cx = sx(o.x + 0.5, o.y + 0.5), cy = sy(o.x + 0.5, o.y + 0.5);
    ell(ctx, cx, cy, 16, 7, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = '#b08a52';
    ctx.beginPath(); ctx.moveTo(cx - 17, cy - 16); ctx.lineTo(cx + 17, cy - 16); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx - 12, cy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,30,0.6)';
    for (const yy of [-12, -7, -3]) { ctx.beginPath(); ctx.moveTo(cx - 15, cy + yy); ctx.lineTo(cx + 15, cy + yy); ctx.stroke(); }
    ell(ctx, cx, cy - 16, 17, 5, '#8e6a3a');
    const col = o.herbs ? HERBS[o.herbs[0]].color : '#d98c3a';
    for (let k = 0; k < 5; k++) ell(ctx, cx - 9 + k * 4.5, cy - 18 - (k % 2) * 2, 4, 2.6, col, 0.4 * (k % 2 ? 1 : -1));
  }
  function jarsOnFace(ctx, P1, P2, levels, colors, seed) {
    let n = 0;
    for (const z of levels) {
      for (let u = 0.2; u < 0.9; u += 0.22) {
        const x = P1[0] + (P2[0] - P1[0]) * u, y = P1[1] + (P2[1] - P1[1]) * u - z;
        const col = colors[(n + seed) % colors.length];
        rrect(ctx, x - 3, y - 8, 6, 8, 2, col);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 2, y - 7, 1.5, 5);
        n++;
      }
    }
  }
  function shelf(ctx, o) {
    const z = 62;
    box(ctx, o.x, o.y, o.w, o.h, z, '#3d281b', '#5e3e28', '#6d4a31');
    const D = [sx(o.x, o.y + o.h), sy(o.x, o.y + o.h)], C = [sx(o.x + o.w, o.y + o.h), sy(o.x + o.w, o.y + o.h)], B = [sx(o.x + o.w, o.y), sy(o.x + o.w, o.y)];
    ctx.strokeStyle = 'rgba(30,15,8,0.7)'; ctx.lineWidth = 2;
    for (const zz of [4, 22, 40]) {
      ctx.beginPath(); ctx.moveTo(D[0], D[1] - zz); ctx.lineTo(C[0], C[1] - zz); ctx.lineTo(B[0], B[1] - zz); ctx.stroke();
    }
    ctx.lineWidth = 1;
    const cols = o.herbs.map(h => HERBS[h].color).concat(['#c9b48a', '#8a6a4a']);
    jarsOnFace(ctx, D, C, [5, 23, 41], cols, 0);
    jarsOnFace(ctx, C, B, [5, 23, 41], cols, 1);
  }
  function crate(ctx, o) {
    box(ctx, o.x + 0.1, o.y + 0.1, 0.8, 0.8, 18, '#c9a46a', '#94703f', '#a98150');
    const cx = sx(o.x + 0.5, o.y + 0.5), cy = sy(o.x + 0.5, o.y + 0.5) - 18;
    ell(ctx, cx, cy, 14, 6, '#d8cb52');
    ell(ctx, cx - 2, cy - 2, 8, 3.5, '#efe37a');
  }
  function furnace(ctx, o, t) {
    box(ctx, o.x + 0.05, o.y + 0.05, o.w - 0.1, o.h - 0.1, 46, '#3b3439', '#252129', '#2f2a33');
    // 굴뚝
    box(ctx, o.x + 0.6, o.y + 0.5, 0.5, 0.5, 52, '#2b262d', '#1c181f', '#232027', 46);
    // 불구멍 (오른면)
    const C = [sx(o.x + o.w - 0.05, o.y + o.h - 0.05), sy(o.x + o.w - 0.05, o.y + o.h - 0.05)];
    const B = [sx(o.x + o.w - 0.05, o.y + 0.05), sy(o.x + o.w - 0.05, o.y + 0.05)];
    const P = u => [C[0] + (B[0] - C[0]) * u, C[1] + (B[1] - C[1]) * u];
    const a = P(0.3), b = P(0.7);
    const fuel = o.fuelRatio ?? 1;
    const fl = (0.75 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7) * 0.1) * (fuel > 0 ? 0.45 + 0.55 * fuel : 0.2);
    ctx.fillStyle = `rgba(255,${120 + fl * 60 | 0},40,${fl})`;
    poly(ctx, [a[0], a[1] - 6, b[0], b[1] - 6, b[0], b[1] - 24, a[0], a[1] - 24]); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,140,0.7)';
    poly(ctx, [a[0] + 3, a[1] - 8, b[0] - 3, b[1] - 8, b[0] - 3, b[1] - 14, a[0] + 3, a[1] - 14]); ctx.fill();
  }
  function counter(ctx, o) {
    box(ctx, o.x, o.y + 0.1, o.w, o.h - 0.2, 28, '#8f2c22', '#5e3a26', '#6e4530');
    const bx = sx(o.x + 2.6, o.y + 0.5), by = sy(o.x + 2.6, o.y + 0.5) - 28;
    ell(ctx, bx, by - 4, 5, 5, '#d4a53c'); ctx.fillStyle = '#7a5a20'; ctx.fillRect(bx - 1, by - 11, 2, 3);
    const lx = sx(o.x + 0.8, o.y + 0.5), ly = sy(o.x + 0.8, o.y + 0.5) - 28;
    ctx.fillStyle = '#f2e7cf'; poly(ctx, rectPts(o.x + 0.5, o.y + 0.3, 0.6, 0.4, 29)); ctx.fill();
    ctx.strokeStyle = '#6a4a2a'; ctx.beginPath(); ctx.moveTo(lx - 6, ly); ctx.lineTo(lx + 6, ly); ctx.stroke();
  }
  function drawObject(ctx, o, t) {
    if (o.kind !== 'tub' && o.kind !== 'pond') {
      if (Assets.draw(ctx, o.kind, sx(o.x + o.w / 2, o.y + o.h / 2), sy(o.x + o.w / 2, o.y + o.h / 2))) return;
    }
    switch (o.kind) {
      case 'tub': tub(ctx, o, t); break;
      case 'tree': tree(ctx, o, t); break;
      case 'patch': patch(ctx, o, t); break;
      case 'pine': pine(ctx, o, t); break;
      case 'jar': jar(ctx, o); break;
      case 'basket': basket(ctx, o); break;
      case 'shelf': shelf(ctx, o); break;
      case 'crate': crate(ctx, o); break;
      case 'furnace': furnace(ctx, o, t); break;
      case 'counter': counter(ctx, o); break;
    }
  }

  /* ---------- 캐릭터 ---------- */
  function chihiro(ctx, x, y, t, moving, faceDir, alpha = 1, busy = false, walkDist = 0) {
    const ca = Assets.imgs.chihiro;
    if (ca && ca.def.sheet && ca.img.complete && ca.img.naturalWidth) {
      ell(ctx, x, y, 12, 4.5, `rgba(0,0,0,${0.28 * alpha})`);
      const anim = busy ? 'kneel' : moving ? 'walk' : 'idle';
      Assets.drawAnim(ctx, 'chihiro', anim, anim === 'walk' ? walkDist : t, x, y, faceDir < 0, alpha);
      return;
    }
    if (Assets.draw(ctx, 'chihiro', x, y, faceDir < 0, alpha)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= alpha;
    ell(ctx, 0, 0, 11, 4.5, 'rgba(0,0,0,0.28)');
    ctx.scale(faceDir, 1);
    const ph = t * 11;
    const bob = moving ? Math.abs(Math.sin(ph)) * 1.6 : Math.sin(t * 2.2) * 0.4;
    const st = moving ? Math.sin(ph) * 2.6 : 0;
    ctx.fillStyle = '#6d3434';
    ctx.fillRect(-5 + st * 0.4, -12, 4, 11); ctx.fillRect(1 - st * 0.4, -12, 4, 11);
    ctx.fillStyle = '#2b1d18';
    ctx.fillRect(-5.5 + st * 0.4, -2, 5, 2.5); ctx.fillRect(0.5 - st * 0.4, -2, 5, 2.5);
    ctx.translate(0, -bob);
    ell(ctx, -8.5, -34, 3.4, 7.5, '#3a271d', 0.5 + (moving ? Math.sin(ph) * 0.18 : 0));
    rrect(ctx, -8, -27, 16, 16, 5, '#d8735f');
    ctx.fillStyle = '#f1dfbd'; ctx.fillRect(-8, -18, 16, 3);
    ctx.strokeStyle = '#f6ead2'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-3, -27); ctx.lineTo(1, -21.5); ctx.lineTo(4.5, -27); ctx.stroke();
    ctx.lineWidth = 1;
    ell(ctx, -8.5, -21 - st * 0.3, 3, 6, '#c9634f', 0.2);
    ell(ctx, 8.5, -21 + st * 0.3, 3, 6, '#c9634f', -0.2);
    ell(ctx, 0, -34, 8, 8.5, '#f4d3b6');
    ctx.fillStyle = '#3a271d';
    ctx.beginPath(); ctx.ellipse(0, -36.5, 8.7, 7, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8.6, -37); ctx.quadraticCurveTo(-9.2, -30, -7, -27.5); ctx.lineTo(-5, -36); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, -38); ctx.lineTo(8, -38); ctx.lineTo(7, -34); ctx.lineTo(3, -36); ctx.lineTo(0, -33.5); ctx.lineTo(-3.5, -36); ctx.closePath(); ctx.fill();
    circle(ctx, -6.8, -39, 1.9, '#e04848');
    ctx.fillStyle = '#2a1a14'; ctx.fillRect(1.6, -33, 1.6, 2.6); ctx.fillRect(5.2, -33, 1.6, 2.6);
    ell(ctx, 6, -29.8, 1.8, 1, 'rgba(230,120,110,0.55)');
    ctx.restore();
  }

  function spirit(ctx, type, x, y, t, o = {}) {
    const f = o.face || 1, alpha = o.alpha ?? 1;
    if (specialSprite(ctx, type, x, y, t, alpha, o)) return;   // 스프라이트 시트가 있으면 그것으로
    if (Assets.draw(ctx, type, x, y, f < 0, alpha)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= alpha;
    if (!o.bath) ell(ctx, 0, 0, 12, 4.5, 'rgba(0,0,0,0.25)');
    ctx.scale(f, 1);
    const bob = o.moving ? Math.abs(Math.sin(t * 9)) * 2 : Math.sin(t * 2 + (o.seed || 0)) * 0.8;
    ctx.translate(0, -bob);
    switch (type) {
      case 'moss': {
        ell(ctx, 0, -14, 15, 14, '#5f8446');
        ell(ctx, -6, -25, 7, 4.5, '#8fb35f'); ell(ctx, 5, -27, 7.5, 4.5, '#a3c271');
        ell(ctx, 11, -20, 4, 3.5, '#86ab58'); ell(ctx, -12, -16, 3.5, 3, '#86ab58');
        eyes(ctx, 3, -17, 4.2);
        ctx.strokeStyle = '#eceedd'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-3.5, -21.5); ctx.lineTo(0.5, -20.5); ctx.moveTo(5.5, -20.5); ctx.lineTo(9.5, -21.5); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = '#efeee4';
        ctx.beginPath(); ctx.moveTo(-4, -12.5); ctx.quadraticCurveTo(3, -10, 10, -12.5); ctx.quadraticCurveTo(7, -3, 2.5, -1); ctx.quadraticCurveTo(-2, -5, -4, -12.5); ctx.fill();
        break;
      }
      case 'lantern': {
        const fl = 0.85 + Math.sin(t * 12) * 0.08 + Math.sin(t * 7.3) * 0.05;
        ctx.fillStyle = '#3a2418'; ctx.fillRect(-6, -6, 3, 6); ctx.fillRect(3, -6, 3, 6);
        rrect(ctx, -12, -35, 24, 30, 9, '#f3c75e');
        ell(ctx, 0, -20, 8, 10, `rgba(255,244,180,${0.5 * fl})`);
        ctx.strokeStyle = 'rgba(170,100,30,0.6)';
        for (const yy of [-29, -23, -17, -11]) { ctx.beginPath(); ctx.moveTo(-11.5, yy); ctx.quadraticCurveTo(0, yy + 2, 11.5, yy); ctx.stroke(); }
        rrect(ctx, -8, -39, 16, 5, 2, '#b3322a'); rrect(ctx, -8, -7, 16, 5, 2, '#b3322a');
        ctx.strokeStyle = '#4a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -41, 4, Math.PI, 0); ctx.stroke(); ctx.lineWidth = 1;
        eyes(ctx, 3, -23, 4.5, 2.1);
        ctx.fillStyle = '#d9473e'; ctx.beginPath(); ctx.ellipse(4, -15, 3, 4, 0, 0, Math.PI); ctx.fill();
        break;
      }
      case 'river': {
        ctx.fillStyle = 'rgba(80,150,210,0.9)';
        ctx.beginPath(); ctx.moveTo(0, -38);
        ctx.bezierCurveTo(6, -28, 16, -18, 14, -9); ctx.bezierCurveTo(12, -1, -12, -1, -14, -9); ctx.bezierCurveTo(-16, -18, -6, -28, 0, -38);
        ctx.fill();
        ell(ctx, -5, -20, 3, 6, 'rgba(255,255,255,0.35)');
        ctx.strokeStyle = 'rgba(225,245,255,0.85)'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) { const xx = -11 + k * 2.75, yy = -7 + Math.sin(t * 4 + k) * 1.4; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
        ctx.stroke(); ctx.lineWidth = 1;
        eyes(ctx, 3, -17, 4, 1.8, '#0f2a44');
        ctx.strokeStyle = '#0f2a44'; ctx.beginPath(); ctx.arc(3, -14, 2.2, 0.2, Math.PI - 0.2); ctx.stroke();
        break;
      }
      case 'mushroom': {
        ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, -14); ctx.lineTo(14, 0); ctx.stroke(); ctx.lineWidth = 1;
        ell(ctx, 0, -10, 9, 10, '#f0e2c4');
        eyes(ctx, 2.5, -11, 3.2, 1.5);
        ell(ctx, -2, -8, 1.8, 1, 'rgba(230,120,110,0.5)'); ell(ctx, 7, -8, 1.8, 1, 'rgba(230,120,110,0.5)');
        ctx.fillStyle = '#c4433d';
        ctx.beginPath(); ctx.ellipse(0, -19, 17, 13, 0, Math.PI, 0); ctx.quadraticCurveTo(0, -14, -17, -19); ctx.fill();
        circle(ctx, -8, -24, 2.6, '#fbf3e3'); circle(ctx, 2, -28, 3, '#fbf3e3'); circle(ctx, 10, -22, 2.2, '#fbf3e3'); circle(ctx, -1, -21, 1.6, '#fbf3e3');
        break;
      }
      case 'fox': {
        const sw = Math.sin(t * 5) * 0.15;
        ctx.save(); ctx.translate(-8, -9); ctx.rotate(-0.7 + sw);
        ell(ctx, -7, 0, 10, 5, '#f29a45'); ell(ctx, -14, 0, 4.5, 3.6, '#ffe2b0');
        ell(ctx, -18, -1, 2.5, 2, `rgba(255,170,60,${0.6 + Math.sin(t * 10) * 0.3})`);
        ctx.restore();
        ell(ctx, 0, -12, 10, 11, '#e8813a');
        ell(ctx, 1, -8, 5.5, 6, '#fff1df');
        ell(ctx, 1, -26, 10, 8.5, '#e8813a');
        tri(ctx, -8, -30, -9, -41, -1, -33, '#e8813a'); tri(ctx, 4, -33, 9, -42, 10, -29, '#e8813a');
        tri(ctx, -7, -31, -8, -38, -3, -33, '#7a3a1a'); tri(ctx, 5, -33, 8.5, -39, 9, -31, '#7a3a1a');
        ell(ctx, 5.5, -23, 5, 3.5, '#fff1df');
        circle(ctx, 10, -23.5, 1.4, '#1b1512');
        ctx.strokeStyle = '#1b1512'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, -27, 1.8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(6, -27, 1.8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.lineWidth = 1;
        break;
      }
      case 'turtle': {
        ell(ctx, -9, -3, 4, 3, '#7d837f'); ell(ctx, 8, -3, 4, 3, '#7d837f');
        ell(ctx, 13, -12, 6, 5.5, '#8a908c'); circle(ctx, 15.5, -13.5, 1.5, '#1b1512');
        ell(ctx, -1, -11, 15, 9, '#4d5947');
        ctx.fillStyle = '#6b7a5f'; ctx.beginPath(); ctx.ellipse(-1, -13, 13.5, 11, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#43503d'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-2, -20); ctx.lineTo(4, -20); ctx.lineTo(7, -14); ctx.lineTo(-6, -14);
        ctx.moveTo(-2, -20); ctx.lineTo(-4, -24); ctx.moveTo(4, -20); ctx.lineTo(5, -23.5);
        ctx.moveTo(-6, -14); ctx.lineTo(-12, -14); ctx.moveTo(7, -14); ctx.lineTo(12, -14); ctx.stroke();
        ctx.lineWidth = 1;
        ell(ctx, -3, -23.5, 5, 1.8, '#8fb35f');
        break;
      }
      case 'rabbit': {
        for (const [ex, rot] of [[-3, -0.15], [4, 0.2 + Math.sin(t * 3) * 0.1]]) {
          ctx.save(); ctx.translate(ex, -33); ctx.rotate(rot);
          ell(ctx, 0, -8, 3, 9, '#f6f3ee'); ell(ctx, 0, -8, 1.5, 6.5, '#f1a3b6');
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ell(ctx, 0, -12, 11, 11.5, '#f6f3ee'); ctx.stroke();
        ell(ctx, 1, -26, 9, 8, '#f6f3ee'); ctx.stroke();
        circle(ctx, -1, -27, 1.6, '#b8323a'); circle(ctx, 5, -27, 1.6, '#b8323a');
        ell(ctx, 7, -24, 1.8, 1, 'rgba(240,140,160,0.7)');
        ell(ctx, 6, -10, 3, 2.5, '#efe9df');
        break;
      }
      case 'frog': {
        ell(ctx, 0, -10, 15, 10.5, '#5a9a55'); ell(ctx, 1, -7, 9, 6, '#cfe4a4');
        ell(ctx, -5, -20, 5, 5, '#5a9a55'); ell(ctx, 6, -20, 5, 5, '#5a9a55');
        circle(ctx, -5, -21, 3, '#fff'); circle(ctx, 6, -21, 3, '#fff');
        circle(ctx, -4.3, -21, 1.6, '#1b1512'); circle(ctx, 6.7, -21, 1.6, '#1b1512');
        ctx.strokeStyle = '#2d5a2a'; ctx.beginPath(); ctx.arc(1, -14, 6, 0.3, Math.PI - 0.3); ctx.stroke();
        for (let k = 0; k < 5; k++) ell(ctx, 1 + Math.cos(k * 1.26) * 3.4, -27 + Math.sin(k * 1.26) * 1.4, 2.6, 4.2, '#ee9bbd', k * 1.26);
        circle(ctx, 1, -27.5, 1.6, '#f6d36a');
        break;
      }
      case 'butterfly': {
        // 날개 (펄럭임)
        const flap = 0.7 + 0.3 * Math.cos(t * 10);
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(0, -22); ctx.scale(side * flap, 1);
          ell(ctx, 9, -6, 10, 8, '#f0a92e', -0.5);
          ell(ctx, 7, 5, 7, 6, '#e0782a', 0.5);
          circle(ctx, 12, -9, 2.2, '#3a2414'); circle(ctx, 8, 6, 1.6, '#3a2414');
          ctx.strokeStyle = 'rgba(58,36,20,0.7)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(9, -6, 10, 8, -0.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
          ctx.restore();
        }
        ell(ctx, 0, -14, 4, 11, '#3a2a20');
        circle(ctx, 0, -28, 6, '#f6e3c8');
        ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.ellipse(0, -30, 6.4, 4.5, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-2, -33); ctx.quadraticCurveTo(-5, -40, -8, -41); ctx.moveTo(2, -33); ctx.quadraticCurveTo(5, -40, 8, -41); ctx.stroke();
        ctx.lineWidth = 1;
        circle(ctx, -8, -41, 1.5, '#f0a92e'); circle(ctx, 8, -41, 1.5, '#f0a92e');
        eyes(ctx, 1.5, -27, 2.4, 1.2);
        ell(ctx, 4.5, -25, 1.4, 0.8, 'rgba(240,140,120,0.6)');
        break;
      }
      case 'crane': {
        ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-2, -11); ctx.moveTo(3, 0); ctx.lineTo(2, -11); ctx.stroke();
        ctx.lineWidth = 1;
        ell(ctx, -12, -15, 6, 3, '#2a2a2a', -0.4);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ell(ctx, -2, -17, 12, 8, '#f4f2ec'); ctx.stroke();
        ctx.strokeStyle = '#c9c6bd'; ctx.beginPath(); ctx.moveTo(-10, -18); ctx.quadraticCurveTo(-2, -12, 6, -17); ctx.stroke();
        ctx.strokeStyle = '#f4f2ec'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(6, -20); ctx.quadraticCurveTo(10, -28, 7, -35); ctx.stroke();
        ctx.lineWidth = 1; ctx.lineCap = 'butt';
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(6.5, -31, 2.5, 5);
        circle(ctx, 8, -37, 4.6, '#f4f2ec');
        circle(ctx, 7.5, -41, 2.2, '#d8352b');
        tri(ctx, 11, -38.5, 19, -36, 11, -35, '#d7b24a');
        circle(ctx, 9.6, -37.5, 1, '#111');
        break;
      }
      case 'dokkaebi': {
        // 방망이
        ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(9, -9); ctx.lineTo(16, -24); ctx.stroke();
        ctx.lineWidth = 1; ctx.lineCap = 'butt';
        ell(ctx, 17, -27, 5, 6, '#8a5530', 0.4);
        for (const [dx, dy] of [[-2, -3], [2, -1], [0, 3]]) circle(ctx, 17 + dx, -27 + dy, 1, '#e8d7a8');
        ell(ctx, 0, -13, 12, 12, '#4f7fc4');
        rrect(ctx, -11, -11, 22, 7, 2, '#e8a83a');
        ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.3;
        for (const xx of [-7, -2, 3, 8]) { ctx.beginPath(); ctx.moveTo(xx, -11); ctx.lineTo(xx + 1.5, -4); ctx.stroke(); }
        ctx.lineWidth = 1;
        ell(ctx, 1, -27, 10, 9, '#4f7fc4');
        tri(ctx, -1, -34, 1.5, -45, 4, -34, '#f0e6c8');
        ctx.fillStyle = '#2b3a6a'; ctx.beginPath(); ctx.ellipse(1, -33, 10, 4, 0, Math.PI, Math.PI * 2); ctx.fill();
        circle(ctx, -2, -28, 3, '#fff'); circle(ctx, 5, -28, 3, '#fff');
        circle(ctx, -1.4, -28, 1.5, '#111'); circle(ctx, 5.6, -28, 1.5, '#111');
        ctx.fillStyle = '#7a1d1d'; ctx.beginPath(); ctx.arc(2, -23, 4, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(-0.5, -23, 1.5, 1.8); ctx.fillRect(3, -23, 1.5, 1.8);
        break;
      }
      case 'snow': {
        ctx.strokeStyle = 'rgba(80,110,150,0.35)';
        ell(ctx, 0, -10, 12, 10, '#f4f8fc'); ctx.stroke();
        ell(ctx, 0, -25, 9, 8, '#f4f8fc'); ctx.stroke();
        rrect(ctx, -9, -19, 18, 4, 2, '#4a7fc0');
        rrect(ctx, -9, -18, 4, 9, 2, '#4a7fc0');
        for (let k = 0; k < 4; k++) tri(ctx, -6 + k * 4, -31, -4 + k * 4, -37 - (k % 2) * 3, -2 + k * 4, -31, '#bfe3f5');
        eyes(ctx, 2, -25, 3, 1.4, '#2a3a5a');
        ell(ctx, 6.5, -22.5, 1.8, 1, 'rgba(120,170,230,0.6)');
        ctx.strokeStyle = '#2a3a5a'; ctx.beginPath(); ctx.arc(2, -22, 1.8, 0.2, Math.PI - 0.2); ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const a = t * 1.5 + k * 1.57;
          circle(ctx, Math.cos(a) * 15, -18 + Math.sin(a * 1.3) * 12, 1.3, 'rgba(255,255,255,0.85)');
        }
        break;
      }
    }
    ctx.restore();
  }

  /* 얼굴 없는 손님: 시트가 없을 때 쓰는 코드 그림 — 시트와 같은 디자인(둥근 가면 · 금 간 자국 · 머리 위 수건) */
  function kaonashi(ctx, x, y, t, alpha = 1, o = {}) {
    if (specialSprite(ctx, 'kaonashi', x, y, t, alpha, o)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= alpha;
    ell(ctx, 0, 0, 15, 5, 'rgba(0,0,0,0.3)');
    const sway = Math.sin(t * 1.6) * 1.2;
    // 두건을 쓴 남색 몸
    ctx.fillStyle = '#25283b';
    ctx.beginPath(); ctx.moveTo(-17, 0);
    ctx.bezierCurveTo(-18, -28, -15 + sway * 0.5, -58, sway, -60);
    ctx.bezierCurveTo(15 + sway * 0.5, -58, 18, -28, 17, 0);
    ctx.quadraticCurveTo(0, 4, -17, 0);
    ctx.fill();
    // 둥근 가면과 금 간 자국, 가는 눈
    const mx = sway * 0.8 + 3, my = -38;
    circle(ctx, mx, my, 11, '#f3ede2');
    ctx.strokeStyle = '#d9a640'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx + 4, my - 10.5); ctx.lineTo(mx + 6.5, my - 5); ctx.lineTo(mx + 3.5, my - 1);
    ctx.lineTo(mx + 7.5, my + 4); ctx.lineTo(mx + 5, my + 9.5); ctx.stroke();
    ctx.fillStyle = '#1a1420';
    ctx.fillRect(mx - 6.5, my - 1, 3.6, 1.3); ctx.fillRect(mx + 2.5, my - 1, 3.6, 1.3);
    // 가슴께에 모은 두 손
    circle(ctx, mx - 4, -20, 3.2, '#181a29'); circle(ctx, mx + 2.5, -20, 3.2, '#181a29');
    // 머리 위에 얹은 수건
    rrect(ctx, -11 + sway, -66, 21, 8, 4, '#f4f2ec');
    ctx.fillStyle = '#7d8fd0'; ctx.fillRect(-10 + sway, -61.5, 19, 1.4);
    ctx.lineWidth = 1;
    ctx.restore();
  }

  /* ---------- 특별한 손님 (오리지널 디자인) ---------- */
  /* 특별한 손님 스프라이트 시트(ASSET_MANIFEST에 sheet로 등록된 것)가 있으면 그것으로 그린다 */
  function spriteReady(key) {
    const a = Assets.imgs[key];
    return a && a.def.sheet && a.img.complete && a.img.naturalWidth ? a : null;
  }
  function specialSprite(ctx, type, x, y, t, alpha, o) {
    const key = type, a = spriteReady(key);
    if (!a) return false;
    const d = a.def;
    if (!o.bath) ell(ctx, x, y, d.sheet.fw * d.scale * 0.3, 5, `rgba(0,0,0,${0.25 * alpha})`);
    const anim = o.bath ? (o.off ? 'bathOff' : 'bath') : o.moving ? 'walk' : 'idle';
    if (d.float && !o.bath) y -= d.float + Math.sin(t * 2.2 + (o.seed || 0)) * 1.5;   // 떠 있는 손님
    // 손님마다 애니메이션이 같은 박자로 움직이지 않도록 seed 만큼 어긋나게
    return Assets.drawAnim(ctx, key, anim, t + (o.seed || 0) * 0.37, x, y, (o.face || 1) < 0, alpha);
  }
  // 탕 속에 잠기는 깊이: 스프라이트가 있으면 시트의 bathY, 없으면 도형 기준값 (일반 손님 도형은 13)
  function guestBathY(g) {
    const a = spriteReady(g.type), sp = !!SPECIALS[g.type];
    const d = a ? a.def.bathY * (a.def.sheet.anims.bath.scale || 1) : sp ? SPECIALS[g.type].bathY : 13;
    return sp ? d * SG_WORLD : d;
  }
  /* 아직 방문하지 않은 손님(단서 그림자 · 검은 그림자): 모습을 어두운 실루엣으로 바꾸고 흐리게 그린다 */
  let silCan = null;
  function silhouetteGuest(ctx, type, x, y, t, alpha = 1, o = {}) {
    if (!silCan) { silCan = document.createElement('canvas'); silCan.width = 240; silCan.height = 220; }
    const c = silCan.getContext('2d'), FY = silCan.height - 24;
    c.clearRect(0, 0, silCan.width, silCan.height);
    specialGuest(c, type, silCan.width / 2, FY, t, 1, o);
    c.save();
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#1c1426'; c.fillRect(0, 0, silCan.width, silCan.height);
    c.restore();
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.filter = 'blur(2.5px)';
    ctx.drawImage(silCan, x - silCan.width / 2, y - FY);
    ctx.restore();
  }
  /* 게임 화면에서 특별한 손님을 그리는 크기 배율 (초상화는 o.portrait 로 원래 크기) */
  const SG_WORLD = 0.85;
  function specialGuest(ctx, type, x, y, t, alpha = 1, o = {}) {
    if (!o.portrait && SG_WORLD !== 1) {
      ctx.save(); ctx.translate(x, y); ctx.scale(SG_WORLD, SG_WORLD);
      specialGuest(ctx, type, 0, 0, t, alpha, { ...o, portrait: true });
      ctx.restore();
      return;
    }
    if (type === 'kaonashi') return kaonashi(ctx, x, y, t, alpha, o);
    if (specialSprite(ctx, type, x, y, t, alpha, o)) return;
    if (Assets.draw(ctx, type, x, y, (o.face || 1) < 0, alpha)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= alpha;
    if (!o.bath) ell(ctx, 0, 0, type === 'imugi' ? 16 : 13, 5, 'rgba(0,0,0,0.25)');
    ctx.scale(o.face || 1, 1);
    const bob = Math.sin(t * 2 + 1.3) * 0.9;
    switch (type) {
      case 'riverGod': { // 물로 된 몸, 갈대 관, 곁을 도는 작은 물고기
        ctx.translate(0, -bob);
        ctx.fillStyle = '#4f97b8';
        ctx.beginPath(); ctx.moveTo(-15, -2); ctx.quadraticCurveTo(-17, -40, -9, -52); ctx.lineTo(9, -52); ctx.quadraticCurveTo(17, -40, 15, -2);
        ctx.quadraticCurveTo(10, 1, 5, -2); ctx.quadraticCurveTo(0, 1, -5, -2); ctx.quadraticCurveTo(-10, 1, -15, -2); ctx.fill();
        ctx.strokeStyle = 'rgba(210,240,250,0.55)'; ctx.lineWidth = 1.4;
        for (const yy of [-14, -24, -34]) {
          ctx.beginPath(); ctx.moveTo(-13, yy);
          for (let k = -13; k < 13; k += 6.5) ctx.quadraticCurveTo(k + 3.2, yy - 2.5, k + 6.5, yy);
          ctx.stroke();
        }
        circle(ctx, 0, -58, 10.5, '#9fd3e6');
        ell(ctx, -3, -61, 4, 3, 'rgba(255,255,255,0.45)');
        ctx.strokeStyle = '#1d3b4a'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(-3.5, -57.5, 2.2, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(4.5, -57.5, 2.2, 0.2, Math.PI - 0.2); ctx.stroke();
        ell(ctx, 0.5, -51, 6, 3.2, '#e8f6fa'); // 물거품 수염
        ctx.strokeStyle = '#5f8f3a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        for (const [dx, h] of [[-7, 12], [-2.5, 16], [2.5, 14], [7, 11]]) {
          ctx.beginPath(); ctx.moveTo(dx, -66); ctx.quadraticCurveTo(dx + 1.5, -66 - h * 0.6, dx + (dx < 0 ? -1.5 : 1.5), -66 - h); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        ell(ctx, -1, -66.5, 9, 2.4, '#7aa64a');
        const fa = t * 1.6;
        ell(ctx, Math.cos(fa) * 20, -30 + Math.sin(fa) * 6, 4.5, 2.2, '#f08a4b', Math.cos(fa) > 0 ? 0.3 : -0.3);
        ell(ctx, Math.cos(fa + 3.1) * 18, -40 + Math.sin(fa + 3.1) * 5, 3.5, 1.8, '#f4c04f');
        break;
      }
      case 'spiderElder': { // 동그란 거미 정령: 여덟 다리, 흰 눈썹, 동그란 안경, 작은 밀짚모자, 실타래
        ctx.translate(0, -bob * 0.6);
        ctx.strokeStyle = '#3e2a22'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        for (let k = 0; k < 4; k++) {
          const ly = -20 + k * 4.5, sw = Math.sin(t * 5 + k) * 1.2;
          for (const sd of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(sd * 10, ly); ctx.quadraticCurveTo(sd * (20 + k), ly - 9 + sw, sd * (24 + k * 1.5), -1 + k * 0.5); ctx.stroke();
          }
        }
        ctx.lineCap = 'butt';
        ell(ctx, 0, -17, 14, 12, '#6b4a3a');
        for (let k = 0; k < 9; k++) ell(ctx, -10 + hash(k, 3) * 20, -24 + hash(3, k) * 14, 2.2, 1.2, 'rgba(160,120,90,0.5)', hash(k, k) * 3);
        circle(ctx, 0, -32, 9, '#7b5644');
        ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.arc(-3.5, -32, 3, 0, Math.PI * 2); ctx.arc(3.5, -32, 3, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.6, -32); ctx.lineTo(0.6, -32); ctx.stroke();
        circle(ctx, -3.5, -32, 1.1, '#1b1512'); circle(ctx, 3.5, -32, 1.1, '#1b1512');
        ell(ctx, -4, -36.5, 3.5, 1.6, '#f4f0e6', -0.2); ell(ctx, 4, -36.5, 3.5, 1.6, '#f4f0e6', 0.2);
        ell(ctx, 0, -26.5, 4, 2, '#f4f0e6');
        ell(ctx, 0, -40, 10, 2.6, '#d9b25e'); ell(ctx, 0, -42.5, 5.5, 3.2, '#e6c474'); ctx.fillStyle = '#b3322a'; ctx.fillRect(-5.5, -41.5, 11, 1.4);
        circle(ctx, 9, -10, 4, '#f2eee4');
        ctx.strokeStyle = '#cfc8b8'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(9, -10, 2.5, 0, 5); ctx.stroke();
        break;
      }
      case 'sansin': { // 흰 머리 할머니(흰 치마·옥색 저고리), 지팡이와 호리병, 곁의 새끼 호랑이
        ctx.translate(0, -bob);
        ctx.fillStyle = '#e9e4d6';
        ctx.beginPath(); ctx.moveTo(-6, -40); ctx.quadraticCurveTo(-10, -20, -14, -1); ctx.lineTo(14, -1); ctx.quadraticCurveTo(10, -20, 6, -40); ctx.fill();
        ctx.fillStyle = '#f7f3ea'; ctx.beginPath(); ctx.moveTo(-14, -1); ctx.quadraticCurveTo(0, 2, 14, -1); ctx.lineTo(14, -4); ctx.quadraticCurveTo(0, -1, -14, -4); ctx.fill();
        rrect(ctx, -10, -50, 20, 12, 5, '#8fbfa6');
        ctx.fillStyle = '#b5413a'; ctx.beginPath(); ctx.moveTo(-1, -44); ctx.lineTo(4, -32); ctx.lineTo(1, -32); ctx.lineTo(-2, -42); ctx.fill();
        ctx.fillStyle = '#eceae4';
        ctx.beginPath(); ctx.moveTo(-9, -60); ctx.quadraticCurveTo(-18, -40, -12, -24); ctx.lineTo(-6, -44); ctx.fill();
        circle(ctx, 0, -59, 9, '#f2d6bd');
        ell(ctx, 0, -66, 10, 5, '#f1efe9');
        circle(ctx, 0, -71, 4, '#f1efe9');
        ctx.fillStyle = '#c9a24a'; ctx.fillRect(-1.2, -74, 2.4, 6);
        ctx.strokeStyle = '#4a3226'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(-3.3, -59, 1.8, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(3.3, -59, 1.8, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -55.5, 2, 0.3, Math.PI - 0.3); ctx.stroke();
        ell(ctx, -6, -55.5, 1.8, 1, 'rgba(230,120,110,0.5)'); ell(ctx, 6, -55.5, 1.8, 1, 'rgba(230,120,110,0.5)');
        ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(13, 0); ctx.quadraticCurveTo(15, -30, 12, -62); ctx.stroke();
        ell(ctx, 12, -64, 3.2, 2.4, '#6b4a2e');
        ell(ctx, 15.5, -48, 3, 3.6, '#d9a441'); ell(ctx, 15.5, -53, 2, 2.2, '#d9a441');
        // 새끼 호랑이
        ctx.save(); ctx.translate(-19, 0);
        ell(ctx, 0, -6, 7.5, 5.5, '#e8923a');
        circle(ctx, 4.5, -12, 5.2, '#ee9c42');
        tri(ctx, 1.2, -15.5, 2.5, -19.5, 4.5, -16.5, '#ee9c42'); tri(ctx, 5.5, -16.5, 7.5, -19.5, 8.5, -15, '#ee9c42');
        ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 1.2;
        for (const dx of [-4, -1, 2]) { ctx.beginPath(); ctx.moveTo(dx, -11); ctx.lineTo(dx + 1, -7); ctx.stroke(); }
        ell(ctx, 5.5, -10, 2.6, 1.8, '#fbf1e2');
        circle(ctx, 3.3, -13, 0.9, '#1b1512'); circle(ctx, 6.6, -13, 0.9, '#1b1512');
        ctx.strokeStyle = '#e8923a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-7, -6); ctx.quadraticCurveTo(-12, -10 + Math.sin(t * 4) * 2, -10, -15); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.restore();
        break;
      }
      case 'imugi': { // 구름 수염을 단 이무기: 똬리 튼 몸, 작은 뿔 돌기, 빛나는 구슬
        ctx.translate(0, -bob);
        const body = '#6f88aa', belly = '#dbe4ec';
        ell(ctx, 0, -6, 17, 7, body); ell(ctx, 0, -4, 12, 3.5, belly);
        ell(ctx, 1, -15, 14, 6.5, body); ell(ctx, 1, -13.5, 9.5, 3, belly);
        ell(ctx, -1, -24, 11, 6, body);
        ctx.strokeStyle = body; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-4, -26); ctx.quadraticCurveTo(-8, -38, 0, -42); ctx.stroke();
        ctx.lineCap = 'butt';
        ell(ctx, 4, -44, 9, 7, '#7a93b4');
        ell(ctx, 10, -42.5, 5, 3.6, '#8aa2c0');
        tri(ctx, 0, -49, 1.5, -54, 3.5, -49.5, '#e6e0cf'); tri(ctx, 5, -50, 7, -55, 8.5, -49.5, '#e6e0cf');
        circle(ctx, 6, -45.5, 1.7, '#1b1512'); circle(ctx, 6.5, -46.2, 0.6, '#fff');
        ell(ctx, 3, -42, 1.8, 1, 'rgba(240,150,160,0.55)');
        ctx.strokeStyle = '#eef3f7'; ctx.lineWidth = 1.1;
        const wv = Math.sin(t * 2.2) * 2;
        ctx.beginPath(); ctx.moveTo(13, -42); ctx.quadraticCurveTo(20, -44 + wv, 24, -38); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(13, -41); ctx.quadraticCurveTo(18, -36 - wv, 22, -31); ctx.stroke();
        for (const [cx, cy] of [[24, -38], [22, -31]]) { circle(ctx, cx, cy, 2.6, '#f7f9fb'); circle(ctx, cx + 2.2, cy + 0.6, 2, '#f7f9fb'); }
        const pg = 0.6 + Math.sin(t * 3) * 0.2;
        circle(ctx, -13, -18, 6.5, `rgba(250,230,160,${0.25 * pg})`);
        circle(ctx, -13, -18, 3.6, '#f6e2a0'); circle(ctx, -14, -19.2, 1.3, '#fffbe8');
        break;
      }
    }
    ctx.restore();
  }

  function drawChar(ctx, g, x, y, t, opt = {}) {
    const alpha = (g.alpha ?? 1) * (opt.alpha ?? 1);
    if (SPECIALS[g.type]) return specialGuest(ctx, g.type, x, y, t, alpha, { face: g.face || 1, bath: opt.bath, moving: g.moving, off: g.offNow, seed: g.id || 0 });
    spirit(ctx, g.type, x, y, t, { face: g.face || 1, moving: g.moving, alpha, bath: opt.bath, off: g.offNow, seed: g.id || 0 });
  }

  /* ---------- 단서 아이템 ---------- */
  function sparkle(ctx, x, y, t, seed) {
    const a = 0.5 + 0.5 * Math.sin(t * 4 + seed);
    const r = 3 + a * 3;
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.6 * a;
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x + r * 0.35, y - r * 0.35); ctx.lineTo(x + r * 1.6, y); ctx.lineTo(x + r * 0.35, y + r * 0.35);
    ctx.lineTo(x, y + r * 1.6); ctx.lineTo(x - r * 0.35, y + r * 0.35); ctx.lineTo(x - r * 1.6, y); ctx.lineTo(x - r * 0.35, y - r * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function clueItem(ctx, c, t) {
    const x = sx(c.x, c.y), y = sy(c.x, c.y);
    const icon = CLUES[c.id].icon;
    if (icon === 'mask') {
      ctx.save(); ctx.translate(x, y - 3); ctx.rotate(-0.5);
      ctx.fillStyle = '#f1ede4';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 8, 0, Math.PI * 0.15, Math.PI * 1.25); ctx.lineTo(1, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a4c8c'; ctx.fillRect(-3.5, -6, 1.2, 3);
      ctx.restore();
    } else if (icon === 'gold') {
      ell(ctx, x, y - 1, 9, 4, 'rgba(90,60,30,0.6)');
      ell(ctx, x - 3, y - 3, 4.5, 3, '#e3b53a'); ell(ctx, x + 3, y - 2, 3.5, 2.5, '#c9962a'); ell(ctx, x, y - 5, 3, 2.2, '#f4cf55');
    } else if (icon === 'reed') {
      ctx.strokeStyle = '#6f9a3e'; ctx.lineWidth = 1.6;
      for (const d of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(x + d, y); ctx.quadraticCurveTo(x + d * 1.4, y - 9, x + d * 2, y - 14); ctx.stroke(); }
      ell(ctx, x - 6, y - 14, 1.6, 3, '#8a6a3a'); ell(ctx, x + 6, y - 14, 1.6, 3, '#8a6a3a');
    } else if (icon === 'scale' || icon === 'cloud') {
      ell(ctx, x, y - 3, 6, 4, icon === 'cloud' ? 'rgba(236,242,248,0.9)' : '#bcd7e6', -0.3);
      ell(ctx, x - 1.5, y - 4.2, 2.6, 1.6, 'rgba(255,255,255,0.7)', -0.3);
    } else if (icon === 'print') {
      for (const [dx, dy] of [[-5, 1], [0, -3], [5, 1]]) { ell(ctx, x + dx, y + dy, 2.6, 1.6, 'rgba(90,150,190,0.65)'); }
    } else if (icon === 'thread' || icon === 'spool') {
      if (icon === 'spool') { ell(ctx, x, y - 3, 4.5, 3.5, '#f2eee4'); ctx.fillStyle = '#9a7a52'; ctx.fillRect(x - 5, y - 1, 10, 1.6); }
      ctx.strokeStyle = 'rgba(245,245,255,0.85)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); for (let k = 0; k < 3; k++) ctx.arc(x, y - 3, 3 + k * 2.4, 0, Math.PI * 2); ctx.stroke();
    } else if (icon === 'wrapper') {
      for (const [dx, col] of [[-4, '#e0a03a'], [2, '#c9662f'], [5, '#e8c45a']]) { ctx.fillStyle = col; ctx.save(); ctx.translate(x + dx, y - 2); ctx.rotate(dx * 0.2); ctx.fillRect(-2.5, -1.5, 5, 3); ctx.restore(); }
    } else if (icon === 'pinecone') {
      for (const dx of [-5, 0, 5]) { ell(ctx, x + dx, y - 3, 2.6, 3.6, '#8a5a2e'); ell(ctx, x + dx, y - 4, 1.6, 1, '#b07a44'); }
    } else if (icon === 'fur') {
      ell(ctx, x, y - 3, 6, 3.6, '#e8923a');
      ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 1;
      for (const d of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(x + d, y - 6); ctx.lineTo(x + d + 1, y - 0.5); ctx.stroke(); }
    } else if (icon === 'mint') {
      ell(ctx, x, y - 5, 9, 4, 'rgba(220,245,235,0.55)');
      ell(ctx, x - 3, y - 2, 3, 1.8, '#5fb37a', 0.5); ell(ctx, x + 3, y - 2.5, 3, 1.8, '#4fa06a', -0.5);
    } else if (icon === 'note') {
      ctx.fillStyle = '#f3ead6'; poly(ctx, rectPts(c.x - 0.2, c.y - 0.15, 0.4, 0.3, 1)); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,30,0.6)';
      ctx.beginPath();
      for (const f of [0.35, 0.65]) { ctx.moveTo(sx(c.x - 0.15, c.y - 0.15 + 0.3 * f), sy(c.x - 0.15, c.y - 0.15 + 0.3 * f) - 1); ctx.lineTo(sx(c.x + 0.15, c.y - 0.15 + 0.3 * f), sy(c.x + 0.15, c.y - 0.15 + 0.3 * f) - 1); }
      ctx.stroke();
    }
    sparkle(ctx, x, y - 18, t, c.x * 3);
  }

  /* ---------- 오버레이 (말풍선 · 태그 · 진행바) ---------- */
  function herbBadge(ctx, h, x, y, r = 7.5) {
    circle(ctx, x, y, r, HERBS[h].color);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    text(ctx, HERBS[h].short, x, y + 0.5, r * 1.25, '#fff', { bold: true, stroke: 'rgba(0,0,0,0.35)', strokeW: 2 });
  }
  function bubble(ctx, x, y, w, h) {
    const bx = x - w / 2, by = y - h - 6;
    ctx.fillStyle = 'rgba(251,244,226,0.97)';
    ctx.strokeStyle = 'rgba(60,35,20,0.55)'; ctx.lineWidth = 1.2;
    rrectPath(ctx, bx, by, w, h, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, by + h - 0.6); ctx.lineTo(x, y); ctx.lineTo(x + 4, by + h - 0.6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 4, by + h); ctx.lineTo(x, y); ctx.lineTo(x + 4, by + h); ctx.stroke();
    ctx.lineWidth = 1;
    return { bx, by, cy: by + h / 2 };
  }
  function patienceBar(ctx, x, y, ratio) {
    const w = 30;
    rrect(ctx, x - w / 2 - 1, y - 1, w + 2, 6, 3, 'rgba(20,12,10,0.7)');
    const col = ratio > 0.5 ? '#7ccf6a' : ratio > 0.25 ? '#f0c040' : '#e5533c';
    rrect(ctx, x - w / 2, y, Math.max(2, w * ratio), 4, 2, col);
  }
  function guestOverlay(ctx, g, t) {
    const x = sx(g.x, g.y);
    const top = sy(g.x, g.y) - (SPECIALS[g.type] ? SPECIALS[g.type].h * SG_WORLD : 50);
    if (g.state === 'waiting' || g.state === 'kWait') {
      if (g.state === 'kWait' || !g.known) {
        const pul = 1 + Math.sin(t * 6) * 0.1;
        const b = bubble(ctx, x, top, 22, 20);
        text(ctx, g.state === 'kWait' ? '…' : '!', x, b.cy, 15 * pul, g.state === 'kWait' ? '#5b3a7a' : '#c0392b', { bold: true });
      } else if (g.hidden) {
        const b = bubble(ctx, x, top, 36, 20);
        text(ctx, '???', x, b.cy, 13, '#5b3a7a', { bold: true });
      } else {
        const n = g.request.herbs.length;
        const w = 36 + n * 17;
        const b = bubble(ctx, x, top, w, 22);
        text(ctx, `${g.request.temp}°`, b.bx + 6, b.cy, 13, '#8e2a22', { bold: true, align: 'left' });
        g.request.herbs.forEach((h, k) => herbBadge(ctx, h, b.bx + 38 + k * 17, b.cy));
      }
      if (!g.noPatience) patienceBar(ctx, x, top + 4, Math.max(0, g.patience / g.patienceMax));
    } else if (g.state === 'following') {
      text(ctx, '♨', x, top + 6 + Math.sin(t * 5) * 2, 16, '#f2c96a', { bold: true, stroke: 'rgba(40,20,10,0.7)' });
    } else if (g.state === 'leaving' && g.angry) {
      text(ctx, '💢', x + 10, top + 8, 16, '#e5533c');
    }
  }
  function tubTag(ctx, o, t) {
    const cx = sx(o.x + o.w / 2, o.y + o.h / 2);
    const cyBase = sy(o.x + o.w / 2, o.y + o.h / 2);
    if (o.state === 'ready') {
      const n = o.herbs.length;
      const w = 36 + n * 17, h = 20, y = cyBase - 46;
      rrect(ctx, cx - w / 2, y - h / 2, w, h, 10, 'rgba(28,18,28,0.78)');
      text(ctx, `${Math.round(o.temp)}°`, cx - w / 2 + 7, y, 12, '#ffe2b8', { bold: true, align: 'left' });
      o.herbs.forEach((hb, k) => herbBadge(ctx, hb, cx - w / 2 + 38 + k * 17, y, 7));
    } else if (o.state === 'dirty') {
      const y = cyBase - 40;
      rrect(ctx, cx - 30, y - 10, 60, 20, 10, 'rgba(90,60,30,0.85)');
      text(ctx, '청소 필요', cx, y, 11, '#f7e7c8', { bold: true });
    } else if (o.state === 'occupied' && o.guest && o.guest.state === 'bathing') {
      const y = cyBase - (SPECIALS[o.guest.type] ? SPECIALS[o.guest.type].h * SG_WORLD + 6 : 60);
      const r = 1 - o.guest.bathT / (o.guest.bathMax || BATH_TIME);
      circle(ctx, cx, y, 9, 'rgba(28,18,28,0.75)');
      ctx.strokeStyle = '#f2c96a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, y, 7, -Math.PI / 2, -Math.PI / 2 + r * Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      const g = o.guest;
      if (g.offNow) {
        const msg = g.offNow < 0 ? '앗, 차가워!' : '앗, 뜨거워!';
        const pul = 1 + Math.sin(t * 8) * 0.06;
        rrect(ctx, cx + 14, y - 11, 64, 22, 11, g.offNow < 0 ? 'rgba(70,120,190,0.92)' : 'rgba(200,70,50,0.92)');
        text(ctx, msg, cx + 46, y, 11 * pul, '#fff', { bold: true });
      }
      if (g.badCompany) text(ctx, '💢', cx - 22, y, 15, '#e5533c');
      else if (g.goodCompany) text(ctx, '♪', cx - 22, y + Math.sin(t * 5) * 2, 16, '#9fe08a', { bold: true, stroke: 'rgba(20,40,20,0.7)' });
    }
  }
  function busyBar(ctx, p) {
    const x = sx(p.x, p.y), y = sy(p.x, p.y) - 58;
    const r = 1 - p.busy / p.busyTotal;
    rrect(ctx, x - 22, y - 4, 44, 8, 4, 'rgba(20,12,10,0.8)');
    rrect(ctx, x - 21, y - 3, 42 * r, 6, 3, '#9fd6f0');
    if (p.busyLabel) text(ctx, p.busyLabel, x, y - 12, 11, '#fff', { bold: true, stroke: 'rgba(0,0,0,0.6)' });
  }
  function floats(ctx, w, sid = 'main') {
    for (const f of w.floats) {
      if ((f.scene || 'main') !== sid) continue;
      const a = Math.min(1, f.life / 0.5);
      ctx.globalAlpha = a;
      text(ctx, f.text, f.x, f.y - (f.max - f.life) * 16, f.size || 14, f.color || '#fff', { bold: true, stroke: 'rgba(25,15,20,0.85)', strokeW: 3.5 });
      ctx.globalAlpha = 1;
    }
  }
  function effects(ctx, w, sid = 'main') {
    for (const e of w.effects) {
      if ((e.scene || 'main') !== sid) continue;
      const k = e.life / e.max;
      if (e.kind === 'steam') {
        circle(ctx, e.x, e.y, e.r * (1.6 - k * 0.6), `rgba(255,255,255,${0.22 * k})`);
      } else if (e.kind === 'ember') {
        circle(ctx, e.x, e.y, 1.6, `rgba(255,${150 + 80 * k | 0},60,${k})`);
      } else if (e.kind === 'spark') {
        circle(ctx, e.x, e.y, 2, `rgba(255,240,170,${k})`);
      }
    }
  }
  function glow(ctx, t, w) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of S.lanterns) {
      const x = sx(L.x, L.y), y = sy(L.x, L.y) - 40;
      const r = 120 + Math.sin(t * 2 + L.x) * 6;
      const g = ctx.createRadialGradient(x, y, 4, x, y, r);
      g.addColorStop(0, 'rgba(255,170,90,0.2)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (S !== SCENES.main) { ctx.restore(); return; }
    const fx = sx(11, 14), fy = sy(11, 14) - 14;
    const fuel = w.boilerRatio ?? 1;
    const fr = (110 + Math.sin(t * 9) * 8) * (fuel > 0 ? 0.5 + 0.5 * fuel : 0.3);
    const g2 = ctx.createRadialGradient(fx, fy, 4, fx, fy, fr);
    g2.addColorStop(0, 'rgba(255,120,40,0.26)'); g2.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g2; ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    ctx.restore();
  }

  /* ---------- 월드 전체 ---------- */
  function world(ctx, w, t, hover) {
    const sid = w.scene || 'main';
    S = SCENES[sid];
    const inMain = sid === 'main';
    const p = w.player;
    const showPlayer = !w.demo;
    const psx = sx(p.x, p.y), psy = sy(p.x, p.y), pk = p.x + p.y;

    for (let j = 0; j < S.h; j++) {
      for (let i = 0; i < S.w; i++) {
        const ch = S.rows[j][i];
        if (ch !== '#' && ch !== ' ') floorTile(ctx, i, j, ch, t);
      }
    }
    if (sid === 'garden') pondDecor(ctx, t);
    floorDecor(ctx, w, t, hover);

    const list = [];
    for (let j = 0; j < S.h; j++) {
      for (let i = 0; i < S.w; i++) {
        const ch = S.rows[j][i];
        if (S.portals[ch]) {
          const P = S.portals[ch];
          list.push({ k: i + j + 1.02, f: () => door(ctx, t, i, j, P.orient, P.label, P.to === 'main' ? '#8e2a22' : '#3d5a7a') });
          continue;
        }
        if (ch !== '#') continue;
        const k = i + j + 1;
        let alpha = 1;
        const h = wallHeight(i, j);
        if (showPlayer && h > 20 && k > pk) {
          const wx = sx(i + 0.5, j + 0.5), wy = sy(i + 0.5, j + 0.5);
          if (Math.abs(wx - psx) < 46 && psy < wy + 16 && psy > wy - h - 20) alpha = 0.35;
        }
        list.push({ k, f: () => wall(ctx, i, j, alpha) });
      }
    }
    for (const L of S.lanterns) list.push({ k: L.wall[0] + L.wall[1] + 1.02, f: () => lantern(ctx, L, t) });
    if (inMain) list.push({ k: DOOR.x + DOOR.y + 1.02, f: () => door(ctx, t) });
    for (const o of w.objects) {
      if (o.kind === 'pond' || (o.scene || 'main') !== sid) continue;
      list.push({ k: o.x + o.w - 0.5 + o.y + o.h - 0.5, f: () => drawObject(ctx, o, t) });
    }
    for (const c of w.clueItems) {
      if (c.collected || (c.scene || 'main') !== sid) continue;
      if (CLUES[c.id].npc) list.push({ k: c.x + c.y, f: () => silhouetteGuest(ctx, CLUES[c.id].guest, sx(c.x, c.y), sy(c.x, c.y), t, 0.8 * c.alpha, { face: -1 }) });
      else list.push({ k: c.x + c.y, f: () => clueItem(ctx, c, t) });
    }
    if (inMain) {
      for (const g of w.guests) {
        if (g.state === 'bathing') continue;
        list.push({ k: g.x + g.y, f: () => drawChar(ctx, g, sx(g.x, g.y), sy(g.x, g.y), t) });
      }
    }
    if (w.ghost && w.ghost.alpha > 0.01 && (w.ghost.scene || 'main') === sid) {
      const gh = w.ghost;
      list.push({ k: gh.x + gh.y, f: () => silhouetteGuest(ctx, 'kaonashi', sx(gh.x, gh.y), sy(gh.x, gh.y), t, gh.alpha) });
    }
    if (showPlayer) list.push({ k: pk, f: () => chihiro(ctx, psx, psy, p.t, p.moving, p.face, 1, p.busy > 0, p.walkDist || 0) });
    list.sort((a, b) => a.k - b.k);
    for (const d of list) d.f();

    effects(ctx, w, sid);
    glow(ctx, t, w);
    if (inMain) {
      for (const o of w.tubs) tubTag(ctx, o, t);
      for (const g of w.guests) guestOverlay(ctx, g, t);
    }
    if (showPlayer && p.busy > 0) busyBar(ctx, p);
    floats(ctx, w, sid);
  }

  /* ---------- 화면 배경 ---------- */
  let STARS = null;
  function background(ctx, W, H, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0f27'); g.addColorStop(1, '#231a3a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!STARS) {
      STARS = [];
      for (let i = 0; i < 140; i++) STARS.push([Math.random(), Math.random(), Math.random() * 1.4 + 0.4, Math.random() * 6]);
    }
    ctx.fillStyle = '#fff';
    for (const s of STARS) {
      ctx.globalAlpha = 0.15 + 0.4 * Math.sin(t * 1.3 + s[3]) ** 2;
      ctx.fillRect(s[0] * W, s[1] * H, s[2], s[2]);
    }
    ctx.globalAlpha = 1;
  }
  function vignette(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(8,6,24,0)'); g.addColorStop(1, 'rgba(8,6,24,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  /* ---------- 초상화 · 엔딩 일러스트 ---------- */
  function portrait(canvas, kind, opt = {}) {
    const c = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const s = W / 120; // 캔버스 내부 해상도 대비 배율
    c.clearRect(0, 0, W, H);
    c.save();
    c.imageSmoothingQuality = 'high';
    const hd = kind === 'chihiro' && Assets.imgs.chihiro_portrait;
    const sp = kind && (SPECIALS[kind] || GUEST_TYPES[kind]) && spriteReady(kind);
    if (sp) {
      // 시트 칸을 가운데에 놓고, 키와 너비 중 빡빡한 쪽에 맞춰 크기를 정한다
      const d = sp.def, cw = d.sheet.fw * d.scale;
      const f = Math.min(78 / (SPECIALS[kind] ? SPECIALS[kind].h : d.h || 50), 104 / (cw * 0.86));
      c.translate(W / 2 + (d.ax - 0.5) * cw * f * s, H * 0.96); c.scale(f * s, f * s);
      specialSprite(c, kind, 0, 0, 0.6, 1, {});
    } else if (kind && SPECIALS[kind]) {
      const k = 60 / Math.max(48, SPECIALS[kind].h + 4);
      c.translate(W / 2, H * 1.0); c.scale(1.9 * k * s, 1.9 * k * s);
      specialGuest(c, kind, 0, 0, 1, 1, { portrait: true });
    } else if (hd && hd.img.complete && hd.img.naturalWidth) {
      // 주인공: 게임용 축소 시트를 키우면 흐려지므로 원본 해상도 프레임을 거의 1:1로 그린다
      const im = hd.img, f = (H * 0.92) / im.naturalHeight;
      const w = im.naturalWidth * f, h = im.naturalHeight * f;
      c.drawImage(im, W * 0.5 - w * 0.6, H * 0.98 - h, w, h);
    } else if (kind === 'chihiro') {
      c.translate(W / 2, H * 0.98); c.scale(2.4 * s, 2.4 * s);
      chihiro(c, 0, 0, 1, false, 1);
    } else if (kind && GUEST_TYPES[kind]) {
      c.translate(W / 2, H * 0.88); c.scale(2.2 * s, 2.2 * s);
      spirit(c, kind, 0, 0, 1, { face: 1 });
    } else {
      c.translate(W / 2, H / 2);
      text(c, '湯', 0, 0, 44 * s, '#e8c36a', { serif: true, bold: true });
    }
    c.restore();
    if (opt.silhouette) {
      // 아직 만나지 못한 손님: 그린 모습을 어두운 그림자로 덮고 물음표만 남긴다
      c.save();
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = '#3b3046'; c.fillRect(0, 0, W, H);
      c.restore();
      // 윤곽도 또렷하지 않게 흐린다
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      tmp.getContext('2d').drawImage(canvas, 0, 0);
      c.clearRect(0, 0, W, H);
      c.save(); c.filter = `blur(${3 * s}px)`; c.drawImage(tmp, 0, 0); c.restore();
      text(c, '?', W / 2, H * 0.55, 34 * s, 'rgba(255,240,215,0.85)', { serif: true, bold: true });
    }
  }
  function endingArt(canvas, type) {
    const c = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, type === 'special' ? '#1d2550' : '#0e1330');
    sky.addColorStop(0.65, type === 'special' ? '#6b4a7a' : '#2b2145');
    sky.addColorStop(1, '#1a1230');
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + hash(i, 9) * 0.6})`; c.fillRect(hash(i, 1) * W, hash(1, i) * H * 0.55, 1.5, 1.5); }
    circle(c, W * 0.8, H * 0.2, 22, '#f6ecc8'); circle(c, W * 0.8 + 7, H * 0.2 - 4, 20, type === 'special' ? '#2a2f5a' : '#141a3a');
    // 목욕탕 실루엣
    c.fillStyle = '#120c1c';
    c.fillRect(W * 0.05, H * 0.35, W * 0.28, H * 0.4);
    tri(c, W * 0.02, H * 0.36, W * 0.19, H * 0.22, W * 0.36, H * 0.36, '#120c1c');
    c.fillRect(W * 0.1, H * 0.18, W * 0.18, H * 0.06);
    tri(c, W * 0.08, H * 0.19, W * 0.19, H * 0.1, W * 0.3, H * 0.19, '#120c1c');
    for (let k = 0; k < 8; k++) { c.fillStyle = `rgba(255,190,110,${0.5 + hash(k, 4) * 0.4})`; c.fillRect(W * 0.08 + (k % 4) * W * 0.06, H * 0.42 + Math.floor(k / 4) * H * 0.12, W * 0.025, H * 0.05); }
    // 물
    c.fillStyle = 'rgba(30,40,80,0.9)'; c.fillRect(0, H * 0.75, W, H * 0.25);
    c.strokeStyle = 'rgba(255,220,160,0.25)';
    for (let k = 0; k < 9; k++) { const y = H * 0.78 + k * 6; c.beginPath(); c.moveTo(W * 0.05 + hash(k, 2) * 40, y); c.lineTo(W * 0.3 + hash(2, k) * 40, y); c.stroke(); }
    // 다리
    c.fillStyle = '#5a2c22'; c.fillRect(W * 0.3, H * 0.72, W * 0.7, H * 0.05);
    c.fillStyle = '#7a3a2c';
    for (let k = 0; k < 12; k++) c.fillRect(W * 0.32 + k * W * 0.06, H * 0.62, 3, H * 0.1);
    c.fillRect(W * 0.3, H * 0.62, W * 0.7, 3);
    for (let k = 0; k < 5; k++) { circle(c, W * 0.36 + k * W * 0.14, H * 0.6, 5, '#d8452f'); }
    if (type === 'special') {
      c.save(); c.translate(W * 0.5, H * 0.72); c.scale(2.1, 2.1); chihiro(c, 0, 0, 1, false, 1); c.restore();
      c.save(); c.translate(W * 0.66, H * 0.72); c.scale(1.9, 1.9); kaonashi(c, 0, 0, 1, 1); c.restore();
      const lx = W * 0.56, ly = H * 0.52;
      for (let k = 0; k < 6; k++) ell(c, lx + Math.cos(k * 1.05) * 6, ly + Math.sin(k * 1.05) * 3, 4, 7, '#ee9bbd', k * 1.05);
      circle(c, lx, ly, 3, '#f6d36a');
      for (let k = 0; k < 14; k++) sparkle(c, W * (0.35 + hash(k, 5) * 0.5), H * (0.2 + hash(5, k) * 0.35), k, k);
    } else {
      c.save(); c.translate(W * 0.55, H * 0.72); c.scale(2.2, 2.2); chihiro(c, 0, 0, 1, false, -1); c.restore();
      c.save(); c.translate(W * 0.9, H * 0.72); c.scale(1.4, 1.4); kaonashi(c, 0, 0, 1, 0.3); c.restore();
    }
  }

  /* ---------- 타이틀 배경: 밤의 노천탕 ----------
   * 1600×900 기준 좌표로 그린 뒤 화면을 꽉 채우도록(cover) 확대.
   * 움직이지 않는 부분은 오프스크린 캔버스에 한 번만 그리고, 꽃잎·김·불빛만 매 프레임 그린다.
   * AI 배경 이미지를 쓰려면 ASSET_MANIFEST에 title_bg 를 등록 (글자 없는 그림).
   */
  const TS = { cache: null, key: '' };
  const TW = 1600, THt = 900;
  const eaveY = x => 290 + (x - 30) / 1570 * 40;
  function tsFlower(c, x, y, r, col, rot) {
    for (let k = 0; k < 5; k++) {
      const a = rot + k * Math.PI * 2 / 5;
      ell(c, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.56, r * 0.4, col, a);
    }
    circle(c, x, y, r * 0.22, '#f6d886');
  }
  function tsRock(c, x, y, w, h, col = '#6a6e78') {
    ell(c, x, y + h * 0.15, w, h, '#3c3f48');
    ell(c, x, y, w, h * 0.92, col);
    ell(c, x - w * 0.25, y - h * 0.35, w * 0.45, h * 0.3, 'rgba(255,255,255,0.12)');
    for (let k = 0; k < 4; k++) ell(c, x - w * 0.5 + hash(k, x) * w, y - h * 0.75 + hash(x, k) * 6, w * 0.22, h * 0.14, k % 2 ? '#56733f' : '#45602f');
  }
  /* ---------- 배경 이미지 → 게임 팔레트 판화풍 ----------
   * 배경 이미지는 밑그림으로만 쓴다: 흐리게 → 색 계열별 램프(밤·목재·불빛·등롱·벚꽃·이끼)로
   * 단계 매핑 → 확대 후 다시 매핑해 경계를 정리 → 종이 질감. 한 번만 계산해 둔다.
   */
  const tsHex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const TS_RAMP = {
    night: ['#0d1124', '#161c36', '#212949', '#313c62', '#4c5a84', '#8292b4', '#cdd5e2'].map(tsHex),
    wood:  ['#261a20', '#36262a', '#4a3532', '#62463b'].map(tsHex),
    glow:  ['#3c1f18', '#7a3c22', '#b9673a', '#e69a4e', '#f5c97f', '#fbe8bd'].map(tsHex),
    red:   ['#2e1013', '#6a2020', '#a3352c', '#cf5a45'].map(tsHex),
    pink:  ['#5e3448', '#9a5170', '#d3829a', '#efbcc4', '#f9e3e2'].map(tsHex),
    moss:  ['#10181a', '#1c2a28', '#2b3f35', '#455a43', '#6d7d59'].map(tsHex),
  };
  const tsCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function tsTone(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 510, s = d / (mx + 1);
    let h = 0;
    if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    const pick = (ramp, lo, hi) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((l - lo) / (hi - lo) * ramp.length)))];
    const redH = h >= 335 || h < 18;
    if (redH && s >= 0.3 && l > 0.55) return pick(TS_RAMP.pink, 0.5, 0.95);             // 벚꽃
    if (redH && s > 0.45 && l > 0.16) return pick(TS_RAMP.red, 0.14, 0.6);              // 등롱·노렌
    if (h >= 18 && h < 60 && s > 0.35 && l > 0.3) return pick(TS_RAMP.glow, 0.3, 0.88); // 창 불빛
    if ((h < 45 || h >= 320) && s > 0.15 && l > 0.26 && l < 0.55) return pick(TS_RAMP.wood, 0.26, 0.55);
    if (h >= 60 && h < 165 && s > 0.15) return pick(TS_RAMP.moss, 0.1, 0.55);
    return pick(TS_RAMP.night, 0, 0.78);
  }
  function tsMap(cv) {
    const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height), a = d.data, memo = new Map();
    for (let i = 0; i < a.length; i += 4) {
      const key = (a[i] >> 2) << 12 | (a[i + 1] >> 2) << 6 | (a[i + 2] >> 2);
      let o = memo.get(key);
      if (!o) { o = tsTone(a[i], a[i + 1], a[i + 2]); memo.set(key, o); }
      a[i] = o[0]; a[i + 1] = o[1]; a[i + 2] = o[2];
    }
    g.putImageData(d, 0, 0);
  }
  function tsClean(img) {
    // 1280×720 기준: 노렌 글자 ゆ → 탕, 잠든 여우 → 바위·덤불
    const c = tsCanvas(1280, 720), g = c.getContext('2d');
    g.drawImage(img, 0, 0, 1280, 720);
    const p = g.getImageData(1036, 350, 1, 1).data;
    g.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; g.fillRect(948, 336, 90, 98);
    g.fillStyle = '#f4eadb'; g.font = `bold 60px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('탕', 993, 388);
    const rk = g.getImageData(1040, 650, 1, 1).data;
    g.fillStyle = `rgb(${rk[0]},${rk[1]},${rk[2]})`;
    g.beginPath(); g.ellipse(1175, 612, 100, 40, 0, Math.PI, 0); g.lineTo(1275, 625); g.lineTo(1075, 625); g.fill();
    [[1110, 560, 34], [1150, 545, 40], [1196, 552, 38], [1236, 566, 32], [1130, 585, 30], [1214, 588, 30]]
      .forEach(([x, y, r], i) => { g.fillStyle = i % 2 ? '#3f6a3e' : '#567f4a'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
    return c;
  }
  function tsStylize(img) {
    const small = tsCanvas(640, 360), sg = small.getContext('2d');
    sg.filter = 'blur(1.6px)'; sg.drawImage(tsClean(img), 0, 0, 640, 360); sg.filter = 'none';
    tsMap(small);
    const f = tsCanvas(TW, THt), fg = f.getContext('2d');
    fg.imageSmoothingQuality = 'high'; fg.filter = 'blur(1.6px)'; fg.drawImage(small, 0, 0, TW, THt); fg.filter = 'none';
    tsMap(f);
    // 종이 질감
    const pc = tsCanvas(256, 256), pg = pc.getContext('2d'), pd = pg.createImageData(256, 256);
    for (let i = 0; i < pd.data.length; i += 4) { const v = 128 + (hash(i, 7) - 0.5) * 90; pd.data[i] = pd.data[i + 1] = pd.data[i + 2] = v; pd.data[i + 3] = 255; }
    pg.putImageData(pd, 0, 0);
    pg.strokeStyle = 'rgba(255,255,255,0.18)'; pg.lineWidth = 0.6;
    for (let i = 0; i < 90; i++) {
      const x = hash(i, 1) * 256, y = hash(1, i) * 256, a = hash(i, 2) * 6.28, l = 4 + hash(2, i) * 10;
      pg.beginPath(); pg.moveTo(x, y); pg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); pg.stroke();
    }
    fg.globalCompositeOperation = 'overlay'; fg.globalAlpha = 0.12;
    fg.fillStyle = fg.createPattern(pc, 'repeat'); fg.fillRect(0, 0, TW, THt);
    fg.globalCompositeOperation = 'source-over'; fg.globalAlpha = 1;
    return f;
  }
  function tsBuild(img) {
    if (TS.building) return;
    TS.building = true;
    const fontReady = document.fonts
      ? Promise.race([document.fonts.load(`bold 60px ${SERIF}`), new Promise(r => setTimeout(r, 1500))]).catch(() => {})
      : Promise.resolve();
    fontReady.then(() => {
      try { TS.styled = tsStylize(img); }
      catch (e) { TS.styled = img; }   // file:// 등으로 픽셀을 읽을 수 없으면 원본 그대로
      TS.readyAt = performance.now();
      TS.key = '';
    });
  }
  function tsStatic(c) {
    const bg = Assets.imgs.title_bg;
    if (bg && bg.img.complete && bg.img.naturalWidth) {
      if (TS.styled) { c.drawImage(TS.styled, 0, 0, TW, THt); return; }
      tsBuild(bg.img);
      c.fillStyle = '#0d1124'; c.fillRect(0, 0, TW, THt);
      return;
    }
    // 하늘
    let g = c.createLinearGradient(0, 0, 0, 520);
    g.addColorStop(0, '#26305c'); g.addColorStop(0.5, '#4f4a7e'); g.addColorStop(1, '#b9806f');
    c.fillStyle = g; c.fillRect(0, 0, TW, THt);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,240,${0.3 + hash(i, 3) * 0.5})`; c.fillRect(1000 + hash(i, 1) * 600, hash(1, i) * 240, 1.8, 1.8); }
    // 달
    g = c.createRadialGradient(1335, 78, 20, 1335, 78, 170);
    g.addColorStop(0, 'rgba(255,236,170,0.55)'); g.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = g; c.fillRect(1160, 0, 360, 250);
    circle(c, 1335, 78, 46, '#fbe6a6');
    circle(c, 1320, 68, 11, 'rgba(225,195,125,0.35)'); circle(c, 1352, 94, 8, 'rgba(225,195,125,0.3)');
    for (const [x, y, w] of [[1200, 160, 130], [1440, 200, 170], [1080, 120, 100]]) {
      ell(c, x, y, w, 13, 'rgba(205,195,235,0.22)'); ell(c, x + w * 0.3, y - 8, w * 0.5, 10, 'rgba(225,215,245,0.2)');
    }
    // 먼 산과 탑
    c.fillStyle = '#343d69'; c.beginPath(); c.moveTo(1080, 360); c.lineTo(1260, 180); c.lineTo(1330, 220); c.lineTo(1470, 80); c.lineTo(1600, 140); c.lineTo(1600, 360); c.closePath(); c.fill();
    c.fillStyle = '#29325a'; c.beginPath(); c.moveTo(1180, 360); c.lineTo(1390, 240); c.lineTo(1520, 270); c.lineTo(1600, 230); c.lineTo(1600, 360); c.closePath(); c.fill();
    for (let k = 0; k < 3; k++) {
      const y = 208 - k * 28, w = 64 - k * 14, x = 1508;
      c.fillStyle = '#1d2242'; c.fillRect(x - w * 0.35, y - 18, w * 0.7, 18);
      c.fillStyle = '#ffcf7a'; c.fillRect(x - 6, y - 14, 12, 8);
      c.fillStyle = '#151a33'; c.beginPath(); c.moveTo(x - w / 2 - 8, y - 16); c.lineTo(x + w / 2 + 8, y - 16); c.lineTo(x + w * 0.28, y - 30); c.lineTo(x - w * 0.28, y - 30); c.closePath(); c.fill();
    }
    // 지붕 (기와)
    c.save();
    c.beginPath(); c.moveTo(30, 290); c.lineTo(1600, 330); c.lineTo(1150, 0); c.lineTo(360, 0); c.lineTo(30, 190); c.closePath();
    c.fillStyle = '#2b2933'; c.fill(); c.clip();
    c.strokeStyle = 'rgba(70,66,84,0.9)'; c.lineWidth = 3;
    for (let y = 14; y < 340; y += 17) { c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= 1600; x += 40) c.quadraticCurveTo(x + 20, y + 5, x + 40, y); c.stroke(); }
    c.strokeStyle = 'rgba(20,18,26,0.5)'; c.lineWidth = 2;
    for (let x = 0; x < 1600; x += 26) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 40, 340); c.stroke(); }
    c.restore();
    // 건물 정면
    c.fillStyle = '#4b2f21';
    c.beginPath(); c.moveTo(150, eaveY(150)); c.lineTo(1600, eaveY(1600)); c.lineTo(1600, 705); c.lineTo(150, 705); c.closePath(); c.fill();
    const bays = [150, 350, 550, 750, 950, 1150, 1350, 1550];
    for (let b = 0; b < bays.length; b++) {
      const x0 = bays[b] + 14, x1 = Math.min(1600, (bays[b + 1] || 1750) - 6);
      const y0 = eaveY(x0) + 46, y1 = 596;
      g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, '#ffe2a2'); g.addColorStop(1, '#f2ad55');
      c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = 'rgba(122,74,36,0.75)'; c.lineWidth = 3;
      for (let x = x0 + 36; x < x1; x += 36) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
      for (let y = y0 + 46; y < y1; y += 46) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
    }
    // 창 너머 신령 그림자
    const shadow = (x, h, wide) => {
      c.fillStyle = 'rgba(78,44,26,0.6)';
      c.beginPath(); c.ellipse(x, 596 - h * 0.78, wide * 0.5, h * 0.2, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(x - wide * 0.55, 596); c.quadraticCurveTo(x - wide * 0.6, 596 - h * 0.6, x, 596 - h * 0.62); c.quadraticCurveTo(x + wide * 0.6, 596 - h * 0.6, x + wide * 0.55, 596); c.closePath(); c.fill();
      circle(c, x - wide * 0.12, 596 - h * 0.8, 3, 'rgba(255,240,190,0.9)'); circle(c, x + wide * 0.12, 596 - h * 0.8, 3, 'rgba(255,240,190,0.9)');
    };
    shadow(640, 150, 70); shadow(1250, 130, 60); shadow(1440, 150, 72); shadow(1515, 110, 50);
    // 기둥과 보
    c.fillStyle = '#3a2418';
    for (const x of bays) c.fillRect(x - 4, eaveY(x), 22, 705 - eaveY(x));
    c.fillRect(150, 596, 1450, 18);
    c.beginPath(); c.moveTo(150, eaveY(150) + 30); c.lineTo(1600, eaveY(1600) + 30); c.lineTo(1600, eaveY(1600) + 46); c.lineTo(150, eaveY(150) + 46); c.closePath(); c.fill();
    // 처마
    c.fillStyle = '#3a2418'; c.beginPath(); c.moveTo(20, 282); c.lineTo(1600, 322); c.lineTo(1600, 342); c.lineTo(20, 302); c.closePath(); c.fill();
    c.fillStyle = '#5a3a26'; c.beginPath(); c.moveTo(20, 282); c.lineTo(1600, 322); c.lineTo(1600, 327); c.lineTo(20, 287); c.closePath(); c.fill();
    // 난간
    c.fillStyle = '#2b1a12'; c.fillRect(150, 614, 1450, 91);
    c.fillStyle = '#4a2e1e'; c.fillRect(150, 622, 1450, 10); c.fillRect(150, 676, 1450, 10);
    for (let x = 160; x < 1600; x += 28) c.fillRect(x, 632, 8, 44);
    // 노렌
    const nx = 990, nw = 118, ny = 404, nh = 156;
    c.fillStyle = '#2b1a12'; c.fillRect(nx - 14, ny - 10, nw * 4 + 24 + 28, 12);
    for (let k = 0; k < 4; k++) {
      const x = nx + k * (nw + 8);
      g = c.createLinearGradient(x, 0, x + nw, 0);
      g.addColorStop(0, '#9c2e24'); g.addColorStop(0.5, '#b8392d'); g.addColorStop(1, '#962b22');
      c.fillStyle = g; c.fillRect(x, ny, nw, nh);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x + nw * 0.33, ny, 3, nh); c.fillRect(x + nw * 0.7, ny, 3, nh);
    }
    c.font = `bold 84px ${SERIF}`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f6e7cc';
    c.fillText('탕', nx + 2 * (nw + 8) + nw / 2, ny + nh * 0.5);
    // 툇마루
    c.fillStyle = '#5b3b27'; c.fillRect(150, 700, 1450, 22);
    c.strokeStyle = 'rgba(30,18,10,0.5)'; c.lineWidth = 2;
    for (let x = 150; x < 1600; x += 60) { c.beginPath(); c.moveTo(x, 700); c.lineTo(x, 722); c.stroke(); }
    // 노천탕
    g = c.createLinearGradient(0, 715, 0, 900);
    g.addColorStop(0, '#3a7a8e'); g.addColorStop(1, '#173d55');
    c.fillStyle = g; c.fillRect(0, 715, 1600, 185);
    for (let b = 1; b < bays.length; b++) {
      const x = bays[b] - 80;
      g = c.createLinearGradient(0, 722, 0, 880);
      g.addColorStop(0, 'rgba(255,214,140,0.38)'); g.addColorStop(1, 'rgba(255,214,140,0)');
      c.fillStyle = g;
      for (let k = 0; k < 7; k++) c.fillRect(x + Math.sin(k * 1.7) * 14, 726 + k * 22, 150 - k * 12, 9);
    }
    c.strokeStyle = 'rgba(220,240,250,0.25)'; c.lineWidth = 2;
    for (let k = 0; k < 26; k++) { const x = 400 + hash(k, 9) * 1150, y = 740 + hash(9, k) * 150; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 20, y - 4, x + 44, y); c.stroke(); }
    // 왼쪽 수풀
    for (const [x, y, r, col] of [[60, 700, 150, '#1f3324'], [250, 760, 140, '#26402c'], [80, 860, 170, '#2c4a31'], [330, 880, 120, '#35573a'], [460, 860, 90, '#2c4a31']]) ell(c, x, y, r, r * 0.6, col);
    for (let k = 0; k < 18; k++) {
      const x = 20 + hash(k, 5) * 480, y = 700 + hash(5, k) * 180;
      c.strokeStyle = k % 2 ? '#4f7a45' : '#3e6438'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, y + 30); c.quadraticCurveTo(x + 8, y, x + 24 + hash(k, k) * 20, y - 10); c.stroke();
    }
    // 바위
    tsRock(c, 560, 832, 150, 66); tsRock(c, 420, 880, 130, 52); tsRock(c, 700, 885, 120, 48, '#5f636d');
    tsRock(c, 1270, 878, 140, 52, '#5f636d'); tsRock(c, 1530, 815, 170, 74); tsRock(c, 1390, 840, 120, 58);
    // 석등
    c.fillStyle = '#7f7f7a'; c.fillRect(115, 832, 140, 30);
    c.fillStyle = '#8e8e88'; c.fillRect(162, 742, 46, 92);
    c.fillStyle = '#8a8a84'; c.fillRect(125, 652, 120, 92);
    c.fillStyle = '#ffd27e'; c.fillRect(145, 670, 34, 54); c.fillRect(192, 670, 34, 54);
    c.fillStyle = '#6f6f6a'; c.beginPath(); c.moveTo(92, 656); c.lineTo(278, 656); c.lineTo(232, 604); c.lineTo(138, 604); c.closePath(); c.fill();
    circle(c, 185, 594, 16, '#76766f');
    // 잠든 흰 여우
    {
      const fx = 1505, fy = 760;
      ell(c, fx + 46, fy + 8, 52, 26, '#f4efe7', -0.3);
      ell(c, fx + 74, fy - 4, 16, 12, '#e34d43', -0.3);
      ell(c, fx, fy + 10, 66, 32, '#f7f2ea');
      ell(c, fx - 48, fy, 30, 26, '#f7f2ea');
      tri(c, fx - 68, fy - 14, fx - 64, fy - 46, fx - 50, fy - 20, '#f7f2ea');
      tri(c, fx - 44, fy - 22, fx - 30, fy - 50, fx - 24, fy - 18, '#f7f2ea');
      tri(c, fx - 64, fy - 18, fx - 62, fy - 38, fx - 54, fy - 22, '#e88a8a');
      tri(c, fx - 40, fy - 24, fx - 32, fy - 42, fx - 28, fy - 22, '#e88a8a');
      c.strokeStyle = '#5a3a3a'; c.lineWidth = 2.4;
      c.beginPath(); c.arc(fx - 56, fy + 2, 6, 0.2, Math.PI - 0.2); c.stroke();
      c.beginPath(); c.arc(fx - 38, fy + 2, 6, 0.2, Math.PI - 0.2); c.stroke();
      ell(c, fx - 47, fy - 14, 4, 7, '#e34d43');
      ell(c, fx + 10, fy - 6, 16, 6, 'rgba(227,77,67,0.7)', 0.3);
    }
    // 벚나무
    c.strokeStyle = '#3a2a2b'; c.lineCap = 'round';
    for (const [w, pts] of [[30, [[-20, 620], [60, 420], [130, 260]]], [20, [[130, 260], [270, 150], [440, 110]]], [16, [[130, 260], [170, 90], [250, 0]]], [12, [[60, 420], [0, 330]]], [10, [[270, 150], [360, 40]]]]) {
      c.lineWidth = w; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 3) c.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); else c.lineTo(pts[1][0], pts[1][1]);
      c.stroke();
    }
    c.lineCap = 'butt';
    const clusters = [[60, 70, 110], [210, 40, 110], [350, 80, 100], [440, 140, 70], [100, 210, 110], [40, 350, 100], [170, 320, 80], [30, 500, 80], [300, 200, 70]];
    for (const [x, y, r] of clusters) ell(c, x, y, r, r * 0.75, 'rgba(232,150,176,0.55)');
    let n = 0;
    for (const [x, y, r] of clusters) {
      for (let k = 0; k < 18; k++, n++) {
        const a = hash(n, 11) * Math.PI * 2, d = Math.sqrt(hash(11, n)) * r;
        const cols = ['#f8c6d3', '#f2a4bc', '#fbd9e3', '#ee93ae'];
        tsFlower(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.75, 11 + hash(n, n) * 9, cols[n % 4], hash(n, 2) * 6);
      }
    }
    // 매달린 등롱
    c.strokeStyle = '#2a1a12'; c.lineWidth = 3; c.beginPath(); c.moveTo(330, 120); c.lineTo(330, 212); c.stroke();
    c.fillStyle = '#2a1a12'; c.fillRect(298, 206, 64, 16); c.fillRect(298, 382, 64, 16);
    g = c.createRadialGradient(320, 290, 10, 330, 300, 90);
    g.addColorStop(0, '#ffb070'); g.addColorStop(0.6, '#e8613f'); g.addColorStop(1, '#b9402a');
    c.fillStyle = g; c.beginPath(); c.ellipse(330, 302, 66, 88, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(140,40,20,0.55)'; c.lineWidth = 2;
    for (let y = 236; y < 380; y += 18) { const hw = Math.sqrt(Math.max(0, 1 - ((y - 302) / 88) ** 2)) * 66; c.beginPath(); c.moveTo(330 - hw, y); c.quadraticCurveTo(330, y + 6, 330 + hw, y); c.stroke(); }
    c.font = 'bold 70px "Apple SD Gothic Neo", sans-serif'; c.fillStyle = '#fff1d8'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('♨', 330, 310);
  }
  /* 판화풍 배경 위에 코드로 얹는 연출 (1600×900 기준): 등불 깜빡임·김·전경 바위·꽃잎 */
  function tsStyledFx(ctx, t) {
    // 등롱·석등 불빛 — 그라데이션 대신 단색 원을 겹쳐 평면적으로
    [[346, 269, 112], [212, 731, 88]].forEach(([x, y, r], k) => {
      const a = 0.07 + Math.sin(t * 3 + k) * 0.02 + Math.sin(t * 7.3 + k) * 0.01;
      circle(ctx, x, y, r * 1.5, `rgba(245,190,110,${a * 0.6})`);
      circle(ctx, x, y, r, `rgba(245,190,110,${a})`);
    });
    // 김
    [600, 800, 975, 1162, 700, 1075, 880].forEach((x0, i) => {
      const p = ((t * 15 + i * 59) % 262) / 262;
      const y = 894 - p * 262, x = x0 + Math.sin(t * 0.8 + i) * 18 + p * 25;
      ctx.fillStyle = `rgba(236,230,214,${Math.sin(p * Math.PI) * 0.14})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 50 + p * 38, 18 + p * 10, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 32, y - 12, 32 + p * 25, 14 + p * 8, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 30, y - 8, 28 + p * 20, 11 + p * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // 전경 바위 실루엣과 풀
    for (const [x, y, rx, ry] of [[1462, 800, 188, 88], [1588, 762, 88, 62], [475, 890, 175, 38]]) {
      ctx.fillStyle = '#0b0e1c';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0); ctx.lineTo(x + rx, y + ry); ctx.lineTo(x - rx, y + ry); ctx.fill();
      ctx.strokeStyle = '#222842'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke();
    }
    ctx.fillStyle = '#080a14';
    for (let i = 0; i < 30; i++) {
      const x = 1300 + i * 10, hh = 30 + (i * 37 % 42);
      ctx.beginPath(); ctx.moveTo(x, 905); ctx.quadraticCurveTo(x + 5, 905 - hh * 0.6, x + 12, 905 - hh); ctx.lineTo(x + 7, 905); ctx.fill();
    }
    // 꽃잎
    for (let i = 0; i < 30; i++) {
      const sp = 0.6 + hash(i, 13) * 0.8;
      const x = ((hash(i, 17) * 1800 + t * 30 * sp) % 1800) - 100 + Math.sin(t * 1.1 + i) * 30;
      const y = ((hash(17, i) * 1000 + t * 40 * sp) % 1000) - 60;
      ell(ctx, x, y, 6, 3.2, i % 3 ? '#e3a0ae' : '#f2c6cb', t * sp * 1.6 + i);
    }
    // 변환이 끝난 직후 부드럽게 나타나기
    const fade = 1 - Math.min(1, (performance.now() - TS.readyAt) / 600);
    if (fade > 0) { ctx.fillStyle = `rgba(13,17,36,${fade})`; ctx.fillRect(0, 0, TW, THt); }
  }
  function titleScene(ctx, W, H, t, dpr) {
    if (W < 1 || H < 1) return;   // 창이 숨겨져 크기가 0일 때
    const s = Math.max(W / TW, H / THt), ox = (W - TW * s) / 2, oy = (H - THt * s) / 2;
    const bg = Assets.imgs.title_bg;
    const key = `${W}x${H}x${dpr}:${TS.styled ? 2 : bg && bg.img.complete ? 1 : 0}`;
    if (!TS.cache || TS.key !== key) {
      TS.cache = TS.cache || document.createElement('canvas');
      TS.cache.width = Math.round(W * dpr); TS.cache.height = Math.round(H * dpr);
      const c = TS.cache.getContext('2d');
      c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      tsStatic(c);
      TS.key = key;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(TS.cache, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
    if (TS.styled) { tsStyledFx(ctx, t); ctx.restore(); return; }
    if (bg && bg.img.complete && bg.img.naturalWidth) { ctx.restore(); return; }   // 판화풍 변환 중
    // 불빛
    ctx.globalCompositeOperation = 'lighter';
    const lights = [[330, 300, 230, 0.32], [185, 698, 150, 0.28]];
    for (const [x, y, r, a] of lights) {
      const k = a * (0.9 + Math.sin(t * 2.3 + x) * 0.08);
      const g = ctx.createRadialGradient(x, y, 6, x, y, r);
      g.addColorStop(0, `rgba(255,170,90,${k})`); g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    // 김
    for (let i = 0; i < 14; i++) {
      const life = ((t * 0.1 + hash(i, 4)) % 1);
      const x = 420 + hash(i, 7) * 1150 + Math.sin(t * 0.6 + i) * 30;
      const y = 860 - life * 240;
      const r = 40 + life * 90;
      ctx.fillStyle = `rgba(255,255,255,${0.07 * Math.sin(life * Math.PI)})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 꽃잎
    for (let i = 0; i < 46; i++) {
      const sp = 0.6 + hash(i, 13) * 0.8;
      const x = ((hash(i, 17) * 1800 + t * 38 * sp) % 1800) - 100 + Math.sin(t * 1.3 + i) * 24;
      const y = ((hash(17, i) * 1000 + t * 52 * sp) % 1000) - 60;
      ell(ctx, x, y, 6, 3.6, i % 3 ? 'rgba(248,190,208,0.92)' : 'rgba(240,160,186,0.92)', t * sp * 2 + i);
    }
    ctx.restore();
  }

  return { world, background, vignette, portrait, endingArt, drawChar, titleScene, FONT };
})();
