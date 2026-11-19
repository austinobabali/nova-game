'use strict';
// ============================================================
//  主程式：畫面縮放、全螢幕、場景切換、主迴圈、世界繪製
// ============================================================
(function () {
  const U = G.U, D = G.DATA, TS = G.TS;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('wrap');
  const rotate = document.getElementById('rotate');

  // ---------- 縮放：高固定 270，寬依螢幕比例（手機橫向填滿無黑邊） ----------
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    G.portraitBlocked = G.isTouch && vh > vw;
    rotate.classList.toggle('show', G.portraitBlocked);
    const aspect = vw / vh;
    G.H = 270;
    G.W = Math.round(U.clamp(270 * aspect, 400, 640));
    let s = Math.min(vw / G.W, vh / G.H);
    if (!G.isTouch && s >= 2) s = Math.floor(s * 2) / 2;
    const cw = Math.round(G.W * s), ch = Math.round(G.H * s);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
    G.scale = (cw * dpr) / G.W;
    if (G.use3D) G.R3D.resize(cw, ch, dpr);
    document.documentElement.style.setProperty('--u', s + 'px');
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.addEventListener('fullscreenchange', () => { setTimeout(resize, 100); G.UI.open && G.UI.refresh(); });

  // ---------- 全螢幕 ----------
  const docEl = document.documentElement;
  G.canFullscreen = () => !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen) && !(document.fullscreenElement || document.webkitFullscreenElement);
  G.enterFullscreen = () => {
    try {
      const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
      const p = req.call(docEl, { navigationUI: 'hide' });
      const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } };
      if (p && p.then) p.then(lock).catch(() => {}); else lock();
    } catch (e) { /* ignore */ }
  };

  // ---------- 場景 ----------
  function newRun(map, mode, zone) {
    return {
      map, mode, zone, enemies: [], projs: [], hazards: [], pickups: [], fx: [], pprojs: [], skq: [],
      cam: { x: map.spawn.x, y: map.spawn.y }, shake: 0, hitstop: 0, flash: 0, flashColor: '#fff',
      spawnT: 3, boss: null, banner: null, time: 0, victoryT: 0, over: false, interact: null,
    };
  }

  function spawnOne(minDist) {
    const run = G.run, z = run.zone, P = G.P;
    const type = U.pick(z.enemies), d = D.enemies[type];
    for (let tries = 0; tries < 25; tries++) {
      const c = U.pick(run.map.floor);
      if (Math.hypot(c.x - P.x, c.y - P.y) < minDist) continue;
      const n = d.group || 1;
      for (let k = 0; k < n; k++) {
        const e = G.Enemies.create(type, c.x + U.rand(-8, 8), c.y + U.rand(-8, 8));
        if (G.World.boxHits(run.map, e.x, e.y, e.r)) { e.x = c.x; e.y = c.y; }
        run.enemies.push(e);
      }
      return;
    }
  }

  const Game = (G.Game = {
    scene: 'title', titleT: 0,

    toTitle() { this.scene = 'title'; G.run = null; G.UI.show('title'); G.Audio.music('hub'); },
    newGame() {
      G.S = G.newState();
      G.S.hero = D.heroOrder[G.heroIdx];
      G.applyHeroSkills(G.S.hero);
      G.Player.init();
      this.enterHub();
      G.UI.close();
      if (G.isTouch) G.enterFullscreen();
      setTimeout(() => G.UI.toast('歡迎來到 STARLIGHT 經紀公司！走進右側傳送門開始特訓吧', '#ffd84f'), 600);
    },
    continueGame() {
      const s = G.Save.load();
      if (!s) { this.newGame(); return; }
      G.S = s;
      G.S.hero = D.heroOrder[G.heroIdx];
      G.applyHeroSkills(G.S.hero);
      G.Player.init();
      this.enterHub();
      G.UI.close();
      if (G.isTouch) G.enterFullscreen();
    },
    enterHub() {
      this.scene = 'play';
      G.run = newRun(G.World.buildHub(), 'hub', null);
      G.Player.resetAt(G.run.map.spawn.x, G.run.map.spawn.y);
      G.Player.fullHeal();
      G.Save.save();
      G.Audio.music('hub');
      G.run.banner = { text: '經紀公司大廳', sub: 'STARLIGHT ENT.', t: 2.6 };
    },
    enterZone(id) {
      const z = D.zones[id];
      G.run = newRun(G.World.buildZone(z), 'zone', z);
      const run = G.run, m = run.map;
      G.Player.resetAt(m.spawn.x, m.spawn.y);
      for (let i = 0; i < z.count; i++) spawnOne(170);
      run.enemies.push(G.Enemies.create(z.boss, m.bossSpawn.x, m.bossSpawn.y));
      G.Audio.music(z.music);
      G.Audio.play('portal');
      run.banner = { text: z.name, sub: z.lv, t: 2.6 };
    },
    bossStart(e) {
      const run = G.run;
      run.boss = e;
      G.Audio.music('boss');
      G.Audio.play('boss');
      run.banner = { text: e.d.name, sub: 'BOSS BATTLE', t: 2.2, boss: true };
    },
    bossDefeated(e) {
      const run = G.run, z = run.zone, S = G.S;
      run.boss = null;
      run.hazards.length = 0; run.projs.length = 0;
      for (const m of run.enemies) if (m.minion && !m.dead) { m.dead = true; G.FX.burst(m.x, m.y - 6, '#fff', 8, 60); }
      const first = !S.defeated.includes(z.id);
      if (first) S.defeated.push(z.id);
      S.unlocked = Math.max(S.unlocked, Math.min(3, z.id + 1));
      G.Pickups.item(e.x, e.y, G.Combat.rollDrop(z.tier, z.id === 3 ? 'legendary' : 'rare'));
      if (Math.random() < 0.5) G.Pickups.item(e.x, e.y, G.Combat.rollDrop(z.tier, 'rare'));
      G.Pickups.potion(e.x, e.y, 'hp'); G.Pickups.potion(e.x, e.y, 'mp');
      run.map.portals.push({ toHub: true, x: e.x, y: e.y });
      run.flash = 0.8; run.flashColor = '#ffffff'; run.shake = 0.7;
      G.Audio.music(z.music);
      G.Audio.play('victory');
      let msg = `擊敗 ${e.d.name}！`;
      if (first && z.id < 3) msg += `已解鎖新區域：${D.zones[z.id + 1].name}`;
      G.UI.toast(msg, '#ffd84f');
      run.banner = { text: 'STAGE CLEAR', sub: e.d.name + ' 已被淨化', t: 2.6 };
      if (z.id === 3 && !S.cleared) { S.cleared = true; run.victoryT = 3; }
      G.Save.save();
    },
    playerDied() {
      const run = G.run;
      if (run.over) return;
      run.over = true;
      G.Audio.music(null);
      G.Audio.play('die');
      G.FX.burst(G.P.x, G.P.y - 6, '#ff8fd0', 30, 100, 1);
      setTimeout(() => G.UI.show('dead'), 900);
    },
    respawn() {
      G.S.gold -= Math.floor(G.S.gold * 0.1);
      G.UI.close();
      this.enterHub();
    },

    interact(it) {
      const S = G.S;
      if (it.kind === 'npc') {
        if (it.ref.id === 'shop') G.UI.show('shop');
        else if (it.ref.id === 'trainer') G.UI.show('char');
        else { G.Player.fullHeal(); G.UI.toast(G.Save.save() ? '經紀人 Kim：進度已存檔，HP/MP 回滿了！' : '存檔失敗（瀏覽器不允許本機儲存）', '#7dff9a'); G.Audio.play('heal'); }
        return;
      }
      const p = it.ref;
      if (p.toHub) { G.Audio.play('portal'); this.enterHub(); return; }
      if (p.zone <= S.unlocked) this.enterZone(p.zone);
      else { G.UI.toast(`需要先擊敗「${D.zones[p.zone - 1].name}」的 Boss`, '#ff8fa0'); G.Audio.play('err'); }
    },

    update(dt) {
      const I = G.Input;
      if (I.pressed('KeyM')) G.UI.toast(G.Audio.toggle() ? '音效：關' : '音效：開');
      if (this.scene === 'title') { this.titleT += dt; return; }
      const run = G.run;
      if (!run) return;
      if (G.UI.open) { G.UI.handleKeys(); return; }
      if (G.portraitBlocked) return;
      if (run.over) { G.FX.update(dt); return; }
      if (I.pressed('Escape') || I.pressed('KeyP')) { G.UI.show('pause'); return; }
      if (I.pressed('Tab') || I.pressed('KeyB')) { G.UI.show('inv'); return; }
      if (I.pressed('KeyC')) { G.UI.show('char'); return; }
      if (run.hitstop > 0) { run.hitstop -= dt; return; }

      run.time += dt;
      G.Player.update(dt);
      G.Skills.update(dt);
      for (const e of run.enemies) if (!e.dead) G.Enemies.update(e, dt);
      G.Enemies.separate();
      run.enemies = run.enemies.filter((e) => !e.dead);
      G.Enemies.updateProjs(dt);
      G.Enemies.updateHazards(dt);
      G.Pickups.update(dt);
      G.FX.update(dt);
      if (G.run !== run) return; // 被傳送

      if (run.mode === 'zone') {
        run.spawnT -= dt;
        if (run.spawnT <= 0) {
          run.spawnT = 2.5;
          const alive = run.enemies.filter((e) => !e.boss && !e.minion).length;
          if (alive < run.zone.count) spawnOne(Math.max(G.W, G.H) * 0.6);
        }
      }

      // 互動
      const P = G.P, m = run.map;
      let best = null, bd = 26;
      for (const n of m.npcs) {
        const d = U.dist(P, n);
        if (d < bd) { bd = d; best = { kind: 'npc', ref: n, x: n.x, y: n.y - 22, label: { shop: '商店', trainer: '加點・技能', manager: '存檔・回復' }[n.id], short: { shop: '商店', trainer: '加點', manager: '存檔' }[n.id] }; }
      }
      for (const p of m.portals) {
        const d = U.dist(P, p);
        if (d < bd) {
          bd = d;
          const label = p.toHub ? '回經紀公司' : p.zone <= G.S.unlocked ? `前往 ${D.zones[p.zone].name}` : '未解鎖';
          best = { kind: 'portal', ref: p, x: p.x, y: p.y - 26, label, short: p.toHub ? '回城' : '進入' };
        }
      }
      run.interact = best;
      if (best && I.pressed('KeyE')) { this.interact(best); return; }

      // 鏡頭
      const W = G.W, H = G.H, mw = m.cols * TS, mh = m.rows * TS;
      const k = Math.min(1, dt * 8);
      run.cam.x += (P.x - run.cam.x) * k;
      run.cam.y += (P.y - run.cam.y) * k;
      run.cam.x = mw <= W ? mw / 2 : U.clamp(run.cam.x, W / 2, mw - W / 2);
      run.cam.y = mh <= H ? mh / 2 : U.clamp(run.cam.y, H / 2, mh - H / 2);

      run.shake = Math.max(0, run.shake - dt);
      run.flash = Math.max(0, run.flash - dt * 1.5);
      if (run.banner) run.banner.t -= dt;
      if (run.victoryT > 0) { run.victoryT -= dt; if (run.victoryT <= 0) G.UI.show('victory'); }
    },

    render() {
      if (G.use3D) { render3D(); return; }
      const W = G.W, H = G.H;
      ctx.setTransform(G.scale, 0, 0, G.scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (this.scene === 'title' || !G.run) { renderTitle(); return; }
      const run = G.run, P = G.P;
      let sx = 0, sy = 0;
      if (run.shake > 0) { sx = U.rand(-1, 1) * run.shake * 6; sy = U.rand(-1, 1) * run.shake * 6; }
      const ox = Math.round(run.cam.x - W / 2 + sx), oy = Math.round(run.cam.y - H / 2 + sy);
      ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(-ox, -oy);
      ctx.drawImage(run.map.canvas, 0, 0);
      for (const p of run.map.portals) drawPortal(p, run.time);
      G.Enemies.renderHazards(ctx);
      G.Pickups.render(ctx);
      const list = [{ y: P.y, f: () => G.Player.render(ctx) }];
      for (const e of run.enemies) list.push({ y: e.y, f: () => G.Enemies.render(ctx, e) });
      for (const n of run.map.npcs) list.push({ y: n.y, f: () => drawNpc(n, run.time) });
      list.sort((a, b) => a.y - b.y).forEach((o) => o.f());
      G.Enemies.renderProjs(ctx);
      G.Skills.render2D(ctx);
      G.FX.render(ctx);
      if (run.interact && !run.over) {
        const it = run.interact, bob = Math.round(Math.sin(run.time * 6));
        const s = G.isTouch ? it.label : '[E] ' + it.label;
        G.UI.txt(ctx, s, Math.round(it.x), Math.round(it.y) + bob, { align: 'center', font: G.UI.TC(8), color: '#ffd84f' });
      }
      ctx.restore();
      G.UI.renderHUD(ctx);
    },
  });

  function drawNpc(n, t) {
    const bob = Math.round(Math.sin(t * 2 + n.x) * 0.6);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 3, 6, 2.5, 0, 0, U.TAU); ctx.fill();
    G.Sprites.draw(ctx, n.sprite + '_a', n.x, n.y + bob, { flip: n.x > G.P.x });
    G.UI.txt(ctx, n.name, n.x, n.y - 21, { align: 'center', font: G.UI.TC(7), color: '#fff', lw: 2 });
    if (n.id === 'trainer' && G.S.attrPts + G.S.skillPts > 0) G.UI.txt(ctx, '!', n.x + 8, n.y - 30 + Math.round(Math.sin(t * 6) * 2), { align: 'center', font: G.UI.PX(8), color: '#7dff9a' });
  }

  function drawPortal(p, t) {
    const locked = !p.toHub && p.zone > G.S.unlocked;
    const col = locked ? '#777' : p.toHub ? '#5ce1ff' : D.zones[p.zone].color;
    ctx.save(); ctx.translate(p.x, p.y);
    if (!locked) {
      const g = ctx.createLinearGradient(0, -34, 0, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, col);
      ctx.globalAlpha = 0.3; ctx.fillStyle = g; ctx.fillRect(-9, -34, 18, 34);
    }
    ctx.globalAlpha = 0.35; ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 6.5, 0, 0, U.TAU); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const rx = 3 + ((t * (locked ? 2 : 12) + i * 4) % 11);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, rx / 2, 0, 0, U.TAU); ctx.stroke();
    }
    if (!locked) for (let i = 0; i < 3; i++) {
      const y = -((t * 20 + i * 11) % 30), x = Math.sin(t * 3 + i * 2) * 6;
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 1 + y / 30; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    if (!p.toHub) {
      const z = D.zones[p.zone];
      const done = G.S.defeated.includes(p.zone) ? ' ★' : '';
      G.UI.txt(ctx, z.name + done, p.x, p.y + 9, { align: 'center', font: G.UI.TC(7), color: locked ? '#aaa' : col, lw: 2 });
      G.UI.txt(ctx, locked ? '未解鎖' : z.lv, p.x, p.y + 19, { align: 'center', font: G.UI.TC(6, 500), color: '#ddd', lw: 2 });
    }
  }

  // ---------- 標題畫面背景 ----------
  function renderTitle() {
    const W = G.W, H = G.H, t = Game.titleT;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#12081e'); g.addColorStop(1, '#2B2320');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 聚光燈
    const cols = ['rgba(255,111,181,', 'rgba(92,225,255,', 'rgba(255,216,79,'];
    for (let i = 0; i < 3; i++) {
      const bx = W * (0.2 + i * 0.3), a = Math.sin(t * 0.8 + i * 2) * 0.5;
      ctx.save(); ctx.translate(bx, -10); ctx.rotate(a);
      const lg = ctx.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, cols[i] + '.45)'); lg.addColorStop(1, cols[i] + '0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(60, H + 40); ctx.lineTo(-60, H + 40); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 舞台
    ctx.fillStyle = '#1c1230'; ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = '#E1002B'; ctx.fillRect(0, H - 40, W, 2);
    for (let x = 0; x < W; x += 16) { ctx.fillStyle = '#2a1c48'; ctx.fillRect(x, H - 38, 1, 38); }
    // 星星
    for (let i = 0; i < 40; i++) {
      const x = (i * 97.3) % W, y = (i * 53.7) % (H - 60), tw = Math.sin(t * 3 + i) > 0.6;
      ctx.fillStyle = tw ? '#fff' : 'rgba(255,255,255,.35)'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    // 角色
    const bob = Math.round(Math.abs(Math.sin(t * 4)) * -4);
    G.Sprites.draw(ctx, Math.floor(t * 4) % 2 ? 'nova_b' : 'nova_a', W / 2, H - 40 + bob, { scale: 3 });
    G.Sprites.draw(ctx, 'note', W / 2 - 110, H - 46 + Math.sin(t * 3) * 4, { scale: 2 });
    G.Sprites.draw(ctx, 'bot', W / 2 + 110, H - 48 + Math.sin(t * 3 + 1) * 4, { scale: 2, flip: true });
  }

  // ---------- 主迴圈 ----------
  let last = performance.now(), acc = 0;
  const STEP = 1 / 60;
  let lastVW = 0, lastVH = 0;
  function frame(now) {
    if (window.innerWidth !== lastVW || window.innerHeight !== lastVH) { lastVW = window.innerWidth; lastVH = window.innerHeight; resize(); }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) {
      try { Game.update(STEP); } catch (e) { console.error(e); }
      G.Input.consume();
      acc -= STEP; n++;
    }
    if (n >= 6) acc = 0;
    try { Game.render(); } catch (e) { console.error(e); }
    G.Touch.update();
    requestAnimationFrame(frame);
  }

  // ---------- 3D 覆蓋層：名稱、血條、傷害數字（投影到 HUD 畫布） ----------
  function render3D() {
    G.R3D.render();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(G.scale, 0, 0, G.scale, 0, 0);
    if (Game.scene === 'title' || !G.run) return;
    const run = G.run, R = G.R3D, t = run.time, UI = G.UI;
    for (const n of run.map.npcs) {
      const p = R.project(n.x, n.y, 2.0);
      if (!p) continue;
      UI.txt(ctx, n.name, p.x, p.y, { align: 'center', font: UI.TC(7), lw: 2 });
      if (n.id === 'trainer' && G.S.attrPts + G.S.skillPts > 0) UI.txt(ctx, '!', p.x + 14, p.y - 8 + Math.sin(t * 6) * 2, { align: 'center', font: UI.PX(8), color: '#7dff9a' });
    }
    for (const pt of run.map.portals) {
      if (pt.toHub) continue;
      const z = D.zones[pt.zone], locked = pt.zone > G.S.unlocked, p = R.project(pt.x, pt.y + 12, 0);
      if (!p) continue;
      UI.txt(ctx, z.name + (G.S.defeated.includes(pt.zone) ? ' ★' : ''), p.x, p.y, { align: 'center', font: UI.TC(7), color: locked ? '#aaa' : z.color, lw: 2 });
      UI.txt(ctx, locked ? '未解鎖' : z.lv, p.x, p.y + 10, { align: 'center', font: UI.TC(6, 500), color: '#ddd', lw: 2 });
    }
    for (const e of run.enemies) {
      if (e.dead) continue;
      const hh = e.boss ? 4.6 : 1.8;
      if (!e.boss && e.hp < e.maxHp) {
        const p = R.project(e.x, e.y, hh);
        if (p) { ctx.fillStyle = '#1a1218'; ctx.fillRect(p.x - 9, p.y - 1, 18, 4); ctx.fillStyle = '#E1002B'; ctx.fillRect(p.x - 8, p.y, Math.max(0, 16 * e.hp / e.maxHp), 2); }
      }
      if (e.state === 'wind') { const p = R.project(e.x, e.y, hh + 0.5); if (p) UI.txt(ctx, '!', p.x, p.y, { align: 'center', font: UI.PX(9), color: '#ff3355' }); }
    }
    for (const f of run.fx) {
      if (f.type === 'p') {
        const p = R.project(f.x, f.y, 0.7);
        if (p) { ctx.globalAlpha = 1 - f.t / f.life; ctx.fillStyle = f.color; ctx.fillRect(p.x, p.y, f.size + 0.5, f.size + 0.5); }
      } else if (f.type === 'text') {
        const p = R.project(f.x, f.y, 1.6);
        if (p) { const a = f.t / f.life; ctx.globalAlpha = a > 0.7 ? (1 - a) / 0.3 : 1; UI.txt(ctx, f.txt, p.x, p.y, { align: 'center', base: 'middle', font: UI.PX(f.big ? 10 : 8), color: f.color }); }
      }
    }
    ctx.globalAlpha = 1;
    if (run.interact && !run.over) {
      const it = run.interact, p = R.project(it.ref.x, it.ref.y, 2.7);
      if (p) UI.txt(ctx, (G.isTouch ? '' : '[E] ') + it.label, p.x, p.y + Math.sin(t * 6), { align: 'center', font: UI.TC(8), color: '#ffd84f' });
    }
    UI.renderHUD(ctx);
  }

  // ---------- 啟動：等 3D 引擎載入，失敗則用像素版 ----------
  G.heroIdx = (() => { const s = G.Save.load(); const i = D.heroOrder.indexOf(s && s.hero); return i >= 0 ? i : 1; })();
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    const gl = document.getElementById('gl');
    if (!/[?&]2d=1/.test(location.search) && window.THREE && window.THREE_ADDONS) {
      try { G.R3D.init(gl); G.use3D = true; } catch (e) { console.error(e); G.use3D = false; }
    }
    gl.style.display = G.use3D ? 'block' : 'none';
    resize();
    Game.toTitle();
    requestAnimationFrame(frame);
  }
  if (window.THREE_ADDONS) boot();
  else { window.addEventListener('three-ready', boot); setTimeout(boot, 8000); }
})();
