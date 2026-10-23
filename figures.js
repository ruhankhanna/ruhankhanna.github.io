(() => {
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const fmt = (s) => {
    if (!isFinite(s)) return "--";
    const m = Math.floor(s / 60), r = s - m * 60;
    return m ? `${m}:${r.toFixed(1).padStart(4, "0")}` : r.toFixed(1);
  };
  // Draw at real pixel width so 11px labels stay 11px on every screen.
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
    run();
    return run;
  }

  /* ---------- the map: every project between engineering and markets ---------- */
  (() => {
    const svg = $("#map");
    if (!svg) return;
    const rows = $$(".index-row");
    const pts = rows.map((r) => ({ id: r.dataset.id, name: r.dataset.short, x: +r.dataset.x, y: +r.dataset.y, row: r }));
    let dots = {};
    function setHot(id) {
      rows.forEach((r) => r.classList.toggle("hot", r.dataset.id === id));
      Object.entries(dots).forEach(([k, g]) => g.classList.toggle("hot", k === id));
      svg.classList.toggle("has-hot", !!id);
    }
    responsive(svg, (w) => Math.round(Math.min(w * 0.82, 330)), (w, h) => {
      svg.innerHTML = "";
      dots = {};
      const pad = { l: 14, r: 14, t: 22, b: 22 };
      const sx = (v) => pad.l + v * (w - pad.l - pad.r);
      const sy = (v) => h - pad.b - v * (h - pad.t - pad.b);
      const rule = css("--rule-2"), muted = css("--muted");
      // quadrant hairlines
      el("line", { x1: sx(0.5), x2: sx(0.5), y1: pad.t, y2: h - pad.b, stroke: rule }, svg);
      el("line", { x1: pad.l, x2: w - pad.r, y1: sy(0.5), y2: sy(0.5), stroke: rule }, svg);
      const lab = (x, y, t, anchor = "start") => { el("text", { x, y, "text-anchor": anchor, class: "axis" }, svg).textContent = t; };
      lab(pad.l, h - 6, "← engineering");
      lab(w - pad.r, h - 6, "markets →", "end");
      lab(sx(0.5) + 6, pad.t - 8, "shipped ↑");
      lab(sx(0.5) + 6, h - pad.b - 6, "research ↓");
      pts.forEach((p) => {
        const g = el("g", { class: "dot", tabindex: -1 }, svg);
        const cx = sx(p.x), cy = sy(p.y);
        el("circle", { cx, cy, r: 4.5, class: "c" }, g);
        el("circle", { cx, cy, r: 14, fill: "transparent" }, g);
        const right = p.x < 0.72;
        el("text", { x: cx + (right ? 9 : -9), y: cy + 4, "text-anchor": right ? "start" : "end", class: "nm" }, g).textContent = p.name;
        g.addEventListener("pointerenter", () => setHot(p.id));
        g.addEventListener("pointerleave", () => setHot(null));
        g.addEventListener("click", () => document.getElementById(p.id).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }));
        dots[p.id] = g;
      });
      void muted;
    });
    rows.forEach((r) => {
      r.addEventListener("pointerenter", () => setHot(r.dataset.id));
      r.addEventListener("pointerleave", () => setHot(null));
      r.addEventListener("focusin", () => setHot(r.dataset.id));
      r.addEventListener("focusout", () => setHot(null));
    });
  })();

  /* ---------- VDOT (Daniels), the same formulas athletIQ uses ---------- */
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
    const events = [[800, "800m"], [1500, "1500m"], [1609.34, "mile"], [3200, "3200m"], [5000, "5k"]];
    const parse = (s) => {
      s = s.trim();
      if (!/^\d{1,2}:\d{1,2}(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return NaN;
      const p = s.split(":");
      return p.length === 2 ? +p[0] * 60 + +p[1] : +p[0];
    };
    function run() {
      const d = +ev.value, sec = parse(tIn.value);
      if (!isFinite(sec) || sec <= 0) { msg.textContent = "try a time like 4:35 or 2:01.5"; tIn.setAttribute("aria-invalid", "true"); return; }
      const v = VD.vdot(d, sec);
      if (!isFinite(v) || v < 25 || v > 90) { msg.textContent = "outside the range the formula is fit for"; tIn.setAttribute("aria-invalid", "true"); return; }
      tIn.removeAttribute("aria-invalid");
      out.textContent = v.toFixed(1);
      msg.textContent = v > 78 ? "world-class" : v > 69 ? "college varsity" : v > 58 ? "strong high school varsity" : "developing runner";
      eq.innerHTML = events.map(([dist, name]) =>
        `<div class="${Math.abs(dist - d) < 1 ? "self" : ""}"><dt>${name}</dt><dd>${fmt(VD.timeFor(dist, v))}</dd></div>`).join("");
    }
    ev.addEventListener("change", run);
    tIn.addEventListener("input", run);
    run();
  })();

  /* ---------- injury benchmark (athletIQ injury/validation.json) ---------- */
  (() => {
    const svg = $("#inj-svg");
    if (!svg) return;
    const rows = [["logistic regression", 0.619, true], ["xgboost, engineered features", 0.576], ["workload-ratio rule (acwr)", 0.544]];
    responsive(svg, 150, (w) => {
      svg.innerHTML = "";
      const lo = 0.5, hi = 0.64, R = w - 44;
      const sx = (v) => ((v - lo) / (hi - lo)) * R;
      rows.forEach(([name, v, best], k) => {
        const y = 12 + k * 42;
        el("text", { x: 0, y, class: best ? "ink" : "" }, svg).textContent = name;
        el("rect", { x: 0, y: y + 7, width: sx(v), height: 12, fill: best ? css("--accent") : css("--ink"), "fill-opacity": best ? 1 : 0.18 }, svg);
        el("text", { x: sx(v) + 6, y: y + 17, class: best ? "acc" : "" }, svg).textContent = v.toFixed(3);
      });
      el("text", { x: 0, y: 144 }, svg).textContent = "auc, split by athlete · 0.5 = coin flip";
    });
  })();

  /* ---------- Meridian: rank investors for a startup (illustrative) ---------- */
  (() => {
    const list = $("#rank-list");
    if (!list) return;
    const F = ["portfolio", "stage", "check", "geo"];
    const W = [0.45, 0.25, 0.15, 0.15];
    const investors = [
      { n: "edtech seed fund, sf",          f: { k12: [.92,.9,.8,.3], pay: [.15,.4,.3,.3], clim: [.1,.6,.7,.2] } },
      { n: "africa-focused generalist",     f: { k12: [.55,.8,.9,1], pay: [.45,.6,.5,.1], clim: [.3,.7,.8,.1] } },
      { n: "fintech series a specialist",   f: { k12: [.1,.2,.1,.2], pay: [.95,.95,.9,.7], clim: [.1,.1,.1,.4] } },
      { n: "hard-tech climate fund",        f: { k12: [.05,.3,.3,.2], pay: [.1,.4,.3,.4], clim: [.94,.85,.7,.6] } },
      { n: "midwest pre-seed fund",         f: { k12: [.3,.5,.9,.1], pay: [.35,.3,.6,.4], clim: [.55,.95,.95,1] } },
      { n: "growth-stage megafund",         f: { k12: [.4,.05,.05,.5], pay: [.5,.3,.1,.8], clim: [.4,.05,.05,.5] } },
    ];
    const rowH = 34;
    list.style.height = `${investors.length * rowH}px`;
    const rows = investors.map((inv) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rk num"></span><span class="nm">${inv.n}</span><span class="segs">${F.map((f) => `<i class="s-${f}"></i>`).join("")}</span><span class="sc num"></span>`;
      list.appendChild(li);
      return { inv, li };
    });
    const chips = $$("#rank-lab [data-s]");
    function show(key) {
      chips.forEach((c) => c.setAttribute("aria-pressed", c.dataset.s === key ? "true" : "false"));
      const scored = rows.map((r) => ({ ...r, s: r.inv.f[key].reduce((a, v, i) => a + v * W[i], 0) })).sort((a, b) => b.s - a.s);
      scored.forEach((r, i) => {
        r.li.style.transform = `translateY(${i * rowH}px)`;
        r.li.querySelector(".rk").textContent = String(i + 1).padStart(2, "0");
        r.li.querySelector(".sc").textContent = r.s.toFixed(2);
        r.li.classList.toggle("top", i < 2);
        r.li.querySelectorAll(".segs i").forEach((seg, k) => { seg.style.width = `${r.inv.f[key][k] * W[k] * 100}%`; });
      });
    }
    chips.forEach((c) => c.addEventListener("click", () => show(c.dataset.s)));
    show("k12");
    requestAnimationFrame(() => requestAnimationFrame(() => list.classList.add("ready")));
  })();

  /* ---------- SECRET wiring diagram (from the competition kit's schematic) ---------- */
  (() => {
    const svg = $("#wire-svg");
    if (!svg) return;
    const info = $("#wire-info");
    const parts = {
      throttle: { x: 20, y: 30, w: 160, h: 58, t: "thumb throttle", s: "hall sensor, regen 0–20%",
        d: "A hall-effect thumb throttle wired into a 14-pin connector we built pin by pin. The first 20% of travel is regenerative braking: easing off slows the car and puts energy back in the pack." },
      ca: { x: 300, y: 30, w: 170, h: 58, t: "cycle analyst", s: "amps, amp-hours, speed",
        d: "Reads the voltage across the shunt to get current, integrates it into amp-hours drawn since the last full charge, and computes speed from the tire circumference we calibrated." },
      arduino: { x: 540, y: 30, w: 170, h: 58, t: "arduino", s: "per-lap energy budget", ours: true,
        d: "Our addition to the kit. Each lap it reads amp-hours used, divides what's left of the battery by the laps left in the hour, compares that budget to the lap just driven, and decides: speed up, hold, or back off." },
      lcd: { x: 760, y: 30, w: 190, h: 58, t: "driver display", s: "lap, use rate, pace call", ours: true,
        d: "The dash screen the driver races by: lap number, battery use rate, and the pacing call from the Arduino." },
      shunt: { x: 120, y: 190, w: 160, h: 58, t: "shunt", s: "0.25 mΩ, negative leg",
        d: "A precision resistor in the battery's negative lead: 75 mV at 300 A. The tiny voltage across it is the current, by Ohm's law." },
      ctrl: { x: 360, y: 180, w: 230, h: 80, t: "motor controller", s: "48V DC → 3-phase", hot: true,
        d: "Turns 48V DC into three-phase current for the brushless motor, timing each switch from the motor's hall sensors. We program it over RS-232, including regen on the first 20% of throttle." },
      motor: { cx: 860, cy: 220, r: 50, t: "hub motor", s: "brushless DC",
        d: "A brushless DC motor built into the wheel. Its three phases land on the controller's A, B and C tabs; hall and temperature sensors report back on a separate connector." },
      batt: { x: 20, y: 350, w: 230, h: 58, t: "battery pack", s: "4 × 12V in series = 48V",
        d: "Four 12V sealed lead-acid batteries in series on 6-gauge cable. Lead-acid gives up usable capacity at high current, which is why pacing matters so much." },
      kill: { x: 300, y: 350, w: 140, h: 58, t: "kill switches", s: "2 keyed, in series",
        d: "Two main power switches with removable keys, wired in series. Where they sit is set by the race rules." },
      fuse: { x: 480, y: 350, w: 110, h: 58, t: "100 A fuse", s: "main fuse",
        d: "The main fuse on the positive leg. Everything downstream is protected if a cable shorts to the frame." },
      cont: { x: 630, y: 350, w: 160, h: 58, t: "contactor", s: "+ precharge resistor",
        d: "A high-power relay. Before it closes, a precharge resistor fills the controller's capacitors for about three seconds; switching straight onto 48V would slam them with inrush current." },
    };
    const power = ["M250,379 H300", "M440,379 H480", "M590,379 H630", "M710,350 V300 H540 V260", "M80,350 V248", "M280,219 H360"];
    const phases = ["M590,205 H812", "M590,220 H810", "M590,235 H812"];
    const signals = ["M100,88 V140 H410 V180", "M200,190 V120 H360 V88", "M470,59 H540", "M710,59 H760", "M860,170 V150 H560 V180"];
    let sel = "arduino";
    function draw() {
      svg.innerHTML = "";
      const ink = css("--ink"), rule = css("--rule-2"), paper = css("--paper"), muted = css("--muted"), acc = css("--accent");
      const gW = el("g", {}, svg), gN = el("g", {}, svg);
      power.forEach((d) => { el("path", { d, fill: "none", stroke: rule, "stroke-width": 5, "stroke-linecap": "round" }, gW); el("path", { d, class: "flow" }, gW); });
      phases.forEach((d, i) => { el("path", { d, fill: "none", stroke: ["#b8962e", "#4f8a5b", "#4a6fb5"][i], "stroke-width": 2.5 }, gW); });
      el("text", { x: 700, y: 196 }, gW).textContent = "u  v  w";
      signals.forEach((d) => el("path", { d, fill: "none", stroke: muted, "stroke-width": 1, "stroke-dasharray": "3 4" }, gW));
      [["14-pin", 250, 134], ["shunt voltage", 240, 114], ["serial", 478, 50], ["hall + temp", 640, 144]].forEach(([t, x, y]) => {
        el("text", { x, y }, gW).textContent = t;
      });
      Object.entries(parts).forEach(([k, p]) => {
        const on = k === sel;
        const g = el("g", { class: `part${on ? " sel" : ""}`, tabindex: 0, role: "button", "aria-pressed": on, "aria-label": p.t }, gN);
        const stroke = on ? ink : p.ours ? acc : rule;
        if (p.r) {
          el("circle", { cx: p.cx, cy: p.cy, r: p.r, fill: paper, stroke, "stroke-width": on ? 1.5 : 1 }, g);
          el("text", { x: p.cx, y: p.cy - 2, "text-anchor": "middle", class: "ink" }, g).textContent = p.t;
          el("text", { x: p.cx, y: p.cy + 15, "text-anchor": "middle" }, g).textContent = p.s;
        } else {
          el("rect", { x: p.x + 0.5, y: p.y + 0.5, width: p.w - 1, height: p.h - 1, rx: 3, fill: paper, stroke, "stroke-width": on ? 1.5 : 1, "stroke-dasharray": p.ours && !on ? "4 3" : "0" }, g);
          el("text", { x: p.x + 12, y: p.y + (p.h > 60 ? 35 : 25), class: "ink" }, g).textContent = p.t;
          el("text", { x: p.x + 12, y: p.y + (p.h > 60 ? 54 : 43) }, g).textContent = p.s;
        }
        const pick = () => { sel = k; draw(); svg.querySelector(`[aria-label="${p.t}"]`).focus({ preventScroll: true }); };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      });
      const p = parts[sel];
      info.innerHTML = `<b>${p.t}${p.ours ? " <span class='tag'>we added this</span>" : ""}</b>${p.d}`;
    }
    draw();
  })();

  /* ---------- one-hour race: constant speed vs per-lap energy budget ---------- */
  (() => {
    const svg = $("#race-svg");
    if (!svg) return;
    const P = { rho: 1.2, CdA: 0.30, crr: 0.015, m: 150, g: 9.81, eta: 0.8, V: 48, C: 26, k: 1.15, lap: 0.6 };
    // Peukert: the faster you draw, the more each amp-hour effectively costs.
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
          // the Arduino's rule: spread what's left evenly over the laps left in the hour
          const budget = (P.C - used) / ((1 - t) / (P.lap / s));
          if (use > budget * 1.03) s = Math.max(14, s - 1);
          else if (use < budget * 0.97) s = Math.min(34, s + 1);
        }
      }
      return { laps, dead: dead && dead < 0.999 ? dead * 60 : null, left: 100 * (1 - used / P.C), pts, finalSpeed: s };
    }
    const input = $("#race-speed"), out = $("#race-speed-out"), msg = $("#race-out");
    let W = 560, H = 210, anim = 0;
    const M = { l: 36, r: 8, t: 10, b: 24 };
    function render(progress = 1) {
      const speed = +input.value;
      const a = race(speed, false), b = race(speed, true);
      svg.innerHTML = "";
      const acc = css("--accent"), rule = css("--rule"), ink = css("--ink");
      const sx = (m) => M.l + (m / 60) * (W - M.l - M.r), sy = (p) => M.t + (1 - p / 100) * (H - M.t - M.b);
      [0, 50, 100].forEach((p) => {
        el("line", { x1: M.l, x2: W - M.r, y1: sy(p), y2: sy(p), stroke: rule }, svg);
        el("text", { x: M.l - 6, y: sy(p) + 4, "text-anchor": "end" }, svg).textContent = `${p}%`;
      });
      [0, 30, 60].forEach((m) => { el("text", { x: sx(m), y: H - 6, "text-anchor": m === 60 ? "end" : m === 0 ? "start" : "middle" }, svg).textContent = `${m} min`; });
      const tmax = 60 * progress;
      const clip = (pts) => {
        const o = [];
        for (let i = 0; i < pts.length; i++) {
          if (pts[i][0] <= tmax) o.push(pts[i]);
          else { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; o.push([tmax, y0 + (y1 - y0) * (tmax - x0) / (x1 - x0)]); break; }
        }
        return o;
      };
      const path = (pts) => clip(pts).map(([m, p]) => `${sx(m)},${sy(p)}`).join(" ");
      el("polyline", { points: path(a.pts), fill: "none", stroke: ink, "stroke-opacity": 0.45, "stroke-width": 1.5, "stroke-dasharray": "4 4" }, svg);
      el("polyline", { points: path(b.pts), fill: "none", stroke: acc, "stroke-width": 2 }, svg);
      if (progress === 1 && a.dead) el("text", { x: Math.min(sx(a.dead), W - 70), y: sy(0) - 8, "text-anchor": "middle", class: "halo" }, svg).textContent = `dead at ${a.dead.toFixed(0)} min`;
      el("text", { x: W - M.r, y: M.t + 16, "text-anchor": "end", class: "acc halo" }, svg).textContent = "with pacing";
      el("text", { x: W - M.r, y: M.t + 31, "text-anchor": "end", class: "halo" }, svg).textContent = "driver alone";
      const gain = b.laps - a.laps;
      msg.innerHTML = a.dead
        ? `at ${speed} mph the pack dies <b>${(60 - a.dead).toFixed(0)} min early</b>. pacing backs off and finishes <b>${gain.toFixed(1)} laps ahead</b>.`
        : a.left > 5
          ? `at ${speed} mph the driver leaves <b>${a.left.toFixed(0)}% of the battery unused</b>. pacing spends it: <b>+${gain.toFixed(1)} laps</b>.`
          : `${speed} mph is close to the best constant speed for this car. pacing finds it without the driver knowing.`;
    }
    function play() {
      cancelAnimationFrame(anim);
      if (reduceMotion) { render(1); return; }
      const start = performance.now(), dur = 2600;
      const tick = (now) => { const k = Math.min(1, (now - start) / dur); render(k); if (k < 1) anim = requestAnimationFrame(tick); };
      anim = requestAnimationFrame(tick);
    }
    input.addEventListener("input", () => { out.textContent = input.value; cancelAnimationFrame(anim); render(1); });
    $("#race-run").addEventListener("click", play);
    responsive(svg, 210, (w, h) => { W = w; H = h; render(1); });
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
      `<div class="inscr"><span class="n">${String(r + 1).padStart(2, "0")}</span>${ins.map((s) => `<span class="sign" data-s="${s}">${s}</span>`).join("")}</div>`).join("");
    const rowsEl = $$(".inscr", box), signs = $$(".sign", box);
    const stepText = $("#step-text"), exclCtl = $("#excl-ctl"), excl = $("#excl"), exclOut = $("#excl-out"), pairList = $("#pair-list");
    const list = (arr) => arr.length ? arr.join(", ") : "none";
    let step = 0;
    function paint() {
      signs.forEach((n) => { n.className = "sign"; });
      exclCtl.hidden = pairList.hidden = step !== 3;
      if (step === 0) stepText.innerHTML = `each row is one inscription, read as a sequence of signs. <b>${corpus.length}</b> inscriptions, <b>${count.size}</b> distinct signs, nothing labelled yet.`;
      if (step === 1 || step === 2) signs.forEach((n) => { if (singletons.has(+n.dataset.s)) n.classList.add("logo"); });
      if (step === 1) stepText.innerHTML = `a sign that appears completely alone has to carry a whole meaning by itself. those <b>singletons</b> are the first word-sign candidates: <b>${list([...singletons])}</b>.`;
      if (step === 2) {
        signs.forEach((n) => { if (expanded.has(+n.dataset.s)) n.classList.add("expand"); });
        const e = [...expanded].map(([s, k]) => `${s} (shares slots with ${k})`);
        stepText.innerHTML = `a sign that keeps filling the same slots as the candidates is probably doing the same job. expanding by shared neighbours adds <b>${list(e)}</b>.`;
      }
      if (step === 3) {
        const th = +excl.value; exclOut.textContent = th.toFixed(2);
        const on = allPairs.filter((p) => p.ex >= th - 1e-9);
        rowsEl.forEach((row, r) => {
          const ins = corpus[r], spans = $$(".sign", row);
          ins.forEach((s, i) => {
            if (i < ins.length - 1 && on.some((p) => p.a === s && p.b === ins[i + 1])) [spans[i], spans[i + 1]].forEach((n) => n.classList.add("pair"));
          });
        });
        signs.forEach((n) => { if (!n.classList.contains("pair")) n.classList.add("dim"); });
        stepText.innerHTML = "some pairs almost never appear apart. if a is nearly always followed by b, and b nearly always preceded by a, they behave like syllables spelling one word. lower the threshold to admit weaker pairs.";
        pairList.innerHTML = allPairs.map((p) => `<li class="${p.ex >= th - 1e-9 ? "on" : ""}"><span>${p.a} + ${p.b}</span><span class="num">${p.ex.toFixed(2)}</span></li>`).join("");
      }
    }
    const tabs = $$("#indus-lab [role=tab]"), panel = $("#indus-panel");
    function select(tab, focus) {
      step = +tab.dataset.step;
      tabs.forEach((t) => { const on = t === tab; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
      panel.setAttribute("aria-labelledby", tab.id);
      if (focus) tab.focus();
      paint();
    }
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t, false));
      t.addEventListener("keydown", (e) => {
        const idx = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (idx === undefined) return;
        e.preventDefault(); select(tabs[(idx + tabs.length) % tabs.length], true);
      });
    });
    excl.addEventListener("input", paint);
    paint();
  })();

  /* ---------- ReachBot retrieval gate ---------- */
  (() => {
    const svg = $("#rag-svg");
    if (!svg) return;
    const input = $("#rag-sim"), out = $("#rag-out"), mode = $("#rag-mode");
    const chips = $$("#rag-lab [data-sim]");
    const lo = 0.4, hi = 0.9;
    let W = 520;
    const passages = (s) => s < 0.6 ? 0 : s < 0.7 ? 5 : Math.round(3 + Math.min(1, (s - 0.7) / 0.15) * 22);
    function render() {
      const sim = +input.value;
      out.textContent = sim.toFixed(2);
      svg.innerHTML = "";
      const acc = css("--accent"), rule = css("--rule-2"), faint = css("--faint"), wash = css("--accent-wash");
      const sx = (v) => ((v - lo) / (hi - lo)) * W;
      [[lo, 0.6, faint, "not covered"], [0.6, 0.7, wash, "cautious"], [0.7, hi, wash, "answer"]].forEach(([a, b, f, t]) => {
        el("rect", { x: sx(a), y: 18, width: sx(b) - sx(a) - 1, height: 20, fill: f }, svg);
        el("text", { x: (sx(a) + sx(b)) / 2, y: 12, "text-anchor": "middle" }, svg).textContent = t;
      });
      el("path", { d: `M${sx(sim)},14 V42`, stroke: acc, "stroke-width": 2 }, svg);
      const n = passages(sim), size = Math.min(14, (W - 24 * 3) / 25);
      el("text", { x: 0, y: 66, class: "ink" }, svg).textContent = `passages sent to the model: ${n}`;
      for (let i = 0; i < 25; i++) el("rect", { x: i * (size + 3), y: 76, width: size, height: size, rx: 1.5, fill: i < n ? acc : "none", stroke: i < n ? acc : rule }, svg);
      chips.forEach((c) => c.setAttribute("aria-pressed", Math.abs(+c.dataset.sim - sim) < 0.005 ? "true" : "false"));
      mode.innerHTML = sim < 0.6
        ? "<b>not covered.</b> the evidence is weak, so it says the library doesn't cover this instead of improvising."
        : sim < 0.7
          ? "<b>cautious.</b> only 5 passages go to the model, with a note that the evidence is thin."
          : `<b>answer.</b> up to ${n} passages, scaled to how strong the evidence is. every claim carries a citation.`;
    }
    input.addEventListener("input", render);
    chips.forEach((c) => c.addEventListener("click", () => { input.value = c.dataset.sim; render(); }));
    responsive(svg, 96, (w) => { W = w; render(); });
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
    const ta = $("#quote"), out = $("#q-result"), chips = $$("#quote-lab .chip");
    const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const norm = (t) => t.toLowerCase().replace(/\s+/g, " ");
    function check() {
      const q = ta.value.trim();
      chips.forEach((c) => c.setAttribute("aria-pressed", presets[+c.dataset.q] === ta.value ? "true" : "false"));
      const idx = q.length ? essay.indexOf(q) : -1;
      if (idx >= 0 && q.length >= 12) {
        essayEl.innerHTML = esc(essay.slice(0, idx)) + "<mark>" + esc(q) + "</mark>" + esc(essay.slice(idx + q.length));
        out.className = "q-result pass"; out.textContent = "accepted · appears word for word, so the score can stand";
        return;
      }
      essayEl.textContent = essay;
      out.className = "q-result fail";
      if (!q.length) out.textContent = "rejected · no evidence, no score";
      else if (q.length < 12) out.textContent = "rejected · too short to count as evidence";
      else if (norm(essay).includes(norm(q))) out.textContent = "rejected · close, but the check is exact";
      else out.textContent = "rejected · these words never appear in the application";
    }
    chips.forEach((b) => b.addEventListener("click", () => { ta.value = presets[+b.dataset.q]; check(); }));
    ta.addEventListener("input", check);
    ta.value = presets[0]; check();
  })();

  /* ---------- TDX replication results ---------- */
  (() => {
    const svg = $("#tdx-svg");
    if (!svg) return;
    responsive(svg, 64, (w) => {
      svg.innerHTML = "";
      const acc = css("--accent"), rule = css("--rule-2");
      const n = 27, ok = 19, gap = 3, size = Math.min(18, (w - gap * (n - 1)) / n);
      for (let i = 0; i < n; i++) el("rect", { x: i * (size + gap), y: 4, width: size, height: size * 1.5, rx: 1.5, fill: i < ok ? acc : "none", stroke: i < ok ? acc : rule }, svg);
      el("text", { x: 0, y: 4 + size * 1.5 + 18, class: "acc" }, svg).textContent = "19 re-ran and matched";
      el("text", { x: ok * (size + gap), y: 4 + size * 1.5 + 18 }, svg).textContent = "8 failed";
    });
  })();

  /* ---------- photos open larger ---------- */
  (() => {
    const dlg = $("#lightbox");
    if (!dlg) return;
    const img = $("img", dlg), cap = $("figcaption", dlg);
    $$("[data-full]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      img.src = a.dataset.full; img.alt = a.querySelector("img")?.alt || "";
      cap.textContent = a.dataset.cap || "";
      dlg.showModal();
    }));
    dlg.addEventListener("click", () => dlg.close());
  })();

  /* ---------- entries ease in as they arrive ---------- */
  (() => {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("reveal");
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.08 });
    $$(".entry").forEach((n) => io.observe(n));
  })();
})();
