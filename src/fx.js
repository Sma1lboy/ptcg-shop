// Opening-mat feedback: synthesized sound (WebAudio, unlocked by a user gesture), hit bursts, holo tilt.
// Pure presentation: never reads game state, never influences what a pack contains.
(function (g) {
  const reduced = () => g.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ctx = null, muted = false;
  try { muted = localStorage.getItem('ptcg.mute') === '1'; } catch (e) { /* storage blocked: sound stays on */ }

  // Must be called synchronously from a click/key handler; timers later can't create a running context.
  function unlock() {
    if (muted) return;
    const A = g.AudioContext || g.webkitAudioContext; if (!A) return;
    ctx ||= new A();
    if (ctx.state === 'suspended') ctx.resume();
  }
  const live = () => (!muted && ctx && ctx.state === 'running' ? ctx : null);

  function tone(f, at, dur, { type = 'sine', gain = .12, to } = {}) {
    const c = live(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), v = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(gain, t + .01); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v).connect(c.destination); o.start(t); o.stop(t + dur + .02);
  }
  function noise(at, dur, { gain = .1, from = 2000, to = 600, q = 1 } = {}) {
    const c = live(); if (!c) return;
    const t = c.currentTime + at, len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(gain, t + Math.min(.02, dur / 3)); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(v).connect(c.destination); s.start(t);
  }

  const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;
  const arp = (notes, step, o) => notes.forEach((f, i) => tone(f, i * step, .5, o));

  // t = rarity tier from ui.js (0 bulk … 5 SIR/HR)
  function flip(t) {
    noise(0, .09, { gain: .11, from: 2600, to: 700 });
    if (t === 1) tone(A5, .03, .25, { type: 'triangle', gain: .05 });
    if (t === 2) { tone(A5, 0, .5, { gain: .09 }); tone(E6, .09, .6, { gain: .08 }); }
    if (t === 3) { arp([C5, E5, G5, C6], .07, { type: 'triangle', gain: .1 }); noise(.1, .5, { gain: .05, from: 5000, to: 9000 }); }
    if (t >= 4) {
      arp([C5, E5, G5, C6, E6].concat(t === 5 ? [G6] : []), .075, { type: 'triangle', gain: .11 });
      tone(70, 0, .5, { gain: .25, to: 38 });
      noise(.05, .9, { gain: .07, from: 4000, to: 11000 });
      if (t === 5) [C6, E6, G6].forEach(f => tone(f, .5, 1.4, { gain: .06 }));
    }
  }
  const tear = () => { noise(0, .3, { gain: .16, from: 3200, to: 900, q: .7 }); noise(.05, .12, { gain: .12, from: 6000, to: 2000 }); };
  const swell = ms => noise(0, ms / 1000, { gain: .06, from: 300, to: 3500, q: 2 }); // rising hiss under the slow last flip
  const crinkle = () => noise(0, .04 + Math.random() * .05, { gain: .06, from: 3500 + Math.random() * 3500, to: 1400, q: .8 }); // foil giving way under a drag
  const slide = () => noise(0, .14, { gain: .035, from: 1600, to: 4200, q: 1.3 }); // card sliding off the stack
  const miss = () => { tone(330, 0, .35, { type: 'sawtooth', gain: .05, to: 220 }); tone(247, .3, .5, { type: 'sawtooth', gain: .05, to: 150 }); };

  // Sparkles fly out of `host` (must be position: relative); rays behind the card from tier 4.
  function burst(host, t) {
    if (t < 2 || reduced() || !host) return;
    const b = document.createElement('div'); b.className = `fx-burst b${t}`;
    if (t >= 4) b.innerHTML = '<i class="rays"></i>';
    const n = [0, 0, 10, 16, 28, 40][t];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * (60 + t * 28);
      const s = document.createElement('span');
      s.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--s:${(3 + Math.random() * (2 + t)).toFixed(1)}px;--t:${(Math.random() * 160).toFixed(0)}ms`;
      b.append(s);
    }
    host.prepend(b);
    if (t >= 3) { host.classList.add('fx-shake'); setTimeout(() => host.classList.remove('fx-shake'), 500); }
    setTimeout(() => b.remove(), 1900);
  }

  // Holo tilt on the inspected card: sets --rx/--ry (rotation) and --mx/--my (sheen position).
  const tilting = e => e.target.closest && e.target.closest('.stage .card.up');
  document.addEventListener('pointermove', e => {
    const c = tilting(e); if (!c || reduced()) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty('--ry', ((x - .5) * 24).toFixed(1) + 'deg'); c.style.setProperty('--rx', ((.5 - y) * 24).toFixed(1) + 'deg');
    c.style.setProperty('--mx', (x * 100).toFixed(0) + '%'); c.style.setProperty('--my', (y * 100).toFixed(0) + '%');
  });
  document.addEventListener('pointerout', e => {
    const c = tilting(e); if (!c || c.contains(e.relatedTarget)) return;
    ['--rx', '--ry', '--mx', '--my'].forEach(p => c.style.removeProperty(p));
  });

  g.PTCG_FX = {
    unlock, flip, tear, swell, miss, burst, crinkle, slide,
    muted: () => muted,
    setMuted(v) { muted = !!v; try { localStorage.setItem('ptcg.mute', v ? '1' : '0'); } catch (e) { /* ignore */ } if (!v) unlock(); },
  };
})(window);
