'use strict';
// ============================================================
//  像素圖：字串陣列 + 調色盤 → 預先渲染 offscreen canvas
// ============================================================
(function () {
  const cache = {};
  const icons = {};

  function build(rows, pal) {
    const h = rows.length, w = rows[0].length;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const ch = rows[j][i];
        if (ch === '.' || !pal[ch]) continue;
        x.fillStyle = pal[ch];
        x.fillRect(i, j, 1, 1);
      }
    }
    return c;
  }
  function variant(src, mode) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    if (mode === 'flip') { x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); }
    else { x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
    return c;
  }
  function define(name, rows, pal) {
    const n = build(rows, pal), w = variant(n, 'white');
    cache[name] = { n, f: variant(n, 'flip'), w, wf: variant(w, 'flip'), width: n.width, height: n.height };
  }
  // (x,y) = 腳底中心；foot = 圖底部往下超出的像素
  function draw(ctx, name, x, y, o) {
    o = o || {};
    const s = cache[name];
    if (!s) return;
    const sc = o.scale || 1;
    const img = o.white ? (o.flip ? s.wf : s.w) : (o.flip ? s.f : s.n);
    const w = s.width * sc, h = s.height * sc;
    const foot = (o.foot != null ? o.foot : 4) * sc;
    ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h + foot), w, h);
  }

  // ---------- 角色 ----------
  const HEAD = [
    '................',
    '....hhhhhhh.....',
    '...hhhhhhhhh....',
    '..hhhyhhhhhhh...',
    '..hhsssssssh....',
    '..hhsesssesh....',
    '..hhsssmmssh....',
    '...hssssssh.....',
    '....rrwwrr......',
    '...rrrwwrrr.....',
    '..srrrwwrrrs....',
    '....rrrrrr......',
    '....pppppp......',
  ];
  const LEGS_A = ['....pp..pp......', '....pp..pp......', '...bbb..bbb.....'];
  const LEGS_B = ['....pp...pp.....', '...pp....pp.....', '...bb....bbb....'];
  const PERSON = (pal, name) => {
    define(name + '_a', HEAD.concat(LEGS_A), pal);
    define(name + '_b', HEAD.concat(LEGS_B), pal);
  };
  const basePal = { s: '#ffd9b8', e: '#2b2320', m: '#e05a7a', w: '#ffffff', b: '#1b1b24' };
  PERSON(Object.assign({}, basePal, { h: '#ff6fb5', y: '#ffd84f', r: '#E1002B', p: '#3b3b5c' }), 'nova');
  PERSON(Object.assign({}, basePal, { h: '#a77bff', y: '#a77bff', r: '#3fa36b', p: '#5c4a3b' }), 'npc_shop');
  PERSON(Object.assign({}, basePal, { h: '#2b2320', y: '#2b2320', r: '#2f6fd6', p: '#2f6fd6' }), 'npc_trainer');
  PERSON(Object.assign({}, basePal, { h: '#6b4a2e', y: '#6b4a2e', r: '#2e2e38', p: '#2e2e38' }), 'npc_mgr');

  // ---------- 小怪 ----------
  define('note', [
    '................',
    '.......kkkkk....',
    '.......kkkkkk...',
    '.......k...kk...',
    '.......k....k...',
    '.......k........',
    '.......k........',
    '...kkkkk........',
    '..kkkkkkk.......',
    '.kkwkkwkkk......',
    '.kkekkekkk......',
    '.kkkkkkkkk......',
    '..kkmmmkk.......',
    '...kkkkk........',
    '................',
    '................',
  ], { k: '#6a3cbc', w: '#ffffff', e: '#ff3355', m: '#ff8fb0' });

  define('slime', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......gggg......',
    '....gggggggg....',
    '...gglgggggggg..',
    '..gglggggggggg..',
    '..ggggggggggggg.',
    '.gggkkggggkkggg.',
    '.gggggggggggggg.',
    '.ggggggmmgggggg.',
    '.gggggggggggggg.',
    '..GGGGGGGGGGGG..',
    '................',
  ], { g: '#7fa4c9', l: '#d6ecff', k: '#2b3550', m: '#3b4766', G: '#56789c' });

  define('troll', [
    '................',
    '.....dddddd.....',
    '....dddddddd....',
    '...dddssssddd...',
    '...ddsessesdd...',
    '...ddssmmssdd...',
    '....ddssssdd....',
    '...dddddddddd...',
    '..dddddddddddd..',
    '..ddsdddddddPP..',
    '..ss.dddddd.PP..',
    '.....dddddd.....',
    '.....jj..jj.....',
    '.....jj..jj.....',
    '.....jj..jj.....',
    '....bbb..bbb....',
  ], { d: '#6b6b78', s: '#e8c4a8', e: '#c0182f', m: '#7a2030', P: '#5ce1ff', j: '#33405e', b: '#1b1b24' });

  define('papa', [
    '................',
    '....cccccc......',
    '...ccccccccc....',
    '....ssssss......',
    '....sesses......',
    '....ssmsss......',
    '...tttttttt.....',
    '..ttttttKKKK....',
    '..ttttttKLLK....',
    '..ttttttKLLKs...',
    '..ttttttKKKK....',
    '...tttttt.......',
    '....pp..pp......',
    '....pp..pp......',
    '....pp..pp......',
    '...bbb..bbb.....',
  ], { c: '#3d3d48', s: '#e8c4a8', e: '#2b2320', m: '#a04050', t: '#b89a6a', K: '#1b1b20', L: '#8fd8ff', p: '#4a4a55', b: '#1b1b24' });

  define('anti', [
    '......aaaa......',
    '....aaaaaaaa....',
    '...aaaaaaaaaa...',
    '..aaaakkkkaaaa..',
    '..aaakekkekaaa..',
    '..aaakkkkkkaaa..',
    '..aaakkmmkkaaa..',
    '...aaaaaaaaaa...',
    '..aaaaaaaaaaaa..',
    '.aaaaaaaaaaaaaa.',
    '.aa.aaaaaaaa.aa.',
    '...aaaaaaaaaa...',
    '...aaaaaaaaaa...',
    '..aaaaaaaaaaaa..',
    '..a.a.a..a.a.a..',
    '................',
  ], { a: '#2a1638', k: '#08040c', e: '#ff2f4f', m: '#b0102a' });

  define('bot', [
    '................',
    '................',
    '...oooooooooo...',
    '...offffffffo...',
    '...offfuufffo...',
    '...offueeuffo...',
    '...offuuuuffo...',
    '...offfuufffo...',
    '...ofuuuuuufo...',
    '...ouuuuuuuuo...',
    '...oooooooooo...',
    '....xx....xx....',
    '.....x....x.....',
    '................',
    '................',
    '................',
  ], { o: '#3a3f4a', f: '#c9ced8', u: '#7d8594', e: '#ff3355', x: '#ff9d2f' });

  // ---------- Boss（20x20，2 倍繪製） ----------
  define('metronome', [
    '.........WW.........',
    '........WWWW........',
    '........WooW........',
    '.......WWooWW.......',
    '.......WooooW.......',
    '......WWooooWW......',
    '......WooooooW......',
    '.....WWoeooeoWW.....',
    '.....WooooooooW.....',
    '....WWoommmmooWW....',
    '....WooooooooooW....',
    '...WWooooooooooWW...',
    '...WooooooooooooW...',
    '..WWooooooooooooWW..',
    '..WooooooooooooooW..',
    '.WWWWWWWWWWWWWWWWWW.',
    '.WggggggggggggggggW.',
    '.WWWWWWWWWWWWWWWWWW.',
    '..WW............WW..',
    '....................',
  ], { W: '#5a3418', o: '#a0612f', e: '#ff2f4f', m: '#f5f2f1', g: '#f2c14e' });

  define('captain', [
    '......cccccccc......',
    '.....cccccccccc.....',
    '.....cccccccccc.....',
    '...cccccccccccccc...',
    '......ssssssss......',
    '......kkksskkk......',
    '......ssssssss......',
    '......sssmmsss......',
    '.......ssssss.......',
    '....tttttttttttt....',
    '...ttttttttKKKKKK...',
    '..tttttttttKLLLLK...',
    '..tttttttttKLwwLKs..',
    '..tttttttttKLLLLK...',
    '..sttttttttKKKKKK...',
    '....tttttttttt......',
    '....pppp..pppp......',
    '....pppp..pppp......',
    '....pppp..pppp......',
    '...bbbbb..bbbbb.....',
  ], { c: '#26262e', s: '#e8c4a8', k: '#0d0d12', m: '#a04050', t: '#8a6a3e', K: '#16161b', L: '#5ca8ff', w: '#ffffff', p: '#3a3a44', b: '#111116' });

  define('colossus', [
    '..h..............h..',
    '..hh............hh..',
    '...hhvvvvvvvvvvhh...',
    '....vvvvvvvvvvvv....',
    '....vvkekvvkekvv....',
    '....vvvvvvvvvvvv....',
    '....vvvmmmmmmvvv....',
    '.vvvvvvvvvvvvvvvvvv.',
    'vvvvvvvvvvvvvvvvvvvv',
    'vvvVvvvvvccvvvvvVvvv',
    'vvvVvvvvccccvvvvVvvv',
    'vvv.vvvvccccvvvv.vvv',
    'vvv.vvvvvccvvvvv.vvv',
    'VVV.vvvvvvvvvvvv.VVV',
    '....vvvvvvvvvvvv....',
    '....vvvvv..vvvvv....',
    '....vvvv....vvvv....',
    '....vvvv....vvvv....',
    '...VVVVV....VVVVV...',
    '....................',
  ], { h: '#8a8a9a', v: '#3d1f5c', V: '#24112f', k: '#08040c', e: '#ff2fd0', m: '#ff2fd0', c: '#ff5ce1' });

  // ---------- 物品圖示（10x10） ----------
  const ICONS = {
    weapon: [['........yy', '.......yWy', '......yWy.', '.....kyy..', '....kk....', '...kk.....', '..kk......', '.kk.......', 'kk........', 'k.........'],
      { y: '#ff8fd0', W: '#ffffff', k: '#d8d8e0' }],
    armor: [['..rr..rr..', '.rrrwwrrr.', 'rrrrwwrrrr', 'rr.rwwr.rr', 'rr.rwwr.rr', '...rwwr...', '...rrrr...', '...rrrr...', '...rrrr...', '..........'],
      { r: '#E1002B', w: '#ffffff' }],
    acc: [['....gg....', '...gWWg...', '....gg....', '..yyyyyy..', '.yy....yy.', '.y......y.', '.y......y.', '.yy....yy.', '..yyyyyy..', '..........'],
      { g: '#5ce1ff', W: '#ffffff', y: '#f2c14e' }],
    hp: [['...wwww...', '....ww....', '....ww....', '...wLLw...', '..wLLLLw..', '..wLWLLw..', '..wLLLLw..', '..wLLLLw..', '...wwww...', '..........'],
      { w: '#f5f2f1', L: '#f2a03d', W: '#fff3c4' }],
    mp: [['...wwww...', '...cccc...', '..cccccc..', '..cLLLLc..', '..cLWLLc..', '..cLLLLc..', '..cLLLLc..', '..cccccc..', '...cccc...', '..........'],
      { w: '#d8d8e0', c: '#9aa3b5', L: '#2f8cff', W: '#bfe0ff' }],
  };
  for (const k in ICONS) {
    const c = build(ICONS[k][0], ICONS[k][1]);
    const big = document.createElement('canvas');
    big.width = 40; big.height = 40;
    const bx = big.getContext('2d');
    bx.imageSmoothingEnabled = false;
    bx.drawImage(c, 0, 0, 40, 40);
    icons[k] = { canvas: c, url: big.toDataURL() };
  }

  G.Sprites = {
    define, draw,
    get: (n) => cache[n],
    icon: (k) => icons[k],
  };
})();
