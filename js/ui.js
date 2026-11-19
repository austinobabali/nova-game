'use strict';
// ============================================================
//  UI：Canvas HUD + DOM 選單（標題、暫停、背包、角色/技能、商店…）
// ============================================================
(function () {
  const U = G.U, D = G.DATA;
  const root = document.getElementById('ui');
  const toastBox = document.getElementById('toasts');
  const esc = U.esc;
  let shopTab = 'buy';
  let prev = null;

  const PX = (n) => `${n}px "Press Start 2P", "Noto Sans TC", monospace`;
  const TC = (n, w) => `${w || 700} ${n}px "Noto Sans TC", sans-serif`;

  function txt(ctx, s, x, y, o) {
    o = o || {};
    ctx.font = o.font || PX(8);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'top';
    if (o.stroke !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = o.lw || 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(s, x, y);
  }
  function bar(ctx, x, y, w, h, v, max, c1, c2) {
    ctx.fillStyle = '#120a10'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#3a2a30'; ctx.fillRect(x, y, w, h);
    const fw = Math.round(w * U.clamp(v / max, 0, 1));
    ctx.fillStyle = c1; ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = c2; ctx.fillRect(x, y, fw, Math.ceil(h / 2));
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function skillIcon(ctx, name, x, y, dim) {
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = dim ? 0.35 : 1; ctx.lineWidth = 1.5;
    if (name === 'wave') { ctx.strokeStyle = '#5ce1ff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-4, 0, 3 + i * 3, -0.7, 0.7); ctx.stroke(); } }
    else if (name === 'spin') { ctx.strokeStyle = '#ff8fd0'; ctx.beginPath(); ctx.arc(0, 0, 6, 0.3, 5.5); ctx.stroke(); ctx.fillStyle = '#ff8fd0'; ctx.fillRect(4, -4, 3, 3); }
    else if (name === 'dash') { ctx.strokeStyle = '#ffd84f'; ctx.lineWidth = 2; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-5 + i * 5, -5); ctx.lineTo(0 + i * 5, 0); ctx.lineTo(-5 + i * 5, 5); ctx.stroke(); } }
    else if (name === 'encore') {
      ctx.fillStyle = '#ffd84f'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    } else if (name === 'dodge') { ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(5, 3); ctx.moveTo(-4, -1); ctx.lineTo(6, -1); ctx.moveTo(-2, -5); ctx.lineTo(4, -5); ctx.stroke(); }
    ctx.restore();
  }

  // ======================= HUD =======================
  function renderHUD(ctx) {
    const run = G.run, P = G.P, S = G.S, st = P.st, W = G.W, H = G.H;
    const touch = G.isTouch;
    // 低血量
    if (P.hp < st.maxHp * 0.25) {
      const a = 0.25 + Math.sin(run.time * 6) * 0.12;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
      g.addColorStop(0, 'rgba(225,0,43,0)'); g.addColorStop(1, `rgba(225,0,43,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // 左上狀態
    ctx.fillStyle = 'rgba(20,12,18,.72)'; rrect(ctx, 4, 4, 128, 54, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(225,0,43,.7)'; ctx.lineWidth = 1; rrect(ctx, 4.5, 4.5, 127, 53, 5); ctx.stroke();
    txt(ctx, 'LV' + S.level, 9, 9, { color: '#ff8fd0', font: PX(8) });
    txt(ctx, 'NOVA', 127, 9, { align: 'right', color: '#fff', font: PX(8) });
    bar(ctx, 9, 20, 118, 8, P.hp, st.maxHp, '#E1002B', '#ff5c7a');
    txt(ctx, `${Math.ceil(P.hp)}/${st.maxHp}`, 68, 21, { align: 'center', font: PX(6), lw: 2 });
    bar(ctx, 9, 31, 118, 6, P.mp, st.maxMp, '#2f6fd6', '#5ca0ff');
    txt(ctx, `${Math.floor(P.mp)}/${st.maxMp}`, 68, 31, { align: 'center', font: PX(5), lw: 2 });
    const need = D.expFor(S.level);
    bar(ctx, 9, 40, 118, 3, S.level >= D.maxLevel ? 1 : S.exp, S.level >= D.maxLevel ? 1 : need, '#f2c14e', '#ffe08a');
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(13, 51, 3, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(13, 51, 2.2, 0, U.TAU); ctx.fill();
    txt(ctx, String(S.gold), 19, 47, { color: '#ffd84f', font: PX(7) });
    if (S.attrPts + S.skillPts > 0) txt(ctx, '可加點!', 127, 47, { align: 'right', color: '#7dff9a', font: TC(8) });

    // 技能列（桌機）
    if (!touch) {
      const slots = [
        { key: 'SPC', icon: 'dodge', cd: Math.max(0, P.dash.cd), max: 0.75 },
        ...D.skillOrder.map((k) => ({ key: D.skills[k].key, icon: k, cd: P.cd[k], max: P.cdMax[k], locked: !S.skills[k], lockLv: D.skills[k].unlock, mp: D.skills[k].mp })),
        { key: 'Q', pot: 'hp', n: S.potions.hp },
        { key: 'R', pot: 'mp', n: S.potions.mp },
      ];
      const sz = 22, gap = 3, total = slots.length * sz + (slots.length - 1) * gap + 6;
      let x = Math.round((W - total) / 2);
      const y = H - sz - 6;
      slots.forEach((s, i) => {
        if (i === 5) x += 6;
        ctx.fillStyle = 'rgba(20,12,18,.8)'; rrect(ctx, x, y, sz, sz, 3); ctx.fill();
        const ready = !s.pot && !s.locked && s.cd <= 0 && (!s.mp || P.mp >= s.mp);
        ctx.strokeStyle = ready ? '#E1002B' : '#5a4a50'; ctx.lineWidth = 1; rrect(ctx, x + 0.5, y + 0.5, sz - 1, sz - 1, 3); ctx.stroke();
        if (s.pot) ctx.drawImage(G.Sprites.icon(s.pot).canvas, x + 6, y + 6);
        else skillIcon(ctx, s.icon, x + sz / 2, y + sz / 2, s.locked || (s.mp && P.mp < s.mp));
        if (!s.pot && s.cd > 0) {
          const h = Math.round(sz * (s.cd / (s.max || 1)));
          ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x + 1, y + sz - h, sz - 2, h);
          txt(ctx, s.cd >= 1 ? String(Math.ceil(s.cd)) : s.cd.toFixed(1), x + sz / 2, y + 8, { align: 'center', font: PX(6), lw: 2 });
        }
        if (s.locked) txt(ctx, 'Lv' + s.lockLv, x + sz / 2, y + 14, { align: 'center', font: PX(5), color: '#aaa', lw: 2 });
        if (s.pot) txt(ctx, String(s.n), x + sz - 2, y + sz - 7, { align: 'right', font: PX(6), lw: 2 });
        txt(ctx, s.key, x + 2, y + 1, { font: PX(5), color: '#ffd1e6', lw: 2 });
        x += sz + gap;
      });
      if (run.mode === 'hub') txt(ctx, 'WASD移動  J攻擊  K/L/U/I技能  Space閃避  E互動  Tab背包  C角色  Esc選單  M音效', W / 2, H - 38, { align: 'center', font: TC(7, 500), color: '#f5f2f1', lw: 2 });
    }

    // 小地圖
    if (run.mode === 'zone') {
      const m = run.map, mx = W - m.cols - 6, my = touch ? 36 : 6;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(mx - 2, my - 2, m.cols + 4, m.rows + 4);
      ctx.globalAlpha = 0.85; ctx.drawImage(m.mini, mx, my); ctx.globalAlpha = 1;
      for (const p of m.portals) { ctx.fillStyle = '#5ce1ff'; ctx.fillRect(mx + Math.floor(p.x / 16) - 1, my + Math.floor(p.y / 16) - 1, 3, 3); }
      for (const e of run.enemies) if (e.boss && !e.dead) { ctx.fillStyle = '#ff2f4f'; ctx.fillRect(mx + Math.floor(e.x / 16) - 1, my + Math.floor(e.y / 16) - 1, 3, 3); }
      if (Math.floor(run.time * 4) % 2) { ctx.fillStyle = '#fff'; ctx.fillRect(mx + Math.floor(P.x / 16) - 1, my + Math.floor(P.y / 16) - 1, 2, 2); }
      txt(ctx, run.zone.name, mx + m.cols / 2, my + m.rows + 4, { align: 'center', font: TC(7), color: run.zone.color, lw: 2 });
    }

    // Boss 血條
    const b = run.boss;
    if (b && !b.dead) {
      const w = Math.min(240, W - 200), x = Math.round((W - w) / 2), y = 18;
      txt(ctx, b.d.name, W / 2, 5, { align: 'center', font: TC(9, 900), color: '#ff8fd0' });
      bar(ctx, x, y, w, 7, b.hp, b.maxHp, '#a0105a', '#ff4fa3');
      if (b.phase > 1) txt(ctx, 'PHASE ' + b.phase, x + w, y + 10, { align: 'right', font: PX(5), color: '#ffd84f', lw: 2 });
    }

    // 區域名稱橫幅
    if (run.banner && run.banner.t > 0) {
      const bn = run.banner, a = Math.min(1, bn.t / 0.5, (2.6 - bn.t) / 0.3 + 0.2);
      ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.fillStyle = 'rgba(20,12,18,.6)'; ctx.fillRect(0, 70, W, 40);
      ctx.fillStyle = bn.boss ? '#ff2f4f' : '#E1002B'; ctx.fillRect(0, 70, W, 1); ctx.fillRect(0, 109, W, 1);
      txt(ctx, bn.text, W / 2, 76, { align: 'center', font: TC(16, 900), color: bn.boss ? '#ff8fd0' : '#fff' });
      txt(ctx, bn.sub || '', W / 2, 97, { align: 'center', font: PX(6), color: '#ffd84f', lw: 2 });
      ctx.globalAlpha = 1;
    }

    // 畫面閃光
    if (run.flash > 0) { ctx.globalAlpha = Math.min(0.85, run.flash); ctx.fillStyle = run.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  // ======================= DOM 選單 =======================
  function coin(n) { return `<span class="gold"><i class="coin"></i>${n}</span>`; }
  function itemCard(it, extra, action, val) {
    const eq = G.S.equip[it.slot] && D.items[G.S.equip[it.slot]];
    let diff = '';
    if (eq && eq.id !== it.id) {
      const parts = [];
      for (const k of ['atk', 'def', 'hp']) {
        const dv = (it.stats[k] || 0) - (eq.stats[k] || 0);
        if (dv) parts.push(`<span class="${dv > 0 ? 'up' : 'down'}">${{ atk: '攻', def: '防', hp: 'HP' }[k]}${dv > 0 ? '+' : ''}${dv}</span>`);
      }
      diff = parts.join(' ');
    }
    return `<div class="item r-${it.rarity}" ${action ? `data-a="${action}" data-v="${val}"` : ''}>
      <img src="${G.Sprites.icon(it.slot).url}" alt="">
      <div class="info"><b>${esc(it.name)}</b><small>${D.slotName[it.slot]}・${D.rarityName[it.rarity]}</small>
      <small class="stats">${U.statText(it.stats)}</small>${diff ? `<small class="diff">${diff}</small>` : ''}</div>${extra || ''}</div>`;
  }
  function statsBlock() {
    const st = G.P.st;
    const rows = [['HP', st.maxHp], ['MP', st.maxMp], ['攻擊', st.atk], ['防禦', Math.round(st.def * 10) / 10], ['爆擊率', Math.round(st.crit * 100) + '%'], ['爆擊傷害', Math.round(st.critDmg * 100) + '%'], ['移速', st.spd], ['冷卻縮減', Math.round(st.cdr * 100) + '%']];
    return `<div class="stats-grid">${rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('')}</div>`;
  }
  const head = (title, closable) => `<div class="phead"><span class="ptitle">${title}</span>${coin(G.S ? G.S.gold : 0)}${closable ? '<button class="x" data-a="close">✕</button>' : ''}</div>`;

  const PANELS = {
    title() {
      const has = G.Save.has();
      const H = D.heroes[D.heroOrder[G.heroIdx]];
      return `<div class="title-screen">
        <div class="top"><div class="logo">NOVA</div><div class="logo-sub">星光逆襲</div></div>
        <div class="bottom-area">
        <div class="hero-pick"><button class="arrow" data-a="heroPrev">‹</button>
          <div class="hp-info"><b>${H.name}</b><small>${H.role}</small></div>
          <button class="arrow" data-a="heroNext">›</button></div>
        <div class="menu">
          ${has ? '<button class="btn" data-a="continue">繼續遊戲</button>' : ''}
          <button class="btn ${has ? 'ghost' : ''}" data-a="new">新遊戲</button>
          <button class="btn ghost" data-a="help">操作說明</button>
          ${G.canFullscreen() ? '<button class="btn ghost" data-a="fullscreen">全螢幕</button>' : ''}
        </div>
        <div class="foot">原創作品・所有角色、團體與地點皆為虛構</div></div></div>`;
    },
    confirmNew() {
      return `<div class="panel small"><div class="ptitle">開始新遊戲？</div><p>現有存檔將被覆蓋。</p>
        <div class="row"><button class="btn" data-a="newConfirm">確定</button><button class="btn ghost" data-a="back">取消</button></div></div>`;
    },
    help() {
      const rows = G.isTouch
        ? [['左側搖桿', '移動'], ['攻擊', '應援棒 3 段連擊'], ['K / L / U / I', '技能（右側小圓鈕）'], ['閃避', '短距離無敵衝刺'], ['E', '與 NPC / 傳送門互動'], ['HP / MP', '使用飲料'], ['右上角', '背包・角色・暫停']]
        : [['WASD / 方向鍵', '移動'], ['J', '應援棒攻擊（3 段連擊）'], ['K / L / U / I', '技能（需先學習）'], ['Space', '閃避衝刺（短暫無敵）'], ['E', '與 NPC / 傳送門互動'], ['Q / R', '使用 HP / MP 飲料'], ['Tab 或 B', '背包'], ['C', '角色・屬性・技能'], ['Esc', '暫停選單'], ['M', '音效開關']];
      return `<div class="panel"><div class="ptitle">操作說明</div>
        <table class="keys">${rows.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>
        <p class="hint">打怪升級 → 在經紀公司找訓練師加點 → 去商店買裝備 → 擊敗各區 Boss 解鎖下一區域。Boss 招式前會有紅色預警，看準時機閃避！</p>
        <div class="row"><button class="btn" data-a="back">返回</button></div></div>`;
    },
    pause() {
      return `<div class="panel small">${head('暫停', true)}
        <div class="col-btns">
          <button class="btn" data-a="close">繼續遊戲</button>
          <button class="btn ghost" data-a="inv">背包</button>
          <button class="btn ghost" data-a="char">角色・技能</button>
          <button class="btn ghost" data-a="save">存檔</button>
          <button class="btn ghost" data-a="mute">音效：${G.Audio.muted ? '關' : '開'}</button>
          ${G.canFullscreen() ? '<button class="btn ghost" data-a="fullscreen">全螢幕</button>' : ''}
          <button class="btn ghost" data-a="help">操作說明</button>
          <button class="btn ghost" data-a="title">回到標題</button>
        </div></div>`;
    },
    inv() {
      const S = G.S;
      const eq = ['weapon', 'armor', 'acc'].map((slot) => {
        const it = S.equip[slot] && D.items[S.equip[slot]];
        return it ? itemCard(it, '<span class="tag">卸下</span>', 'unequip', slot)
          : `<div class="item empty"><div class="info"><b>${D.slotName[slot]}</b><small>未裝備</small></div></div>`;
      }).join('');
      const pots = ['hp', 'mp'].map((k) => `<div class="item"><img src="${G.Sprites.icon(k).url}" alt=""><div class="info"><b>${D.potions[k].name} ×${S.potions[k]}</b><small>${D.potions[k].desc}</small></div><button class="btn mini" data-a="use" data-v="${k}">使用</button></div>`).join('');
      const list = S.inv.length ? S.inv.map((id, i) => itemCard(D.items[id], '<span class="tag">裝備</span>', 'equip', i)).join('') : '<p class="hint">還沒有物品。打倒怪物有機會掉落裝備！</p>';
      return `<div class="panel wide">${head('背包', true)}<div class="cols">
        <div class="col"><h4>裝備中</h4>${eq}<h4>消耗品</h4>${pots}<h4>能力值</h4>${statsBlock()}</div>
        <div class="col grow"><h4>物品（${S.inv.length}/${D.invSize}）・點擊裝備</h4><div class="grid">${list}</div></div>
      </div></div>`;
    },
    char() {
      const S = G.S;
      const attrs = Object.keys(D.attrs).map((k) => `<div class="attr"><b>${D.attrs[k].name}</b><span class="val">${S.attrs[k]}</span><small>${D.attrs[k].desc}</small>
        <button class="btn mini" data-a="attr" data-v="${k}" ${S.attrPts > 0 ? '' : 'disabled'}>＋</button></div>`).join('');
      const skills = D.skillOrder.map((k) => {
        const sk = D.skills[k], lv = S.skills[k] || 0, why = G.Skills.status(k), cdr = G.P.st.cdr;
        const cur = lv ? `傷害 ${Math.round(sk.mult(lv) * 100)}%・冷卻 ${(sk.cd(lv) * (1 - cdr)).toFixed(1)}s` : '未習得';
        const nxt = lv < 5 ? `→ Lv${lv + 1}：${Math.round(sk.mult(lv + 1) * 100)}%・${(sk.cd(lv + 1) * (1 - cdr)).toFixed(1)}s` : '';
        return `<div class="skill ${lv ? '' : 'locked'}"><kbd>${sk.key}</kbd><div class="info"><b>${sk.name} <span class="lv">Lv ${lv}/5</span></b>
          <small>${sk.desc}（MP ${sk.mp}）</small><small class="stats">${cur} ${nxt}</small></div>
          <button class="btn mini" data-a="skill" data-v="${k}" ${why ? 'disabled' : ''}>${why || (lv ? '升級' : '學習')}</button></div>`;
      }).join('');
      const need = D.expFor(S.level);
      return `<div class="panel wide">${head('角色・技能', true)}<div class="cols">
        <div class="col"><h4>Nova　Lv ${S.level}</h4><div class="expbar"><i style="width:${S.level >= D.maxLevel ? 100 : Math.round((S.exp / need) * 100)}%"></i></div>
          <small class="hint">EXP ${S.exp} / ${need}　擊殺 ${S.kills}</small>
          <h4>屬性點：<span class="pts">${S.attrPts}</span></h4>${attrs}<h4>能力值</h4>${statsBlock()}</div>
        <div class="col grow"><h4>技能點：<span class="pts">${S.skillPts}</span></h4>${skills}</div>
      </div></div>`;
    },
    shop() {
      const S = G.S;
      let body;
      if (shopTab === 'buy') {
        const pots = ['hp', 'mp'].map((k) => `<div class="item"><img src="${G.Sprites.icon(k).url}" alt=""><div class="info"><b>${D.potions[k].name}</b><small>${D.potions[k].desc}・持有 ${S.potions[k]}/${D.maxPotions}</small></div>
          <button class="btn mini" data-a="buyPot" data-v="${k}" ${S.gold >= D.potions[k].price && S.potions[k] < D.maxPotions ? '' : 'disabled'}>${coin(D.potions[k].price)}</button></div>`).join('');
        const goods = Object.values(D.items).filter((i) => i.rarity === 'common' && i.tier > 0).sort((a, b) => a.tier - b.tier || a.price - b.price)
          .map((it) => itemCard(it, `<button class="btn mini" data-a="buy" data-v="${it.id}" ${S.gold >= it.price ? '' : 'disabled'}>${coin(it.price)}</button>`)).join('');
        body = `<h4>補給品</h4>${pots}<h4>裝備</h4><div class="grid">${goods}</div>`;
      } else {
        body = S.inv.length
          ? `<div class="grid">${S.inv.map((id, i) => itemCard(D.items[id], `<button class="btn mini" data-a="sell" data-v="${i}">賣 ${coin(U.sellPrice(D.items[id]))}</button>`)).join('')}</div>`
          : '<p class="hint">背包裡沒有可販賣的物品。（裝備中的物品需先卸下）</p>';
      }
      return `<div class="panel wide">${head('商店 Mina', true)}
        <div class="tabs"><button class="tab ${shopTab === 'buy' ? 'on' : ''}" data-a="tab" data-v="buy">購買</button><button class="tab ${shopTab === 'sell' ? 'on' : ''}" data-a="tab" data-v="sell">販賣</button></div>
        <div class="scroll">${body}</div></div>`;
    },
    dead() {
      const lose = Math.floor(G.S.gold * 0.1);
      return `<div class="panel small center"><div class="ptitle big">你倒下了……</div><p>經紀人把你扶回公司休息。<br>損失 10% 金幣（−${lose}）</p>
        <div class="row"><button class="btn" data-a="respawn">回到經紀公司</button></div></div>`;
    },
    victory() {
      const S = G.S;
      return `<div class="panel small center"><div class="ptitle big">🏆 年度大賞！</div>
        <p>Nova 在年末頒獎典禮上淨化了所有負能量，<br>從練習生成為了真正的偶像！</p>
        <p class="hint">Lv ${S.level}・擊殺 ${S.kills}・金幣 ${S.gold}</p>
        <p class="hint">你可以繼續冒險、收集傳說裝備。</p>
        <div class="row"><button class="btn" data-a="victoryOk">繼續冒險</button></div></div>`;
    },
  };
  const CLOSABLE = new Set(['pause', 'inv', 'char', 'shop', 'help', 'confirmNew']);

  const ACT = {
    close: () => UI.close(),
    heroPrev: () => { G.heroIdx = (G.heroIdx + 2) % 3; },
    heroNext: () => { G.heroIdx = (G.heroIdx + 1) % 3; },
    back: () => (prev ? UI.show(prev) : UI.close()),
    new: () => (G.Save.has() ? UI.show('confirmNew', 'title') : G.Game.newGame()),
    newConfirm: () => G.Game.newGame(),
    continue: () => G.Game.continueGame(),
    help: () => UI.show('help', UI.open),
    fullscreen: () => G.enterFullscreen(),
    inv: () => UI.show('inv'),
    char: () => UI.show('char'),
    save: () => { UI.toast(G.Save.save() ? '已存檔' : '存檔失敗（瀏覽器不允許本機儲存）', '#7dff9a'); },
    mute: () => { G.Audio.toggle(); render(); },
    title: () => { G.Save.save(); G.Game.toTitle(); },
    equip(i) {
      const S = G.S, id = S.inv[i], it = D.items[id];
      if (!it) return;
      const old = S.equip[it.slot];
      S.equip[it.slot] = id;
      if (old) S.inv[i] = old; else S.inv.splice(i, 1);
      G.Player.recalc(); G.Audio.play('ui');
    },
    unequip(slot) {
      const S = G.S;
      if (!S.equip[slot]) return;
      if (S.inv.length >= D.invSize) { UI.toast('背包已滿', '#ff8fa0'); return; }
      S.inv.push(S.equip[slot]); S.equip[slot] = null;
      G.Player.recalc(); G.Audio.play('ui');
    },
    use(k) { G.Player.usePotion(k); },
    attr(k) { const S = G.S; if (S.attrPts <= 0) return; S.attrs[k]++; S.attrPts--; G.Player.recalc(); if (k === 'vit') G.P.hp += 12; if (k === 'agi') G.P.mp += 4; G.Audio.play('ui'); },
    skill(k) { if (G.Skills.learn(k)) { G.Audio.play('level'); UI.toast(`習得 ${D.skills[k].name} Lv${G.S.skills[k]}`, '#ffd84f'); } },
    tab(v) { shopTab = v; },
    buy(id) {
      const S = G.S, it = D.items[id];
      if (S.gold < it.price) return;
      if (S.inv.length >= D.invSize) { UI.toast('背包已滿', '#ff8fa0'); return; }
      S.gold -= it.price; S.inv.push(id); G.Audio.play('coin'); UI.toast(`購買了 ${it.name}（到背包裝備）`, '#ffd84f');
    },
    buyPot(k) { const S = G.S, p = D.potions[k]; if (S.gold < p.price || S.potions[k] >= D.maxPotions) return; S.gold -= p.price; S.potions[k]++; G.Audio.play('coin'); },
    sell(i) { const S = G.S, it = D.items[S.inv[i]]; if (!it) return; S.gold += U.sellPrice(it); S.inv.splice(i, 1); G.Audio.play('coin'); },
    respawn: () => G.Game.respawn(),
    victoryOk: () => UI.close(),
  };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (ACT[a]) {
      ACT[a](b.dataset.v);
      if (UI.open && !['close', 'back', 'new', 'newConfirm', 'continue', 'help', 'inv', 'char', 'title', 'respawn', 'victoryOk'].includes(a)) render();
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });

  function render() {
    if (!UI.open) { root.innerHTML = ''; root.className = ''; return; }
    const scroll = root.querySelector('.scroll, .col.grow');
    const top = scroll ? scroll.scrollTop : 0;
    root.innerHTML = PANELS[UI.open]();
    root.className = UI.open === 'title' ? 'title' : 'dim';
    const ns = root.querySelector('.scroll, .col.grow');
    if (ns) ns.scrollTop = top;
  }

  const UI = (G.UI = {
    open: null,
    show(name, from) {
      prev = from !== undefined ? from : null;
      if (name === 'shop') shopTab = 'buy';
      UI.open = name;
      render();
      G.Input.releaseAll();
      G.Audio.play('ui');
    },
    close() {
      UI.open = null; prev = null;
      render();
    },
    refresh: render,
    handleKeys() {
      const I = G.Input;
      if (I.pressed('Escape')) {
        if (UI.open === 'help' || UI.open === 'confirmNew') ACT.back();
        else if (CLOSABLE.has(UI.open)) UI.close();
      } else if ((I.pressed('Tab') || I.pressed('KeyB')) && UI.open === 'inv') UI.close();
      else if (I.pressed('KeyC') && UI.open === 'char') UI.close();
    },
    toast(msg, color) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      if (color) el.style.borderColor = color, (el.style.color = color);
      toastBox.appendChild(el);
      while (toastBox.children.length > 4) toastBox.removeChild(toastBox.firstChild);
      setTimeout(() => el.classList.add('out'), 2600);
      setTimeout(() => el.remove(), 3100);
    },
    renderHUD, txt, TC, PX,
  });
})();
