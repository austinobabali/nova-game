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

  // ======================= 技能 =======================
  const CAST = {
    wave(lv, sk) {
      const P = G.P, R = sk.range(lv);
      Combat.arcHit(P.x, P.y - 3, P.face, R, 0.62, sk.mult(lv), { kb: 200 });
      G.FX.add({ type: 'wave', x: P.x, y: P.y - 3, ang: P.face, r: R, half: 0.62, life: 0.32 });
      G.Audio.play('wave');
    },
    spin(lv, sk) {
      G.P.spin = { t: 1.6, tick: 0, R: sk.range(lv), mult: sk.mult(lv) };
      G.Audio.play('spin');
    },
    dash(lv, sk) {
      const P = G.P;
      P.dashSkill = { t: 0.2, ang: P.face, spd: sk.range(lv) / 0.2, mult: sk.mult(lv), hit: new Set() };
      P.invuln = Math.max(P.invuln, 0.35);
      G.Audio.play('dash');
    },
    encore(lv, sk) {
      const P = G.P, run = G.run;
      run.flash = 0.7; run.flashColor = '#ffd1ec';
      run.shake = Math.max(run.shake, 0.5);
      run.hitstop = 0.08;
      P.invuln = Math.max(P.invuln, 1.2);
      for (const e of run.enemies) {
        if (e.dead) continue;
        if (Math.abs(e.x - P.x) < G.W / 2 + 20 && Math.abs(e.y - P.y) < G.H / 2 + 20) Combat.hitEnemy(e, sk.mult(lv), U.angTo(P, e), { kb: 160 });
      }
      for (let i = 0; i < 3; i++) G.FX.add({ type: 'ringfx', x: P.x, y: P.y - 4, r: 120 + i * 60, color: ['#ff8fd0', '#ffd84f', '#5ce1ff'][i], life: 0.5 + i * 0.15 });
      G.FX.burst(P.x, P.y - 6, '#ffd84f', 40, 200, 0.9);
      G.FX.burst(P.x, P.y - 6, '#ff8fd0', 40, 160, 0.9);
      G.FX.text(P.x, P.y - 30, 'ENCORE!', '#ff8fd0', true);
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
      CAST[name](lv, sk);
    },
    update(dt) {
      const P = G.P;
      if (P.spin) {
        P.spin.t -= dt; P.spin.tick -= dt;
        if (P.spin.tick <= 0) {
          P.spin.tick = 0.22;
          Combat.circleHit(P.x, P.y - 4, P.spin.R, P.spin.mult, { kb: 50 });
        }
        if (P.spin.t <= 0) P.spin = null;
      }
      if (P.dashSkill) {
        const ds = P.dashSkill;
        ds.t -= dt;
        G.World.move(G.run.map, P, Math.cos(ds.ang) * ds.spd * dt, Math.sin(ds.ang) * ds.spd * dt);
        Combat.circleHit(P.x, P.y - 4, 16, ds.mult, { kb: 120, ang: ds.ang }, ds.hit);
        G.Player.ghost(dt);
        if (ds.t <= 0) P.dashSkill = null;
      }
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
