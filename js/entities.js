'use strict';
// ============================================================
//  實體：玩家 Nova、掉落物、特效／傷害數字
// ============================================================
(function () {
  const U = G.U, D = G.DATA;

  // ======================= 特效 =======================
  const FX = (G.FX = {
    add(o) { const l = G.run.fx; o.t = 0; l.push(o); if (l.length > 600) l.splice(0, 100); },
    burst(x, y, color, n, spd, life) {
      n = n || 10; spd = spd || 60; life = life || 0.5;
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, U.TAU), s = U.rand(0.3, 1) * spd;
        this.add({ type: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.6, 1) * life, color, size: Math.random() < 0.5 ? 1 : 2 });
      }
    },
    text(x, y, txt, color, big) {
      this.add({ type: 'text', x: x + U.rand(-3, 3), y, txt: String(txt), color: color || '#fff', big: !!big, life: big ? 0.9 : 0.7 });
    },
    update(dt) {
      const l = G.run.fx;
      for (const f of l) {
        f.t += dt;
        if (f.type === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; const k = Math.pow(0.02, dt); f.vx *= k; f.vy *= k; }
        else if (f.type === 'text') f.y -= (f.big ? 26 : 20) * dt;
      }
      G.run.fx = l.filter((f) => f.t < f.life);
    },
    render(ctx) {
      for (const f of G.run.fx) {
        const p = f.t / f.life;
        switch (f.type) {
          case 'p':
            ctx.globalAlpha = 1 - p; ctx.fillStyle = f.color;
            ctx.fillRect(Math.round(f.x), Math.round(f.y), f.size, f.size);
            break;
          case 'slash': {
            const a0 = f.ang - f.half, sweep = f.half * 2 * Math.min(1, p * 1.8);
            const fromA = f.dir > 0 ? a0 : f.ang + f.half - sweep;
            ctx.globalAlpha = 1 - p * 0.8;
            ctx.lineCap = 'round';
            ctx.strokeStyle = f.color || '#ff8fd0'; ctx.lineWidth = 5 * (1 - p) + 1;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r - 4, fromA, fromA + sweep); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r - 6, fromA, fromA + sweep); ctx.stroke();
            break;
          }
          case 'wave':
            ctx.lineWidth = 2;
            for (let k = 0; k < 3; k++) {
              const rr = f.r * Math.min(1, p * 1.3 + k * 0.12);
              ctx.globalAlpha = Math.max(0, 1 - p) * (1 - k * 0.25);
              ctx.strokeStyle = k === 1 ? '#ff8fd0' : '#5ce1ff';
              ctx.beginPath(); ctx.arc(f.x, f.y, rr, f.ang - f.half, f.ang + f.half); ctx.stroke();
            }
            break;
          case 'ghost':
            ctx.globalAlpha = 0.45 * (1 - p);
            G.Sprites.draw(ctx, f.sprite, f.x, f.y, { flip: f.flip });
            break;
          case 'beam':
            ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.color; ctx.lineWidth = f.w * (1 - p * 0.6); ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(f.ang) * f.len, f.y + Math.sin(f.ang) * f.len); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            break;
          case 'strike':
            ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (p < 0.5 ? 1 : 1 + (p - 0.5)), 0, U.TAU); ctx.stroke();
            ctx.fillStyle = f.color; ctx.fillRect(f.x - 1.5, f.y - 40 * (1 - Math.min(1, p * 2)), 3, 40 * (1 - Math.min(1, p * 2)));
            break;
          case 'ringfx':
            ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r * p + 2, 0, U.TAU); ctx.stroke();
            break;
          case 'text': {
            ctx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
            const sz = f.big ? 10 : 8;
            ctx.font = `${sz}px "Press Start 2P", "Noto Sans TC", monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.9)';
            const sc = f.big && p < 0.15 ? 1 + (0.15 - p) * 3 : 1;
            ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y)); ctx.scale(sc, sc);
            ctx.strokeText(f.txt, 0, 0); ctx.fillStyle = f.color; ctx.fillText(f.txt, 0, 0);
            ctx.restore();
            break;
          }
        }
      }
      ctx.globalAlpha = 1;
    },
  });

  // ======================= 掉落物 =======================
  G.Pickups = {
    add(o) { o.t = 0; o.vx = U.rand(-50, 50); o.vy = U.rand(-50, 50); G.run.pickups.push(o); },
    gold(x, y, v) { this.add({ kind: 'gold', x, y, v, r: 2 }); },
    potion(x, y, v) { this.add({ kind: 'potion', x, y, v, r: 2 }); },
    item(x, y, v) { this.add({ kind: 'item', x, y, v, r: 2 }); },
    update(dt) {
      const P = G.P, S = G.S, map = G.run.map;
      for (const p of G.run.pickups) {
        p.t += dt;
        if (p.t < 0.35) { G.World.move(map, p, p.vx * dt, p.vy * dt); continue; }
        if (p.kind === 'item' && S.inv.length >= D.invSize) { p.full = true; continue; }
        if (p.kind === 'potion' && S.potions[p.v] >= D.maxPotions) continue;
        p.full = false;
        const d = U.dist(p, P);
        const mag = p.kind === 'gold' ? 48 : 30;
        if (d < mag) { const a = U.angTo(p, P), s = 170; p.x += Math.cos(a) * s * dt; p.y += Math.sin(a) * s * dt; }
        if (d < 8) this.collect(p);
        if (p.kind === 'gold' && p.t > 40) p.gone = true;
      }
      G.run.pickups = G.run.pickups.filter((p) => !p.gone);
    },
    collect(p) {
      const S = G.S, P = G.P;
      p.gone = true;
      if (p.kind === 'gold') { S.gold += p.v; FX.text(P.x, P.y - 18, '+' + p.v, '#ffd84f'); G.Audio.play('coin'); }
      else if (p.kind === 'potion') { S.potions[p.v]++; FX.text(P.x, P.y - 18, D.potions[p.v].name, '#9fe6ff'); G.Audio.play('pickup'); }
      else {
        const it = D.items[p.v];
        S.inv.push(p.v);
        G.UI.toast(`獲得【${D.rarityName[it.rarity]}】${it.name}`, D.rarityColor[it.rarity]);
        G.Audio.play('pickup');
      }
    },
    render(ctx) {
      const t = G.run.time;
      for (const p of G.run.pickups) {
        const bob = Math.round(Math.sin(t * 5 + p.x) * 1.5);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) + 2, 6, 2);
        if (p.kind === 'gold') {
          ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(Math.round(p.x), Math.round(p.y) - 2 + bob, 3, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(Math.round(p.x), Math.round(p.y) - 2 + bob, 2.2, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#fff6c0'; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 4 + bob, 1, 1);
        } else {
          const key = p.kind === 'potion' ? p.v : D.items[p.v].slot;
          if (p.kind === 'item') {
            const col = D.rarityColor[D.items[p.v].rarity];
            ctx.globalAlpha = 0.35 + Math.sin(t * 6) * 0.15; ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(p.x, p.y - 4 + bob, 8, 0, U.TAU); ctx.fill(); ctx.globalAlpha = 1;
            if (D.items[p.v].rarity !== 'common') { ctx.fillStyle = col; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 30 + bob, 2, 14); ctx.globalAlpha = 1; }
          }
          ctx.drawImage(G.Sprites.icon(key).canvas, Math.round(p.x) - 5, Math.round(p.y) - 9 + bob);
        }
      }
    },
  };

  // ======================= 玩家 =======================
  const Player = (G.Player = {
    init() {
      G.P = {
        x: 0, y: 0, r: 5, hp: 1, mp: 0, face: 0, lr: 1, invuln: 0, hurtT: 0, moving: false, anim: 0,
        atk: { cd: 0, combo: 0, window: 0, anim: 0 },
        dash: { t: 0, cd: 0, vx: 0, vy: 0 },
        spin: null, dashSkill: null,
        cd: { wave: 0, spin: 0, dash: 0, encore: 0 }, cdMax: { wave: 1, spin: 1, dash: 1, encore: 1 },
        ghostT: 0, st: null,
      };
      this.recalc();
      this.fullHeal();
    },
    recalc() {
      const S = G.S, P = G.P, b = D.base, pl = D.perLevel, lv = S.level - 1, a = S.attrs;
      const st = {
        maxHp: b.hp + lv * pl.hp + a.vit * 12,
        maxMp: b.mp + lv * pl.mp + a.agi * 4,
        atk: b.atk + lv * pl.atk + a.str * 2,
        def: b.def + lv * pl.def + a.vit * 0.5,
        crit: b.crit + a.cha * 0.01,
        critDmg: b.critDmg + a.cha * 0.02,
        spd: b.spd + a.agi * 2,
        cdr: Math.min(0.4, a.agi * 0.015),
      };
      for (const slot of ['weapon', 'armor', 'acc']) {
        const it = S.equip[slot] && D.items[S.equip[slot]];
        if (!it) continue;
        const s = it.stats;
        st.atk += s.atk || 0; st.def += s.def || 0; st.maxHp += s.hp || 0; st.maxMp += s.mp || 0;
        st.crit += s.crit || 0; st.spd += s.spd || 0;
      }
      st.crit = Math.min(0.75, st.crit);
      P.st = st;
      P.hp = Math.min(P.hp, st.maxHp);
      P.mp = Math.min(P.mp, st.maxMp);
    },
    fullHeal() { G.P.hp = G.P.st.maxHp; G.P.mp = G.P.st.maxMp; },
    resetAt(x, y) {
      const P = G.P;
      P.x = x; P.y = y; P.dash.t = 0; P.spin = null; P.dashSkill = null; P.invuln = 0.5; P.hurtT = 0;
    },

    gainExp(n) {
      const S = G.S;
      if (S.level >= D.maxLevel) return;
      S.exp += n;
      let up = false;
      while (S.level < D.maxLevel && S.exp >= D.expFor(S.level)) {
        S.exp -= D.expFor(S.level);
        S.level++; S.attrPts += 3; S.skillPts += 1; up = true;
      }
      if (S.level >= D.maxLevel) S.exp = 0;
      if (up) {
        this.recalc(); this.fullHeal();
        const P = G.P;
        FX.text(P.x, P.y - 26, 'LEVEL UP!', '#ffd84f', true);
        FX.add({ type: 'ringfx', x: P.x, y: P.y - 4, r: 40, color: '#ffd84f', life: 0.6 });
        FX.burst(P.x, P.y - 6, '#ffd84f', 24, 90, 0.8);
        G.Audio.play('level');
        let msg = `升級到 Lv ${S.level}！獲得 3 屬性點、1 技能點`;
        for (const k of D.skillOrder) if (D.skills[k].unlock === S.level) msg += `　新技能可學習：${D.skills[k].name}`;
        G.UI.toast(msg, '#ffd84f');
      }
    },

    usePotion(type) {
      const S = G.S, P = G.P, st = P.st;
      if (S.potions[type] <= 0) { G.UI.toast(`沒有${D.potions[type].name}了`, '#ff8fa0'); G.Audio.play('err'); return; }
      if (type === 'hp' && P.hp >= st.maxHp) return;
      if (type === 'mp' && P.mp >= st.maxMp) return;
      S.potions[type]--;
      if (type === 'hp') { const v = Math.round(st.maxHp * 0.35); P.hp = Math.min(st.maxHp, P.hp + v); FX.text(P.x, P.y - 20, '+' + v, '#7dff9a'); }
      else { const v = Math.round(st.maxMp * 0.5); P.mp = Math.min(st.maxMp, P.mp + v); FX.text(P.x, P.y - 20, '+' + v, '#5ca0ff'); }
      FX.burst(P.x, P.y - 6, type === 'hp' ? '#7dff9a' : '#5ca0ff', 12, 40);
      G.Audio.play('heal');
    },

    attack() {
      const P = G.P;
      if (P.atk.cd > 0 || P.dashSkill || P.dash.t > 0) return;
      const H = D.heroes[G.S.hero] || D.heroes.luna;
      const c = P.atk.window > 0 ? (P.atk.combo + 1) % 3 : 0;
      P.atk.combo = c; P.atk.window = 0.55; P.atk.cd = (c === 2 ? 0.42 : 0.24) * H.cdMul; P.atk.anim = 0.15;
      const mult = [1, 1.15, 1.7][c] * H.multMul;
      const R = H.range, half = H.arc / 2;
      G.Combat.arcHit(P.x, P.y - 4, P.face, R, half, mult, { kb: c === 2 ? 130 : 60 });
      FX.add({ type: 'slash', x: P.x, y: P.y - 4, ang: P.face, r: R, half, dir: c === 1 ? -1 : 1, life: 0.16 });
      G.World.move(G.run.map, P, Math.cos(P.face) * 3, Math.sin(P.face) * 3);
      G.Audio.play('swing');
    },

    update(dt) {
      const P = G.P, I = G.Input, st = P.st, map = G.run.map;
      P.invuln = Math.max(0, P.invuln - dt); P.hurtT = Math.max(0, P.hurtT - dt);
      P.atk.cd -= dt; P.atk.window -= dt; P.atk.anim -= dt; P.dash.cd -= dt;
      for (const k in P.cd) P.cd[k] = Math.max(0, P.cd[k] - dt);
      P.mp = Math.min(st.maxMp, P.mp + (2 + st.maxMp * 0.02) * dt);
      if (G.run.mode === 'hub') { P.hp = Math.min(st.maxHp, P.hp + st.maxHp * 0.25 * dt); P.mp = Math.min(st.maxMp, P.mp + st.maxMp * 0.25 * dt); }

      const ax = I.axis();
      let mx = ax.x, my = ax.y;
      const len = Math.hypot(mx, my);
      if (len) { mx /= len; my /= len; }

      if (P.dash.t > 0) {
        P.dash.t -= dt;
        G.World.move(map, P, P.dash.vx * dt, P.dash.vy * dt);
        this.ghost(dt);
        return;
      }
      if (P.dashSkill) { P.moving = true; P.anim += dt; return; }

      P.moving = len > 0;
      if (len) {
        P.face = Math.atan2(my, mx);
        if (Math.abs(mx) > 0.1) P.lr = mx > 0 ? 1 : -1;
        const sp = st.spd * (P.spin ? P.spin.spd : 1) * (P.atk.anim > 0 ? 0.5 : 1);
        G.World.move(map, P, mx * sp * dt, my * sp * dt);
        P.anim += dt;
      }
      for (const n of map.npcs) {
        const d = U.dist(P, n);
        if (d < 11 && d > 0.01) { const a = U.angTo(n, P); G.World.move(map, P, Math.cos(a) * (11 - d), Math.sin(a) * (11 - d)); }
      }

      if (I.pressed('KeyJ')) this.attack();
      if (I.pressed('Space') && P.dash.cd <= 0 && !P.dashSkill) {
        const a = len ? Math.atan2(my, mx) : P.face;
        P.dash.t = 0.16; P.dash.vx = Math.cos(a) * 270; P.dash.vy = Math.sin(a) * 270;
        P.dash.cd = 0.75 * (1 - st.cdr);
        P.invuln = Math.max(P.invuln, 0.22);
        G.Audio.play('dash');
      }
      for (const k of D.skillOrder) if (I.pressed(D.skills[k].code)) G.Skills.cast(k);
      if (I.pressed('KeyQ')) this.usePotion('hp');
      if (I.pressed('KeyR')) this.usePotion('mp');
    },

    ghost(dt) {
      const P = G.P;
      P.ghostT -= dt;
      if (P.ghostT <= 0) { P.ghostT = 0.03; FX.add({ type: 'ghost', sprite: 'nova_a', x: P.x, y: P.y, flip: P.lr < 0, life: 0.22 }); }
    },

    render(ctx) {
      const P = G.P, t = G.run.time;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(Math.round(P.x), Math.round(P.y) + 3, 6, 2.5, 0, 0, U.TAU); ctx.fill();
      if (P.spin) {
        const R = P.spin.R;
        ctx.save(); ctx.translate(P.x, P.y - 4);
        ctx.globalAlpha = 0.25; ctx.fillStyle = '#ff8fd0'; ctx.beginPath(); ctx.arc(0, 0, R, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
        for (let i = 0; i < 3; i++) { const a = t * 18 + (i * U.TAU) / 3; ctx.beginPath(); ctx.arc(0, 0, R - 2, a, a + 0.8); ctx.stroke(); }
        ctx.restore(); ctx.globalAlpha = 1;
      }
      if (P.hurtT > 0 && Math.floor(P.hurtT * 20) % 2) return;
      const frame = P.moving && Math.floor(P.anim * 8) % 2 ? 'nova_b' : 'nova_a';
      G.Sprites.draw(ctx, frame, P.x, P.y, { flip: P.lr < 0 });
      // 應援棒
      const hx = Math.round(P.x) + P.lr * 4, hy = Math.round(P.y) - 2;
      let tx, ty;
      if (P.atk.anim > 0 || P.spin) { const a = P.spin ? t * 18 : P.face; tx = hx + Math.cos(a) * 8; ty = hy + Math.sin(a) * 8; }
      else { tx = hx + P.lr * 1; ty = hy - 7; }
      ctx.strokeStyle = '#d8d8e0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = 'rgba(255,111,181,.35)'; ctx.beginPath(); ctx.arc(tx, ty, 3.5, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#ff8fd0'; ctx.beginPath(); ctx.arc(tx, ty, 1.8, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(tx) - 0.5, Math.round(ty) - 0.5, 1, 1);
    },
  });
})();
