'use strict';
// ============================================================
//  NOVA：星光逆襲 — 遊戲資料（數值、物品、技能、怪物、區域）
//  原創作品：所有角色、團體、地點皆為虛構
// ============================================================
window.G = window.G || {};
(function () {
  G.W = 480; G.H = 270; G.TS = 16;
  const TAU = Math.PI * 2;

  // ---------- 共用工具 ----------
  const U = (G.U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    angTo: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
    angDiff(a, b) {
      let d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    },
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  });

  // ---------- 物品 ----------
  const items = {};
  function item(id, name, slot, rarity, tier, price, stats, desc) {
    items[id] = { id, name, slot, rarity, tier, price, stats, desc: desc || '' };
  }
  // tier 0（初始）
  item('w0', '塑膠應援棒', 'weapon', 'common', 0, 10, { atk: 3 }, '練習生的第一支應援棒');
  item('a0', '練習服', 'armor', 'common', 0, 10, { def: 2 }, '吸汗透氣的練習服');
  // tier 1
  item('w1', 'LED 應援棒', 'weapon', 'common', 1, 150, { atk: 8 });
  item('a1', '街頭夾克', 'armor', 'common', 1, 160, { def: 5, hp: 20 });
  item('c1', '入耳式耳返', 'acc', 'common', 1, 120, { mp: 20, hp: 10 });
  item('w1r', '閃亮應援棒', 'weapon', 'rare', 1, 0, { atk: 11, crit: 0.03 });
  item('a1r', '亮片背心', 'armor', 'rare', 1, 0, { def: 7, hp: 35 });
  item('c1r', '幸運手環', 'acc', 'rare', 1, 0, { atk: 2, crit: 0.06 });
  // tier 2
  item('w2', '霓虹應援棒', 'weapon', 'common', 2, 450, { atk: 15 });
  item('a2', '亮片舞台服', 'armor', 'common', 2, 480, { def: 9, hp: 50 });
  item('c2', '輕盈舞鞋', 'acc', 'common', 2, 420, { spd: 12, mp: 15 });
  item('w2r', '星光權杖', 'weapon', 'rare', 2, 0, { atk: 20, crit: 0.05 });
  item('a2r', '偶像禮服', 'armor', 'rare', 2, 0, { def: 12, hp: 80, mp: 20 });
  item('c2r', '星星髮夾', 'acc', 'rare', 2, 0, { atk: 6, crit: 0.08 });
  // tier 3
  item('w3', '全息應援棒', 'weapon', 'common', 3, 1200, { atk: 24 });
  item('a3', '鋼鐵舞台裝', 'armor', 'common', 3, 1300, { def: 14, hp: 90 });
  item('c3', '麥克風耳掛', 'acc', 'common', 3, 1100, { atk: 6, mp: 40 });
  item('w3r', '月光指揮棒', 'weapon', 'rare', 3, 0, { atk: 32, crit: 0.08 });
  item('a3r', '星塵披風', 'armor', 'rare', 3, 0, { def: 18, hp: 140 });
  item('c3r', '粉絲應援手燈', 'acc', 'rare', 3, 0, { atk: 10, hp: 60, crit: 0.04 });
  // 傳說
  item('wL', '銀河應援棒', 'weapon', 'legendary', 3, 0, { atk: 45, crit: 0.12, spd: 10 }, '傳說中能照亮整座體育館的應援棒');
  item('aL', '鑽石舞台裝', 'armor', 'legendary', 3, 0, { def: 26, hp: 250, mp: 30 }, '年末頒獎典禮限定的閃耀舞台裝');
  item('cL', '冠軍獎盃徽章', 'acc', 'legendary', 3, 0, { atk: 15, def: 10, hp: 100, crit: 0.1 }, '象徵年度大賞的榮耀');

  U.statText = function (s) {
    const o = [];
    if (s.atk) o.push('攻擊+' + s.atk);
    if (s.def) o.push('防禦+' + s.def);
    if (s.hp) o.push('HP+' + s.hp);
    if (s.mp) o.push('MP+' + s.mp);
    if (s.crit) o.push('爆擊+' + Math.round(s.crit * 100) + '%');
    if (s.spd) o.push('移速+' + s.spd);
    return o.join('　');
  };
  U.itemValue = (it) => it.price || (it.rarity === 'legendary' ? 2500 : 300 * Math.max(1, it.tier));
  U.sellPrice = (it) => Math.floor(U.itemValue(it) * 0.4);

  // ---------- 技能 ----------
  const skills = {
    wave: {
      name: '音波衝擊', short: '音波', key: 'K', code: 'KeyK', unlock: 1, mp: 10,
      cd: (l) => 3.2 - 0.2 * l, mult: (l) => 1.6 + 0.4 * l, range: (l) => 56 + 6 * l,
      desc: '向前方釋放扇形音波，造成傷害並擊退敵人',
    },
    spin: {
      name: '應援棒旋風', short: '旋風', key: 'L', code: 'KeyL', unlock: 3, mp: 18,
      cd: (l) => 8.5 - 0.5 * l, mult: (l) => 0.55 + 0.15 * l, range: (l) => 30 + 3 * l,
      desc: '旋轉應援棒 1.6 秒，持續傷害周圍所有敵人',
    },
    dash: {
      name: '舞步突進', short: '突進', key: 'U', code: 'KeyU', unlock: 5, mp: 12,
      cd: (l) => 5.3 - 0.3 * l, mult: (l) => 2 + 0.5 * l, range: (l) => 80 + 10 * l,
      desc: '朝面向高速突進（無敵），穿透並傷害路徑上的敵人',
    },
    encore: {
      name: '安可大絕', short: '安可', key: 'I', code: 'KeyI', unlock: 8, mp: 45,
      cd: (l) => 34 - 2 * l, mult: (l) => 4 + 1.5 * l, range: () => 300,
      desc: '全場應援爆發！畫面內所有敵人受到巨大傷害，並短暫無敵',
    },
  };

  // ---------- 怪物 ----------
  const enemies = {
    note: { name: '走音音符', hp: 30, atk: 10, def: 0, spd: 42, exp: 8, gold: [2, 5], r: 6, ai: 'wobble', float: true },
    slime: { name: '疲勞史萊姆', hp: 52, atk: 12, def: 1, spd: 30, exp: 12, gold: [3, 7], r: 7, ai: 'hop' },
    troll: { name: '酸民', hp: 95, atk: 22, def: 3, spd: 48, exp: 24, gold: [6, 12], r: 6, ai: 'chase' },
    papa: { name: '狗仔', hp: 72, atk: 20, def: 2, spd: 44, exp: 26, gold: [7, 14], r: 6, ai: 'ranged' },
    anti: { name: '黑粉', hp: 220, atk: 36, def: 8, spd: 56, exp: 48, gold: [12, 22], r: 7, ai: 'chase' },
    bot: { name: '假帳號 Bot', hp: 70, atk: 26, def: 3, spd: 74, exp: 20, gold: [4, 9], r: 6, ai: 'swarm', float: true, group: 3 },
    metronome: { name: '失控節拍器', hp: 700, atk: 18, def: 3, spd: 40, exp: 260, gold: [180, 220], r: 15, ai: 'metronome', boss: true, scale: 2 },
    captain: { name: '狗仔隊長', hp: 1800, atk: 30, def: 6, spd: 45, exp: 720, gold: [450, 550], r: 15, ai: 'captain', boss: true, scale: 2 },
    colossus: { name: '負能量巨像', hp: 4500, atk: 42, def: 10, spd: 38, exp: 2000, gold: [1400, 1600], r: 16, ai: 'colossus', boss: true, scale: 2 },
  };

  // ---------- 區域 ----------
  const zones = {
    1: { id: 1, name: '地下練習室', theme: 'practice', enemies: ['note', 'slime'], boss: 'metronome', lv: '建議 Lv 1-4', count: 16, tier: 1, music: 'practice', color: '#ff8fd0' },
    2: { id: 2, name: '霓虹街頭', theme: 'street', enemies: ['troll', 'papa'], boss: 'captain', lv: '建議 Lv 5-9', count: 18, tier: 2, music: 'street', color: '#5ce1ff' },
    3: { id: 3, name: '年末頒獎舞台', theme: 'stage', enemies: ['anti', 'bot'], boss: 'colossus', lv: '建議 Lv 10+', count: 18, tier: 3, music: 'stage', color: '#ffd84f' },
  };

  // ---------- 主角（普攻差異；技能暫時共用） ----------
  const heroes = {
    amira: { name: 'AMIRA', role: '先鋒・爪刃', range: 22, arc: 2.4, cdMul: 0.78, multMul: 0.9 },
    luna: { name: 'LUNA', role: '劍士・長劍', range: 27, arc: 2.5, cdMul: 1, multMul: 1 },
    rosa: { name: 'ROSA', role: '槍兵・光槍', range: 36, arc: 1.0, cdMul: 1.15, multMul: 1.12 },
  };

  G.DATA = {
    heroes, heroOrder: ['amira', 'luna', 'rosa'],
    base: { hp: 100, mp: 50, atk: 10, def: 2, spd: 72, crit: 0.05, critDmg: 1.6 },
    perLevel: { hp: 12, mp: 5, atk: 2, def: 1 },
    maxLevel: 30,
    expFor: (lv) => Math.round(15 * Math.pow(lv, 1.5) + 10),
    attrs: {
      str: { name: '力量', desc: '攻擊 +2' },
      vit: { name: '體力', desc: 'HP +12、防禦 +0.5' },
      cha: { name: '魅力', desc: '爆擊率 +1%、爆擊傷害 +2%' },
      agi: { name: '敏捷', desc: '移速 +2、冷卻 -1.5%、MP +4' },
    },
    potions: {
      hp: { name: '蜂蜜檸檬水', desc: '回復 35% HP', price: 25, key: 'Q' },
      mp: { name: '能量飲料', desc: '回復 50% MP', price: 25, key: 'R' },
    },
    maxPotions: 9,
    invSize: 24,
    rarityName: { common: '普通', rare: '稀有', legendary: '傳說' },
    rarityColor: { common: '#e8e0dc', rare: '#4fb3ff', legendary: '#ffb347' },
    slotName: { weapon: '應援棒', armor: '舞台服', acc: '飾品' },
    items, skills, skillOrder: ['wave', 'spin', 'dash', 'encore'], enemies, zones,
  };
})();
