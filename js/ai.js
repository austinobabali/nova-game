'use strict';
// ============================================================
//  怪物 AI：小怪行為、三隻 Boss 招式、投射物與地面危險區
// ============================================================
(function () {
  const U = G.U, D = G.DATA;
  const P_ = () => G.P;
  const mv = (e, dx, dy) => G.World.move(G.run.map, e, dx, dy);

  function create(type, x, y, minion) {
    const d = D.enemies[type];
    return {
      type, d, x, y, r: d.r, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, boss: !!d.boss, minion: !!minion,
      kbx: 0, kby: 0, flash: 0, cd: U.rand(0.5, 1.8), t: Math.random() * 10, state: d.boss ? 'think' : 'idle', st: 1.2,
      wx: 0, wy: 0, wt: 0, contactCd: 0, lr: 1, active: !d.boss, phase: 1, seq: 0, side: Math.random() < 0.5 ? -1 : 1,
      ang: 0, count: 0, spinA: 0, tele: null, dead: false,
    };
  }

  // ---------- 投射物 / 危險區 ----------
  function shoot(e, ang, spd, mult, color, r) {
    G.run.projs.push({ x: e.x, y: e.y - 4, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: r || 3, dmg: e.atk * mult, life: 4, color: color || '#fff' });
  }
  function radial(e, n, spd, off, mult, color) { for (let i = 0; i < n; i++) shoot(e, off + (i * U.TAU) / n, spd, mult, color); }
  function ring(e, spd, mult, color) {
    G.run.hazards.push({ type: 'ring', x: e.x, y: e.y, r: e.r, spd, max: 240, dmg: e.atk * mult, hit: false, color: color || '#ff8fd0' });
  }
  function slam(e, x, y, r, tele, mult) {
    G.run.hazards.push({ type: 'slam', x, y, r, t: 0, tele, dmg: e.atk * mult, done: false });
  }
  function minions() { return G.run.enemies.filter((m) => m.minion && !m.dead).length; }
  function summon(e, type, n) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, U.TAU);
      const m = create(type, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, true);
      if (G.World.boxHits(G.run.map, m.x, m.y, m.r)) { m.x = e.x; m.y = e.y; }
      G.run.enemies.push(m);
      G.FX.burst(m.x, m.y - 6, '#ffffff', 10, 60);
    }
  }

  // ---------- 小怪基本行為 ----------
  function chaseStep(e, spd, dt) {
    const a = U.angTo(e, P_());
    mv(e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt);
    e.lr = Math.cos(a) >= 0 ? 1 : -1;
  }
  function wander(e, dt) {
    e.wt -= dt;
    if (e.wt <= 0) {
      e.wt = U.rand(1, 3);
      const a = U.rand(0, U.TAU), go = Math.random() < 0.6;
      e.wx = go ? Math.cos(a) : 0; e.wy = go ? Math.sin(a) : 0;
      if (e.wx) e.lr = e.wx > 0 ? 1 : -1;
    }
    if (mv(e, e.wx * e.d.spd * 0.4 * dt, e.wy * e.d.spd * 0.4 * dt)) e.wt = 0;
  }

  const AI = {
    wobble(e, dt, d) {
      if (d < 170) {
        const a = U.angTo(e, P_()) + Math.sin(e.t * 4) * 0.8;
        mv(e, Math.cos(a) * e.d.spd * dt, Math.sin(a) * e.d.spd * dt);
        e.lr = P_().x > e.x ? 1 : -1;
      } else wander(e, dt);
    },
    hop(e, dt, d) {
      e.st -= dt;
      if (e.state === 'hop') {
        mv(e, e.wx * dt, e.wy * dt);
        if (e.st <= 0) { e.state = 'idle'; e.st = U.rand(0.6, 1.1); }
      } else if (e.st <= 0) {
        const near = d < 160;
        const a = near ? U.angTo(e, P_()) : U.rand(0, U.TAU);
        const sp = near ? e.d.spd * 3.2 : e.d.spd * 1.5;
        e.wx = Math.cos(a) * sp; e.wy = Math.sin(a) * sp;
        e.state = 'hop'; e.st = 0.35; e.lr = e.wx >= 0 ? 1 : -1;
      }
    },
    chase(e, dt, d) {
      if (e.state === 'wind') { e.st -= dt; if (e.st <= 0) { e.state = 'lunge'; e.st = 0.25; } return; }
      if (e.state === 'lunge') {
        e.st -= dt;
        mv(e, Math.cos(e.ang) * e.d.spd * 3.4 * dt, Math.sin(e.ang) * e.d.spd * 3.4 * dt);
        if (e.st <= 0) { e.state = 'idle'; e.cd = U.rand(1.6, 2.4); }
        return;
      }
      if (d < 180) {
        chaseStep(e, e.d.spd, dt);
        if (d < 46 && e.cd <= 0) { e.state = 'wind'; e.st = 0.35; e.ang = U.angTo(e, P_()); }
      } else wander(e, dt);
    },
    ranged(e, dt, d) {
      const P = P_();
      if (e.state === 'wind') {
        e.st -= dt;
        if (e.st <= 0) { shoot(e, U.angTo(e, P), 135, 1, '#fffbe0'); G.Audio.play('shoot'); e.state = 'idle'; e.cd = U.rand(1.8, 2.6); }
        return;
      }
      if (d < 220) {
        e.lr = P.x > e.x ? 1 : -1;
        let a = U.angTo(e, P);
        if (d < 80) a += Math.PI; else if (d < 140) a += (Math.PI / 2) * e.side;
        if (mv(e, Math.cos(a) * e.d.spd * dt, Math.sin(a) * e.d.spd * dt)) e.side *= -1;
        if (e.cd <= 0) { e.state = 'wind'; e.st = 0.5; }
      } else wander(e, dt);
    },
    swarm(e, dt, d) {
      if (d < 240) {
        const a = U.angTo(e, P_()) + Math.sin(e.t * 3 + e.side * 2) * 0.5;
        mv(e, Math.cos(a) * e.d.spd * dt, Math.sin(a) * e.d.spd * dt);
        e.lr = P_().x > e.x ? 1 : -1;
      } else wander(e, dt);
    },
  };

  // ---------- Boss ----------
  function toThink(e, t) { e.state = 'think'; e.st = t; e.tele = null; }
  function keepRange(e, dt, lo, hi, spdK) {
    const P = P_(), d = U.dist(e, P);
    e.lr = P.x > e.x ? 1 : -1;
    if (d > hi) chaseStep(e, e.d.spd * spdK, dt);
    else if (d < lo) { const a = U.angTo(P, e); mv(e, Math.cos(a) * e.d.spd * spdK * dt, Math.sin(a) * e.d.spd * spdK * dt); }
  }

  const BOSS = {
    metronome(e, dt) {
      const P = P_();
      if (e.phase === 1 && e.hp < e.maxHp * 0.5) { e.phase = 2; G.UI.toast('失控節拍器：節拍加速！', '#ff8fd0'); G.Audio.play('boss'); G.run.shake = 0.4; }
      const sp = e.phase === 2 ? 1.4 : 1;
      e.st -= dt;
      switch (e.state) {
        case 'think':
          keepRange(e, dt, 0, 40, 0.7);
          if (e.st <= 0) {
            e.seq++;
            const pat = ['charge', 'rings', 'charge', 'tick'][e.seq % 4];
            if (pat === 'charge') { e.state = 'chargeWind'; e.st = 0.75 / sp; e.ang = U.angTo(e, P); }
            else if (pat === 'rings') { e.state = 'rings'; e.count = e.phase === 2 ? 5 : 3; e.st = 0.2; }
            else { e.state = 'tick'; e.count = e.phase === 2 ? 3 : 2; e.st = 0.3; }
          }
          break;
        case 'chargeWind':
          e.ang = U.angTo(e, P);
          e.tele = { type: 'line', ang: e.ang, len: 230, w: e.r * 2 };
          if (e.st <= 0) { e.state = 'charge'; e.st = 0.9; e.tele = null; }
          break;
        case 'charge': {
          const hit = mv(e, Math.cos(e.ang) * 300 * sp * dt, Math.sin(e.ang) * 300 * sp * dt);
          if (hit || e.st <= 0) {
            if (hit) { G.run.shake = Math.max(G.run.shake, 0.3); ring(e, 120, 1); G.Audio.play('boom'); }
            toThink(e, 0.9 / sp);
          }
          break;
        }
        case 'rings':
          if (e.st <= 0) { ring(e, 110 * sp, 0.9); G.Audio.play('shoot'); e.count--; e.st = 0.55 / sp; if (e.count <= 0) toThink(e, 1); }
          break;
        case 'tick':
          if (e.st <= 0) { radial(e, e.phase === 2 ? 12 : 8, 95 * sp, e.t, 0.8, '#ffd84f'); G.Audio.play('shoot'); e.count--; e.st = 0.5; if (e.count <= 0) toThink(e, 1); }
          break;
      }
    },

    captain(e, dt) {
      const P = P_();
      if (e.phase === 1 && e.hp < e.maxHp * 0.5) { e.phase = 2; G.UI.toast('狗仔隊長：全員出動！閃光燈火力全開！', '#5ce1ff'); G.Audio.play('boss'); G.run.shake = 0.4; }
      const p2 = e.phase === 2;
      e.st -= dt;
      switch (e.state) {
        case 'think':
          keepRange(e, dt, 70, 130, 1);
          if (e.st <= 0) {
            e.seq++;
            const pat = ['barrage', 'aimed', 'summon', 'flash', 'aimed', 'barrage'][e.seq % 6];
            e.state = pat; e.st = 0.25;
            e.count = pat === 'barrage' ? (p2 ? 4 : 3) : 3;
          }
          break;
        case 'barrage':
          if (e.st <= 0) { radial(e, p2 ? 14 : 10, 100, e.t * 0.7 + e.count * 0.3, 0.7, '#fff6a8'); G.Audio.play('shoot'); e.count--; e.st = 0.6; if (e.count <= 0) toThink(e, p2 ? 0.7 : 1); }
          break;
        case 'aimed':
          keepRange(e, dt, 70, 130, 0.5);
          if (e.st <= 0) {
            const a = U.angTo(e, P);
            for (let i = -2; i <= 2; i++) shoot(e, a + i * 0.2, 150, 0.8, '#8fd8ff');
            G.Audio.play('shoot'); e.count--; e.st = 0.45;
            if (e.count <= 0) toThink(e, p2 ? 0.7 : 1);
          }
          break;
        case 'summon':
          if (minions() < 4) summon(e, 'papa', p2 ? 3 : 2);
          toThink(e, 0.8);
          break;
        case 'flash':
          slam(e, P.x, P.y, 46, 0.9, 1.2);
          if (p2) { slam(e, P.x + U.rand(-60, 60), P.y + U.rand(-50, 50), 40, 1.1, 1.2); slam(e, P.x + U.rand(-60, 60), P.y + U.rand(-50, 50), 40, 1.3, 1.2); }
          toThink(e, 1.2);
          break;
      }
    },

    colossus(e, dt) {
      const P = P_();
      const ph = e.hp > e.maxHp * 0.66 ? 1 : e.hp > e.maxHp * 0.33 ? 2 : 3;
      if (ph !== e.phase) {
        e.phase = ph;
        G.UI.toast(ph === 2 ? '負能量巨像：負面評論開始湧入……' : '負能量巨像：最終形態！撐住，Nova！', '#ff5ce1');
        G.Audio.play('boss'); G.run.shake = 0.6;
        radial(e, 16, 80, 0, 0.6, '#ff5ce1');
      }
      const seqs = {
        1: ['slam', 'radial', 'slam', 'walk'],
        2: ['slam', 'spiral', 'radial', 'summon', 'slam', 'walk'],
        3: ['slam3', 'spiral', 'radial', 'summon', 'slam3', 'spiral'],
      };
      e.st -= dt;
      switch (e.state) {
        case 'think':
          keepRange(e, dt, 50, 90, 0.6);
          if (e.st <= 0) {
            e.seq++;
            const pat = seqs[ph][e.seq % seqs[ph].length];
            e.state = pat;
            if (pat === 'radial') { e.count = ph === 3 ? 3 : 2; e.st = 0.2; }
            else if (pat === 'spiral') { e.count = 0; e.st = 2.6; e.spinA = U.angTo(e, P); }
            else if (pat === 'walk') e.st = 1.5;
            else e.st = 0;
          }
          break;
        case 'slam':
          slam(e, P.x, P.y, 40, 0.9, 1.3);
          toThink(e, [0, 0.8, 0.6, 0.45][ph]);
          break;
        case 'slam3':
          slam(e, P.x, P.y, 40, 0.9, 1.3);
          slam(e, P.x + U.rand(-50, 50), P.y + U.rand(-50, 50), 36, 1.05, 1.3);
          slam(e, P.x + U.rand(-50, 50), P.y + U.rand(-50, 50), 36, 1.2, 1.3);
          toThink(e, 0.45);
          break;
        case 'radial':
          if (e.st <= 0) { radial(e, [0, 12, 14, 18][ph], 90, e.t, 0.7, '#ff5ce1'); G.Audio.play('shoot'); e.count--; e.st = 0.55; if (e.count <= 0) toThink(e, [0, 0.8, 0.6, 0.45][ph]); }
          break;
        case 'spiral': {
          e.count -= dt;
          if (e.count <= 0) {
            e.count = 0.09;
            const arms = ph === 3 ? 3 : 2;
            for (let i = 0; i < arms; i++) shoot(e, e.spinA + (i * U.TAU) / arms, 105, 0.6, '#c58fff');
            e.spinA += 0.25;
          }
          if (e.st <= 0) toThink(e, 0.6);
          break;
        }
        case 'summon':
          if (minions() < 6) summon(e, 'bot', 3);
          toThink(e, 0.6);
          break;
        case 'walk':
          chaseStep(e, e.d.spd * 1.3, dt);
          if (e.st <= 0) toThink(e, 0.4);
          break;
      }
    },
  };

  function update(e, dt) {
    e.t += dt; e.flash -= dt; e.contactCd -= dt; e.cd -= dt;
    if (Math.abs(e.kbx) + Math.abs(e.kby) > 1) {
      mv(e, e.kbx * dt, e.kby * dt);
      const k = Math.pow(0.0005, dt);
      e.kbx *= k; e.kby *= k;
    } else { e.kbx = 0; e.kby = 0; }
    const P = G.P, d = U.dist(e, P);
    if (e.boss) {
      if (!e.active) { if (d < 210) { e.active = true; G.Game.bossStart(e); } else return; }
      BOSS[e.d.ai](e, dt);
    } else AI[e.d.ai](e, dt, d);
    if (d < e.r + P.r + 2 && e.contactCd <= 0) { G.Combat.hurtPlayer(e.atk, e.x, e.y); e.contactCd = 0.9; }
  }

  function separate() {
    const l = G.run.enemies;
    for (let i = 0; i < l.length; i++) {
      const a = l[i];
      if (a.dead) continue;
      for (let j = i + 1; j < l.length; j++) {
        const b = l[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= min) continue;
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        const wa = a.boss ? 0 : b.boss ? 2 : 1, wb = b.boss ? 0 : a.boss ? 2 : 1;
        mv(a, -nx * push * wa, -ny * push * wa);
        mv(b, nx * push * wb, ny * push * wb);
      }
    }
  }

  function updateProjs(dt) {
    const run = G.run, P = G.P;
    for (const p of run.projs) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (G.World.solidAt(run.map, p.x, p.y)) { p.life = 0; G.FX.burst(p.x, p.y, p.color, 4, 40, 0.25); continue; }
      if (Math.hypot(p.x - P.x, p.y - (P.y - 4)) < p.r + 5) { G.Combat.hurtPlayer(p.dmg, p.x, p.y); p.life = 0; }
    }
    run.projs = run.projs.filter((p) => p.life > 0);
  }

  function updateHazards(dt) {
    const run = G.run, P = G.P;
    for (const h of run.hazards) {
      if (h.type === 'ring') {
        h.r += h.spd * dt;
        if (!h.hit && Math.abs(Math.hypot(P.x - h.x, P.y - h.y) - h.r) < 6 && P.invuln <= 0) { h.hit = true; G.Combat.hurtPlayer(h.dmg, h.x, h.y); }
        if (h.r > h.max) h.gone = true;
      } else if (h.type === 'slam') {
        h.t += dt;
        if (!h.done && h.t >= h.tele) {
          h.done = true;
          if (Math.hypot(P.x - h.x, P.y - h.y) < h.r + P.r) G.Combat.hurtPlayer(h.dmg, h.x, h.y);
          run.shake = Math.max(run.shake, 0.3);
          G.FX.burst(h.x, h.y, '#ff4f6a', 18, 120, 0.5);
          G.Audio.play('boom');
        }
        if (h.t > h.tele + 0.25) h.gone = true;
      }
    }
    run.hazards = run.hazards.filter((h) => !h.gone);
  }

  // ---------- 繪製 ----------
  function render(ctx, e) {
    const sc = e.d.scale || 1, t = e.t;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(Math.round(e.x), Math.round(e.y) + 3 * sc, e.r * 0.9, e.r * 0.35, 0, 0, U.TAU); ctx.fill();
    if (e.tele && e.tele.type === 'line') {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.tele.ang);
      ctx.globalAlpha = 0.22 + Math.sin(t * 30) * 0.08; ctx.fillStyle = '#ff2850';
      ctx.fillRect(0, -e.tele.w / 2, e.tele.len, e.tele.w);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    let y = e.y;
    if (e.d.float) y += -2 + Math.sin(t * 5) * 1.5;
    if (e.type === 'slime' && e.state === 'hop') y -= 3;
    if (e.type === 'colossus') {
      const g = ctx.createRadialGradient(e.x, e.y - 12, 1, e.x, e.y - 12, 22 + Math.sin(t * 4) * 4);
      g.addColorStop(0, 'rgba(255,92,225,.55)'); g.addColorStop(1, 'rgba(255,92,225,0)');
      ctx.fillStyle = g; ctx.fillRect(e.x - 30, e.y - 42, 60, 60);
    }
    let shakeX = 0;
    if (e.state === 'wind' || e.state === 'chargeWind') shakeX = Math.sin(t * 60);
    G.Sprites.draw(ctx, e.type, e.x + shakeX, y, { scale: sc, flip: e.lr < 0, white: e.flash > 0 });
    if (e.type === 'metronome') {
      const a = Math.sin(t * (e.phase === 2 ? 9 : 5)) * 0.6;
      const px = e.x, py = e.y - 2;
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.sin(a) * 26, py - Math.cos(a) * 26); ctx.stroke();
      ctx.fillStyle = '#d0d0d8'; ctx.fillRect(Math.round(px + Math.sin(a) * 17) - 3, Math.round(py - Math.cos(a) * 17) - 2, 6, 4);
    }
    if (e.state === 'wind') {
      ctx.font = '8px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff3355';
      ctx.fillText('!', Math.round(e.x), Math.round(e.y) - 16 * sc);
    }
    if (!e.boss && e.hp < e.maxHp) {
      const w = 14, x = Math.round(e.x - w / 2), yy = Math.round(e.y) - 15 * sc;
      ctx.fillStyle = '#1a1218'; ctx.fillRect(x - 1, yy - 1, w + 2, 4);
      ctx.fillStyle = '#E1002B'; ctx.fillRect(x, yy, Math.max(0, Math.round((w * e.hp) / e.maxHp)), 2);
    }
  }

  function renderProjs(ctx) {
    for (const p of G.run.projs) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 2.5, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
    }
  }

  function renderHazards(ctx) {
    for (const h of G.run.hazards) {
      if (h.type === 'ring') {
        ctx.globalAlpha = 0.85; ctx.strokeStyle = h.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.stroke();
        ctx.globalAlpha = 0.25; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.stroke();
      } else {
        const p = Math.min(1, h.t / h.tele);
        if (!h.done) {
          ctx.globalAlpha = 0.18; ctx.fillStyle = '#ff2850';
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * p, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ff2850'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.stroke();
        } else {
          ctx.globalAlpha = Math.max(0, 1 - (h.t - h.tele) / 0.25) * 0.7; ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, U.TAU); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  G.Enemies = { create, update, render, separate, updateProjs, updateHazards, renderProjs, renderHazards };
})();
