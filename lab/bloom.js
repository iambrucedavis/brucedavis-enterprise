/* lab/bloom.js — Bloom (Drop 04)
   Sing, hum, or whisper — watch your sound grow into a garden.
   The microphone is read on-device for loudness and rough pitch:
   sustained sound grows a stem, silence sets a flower, a new sprout
   begins. Audio is analysed locally and never leaves the device. */

const STORE = 'lab.bloom.v1';
const GATE = 0.055;          /* level below this counts as silence */
const SETTLE = 0.7;          /* seconds of quiet before a plant blooms */
const GROW_RATE = 178;       /* px/sec of stem at full voice */
const PLANT_CAP = 16;        /* oldest plants fade out past this */

export function launchBloom(stage, opts = {}) {
  const isSoundOn = () => !!(opts.isSoundOn && opts.isSoundOn());

  /* ── DOM ─────────────────────────────────── */
  const el = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
  const canvas = el('canvas', 'bloom-canvas');
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const score = el('div', 'bloom-score');
  stage.appendChild(score);

  const readout = el('div', 'bloom-readout');
  readout.innerHTML =
    '<div class="bloom-hint">listening…</div>'
    + '<div class="bloom-meter"><span class="bloom-meter-fill"></span></div>';
  stage.appendChild(readout);
  const hintEl = readout.querySelector('.bloom-hint');
  const meterFill = readout.querySelector('.bloom-meter-fill');

  const cta = el('div', 'bloom-cta');
  cta.innerHTML =
    '<p class="bloom-cta-line">This one grows from your voice.</p>'
    + '<p class="bloom-cta-sub">Bloom listens through your microphone — sing, hum, or whisper, '
    + 'and a garden grows from the sound. The audio is analysed on your device and never leaves it; '
    + 'nothing is recorded or uploaded.</p>'
    + '<button class="bloom-cta-btn" type="button">Enable microphone &amp; play →</button>';
  stage.appendChild(cta);
  const ctaBtn = cta.querySelector('.bloom-cta-btn');

  /* ── sizing ──────────────────────────────── */
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 1, H = 1, soilY = 1;
  function resize() {
    W = stage.clientWidth || 1;
    H = stage.clientHeight || 1;
    soilY = H - Math.max(46, H * 0.085);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── state ───────────────────────────────── */
  let mode = 'cta';                 /* 'cta' | 'live' | 'fallback' */
  let store = load();
  let plants = [];                  /* settled + growing */
  let active = null;                /* the plant currently growing */
  let motes = [];
  let bursts = [];                  /* flower-firework celebration bursts */
  let level = 0, levelSmooth = 0;    /* 0..1 loudness */
  let bright = 0.5;                 /* 0..1 spectral-centroid pitch proxy */
  let silence = SETTLE;             /* seconds of quiet so far */
  let plantCount = 0;
  let t = 0;
  let audioCtx = null, analyser = null, micStream = null, micSource = null;
  let timeBuf = null, freqBuf = null, chimeGain = null;

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || { flowers: 0 }; } catch { return { flowers: 0 }; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { /* private mode */ } }
  function renderScore() { score.innerHTML = '✿ <b>' + store.flowers + '</b> in bloom'; }
  renderScore();

  /* ── a plant ─────────────────────────────── */
  function newPlant(seeded) {
    plantCount += 1;
    const margin = W * 0.1;
    const x = margin + ((plantCount * 0.382) % 1) * (W - margin * 2);
    return {
      x, h: seeded ? 60 + Math.random() * (H * 0.4) : 0,
      maxH: H * 0.62 + Math.random() * H * 0.14,
      hue: seeded ? Math.random() : 0.5,    /* petal character */
      peak: 0, sway: Math.random() * 6.28, leanDir: Math.random() < 0.5 ? -1 : 1,
      bloom: null, age: 0, alpha: 1,
      leafAt: 0.4 + Math.random() * 0.2,
    };
  }
  function bloomPlant(p, celebrate = true) {
    if (p.bloom || p.h < 38) return;
    const petals = 4 + Math.round(bright * 5 + (p.peak > 0.6 ? 1 : 0));
    p.bloom = { petals, r: 13 + p.h * 0.07 + p.peak * 16, open: 0 };
    store.flowers += 1; save(); renderScore();
    if (celebrate) { spawnBurst(stemTop(p)); chime(p); }
  }

  /* a flower-firework — a bright pop of petals, sparks and a ring */
  function spawnBurst(at) {
    const parts = [];
    const n = 30;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * 6.2832 + Math.random() * 0.4;
      const spd = 150 + Math.random() * 250;
      const petal = i % 2 === 0;            /* half petals, half spark glints */
      parts.push({
        x: at.x, y: at.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 80,        /* an upward kick */
        age: 0, life: 0.95 + Math.random() * 0.8,
        size: petal ? 3.5 + Math.random() * 4.5 : 1.8 + Math.random() * 2.4,
        kind: petal ? 'petal' : 'spark',
        rot: Math.random() * 6.2832,
        spin: (Math.random() - 0.5) * 11,
        tint: Math.random(),
      });
    }
    bursts.push({ x: at.x, y: at.y, ring: 0, parts });
  }

  /* ── seed a quiet demo garden behind the CTA ── */
  for (let i = 0; i < 6; i++) {
    const p = newPlant(true);
    p.peak = 0.5 + Math.random() * 0.4;
    bloomPlant(p, false);   /* demo blooms are silent — no chime or firework while seeding */
    if (p.bloom) p.bloom.open = 1;
    p.demo = true;
    plants.push(p);
  }
  store.flowers -= plants.length;   /* demo blooms don't count */
  if (store.flowers < 0) store.flowers = 0;
  renderScore();

  for (let i = 0; i < 22; i++) {
    motes.push({ x: Math.random() * W, y: Math.random() * H, vy: -4 - Math.random() * 9,
      drift: Math.random() * 6.28, r: 0.6 + Math.random() * 1.7 });
  }

  /* ── audio ───────────────────────────────── */
  async function enableMic() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      mode = 'fallback';
      cta.innerHTML = '<p class="bloom-cta-line">No microphone</p>'
        + '<p class="bloom-cta-sub">Bloom needs a microphone to grow. '
        + 'Allow microphone access and re-open the exhibit to play.</p>';
      return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try { await audioCtx.resume(); } catch { /* ok */ }
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    micSource = audioCtx.createMediaStreamSource(micStream);
    micSource.connect(analyser);
    timeBuf = new Float32Array(analyser.fftSize);
    freqBuf = new Float32Array(analyser.frequencyBinCount);
    chimeGain = audioCtx.createGain();
    chimeGain.gain.value = 0.5;
    chimeGain.connect(audioCtx.destination);

    /* the demo garden becomes the visitor's starting garden */
    for (const p of plants) p.demo = false;
    active = newPlant(false);
    plants.push(active);
    mode = 'live';
    cta.classList.add('is-gone');
    hintEl.textContent = 'make a sound — a stem will grow';
  }
  ctaBtn.addEventListener('click', enableMic);

  /* a cheery rising chime when a flower opens — a little major arpeggio */
  function chime(p) {
    if (!audioCtx || !isSoundOn() || mode !== 'live') return;
    const base = 440 * Math.pow(2, Math.round(bright * 3) / 12);  /* A4 up the scale */
    /* root · third · fifth · octave · a high sparkle */
    [0, 4, 7, 12, 12].forEach((semi, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = i >= 3 ? 'triangle' : 'sine';
      o.frequency.value = base * Math.pow(2, semi / 12) * (i === 4 ? 1.5 : 1);
      const t0 = audioCtx.currentTime + i * 0.07;
      const peak = i >= 3 ? 0.08 : 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
      o.connect(g); g.connect(chimeGain);
      o.start(t0); o.stop(t0 + 0.95);
    });
  }

  /* ── audio analysis ──────────────────────── */
  function readAudio() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
    const rms = Math.sqrt(sum / timeBuf.length);
    level = Math.min(1, Math.max(0, (rms - 0.008) / 0.11));

    analyser.getFloatFrequencyData(freqBuf);
    let wsum = 0, msum = 0;
    for (let i = 2; i < freqBuf.length; i++) {
      const m = Math.max(0, freqBuf[i] + 110);   /* dB → positive weight */
      wsum += i * m; msum += m;
    }
    if (msum > 0) {
      const centroid = (wsum / msum) / freqBuf.length;   /* 0..1 */
      bright += (Math.min(1, centroid * 3.2) - bright) * 0.08;
    }
  }

  /* ── update ──────────────────────────────── */
  function update(dt) {
    t += dt;
    if (mode === 'live') readAudio();

    levelSmooth += (level - levelSmooth) * (level > levelSmooth ? 0.4 : 0.12);
    meterFill.style.transform = 'scaleX(' + levelSmooth.toFixed(3) + ')';

    if (mode === 'live' && active) {
      if (level > GATE) {
        silence = 0;
        active.h = Math.min(active.maxH, active.h + level * GROW_RATE * dt);
        active.peak = Math.max(active.peak, level);
        active.hue = active.hue * 0.96 + bright * 0.04;
        if (active.h > 80 && hintEl.textContent.indexOf('quiet') === -1) {
          hintEl.textContent = 'go quiet — let it flower';
        }
      } else {
        silence += dt;
        if (silence > SETTLE && active.h > 38) {
          bloomPlant(active);
          active = newPlant(false);
          plants.push(active);
          hintEl.textContent = 'make a sound — a new stem will grow';
        }
      }
    }

    /* settle/age plants, fade the oldest out */
    for (const p of plants) {
      p.age += dt;
      p.sway += dt * (0.6 + p.peak * 0.7);
      if (p.bloom && p.bloom.open < 1) p.bloom.open = Math.min(1, p.bloom.open + dt * 1.7);
    }
    const settled = plants.filter((p) => p !== active);
    if (settled.length > PLANT_CAP) {
      const doomed = settled.slice(0, settled.length - PLANT_CAP);
      for (const p of doomed) p.fading = true;
    }
    for (const p of plants) {
      if (p.fading) p.alpha -= dt * 0.6;
    }
    plants = plants.filter((p) => p.alpha > 0.02);

    /* pollen motes */
    for (const m of motes) {
      m.y += m.vy * dt;
      m.drift += dt;
      m.x += Math.sin(m.drift) * 7 * dt;
      if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
    }

    /* flower-firework bursts */
    for (const b of bursts) {
      b.ring += dt;
      for (const pt of b.parts) {
        pt.age += dt;
        pt.vy += 190 * dt;          /* gravity */
        pt.vx *= 0.992;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.rot += pt.spin * dt;
      }
    }
    bursts = bursts.filter((b) => b.ring < 0.55 || b.parts.some((pt) => pt.age < pt.life));
  }

  /* ── render ──────────────────────────────── */
  function stemTop(p) {
    const lean = p.leanDir * (8 + p.h * 0.06) * Math.sin(p.sway * 0.6);
    return { x: p.x + lean, y: soilY - p.h };
  }

  function drawPlant(p) {
    const top = stemTop(p);
    const midX = (p.x + top.x) / 2 + p.leanDir * 6;
    const midY = soilY - p.h * 0.5;
    ctx.globalAlpha = p.alpha;

    /* stem */
    ctx.beginPath();
    ctx.moveTo(p.x, soilY);
    ctx.quadraticCurveTo(midX, midY, top.x, top.y);
    ctx.strokeStyle = 'rgba(236,231,219,0.82)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.stroke();

    /* a leaf */
    if (p.h > 70) {
      const lx = p.x + (midX - p.x) * p.leafAt;
      const ly = soilY - p.h * p.leafAt;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(p.leanDir * (0.5 + Math.sin(p.sway) * 0.12));
      ctx.beginPath();
      ctx.ellipse(p.leanDir * 11, 0, 12, 5, 0, 0, 6.2832);
      ctx.fillStyle = 'rgba(236,231,219,0.5)';
      ctx.fill();
      ctx.restore();
    }

    if (p.bloom) {
      drawBloom(top.x, top.y, p);
    } else if (p === active) {
      /* growing bud — glows with the voice */
      const pulse = 3.4 + levelSmooth * 7;
      ctx.beginPath();
      ctx.arc(top.x, top.y, pulse, 0, 6.2832);
      ctx.fillStyle = '#E34234';
      ctx.shadowBlur = 16 + levelSmooth * 26;
      ctx.shadowColor = 'rgba(227,66,52,0.9)';
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function drawBloom(x, y, p) {
    const b = p.bloom;
    const ease = b.open < 1 ? 1 - Math.pow(1 - b.open, 3) : 1;
    const r = b.r * ease;
    const breathe = 1 + Math.sin(p.sway * 0.8) * 0.04;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.sway * 0.05);
    ctx.shadowBlur = 14; ctx.shadowColor = 'rgba(227,66,52,0.5)';
    /* petals */
    for (let i = 0; i < b.petals; i++) {
      ctx.save();
      ctx.rotate((i / b.petals) * 6.2832);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.62 * breathe, r * 0.34, r * 0.62 * breathe, 0, 0, 6.2832);
      ctx.fillStyle = '#E34234';
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    /* core */
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, 6.2832);
    ctx.fillStyle = '#ECE7DB';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, 6.2832);
    ctx.fillStyle = 'rgba(11,11,11,0.55)';
    ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    /* soil glow */
    const g = ctx.createLinearGradient(0, soilY - 60, 0, H);
    g.addColorStop(0, 'rgba(227,66,52,0)');
    g.addColorStop(1, 'rgba(227,66,52,0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(0, soilY - 60, W, H - soilY + 60);
    ctx.beginPath();
    ctx.moveTo(0, soilY); ctx.lineTo(W, soilY);
    ctx.strokeStyle = 'rgba(236,231,219,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* motes */
    for (const m of motes) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, 6.2832);
      ctx.fillStyle = 'rgba(227,66,52,0.34)';
      ctx.fill();
    }

    /* plants — settled behind, active last */
    const ordered = plants.slice().sort((a, b) => (a === active ? 1 : 0) - (b === active ? 1 : 0));
    for (const p of ordered) drawPlant(p);

    /* flower-firework bursts — on top of everything */
    for (const b of bursts) {
      /* a brief white-hot pop */
      if (b.ring < 0.18) {
        const fk = 1 - b.ring / 0.18;
        ctx.globalAlpha = fk;
        ctx.fillStyle = '#FFF4F1';
        ctx.shadowBlur = 30 * fk;
        ctx.shadowColor = 'rgba(227,66,52,0.95)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5 + fk * 17, 0, 6.2832);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      /* an expanding ring */
      if (b.ring < 0.55) {
        const rk = b.ring / 0.55;
        ctx.globalAlpha = (1 - rk) * 0.7;
        ctx.strokeStyle = '#FBDED9';
        ctx.lineWidth = 2.5 * (1 - rk);
        ctx.beginPath();
        ctx.arc(b.x, b.y, 8 + rk * 62, 0, 6.2832);
        ctx.stroke();
      }
      for (const pt of b.parts) {
        const k = pt.age / pt.life;
        if (k >= 1) continue;
        const fade = 1 - k;
        ctx.globalAlpha = Math.min(1, fade * 1.7);
        ctx.fillStyle = pt.tint < 0.4 ? '#E34234'
          : pt.tint < 0.62 ? '#EF7E6B'
            : pt.tint < 0.82 ? '#FBDED9' : '#ECE7DB';
        ctx.shadowBlur = 14 * fade;
        ctx.shadowColor = 'rgba(227,66,52,0.85)';
        if (pt.kind === 'petal') {
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, pt.size, pt.size * 0.5, 0, 0, 6.2832);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, 6.2832);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /* ── loop ────────────────────────────────── */
  let raf = 0, last = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
  }
  raf = requestAnimationFrame(loop);

  /* ── dispose ─────────────────────────────── */
  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (micStream) { for (const tr of micStream.getTracks()) tr.stop(); }
      if (audioCtx) { try { audioCtx.close(); } catch { /* ok */ } }
      canvas.remove(); score.remove(); readout.remove(); cta.remove();
    },
  };
}
