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
  const objs = { enemies: new Map(), projs: new Map(), hazards: new Map(), pickups: new Map(), fx: new Map(), pprojs: new Map() };
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
  function brows(g, y, z, dx, w, color) {
    for (const s of [-1, 1]) part(g, BOX, toon(color || 0x111111), dx * s, y, z, w, w * 0.28, 0.02, false).rotation.z = 0.45 * s;
  }
  function textSprite(txt, bgc, fg, w) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const x = c.getContext('2d');
    if (bgc) { x.fillStyle = bgc; x.beginPath(); x.moveTo(16, 4); x.arcTo(124, 4, 124, 52, 14); x.arcTo(124, 52, 4, 52, 14); x.lineTo(40, 52); x.lineTo(28, 62); x.lineTo(30, 52); x.arcTo(4, 52, 4, 4, 14); x.arcTo(4, 4, 124, 4, 14); x.closePath(); x.fill(); }
    x.font = '900 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = fg; x.fillText(txt, 64, 29);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.set(w || 0.8, (w || 0.8) / 2, 1); return s;
  }
  function legPair(body, color, shoe, x, len, r) {
    const legs = [];
    for (const s of [-1, 1]) {
      const p = new T.Group(); p.position.set(x * s, len, 0); body.add(p);
      part(p, cap(r, len * 0.6), toon(color), 0, -len / 2, 0);
      part(p, SPH, toon(shoe), 0, -len + r * 0.6, r * 0.6, r * 1.4, r, r * 2);
      legs.push(p);
    }
    return legs;
  }
  function arm(body, x, y, color, len, r, rx) {
    const p = new T.Group(); p.position.set(x, y, 0); p.rotation.x = rx || 0; body.add(p);
    part(p, cap(r, len), toon(color), 0, -len / 2 - r, 0);
    return p;
  }
  function walk(o, t, mv, spd) {
    if (!o.legs) return;
    const s = mv ? Math.sin(t * (spd || 10)) * 0.55 : 0;
    o.legs[0].rotation.x += (s - o.legs[0].rotation.x) * 0.3;
    o.legs[1].rotation.x += (-s - o.legs[1].rotation.x) * 0.3;
    o.body.position.y = mv ? Math.abs(Math.cos(t * (spd || 10))) * 0.05 : o.body.position.y * 0.8;
  }
  function groundAura(g, color, r) {
    const m = new T.Mesh(new T.RingGeometry(r * 0.75, r, 56), glow(color, 0.45));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.05; g.add(m);
    const d = new T.Mesh(new T.CircleGeometry(r * 0.75, 40), glow(color, 0.12));
    d.rotation.x = -Math.PI / 2; d.position.y = 0.04; g.add(d);
    return m;
  }

  const ENEMY = {
    // 走音音符：紫色音符頭＋捲曲符尾＋環繞五線譜光環
    note(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      part(b, SPH, toon(0x7a4ad6), 0, 0.5, 0, 0.42, 0.34, 0.38).rotation.z = -0.35;
      part(b, SPH, new T.MeshBasicMaterial({ color: 0xd9c2ff, transparent: true, opacity: 0.6 }), -0.14, 0.68, 0.22, 0.1, 0.06, 0.05, false);
      part(b, cyl(0.045, 0.045, 1.05, 8), toon(0x5a2fb0), 0.36, 1.0, 0);
      const flag = (o.flag = new T.Group()); flag.position.set(0.36, 1.5, 0); b.add(flag);
      part(flag, new T.TorusGeometry(0.22, 0.055, 8, 18, Math.PI), toon(0x5a2fb0), 0.2, -0.2, 0, 1, 1, 1, false).rotation.z = Math.PI * 0.55;
      eyes(b, 0.55, 0.35, 0.13, 0.075, 0xffffff);
      eyes(b, 0.53, 0.39, 0.13, 0.035, 0xff3355);
      brows(b, 0.69, 0.37, 0.13, 0.12, 0x2a1050);
      part(b, BOX, toon(0x2a1050), 0, 0.39, 0.36, 0.14, 0.03, 0.02, false).rotation.z = 0.15;
      const ring = (o.ring = new T.Mesh(new T.TorusGeometry(0.65, 0.012, 6, 48), glow(0xc58fff, 0.8)));
      ring.rotation.x = Math.PI / 2.4; ring.position.y = 0.6; g.add(ring);
      o.anim = (e, o, t) => { o.body.rotation.z = Math.sin(t * 4) * 0.15; o.flag.rotation.z = Math.sin(t * 10) * 0.25; o.ring.rotation.z = t * 1.5; };
    },
    // 疲勞史萊姆：果凍身體、閉眼、黑眼圈、打哈欠、Zz
    slime(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      part(b, SPH, toon(0x7fb4e8), 0, 0.34, 0, 0.52, 0.38, 0.52);
      part(b, SPH, toon(0x5f93cc), 0, 0.06, 0, 0.62, 0.07, 0.62, false);
      part(b, SPH, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }), -0.22, 0.55, 0.26, 0.11, 0.06, 0.04, false);
      for (const s of [-1, 1]) {
        part(b, BOX, toon(0x1b2440), 0.17 * s, 0.43, 0.48, 0.13, 0.025, 0.02, false).rotation.z = -0.15 * s;
        part(b, SPH, toon(0x5a7fb0), 0.17 * s, 0.37, 0.47, 0.08, 0.03, 0.02, false);
      }
      part(b, SPH, toon(0x2b3550), 0, 0.26, 0.5, 0.06, 0.055, 0.02, false);
      const z = (o.z = textSprite('Zz', null, '#d6ecff', 0.7)); z.position.set(0.35, 1.0, 0); g.add(z);
      o.anim = (e, o, t) => {
        const s = Math.sin(t * 6) * 0.07; o.body.scale.set(1 + s, 1 - s, 1 + s);
        const k = (t * 0.5) % 1; o.z.position.y = 0.95 + k * 0.5; o.z.material.opacity = 1 - k;
      };
    },
    // 酸民：灰色帽T、手機藍光照臉、頭上「!?#」對話框
    troll(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      o.legs = legPair(b, 0x33405e, 0x1b1b24, 0.12, 0.45, 0.075);
      part(b, cap(0.3, 0.35), toon(0x6b6b78), 0, 0.85, 0, 1, 1, 0.85);
      part(b, BOX, toon(0x585866), 0, 0.72, 0.25, 0.32, 0.12, 0.04, false);
      part(b, SPH, toon(0x6b6b78), 0, 1.42, -0.02, 0.37, 0.37, 0.37);
      part(b, SPH, toon(0x22222a), 0, 1.4, 0.1, 0.3, 0.31, 0.28, false);
      part(b, SPH, toon(0xe8c4a8, 0x5ce1ff, 0.25), 0, 1.38, 0.13, 0.25, 0.26, 0.22, false);
      eyes(b, 1.42, 0.33, 0.08, 0.035, 0xc0182f);
      brows(b, 1.49, 0.34, 0.08, 0.09);
      part(b, BOX, toon(0x7a2030), 0, 1.29, 0.34, 0.1, 0.02, 0.02, false);
      const ar = arm(b, 0.3, 1.08, 0x6b6b78, 0.28, 0.07, -1.1);
      part(ar, BOX, toon(0x111111, 0x5ce1ff, 1.7), 0, -0.45, 0.03, 0.16, 0.26, 0.03, false);
      o.armL = arm(b, -0.3, 1.08, 0x6b6b78, 0.28, 0.07, -0.9);
      const bub = (o.bub = textSprite('!?#', '#ffffff', '#c0182f', 0.75)); bub.position.set(0.15, 2.1, 0); g.add(bub);
      o.anim = (e, o, t, dt, mv) => {
        walk(o, t, mv); o.armL.rotation.x = -0.9 + Math.sin(t * 25) * 0.12;
        const angry = e.state === 'wind' || e.state === 'lunge';
        o.bub.position.y = 2.1 + Math.sin(t * 3) * 0.05; o.bub.scale.setScalar(angry ? 1.0 : 0.75); o.bub.scale.y = o.bub.scale.x / 2;
      };
    },
    // 狗仔：風衣、鴨舌帽、單眼相機（蓄力時閃光燈閃爍）
    papa(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      o.legs = legPair(b, 0x4a4a55, 0x1b1b24, 0.12, 0.45, 0.075);
      part(b, cyl(0.27, 0.38, 0.78, 16), toon(0xb89a6a), 0, 0.85, 0);
      part(b, cyl(0.3, 0.28, 0.1, 16), toon(0x9a7e52), 0, 1.25, 0);
      part(b, cyl(0.335, 0.335, 0.06, 16), toon(0x5a4a30), 0, 0.82, 0, 1, 1, 1, false);
      part(b, SPH, toon(0xe8c4a8), 0, 1.5, 0, 0.27, 0.27, 0.27);
      eyes(b, 1.53, 0.25, 0.09, 0.035);
      part(b, BOX, toon(0x8a3040), 0, 1.4, 0.25, 0.1, 0.02, 0.02, false);
      part(b, cyl(0.27, 0.28, 0.14, 16), toon(0x3d3d48), 0, 1.7, 0);
      part(b, BOX, toon(0x3d3d48), 0, 1.65, 0.24, 0.32, 0.03, 0.22, false);
      for (const s of [-1, 1]) arm(b, 0.28 * s, 1.18, 0xb89a6a, 0.22, 0.07, -1.3).rotation.z = -0.35 * s;
      const cam = new T.Group(); cam.position.set(0, 1.25, 0.42); b.add(cam);
      part(cam, BOX, toon(0x16161b), 0, 0, 0, 0.44, 0.28, 0.2);
      part(cam, cyl(0.1, 0.12, 0.18, 16), toon(0x223344), 0, 0, 0.17, 1, 1, 1, false).rotation.x = Math.PI / 2;
      part(cam, SPH, toon(0x8fd8ff, 0x8fd8ff, 1.3), 0, 0, 0.26, 0.08, 0.08, 0.03, false);
      o.bulb = part(cam, BOX, toon(0xffffff, 0xffffff, 0.3), 0.13, 0.21, 0, 0.14, 0.09, 0.09, false);
      o.anim = (e, o, t, dt, mv) => { walk(o, t, mv); o.bulb.material.emissiveIntensity = e.state === 'wind' ? (Math.sin(t * 40) > 0 ? 5 : 0.5) : 0.3; };
    },
    // 黑粉：破爛黑袍、空洞臉、紅色發光眼、紅爪、黑色氣場
    anti(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      const robe = toon(0x3a1d52, 0x5a1a8a, 0.35);
      part(b, new T.ConeGeometry(0.55, 1.35, 12), robe, 0, 0.78, 0);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; part(b, new T.ConeGeometry(0.09, 0.28, 4), robe, Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5, 1, 1, 1, false).rotation.x = Math.PI; }
      part(b, SPH, robe, 0, 1.48, 0, 0.37, 0.39, 0.37);
      part(b, SPH, toon(0x050308), 0, 1.45, 0.12, 0.27, 0.28, 0.25, false);
      for (const s of [-1, 1]) part(b, SPH, toon(0xff2f4f, 0xff2f4f, 2.6), 0.1 * s, 1.48, 0.34, 0.065, 0.035, 0.02, false).rotation.z = 0.3 * s;
      part(b, BOX, toon(0xb0102a, 0xb0102a, 1.3), 0, 1.35, 0.35, 0.15, 0.02, 0.02, false);
      o.hands = [];
      for (const s of [-1, 1]) {
        const h = new T.Group(); h.position.set(0.48 * s, 0.95, 0.15); b.add(h);
        part(h, SPH, toon(0x1a0c24), 0, 0, 0, 0.1, 0.1, 0.1);
        for (let i = 0; i < 3; i++) part(h, new T.ConeGeometry(0.022, 0.17, 5), toon(0xff4f6a, 0xff2f4f, 1.2), (i - 1) * 0.045, -0.11, 0.04, 1, 1, 1, false).rotation.x = Math.PI;
        o.hands.push(h);
      }
      const n = 26, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.4; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 1.8; pos[i * 3 + 2] = Math.sin(a) * r; }
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      o.aura = new T.Points(geo, new T.PointsMaterial({ color: 0xc070ff, size: 0.11, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      g.add(o.aura);
      o.anim = (e, o, t) => {
        o.body.position.y = 0.1 + Math.sin(t * 3) * 0.08; o.body.rotation.z = Math.sin(t * 2) * 0.05;
        o.hands.forEach((h, i) => { h.position.y = 0.95 + Math.sin(t * 4 + i * 2) * 0.08; h.rotation.x = e.state === 'wind' || e.state === 'lunge' ? -1.2 : 0; });
        o.aura.rotation.y = t * 0.7;
      };
    },
    // 假帳號 Bot：預設頭像螢幕、紅眼、天線燈、噴射火焰
    bot(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      part(b, new T.BoxGeometry(0.8, 0.8, 0.2), toon(0xd9dee8), 0, 0.85, 0);
      part(b, BOX, toon(0x2b3140, 0x3a4a6a, 0.5), 0, 0.85, 0.105, 0.66, 0.66, 0.01, false);
      part(b, SPH, toon(0x9aa3b5), 0, 0.97, 0.115, 0.13, 0.13, 0.01, false);
      part(b, SPH, toon(0x9aa3b5), 0, 0.68, 0.115, 0.23, 0.12, 0.01, false);
      for (const s of [-1, 1]) part(b, BOX, toon(0xff3355, 0xff3355, 2.2), 0.055 * s, 0.98, 0.125, 0.045, 0.02, 0.01, false);
      part(b, cyl(0.015, 0.015, 0.32, 6), toon(0x888888), 0, 1.4, 0);
      o.led = part(b, SPH, toon(0xff3355, 0xff3355, 2), 0, 1.58, 0, 0.05, 0.05, 0.05, false);
      o.flames = [];
      for (const s of [-1, 1]) {
        part(b, cyl(0.06, 0.09, 0.12, 10), toon(0x555a66), 0.22 * s, 0.4, 0);
        const f = part(b, new T.ConeGeometry(0.07, 0.3, 10), toon(0xff9d2f, 0xff9d2f, 2.6), 0.22 * s, 0.2, 0, 1, 1, 1, false);
        f.rotation.x = Math.PI; o.flames.push(f);
      }
      const q = textSprite('?', '#ff3355', '#ffffff', 0.45); q.position.set(0.45, 1.35, 0); g.add(q);
      o.anim = (e, o, t) => {
        o.body.rotation.z = Math.sin(t * 5) * 0.08;
        o.flames.forEach((f) => { f.scale.y = 0.7 + Math.random() * 0.6; });
        o.led.material.emissiveIntensity = Math.sin(t * 8) > 0 ? 2.6 : 0.2;
      };
    },

    // ---------- Boss ----------
    // 失控節拍器：木製金字塔、刻度、紅眼、擺錘；二階段發出紅光
    metronome(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      part(b, new T.BoxGeometry(2.7, 0.35, 2.7), toon(0x5a3418), 0, 0.18, 0);
      part(b, BOX, toon(0xf2c14e, 0xf2c14e, 0.4), 0, 0.37, 0, 2.75, 0.06, 2.75, false);
      o.wood = toon(0xa0612f);
      part(b, new T.ConeGeometry(1.55, 3.4, 4), o.wood, 0, 2.05, 0).rotation.y = Math.PI / 4;
      const face = (y) => 1.096 * (1 - (y - 0.35) / 3.4) + 0.02;
      for (let i = 0; i < 9; i++) { const y = 0.75 + i * 0.22; part(b, BOX, toon(0xf2c14e), 0, y, face(y), i % 2 ? 0.18 : 0.3, 0.03, 0.02, false); }
      o.eyes = [];
      for (const s of [-1, 1]) o.eyes.push(part(b, SPH, toon(0xff2f4f, 0xff2f4f, 2.2), 0.24 * s, 2.35, face(2.35), 0.14, 0.09, 0.04, false));
      brows(b, 2.52, face(2.52) + 0.01, 0.24, 0.2, 0x3a1a08);
      part(b, BOX, toon(0xf5f2f1), 0, 1.75, face(1.75), 0.55, 0.12, 0.03, false);
      for (let i = -2; i <= 2; i++) part(b, BOX, toon(0x3a1a08), i * 0.11, 1.75, face(1.75) + 0.01, 0.015, 0.12, 0.01, false);
      const pend = (o.pend = new T.Group()); pend.position.set(0, 0.6, face(0.6) + 0.05); b.add(pend);
      part(pend, BOX, toon(0xf2c14e, 0xf2c14e, 0.5), 0, 1.35, 0, 0.08, 2.7, 0.06);
      part(pend, BOX, toon(0xd0d0d8), 0, 1.75, 0, 0.45, 0.32, 0.16);
      o.tip = part(pend, SPH, toon(0xffd84f, 0xffd84f, 2.5), 0, 2.75, 0, 0.09, 0.09, 0.09, false);
      o.anim = (e, o, t) => {
        const p2 = e.phase === 2;
        o.pend.rotation.z = Math.sin(t * (p2 ? 9 : 5)) * 0.6;
        o.wood.emissive.setHex(p2 ? 0xff2f2f : 0x000000); o.wood.emissiveIntensity = p2 ? 0.25 + Math.sin(t * 9) * 0.15 : 0;
        o.body.rotation.x += ((e.state === 'charge' ? 0.18 : 0) - o.body.rotation.x) * 0.2;
        o.eyes.forEach((m) => { m.material.emissiveIntensity = e.state === 'chargeWind' ? 4 : 2.2; });
      };
      o.aura = groundAura(g, 0xffb347, 2.2);
    },
    // 狗仔隊長：大衣、墨鏡、紳士帽、巨型相機（攻擊時閃光）、PRESS 記者證
    captain(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      o.legs = legPair(b, 0x3a3a44, 0x111116, 0.32, 0.95, 0.17);
      part(b, cyl(0.7, 0.98, 1.55, 22), toon(0x8a6a3e), 0, 1.65, 0);
      part(b, cyl(0.99, 0.99, 0.1, 22), toon(0x5a4a30), 0, 1.25, 0, 1, 1, 1, false);
      for (let i = 0; i < 3; i++) part(b, SPH, toon(0xf2c14e, 0xf2c14e, 0.4), 0, 1.45 + i * 0.3, 0.82 - i * 0.06, 0.06, 0.06, 0.03, false);
      part(b, SPH, toon(0xe8c4a8), 0, 2.8, 0, 0.56, 0.56, 0.56);
      part(b, SPH, toon(0xc9a78a), 0, 2.58, 0.16, 0.4, 0.24, 0.36, false);
      part(b, BOX, toon(0x0d0d12, 0x223344, 0.3), 0, 2.87, 0.5, 0.78, 0.17, 0.08, false);
      part(b, BOX, new T.MeshBasicMaterial({ color: 0xffffff }), -0.2, 2.9, 0.545, 0.14, 0.03, 0.01, false);
      part(b, BOX, toon(0xffffff), 0, 2.56, 0.5, 0.3, 0.06, 0.03, false);
      part(b, cyl(0.88, 0.88, 0.06, 26), toon(0x26262e), 0, 3.25, 0);
      part(b, cyl(0.48, 0.56, 0.5, 26), toon(0x26262e), 0, 3.5, 0);
      part(b, cyl(0.565, 0.565, 0.1, 26), toon(0xb3263a), 0, 3.31, 0, 1, 1, 1, false);
      const badge = textSprite('PRESS', '#ffffff', '#16161b', 0.55); badge.position.set(-0.55, 2.05, 0.85); g.add(badge);
      for (const s of [-1, 1]) arm(b, 0.85 * s, 2.25, 0x8a6a3e, 0.6, 0.17, -1.2).rotation.z = -0.3 * s;
      const cam = (o.cam = new T.Group()); cam.position.set(0.3, 1.95, 1.05); b.add(cam);
      part(cam, BOX, toon(0x16161b), 0, 0, 0, 1.15, 0.78, 0.55);
      part(cam, cyl(0.3, 0.34, 0.5, 22), toon(0x223344), 0, 0, 0.45, 1, 1, 1, false).rotation.x = Math.PI / 2;
      o.lens = part(cam, SPH, toon(0x5ca8ff, 0x5ca8ff, 1.8), 0, 0, 0.7, 0.24, 0.24, 0.08, false);
      o.bulb = part(cam, BOX, toon(0xffffff, 0xffffff, 0.3), 0.3, 0.55, 0, 0.5, 0.25, 0.25, false);
      o.anim = (e, o, t, dt, mv) => {
        walk(o, t, mv, 7);
        const shoot = e.state === 'aimed' || e.state === 'barrage' || e.state === 'flash';
        o.bulb.material.emissiveIntensity = shoot ? (Math.sin(t * 30) > 0 ? 6 : 0.6) : 0.3;
        o.lens.material.emissive.setHex(e.phase === 2 ? 0xff3355 : 0x5ca8ff);
        o.cam.rotation.y = Math.sin(t * 1.5) * 0.15;
      };
      o.aura = groundAura(g, 0x5ce1ff, 2.2);
    },
    // 負能量巨像：紫晶岩石巨人、角、發光核心、環繞水晶；階段越高越紅
    colossus(g, o) {
      const b = (o.body = new T.Group()); g.add(b);
      const rock = (o.rock = toon(0x3d1f5c)), dark = toon(0x24112f);
      o.legs = [];
      for (const s of [-1, 1]) {
        const p = new T.Group(); p.position.set(0.65 * s, 1.3, 0); b.add(p);
        part(p, new T.BoxGeometry(0.75, 1.3, 0.75), dark, 0, -0.65, 0);
        o.legs.push(p);
      }
      part(b, new T.BoxGeometry(1.7, 0.5, 1.0), dark, 0, 1.4, 0);
      part(b, new T.DodecahedronGeometry(1.25), rock, 0, 2.65, 0, 1.05, 1.0, 0.8);
      for (const s of [-1, 1]) part(b, new T.ConeGeometry(0.22, 0.7, 6), toon(0xb070ff, 0x8a3cff, 0.8), 1.05 * s, 3.45, -0.1, 1, 1, 1, false).rotation.z = -0.7 * s;
      part(b, new T.DodecahedronGeometry(0.58), rock, 0, 4.05, 0.1);
      for (const s of [-1, 1]) {
        part(b, new T.ConeGeometry(0.13, 0.85, 8), toon(0x8a8a9a), 0.42 * s, 4.65, 0, 1, 1, 1).rotation.z = -0.45 * s;
      }
      o.eyeM = toon(0xff2fd0, 0xff2fd0, 2.6);
      for (const s of [-1, 1]) part(b, BOX, o.eyeM, 0.2 * s, 4.1, 0.6, 0.18, 0.07, 0.04, false).rotation.z = 0.25 * s;
      part(b, BOX, o.eyeM, 0, 3.86, 0.6, 0.3, 0.04, 0.04, false);
      o.arms = [];
      for (const s of [-1, 1]) {
        const p = new T.Group(); p.position.set(1.45 * s, 3.2, 0); b.add(p);
        part(p, new T.BoxGeometry(0.6, 1.3, 0.6), dark, 0, -0.65, 0);
        part(p, new T.DodecahedronGeometry(0.48), rock, 0, -1.55, 0.1);
        for (let i = 0; i < 3; i++) part(p, new T.ConeGeometry(0.08, 0.35, 5), toon(0xb070ff, 0x8a3cff, 0.8), (i - 1) * 0.22, -1.25, 0.45, 1, 1, 1, false).rotation.x = Math.PI / 2;
        o.arms.push(p);
      }
      o.coreM = toon(0xff5ce1, 0xff5ce1, 1.6);
      o.core = part(b, SPH, o.coreM, 0, 2.75, 1.0, 0.38, 0.38, 0.2, false);
      o.halo = new T.Mesh(SPH, glow(0xff5ce1, 0.12)); o.halo.position.set(0, 2.75, 1.0); b.add(o.halo);
      o.shards = new T.Group(); o.shards.position.y = 2.7; g.add(o.shards);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        part(o.shards, new T.OctahedronGeometry(0.22), toon(0xd9a8ff, 0xb070ff, 1.5), Math.cos(a) * 2.3, Math.sin(i * 1.7) * 0.6, Math.sin(a) * 2.3, 1, 1.6, 1, false);
      }
      o.aura = groundAura(g, 0xff2fd0, 2.6);
      o.anim = (e, o, t, dt, mv) => {
        walk(o, t, mv, 5);
        o.arms.forEach((a, i) => { a.rotation.x = mv ? Math.sin(t * 5 + i * Math.PI) * 0.4 : Math.sin(t * 1.5 + i) * 0.1; });
        const col = e.phase === 3 ? 0xff2850 : e.phase === 2 ? 0xff5ce1 : 0xc58fff;
        o.coreM.emissive.setHex(col); o.coreM.color.setHex(col); o.eyeM.emissive.setHex(col);
        o.halo.material.color.setHex(col); o.aura.material.color.setHex(col);
        const p = 1 + Math.sin(t * (3 + e.phase * 2)) * 0.18;
        o.core.scale.set(0.38 * p, 0.38 * p, 0.2 * p); o.halo.scale.setScalar(0.48 * p);
        o.shards.rotation.y = t * (0.6 + e.phase * 0.4);
        o.rock.emissive.setHex(e.phase === 3 ? 0x5a0a20 : 0x000000); o.rock.emissiveIntensity = e.phase === 3 ? 0.6 : 0;
      };
    },
  };
  function makeEnemy(e) {
    const g = new T.Group(), o = { root: g, mats: [] };
    (ENEMY[e.type] || ENEMY.slime)(g, o);
    g.traverse((n) => { if (n.isMesh && n.material.isMeshToonMaterial) { const mt = n.material; if (!o.mats.includes(mt)) { mt.userData.em = mt.emissive.getHex(); mt.userData.ei = mt.emissiveIntensity; o.mats.push(mt); } } });
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

  // ---------- 技能特效（3D） ----------
  const flat = (geo, col, op, y) => { const m = new T.Mesh(geo, glow(col, op)); m.rotation.x = -Math.PI / 2; if (y != null) m.position.y = y; return m; };
  const FX3D = {
    slash: {
      make(f, c) { const m = flat(new T.RingGeometry(0.55, 1, 40, 1, -f.half, f.half * 2), c, 0.85); m.position.set(f.x * K, 0.55, (f.y + 4) * K); m.rotation.z = -f.ang; m.scale.setScalar(f.r * K); return { root: m }; },
      upd(f, o, p) { o.root.material.opacity = 0.85 * (1 - p); },
    },
    wave: {
      make(f, c) { const m = flat(new T.RingGeometry(0.2, 1, 40, 1, -f.half, f.half * 2), c, 0.8); m.position.set(f.x * K, 0.5, (f.y + 3) * K); m.rotation.z = -f.ang; return { root: m }; },
      upd(f, o, p) { o.root.scale.setScalar(Math.max(0.01, f.r * K * Math.min(1, p * 1.4))); o.root.material.opacity = 0.8 * (1 - p); },
    },
    ringfx: {
      make(f, c) { const m = flat(new T.RingGeometry(0.85, 1, 64), c, 0.8); m.position.set(f.x * K, 0.08, (f.y + 4) * K); return { root: m }; },
      upd(f, o, p) { o.root.scale.setScalar(Math.max(0.01, (f.r * p + 2) * K)); o.root.material.opacity = 0.8 * (1 - p); },
    },
    beam: {
      make(f, c) {
        const g = new T.Group();
        const a = flat(new T.PlaneGeometry(1, 1), c, 0.75), b = flat(new T.PlaneGeometry(1, 0.35), 0xffffff, 0.9, 0.01);
        g.add(a, b);
        g.position.set((f.x + Math.cos(f.ang) * f.len / 2) * K, 0.6, (f.y + 3 + Math.sin(f.ang) * f.len / 2) * K);
        g.rotation.y = -f.ang; g.scale.set(f.len * K, 1, f.w * K * 2);
        const tip = new T.Mesh(new T.ConeGeometry(0.4, 1.2, 8), glow(c, 0.85));
        tip.rotation.z = -Math.PI / 2;
        tip.position.set((f.x + Math.cos(f.ang) * f.len) * K, 0.6, (f.y + 3 + Math.sin(f.ang) * f.len) * K);
        const holder = new T.Group(); holder.add(g);
        const tg = new T.Group(); tg.position.copy(tip.position); tg.rotation.y = -f.ang; tip.position.set(0, 0, 0); tg.add(tip); holder.add(tg);
        return { root: holder, a, b, tip, g };
      },
      upd(f, o, p) {
        o.a.material.opacity = 0.75 * (1 - p); o.b.material.opacity = 0.9 * (1 - p); o.tip.material.opacity = 0.85 * (1 - p);
        o.g.scale.z = f.w * K * 2 * (1 - p * 0.7);
      },
    },
    strike: {
      make(f, c) {
        const g = new T.Group(); g.position.set(f.x * K, 0, f.y * K);
        const ring = flat(new T.RingGeometry(0.8, 1, 40), c, 0.9, 0.06); ring.scale.setScalar(f.r * K); g.add(ring);
        const disc = flat(new T.CircleGeometry(1, 32), c, 0.25, 0.05); disc.scale.setScalar(f.r * K); g.add(disc);
        const h = f.big ? 9 : 5;
        const spear = new T.Mesh(new T.CylinderGeometry(f.big ? 0.55 : 0.09, f.big ? 0.55 : 0.02, h, 10, 1, !!f.big), glow(f.big ? c : 0xffffff, 0.9));
        g.add(spear);
        return { root: g, ring, disc, spear, h };
      },
      upd(f, o, p) {
        const fall = Math.min(1, p / 0.45);
        o.spear.position.y = o.h / 2 + (1 - fall) * 6;
        o.spear.material.opacity = f.big ? 0.55 * (1 - p) : (p < 0.5 ? 0.95 : 0.95 * (1 - (p - 0.5) * 2));
        o.ring.scale.setScalar(f.r * K * (p < 0.5 ? 1 : 1 + (p - 0.5) * 1.5)); o.ring.material.opacity = 0.9 * (1 - p);
        o.disc.material.opacity = (p > 0.45 && p < 0.65 ? 0.7 : 0.25) * (1 - p);
      },
    },
    ghost: {
      make(f, c) { const m = new T.Mesh(cap(0.25, 0.8), glow(c, 0.35)); m.position.set(f.x * K, 0.75, f.y * K); return { root: m }; },
      upd(f, o, p) { o.root.material.opacity = 0.35 * (1 - p); o.root.scale.setScalar(1 - p * 0.3); },
    },
  };

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
      const mv = o.px != null && Math.hypot(e.x - o.px, e.y - o.py) > 0.15;
      o.px = e.x; o.py = e.y;
      if (o.anim) o.anim(e, o, e.t, dt, mv);
      if (o.aura) { o.aura.visible = !e.boss || e.active; o.aura.rotation.z = e.t * 0.5; }
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
      if (h.type === 'ring') {
        const c = new T.Color(h.color).getHex();
        const r = new T.Mesh(new T.RingGeometry(0.88, 1, 64), glow(c, 0.9)); g.add(r);
        const wall = new T.Mesh(new T.CylinderGeometry(1, 1, 0.6, 64, 1, true), glow(c, 0.35)); wall.rotation.x = Math.PI / 2; wall.position.z = 0.3; g.add(wall);
        return { root: g, a: r };
      }
      const a = new T.Mesh(new T.CircleGeometry(1, 40), glow(0xff2850, 0.22)), b = new T.Mesh(new T.CircleGeometry(1, 40), glow(0xff2850, 0.35)), c = new T.Mesh(new T.RingGeometry(0.93, 1, 48), glow(0xff2850, 0.9));
      const beam = new T.Mesh(new T.CylinderGeometry(1, 1, 3, 32, 1, true), glow(0xff2850, 0.12)); beam.rotation.x = Math.PI / 2; beam.position.z = 1.5;
      g.add(a, b, c, beam); return { root: g, a, b, c, beam };
    }, (h, o) => {
      o.root.position.x = h.x * K; o.root.position.z = h.y * K;
      if (h.type === 'ring') { const r = Math.max(0.01, h.r * K); o.root.scale.set(r, r, 1); o.root.children.forEach((c) => { c.material.opacity = (c === o.a ? 0.9 : 0.35) * Math.max(0, 1 - h.r / h.max); }); return; }
      const r = h.r * K; o.a.scale.setScalar(r); o.c.scale.setScalar(r); o.beam.scale.set(r, 1, r);
      o.c.material.opacity = 0.6 + Math.sin(h.t * 25) * 0.3; o.beam.visible = !h.done;
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
    const heroRing = (HERO[S.hero] || HERO.luna).ring;
    const colOf = (f) => (f.color ? new T.Color(f.color).getHex() : heroRing);
    sync(run.fx.filter((f) => FX3D[f.type]), objs.fx, (f) => FX3D[f.type].make(f, colOf(f)), (f, o) => FX3D[f.type].upd(f, o, f.t / f.life));
    // 月光斬劍氣
    sync(run.pprojs, objs.pprojs, (p) => {
      const g = new T.Group();
      const c = new T.Color(p.color).getHex();
      const m = new T.Mesh(new T.RingGeometry(0.55, 1, 28, 1, -1.15, 2.3), glow(c, 0.9)); m.rotation.x = -Math.PI / 2; g.add(m);
      const w = new T.Mesh(new T.RingGeometry(0.85, 0.95, 28, 1, -1.0, 2.0), glow(0xffffff, 0.9)); w.rotation.x = -Math.PI / 2; w.position.y = 0.01; g.add(w);
      g.scale.setScalar(p.r * K * 1.3); g.rotation.y = -p.ang;
      return { root: g };
    }, (p, o) => { o.root.position.set(p.x * K, 0.55, (p.y + 3) * K); o.root.children[0].material.opacity = Math.min(0.9, p.life / 0.12); });
    // 旋風光環
    if (P.spin) {
      if (!R.spinFx) {
        const g = new T.Group();
        g.add(new T.Mesh(new T.TorusGeometry(1, 0.05, 8, 48), glow(heroRing, 0.85)));
        g.add(new T.Mesh(new T.CircleGeometry(1, 40), glow(heroRing, 0.18)));
        for (let i = 0; i < 3; i++) g.add(new T.Mesh(new T.RingGeometry(0.7, 1, 16, 1, i * 2.1, 0.9), glow(0xffffff, 0.7)));
        g.rotation.x = -Math.PI / 2; scene.add(g); R.spinFx = g;
      }
      R.spinFx.visible = true;
      R.spinFx.children[0].material.color.setHex(heroRing); R.spinFx.children[1].material.color.setHex(heroRing);
      R.spinFx.scale.setScalar(P.spin.R * K); R.spinFx.position.set(P.x * K, 0.5, P.y * K); R.spinFx.rotation.z += dt * 14;
    } else if (R.spinFx) R.spinFx.visible = false;
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
    if (R.spinFx) R.spinFx.visible = false;
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
