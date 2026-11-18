'use strict';
// ============================================================
//  存檔：localStorage（失敗時靜默，仍可遊玩）
// ============================================================
(function () {
  const KEY = 'nova_kpop_save_v1';
  const D = G.DATA;

  G.newState = () => ({
    level: 1, exp: 0, gold: 30, attrPts: 0, skillPts: 0,
    attrs: { str: 0, vit: 0, cha: 0, agi: 0 },
    skills: { wave: 1, spin: 0, dash: 0, encore: 0 },
    equip: { weapon: 'w0', armor: 'a0', acc: null },
    inv: [], potions: { hp: 3, mp: 2 },
    unlocked: 1, defeated: [], cleared: false, kills: 0,
  });

  function merge(s) {
    const d = G.newState();
    const num = (v, def) => (typeof v === 'number' && isFinite(v) ? v : def);
    d.level = Math.max(1, Math.min(D.maxLevel, num(s.level, 1)));
    d.exp = num(s.exp, 0); d.gold = Math.max(0, num(s.gold, 0));
    d.attrPts = num(s.attrPts, 0); d.skillPts = num(s.skillPts, 0); d.kills = num(s.kills, 0);
    for (const k in d.attrs) d.attrs[k] = num(s.attrs && s.attrs[k], 0);
    for (const k in d.skills) d.skills[k] = Math.max(0, Math.min(5, num(s.skills && s.skills[k], d.skills[k])));
    for (const k in d.potions) d.potions[k] = Math.max(0, Math.min(D.maxPotions, num(s.potions && s.potions[k], d.potions[k])));
    for (const k in d.equip) { const id = s.equip && s.equip[k]; d.equip[k] = id && D.items[id] && D.items[id].slot === k ? id : (s.equip ? null : d.equip[k]); }
    d.inv = (Array.isArray(s.inv) ? s.inv : []).filter((id) => D.items[id]).slice(0, D.invSize);
    d.unlocked = Math.max(1, Math.min(3, num(s.unlocked, 1)));
    d.defeated = Array.isArray(s.defeated) ? s.defeated.filter((z) => D.zones[z]) : [];
    d.cleared = !!s.cleared;
    return d;
  }

  G.Save = {
    save() {
      try { localStorage.setItem(KEY, JSON.stringify({ v: 1, t: Date.now(), s: G.S })); return true; }
      catch (e) { return false; }
    },
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        return o && o.s ? merge(o.s) : null;
      } catch (e) { return null; }
    },
    has() { return !!this.load(); },
  };
})();
