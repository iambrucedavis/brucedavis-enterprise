/* lab/maestro.js — Maestro (Drop 05)
   Conduct an ensemble with your hands and your voice.
   Six sustained voices play a pentatonic chord. Sweep a hand across
   them to balance the section; raise it for forte, lower it for piano;
   close a fist to damp. Hum or sing and a lead voice joins the ensemble.
   Webcam + MediaPipe hand tracking, microphone for the voice layer —
   both read on-device, never recorded, never uploaded. */

const MP_VER = '0.10.14';
const MP_ESM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/* C major pentatonic — always consonant, in any balance */
const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
const REACH = 0.26;          /* conducting-field half-width, in screen widths */

export function launchMaestro(stage, opts = {}) {
  const isSoundOn = () => !!(opts.isSoundOn && opts.isSoundOn());

  /* ── DOM ─────────────────────────────────── */
  const el = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
  const video = el('video', 'mae-video');
  video.playsInline = true; video.muted = true;
  const canvas = el('canvas', 'mae-canvas');
  stage.append(video, canvas);
  const ctx = canvas.getContext('2d');

  const readout = el('div', 'mae-readout');
  readout.innerHTML =
    '<div class="mae-hint">starting…</div>'
    + '<div class="mae-legend"><span>sweep — balance</span><span>raise — forte</span>'
    + '<span>fist — damp</span><span>hum — lead voice</span></div>';
  stage.appendChild(readout);
  const hintEl = readout.querySelector('.mae-hint');

  const cta = el('div', 'mae-cta');
  cta.hidden = true;
  cta.innerHTML =
    '<p class="mae-cta-line">This one you conduct.</p>'
    + '<p class="mae-cta-sub">Maestro needs your camera to follow your hands and your microphone '
    + 'to hear you hum. Both are read on your device and never leave it — nothing is recorded or '
    + 'uploaded. Meanwhile, here is the ensemble warming up.</p>'
    + '<button class="mae-cta-btn" type="button">Enable camera, mic &amp; play →</button>';
  stage.appendChild(cta);

  /* ── sizing ──────────────────────────────── */
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 1, H = 1, baseY = 1;
  function resize() {
    W = stage.clientWidth || 1;
    H = stage.clientHeight || 1;
    baseY = H * 0.82;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── state ───────────────────────────────── */
  let mode = 'init';                /* 'init' | 'tracking' | 'demo' */
  let stream = null, landmarker = null, raf = 0, lastVideoTime = -1;
  const coarse = window.matchMedia('(pointer:coarse)').matches;
  let hands = [];                   /* [{x,y,open}] in screen coords */
  let trails = [];                  /* conducting trails {x,y,age} */
  let energy = 0;                   /* overall motion → shimmer rate */
  let lastHandPos = null;
  let leadLevel = 0;                /* mic-driven lead voice 0..1 */
  let demoT = 0;

  /* the ensemble — one voice per scale degree */
  const voices = SCALE.map((freq, i) => ({
    freq,
    x: 0,                            /* set on layout */
    vol: 0,                          /* smoothed display + audio level */
    target: 0,
    pulse: Math.random() * 6.28,
  }));
  function layoutVoices() {
    const pad = W * 0.13;
    voices.forEach((v, i) => { v.x = pad + (i / (voices.length - 1)) * (W - pad * 2); });
  }
  layoutVoices();

  /* ── audio ───────────────────────────────── */
  let actx = null, master = null, lp = null, micAnalyser = null, micBuf = null;
  let lead = null, leadGain = null;
  let shimmer = 0;

  function buildAudio() {
    if (actx) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { actx = null; return; }

    master = actx.createGain(); master.gain.value = 0.0001;
    lp = actx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 1500; lp.Q.value = 0.5;

    /* a little space — short feedback delay */
    const delay = actx.createDelay(0.6);
    delay.delayTime.value = 0.33;
    const fb = actx.createGain(); fb.gain.value = 0.32;
    const wet = actx.createGain(); wet.gain.value = 0.26;
    master.connect(lp);
    lp.connect(actx.destination);
    lp.connect(delay); delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(actx.destination);

    /* six sustained ensemble voices — two detuned oscillators each */
    for (const v of voices) {
      const g = actx.createGain(); g.gain.value = 0.0001;
      for (const det of [-3, 3]) {
        const o = actx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = v.freq;
        o.detune.value = det;
        o.connect(g); o.start();
      }
      g.connect(master);
      v.gain = g;
    }

    /* the lead — joins when you hum */
    leadGain = actx.createGain(); leadGain.gain.value = 0.0001;
    lead = actx.createOscillator();
    lead.type = 'sawtooth';
    lead.frequency.value = SCALE[3] * 2;          /* an octave above the 5th */
    const leadLp = actx.createBiquadFilter();
    leadLp.type = 'lowpass'; leadLp.frequency.value = 2400;
    lead.connect(leadLp); leadLp.connect(leadGain); leadGain.connect(master);
    lead.start();
  }

  /* ── camera + mic + hand tracking ────────── */
  async function startMedia() {
    hintEl.textContent = 'asking for camera & mic…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      video.srcObject = new MediaStream(stream.getVideoTracks());
      await video.play();
      hintEl.textContent = 'loading hand tracking…';
      const { HandLandmarker, FilesetResolver } = await import(MP_ESM);
      const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 2,
      });
      buildAudio();
      if (actx) {
        const micSrc = actx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        micAnalyser = actx.createAnalyser();
        micAnalyser.fftSize = 1024;
        micAnalyser.smoothingTimeConstant = 0.7;
        micSrc.connect(micAnalyser);
        micBuf = new Float32Array(micAnalyser.fftSize);
      }
      cta.hidden = true;
      mode = 'tracking';
      hintEl.textContent = 'raise a hand — conduct the ensemble';
    } catch {
      mode = 'demo';
      cta.hidden = false;
      buildAudio();
      hintEl.textContent = coarse ? 'demo — Maestro is best on a desktop webcam' : 'demo — camera off';
    }
  }
  cta.querySelector('.mae-cta-btn').addEventListener('click', () => { cta.hidden = true; startMedia(); });

  const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function trackHands() {
    if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    let res;
    try { res = landmarker.detectForVideo(video, performance.now()); } catch { return; }
    const found = (res && res.landmarks) || [];
    hands = found.map((lm) => {
      const wrist = lm[0], palm = lm[9];
      const ext = (tip, pip) => D(lm[tip], wrist) > D(lm[pip], wrist) * 1.06;
      let open = 0;
      if (ext(8, 6)) open++; if (ext(12, 10)) open++; if (ext(16, 14)) open++; if (ext(20, 18)) open++;
      return { x: (1 - palm.x) * W, y: palm.y * H, open: open / 4 };
    });
  }

  /* ── demo loop (camera declined) ─────────── */
  function demoDrive(dt) {
    demoT += dt;
    hands = [
      { x: W * (0.32 + Math.sin(demoT * 0.55) * 0.2), y: H * (0.42 + Math.cos(demoT * 0.7) * 0.16), open: 0.85 },
      { x: W * (0.68 + Math.sin(demoT * 0.48 + 2) * 0.2), y: H * (0.46 + Math.cos(demoT * 0.62 + 1) * 0.16), open: 0.8 },
    ];
    leadLevel = Math.max(0, Math.sin(demoT * 0.4) * 0.5 + 0.1);
  }

  /* ── microphone → lead voice ─────────────── */
  function readMic() {
    if (!micAnalyser) return;
    micAnalyser.getFloatTimeDomainData(micBuf);
    let sum = 0;
    for (let i = 0; i < micBuf.length; i++) sum += micBuf[i] * micBuf[i];
    const rms = Math.sqrt(sum / micBuf.length);
    const lvl = Math.min(1, Math.max(0, (rms - 0.012) / 0.13));
    leadLevel += (lvl - leadLevel) * (lvl > leadLevel ? 0.45 : 0.1);
  }

  /* ── update ──────────────────────────────── */
  function update(dt) {
    if (mode === 'tracking') { trackHands(); readMic(); }
    else if (mode === 'demo') demoDrive(dt);

    /* motion energy → shimmer tempo */
    if (hands.length) {
      const h0 = hands[0];
      if (lastHandPos) {
        const sp = Math.hypot(h0.x - lastHandPos.x, h0.y - lastHandPos.y) / Math.max(dt, 0.001);
        energy += (Math.min(1, sp / 900) - energy) * 0.08;
      }
      lastHandPos = { x: h0.x, y: h0.y };
    } else {
      energy += (0 - energy) * 0.04;
      lastHandPos = null;
    }
    shimmer += dt * (0.7 + energy * 3.4);

    /* conducting trails */
    for (const h of hands) {
      if (h.open > 0.35) trails.push({ x: h.x, y: h.y, age: 0 });
    }
    for (const tr of trails) tr.age += dt;
    trails = trails.filter((tr) => tr.age < 0.6);
    if (trails.length > 90) trails.splice(0, trails.length - 90);

    /* each voice: balance from hand proximity × that hand's dynamic */
    const reachPx = W * REACH;
    for (const v of voices) {
      let target = 0;
      for (const h of hands) {
        const prox = Math.exp(-Math.pow((h.x - v.x) / reachPx, 2));
        const dyn = Math.min(1, Math.max(0, (baseY - h.y) / (baseY * 0.62)));
        target = Math.max(target, prox * dyn * h.open);
      }
      v.target = target;
      v.vol += (v.target - v.vol) * (v.target > v.vol ? 0.12 : 0.05);
      v.pulse += dt * (1.4 + v.vol * 2.2);
    }

    leadLevel += (0 - leadLevel) * 0.02;   /* gentle decay baseline */

    /* drive the audio graph */
    if (actx) {
      const t = actx.currentTime;
      if (actx.state === 'suspended' && isSoundOn()) actx.resume();
      const on = isSoundOn() ? 1 : 0;
      master.gain.setTargetAtTime(0.0001 + 0.62 * on, t, 0.1);
      for (const v of voices) {
        v.gain.gain.setTargetAtTime(0.0001 + v.vol * 0.16, t, 0.09);
      }
      /* hand height also opens the filter — brighter when forte */
      const avgVol = voices.reduce((s, v) => s + v.vol, 0) / voices.length;
      lp.frequency.setTargetAtTime(900 + avgVol * 3600, t, 0.12);
      leadGain.gain.setTargetAtTime(0.0001 + leadLevel * 0.12 * on, t, 0.08);
      if (lead) lead.detune.setTargetAtTime(Math.sin(shimmer * 5) * 14, t, 0.05);
    }
  }

  /* ── render ──────────────────────────────── */
  function drawVoice(v) {
    const h = 26 + v.vol * (baseY * 0.66);
    const w = Math.max(10, W * 0.026);
    const top = baseY - h;
    const glow = v.vol;

    /* the column */
    const grad = ctx.createLinearGradient(0, baseY, 0, top);
    grad.addColorStop(0, 'rgba(227,66,52,' + (0.05 + glow * 0.22).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(227,66,52,' + (0.12 + glow * 0.6).toFixed(3) + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(v.x - w / 2, top, w, h);

    /* the node — a struck orb at the top */
    const breathe = 1 + Math.sin(v.pulse) * 0.12 * v.vol;
    const r = (4 + glow * 11) * breathe;
    ctx.beginPath();
    ctx.arc(v.x, top, r, 0, 6.2832);
    ctx.fillStyle = glow > 0.04 ? '#E34234' : 'rgba(236,231,219,0.32)';
    ctx.shadowBlur = 8 + glow * 30;
    ctx.shadowColor = 'rgba(227,66,52,0.85)';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    /* baseline — the floor of the ensemble */
    ctx.beginPath();
    ctx.moveTo(0, baseY); ctx.lineTo(W, baseY);
    ctx.strokeStyle = 'rgba(236,231,219,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (const v of voices) drawVoice(v);

    /* lead voice — a shimmer band across the top */
    if (leadLevel > 0.02) {
      const y = H * 0.13;
      const amp = 6 + leadLevel * 30;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const yy = y + Math.sin(x * 0.035 + shimmer * 4) * amp * Math.sin(x / W * Math.PI);
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = 'rgba(227,66,52,' + (0.2 + leadLevel * 0.6).toFixed(3) + ')';
      ctx.lineWidth = 1.5 + leadLevel * 2;
      ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(227,66,52,0.7)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    /* conducting trails */
    for (const tr of trails) {
      const a = (1 - tr.age / 0.6) * 0.5;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 3, 0, 6.2832);
      ctx.fillStyle = 'rgba(227,66,52,' + a.toFixed(3) + ')';
      ctx.fill();
    }

    /* the conductor's hands */
    for (const h of hands) {
      const open = h.open;
      const rr = 16 + open * 26;
      ctx.beginPath();
      ctx.arc(h.x, h.y, rr, 0, 6.2832);
      ctx.strokeStyle = open > 0.35 ? 'rgba(227,66,52,0.9)' : 'rgba(236,231,219,0.4)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = open > 0.35 ? 16 : 0;
      ctx.shadowColor = 'rgba(227,66,52,0.7)';
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3, 0, 6.2832);
      ctx.fillStyle = '#E34234';
      ctx.fill();
    }
  }

  /* ── loop ────────────────────────────────── */
  let last = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
  }
  raf = requestAnimationFrame(loop);

  /* show the CTA once layout is ready */
  mode = 'demo';
  cta.hidden = false;
  hintEl.textContent = 'demo — the ensemble, warming up';

  /* ── dispose ─────────────────────────────── */
  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (landmarker) { try { landmarker.close(); } catch { /* ok */ } }
      if (stream) { for (const tr of stream.getTracks()) tr.stop(); }
      if (actx) { try { actx.close(); } catch { /* ok */ } }
      video.remove(); canvas.remove(); readout.remove(); cta.remove();
    },
  };
}
