'use strict';
// ============================================================
//  戰鬥：傷害計算、命中判定、受傷、擊殺與掉落
// ============================================================
(function () {
  const U = G.U, D = G.DATA;

  function alive() { return G.run.enemies.filter((e) => !e.dead); }

  const Combat = (G.Combat = {
    hitEnemy(e, mult, ang, opts) {
      if (e.dead) return;
      opts = opts || {};
      const st = G.P.st;
      if (e.boss && !e.active) { e.active = true; G.Game.bossStart(e); }
      let dmg = Math.max(1, st.atk * mult - e.def * 0.6) * U.rand(0.9, 1.1);
      const crit = Math.random() < st.crit;
      if (crit) dmg *= st.critDmg;
      dmg = Math.round(dmg);
      e.hp -= dmg;
      e.flash = 0.12;
      const kb = (opts.kb || 60) * (e.boss ? 0.08 : 1);
      e.kbx += Math.cos(ang) * kb; e.kby += Math.sin(ang) * kb;
      G.FX.text(e.x, e.y - 14 * (e.d.scale || 1), dmg, crit ? '#ffd84f' : '#ffffff', crit);
      G.FX.burst(e.x, e.y - 6, crit ? '#ffd84f' : '#ff8fd0', crit ? 8 : 4, 50, 0.3);
      G.Audio.play(crit ? 'crit' : 'hit');
      if (crit) G.run.hitstop = Math.max(G.run.hitstop, 0.035);
      if (e.hp <= 0) this.kill(e);
    },

    arcHit(x, y, ang, R, half, mult, opts) {
      let n = 0;
      for (const e of alive()) {
        const ey = e.y - 4;
        const d = Math.hypot(e.x - x, ey - y);
        if (d > R + e.r) continue;
        const a = Math.atan2(ey - y, e.x - x);
        if (d > e.r + 4 && Math.abs(U.angDiff(ang, a)) > half) continue;
        this.hitEnemy(e, mult, a, opts); n++;
      }
      return n;
    },

    circleHit(x, y, R, mult, opts, set) {
      let n = 0;
      for (const e of alive()) {
        if (set && set.has(e)) continue;
        const d = Math.hypot(e.x - x, e.y - 4 - y);
        if (d > R + e.r) continue;
        if (set) set.add(e);
        this.hitEnemy(e, mult, opts && opts.ang != null ? opts.ang : Math.atan2(e.y - y, e.x - x), opts); n++;
      }
      return n;
    },

    hurtPlayer(raw, sx, sy) {
      const P = G.P, run = G.run;
      if (P.invuln > 0 || run.over) return;
      const dmg = Math.max(1, Math.round((raw - P.st.def * 0.6) * U.rand(0.9, 1.1)));
      P.hp -= dmg;
      P.invuln = 0.7; P.hurtT = 0.7;
      run.shake = Math.max(run.shake, 0.25);
      G.FX.text(P.x, P.y - 18, '-' + dmg, '#ff4f6a');
      G.FX.burst(P.x, P.y - 6, '#ff4f6a', 8, 60, 0.35);
      G.Audio.play('hurt');
      if (sx != null) {
        const a = Math.atan2(P.y - sy, P.x - sx);
        G.World.move(run.map, P, Math.cos(a) * 8, Math.sin(a) * 8);
      }
      if (P.hp <= 0) { P.hp = 0; G.Game.playerDied(); }
    },

    kill(e) {
      if (e.dead) return;
      e.dead = true;
      const S = G.S, run = G.run, d = e.d;
      S.kills = (S.kills || 0) + 1;
      const k = e.minion ? 0.5 : 1;
      G.Player.gainExp(Math.round(d.exp * k));
      const total = Math.max(1, Math.round(U.randInt(d.gold[0], d.gold[1]) * k));
      const n = Math.min(e.boss ? 12 : 4, Math.max(1, Math.ceil(total / 6)));
      for (let i = 0; i < n; i++) G.Pickups.gold(e.x, e.y, Math.max(1, Math.round(total / n)));
      G.FX.burst(e.x, e.y - 6, '#ffffff', e.boss ? 40 : 12, e.boss ? 140 : 70, 0.6);
      G.FX.burst(e.x, e.y - 6, '#2b1838', e.boss ? 30 : 8, 50, 0.7);
      G.Audio.play(e.boss ? 'boom' : 'hit');
      if (e.boss) { G.Game.bossDefeated(e); return; }
      if (e.minion) return;
      const tier = run.zone ? run.zone.tier : 1;
      if (Math.random() < 0.07) G.Pickups.potion(e.x, e.y, Math.random() < 0.6 ? 'hp' : 'mp');
      if (Math.random() < 0.05) G.Pickups.item(e.x, e.y, this.rollDrop(tier));
    },

    rollDrop(tier, forced) {
      let rarity = forced;
      if (!rarity) {
        const r = Math.random();
        rarity = tier >= 3 && r < 0.03 ? 'legendary' : r < 0.25 ? 'rare' : 'common';
      }
      const all = Object.values(D.items);
      let pool = rarity === 'legendary'
        ? all.filter((i) => i.rarity === 'legendary')
        : all.filter((i) => i.rarity === rarity && i.tier >= Math.max(1, tier - 1) && i.tier <= tier);
      if (rarity !== 'legendary') {
        const cur = pool.filter((i) => i.tier === tier);
        if (cur.length && Math.random() < 0.7) pool = cur;
      }
      if (!pool.length) pool = all.filter((i) => i.rarity === 'common' && i.tier > 0 && i.tier <= tier);
      return U.pick(pool).id;
    },
  });

  // ======================= 技能（依類型執行，三位主角共用機制） =======================
  const HERO_COL = { amira: '#5ce1ff', luna: '#b98cff', rosa: '#ffe27a' };
  const heroCol = () => HERO_COL[G.S.hero] || '#ff8fd0';
  function later(t, fn) { G.run.skq.push({ t, fn }); }
  function lineHit(x, y, ang, len, w, mult, opts) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (const e of alive()) {
      const ex = e.x - x, ey = e.y - 4 - y;
      const along = ex * dx + ey * dy, perp = Math.abs(ex * dy - ey * dx);
      if (along < -e.r || along > len + e.r || perp > w + e.r) continue;
      Combat.hitEnemy(e, mult, ang, opts);
    }
  }
  function onScreen(e) { const P = G.P; return Math.abs(e.x - P.x) < G.W / 2 + 20 && Math.abs(e.y - P.y) < G.H / 2 + 20; }

  const CAST = {
    cone(lv, sk) {
      const P = G.P, R = sk.range(lv), half = sk.half || 0.62, hits = sk.hits || 1;
      for (let i = 0; i < hits; i++) later(i * (sk.gap || 0.1), () => {
        Combat.arcHit(P.x, P.y - 3, P.face, R, half, sk.mult(lv), { kb: i === hits - 1 ? 170 : 40 });
        G.FX.add({ type: 'slash', x: P.x, y: P.y - 4, ang: P.face + (i % 2 ? 0.35 : -0.35), r: R, half, dir: i % 2 ? -1 : 1, life: 0.16, color: heroCol() });
        G.Audio.play('swing');
      });
      if (hits === 1) G.FX.add({ type: 'wave', x: P.x, y: P.y - 3, ang: P.face, r: R, half, life: 0.32, color: heroCol() });
    },
    proj(lv, sk) {
      const P = G.P, s = sk.speed, R = sk.range(lv);
      G.run.pprojs.push({ x: P.x, y: P.y - 3, vx: Math.cos(P.face) * s, vy: Math.sin(P.face) * s, ang: P.face, r: 13, mult: sk.mult(lv), life: R / s, max: R / s, hit: new Set(), color: heroCol() });
      G.FX.add({ type: 'slash', x: P.x, y: P.y - 4, ang: P.face, r: 26, half: 1.2, dir: 1, life: 0.16, color: heroCol() });
      G.Audio.play('wave');
    },
    line(lv, sk) {
      const P = G.P, R = sk.range(lv);
      lineHit(P.x, P.y - 3, P.face, R, sk.width, sk.mult(lv), { kb: 160 });
      G.FX.add({ type: 'beam', x: P.x, y: P.y - 3, ang: P.face, len: R, w: sk.width, life: 0.3, color: heroCol() });
      G.FX.burst(P.x + Math.cos(P.face) * R, P.y + Math.sin(P.face) * R, heroCol(), 10, 60);
      G.Audio.play('wave');
    },
    spin(lv, sk) {
      G.P.spin = { t: sk.dur, tick: 0, tickT: sk.tick, R: sk.range(lv), mult: sk.mult(lv), spd: sk.spd };
      G.Audio.play('spin');
    },
    dash(lv, sk) {
      const P = G.P;
      P.dashSkill = { t: 0.2, ang: P.face, spd: sk.range(lv) / 0.2, mult: sk.mult(lv), hit: new Set(), blast: sk.blast ? sk.blast(lv) : 0 };
      P.invuln = Math.max(P.invuln, 0.35);
      G.Audio.play('dash');
    },
    rain(lv, sk) {
      const P = G.P, R = sk.range(lv), n = sk.count(lv), mult = sk.mult(lv);
      const targets = alive().filter((e) => Math.hypot(e.x - P.x, e.y - P.y) < R + 20).sort(() => Math.random() - 0.5);
      for (let i = 0; i < n; i++) later(i * 0.11, () => {
        let x, y;
        const tg = targets[i % Math.max(1, targets.length)];
        if (tg && !tg.dead && i < targets.length * 2) { x = tg.x + U.rand(-6, 6); y = tg.y + U.rand(-6, 6); }
        else { const a = U.rand(0, U.TAU), d = U.rand(10, R); x = G.P.x + Math.cos(a) * d; y = G.P.y + Math.sin(a) * d; }
        G.FX.add({ type: 'strike', x, y, r: sk.radius, life: 0.4, color: heroCol() });
        later(0.2, () => { Combat.circleHit(x, y, sk.radius, mult, { kb: 70 }); G.FX.burst(x, y, heroCol(), 8, 70, 0.35); G.Audio.play('hit'); });
      });
      G.Audio.play('spin');
    },
    ult(lv, sk) {
      const P = G.P, run = G.run, col = heroCol();
      run.flash = 0.7; run.flashColor = sk.style === 'pillar' ? '#fff3c4' : sk.style === 'claw' ? '#d6f8ff' : '#ead6ff';
      run.shake = Math.max(run.shake, 0.5); run.hitstop = 0.08;
      P.invuln = Math.max(P.invuln, 1.2 + (sk.hits || 1) * (sk.gap || 0));
      const hits = sk.hits || 1;
      for (let h = 0; h < hits; h++) later(h * (sk.gap || 0), () => {
        for (const e of run.enemies) {
          if (e.dead || !onScreen(e)) continue;
          Combat.hitEnemy(e, sk.mult(lv), U.angTo(P, e), { kb: h === hits - 1 ? 160 : 20 });
          if (sk.style === 'claw') G.FX.add({ type: 'slash', x: e.x, y: e.y - 4, ang: U.rand(0, U.TAU), r: 18, half: 1.0, dir: 1, life: 0.14, color: col });
          if (sk.style === 'pillar') G.FX.add({ type: 'strike', x: e.x, y: e.y, r: 20, life: 0.45, color: col, big: true });
        }
        if (sk.style === 'claw') G.Audio.play('swing');
      });
      for (let i = 0; i < 3; i++) G.FX.add({ type: 'ringfx', x: P.x, y: P.y - 4, r: 120 + i * 60, color: [col, '#ffd84f', '#ff8fd0'][i], life: 0.5 + i * 0.15 });
      G.FX.burst(P.x, P.y - 6, col, 40, 200, 0.9);
      G.FX.burst(P.x, P.y - 6, '#ffd84f', 30, 160, 0.9);
      G.FX.text(P.x, P.y - 30, sk.short + '!', col, true);
      G.Audio.play('encore');
    },
  };

  G.Skills = {
    cast(name) {
      const S = G.S, P = G.P, sk = D.skills[name], lv = S.skills[name] || 0;
      if (!lv) { G.UI.toast(`尚未習得「${sk.name}」（Lv ${sk.unlock} 起可在角色選單學習）`, '#ff8fa0'); G.Audio.play('err'); return; }
      if (P.cd[name] > 0 || P.dashSkill || P.dash.t > 0) return;
      if (P.mp < sk.mp) { G.UI.toast('MP 不足', '#5ca0ff'); G.Audio.play('err'); return; }
      P.mp -= sk.mp;
      const cd = sk.cd(lv) * (1 - P.st.cdr);
      P.cd[name] = cd; P.cdMax[name] = cd;
      CAST[sk.type](lv, sk);
    },
    update(dt) {
      const P = G.P, run = G.run;
      // 延遲觸發（連擊、流星）
      if (run.skq.length) {
        const due = [];
        for (const q of run.skq) { q.t -= dt; if (q.t <= 0) due.push(q); }
        if (due.length) { run.skq = run.skq.filter((q) => q.t > 0); due.forEach((q) => q.fn()); }
      }
      if (P.spin) {
        P.spin.t -= dt; P.spin.tick -= dt;
        if (P.spin.tick <= 0) { P.spin.tick = P.spin.tickT; Combat.circleHit(P.x, P.y - 4, P.spin.R, P.spin.mult, { kb: 50 }); }
        if (P.spin.t <= 0) P.spin = null;
      }
      if (P.dashSkill) {
        const ds = P.dashSkill;
        ds.t -= dt;
        G.World.move(run.map, P, Math.cos(ds.ang) * ds.spd * dt, Math.sin(ds.ang) * ds.spd * dt);
        Combat.circleHit(P.x, P.y - 4, 16, ds.mult, { kb: 120, ang: ds.ang }, ds.hit);
        G.Player.ghost(dt);
        if (ds.t <= 0) {
          if (ds.blast) {
            Combat.circleHit(P.x, P.y - 4, ds.blast, ds.mult * 0.8, { kb: 180 });
            G.FX.add({ type: 'ringfx', x: P.x, y: P.y - 4, r: ds.blast * 1.4, color: heroCol(), life: 0.4 });
            G.FX.burst(P.x, P.y - 6, '#ffd84f', 20, 120, 0.6);
            run.shake = Math.max(run.shake, 0.25);
            G.Audio.play('boom');
          }
          P.dashSkill = null;
        }
      }
      // 玩家投射物（月光斬）
      for (const p of run.pprojs) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (G.World.solidAt(run.map, p.x, p.y)) { p.life = 0; G.FX.burst(p.x, p.y, p.color, 8, 60); continue; }
        Combat.circleHit(p.x, p.y, p.r, p.mult, { kb: 130, ang: p.ang }, p.hit);
      }
      run.pprojs = run.pprojs.filter((p) => p.life > 0);
    },
    render2D(ctx) {
      for (const p of G.run.pprojs) {
        ctx.globalAlpha = Math.min(1, p.life / 0.15);
        ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, p.ang - 1.1, p.ang + 1.1); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1, p.ang - 0.9, p.ang + 0.9); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    status(name) {
      const S = G.S, sk = D.skills[name], lv = S.skills[name] || 0;
      if (lv >= 5) return 'MAX';
      if (S.level < sk.unlock) return `需 Lv ${sk.unlock}`;
      if (S.skillPts <= 0) return '技能點不足';
      return null;
    },
    learn(name) {
      if (this.status(name)) return false;
      G.S.skills[name] = (G.S.skills[name] || 0) + 1;
      G.S.skillPts--;
      return true;
    },
  };
})();
