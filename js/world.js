'use strict';
// ============================================================
//  世界：地圖產生、碰撞、tile 繪製（預先渲染）
//  tile: 0 地板 / 1 牆 / 2 裝飾地板 / 3 障礙物
// ============================================================
(function () {
  const TS = 16;
  const U = G.U;

  const solidT = (t) => t === 1 || t === 3;
  function grid(c, r, fill) { return { cols: c, rows: r, t: new Uint8Array(c * r).fill(fill) }; }
  function get(m, x, y) { return x < 0 || y < 0 || x >= m.cols || y >= m.rows ? 1 : m.t[y * m.cols + x]; }
  function set(m, x, y, v) { if (x >= 0 && y >= 0 && x < m.cols && y < m.rows) m.t[y * m.cols + x] = v; }
  function rect(m, x, y, w, h, v) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(m, i, j, v); }
  function solidAt(m, px, py) { return solidT(get(m, Math.floor(px / TS), Math.floor(py / TS))); }
  function boxHits(m, x, y, r) {
    return solidAt(m, x - r, y - r) || solidAt(m, x + r, y - r) || solidAt(m, x - r, y + r) || solidAt(m, x + r, y + r);
  }
  function move(m, e, dx, dy) {
    let hit = false;
    // 大位移切小步，避免穿牆
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx) { if (!boxHits(m, e.x + sx, e.y, e.r)) e.x += sx; else hit = true; }
      if (sy) { if (!boxHits(m, e.x, e.y + sy, e.r)) e.y += sy; else hit = true; }
    }
    return hit;
  }
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  // ---------- 繪圖工具 ----------
  let C = null;
  const f = (c, x, y, w, h) => { C.fillStyle = c; C.fillRect(x, y, w, h); };
  const circ = (c, x, y, r) => { C.fillStyle = c; C.beginPath(); C.arc(x, y, r, 0, U.TAU); C.fill(); };
  const shadow = (px, py) => f('rgba(0,0,0,.28)', px + 2, py + 3, 14, 13);

  const PAINT = {
    hub: {
      floor(px, py, r, tx, ty) {
        f((tx + ty) % 2 ? '#efe4d4' : '#e6d8c4', px, py, 16, 16);
        f('rgba(0,0,0,.05)', px, py + 15, 16, 1);
      },
      deco(px, py, r, tx) {
        f('#E1002B', px, py, 16, 16); f('#b3001f', px, py, 16, 1); f('#b3001f', px, py + 15, 16, 1);
        if (tx % 2) f('#f2c14e', px + 7, py + 7, 2, 2);
      },
      wallTop(px, py) { f('#2B2320', px, py, 16, 16); },
      wallFace(px, py, r) {
        f('#4a3a35', px, py, 16, 16); f('#E1002B', px, py + 11, 16, 2);
        if (r < 0.3) {
          f('#f5f2f1', px + 3, py + 1, 10, 9);
          f(['#ff6fb5', '#5ce1ff', '#a77bff'][Math.floor(r * 10) % 3], px + 4, py + 2, 8, 7);
          f('#ffd84f', px + 7, py + 4, 2, 2);
        }
        f('#2B2320', px, py + 14, 16, 2);
      },
      obs(px, py) {
        f('rgba(0,0,0,.2)', px + 3, py + 13, 11, 3);
        f('#8a5a3a', px + 4, py + 9, 8, 6); f('#6e4529', px + 4, py + 9, 8, 1);
        circ('#2f8a57', px + 8, py + 6, 5); circ('#3fa36b', px + 6, py + 5, 3); circ('#3fa36b', px + 10, py + 4, 3); circ('#5cc285', px + 8, py + 2, 2);
      },
    },
    practice: {
      floor(px, py, r, tx, ty) {
        f('#b9824f', px, py, 16, 16);
        for (let k = 0; k < 4; k++) {
          f('#a3703f', px, py + k * 4 + 3, 16, 1);
          f('#94653a', px + ((tx * 3 + ty * 7 + k * 5) % 16), py + k * 4, 1, 3);
        }
        if (r < 0.3) f('#c58f5c', px + Math.floor(r * 40), py + Math.floor(r * 400) % 14, 2, 1);
      },
      deco(px, py, r) {
        if (r < 0.5) { f('#f2c14e', px + 4, py + 7, 8, 2); f('#f2c14e', px + 7, py + 4, 2, 8); }
        else { f('#5ce1ff', px + 3, py + 3, 3, 1); f('#5ce1ff', px + 3, py + 3, 1, 3); f('#5ce1ff', px + 10, py + 12, 3, 1); f('#5ce1ff', px + 12, py + 10, 1, 3); }
      },
      wallTop(px, py) { f('#2a2230', px, py, 16, 16); f('#332a3a', px, py, 16, 1); },
      wallFace(px, py, r, tx) {
        f('#6e5f78', px, py, 16, 16); f('#bfe3f0', px + 1, py + 1, 14, 10);
        const o = (tx % 3) * 3;
        f('#eaf8fd', px + 3 + o, py + 2, 2, 3); f('#eaf8fd', px + 2 + o, py + 5, 2, 3); f('#eaf8fd', px + 1 + o, py + 8, 2, 2);
        f('#3a3042', px, py + 12, 16, 4);
      },
      obs(px, py) {
        shadow(px, py);
        f('#1b1b1f', px + 1, py + 1, 14, 14); f('#2c2c33', px + 1, py + 1, 14, 1);
        circ('#3a3a44', px + 8, py + 5, 3); circ('#111', px + 8, py + 5, 1.2);
        circ('#3a3a44', px + 8, py + 11, 2.5); circ('#111', px + 8, py + 11, 1);
        f('#E1002B', px + 12, py + 2, 1, 1);
      },
    },
    street: {
      floor(px, py, r, tx, ty) {
        f('#4b4b55', px, py, 16, 16);
        for (let k = 0; k < 4; k++) {
          const q = hash(tx * 7 + k, ty * 13 + k);
          f(q < 0.5 ? '#56565f' : '#41414a', px + Math.floor(q * 997) % 15, py + Math.floor(q * 7919) % 15, 1, 1);
        }
      },
      deco(px, py, r) {
        if (r < 0.5) for (let k = 0; k < 4; k++) f('#cfcfd4', px + 1 + k * 4, py + 2, 2, 12);
        else if (r < 0.8) f('#e8c547', px, py + 7, 16, 2);
        else { circ('#3a3a42', px + 8, py + 8, 6); f('#2c2c33', px + 3, py + 7, 10, 1); f('#2c2c33', px + 3, py + 9, 10, 1); }
      },
      wallTop(px, py) { f('#231a1f', px, py, 16, 16); },
      wallFace(px, py, r) {
        f('#7a3a2e', px, py, 16, 16);
        for (let k = 0; k < 4; k++) {
          f('#5a2a20', px, py + 3 + k * 4, 16, 1);
          for (let x = (k % 2) * 4; x < 16; x += 8) f('#5a2a20', px + x, py + k * 4, 1, 3);
        }
        if (r < 0.2) { f('rgba(0,0,0,.5)', px + 2, py + 2, 12, 8); f(r < 0.1 ? '#ff4fa3' : '#4fd1ff', px + 3, py + 3, 10, 6); f('rgba(255,255,255,.5)', px + 4, py + 4, 3, 1); }
      },
      obs(px, py, r) {
        shadow(px, py);
        if (r < 0.5) {
          f('#2e6b4f', px + 3, py + 3, 10, 12); f('#3d8a66', px + 2, py + 1, 12, 3);
          f('#255a42', px + 5, py + 6, 1, 8); f('#255a42', px + 8, py + 6, 1, 8); f('#255a42', px + 11, py + 6, 1, 8);
        } else {
          f('#c0283a', px + 1, py + 1, 14, 15); f('#9fe6ff', px + 3, py + 3, 7, 6);
          f('#ffd84f', px + 11, py + 4, 2, 1); f('#ffd84f', px + 11, py + 6, 2, 1); f('#ffd84f', px + 11, py + 8, 2, 1);
          f('#222', px + 3, py + 11, 10, 2);
        }
      },
    },
    stage: {
      floor(px, py, r) {
        f('#1c1230', px, py, 16, 16); f('#2a1c48', px, py, 16, 1); f('#2a1c48', px, py, 1, 16);
        if (r < 0.08) f('#5c3d8f', px + 6, py + 6, 2, 2);
      },
      deco(px, py, r) {
        if (r < 0.6) {
          const g = C.createRadialGradient(px + 8, py + 8, 1, px + 8, py + 8, 9);
          g.addColorStop(0, 'rgba(255,190,240,.35)'); g.addColorStop(1, 'rgba(255,190,240,0)');
          C.fillStyle = g; C.fillRect(px, py, 16, 16);
        } else { f('#ffd84f', px + 7, py + 6, 1, 3); f('#ffd84f', px + 6, py + 7, 3, 1); }
      },
      wallTop(px, py) { f('#0b0614', px, py, 16, 16); },
      wallFace(px, py, r, tx, ty) {
        f('#140b24', px, py, 16, 16);
        const cols = ['#ff2fd0', '#5ce1ff', '#ffd84f', '#2a1a40', '#2a1a40'];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) f(cols[Math.floor(hash(tx * 4 + i, ty * 3 + j) * 5)], px + 1 + i * 4, py + 1 + j * 4, 2, 2);
        f('#E1002B', px, py + 14, 16, 2);
      },
      obs(px, py, r) {
        shadow(px, py);
        if (r < 0.5) {
          f('#0e0e12', px + 1, py + 1, 14, 14); f('#7a3cbc', px + 1, py + 1, 14, 1);
          circ('#2c2c36', px + 8, py + 6, 4); circ('#000', px + 8, py + 6, 1.5); circ('#2c2c36', px + 8, py + 12, 2);
        } else {
          f('#2b2b33', px + 2, py + 3, 12, 10); f('#44444f', px + 2, py + 3, 12, 1);
          circ('#ffd84f', px + 5, py + 8, 2.5); circ('#ff2fd0', px + 11, py + 8, 2.5);
          circ('rgba(255,255,255,.7)', px + 5, py + 7, 0.8); circ('rgba(255,255,255,.7)', px + 11, py + 7, 0.8);
        }
      },
    },
  };

  function finalize(m) {
    const cv = document.createElement('canvas');
    cv.width = m.cols * TS; cv.height = m.rows * TS;
    C = cv.getContext('2d');
    const P = PAINT[m.theme];
    for (let ty = 0; ty < m.rows; ty++) {
      for (let tx = 0; tx < m.cols; tx++) {
        const t = get(m, tx, ty), px = tx * TS, py = ty * TS, r = hash(tx, ty);
        if (t === 1) {
          if (get(m, tx, ty + 1) !== 1) P.wallFace(px, py, r, tx, ty); else P.wallTop(px, py, r, tx, ty);
          continue;
        }
        P.floor(px, py, r, tx, ty);
        if (t === 2) P.deco(px, py, r, tx, ty);
        if (t === 3) P.obs(px, py, r, tx, ty);
      }
    }
    m.canvas = cv;
    // 小地圖
    const mc = document.createElement('canvas');
    mc.width = m.cols; mc.height = m.rows;
    const mx = mc.getContext('2d');
    for (let ty = 0; ty < m.rows; ty++) for (let tx = 0; tx < m.cols; tx++) {
      mx.fillStyle = solidT(get(m, tx, ty)) ? '#120c14' : '#5a4a66';
      mx.fillRect(tx, ty, 1, 1);
    }
    m.mini = mc;
    C = null;
    return m;
  }

  function buildHub() {
    const m = grid(30, 17, 0);
    m.theme = 'hub'; m.kind = 'hub';
    rect(m, 0, 0, 30, 2, 1); rect(m, 0, 16, 30, 1, 1); rect(m, 0, 0, 1, 17, 1); rect(m, 29, 0, 1, 17, 1);
    rect(m, 1, 8, 24, 1, 2);
    [[1, 2], [28, 2], [1, 15], [28, 15], [11, 13], [17, 13], [5, 13]].forEach(([x, y]) => set(m, x, y, 3));
    m.spawn = { x: 4 * TS + 8, y: 8 * TS + 8 };
    m.npcs = [
      { id: 'shop', name: '商店 Mina', sprite: 'npc_shop', x: 8 * TS + 8, y: 4 * TS + 8 },
      { id: 'trainer', name: '訓練師 Jay', sprite: 'npc_trainer', x: 14 * TS + 8, y: 4 * TS + 8 },
      { id: 'manager', name: '經紀人 Kim', sprite: 'npc_mgr', x: 20 * TS + 8, y: 4 * TS + 8 },
    ];
    m.portals = [1, 2, 3].map((z, i) => ({ zone: z, x: 26 * TS + 8, y: (4 + i * 4) * TS + 8 }));
    return finalize(m);
  }

  function buildZone(z) {
    const W = 64, H = 40;
    const m = grid(W, H, 0);
    m.theme = z.theme; m.kind = 'zone';
    rect(m, 0, 0, W, 2, 1); rect(m, 0, H - 1, W, 1, 1); rect(m, 0, 0, 1, H, 1); rect(m, W - 1, 0, 1, H, 1);
    for (let i = 0; i < 14; i++) rect(m, U.randInt(4, 42), U.randInt(3, H - 6), U.randInt(1, 3), U.randInt(1, 3), 1);
    for (let i = 0; i < 70; i++) rect(m, U.randInt(3, 43), U.randInt(3, H - 4), U.randInt(1, 2), U.randInt(1, 2), 3);
    // Boss 競技場
    rect(m, 45, 2, 18, H - 3, 1);
    rect(m, 46, 8, 17, 24, 0);
    rect(m, 45, 17, 1, 6, 0);
    // 蜿蜒主路徑：出生點 → 競技場入口
    let cx = 3, cy = 20;
    while (cx < 44) {
      rect(m, cx - 1, cy - 1, 3, 3, 0);
      if (Math.random() < 0.6) cx++;
      else cy = U.clamp(cy + (Math.random() < 0.5 ? -1 : 1), 4, H - 5);
    }
    const y0 = Math.min(cy, 20), y1 = Math.max(cy, 20);
    for (let y = y0; y <= y1; y++) rect(m, 43, y - 1, 3, 3, 0);
    rect(m, 43, 18, 3, 4, 0);
    rect(m, 1, 16, 7, 9, 0);
    // 裝飾
    for (let i = 0; i < 150; i++) {
      const x = U.randInt(1, W - 2), y = U.randInt(2, H - 2);
      if (get(m, x, y) === 0) set(m, x, y, 2);
    }
    // 連通性：從出生點 flood fill，孤立區塊填成牆
    const seen = new Uint8Array(W * H);
    const q = [3 + 20 * W];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, ni = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ni] || solidT(m.t[ni])) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    m.floor = [];
    for (let i = 0; i < W * H; i++) {
      if (solidT(m.t[i])) continue;
      if (!seen[i]) { m.t[i] = 1; continue; }
      const x = i % W, y = (i / W) | 0;
      if (x > 9 && x < 44) m.floor.push({ x: x * TS + 8, y: y * TS + 8 });
    }
    m.spawn = { x: 5 * TS + 8, y: 20 * TS + 8 };
    m.portals = [{ toHub: true, x: 2 * TS + 8, y: 20 * TS + 8 }];
    m.bossSpawn = { x: 55 * TS, y: 20 * TS };
    m.npcs = [];
    return finalize(m);
  }

  G.World = { TS, get, solidAt, boxHits, move, buildHub, buildZone };
})();
