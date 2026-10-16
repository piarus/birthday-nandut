(() => {
  "use strict";

  const body   = document.body;
  const pages  = document.getElementById("pages");
  const slides = [...document.querySelectorAll(".slide")];
  const links  = [...document.querySelectorAll(".nav a")];
  const next   = document.getElementById("next");
  const gift   = document.getElementById("gift");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const OPEN_DELAY = 2000;   // delay (ms) when the gift is "opened" before moving to the Cover page

  const idx = id => slides.findIndex(s => s.id === id);
  const IDX_COVER   = idx("cover");
  const IDX_VIDEO   = idx("video");
  const IDX_CLOSING = idx("closing");   // -1 if the Closing page is disabled

  let current = 0, opened = false, opening = false;

  /* ---------- Navigation ---------- */
  const go = i => {
    const n = Math.max(0, Math.min(i, slides.length - 1));
    slides[n].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };
  const isLocked = () => body.classList.contains("is-locked");

  next.addEventListener("click", () => go(current === slides.length - 1 ? IDX_COVER : current + 1));

  links.forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    go(slides.findIndex(s => "#" + s.id === a.hash));
  }));

  const NAV_KEYS = ["ArrowDown", "ArrowRight", "PageDown", "ArrowUp", "ArrowLeft", "PageUp", "Home", "End"];
  window.addEventListener("keydown", e => {
    if (isLocked()) { if (NAV_KEYS.includes(e.key)) e.preventDefault(); return; }
    const k = e.key;
    if (["ArrowDown", "ArrowRight", "PageDown"].includes(k)) { e.preventDefault(); go(current + 1); }
    else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(k))  { e.preventDefault(); go(current - 1); }
    else if (k === "Home") { e.preventDefault(); go(0); }
    else if (k === "End")  { e.preventDefault(); go(slides.length - 1); }
  });

  /* ---------- Wait for all images to load before the gift can be opened ---------- */
  const giftText = document.getElementById("gift-text");
  const imgs = [...document.images];
  let loaded = 0;
  const tickLoad = () => { giftText.textContent = `Memuat hadiah... ${Math.round(++loaded / imgs.length * 100)}%`; };

  Promise.all(imgs.map(img => {
    const done = img.complete
      ? Promise.resolve()
      : new Promise(res => { img.addEventListener("load", res, { once: true }); img.addEventListener("error", res, { once: true }); });
    return done.then(() => (img.decode ? img.decode().catch(() => {}) : null)).then(tickLoad);
  })).then(() => {
    giftText.textContent = "Special Gift For Special Person";
    gift.disabled = false;
    gift.removeAttribute("aria-busy");
  });

  /* ---------- Page 1: open the gift ---------- */
  gift.addEventListener("click", () => {
    if (opening) return;
    if (opened) { go(IDX_COVER); return; }

    opening = true;
    gift.classList.add("is-opening");      // animasi kotak hadiah (sama seperti hover)
    body.classList.add("is-waiting");

    setTimeout(() => {
      opened = true; opening = false;
      body.classList.remove("is-locked", "is-waiting");
      gift.classList.remove("is-opening");
      burstFromTop();
      go(IDX_COVER);
    }, OPEN_DELAY);
  });

  /* ---------- Currently displayed page ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) setCurrent(slides.indexOf(en.target)); });
  }, { root: pages, threshold: 0.6 });
  slides.forEach(s => io.observe(s));

  function setCurrent(i) {
    if (isLocked() && i !== 0) { pages.scrollTop = 0; return; }   // pengaman: hadiah belum dibuka
    if (i < 0 || i === current) return;
    const prev = current;
    current = i;

    body.classList.toggle("at-landing", i === 0);
    links.forEach(a => {
      const on = a.hash === "#" + slides[i].id;
      a.classList.toggle("is-active", on);
      on ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current");
    });

    const last = i === slides.length - 1;
    next.classList.toggle("is-last", last);
    next.setAttribute("aria-label", last ? "Kembali ke Cover" : "Halaman berikutnya");

    if (i === IDX_VIDEO) playClip(); else pauseClip();
    if (IDX_CLOSING >= 0 && i === IDX_CLOSING && prev !== IDX_CLOSING) burstFromTop();
  }

  /* ---------- Video story ---------- */
  const clip  = document.getElementById("clip");
  const sound = document.getElementById("sound");
  const bars  = [...document.querySelectorAll(".story-ui .bar")];
  const BAR_W = 89;
  let barIdx = 0;

  const paintBars = () => {
    const p = clip.duration ? clip.currentTime / clip.duration : 0;
    bars.forEach((b, n) => {
      const frac = n < barIdx ? 1 : n === barIdx ? p : 0;
      b.setAttribute("width", (frac * BAR_W).toFixed(1));
    });
  };

  function playClip()  { const p = clip.play(); if (p && p.catch) p.catch(() => {}); }
  function pauseClip() { clip.pause(); }

  clip.loop = false;
  clip.addEventListener("timeupdate", paintBars);
  clip.addEventListener("ended", () => {
    barIdx = (barIdx + 1) % bars.length;
    clip.currentTime = 0;
    paintBars();
    playClip();
  });
  // If assets/video.mp4 is not available, use the default static design frame
  clip.addEventListener("error", () => document.getElementById("video").classList.add("no-video"));

  sound.addEventListener("click", () => {
    clip.muted = !clip.muted;
    sound.setAttribute("aria-pressed", String(!clip.muted));
    sound.setAttribute("aria-label", clip.muted ? "Nyalakan suara" : "Matikan suara");
    if (clip.paused && current === IDX_VIDEO) playClip();
  });

  /* ---------- Confetti (appears when the gift is opened) ---------- */
  const canvas = document.getElementById("confetti");
  const ctx = canvas.getContext("2d");
  const COLORS = ["#f06a92", "#f7b6c8", "#ffc23d", "#17b3a8", "#fbe3c2", "#4aa8ff", "#ffffff"];
  let parts = [], raf = 0;

  function fit() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * d; canvas.height = innerHeight * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  fit(); addEventListener("resize", fit);

  const rnd = (a, b) => a + Math.random() * (b - a);
  const make = (x, y, vx, vy) => ({
    x, y, vx, vy, w: rnd(6, 11), h: rnd(4, 8), r: rnd(0, 6.28), vr: rnd(-.2, .2),
    c: COLORS[(Math.random() * COLORS.length) | 0], round: Math.random() < .25, life: 0
  });

  function burstFromTop() {
    if (reduceMotion) return;
    for (let i = 0; i < 130; i++) parts.push(make(rnd(0, innerWidth), rnd(-80, -10), rnd(-1.2, 1.2), rnd(2, 5)));
    run();
  }
  function burstAt(x, y) {
    if (reduceMotion) return;
    for (let i = 0; i < 70; i++) {
      const a = rnd(-Math.PI * .95, -Math.PI * .05), s = rnd(4, 11);
      parts.push(make(x, y, Math.cos(a) * s, Math.sin(a) * s));
    }
    run();
  }
  function run() { if (!raf) raf = requestAnimationFrame(tick); }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.y < innerHeight + 30 && p.life < 420);
    for (const p of parts) {
      p.life++; p.vy += .12; p.vx *= .995; p.vy *= .995;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, 6.28); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!parts.length) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  // Ketuk halaman Closing untuk confetti lagi (hanya jika Closing diaktifkan)
  const closingEl = document.getElementById("closing");
  if (closingEl) closingEl.addEventListener("pointerdown", e => burstAt(e.clientX, e.clientY));

  pages.focus({ preventScroll: true });
})();
