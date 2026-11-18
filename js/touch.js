'use strict';
// ============================================================
//  手機觸控：浮動虛擬搖桿 + 右側動作按鈕（注入與鍵盤相同的 code）
// ============================================================
(function () {
  const D = G.DATA, I = G.Input;
  const el = document.getElementById('touch');

  // 主要指標為觸控（手機/平板）才啟用；?touch=1 可在桌機強制測試
  G.isTouch = /[?&]touch=1/.test(location.search) || (!!window.matchMedia && matchMedia('(pointer: coarse)').matches);

  const BTN = [
    { id: 'atk', code: 'KeyJ', label: '攻擊', cls: 'big' },
    { id: 'dodge', code: 'Space', label: '閃避', cls: 'mid' },
    { id: 'wave', code: 'KeyK', label: 'K', skill: 'wave', cls: 'sk' },
    { id: 'spin', code: 'KeyL', label: 'L', skill: 'spin', cls: 'sk' },
    { id: 'dash', code: 'KeyU', label: 'U', skill: 'dash', cls: 'sk' },
    { id: 'encore', code: 'KeyI', label: 'I', skill: 'encore', cls: 'sk' },
    { id: 'interact', code: 'KeyE', label: 'E', cls: 'mid act' },
    { id: 'hp', code: 'KeyQ', label: 'HP', cls: 'pot' },
    { id: 'mp', code: 'KeyR', label: 'MP', cls: 'pot' },
  ];
  const MENU = [
    { id: 'm-inv', code: 'Tab', label: '背包' },
    { id: 'm-char', code: 'KeyC', label: '角色' },
    { id: 'm-pause', code: 'Escape', label: 'Ⅱ' },
  ];

  el.innerHTML = `
    <div class="joy-zone" id="joyZone"><div class="joy-base" id="joyBase"><div class="joy-knob" id="joyKnob"></div></div></div>
    <div class="t-menu">${MENU.map((b) => `<button class="tbtn menu" data-code="${b.code}">${b.label}</button>`).join('')}</div>
    <div class="t-pad">${BTN.map((b) => `<button class="tbtn ${b.cls} b-${b.id}" data-code="${b.code}" ${b.skill ? `data-skill="${b.skill}"` : ''}>
      <span class="lbl">${b.label}</span>${b.skill ? '<span class="cdv"></span><span class="cdt"></span>' : ''}${b.cls === 'pot' ? '<span class="cnt"></span>' : ''}</button>`).join('')}</div>`;

  // 技能按鈕顯示技能名
  el.querySelectorAll('[data-skill]').forEach((b) => { b.querySelector('.lbl').textContent = D.skills[b.dataset.skill].short; });

  // ---------- 按鈕 ----------
  el.querySelectorAll('.tbtn').forEach((b) => {
    const code = b.dataset.code;
    const down = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } b.classList.add('on'); I.press(code); G.Audio.init(); };
    const up = (e) => { e.preventDefault(); b.classList.remove('on'); I.release(code); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ---------- 浮動搖桿 ----------
  const zone = document.getElementById('joyZone'), base = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
  let jid = null, ox = 0, oy = 0;
  const R = 50;
  zone.addEventListener('pointerdown', (e) => {
    if (jid !== null) return;
    e.preventDefault();
    jid = e.pointerId;
    try { zone.setPointerCapture(jid); } catch (_) { /* ignore */ }
    ox = e.clientX; oy = e.clientY;
    base.style.left = ox + 'px'; base.style.top = oy + 'px';
    base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
    I.joy.active = true; I.joy.x = 0; I.joy.y = 0;
    G.Audio.init();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== jid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    I.joy.x = dx / R; I.joy.y = dy / R;
  });
  const end = (e) => {
    if (e.pointerId !== jid) return;
    jid = null; I.joy.active = false; I.joy.x = I.joy.y = 0;
    base.classList.remove('on');
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);

  // ---------- 每幀更新冷卻 / 狀態 ----------
  const skillBtns = [...el.querySelectorAll('[data-skill]')];
  const potHp = el.querySelector('.b-hp .cnt'), potMp = el.querySelector('.b-mp .cnt');
  const interactBtn = el.querySelector('.b-interact');
  let lastKey = '';
  G.Touch = {
    update() {
      const show = G.isTouch && G.Game.scene === 'play' && !G.UI.open && G.run && !G.run.over && !G.portraitBlocked;
      el.classList.toggle('show', !!show);
      if (!show) { if (jid !== null) { jid = null; I.joy.active = false; base.classList.remove('on'); } return; }
      const P = G.P, S = G.S;
      for (const b of skillBtns) {
        const k = b.dataset.skill, cd = P.cd[k], max = P.cdMax[k] || 1;
        const locked = !S.skills[k], nomp = P.mp < D.skills[k].mp;
        b.classList.toggle('locked', locked);
        b.classList.toggle('nomp', !locked && nomp);
        b.style.setProperty('--p', cd > 0 ? (cd / max).toFixed(3) : 0);
        b.querySelector('.cdt').textContent = locked ? 'Lv' + D.skills[k].unlock : cd > 0 ? Math.ceil(cd) : '';
      }
      const key = S.potions.hp + '/' + S.potions.mp;
      if (key !== lastKey) { potHp.textContent = S.potions.hp; potMp.textContent = S.potions.mp; lastKey = key; }
      interactBtn.classList.toggle('ready', !!G.run.interact);
      interactBtn.querySelector('.lbl').textContent = G.run.interact ? G.run.interact.short : 'E';
    },
  };
})();
