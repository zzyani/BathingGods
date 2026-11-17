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
    for (const L of AREA_LABELS) {
      text(ctx, L.text, sx(L.x, L.y), sy(L.x, L.y), 15, 'rgba(255,240,210,0.26)', { bold: true, serif: true });
    }
    // 대기석 방석
    for (const [x, y] of QUEUE_SPOTS) {
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
  function isWall(i, j) { return i >= 0 && j >= 0 && i < MAP_W && j < MAP_H && MAP_ROWS[j][i] === '#'; }
  function wallHeight(i, j) {
    if (i === MAP_W - 1 || j === MAP_H - 1) return 14;
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
  function door(ctx, t) {
    const x1 = sx(DOOR.x + 0.55, DOOR.y + 0.02), y1 = sy(DOOR.x + 0.55, DOOR.y + 0.02);
    const x2 = sx(DOOR.x + 0.55, DOOR.y + 0.98), y2 = sy(DOOR.x + 0.55, DOOR.y + 0.98);
    const H = 62;
    ctx.fillStyle = '#3a221a';
    ctx.fillRect(x1 - 2.5, y1 - H, 5, H);
    ctx.fillRect(x2 - 2.5, y2 - H, 5, H);
    ctx.strokeStyle = '#3a221a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x1 - 6, y1 - H - 3); ctx.lineTo(x2 + 6, y2 - H - 3); ctx.stroke();
    ctx.lineWidth = 1;
    // 노렌(천)
    const wave = Math.sin(t * 1.8) * 1.5;
    ctx.fillStyle = '#8e2a22';
    ctx.beginPath();
    ctx.moveTo(x1, y1 - H); ctx.lineTo(x2, y2 - H);
    ctx.lineTo(x2 + wave, y2 - H + 26); ctx.lineTo(x1 + wave, y1 - H + 26);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.moveTo((x1 + x2) / 2, (y1 + y2) / 2 - H); ctx.lineTo((x1 + x2) / 2 + wave, (y1 + y2) / 2 - H + 26); ctx.stroke();
    text(ctx, '湯', (x1 + x2) / 2 + wave * 0.5, (y1 + y2) / 2 - H + 13, 13, '#f5e6c8', { bold: true, serif: true });
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
      drawChar(ctx, o.guest, cx, cy + (o.guest.type === 'kaonashi' ? 24 : 13), t, { bath: true });
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
    }
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
    const fl = 0.75 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7) * 0.1;
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
      case 'shelf': shelf(ctx, o); break;
      case 'crate': crate(ctx, o); break;
      case 'furnace': furnace(ctx, o, t); break;
      case 'counter': counter(ctx, o); break;
    }
  }

  /* ---------- 캐릭터 ---------- */
  function chihiro(ctx, x, y, t, moving, faceDir, alpha = 1) {
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
    }
    ctx.restore();
  }

  function kaonashi(ctx, x, y, t, alpha = 1) {
    if (Assets.draw(ctx, 'kaonashi', x, y, false, alpha)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= alpha;
    ell(ctx, 0, 0, 14, 5, 'rgba(0,0,0,0.3)');
    const sway = Math.sin(t * 1.6) * 1.5;
    ctx.fillStyle = 'rgba(14,11,20,0.92)';
    ctx.beginPath(); ctx.moveTo(-15, 0);
    ctx.bezierCurveTo(-16 + sway * 0.3, -30, -13 + sway, -66, sway, -68);
    ctx.bezierCurveTo(13 + sway, -66, 16 + sway * 0.3, -30, 15, 0);
    ctx.quadraticCurveTo(0, 4, -15, 0);
    ctx.fill();
    const mx = sway * 0.9, my = -50;
    ell(ctx, mx, my, 8.5, 11.5, '#f4f1ea');
    ell(ctx, mx - 3.6, my - 2, 2.1, 1.3, '#1a1420'); ell(ctx, mx + 3.6, my - 2, 2.1, 1.3, '#1a1420');
    ctx.fillStyle = '#7a4c8c';
    ctx.fillRect(mx - 4.2, my - 9, 1.2, 4); ctx.fillRect(mx + 3, my - 9, 1.2, 4);
    ctx.fillRect(mx - 4.2, my + 1, 1.2, 3.5); ctx.fillRect(mx + 3, my + 1, 1.2, 3.5);
    ctx.fillStyle = '#3a2a3a'; ctx.fillRect(mx - 2.5, my + 6.5, 5, 1.2);
    ctx.restore();
  }

  function drawChar(ctx, g, x, y, t, opt = {}) {
    const alpha = (g.alpha ?? 1) * (opt.alpha ?? 1);
    if (g.type === 'kaonashi') return kaonashi(ctx, x, y, t, alpha);
    spirit(ctx, g.type, x, y, t, { face: g.face || 1, moving: g.moving, alpha, bath: opt.bath, seed: g.id || 0 });
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
    const top = sy(g.x, g.y) - (g.type === 'kaonashi' ? 76 : 50);
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
      const y = cyBase - (o.guest.type === 'kaonashi' ? 82 : 60);
      const r = 1 - o.guest.bathT / BATH_TIME;
      circle(ctx, cx, y, 9, 'rgba(28,18,28,0.75)');
      ctx.strokeStyle = '#f2c96a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, y, 7, -Math.PI / 2, -Math.PI / 2 + r * Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
  function busyBar(ctx, p) {
    const x = sx(p.x, p.y), y = sy(p.x, p.y) - 58;
    const r = 1 - p.busy / p.busyTotal;
    rrect(ctx, x - 22, y - 4, 44, 8, 4, 'rgba(20,12,10,0.8)');
    rrect(ctx, x - 21, y - 3, 42 * r, 6, 3, '#9fd6f0');
    if (p.busyLabel) text(ctx, p.busyLabel, x, y - 12, 11, '#fff', { bold: true, stroke: 'rgba(0,0,0,0.6)' });
  }
  function floats(ctx, w) {
    for (const f of w.floats) {
      const a = Math.min(1, f.life / 0.5);
      ctx.globalAlpha = a;
      text(ctx, f.text, f.x, f.y - (f.max - f.life) * 16, f.size || 14, f.color || '#fff', { bold: true, stroke: 'rgba(25,15,20,0.85)', strokeW: 3.5 });
      ctx.globalAlpha = 1;
    }
  }
  function effects(ctx, w) {
    for (const e of w.effects) {
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
  function glow(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of LANTERNS) {
      const x = sx(L.x, L.y), y = sy(L.x, L.y) - 40;
      const r = 120 + Math.sin(t * 2 + L.x) * 6;
      const g = ctx.createRadialGradient(x, y, 4, x, y, r);
      g.addColorStop(0, 'rgba(255,170,90,0.2)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const fx = sx(11, 14), fy = sy(11, 14) - 14;
    const fr = 110 + Math.sin(t * 9) * 8;
    const g2 = ctx.createRadialGradient(fx, fy, 4, fx, fy, fr);
    g2.addColorStop(0, 'rgba(255,120,40,0.26)'); g2.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g2; ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    ctx.restore();
  }

  /* ---------- 월드 전체 ---------- */
  function world(ctx, w, t, hover) {
    const p = w.player;
    const showPlayer = !w.demo;
    const psx = sx(p.x, p.y), psy = sy(p.x, p.y), pk = p.x + p.y;

    for (let j = 0; j < MAP_H; j++) {
      for (let i = 0; i < MAP_W; i++) {
        const ch = MAP_ROWS[j][i];
        if (ch !== '#') floorTile(ctx, i, j, ch, t);
      }
    }
    pondDecor(ctx, t);
    floorDecor(ctx, w, t, hover);

    const list = [];
    for (let j = 0; j < MAP_H; j++) {
      for (let i = 0; i < MAP_W; i++) {
        if (MAP_ROWS[j][i] !== '#') continue;
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
    for (const L of LANTERNS) list.push({ k: L.wall[0] + L.wall[1] + 1.02, f: () => lantern(ctx, L, t) });
    list.push({ k: DOOR.x + DOOR.y + 1.02, f: () => door(ctx, t) });
    for (const o of w.objects) {
      if (o.kind === 'pond') continue;
      list.push({ k: o.x + o.w - 0.5 + o.y + o.h - 0.5, f: () => drawObject(ctx, o, t) });
    }
    for (const c of w.clueItems) {
      if (c.collected) continue;
      if (CLUES[c.id].npc) list.push({ k: c.x + c.y, f: () => kaonashi(ctx, sx(c.x, c.y), sy(c.x, c.y), t, 0.72 * c.alpha) });
      else list.push({ k: c.x + c.y, f: () => clueItem(ctx, c, t) });
    }
    for (const g of w.guests) {
      if (g.state === 'bathing') continue;
      list.push({ k: g.x + g.y, f: () => drawChar(ctx, g, sx(g.x, g.y), sy(g.x, g.y), t) });
    }
    if (w.ghost && w.ghost.alpha > 0.01) {
      const gh = w.ghost;
      list.push({ k: gh.x + gh.y, f: () => kaonashi(ctx, sx(gh.x, gh.y), sy(gh.x, gh.y), t, gh.alpha) });
    }
    if (showPlayer) list.push({ k: pk, f: () => chihiro(ctx, psx, psy, p.t, p.moving, p.face) });
    list.sort((a, b) => a.k - b.k);
    for (const d of list) d.f();

    effects(ctx, w);
    glow(ctx, t);
    for (const o of w.tubs) tubTag(ctx, o, t);
    for (const g of w.guests) guestOverlay(ctx, g, t);
    if (showPlayer && p.busy > 0) busyBar(ctx, p);
    floats(ctx, w);
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
  function portrait(canvas, kind) {
    const c = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const s = W / 120; // 캔버스 내부 해상도 대비 배율
    c.clearRect(0, 0, W, H);
    c.save();
    if (kind === 'kaonashi') {
      c.translate(W / 2, H * 1.02); c.scale(1.7 * s, 1.7 * s);
      kaonashi(c, 0, 0, 1, 1);
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

  return { world, background, vignette, portrait, endingArt, drawChar, FONT };
})();
