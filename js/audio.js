'use strict';
// ============================================================
//  音效與 BGM：WebAudio 即時合成（無音檔）
// ============================================================
(function () {
  let ac = null, master = null, muted = false, pending = 'hub';
  const last = {};
  let noiseBuf = null;
  const bgm = { song: null, step: 0, next: 0, timer: null };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.22;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (pending !== undefined) music(pending);
    } catch (e) { ac = null; }
  }

  function tone(freq, dur, type, vol, slide, delay) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol == null ? 0.4 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, delay) {
    if (!ac || muted || !noiseBuf) return;
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = noiseBuf;
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur);
  }

  const SFX = {
    swing: () => tone(520, 0.07, 'triangle', 0.25, 500),
    hit: () => { noise(0.05, 0.25); tone(180, 0.06, 'square', 0.15, -80); },
    crit: () => { noise(0.08, 0.35); tone(880, 0.1, 'square', 0.2, 600); },
    hurt: () => { tone(240, 0.18, 'sawtooth', 0.3, -160); noise(0.1, 0.2); },
    coin: () => { tone(988, 0.05, 'square', 0.15); tone(1319, 0.09, 'square', 0.15, 0, 0.05); },
    level: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'square', 0.22, 0, i * 0.07)),
    wave: () => { tone(300, 0.25, 'sine', 0.35, 900); tone(600, 0.2, 'triangle', 0.15, 600, 0.03); },
    spin: () => tone(400, 0.3, 'sawtooth', 0.12, 300),
    dash: () => { noise(0.12, 0.2); tone(700, 0.12, 'triangle', 0.18, -400); },
    encore: () => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'square', 0.22, 0, i * 0.06)); noise(0.5, 0.25, 0.1); },
    shoot: () => tone(1200, 0.08, 'square', 0.12, -500),
    boom: () => { noise(0.35, 0.45); tone(90, 0.35, 'sine', 0.5, -50); },
    boss: () => { tone(110, 0.6, 'sawtooth', 0.35, -40); tone(116, 0.6, 'sawtooth', 0.3, -40); },
    die: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, 0, i * 0.15)),
    victory: () => [523, 659, 784, 1047, 784, 1047, 1568].forEach((f, i) => tone(f, 0.22, 'square', 0.22, 0, i * 0.11)),
    ui: () => tone(880, 0.04, 'square', 0.12),
    err: () => tone(160, 0.12, 'square', 0.18),
    pickup: () => tone(1046, 0.08, 'triangle', 0.2, 400),
    portal: () => tone(300, 0.5, 'sine', 0.3, 900),
    heal: () => { tone(660, 0.12, 'sine', 0.25, 300); tone(990, 0.15, 'sine', 0.2, 300, 0.08); },
  };

  // ---------- 原創晶片風 BGM（和弦進行 + 琶音自動產生） ----------
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function makeSong(tempo, prog, arp) {
    const lead = [], bass = [];
    prog.forEach(([r, minor]) => {
      const t = [r, r + (minor ? 3 : 4), r + 7, r + 12];
      for (let i = 0; i < 8; i++) {
        lead.push(arp[i] < 0 ? 0 : t[arp[i]] + 12);
        bass.push(i % 2 === 0 ? r - 12 : 0);
      }
    });
    return { tempo, lead, bass };
  }
  const SONGS = {
    hub: makeSong(0.17, [[60, 0], [67, 0], [69, 1], [65, 0]], [0, 1, 2, 3, 2, 1, 2, -1]),
    practice: makeSong(0.15, [[57, 1], [53, 0], [60, 0], [55, 0]], [0, 2, 1, 2, 3, 2, 1, 2]),
    street: makeSong(0.14, [[62, 1], [58, 0], [60, 0], [57, 1]], [0, -1, 2, 0, 3, -1, 2, 1]),
    stage: makeSong(0.13, [[64, 1], [60, 0], [67, 0], [62, 0]], [0, 2, 3, 2, 0, 2, 3, 1]),
    boss: makeSong(0.11, [[57, 1], [57, 1], [58, 0], [56, 0]], [0, 0, 3, 0, 2, 0, 3, 1]),
  };
  function schedule() {
    const s = bgm.song;
    if (!s) return;
    while (bgm.next < ac.currentTime + 0.25) {
      const i = bgm.step % s.lead.length;
      const d = bgm.next - ac.currentTime;
      if (s.lead[i]) tone(midi(s.lead[i]), s.tempo * 0.85, 'square', 0.06, 0, d);
      if (s.bass[i]) tone(midi(s.bass[i]), s.tempo * 1.6, 'triangle', 0.14, 0, d);
      bgm.next += s.tempo;
      bgm.step++;
    }
  }
  function music(name) {
    pending = name;
    if (!ac) return;
    bgm.song = name ? SONGS[name] : null;
    bgm.step = 0;
    bgm.next = ac.currentTime + 0.05;
    if (!bgm.timer) {
      bgm.timer = setInterval(() => {
        if (!ac) return;
        if (muted || !bgm.song || document.hidden) { bgm.next = ac.currentTime + 0.05; return; }
        schedule();
      }, 60);
    }
  }

  G.Audio = {
    init, music,
    play(name) {
      if (!ac || muted) return;
      const now = performance.now();
      if (last[name] && now - last[name] < 35) return;
      last[name] = now;
      try { SFX[name] && SFX[name](); } catch (e) { /* ignore */ }
    },
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
})();
