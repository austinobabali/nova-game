'use strict';
// ============================================================
//  輸入：鍵盤 + 觸控虛擬按鍵（以相同 code 注入）+ 虛擬搖桿
// ============================================================
(function () {
  const down = new Set();
  const vdown = new Set();
  const pressed = new Set();
  const joy = { x: 0, y: 0, active: false };
  const BLOCK = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  addEventListener('keydown', (e) => {
    if (BLOCK.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (G.Audio) G.Audio.init();
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); vdown.clear(); joy.active = false; joy.x = joy.y = 0; });
  addEventListener('pointerdown', () => G.Audio && G.Audio.init(), { capture: true });

  G.Input = {
    joy,
    down: (c) => down.has(c) || vdown.has(c),
    pressed: (c) => pressed.has(c),
    consume() { pressed.clear(); },
    // 觸控按鈕使用
    press(c) { if (!vdown.has(c)) pressed.add(c); vdown.add(c); },
    release(c) { vdown.delete(c); },
    releaseAll() { vdown.clear(); joy.active = false; joy.x = joy.y = 0; },
    axis() {
      let x = 0, y = 0;
      if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
      if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
      if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
      if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
      if (!x && !y && joy.active && Math.hypot(joy.x, joy.y) > 0.25) { x = joy.x; y = joy.y; }
      return { x, y };
    },
  };
})();
