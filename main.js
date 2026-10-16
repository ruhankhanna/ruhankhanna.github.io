(() => {
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const darkMQ = matchMedia("(prefers-color-scheme: dark)");
  const $ = (s, r = document) => r.querySelector(s);

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = (s) => {
    if (!isFinite(s)) return "--";
    const m = Math.floor(s / 60), r = s - m * 60;
    return m ? `${m}:${r.toFixed(1).padStart(4, "0")}` : r.toFixed(1);
  };

  // Charts draw at their real pixel width so labels stay at a true 12px on every screen.
  function responsive(svg, height, draw) {
    let w = 0;
    const run = () => {
      const nw = Math.round(svg.getBoundingClientRect().width);
      if (!nw) return;
      w = nw;
      const h = typeof height === "function" ? height(w) : height;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("height", h);
      draw(w, h);
    };
    new ResizeObserver(() => { if (Math.round(svg.getBoundingClientRect().width) !== w) run(); }).observe(svg);
    darkMQ.addEventListener("change", run);
    run();
    return run;
  }
  const onVisible = (node, cb) => new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting)), { threshold: 0.15 }).observe(node);

  /* ---------- Nav: mark the section in view ---------- */
  (() => {
    const links = [...document.querySelectorAll(".nav nav a")];
    const owner = { athletiq: 0, secret: 1, meridian: 2, reachbot: 2, fellows: 2, indus: 3 };
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null, r = 0;
      seen.forEach((v, id) => { if (v > r) { r = v; best = id; } });
      links.forEach((a) => a.removeAttribute("aria-current"));
      if (best != null) links[owner[best]].setAttribute("aria-current", "true");
    }, { threshold: [0, 0.1, 0.3, 0.6], rootMargin: "-60px 0px -35% 0px" });
    Object.keys(owner).forEach((id) => { const n = document.getElementById(id); if (n) io.observe(n); });
  })();

  /* ---------- Hero screen deck ---------- */
  (() => {
    const deck = $("#deck");
    if (!deck) return;
    const slides = [...deck.querySelectorAll(".deck-slide")];
    const dots = [...deck.querySelectorAll(".deck-dots button")];
    const app = $("#deck-app"), route = $("#deck-route"), cap = $("#deck-cap");
    const MS = 5200;
    deck.style.setProperty("--deck-ms", `${MS}ms`);
    let i = 0, timer = null, hovering = false, visible = true;

    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle("is-on", k === i));
      dots.forEach((d, k) => (k === i ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
      const s = slides[i];
      app.textContent = s.dataset.app; route.textContent = s.dataset.route; cap.textContent = s.dataset.cap;
      const bar = dots[i].querySelector("i"); bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
    }
    function schedule() {
      clearTimeout(timer);
      const play = !reduceMotion && !hovering && visible && !document.hidden;
      deck.classList.toggle("playing", play);
      if (play) timer = setTimeout(() => { show(i + 1); schedule(); }, MS);
    }
    dots.forEach((d, k) => d.addEventListener("click", () => { show(k); schedule(); }));
    deck.addEventListener("pointerenter", () => { hovering = true; schedule(); });
    deck.addEventListener("pointerleave", () => { hovering = false; schedule(); });
    deck.addEventListener("focusin", () => { hovering = true; schedule(); });
    deck.addEventListener("focusout", () => { hovering = false; schedule(); });
    document.addEventListener("visibilitychange", schedule);
    onVisible(deck, (v) => { visible = v; schedule(); });
    show(0); schedule();
  })();

  /* ---------- athletIQ architecture (packets show data moving through the system) ---------- */
  (() => {
    const svg = $("#arch");
    if (!svg) return;
    let edges = [], raf = 0, running = false;
    const nodes = [
      ["src", "Athletic.net", "rankings, profiles"],
      ["scr", "Scraper service", "Selenium, retries"],
      ["app", "Flask app", "routes, jobs"],
      ["ana", "Analytics", "VDOT, forecasts"],
      ["db", "SQLite", "orgs, recruits, roster"],
      ["ui", "Coach app", "search, roster, intel"],
    ];
    const order = nodes.map((n) => n[0]);
    const links = [["src", "scr"], ["scr", "app"], ["app", "ana"], ["ana", "app"], ["app", "db"], ["app", "ui"]];

    responsive(svg, (w) => (w < 560 ? 6 * 74 : 236), (w) => {
      svg.innerHTML = "";
      const ink = css("--ink"), line = css("--line-strong"), acc = css("--accent"), bg = css("--panel-2"), muted = css("--muted");
      const pos = {};
      const vertical = w < 560;
      const nw = vertical ? Math.min(w - 40, 260) : Math.min(150, (w - 3 * 24) / 4), nh = 52;
      if (vertical) {
        nodes.forEach(([id], k) => { pos[id] = { x: 0, y: 4 + k * 74 }; });
      } else {
        const gap = (w - 4 * nw) / 3;
        const col = (c) => c * (nw + gap);
        pos.src = { x: col(0), y: 20 }; pos.scr = { x: col(1), y: 20 }; pos.app = { x: col(2), y: 20 }; pos.ana = { x: col(3), y: 20 };
        pos.db = { x: col(1), y: 160 }; pos.ui = { x: col(3), y: 160 };
      }
      const cx = (id) => pos[id].x + nw / 2, cy = (id) => pos[id].y + nh / 2;
      const gE = el("g", {}, svg), gP = el("g", {}, svg), gN = el("g", {}, svg);
      edges = [];
      links.forEach(([a, b], k) => {
        let d;
        if (vertical) {
          const ia = order.indexOf(a), ib = order.indexOf(b);
          if (ib < ia) return; // the return path is implied in the stacked layout
          d = ib - ia > 1
            ? `M${pos[a].x + nw},${cy(a)} H${pos[a].x + nw + 16 + (ib - ia) * 6} V${cy(b)} H${pos[b].x + nw}`
            : `M${cx(a)},${pos[a].y + nh} V${pos[b].y}`;
        } else if (a === "app" && b === "ana") d = `M${pos.app.x + nw},${cy("app") - 9} H${pos.ana.x}`;
        else if (a === "ana" && b === "app") d = `M${pos.ana.x},${cy("app") + 9} H${pos.app.x + nw}`;
        else if (a === "app" && b === "db") d = `M${cx("app") - 20},${pos.app.y + nh} V${cy("db")} H${pos.db.x + nw}`;
        else if (a === "app" && b === "ui") d = `M${cx("app") + 20},${pos.app.y + nh} V${cy("ui")} H${pos.ui.x}`;
        else d = `M${pos[a].x + nw},${cy(a)} H${pos[b].x}`;
        const p = el("path", { d, fill: "none", stroke: line, "stroke-width": 1.5 }, gE);
        edges.push({ p, len: p.getTotalLength(), off: k * 0.37, dots: [0, 1].map(() => el("circle", { r: 3.5, fill: acc, opacity: 0 }, gP)) });
      });
      nodes.forEach(([id, title, sub]) => {
        const { x, y } = pos[id];
        const hot = id === "app";
        el("rect", { x: x + 0.5, y: y + 0.5, width: nw - 1, height: nh - 1, rx: 8, fill: hot ? ink : bg, stroke: hot ? ink : line }, gN);
        el("text", { x: x + 12, y: y + 22, class: "lbl", style: hot ? `fill:${bg}` : "" }, gN).textContent = title;
        el("text", { x: x + 12, y: y + 39, class: "sub", style: hot ? `fill:${bg};opacity:.75` : `fill:${muted}` }, gN).textContent = sub;
      });
      if (!reduceMotion) paint(performance.now());
    });

    function paint(now) {
      const t = now / 2600;
      edges.forEach((e) => e.dots.forEach((c, j) => {
        const f = (t + e.off + j * 0.5) % 1;
        const pt = e.p.getPointAtLength(f * e.len);
        c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y);
        c.setAttribute("opacity", f < 0.08 ? f / 0.08 : f > 0.9 ? (1 - f) / 0.1 : 1);
      }));
    }
    function loop(now) { paint(now); if (running) raf = requestAnimationFrame(loop); }
    if (!reduceMotion) onVisible(svg, (v) => {
      if (v && !running) { running = true; raf = requestAnimationFrame(loop); }
      if (!v) { running = false; cancelAnimationFrame(raf); }
    });
  })();

  /* ---------- VDOT (Daniels), as in athletIQ performance_modeling.py ---------- */
  const VD = (() => {
    const vo2 = (v) => -4.60 + 0.182258 * v + 0.000104 * v * v;
    const pct = (tm) => 0.8 + 0.1894393 * Math.exp(-0.012778 * tm) + 0.2989558 * Math.exp(-0.1932605 * tm);
    const vdot = (dist, sec) => { const tm = sec / 60; return vo2(dist / tm) / pct(tm); };
    // VDOT falls as time rises, so bisection on time finds the matching mark.
    const timeFor = (dist, target) => {
      let lo = 30, hi = 3600;
      for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (vdot(dist, mid) > target) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    };
    return { vdot, timeFor };
  })();

  (() => {
    const ev = $("#v-event"), tIn = $("#v-time"), out = $("#v-out"), msg = $("#v-msg"), eq = $("#v-equiv");
    if (!ev) return;
    const events = [[800, "800m"], [1500, "1500m"], [1609.34, "Mile"], [3200, "3200m"], [5000, "5000m"]];
    const parse = (s) => {
      s = s.trim();
      if (!/^\d{1,2}:\d{1,2}(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return NaN;
      const parts = s.split(":");
      return parts.length === 2 ? +parts[0] * 60 + +parts[1] : +parts[0];
    };
    function run() {
      const d = +ev.value, sec = parse(tIn.value);
      if (!isFinite(sec) || sec <= 0) { msg.textContent = "Enter a time like 4:35.0 or 2:01.5."; tIn.setAttribute("aria-invalid", "true"); return; }
      const v = VD.vdot(d, sec);
      if (!isFinite(v) || v < 25 || v > 90) { msg.textContent = "That's outside the range the formula is fit for. Try a realistic mark."; tIn.setAttribute("aria-invalid", "true"); return; }
      tIn.removeAttribute("aria-invalid");
      out.textContent = v.toFixed(1);
      msg.textContent = v > 78 ? "World-class territory." : v > 69 ? "College varsity level." : v > 58 ? "A strong high school varsity runner." : "A developing runner.";
      eq.innerHTML = events.map(([dist, name]) =>
        `<div class="${Math.abs(dist - d) < 1 ? "self" : ""}"><dt>${name}</dt><dd>${fmt(VD.timeFor(dist, v))}</dd></div>`).join("");
    }
    ev.addEventListener("change", run);
    tIn.addEventListener("input", run);
    run();
  })();

  /* ---------- Banister fitness-fatigue lab ---------- */
  (() => {
    const svg = $("#ban-svg");
    if (!svg) return;
    const WEEKS = 16, DAYS = WEEKS * 7, MAXL = 70, BASE = 25;
    const PLANS = {
      steady: Array(WEEKS).fill(35),
      taper: [30, 32, 34, 36, 38, 40, 42, 44, 46, 46, 48, 48, 38, 30, 24, 20],
      over: [35, 38, 44, 52, 60, 64, 66, 64, 40, 34, 34, 34, 34, 34, 34, 34],
    };
    const load = PLANS.taper.slice();
    const T1 = 45, T2 = 11, K1 = 0.02, K2 = 0.06, MILE = 1609.34;

    // seeded normals so the band stays still while you drag
    function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const rand = rng(7), gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    const SAMPLES = Array.from({ length: 300 }, () => ({ t1: T1 * (1 + 0.12 * gauss()), t2: Math.max(4, T2 * (1 + 0.15 * gauss())), resp: 1 + 0.15 * gauss() }));

    // Impulse response as a recursive filter: each day decays yesterday's state and adds today's load.
    function simulate(t1, t2, resp) {
      const d1 = Math.exp(-1 / t1), d2 = Math.exp(-1 / t2);
      let fit = (BASE / 7) / (1 - d1), fat = (BASE / 7) / (1 - d2);
      const base = K1 * fit - K2 * fat;
      const perf = new Float64Array(DAYS), F = new Float64Array(DAYS), G = new Float64Array(DAYS);
      for (let d = 0; d < DAYS; d++) {
        const l = load[Math.floor(d / 7)] / 7;
        fit = fit * d1 + l; fat = fat * d2 + l;
        F[d] = K1 * fit; G[d] = K2 * fat;
        perf[d] = 62 + resp * (K1 * fit - K2 * fat - base);
      }
      return { perf, F, G };
    }

    let W = 560, H = 380;
    const bars = [];
    const M = { l: 44, r: 12 };
    const P = { t: 16, b: 168 }, Fz = { t: 190, b: 250 }, B = { t: 272, b: 350 };
    const sx = (d) => M.l + (d / (DAYS - 1)) * (W - M.l - M.r);
    const out = $("#ban-out");
    const gStatic = el("g", {}, svg), gDyn = el("g", {}, svg), gBars = el("g", {}, svg);

    function render() {
      const ink = css("--ink"), acc = css("--accent"), muted = css("--muted"), line = css("--line");
      gDyn.innerHTML = "";
      const main = simulate(T1, T2, 1);
      const mile = Array.from(main.perf, (v) => VD.timeFor(MILE, v));
      // Monte Carlo band: 10th to 90th percentile of the predicted mile each day
      const runs = SAMPLES.map((s) => simulate(s.t1, s.t2, s.resp).perf);
      const lo = [], hi = [];
      for (let d = 0; d < DAYS; d++) {
        const col = runs.map((p) => p[d]).sort((a, b) => a - b);
        lo.push(VD.timeFor(MILE, col[Math.floor(0.9 * col.length)]));
        hi.push(VD.timeFor(MILE, col[Math.floor(0.1 * col.length)]));
      }
      const all = lo.concat(hi, mile);
      let tMin = Math.min(...all), tMax = Math.max(...all);
      const pad = Math.max(1.5, (tMax - tMin) * 0.12); tMin -= pad; tMax += pad;
      const sy = (t) => P.t + ((t - tMin) / (tMax - tMin)) * (P.b - P.t);

      const step = (tMax - tMin) > 16 ? 5 : 2;
      for (let t = Math.ceil(tMin / step) * step; t <= tMax; t += step) {
        el("line", { x1: M.l, x2: W - M.r, y1: sy(t), y2: sy(t), stroke: line }, gDyn);
        el("text", { x: M.l - 6, y: sy(t) + 4, "text-anchor": "end" }, gDyn).textContent = fmt(t).replace(".0", "");
      }
      const band = lo.map((t, d) => `${sx(d)},${sy(t)}`).concat(hi.map((t, d) => `${sx(d)},${sy(t)}`).reverse()).join(" ");
      el("polygon", { points: band, fill: acc, "fill-opacity": 0.14 }, gDyn);
      el("polyline", { points: mile.map((t, d) => `${sx(d)},${sy(t)}`).join(" "), fill: "none", stroke: acc, "stroke-width": 2 }, gDyn);
      el("text", { x: M.l + 6, y: P.t + 12, class: "acc halo" }, gDyn).textContent = "predicted mile (faster is higher)";

      const fMax = Math.max(...main.F, ...main.G);
      const fy = (v) => Fz.b - (v / fMax) * (Fz.b - Fz.t);
      el("polyline", { points: Array.from(main.F, (v, d) => `${sx(d)},${fy(v)}`).join(" "), fill: "none", stroke: ink, "stroke-width": 1.5 }, gDyn);
      el("polyline", { points: Array.from(main.G, (v, d) => `${sx(d)},${fy(v)}`).join(" "), fill: "none", stroke: muted, "stroke-width": 1.5, "stroke-dasharray": "4 3" }, gDyn);
      el("text", { x: M.l + 6, y: Fz.t + 2, class: "ink" }, gDyn).textContent = "fitness";
      el("text", { x: M.l + 72, y: Fz.t + 2 }, gDyn).textContent = "fatigue (dashed)";

      const bw = (W - M.l - M.r) / WEEKS;
      bars.forEach((g, k) => {
        const h = (load[k] / MAXL) * (B.b - B.t);
        const rect = g.querySelector("rect.vis");
        rect.setAttribute("x", M.l + k * bw + 2); rect.setAttribute("width", Math.max(2, bw - 4));
        rect.setAttribute("y", B.b - h); rect.setAttribute("height", Math.max(1, h));
        rect.setAttribute("fill", ink); rect.setAttribute("fill-opacity", 0.8);
        const hit = g.querySelector("rect.hit");
        hit.setAttribute("x", M.l + k * bw); hit.setAttribute("width", bw); hit.setAttribute("y", B.t - 10); hit.setAttribute("height", B.b - B.t + 10);
        g.setAttribute("aria-valuenow", load[k]); g.setAttribute("aria-valuetext", `week ${k + 1}, ${load[k]} miles`);
      });

      let best = 0; mile.forEach((t, d) => { if (t < mile[best]) best = d; });
      let fatPeak = 0; main.G.forEach((v, d) => { if (v > main.G[fatPeak]) fatPeak = d; });
      const wk = (d) => Math.floor(d / 7) + 1;
      el("circle", { cx: sx(best), cy: sy(mile[best]), r: 4.5, fill: acc }, gDyn);
      out.innerHTML = `<b>Fastest predicted mile: ${fmt(mile[best])}</b> in week ${wk(best)}, likely range ${fmt(lo[best])} to ${fmt(hi[best])}. Fatigue peaks in week ${wk(fatPeak)}.`;
    }

    function drawStatic() {
      gStatic.innerHTML = "";
      const line = css("--line");
      el("line", { x1: M.l, x2: W - M.r, y1: B.b, y2: B.b, stroke: line }, gStatic);
      el("text", { x: M.l - 6, y: B.t + 8, "text-anchor": "end" }, gStatic).textContent = MAXL;
      el("text", { x: M.l - 6, y: B.b, "text-anchor": "end" }, gStatic).textContent = "0";
      el("text", { x: M.l + 6, y: B.t - 4 }, gStatic).textContent = "weekly miles";
      const bw = (W - M.l - M.r) / WEEKS;
      [1, 4, 8, 12, 16].forEach((wk) => {
        el("text", { x: M.l + (wk - 0.5) * bw, y: H - 6, "text-anchor": "middle" }, gStatic).textContent = `wk ${wk}`;
      });
    }

    const chips = [...document.querySelectorAll("#ban-lab [data-plan]")];
    const clearPlan = () => chips.forEach((c) => c.setAttribute("aria-pressed", "false"));
    for (let k = 0; k < WEEKS; k++) {
      const g = el("g", { class: "bar", tabindex: 0, role: "slider", "aria-orientation": "vertical", "aria-label": `Week ${k + 1} mileage`, "aria-valuemin": 0, "aria-valuemax": MAXL }, gBars);
      el("rect", { class: "hit", fill: "transparent" }, g);
      el("rect", { class: "vis", rx: 2 }, g);
      const setFrom = (clientY) => {
        const pt = svg.createSVGPoint(); pt.x = 0; pt.y = clientY;
        const y = pt.matrixTransform(svg.getScreenCTM().inverse()).y;
        load[k] = Math.round(Math.min(MAXL, Math.max(0, ((B.b - y) / (B.b - B.t)) * MAXL)));
        clearPlan(); render();
      };
      g.addEventListener("pointerdown", (e) => {
        e.preventDefault(); g.setPointerCapture(e.pointerId); setFrom(e.clientY);
        const move = (ev) => setFrom(ev.clientY);
        const end = () => { g.removeEventListener("pointermove", move); ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => g.removeEventListener(t, end)); };
        g.addEventListener("pointermove", move);
        ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => g.addEventListener(t, end));
      });
      g.addEventListener("keydown", (e) => {
        const v = load[k];
        const next = { ArrowUp: v + 2, ArrowRight: v + 2, ArrowDown: v - 2, ArrowLeft: v - 2, PageUp: v + 10, PageDown: v - 10, Home: 0, End: MAXL }[e.key];
        if (next === undefined) return;
        e.preventDefault(); load[k] = Math.min(MAXL, Math.max(0, next)); clearPlan(); render();
      });
      bars.push(g);
    }
    chips.forEach((c) => c.addEventListener("click", () => {
      PLANS[c.dataset.plan].forEach((v, k) => { load[k] = v; });
      chips.forEach((x) => x.setAttribute("aria-pressed", x === c ? "true" : "false"));
      render();
    }));

    responsive(svg, 380, (w, h) => { W = w; H = h; M.l = w < 420 ? 40 : 44; drawStatic(); render(); });
  })();

  /* ---------- Injury benchmark (results from athletIQ's injury/validation.json) ---------- */
  (() => {
    const svg = $("#inj-svg");
    if (!svg) return;
    const rows = [["Logistic regression", 0.619, true], ["XGBoost", 0.576, false], ["Workload ratio (ACWR)", 0.544, false]];
    responsive(svg, 196, (w) => {
      svg.innerHTML = "";
      const ink = css("--ink"), acc = css("--accent"), line = css("--line-strong");
      const R = w - 56, lo = 0.5, hi = 0.65;
      const sx = (v) => ((v - lo) / (hi - lo)) * R;
      rows.forEach(([name, v, best], k) => {
        const y = 14 + k * 52;
        el("text", { x: 0, y, class: "ink" }, svg).textContent = name;
        el("rect", { x: 0, y: y + 8, width: sx(v), height: 18, rx: 3, fill: best ? acc : ink, "fill-opacity": best ? 1 : 0.55 }, svg);
        el("text", { x: sx(v) + 8, y: y + 22, class: best ? "acc" : "" }, svg).textContent = v.toFixed(3);
      });
      el("line", { x1: 0.5, x2: 0.5, y1: 0, y2: 168, stroke: line, "stroke-dasharray": "3 3" }, svg);
      el("text", { x: 0, y: 186 }, svg).textContent = "0.5 = chance";
      el("text", { x: R, y: 186, "text-anchor": "end" }, svg).textContent = "AUC";
    });
  })();

  /* ---------- Meridian pipeline ---------- */
  (() => {
    const svg = $("#mer-svg");
    if (!svg) return;
    responsive(svg, 420, (w) => {
      svg.innerHTML = "";
      const ink = css("--ink"), line = css("--line-strong"), bg = css("--panel-2"), muted = css("--muted"), acc = css("--accent");
      const half = (w - 16) / 2;
      const box = (x, y, bw, title, sub, hot) => {
        el("rect", { x: x + 0.5, y: y + 0.5, width: bw - 1, height: 56, rx: 8, fill: hot ? ink : bg, stroke: hot ? ink : line }, svg);
        el("text", { x: x + 12, y: y + 24, class: "lbl", style: hot ? `fill:${bg}` : "" }, svg).textContent = title;
        el("text", { x: x + 12, y: y + 42, class: "sub", style: hot ? `fill:${bg};opacity:.75` : `fill:${muted}` }, svg).textContent = sub;
      };
      const arrow = (x1, y1, x2, y2) => {
        el("path", { d: `M${x1},${y1} V${(y1 + y2) / 2} H${x2} V${y2 - 3}`, fill: "none", stroke: line, "stroke-width": 1.5 }, svg);
        el("path", { d: `M${x2 - 5},${y2 - 9} L${x2},${y2 - 3} L${x2 + 5},${y2 - 9}`, fill: "none", stroke: line, "stroke-width": 1.5 }, svg);
      };
      const narrow = w < 380;
      box(0, 0, half, "Startup", narrow ? "description, stage" : "description, stage, place");
      box(half + 16, 0, half, narrow ? "48,046 VCs" : "48,046 investors", "past portfolios");
      box(0, 120, w, "MiniLM embeddings", "text similarity, startup vs portfolio");
      arrow(half / 2, 56, w / 2 - 20, 120); arrow(half + 16 + half / 2, 56, w / 2 + 20, 120);
      box(0, 216, w, "16 pair features", "stage, check size, geography, focus");
      arrow(w / 2, 176, w / 2, 216);
      box(0, 312, w, "LambdaRank (LightGBM)", "about 907K pairs, split by startup", true);
      arrow(w / 2, 272, w / 2, 312);
      el("path", { d: `M${w / 2},368 V384`, stroke: acc, "stroke-width": 1.5 }, svg);
      el("text", { x: w / 2, y: 404, class: "acc", "text-anchor": "middle" }, svg).textContent = "ranked investor matches for each founder";
    });
  })();

  /* ---------- SECRET shop clip: loop only while visible, never under reduced motion ---------- */
  (() => {
    const v = $("#secret-clip");
    if (!v) return;
    if (reduceMotion) { v.controls = true; return; }
    onVisible(v, (on) => { if (on) v.play().catch(() => { v.controls = true; }); else v.pause(); });
  })();

  /* ---------- SECRET wiring diagram (from the competition kit's electrical schematic) ---------- */
  (() => {
    const svg = $("#wire-svg");
    if (!svg) return;
    const info = $("#wire-info");
    const parts = {
      throttle: { x: 20, y: 30, w: 160, h: 58, t: "Thumb throttle", s: "hall sensor, regen 0-20%",
        d: "A hall-effect thumb throttle wired into a 14-pin connector we built pin by pin. The first 20% of travel is regenerative braking: easing off slows the car and puts energy back in the pack, so the brake pedal is only for emergencies." },
      ca: { x: 300, y: 30, w: 170, h: 58, t: "Cycle Analyst", s: "amps, amp-hours, speed",
        d: "Reads the voltage across the shunt to get current, integrates it into amp-hours drawn since the last full charge, and computes speed from the tire circumference we calibrated." },
      arduino: { x: 540, y: 30, w: 170, h: 58, t: "Arduino", s: "per-lap energy budget", ours: true,
        d: "Our addition to the kit. Each lap it reads amp-hours used from the Cycle Analyst, divides what's left of the battery by the laps left in the hour, compares that budget to the lap just driven, and decides: speed up, hold, or back off." },
      lcd: { x: 780, y: 30, w: 160, h: 58, t: "Driver display", s: "lap, use rate, pace call", ours: true,
        d: "The dash screen the driver actually races by: lap number, battery use rate, and the pacing call from the Arduino." },
      shunt: { x: 120, y: 190, w: 160, h: 58, t: "Shunt", s: "0.25 mΩ, negative leg",
        d: "A precision resistor in the battery's negative lead: 75 mV at 300 A, so 0.25 mΩ. The tiny voltage across it is the current, by Ohm's law, and it's how the Cycle Analyst measures every amp the motor pulls." },
      ctrl: { x: 360, y: 180, w: 230, h: 80, t: "KEB motor controller", s: "48V DC to 3-phase drive", hot: true,
        d: "Turns 48V DC into three-phase current for the brushless motor, timing each switch from the motor's hall sensors. We program its settings over an RS-232 link, including regen braking on the first 20% of throttle travel." },
      motor: { cx: 860, cy: 220, r: 50, t: "Hub motor", s: "brushless DC",
        d: "A brushless DC motor built into the wheel. Its three phases (yellow, green, blue) land on the controller's A, B and C tabs; hall sensors and a temperature sensor report back on a separate connector, with a sealed spare." },
      batt: { x: 20, y: 350, w: 230, h: 58, t: "Battery pack", s: "4 × 12V lead-acid in series = 48V",
        d: "Four 12V sealed lead-acid batteries in series on 6-gauge cable. We designed and rebuilt the pack and its mounting. Lead-acid gives up usable capacity at high current, which is why pacing matters so much." },
      kill: { x: 300, y: 350, w: 140, h: 58, t: "Kill switches", s: "2 keyed, in series",
        d: "Two main power switches with removable red keys, wired in series. Where they sit in the car is set by the race rules." },
      fuse: { x: 480, y: 350, w: 110, h: 58, t: "100 A fuse", s: "main fuse",
        d: "The main fuse on the positive leg. Everything downstream is protected if a cable shorts to the frame." },
      cont: { x: 630, y: 350, w: 160, h: 58, t: "Contactor", s: "+ precharge resistor",
        d: "A high-power relay. Before it closes, a precharge resistor fills the controller's capacitors for about three seconds; switching straight onto 48V would slam them with inrush current and can destroy the controller. Startup order matters." },
    };
    const power = [
      "M250,379 H300", "M440,379 H480", "M590,379 H630",
      "M710,350 V300 H540 V260",           // contactor to controller B+
      "M80,350 V248",                      // battery minus to shunt
      "M280,219 H360",                     // shunt to controller B-
    ];
    const phases = ["M590,205 H812", "M590,220 H810", "M590,235 H812"];
    const signals = [
      ["M100,88 V140 H410 V180", "14-pin"],
      ["M200,190 V120 H360 V88", "shunt mV"],
      ["M470,59 H540", "serial"],
      ["M710,59 H780", ""],
      ["M860,170 V150 H560 V180", "hall + temp"],
    ];
    let sel = "arduino";

    function draw() {
      svg.innerHTML = "";
      const ink = css("--ink"), line = css("--line-strong"), bg = css("--panel-2"), muted = css("--muted");
      const gW = el("g", {}, svg), gN = el("g", {}, svg);
      power.forEach((d) => { el("path", { d, fill: "none", stroke: line, "stroke-width": 6, "stroke-linecap": "round" }, gW); el("path", { d, class: "flow" }, gW); });
      phases.forEach((d, i) => {
        el("path", { d, fill: "none", stroke: ["#c8a400", "#3c8d4f", "#3b6fd1"][i], "stroke-width": 3.5 }, gW);
        el("path", { d, class: "flow" }, gW);
      });
      el("text", { x: 700, y: 196, class: "sub", style: `fill:${muted}` }, gW).textContent = "U  V  W";
      signals.forEach(([d, lab]) => {
        el("path", { d, fill: "none", stroke: line, "stroke-width": 1.5, "stroke-dasharray": "4 4" }, gW);
        el("path", { d, class: "sig-flow" }, gW);
      });
      [["14-pin", 250, 134], ["shunt voltage", 240, 114], ["serial", 478, 50], ["hall + temp", 640, 144]].forEach(([t, x, y]) => {
        el("text", { x, y, class: "sub", style: `fill:${muted}` }, gW).textContent = t;
      });
      el("text", { x: 258, y: 372, class: "sub", style: `fill:${muted}` }, gW).textContent = "+";
      el("text", { x: 86, y: 300, class: "sub", style: `fill:${muted}` }, gW).textContent = "−";

      Object.entries(parts).forEach(([k, p]) => {
        const g = el("g", { class: `part${k === sel ? " sel" : ""}`, tabindex: 0, role: "button", "aria-pressed": k === sel ? "true" : "false", "aria-label": p.t }, gN);
        const hot = p.hot, fillBox = hot ? ink : bg;
        if (p.r) {
          el("circle", { class: "box", cx: p.cx, cy: p.cy, r: p.r, fill: fillBox, stroke: line, "stroke-width": 1.5 }, g);
          el("text", { x: p.cx, y: p.cy - 2, "text-anchor": "middle", class: "lbl" }, g).textContent = p.t;
          el("text", { x: p.cx, y: p.cy + 16, "text-anchor": "middle", class: "sub", style: `fill:${muted}` }, g).textContent = p.s;
        } else {
          el("rect", { class: "box", x: p.x + 0.5, y: p.y + 0.5, width: p.w - 1, height: p.h - 1, rx: 8, fill: fillBox, stroke: p.ours ? css("--accent") : line, "stroke-width": p.ours ? 2 : 1.5, "stroke-dasharray": p.ours ? "0" : "0" }, g);
          el("text", { x: p.x + 12, y: p.y + (p.h > 60 ? 34 : 24), class: "lbl", style: hot ? `fill:${bg}` : "" }, g).textContent = p.t;
          el("text", { x: p.x + 12, y: p.y + (p.h > 60 ? 54 : 42), class: "sub", style: hot ? `fill:${bg};opacity:.75` : `fill:${muted}` }, g).textContent = p.s;
        }
        const pick = () => { sel = k; draw(); svg.querySelector(`[aria-label="${p.t}"]`).focus({ preventScroll: true }); };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      });
      const p = parts[sel];
      info.innerHTML = `<b>${p.t}</b>${p.d}`;
    }
    draw();
    darkMQ.addEventListener("change", draw);
  })();

  /* ---------- One-hour race simulator: constant speed vs per-lap energy budget ---------- */
  (() => {
    const svg = $("#race-svg");
    if (!svg) return;
    const P = { rho: 1.2, CdA: 0.30, crr: 0.015, m: 150, g: 9.81, eta: 0.8, V: 48, C: 26, k: 1.15, lap: 0.6 };
    // Peukert: the faster you draw, the more capacity each amp-hour effectively costs.
    const ieff = (mph) => {
      const v = mph * 0.44704;
      const I = ((0.5 * P.rho * P.CdA * v ** 3 + P.crr * P.m * P.g * v) / P.eta) / P.V;
      return I * Math.pow(I / (P.C / 20), P.k - 1);
    };
    function race(speed, pace) {
      let s = speed, t = 0, used = 0, laps = 0, dead = null;
      const pts = [[0, 100]];
      for (;;) {
        const lt = P.lap / s, use = ieff(s) * lt;
        if (t + lt >= 1) {
          let f = (1 - t) / lt;
          if (used + use * f > P.C) { f = (P.C - used) / use; dead = t + f * lt; }
          laps += f; used = Math.min(P.C, used + use * f); t = dead ?? 1;
          pts.push([t * 60, 100 * (1 - used / P.C)]); break;
        }
        if (used + use > P.C) {
          const f = (P.C - used) / use; laps += f; dead = t + f * lt; used = P.C;
          pts.push([dead * 60, 0]); break;
        }
        t += lt; used += use; laps += 1;
        pts.push([t * 60, 100 * (1 - used / P.C)]);
        if (pace) {
          // The Arduino's rule: spread what's left evenly over the laps left in the hour.
          const budget = (P.C - used) / ((1 - t) / (P.lap / s));
          if (use > budget * 1.03) s = Math.max(14, s - 1);
          else if (use < budget * 0.97) s = Math.min(34, s + 1);
        }
      }
      return { laps, dead: dead && dead < 0.999 ? dead * 60 : null, left: 100 * (1 - used / P.C), pts, finalSpeed: s };
    }

    const input = $("#race-speed"), out = $("#race-speed-out"), readout = $("#race-readout"), msg = $("#race-out");
    let W = 560, H = 230, anim = 0;
    const M = { l: 40, r: 12, t: 12, b: 28 };
    function render(progress = 1) {
      const speed = +input.value;
      const a = race(speed, false), b = race(speed, true);
      svg.innerHTML = "";
      const ink = css("--ink"), acc = css("--accent"), line = css("--line"), muted = css("--muted");
      const sx = (m) => M.l + (m / 60) * (W - M.l - M.r), sy = (p) => M.t + (1 - p / 100) * (H - M.t - M.b);
      [0, 25, 50, 75, 100].forEach((p) => {
        el("line", { x1: M.l, x2: W - M.r, y1: sy(p), y2: sy(p), stroke: line }, svg);
        el("text", { x: M.l - 6, y: sy(p) + 4, "text-anchor": "end" }, svg).textContent = `${p}%`;
      });
      (W < 420 ? [0, 30, 60] : [0, 15, 30, 45, 60]).forEach((m) => { el("text", { x: sx(m), y: H - 8, "text-anchor": m === 60 ? "end" : m === 0 ? "start" : "middle" }, svg).textContent = `${m} min`; });
      const tmax = 60 * progress;
      const clip = (pts) => {
        const outp = [];
        for (let i = 0; i < pts.length; i++) {
          if (pts[i][0] <= tmax) outp.push(pts[i]);
          else { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; outp.push([tmax, y0 + (y1 - y0) * (tmax - x0) / (x1 - x0)]); break; }
        }
        return outp;
      };
      const path = (pts) => clip(pts).map(([m, p]) => `${sx(m)},${sy(p)}`).join(" ");
      el("polyline", { points: path(a.pts), fill: "none", stroke: muted, "stroke-width": 2, "stroke-dasharray": "5 4" }, svg);
      el("polyline", { points: path(b.pts), fill: "none", stroke: acc, "stroke-width": 2.5 }, svg);
      if (progress === 1 && a.dead) {
        el("text", { x: Math.min(sx(a.dead), W - M.r - 60), y: sy(0) - 22, "text-anchor": "middle", class: "halo" }, svg).textContent = `dead at ${a.dead.toFixed(0)} min`;
      }
      el("text", { x: W - M.r - 4, y: M.t + 14, "text-anchor": "end", class: "acc halo" }, svg).textContent = "with pacing";
      el("text", { x: W - M.r - 4, y: M.t + 30, "text-anchor": "end", class: "halo" }, svg).textContent = "driver alone (dashed)";

      readout.innerHTML = [
        ["Laps, driver alone", a.laps.toFixed(1), !!a.dead],
        ["Laps, with pacing", b.laps.toFixed(1)],
        ["Pacing settles at", `${b.finalSpeed} mph`],
      ].map(([k, v, f]) => `<div><dt>${k}</dt><dd class="${f ? "flag" : ""}">${v}</dd></div>`).join("");
      const gain = b.laps - a.laps;
      msg.innerHTML = a.dead
        ? `<b>At ${speed} mph the pack dies ${(60 - a.dead).toFixed(0)} minutes early.</b> Pacing backs off and finishes ${gain.toFixed(1)} laps ahead.`
        : a.left > 5
          ? `<b>At ${speed} mph the driver finishes with ${a.left.toFixed(0)}% of the battery unused.</b> Pacing spends it, for ${gain.toFixed(1)} more laps.`
          : `<b>${speed} mph is close to the best constant speed for this car.</b> Pacing matches it without the driver having to know that.`;
    }
    function play() {
      cancelAnimationFrame(anim);
      if (reduceMotion) { render(1); return; }
      const start = performance.now(), dur = 3200;
      const tick = (now) => { const k = Math.min(1, (now - start) / dur); render(k); if (k < 1) anim = requestAnimationFrame(tick); };
      anim = requestAnimationFrame(tick);
    }
    input.addEventListener("input", () => { out.textContent = input.value; cancelAnimationFrame(anim); render(1); });
    $("#race-run").addEventListener("click", play);
    responsive(svg, 230, (w, h) => { W = w; H = h; render(1); });
  })();

  /* ---------- ReachBot retrieval gate ---------- */
  (() => {
    const svg = $("#rag-svg");
    if (!svg) return;
    const input = $("#rag-sim"), out = $("#rag-out"), mode = $("#rag-mode");
    const chips = [...document.querySelectorAll("#rag-lab [data-sim]")];
    let W = 520;
    const lo = 0.4, hi = 0.9;
    function passages(sim) {
      if (sim < 0.6) return 0;
      if (sim < 0.7) return 5;
      return Math.round(3 + Math.min(1, (sim - 0.7) / 0.15) * 22);
    }
    function render() {
      const sim = +input.value;
      out.textContent = sim.toFixed(2);
      svg.innerHTML = "";
      const ink = css("--ink"), acc = css("--accent"), line = css("--line-strong"), panel = css("--panel"), muted = css("--muted"), soft = css("--accent-soft");
      const L = 0, R = W, sx = (v) => L + ((v - lo) / (hi - lo)) * (R - L);
      const zones = [[lo, 0.6, panel, "not covered"], [0.6, 0.7, soft, "cautious"], [0.7, hi, soft, "answer"]];
      zones.forEach(([a, b, f, t], i) => {
        el("rect", { x: sx(a), y: 18, width: sx(b) - sx(a), height: 26, fill: f, "fill-opacity": i === 2 ? 1 : 0.9 }, svg);
        el("text", { x: (sx(a) + sx(b)) / 2, y: 12, "text-anchor": "middle", class: "sub", style: `fill:${muted}` }, svg).textContent = t;
      });
      [[0.54, "off-topic"], [0.66, "adjacent"], [0.75, "on-topic"]].forEach(([v, t]) => {
        el("line", { x1: sx(v), x2: sx(v), y1: 44, y2: 52, stroke: line }, svg);
        el("text", { x: sx(v), y: 66, "text-anchor": "middle" }, svg).textContent = t;
      });
      el("path", { d: `M${sx(sim)},14 V48`, stroke: acc, "stroke-width": 3 }, svg);
      const n = passages(sim), size = Math.min(16, (W - 24 * 3) / 25);
      el("text", { x: 0, y: 92, class: "ink" }, svg).textContent = `Passages sent to the model: ${n}`;
      for (let i = 0; i < 25; i++) {
        el("rect", { x: i * (size + 3), y: 102, width: size, height: size, rx: 2, fill: i < n ? acc : "none", stroke: i < n ? acc : line }, svg);
      }
      chips.forEach((c) => c.setAttribute("aria-pressed", Math.abs(+c.dataset.sim - sim) < 0.005 ? "true" : "false"));
      mode.innerHTML = sim < 0.6
        ? "<b>Not covered.</b> The evidence is weak, so ReachBot says the library doesn't cover this instead of improvising. Silence beats confident fiction."
        : sim < 0.7
          ? "<b>Cautious.</b> Only 5 passages go to the model, with a note that the evidence is thin, leaving less noise to weave into a made-up answer."
          : `<b>Answer.</b> Up to ${n} passages, scaled to how strong the evidence is, and every claim carries an inline citation.`;
    }
    input.addEventListener("input", render);
    chips.forEach((c) => c.addEventListener("click", () => { input.value = c.dataset.sim; render(); }));
    responsive(svg, 126, (w) => { W = w; render(); });
  })();

  /* ---------- GMU replication results ---------- */
  (() => {
    const svg = $("#gmu-svg");
    if (!svg) return;
    responsive(svg, 92, (w) => {
      svg.innerHTML = "";
      const acc = css("--accent"), line = css("--line-strong");
      const n = 27, ok = 19, gap = 4, size = Math.min(22, (w - gap * (n - 1)) / n);
      for (let i = 0; i < n; i++) {
        el("rect", { x: i * (size + gap), y: 8, width: size, height: size * 1.6, rx: 3, fill: i < ok ? acc : "none", stroke: i < ok ? acc : line, "stroke-width": 1.5 }, svg);
      }
      el("text", { x: 0, y: 8 + size * 1.6 + 22, class: "acc" }, svg).textContent = "19 replicated";
      el("text", { x: (ok) * (size + gap), y: 8 + size * 1.6 + 22 }, svg).textContent = "8 failed";
    });
  })();

  /* ---------- Future Fellows quote check ---------- */
  (() => {
    const essayEl = $("#essay");
    if (!essayEl) return;
    const essay = "Last spring the shuttle tracker at school kept crashing, so I rebuilt it. The old version polled the city feed every minute and fell over at rush hour. I cached responses and cut the polling to when a bus was actually near. It has not crashed since March, and about forty students check it every morning.";
    const presets = [
      "cut the polling to when a bus was actually near",
      "only polled the feed when buses were close by",
      "led a team of five engineers to rebuild the app",
    ];
    const ta = $("#quote"), out = $("#q-result");
    const chips = [...document.querySelectorAll("#quote-lab .chip")];
    const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const norm = (t) => t.toLowerCase().replace(/\s+/g, " ");
    function check() {
      const q = ta.value.trim();
      chips.forEach((c) => c.setAttribute("aria-pressed", presets[+c.dataset.q] === ta.value ? "true" : "false"));
      const idx = q.length ? essay.indexOf(q) : -1;
      if (idx >= 0 && q.length >= 12) {
        essayEl.innerHTML = esc(essay.slice(0, idx)) + "<mark>" + esc(q) + "</mark>" + esc(essay.slice(idx + q.length));
        out.className = "q-result pass"; out.textContent = "Accepted. The quote appears word for word, so the score can stand.";
        return;
      }
      essayEl.textContent = essay;
      out.className = "q-result fail";
      if (!q.length) out.textContent = "Rejected. No evidence, no score.";
      else if (q.length < 12) out.textContent = "Rejected. Too short to count as evidence.";
      else if (norm(essay).includes(norm(q))) out.textContent = "Rejected. Close, but capitalization or spacing differs. The check is exact.";
      else out.textContent = "Rejected. These words never appear in the application. Score discarded.";
    }
    chips.forEach((b) => b.addEventListener("click", () => { ta.value = presets[+b.dataset.q]; check(); }));
    ta.addEventListener("input", check);
    ta.value = presets[0]; check();
  })();

  /* ---------- Indus method walkthrough (toy corpus, computed live) ---------- */
  (() => {
    const box = $("#corpus");
    if (!box) return;
    const corpus = [
      [740], [267], [415], [342, 740], [99, 51, 740], [99, 51, 267], [176, 59, 342, 740], [176, 59, 267],
      [176, 59, 415], [176, 59, 740], [176, 342], [220, 12, 740], [220, 12, 267], [220, 342], [12, 415],
      [33, 8, 740], [33, 267], [415, 342, 740],
    ];
    const count = new Map(), bigram = new Map();
    corpus.forEach((ins) => ins.forEach((s, i) => {
      count.set(s, (count.get(s) || 0) + 1);
      if (i < ins.length - 1) { const k = `${s}>${ins[i + 1]}`; bigram.set(k, (bigram.get(k) || 0) + 1); }
    }));
    const singletons = new Set(corpus.filter((i) => i.length === 1).map((i) => i[0]));
    const ctx = new Map();
    corpus.forEach((ins) => ins.forEach((s, i) => {
      const keys = [];
      if (i > 0) keys.push(`L${ins[i - 1]}`);
      if (i < ins.length - 1) keys.push(`R${ins[i + 1]}`);
      keys.forEach((k) => { if (!ctx.has(k)) ctx.set(k, new Set()); ctx.get(k).add(s); });
    }));
    const expanded = new Map();
    for (const s of count.keys()) {
      if (singletons.has(s)) continue;
      const shared = new Set();
      for (const members of ctx.values()) if (members.has(s)) members.forEach((m) => singletons.has(m) && shared.add(m));
      if (shared.size >= 2) expanded.set(s, shared.size);
    }
    const allPairs = [...bigram].map(([k, c]) => {
      const [a, b] = k.split(">").map(Number);
      return { a, b, ex: Math.min(c / count.get(a), c / count.get(b)) };
    }).filter((p) => p.ex >= 0.45).sort((x, y) => y.ex - x.ex);

    box.innerHTML = corpus.map((ins, r) =>
      `<div class="inscr"><span class="n">${String(r + 1).padStart(2, "0")}</span>${ins.map((s) => `<span class="sign" data-s="${s}">${s}</span>`).join("")}</div>`
    ).join("");
    const rowsEl = [...box.querySelectorAll(".inscr")];
    const signs = [...box.querySelectorAll(".sign")];
    const stepText = $("#step-text"), exclCtl = $("#excl-ctl"), excl = $("#excl"), exclOut = $("#excl-out"), pairList = $("#pair-list");
    const panel = $("#indus-panel");
    let step = 0;
    const list = (arr) => arr.length ? arr.join(", ") : "none";

    function paint() {
      signs.forEach((n) => { n.className = "sign"; n.style.transitionDelay = ""; });
      exclCtl.hidden = pairList.hidden = step !== 3;
      if (step === 0) stepText.innerHTML = `Each row is one inscription, read as a sequence of signs. This toy set has <b>${corpus.length}</b> inscriptions and <b>${count.size}</b> distinct signs. Nothing is labelled yet.`;
      if (step === 1 || step === 2) signs.forEach((n) => { if (singletons.has(+n.dataset.s)) n.classList.add("logo"); });
      if (step === 1) stepText.innerHTML = `A sign that appears completely alone has to carry a whole meaning by itself. Those <b>singletons</b> become the first logogram candidates: <b>${list([...singletons])}</b>.`;
      if (step === 2) {
        signs.forEach((n) => { if (expanded.has(+n.dataset.s)) n.classList.add("expand"); });
        const e = [...expanded].map(([s, k]) => `${s}, which fills the same slots as ${k} of them`);
        stepText.innerHTML = `A sign that keeps filling the same slots as the candidates is probably doing the same job. Expanding by shared neighbours adds <b>${list(e)}</b>.`;
      }
      if (step === 3) {
        const th = +excl.value; exclOut.textContent = th.toFixed(2);
        const on = allPairs.filter((p) => p.ex >= th - 1e-9);
        let lit = 0;
        rowsEl.forEach((row, r) => {
          const ins = corpus[r], spans = row.querySelectorAll(".sign");
          ins.forEach((s, i) => {
            if (i < ins.length - 1 && on.some((p) => p.a === s && p.b === ins[i + 1])) {
              [spans[i], spans[i + 1]].forEach((n) => {
                if (!n.classList.contains("pair")) { n.classList.add("pair"); if (!reduceMotion) n.style.transitionDelay = `${lit++ * 35}ms`; }
              });
            }
          });
        });
        signs.forEach((n) => { if (!n.classList.contains("pair")) n.classList.add("dim"); });
        stepText.innerHTML = "Some pairs almost never appear apart. If A is nearly always followed by B, and B nearly always preceded by A, they behave like syllables spelling one word. Lower the threshold to admit weaker pairs.";
        pairList.innerHTML = allPairs.map((p) => `<li class="${p.ex >= th - 1e-9 ? "on" : ""}"><span>${p.a} + ${p.b}</span><span class="num">${p.ex.toFixed(2)}</span></li>`).join("");
      }
    }
    const tabs = [...document.querySelectorAll(".method-steps [role=tab]")];
    function select(tab, focus) {
      step = +tab.dataset.step;
      tabs.forEach((t) => { const on = t === tab; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; });
      panel.setAttribute("aria-labelledby", tab.id);
      if (focus) tab.focus();
      paint();
    }
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t, false));
      t.addEventListener("keydown", (e) => {
        const idx = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (idx === undefined) return;
        e.preventDefault(); select(tabs[(idx + tabs.length) % tabs.length], true);
      });
    });
    excl.addEventListener("input", paint);
    paint();
  })();
})();
