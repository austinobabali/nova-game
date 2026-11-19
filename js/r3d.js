'use strict';
// ============================================================
//  3D 繪圖層（Three.js）：只負責「畫」，遊戲邏輯沿用 2D 座標
//  座標換算：2D 像素 (x, y) → 3D (x*K, 高度, y*K)
// ============================================================
(function () {
  const K = 0.1;
  const R = (G.R3D = { ready: false, K });
  let T, renderer, scene, camera, composer, gradMap, outlineMat, SPH, BOX;
  let selGroup, selHeroes = [], world = null, curMap = null, player = null, playerId = '';
  let sun, last = performance.now(), sparks = null;
  const objs = { enemies: new Map(), projs: new Map(), hazards: new Map(), pickups: new Map(), fx: new Map() };
  const bg = {};

  // ---------- 小工具 ----------
  const toon = (color, emissive, ei) => new T.MeshToonMaterial({ color, gradientMap: gradMap, emissive: emissive || 0, emissiveIntensity: emissive ? (ei || 1.6) : 0 });
  const glow = (color, opacity) => new T.MeshBasicMaterial({ color, transparent: true, opacity: opacity == null ? 0.8 : opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  const cap = (r, l) => new T.CapsuleGeometry(r, l, 5, 14);
  const cyl = (a, b, h, s) => new T.CylinderGeometry(a, b, h, s || 18);
  function part(parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, outline = true) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
    parent.add(m);
    if (outline) { const o = new T.Mesh(geo, outlineMat); o.scale.setScalar(1.07); m.add(o); }
    return m;
  }
  function gradTex(top, bottom) {
    const c = document.createElement('canvas'); c.width = 2; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function disposeTree(o) {
    o.traverse((n) => {
      if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose();
      if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => { if (!m.userData.shared) { if (m.map) m.map.dispose(); m.dispose(); } });
    });
  }

  // ======================= 人物（主角 / NPC） =======================
  const SKIN = 0xffd6c2;
  const HERO = {
    amira: {
      hair: 0x1c1d3a, torso: SKIN, arm: SKIN, hand: 0xf2c14e, leg: 0xf2c14e, legR: 0.11, shoe: 0xf2c14e, ring: 0x5ce1ff,
      top(b) { part(b, cap(0.18, 0.05), toon(0x2f9e5f), 0, 0.87, 0, 1.03, 1, 0.85); },
      bottom(b) { part(b, SPH, toon(0x23305e), 0, 0.56, 0, 0.23, 0.12, 0.19); },
      hairExtra(h, m) { for (const s of [-1, 1]) part(h, SPH, m, 0.25 * s, 0.36, -0.04, 0.16, 0.16, 0.16); },
      weapon(arms) {
        const mat = toon(0xe8fbff, 0x8fe8ff, 1.8);
        for (const a of arms) for (let i = 0; i < 3; i++) part(a.hand, new T.ConeGeometry(0.02, 0.22, 6), mat, (i - 1) * 0.035, -0.13, 0.04, 1, 1, 1, false).rotation.x = Math.PI;
      },
    },
    luna: {
      hair: 0x9d5be0, torso: 0xffffff, arm: 0xf5c518, hand: SKIN, leg: SKIN, legR: 0.075, shoe: 0x1b1b22, ring: 0xb98cff,
      top(b) {
        const y = toon(0xf5c518);
        for (const s of [-1, 1]) part(b, cap(0.09, 0.15), y, 0.12 * s, 0.83, -0.01, 1, 1, 0.95);
      },
      bottom(b) {
        part(b, cap(0.17, 0.06), toon(0x1f2a44), 0, 0.56, 0, 1, 1, 0.85);
        part(b, cyl(0.178, 0.178, 0.035), toon(0xb3263a), 0, 0.64, 0, 1, 1, 0.86, false);
      },
      hairExtra(h, m) {
        part(h, SPH, m, 0, 0.33, -0.05, 0.3, 0.22, 0.3);
        for (let i = 0; i < 9; i++) { const r = 0.1 - i * 0.005; part(h, SPH, m, 0.24 + Math.sin(i * 0.5) * 0.03, -0.12 - i * 0.12, -0.2 + i * 0.015, r, r * 1.15, r); }
        part(h, SPH, toon(0xf2c14e), 0.25, -1.2, -0.08, 0.06, 0.08, 0.06);
      },
      weapon(arms) {
        const g = new T.Group(); arms[1].hand.add(g);
        part(g, cyl(0.022, 0.022, 0.16), toon(0x3b1d6b), 0, 0.02, 0);
        part(g, new T.BoxGeometry(0.2, 0.035, 0.05), toon(0xf2c14e), 0, 0.11, 0);
        part(g, new T.BoxGeometry(0.06, 0.9, 0.018), toon(0xd9c2ff, 0xa06bff, 1.7), 0, 0.58, 0, 1, 1, 1, false);
        g.rotation.x = Math.PI * 0.55;
      },
    },
    rosa: {
      hair: 0xff8a6a, torso: SKIN, arm: SKIN, hand: SKIN, leg: 0x15151c, legR: 0.078, knee: 0xc0283a, shoe: 0x5a3424, ring: 0x5ce1ff,
      top(b) { part(b, cap(0.18, 0.05), toon(0x1b1b24), 0, 0.87, 0, 1.03, 1, 0.85); },
      bottom(b) { part(b, cyl(0.17, 0.28, 0.22, 24), toon(0xf2c14e), 0, 0.55, 0); },
      hairExtra(h, m) {
        for (let i = 0; i < 11; i++) { const r = 0.15 - i * 0.008; part(h, SPH, m, Math.sin(i * 0.4) * 0.03, 0.12 - i * 0.13, -0.45 - i * 0.012, r, r * 1.2, r * 0.9); }
        for (const s of [-1, 1]) part(h, cap(0.05, 0.42), m, 0.34 * s, -0.36, 0.06, 1, 1, 0.7);
      },
      weapon(arms) {
        const g = new T.Group(); arms[1].hand.add(g);
        part(g, cyl(0.024, 0.024, 1.9, 10), toon(0xe6ecf5, 0x8fb8ff, 0.35), 0, 0.35, 0);
        part(g, new T.ConeGeometry(0.065, 0.32, 6), toon(0xfff6c8, 0xffe27a, 2.0), 0, 1.45, 0, 1, 1, 0.45, false);
        part(g, new T.BoxGeometry(0.2, 0.03, 0.02), toon(0xf2c14e), 0, 1.3, 0, 1, 1, 1, false);
      },
    },
    npc_shop: {
      hair: 0xa77bff, torso: 0x3fa36b, arm: SKIN, hand: SKIN, leg: SKIN, legR: 0.075, shoe: 0x2b2320,
      top() {}, bottom(b) { part(b, cyl(0.17, 0.26, 0.24, 20), toon(0x5c4a3b), 0, 0.55, 0); },
      hairExtra(h, m) { part(h, SPH, m, 0, -0.12, -0.12, 0.44, 0.34, 0.32); }, weapon() {},
    },
    npc_trainer: {
      hair: 0x2b2320, torso: 0x2f6fd6, arm: 0x2f6fd6, hand: SKIN, leg: 0x2f6fd6, legR: 0.08, shoe: 0xffffff,
      top(b) { part(b, new T.BoxGeometry(0.03, 0.3, 0.02), toon(0xffffff), 0, 0.8, 0.15, 1, 1, 1, false); },
      bottom(b) { part(b, cap(0.17, 0.06), toon(0x2f6fd6), 0, 0.56, 0, 1, 1, 0.85); }, hairExtra() {}, weapon() {},
    },
    npc_mgr: {
      hair: 0x6b4a2e, torso: 0x2e2e38, arm: 0x2e2e38, hand: SKIN, leg: 0x2e2e38, legR: 0.08, shoe: 0x111111,
      top(b) { part(b, new T.BoxGeometry(0.1, 0.22, 0.02), toon(0xffffff), 0, 0.84, 0.15, 1, 1, 1, false); part(b, new T.BoxGeometry(0.04, 0.16, 0.02), toon(0xE1002B), 0, 0.82, 0.165, 1, 1, 1, false); },
      bottom(b) { part(b, cap(0.17, 0.06), toon(0x2e2e38), 0, 0.56, 0, 1, 1, 0.85); }, hairExtra() {}, weapon() {},
    },
  };

  function makePerson(def) {
    const root = new T.Group(), body = new T.Group();
    root.add(body);
    const skin = toon(SKIN);
    const legs = [];
    for (const s of [-1, 1]) {
      const p = new T.Group(); p.position.set(0.11 * s, 0.5, 0); body.add(p);
      part(p, cap(def.legR, 0.3), toon(def.leg), 0, -0.21, 0);
      if (def.knee) part(p, SPH, toon(def.knee), 0, -0.24, def.legR * 0.8, 0.055, 0.06, 0.03, false);
      part(p, SPH, toon(def.shoe), 0, -0.45, 0.03, 0.095, 0.075, 0.14);
      legs.push(p);
    }
    def.bottom(body);
    part(body, cap(0.17, 0.18), toon(def.torso), 0, 0.78, 0, 1, 1, 0.8);
    def.top(body);
    const arms = [];
    for (const s of [-1, 1]) {
      const p = new T.Group(); p.position.set(0.25 * s, 0.93, 0); p.rotation.z = 0.22 * s; body.add(p);
      part(p, cap(0.058, 0.26), toon(def.arm), 0, -0.17, 0);
      const hand = new T.Group(); hand.position.set(0, -0.36, 0); p.add(hand);
      part(hand, SPH, toon(def.hand), 0, 0, 0, 0.068, 0.072, 0.068);
      arms.push({ pivot: p, hand, s });
    }
    part(body, cap(0.055, 0.06), skin, 0, 1.03, 0, 1, 1, 1, false);
    const head = new T.Group(); head.position.set(0, 1.33, 0); body.add(head);
    part(head, SPH, skin, 0, 0, 0, 0.42, 0.4, 0.4);
    const white = new T.MeshBasicMaterial({ color: 0xffffff }), blush = new T.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.45 });
    for (const s of [-1, 1]) {
      part(head, SPH, skin, 0.41 * s, -0.04, 0, 0.06, 0.08, 0.05, false);
      part(head, SPH, toon(0x3a2418), 0.15 * s, -0.04, 0.355, 0.078, 0.105, 0.05, false);
      part(head, SPH, toon(0x8a5232), 0.15 * s, -0.08, 0.385, 0.05, 0.055, 0.02, false);
      part(head, SPH, white, 0.15 * s + 0.025, 0, 0.4, 0.026, 0.03, 0.01, false);
      part(head, BOX, toon(def.hair), 0.15 * s, 0.1, 0.375, 0.08, 0.014, 0.01, false).rotation.z = -0.12 * s;
      part(head, SPH, blush, 0.25 * s, -0.13, 0.31, 0.06, 0.035, 0.01, false);
    }
    part(head, SPH, toon(0xd9606a), 0, -0.18, 0.375, 0.04, 0.014, 0.01, false);
    const hm = toon(def.hair);
    part(head, new T.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hm, 0, 0.02, -0.02, 0.45, 0.44, 0.44).rotation.x = -0.7;
    part(head, SPH, hm, 0, -0.02, -0.1, 0.43, 0.4, 0.33);
    for (let i = -2; i <= 2; i++) part(head, SPH, hm, i * 0.11, 0.23 - Math.abs(i) * 0.035, 0.3, 0.12, 0.1, 0.08);
    def.hairExtra(head, hm);
    def.weapon(arms);
    return { root, body, head, legs, arms, def, t: Math.random() * 10, atkT: 0 };
  }

  const ATK = 0.3;
  function animPerson(h, dt, moving, id) {
    h.t += dt;
    const t = h.t, [L, Rl] = h.legs, [aL, aR] = h.arms;
    let bob;
    if (moving) {
      const s = Math.sin(t * 12);
      L.rotation.x = s * 0.7; Rl.rotation.x = -s * 0.7;
      aL.pivot.rotation.x = -s * 0.6; aR.pivot.rotation.x = s * 0.6;
      bob = Math.abs(Math.cos(t * 12)) * 0.05; h.body.rotation.x = 0.12;
    } else {
      L.rotation.x *= 0.8; Rl.rotation.x *= 0.8;
      aL.pivot.rotation.x = Math.sin(t * 2) * 0.06; aR.pivot.rotation.x = -Math.sin(t * 2) * 0.06;
      bob = Math.sin(t * 2.2) * 0.015; h.body.rotation.x *= 0.8;
    }
    h.body.rotation.y *= 0.8;
    if (h.atkT > 0) {
      h.atkT = Math.max(0, h.atkT - dt);
      const p = 1 - h.atkT / ATK, k = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
      if (id === 'rosa') { aR.pivot.rotation.x = -1.5 * k; h.body.rotation.y = -0.3 * k; }
      else if (id === 'amira') { aR.pivot.rotation.x = -1.7 * k; aL.pivot.rotation.x = -1.7 * Math.max(0, Math.sin(p * Math.PI * 2)); h.body.rotation.y = 0.4 * Math.sin(p * Math.PI * 2); }
      else { aR.pivot.rotation.x = p < 0.3 ? -2.7 * (p / 0.3) : -2.7 + 3.0 * ((p - 0.3) / 0.7); h.body.rotation.y = Math.sin(p * Math.PI) * 0.5; }
    }
    h.body.position.y = bob;
    h.head.rotation.z = Math.sin(t * 1.7) * 0.04;
  }

  // ======================= 怪物 / Boss =======================
  function eyes(g, y, z, dx, r, color) {
    for (const s of [-1, 1]) part(g, SPH, new T.MeshBasicMaterial({ color: color || 0x1b2440 }), dx * s, y, z, r, r * 1.3, r * 0.6, false);
  }
  const ENEMY = {
    note(g) {
      part(g, SPH, toon(0x7a4ad6), 0, 0.45, 0, 0.42, 0.36, 0.4);
      part(g, cyl(0.05, 0.05, 1.0, 8), toon(0x5a2fb0), 0.36, 0.95, 0);
      part(g, BOX, toon(0x5a2fb0), 0.55, 1.35, 0, 0.4, 0.12, 0.08);
      eyes(g, 0.52, 0.36, 0.13, 0.07, 0xff3355);
    },
    slime(g) { part(g, SPH, toon(0x7fb4e8), 0, 0.33, 0, 0.5, 0.36, 0.5); eyes(g, 0.4, 0.44, 0.15, 0.06); },
    troll(g) {
      part(g, cap(0.33, 0.45), toon(0x6b6b78), 0, 0.6, 0);
      part(g, SPH, toon(0x6b6b78), 0, 1.15, 0, 0.36, 0.36, 0.36);
      part(g, SPH, toon(0xe8c4a8), 0, 1.1, 0.12, 0.26, 0.26, 0.24, false);
      eyes(g, 1.13, 0.34, 0.09, 0.045, 0xc0182f);
      part(g, BOX, toon(0x111111, 0x5ce1ff, 1.4), 0.3, 0.7, 0.3, 0.14, 0.22, 0.03, false);
    },
    papa(g) {
      part(g, cap(0.32, 0.45), toon(0xb89a6a), 0, 0.6, 0);
      part(g, SPH, toon(0xe8c4a8), 0, 1.13, 0, 0.28, 0.28, 0.28);
      part(g, cyl(0.3, 0.3, 0.12), toon(0x3d3d48), 0, 1.35, 0); part(g, cyl(0.38, 0.38, 0.03), toon(0x3d3d48), 0, 1.3, 0.08);
      eyes(g, 1.15, 0.26, 0.09, 0.04);
      part(g, BOX, toon(0x16161b), 0, 0.8, 0.38, 0.4, 0.28, 0.2);
      part(g, cyl(0.1, 0.1, 0.12, 14), toon(0x223344, 0x8fd8ff, 1.5), 0, 0.8, 0.5, 1, 1, 1, false).rotation.x = Math.PI / 2;
    },
    anti(g) {
      part(g, new T.ConeGeometry(0.5, 1.4, 16), toon(0x2a1638), 0, 0.7, 0);
      part(g, SPH, toon(0x2a1638), 0, 1.35, 0, 0.34, 0.34, 0.34);
      part(g, SPH, toon(0x050308), 0, 1.33, 0.12, 0.25, 0.25, 0.22, false);
      eyes(g, 1.36, 0.34, 0.09, 0.05, 0xff2f4f);
    },
    bot(g) {
      part(g, new T.BoxGeometry(0.75, 0.75, 0.22), toon(0xc9ced8), 0, 0.75, 0);
      part(g, new T.BoxGeometry(0.55, 0.55, 0.05), toon(0x7d8594), 0, 0.75, 0.12, 1, 1, 1, false);
      eyes(g, 0.82, 0.15, 0.1, 0.05, 0xff3355);
      for (const s of [-1, 1]) part(g, new T.ConeGeometry(0.07, 0.2, 8), toon(0xff9d2f, 0xff9d2f, 2), 0.2 * s, 0.25, 0, 1, 1, 1, false).rotation.x = Math.PI;
    },
    metronome(g, e) {
      part(g, new T.ConeGeometry(1.5, 3.2, 4), toon(0xa0612f), 0, 1.6, 0).rotation.y = Math.PI / 4;
      part(g, new T.BoxGeometry(2.4, 0.3, 2.4), toon(0xf2c14e), 0, 0.15, 0);
      eyes(g, 1.6, 0.62, 0.3, 0.13, 0xff2f4f);
      const pend = new T.Group(); pend.position.set(0, 0.5, 0.78); g.add(pend);
      part(pend, new T.BoxGeometry(0.08, 2.4, 0.08), toon(0xf2c14e, 0xf2c14e, 0.4), 0, 1.2, 0);
      part(pend, new T.BoxGeometry(0.4, 0.3, 0.15), toon(0xd0d0d8), 0, 1.6, 0);
      e.pend = pend;
    },
    captain(g) {
      part(g, cap(0.85, 0.9), toon(0x8a6a3e), 0, 1.4, 0);
      part(g, SPH, toon(0xe8c4a8), 0, 2.65, 0, 0.6, 0.6, 0.6);
      part(g, new T.BoxGeometry(0.85, 0.16, 0.1), toon(0x0d0d12), 0, 2.72, 0.55, 1, 1, 1, false);
      part(g, cyl(0.85, 0.85, 0.06, 24), toon(0x26262e), 0, 3.05, 0); part(g, cyl(0.5, 0.55, 0.45, 24), toon(0x26262e), 0, 3.28, 0);
      part(g, new T.BoxGeometry(1.0, 0.7, 0.5), toon(0x16161b), 0.3, 1.6, 0.85);
      part(g, cyl(0.26, 0.26, 0.3, 18), toon(0x223344, 0x5ca8ff, 1.8), 0.3, 1.6, 1.15, 1, 1, 1, false).rotation.x = Math.PI / 2;
    },
    colossus(g, e) {
      part(g, new T.BoxGeometry(2.2, 2.0, 1.4), toon(0x3d1f5c), 0, 2.0, 0);
      part(g, new T.BoxGeometry(1.2, 1.0, 1.0), toon(0x3d1f5c), 0, 3.5, 0.1);
      eyes(g, 3.55, 0.62, 0.28, 0.1, 0xff2fd0);
      for (const s of [-1, 1]) {
        part(g, new T.ConeGeometry(0.15, 0.7, 8), toon(0x8a8a9a), 0.5 * s, 4.25, 0).rotation.z = -0.35 * s;
        part(g, new T.BoxGeometry(0.6, 1.8, 0.6), toon(0x24112f), 1.45 * s, 1.7, 0);
        part(g, new T.BoxGeometry(0.6, 1.0, 0.6), toon(0x24112f), 0.55 * s, 0.5, 0);
      }
      e.core = part(g, SPH, toon(0xff5ce1, 0xff5ce1, 2.2), 0, 2.1, 0.72, 0.35, 0.35, 0.2, false);
    },
  };
  function makeEnemy(e) {
    const g = new T.Group(), o = { root: g, mats: [] };
    (ENEMY[e.type] || ENEMY.slime)(g, o);
    g.traverse((n) => { if (n.isMesh && n.material.isMeshToonMaterial) { const mt = n.material; mt.userData.em = mt.emissive.getHex(); mt.userData.ei = mt.emissiveIntensity; o.mats.push(mt); } });
    if (e.boss) g.scale.setScalar(1.1);
    return o;
  }

  // ======================= 地圖 =======================
  const THEME = {
    hub: { bg: ['#3a2a4a', '#8a6a7a'], wall: 0x4a3a35, top: 0x2b2320, accent: 0xE1002B, wallH: 1.6 },
    practice: { bg: ['#1a1428', '#4a3a5a'], wall: 0x8fb7c9, top: 0x3a3042, accent: 0xffffff, wallH: 1.5 },
    street: { bg: ['#120c20', '#3a2040'], wall: 0x8a3b2e, top: 0x2a1f24, accent: 0xff4fa3, wallH: 1.5 },
    stage: { bg: ['#0a0618', '#2a1a5c'], wall: 0x1a0f2e, top: 0x0b0614, accent: 0xff2fd0, wallH: 1.4 },
  };
  function floorTexture(m) {
    const S = 32, c = document.createElement('canvas');
    c.width = m.cols * S; c.height = m.rows * S;
    const g = c.getContext('2d');
    const get = (x, y) => G.World.get(m, x, y);
    for (let ty = 0; ty < m.rows; ty++) for (let tx = 0; tx < m.cols; tx++) {
      const t = get(tx, ty), px = tx * S, py = ty * S, r = hash(tx, ty);
      const f = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(px + x, py + y, w, h); };
      if (t === 1) { f('#0c0812', 0, 0, S, S); continue; }
      switch (m.theme) {
        case 'hub':
          f((tx + ty) % 2 ? '#f1e6d6' : '#e4d5c0', 0, 0, S, S); f('rgba(0,0,0,.06)', 0, S - 1, S, 1); f('rgba(0,0,0,.06)', S - 1, 0, 1, S);
          if (t === 2) { f('#d0102f', 0, 0, S, S); f('#f2c14e', 0, 2, S, 2); f('#f2c14e', 0, S - 4, S, 2); }
          break;
        case 'practice': {
          f(`hsl(28,45%,${50 + r * 6}%)`, 0, 0, S, S);
          for (let k = 0; k < 4; k++) { f('rgba(70,40,20,.25)', 0, k * 8 + 7, S, 1); f('rgba(70,40,20,.25)', Math.floor(hash(tx * 4 + k, ty) * S), k * 8, 1, 7); }
          if (t === 2) { f('#f2c14e', 8, 14, 16, 4); f('#f2c14e', 14, 8, 4, 16); }
          break;
        }
        case 'street':
          f(`hsl(240,6%,${30 + r * 4}%)`, 0, 0, S, S);
          for (let k = 0; k < 6; k++) { const q = hash(tx * 7 + k, ty * 13 + k); f(q < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.12)', Math.floor(q * 997) % S, Math.floor(q * 7919) % S, 2, 2); }
          if (t === 2) { if (r < 0.6) for (let k = 0; k < 4; k++) f('#e8e8ee', 2 + k * 8, 3, 4, S - 6); else f('#e8c547', 0, 14, S, 4); }
          break;
        case 'stage':
          f('#1d1236', 0, 0, S, S); f('rgba(150,100,255,.35)', 0, 0, S, 1); f('rgba(150,100,255,.35)', 0, 0, 1, S);
          if (t === 2) { const gr = g.createRadialGradient(px + 16, py + 16, 1, px + 16, py + 16, 18); gr.addColorStop(0, 'rgba(255,170,240,.55)'); gr.addColorStop(1, 'rgba(255,170,240,0)'); g.fillStyle = gr; g.fillRect(px, py, S, S); }
          break;
      }
      if (t === 3) { const gr = g.createRadialGradient(px + 17, py + 19, 2, px + 17, py + 19, 18); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(px - 4, py - 4, S + 8, S + 8); }
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }
  // 障礙物造型（每種回傳零件清單，用 InstancedMesh 批次繪製）
  let PROPS = null;
  const getProps = () => PROPS || (PROPS = {
    hub: [[[cyl(0.32, 0.25, 0.5, 14), 0x8a5a3a, 0, 0, 0.25, 0, 1, 1, 1], ['sph', 0x3fa36b, 0, 0, 0.85, 0, 0.55, 0.5, 0.55], ['sph', 0x5cc285, 0, 0.15, 1.15, 0.05, 0.32, 0.3, 0.32]]],
    practice: [[['box', 0x1b1b1f, 0, 0, 0.7, 0, 1.2, 1.4, 1.0], [cyl(0.3, 0.3, 0.06, 16), 0x3a3a44, 0xff4fd8, 0, 0.95, 0.51, 1, 1, 1, 'rx'], [cyl(0.2, 0.2, 0.06, 16), 0x3a3a44, 0x5ce1ff, 0, 0.4, 0.51, 1, 1, 1, 'rx']]],
    street: [
      [[cyl(0.42, 0.38, 1.0, 16), 0x2e6b4f, 0, 0, 0.5, 0, 1, 1, 1], [cyl(0.46, 0.46, 0.12, 16), 0x3d8a66, 0, 0, 1.05, 0, 1, 1, 1]],
      [['box', 0xc0283a, 0, 0, 0.95, 0, 1.2, 1.9, 0.9], ['box', 0x9fe6ff, 0x9fe6ff, -0.15, 1.2, 0.46, 0.6, 0.7, 0.02], ['box', 0xffd84f, 0xffd84f, 0.35, 1.25, 0.46, 0.18, 0.4, 0.02]],
    ],
    stage: [
      [['box', 0x0e0e12, 0, 0, 0.8, 0, 1.2, 1.6, 1.0], [cyl(0.32, 0.32, 0.06, 16), 0x2c2c36, 0x7a3cbc, 0, 1.05, 0.51, 1, 1, 1, 'rx'], ['box', 0x7a3cbc, 0x7a3cbc, 0, 1.62, 0, 1.22, 0.04, 1.02]],
      [['box', 0x2b2b33, 0, 0, 0.45, 0, 1.1, 0.9, 1.0], ['sph', 0xffd84f, 0xffd84f, -0.25, 0.75, 0.45, 0.18, 0.18, 0.1], ['sph', 0xff2fd0, 0xff2fd0, 0.25, 0.75, 0.45, 0.18, 0.18, 0.1]],
    ],
  });

  function buildWorld(m) {
    if (world) { scene.remove(world); disposeTree(world); }
    for (const k in objs) { objs[k].forEach((o) => { scene.remove(o.root); disposeTree(o.root); if (o.tele) { scene.remove(o.tele); disposeTree(o.tele); } }); objs[k].clear(); }
    world = new T.Group(); scene.add(world);
    curMap = m;
    const th = THEME[m.theme], W = m.cols * 16 * K, H = m.rows * 16 * K, ts = 16 * K;
    if (!bg[m.theme]) bg[m.theme] = gradTex(th.bg[0], th.bg[1]);
    // 地板
    const floor = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshToonMaterial({ map: floorTexture(m), gradientMap: gradMap }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2); floor.receiveShadow = true;
    world.add(floor);
    // 牆（只畫靠近可走區域的牆）
    const walls = [];
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      if (G.World.get(m, x, y) !== 1) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const t = G.World.get(m, x + dx, y + dy); if (t !== 1) { edge = true; break; } }
      if (edge) walls.push([x, y]);
    }
    const mtx = new T.Matrix4(), col = new T.Color();
    const wallMesh = new T.InstancedMesh(new T.BoxGeometry(ts, th.wallH, ts), toon(0xffffff), walls.length);
    const capMesh = new T.InstancedMesh(new T.BoxGeometry(ts * 1.0, 0.08, ts * 1.0), toon(th.top, m.theme === 'stage' ? th.accent : 0, 0.6), walls.length);
    walls.forEach(([x, y], i) => {
      mtx.makeTranslation((x + 0.5) * ts, th.wallH / 2, (y + 0.5) * ts); wallMesh.setMatrixAt(i, mtx);
      col.setHex(th.wall).multiplyScalar(0.85 + hash(x, y) * 0.3); wallMesh.setColorAt(i, col);
      mtx.makeTranslation((x + 0.5) * ts, th.wallH + 0.04, (y + 0.5) * ts); capMesh.setMatrixAt(i, mtx);
    });
    wallMesh.castShadow = true; wallMesh.receiveShadow = true;
    world.add(wallMesh, capMesh);
    // 障礙物
    const variants = getProps()[m.theme];
    const spots = variants.map(() => []);
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) if (G.World.get(m, x, y) === 3) spots[Math.floor(hash(x, y) * variants.length) % variants.length].push([x, y]);
    const q = new T.Quaternion(), rx = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2), sc = new T.Vector3(), ps = new T.Vector3();
    variants.forEach((parts, vi) => {
      if (!spots[vi].length) return;
      for (const p of parts) {
        const [geoKey, color, emissive, ox, oy, oz, sx, sy, sz, rot] = p;
        const geo = geoKey === 'box' ? BOX : geoKey === 'sph' ? SPH : geoKey;
        const im = new T.InstancedMesh(geo, toon(color, emissive || 0, 1.4), spots[vi].length);
        spots[vi].forEach(([x, y], i) => {
          ps.set((x + 0.5) * ts + ox, oy, (y + 0.5) * ts + oz); sc.set(sx, sy, sz);
          mtx.compose(ps, rot === 'rx' ? rx : q.identity(), sc); im.setMatrixAt(i, mtx);
        });
        im.castShadow = true; world.add(im);
      }
    });
    // 傳送門
    m._portalObjs = [];
    // NPC
    m._npcObjs = (m.npcs || []).map((n) => { const p = makePerson(HERO[n.sprite]); p.root.position.set(n.x * K, 0, n.y * K); world.add(p.root); return { n, p }; });
    // 光點
    const n = Math.min(400, Math.floor(m.cols * m.rows / 4));
    const geo = new T.BufferGeometry(), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * W; pos[i * 3 + 1] = Math.random() * 3; pos[i * 3 + 2] = Math.random() * H; }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    sparks = new T.Points(geo, new T.PointsMaterial({ color: m.theme === 'hub' ? 0xffe9a8 : 0xd8b8ff, size: 0.07, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
    world.add(sparks);
    scene.background = bg[m.theme];
  }
  function makePortal(p) {
    const g = new T.Group();
    const locked = !p.toHub && p.zone > G.S.unlocked;
    const c = locked ? 0x777777 : p.toHub ? 0x5ce1ff : new T.Color(G.DATA.zones[p.zone].color).getHex();
    const ring = new T.Mesh(new T.TorusGeometry(0.75, 0.07, 10, 40), toon(c, c, locked ? 0.2 : 1.8));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const disc = new T.Mesh(new T.CircleGeometry(0.72, 32), glow(c, locked ? 0.15 : 0.35)); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; g.add(disc);
    if (!locked) { const beam = new T.Mesh(cyl(0.6, 0.75, 2.6, 24, 1), glow(c, 0.18)); beam.position.y = 1.3; g.add(beam); g.userData.beam = beam; }
    g.position.set(p.x * K, 0, p.y * K);
    g.userData.ring = ring; g.userData.locked = locked;
    return g;
  }

  // ======================= 同步遊戲物件 =======================
  function sync(list, map, create, update) {
    for (const o of map.values()) o.seen = false;
    for (const item of list) {
      let o = map.get(item);
      if (!o) { o = create(item); if (!o) continue; scene.add(o.root); map.set(item, o); }
      o.seen = true; update(item, o);
    }
    for (const [k, o] of map) if (!o.seen) {
      scene.remove(o.root); disposeTree(o.root);
      if (o.tele) { scene.remove(o.tele); disposeTree(o.tele); }
      map.delete(k);
    }
  }
  const PROJ_GEO = () => { const g = new T.SphereGeometry(1, 10, 8); g.userData.shared = true; return g; };
  let projGeo, coinGeo, gemGeo;

  function renderGame(dt) {
    const run = G.run, P = G.P, S = G.S, t = run.time;
    if (run.map !== curMap) buildWorld(run.map);
    selGroup.visible = false;
    // 傳送門（可能新增）
    const m = run.map;
    while (m._portalObjs.length < m.portals.length) { const g = makePortal(m.portals[m._portalObjs.length]); world.add(g); m._portalObjs.push(g); }
    for (const g of m._portalObjs) { g.userData.ring.rotation.z += dt * (g.userData.locked ? 0.3 : 2); if (g.userData.beam) g.userData.beam.material.opacity = 0.14 + Math.sin(t * 3) * 0.05; }
    for (const { n, p } of m._npcObjs) { animPerson(p, dt, false, ''); p.root.rotation.y = Math.atan2(P.x - n.x, P.y - n.y) * 0.6; }
    // 主角
    if (!player || playerId !== S.hero) {
      if (player) { scene.remove(player.root); disposeTree(player.root); }
      player = makePerson(HERO[S.hero] || HERO.luna); playerId = S.hero;
      player.root.scale.setScalar(0.95); scene.add(player.root);
    }
    player.root.position.set(P.x * K, 0, P.y * K);
    let target = Math.PI / 2 - P.face;
    if (P.spin) player.root.rotation.y += dt * 20;
    else { let d = target - player.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); player.root.rotation.y += d * Math.min(1, dt * 16); }
    if (P.atk.anim > 0 && !player.wasAtk) player.atkT = ATK;
    player.wasAtk = P.atk.anim > 0;
    player.root.visible = !(P.hurtT > 0 && Math.floor(P.hurtT * 20) % 2) && !run.over;
    animPerson(player, dt, P.moving || P.dash.t > 0, S.hero);
    // 怪物
    sync(run.enemies, objs.enemies, (e) => makeEnemy(e), (e, o) => {
      const fl = e.d.float ? 0.25 + Math.sin(e.t * 5) * 0.12 : 0;
      const hop = e.type === 'slime' && e.state === 'hop' ? 0.3 : 0;
      o.root.position.set(e.x * K + (e.state === 'wind' || e.state === 'chargeWind' ? Math.sin(e.t * 60) * 0.05 : 0), fl + hop, e.y * K);
      o.root.rotation.y = Math.atan2(P.x - e.x, P.y - e.y);
      const flash = e.flash > 0;
      if (flash !== o.flashing) {
        o.flashing = flash;
        for (const mt of o.mats) { mt.emissive.setHex(flash ? 0xffffff : mt.userData.em); mt.emissiveIntensity = flash ? 0.9 : mt.userData.ei; }
      }
      if (e.type === 'slime') { const s = Math.sin(e.t * 6) * 0.06; o.root.scale.set(1 + s, 1 - s, 1 + s); }
      if (o.pend) o.pend.rotation.z = Math.sin(e.t * (e.phase === 2 ? 9 : 5)) * 0.6;
      if (o.core) o.core.scale.setScalar(0.35 * (1 + Math.sin(e.t * 5) * 0.15));
      // 衝鋒預警
      if (e.tele && e.tele.type === 'line') {
        if (!o.tele) { o.tele = new T.Mesh(new T.PlaneGeometry(1, 1), glow(0xff2850, 0.3)); o.tele.rotation.x = -Math.PI / 2; scene.add(o.tele); }
        const len = e.tele.len * K, w = e.tele.w * K;
        o.tele.visible = true; o.tele.scale.set(len, w, 1);
        o.tele.position.set((e.x + Math.cos(e.tele.ang) * e.tele.len / 2) * K, 0.05, (e.y + Math.sin(e.tele.ang) * e.tele.len / 2) * K);
        o.tele.rotation.z = -e.tele.ang;
        o.tele.material.opacity = 0.25 + Math.sin(t * 30) * 0.08;
      } else if (o.tele) o.tele.visible = false;
    });
    // 投射物
    sync(run.projs, objs.projs, (p) => {
      const g = new T.Group(); const mt = new T.MeshBasicMaterial({ color: p.color });
      const core = new T.Mesh(projGeo, mt); core.scale.setScalar(p.r * K * 0.95); g.add(core);
      const halo = new T.Mesh(projGeo, glow(p.color, 0.28)); halo.scale.setScalar(p.r * K * 1.6); g.add(halo);
      return { root: g };
    }, (p, o) => o.root.position.set(p.x * K, 0.6, p.y * K));
    // 地面危險
    sync(run.hazards, objs.hazards, (h) => {
      const g = new T.Group(); g.rotation.x = -Math.PI / 2; g.position.y = 0.06;
      if (h.type === 'ring') { const r = new T.Mesh(new T.RingGeometry(0.9, 1, 64), glow(new T.Color(h.color).getHex(), 0.85)); g.add(r); return { root: g, a: r }; }
      const a = new T.Mesh(new T.CircleGeometry(1, 40), glow(0xff2850, 0.22)), b = new T.Mesh(new T.CircleGeometry(1, 40), glow(0xff2850, 0.35)), c = new T.Mesh(new T.RingGeometry(0.95, 1, 48), glow(0xff2850, 0.9));
      g.add(a, b, c); return { root: g, a, b, c };
    }, (h, o) => {
      o.root.position.x = h.x * K; o.root.position.z = h.y * K;
      if (h.type === 'ring') { o.root.scale.setScalar(Math.max(0.01, h.r * K)); return; }
      const r = h.r * K; o.a.scale.setScalar(r); o.c.scale.setScalar(r);
      if (!h.done) { o.b.scale.setScalar(Math.max(0.01, r * Math.min(1, h.t / h.tele))); }
      else { o.b.scale.setScalar(r); o.b.material.color.setHex(0xffffff); o.b.material.opacity = Math.max(0, 1 - (h.t - h.tele) / 0.25) * 0.8; o.a.visible = o.c.visible = false; }
    });
    // 掉落物
    sync(run.pickups, objs.pickups, (p) => {
      const g = new T.Group();
      if (p.kind === 'gold') { const c = new T.Mesh(coinGeo, toon(0xf2c14e, 0xb8860b, 0.6)); c.rotation.x = Math.PI / 2; g.add(c); }
      else if (p.kind === 'potion') { part(g, cap(0.1, 0.14), toon(p.v === 'hp' ? 0xf2a03d : 0x2f8cff, p.v === 'hp' ? 0xf2a03d : 0x2f8cff, 0.6), 0, 0, 0, 1, 1, 1, false); }
      else { const col = new T.Color(G.DATA.rarityColor[G.DATA.items[p.v].rarity]).getHex(); g.add(new T.Mesh(gemGeo, toon(col, col, 1.2))); const b = new T.Mesh(cyl(0.12, 0.2, 2.2, 12, 1), glow(col, 0.25)); b.position.y = 1; g.add(b); }
      return { root: g };
    }, (p, o) => { o.root.position.set(p.x * K, 0.35 + Math.sin(t * 4 + p.x) * 0.08, p.y * K); o.root.rotation.y += dt * 3; });
    // 攻擊/技能特效
    sync(run.fx.filter((f) => f.type === 'slash' || f.type === 'wave' || f.type === 'ringfx'), objs.fx, (f) => {
      let geo;
      if (f.type === 'ringfx') geo = new T.RingGeometry(0.85, 1, 64);
      else geo = new T.RingGeometry(f.type === 'wave' ? 0.2 : 0.55, 1, 40, 1, -f.half, f.half * 2);
      const col = f.type === 'slash' ? (HERO[S.hero] || HERO.luna).ring : f.type === 'wave' ? 0x5ce1ff : new T.Color(f.color).getHex();
      const mesh = new T.Mesh(geo, glow(col, 0.8)); mesh.rotation.x = -Math.PI / 2; mesh.position.set(f.x * K, f.type === 'ringfx' ? 0.08 : 0.55, (f.y + 4) * K);
      if (f.type !== 'ringfx') mesh.rotation.z = -f.ang;
      return { root: mesh };
    }, (f, o) => {
      const p = f.t / f.life;
      if (f.type === 'ringfx') o.root.scale.setScalar(Math.max(0.01, (f.r * p + 2) * K));
      else if (f.type === 'wave') o.root.scale.setScalar(Math.max(0.01, f.r * K * Math.min(1, p * 1.4)));
      else o.root.scale.setScalar(f.r * K);
      o.root.material.opacity = 0.85 * (1 - p);
    });
    // 光點
    if (sparks) { const a = sparks.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * 0.3; if (y > 3) y = 0; a.setY(i, y); } a.needsUpdate = true; }
    // 鏡頭
    const mw = m.cols * 16 * K, mh = m.rows * 16 * K, hx = 11, hz = 5;
    const tx = mw < hx * 2 ? mw / 2 : Math.min(Math.max(P.x * K, hx), mw - hx);
    const tz = mh < hz * 2 ? mh / 2 : Math.min(Math.max(P.y * K, hz), mh - hz);
    let sx = 0, sz = 0;
    if (run.shake > 0) { sx = (Math.random() - 0.5) * run.shake * 1.2; sz = (Math.random() - 0.5) * run.shake * 1.2; }
    const dist = G.isTouch ? 1 : 1.08;
    camera.position.set(tx + sx, 13 * dist, tz + 11 * dist + sz);
    camera.lookAt(tx + sx, 0.6, tz + sz);
    sun.position.set(tx + 6, 14, tz + 8); sun.target.position.set(tx, 0, tz);
    composer.render();
  }

  // ======================= 標題（選角舞台） =======================
  function buildTitle() {
    selGroup = new T.Group(); scene.add(selGroup);
    const st = new T.Mesh(new T.CylinderGeometry(6, 6, 0.2, 64), toon(0x2a2470)); st.position.y = -0.1; st.receiveShadow = true; selGroup.add(st);
    selHeroes = G.DATA.heroOrder.map((id, i) => {
      const h = makePerson(HERO[id]);
      h.root.position.set((i - 1) * 1.65, 0, i === 1 ? 0.15 : 0);
      h.root.rotation.y = (1 - i) * 0.25;
      const ring = new T.Mesh(new T.RingGeometry(0.55, 0.64, 48), glow(HERO[id].ring, 0.8)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
      h.root.add(ring); h.ring = ring; h.id = id;
      selGroup.add(h.root);
      return h;
    });
    const n = 260, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 10; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1; }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    selGroup.userData.sp = new T.Points(geo, new T.PointsMaterial({ color: 0xcfd8ff, size: 0.05, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
    selGroup.add(selGroup.userData.sp);
    bg.title = gradTex('#1a1352', '#3b66d1');
  }
  function renderTitle(dt) {
    if (world) world.visible = false;
    if (player) player.root.visible = false;
    for (const k in objs) objs[k].forEach((o) => { o.root.visible = false; });
    selGroup.visible = true;
    scene.background = bg.title;
    const aspect = camera.aspect;
    camera.position.set(0, 1.25, aspect < 1 ? 8.5 : 5.6 * Math.max(1, 1.75 / aspect));
    camera.lookAt(0, 1.05, 0);
    sun.position.set(3, 7, 5); sun.target.position.set(0, 0, 0);
    selHeroes.forEach((h, i) => {
      animPerson(h, dt, false, h.id);
      const on = i === G.heroIdx;
      h.root.scale.setScalar(T.MathUtils.lerp(h.root.scale.x, on ? 1.12 : 0.92, Math.min(1, dt * 8)));
      h.ring.material.opacity = on ? 0.95 : 0.35;
      h.ring.material.color.setHex(on ? 0xd09bff : HERO[h.id].ring);
    });
    const a = selGroup.userData.sp.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * 0.25; if (y > 5) y = 0; a.setY(i, y); }
    a.needsUpdate = true;
    composer.render();
  }

  // ======================= 對外介面 =======================
  R.init = function (glCanvas) {
    T = window.THREE;
    const A = window.THREE_ADDONS;
    renderer = new T.WebGLRenderer({ canvas: glCanvas, antialias: true });
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 16 / 9, 0.1, 300);
    composer = new A.EffectComposer(renderer);
    composer.addPass(new A.RenderPass(scene, camera));
    composer.addPass(new A.UnrealBloomPass(new T.Vector2(512, 512), 0.5, 0.4, 0.93));
    composer.addPass(new A.OutputPass());
    gradMap = new T.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, T.RedFormat);
    gradMap.minFilter = gradMap.magFilter = T.NearestFilter; gradMap.needsUpdate = true;
    outlineMat = new T.MeshBasicMaterial({ color: 0x24143a, side: T.BackSide }); outlineMat.userData.shared = true;
    SPH = new T.SphereGeometry(1, 24, 16); SPH.userData.shared = true;
    BOX = new T.BoxGeometry(1, 1, 1); BOX.userData.shared = true;
    projGeo = PROJ_GEO();
    coinGeo = new T.CylinderGeometry(0.2, 0.2, 0.05, 18); coinGeo.userData.shared = true;
    gemGeo = new T.OctahedronGeometry(0.24); gemGeo.userData.shared = true;
    scene.add(new T.HemisphereLight(0xd0dcff, 0x3a2a6a, 1.0));
    sun = new T.DirectionalLight(0xffffff, 1.4); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
    scene.add(sun, sun.target);
    const rim = new T.DirectionalLight(0xff7ae0, 0.8); rim.position.set(-4, 3, -5); scene.add(rim);
    buildTitle();
    R.ready = true;
  };
  R.resize = function (cw, ch, dpr) {
    if (!R.ready) return;
    renderer.setPixelRatio(Math.min(dpr, G.isTouch ? 1.4 : 2));
    renderer.setSize(cw, ch);
    composer.setSize(cw, ch);
    camera.aspect = cw / ch; camera.updateProjectionMatrix();
  };
  R.render = function () {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G.Game.scene === 'title' || !G.run) renderTitle(dt);
    else { if (world) world.visible = true; renderGame(dt); }
  };
  const v3 = { x: 0, y: 0, z: 0 };
  R.project = function (px, py, h) {
    const v = new T.Vector3(px * K, h || 0, py * K).project(camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * G.W, y: (1 - v.y) / 2 * G.H };
  };
})();
