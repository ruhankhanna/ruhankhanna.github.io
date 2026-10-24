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
      if (!isFinite(sec) || sec <= 0) { msg.textContent = "try something like 4:35 or 2:01.5"; tIn.setAttribute("aria-invalid", "true"); return; }
      const v = VD.vdot(d, sec);
      if (!isFinite(v) || v < 25 || v > 90) { msg.textContent = "that's outside what the formula handles"; tIn.setAttribute("aria-invalid", "true"); return; }
      tIn.removeAttribute("aria-invalid");
      out.textContent = v.toFixed(1);
      msg.textContent = v > 78 ? "that's world-class" : v > 69 ? "college varsity level" : v > 58 ? "a strong high school runner" : "still developing";
      eq.innerHTML = events.map(([dist, name]) =>
        `<div class="${Math.abs(dist - d) < 1 ? "self" : ""}"><dt>${name}</dt><dd>${fmt(VD.timeFor(dist, v))}</dd></div>`).join("");
    }
    ev.addEventListener("change", run);
    tIn.addEventListener("input", run);
    run();
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
    const rows = investors.map((inv) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rk num"></span><span class="nm">${inv.n}</span><span class="segs">${F.map((f) => `<i class="s-${f}"></i>`).join("")}</span><span class="sc num"></span>`;
      list.appendChild(li);
      return { inv, li };
    });
    const chips = $$("#rank-lab [data-s]");
    // rows sit in normal flow; a reorder slides each row from its old spot to its new one
    function show(key, animate) {
      chips.forEach((c) => c.setAttribute("aria-pressed", c.dataset.s === key ? "true" : "false"));
      const before = new Map(rows.map((r) => [r.li, r.li.getBoundingClientRect().top]));
      const scored = rows.map((r) => ({ ...r, s: r.inv.f[key].reduce((a, v, i) => a + v * W[i], 0) })).sort((a, b) => b.s - a.s);
      scored.forEach((r, i) => {
        list.appendChild(r.li);
        r.li.querySelector(".rk").textContent = String(i + 1).padStart(2, "0");
        r.li.querySelector(".sc").textContent = r.s.toFixed(2);
        r.li.classList.toggle("lead", i < 2);
        r.li.querySelectorAll(".segs i").forEach((seg, k) => { seg.style.width = `${r.inv.f[key][k] * W[k] * 100}%`; });
      });
      if (!animate || reduceMotion) return;
      rows.forEach(({ li }) => {
        const dy = before.get(li) - li.getBoundingClientRect().top;
        if (!dy) return;
        li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 550, easing: "cubic-bezier(.2,.7,.2,1)" });
      });
    }
    chips.forEach((c) => c.addEventListener("click", () => show(c.dataset.s, true)));
    show("k12", false);
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
        ? `at ${speed} mph the battery dies <b>${(60 - a.dead).toFixed(0)} minutes early</b>. with pacing the driver backs off and ends up <b>${gain.toFixed(1)} laps ahead</b>.`
        : a.left > 5
          ? `at ${speed} mph the driver finishes with <b>${a.left.toFixed(0)}% of the battery left over</b>. pacing uses it up and gets <b>${gain.toFixed(1)} more laps</b>.`
          : `${speed} mph is about the best steady speed for this car. pacing gets there without the driver having to know that.`;
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
        ? "<b>not covered.</b> nothing in the library is close enough, so it says so instead of making something up."
        : sim < 0.7
          ? "<b>careful.</b> it only gets 5 passages, plus a note that the evidence is thin."
          : `<b>answer.</b> it gets ${n} passages, more when the match is stronger, and cites every claim.`;
    }
    input.addEventListener("input", render);
    chips.forEach((c) => c.addEventListener("click", () => { input.value = c.dataset.sim; render(); }));
    responsive(svg, 96, (w) => { W = w; render(); });
  })();

  /* ---------- fig. 0: each project's track from question to use ---------- */
  (() => {
    const rows = $$(".index-row");
    if (!rows.length) return;
    const names = ["asked", "built", "paper", "in use"];
    rows.forEach((r, k) => {
      const st = r.dataset.stages.split("").map(Number);
      const trk = $(".trk", r);
      const last = st.lastIndexOf(1);
      trk.innerHTML = st.map((on, i) =>
        (i ? `<i class="seg${i <= last ? " on" : ""}"></i>` : "") +
        `<i class="dot${on ? " on" : ""}${i === 3 && on ? " use" : ""}" title="${names[i]}${on ? "" : ": not yet"}"></i>`).join("");
      trk.setAttribute("aria-label", names.filter((_, i) => st[i]).join(", "));
      trk.style.setProperty("--d", `${k * 70}ms`);
    });
    if (!reduceMotion) requestAnimationFrame(() => requestAnimationFrame(() => $(".index").classList.add("drawn")));
    else $(".index").classList.add("drawn");
  })();

  /* ---------- Pan-Out: model vs ratings (data/report_tennis.json, plus real ATP careers) ---------- */
  (() => {
    const svg = $("#po-svg");
    if (!svg) return;
    // the d1 mid-major tier from pan-out's data/report_tennis.json
    const groups = [["simulated junior players", 0.843, 0.942]];
    responsive(svg, 112, (w) => {
      svg.innerHTML = "";
      const acc = css("--accent"), ink = css("--ink"), rule = css("--rule"), muted = css("--muted");
      const L = w < 480 ? 92 : 104, R = w - 52;
      const sx = (v) => L + ((v - 0.5) / 0.5) * (R - L); // 50% is a coin flip, so bars start there
      el("line", { x1: L, x2: L, y1: 18, y2: 92, stroke: rule }, svg);
      el("text", { x: L, y: 108, "text-anchor": "middle" }, svg).textContent = "50% · coin flip";
      el("text", { x: R, y: 108, "text-anchor": "end" }, svg).textContent = "100%";
      groups.forEach(([name, ratings, model], g) => {
        const y = 22 + g * 84;
        el("text", { x: 0, y: y + 4, class: "ink" }, svg).textContent = name;
        [["ratings", ratings, false], ["pan-out", model, true]].forEach(([lab, v, hot], k) => {
          const by = y + 16 + k * 24;
          el("text", { x: L - 10, y: by + 11, "text-anchor": "end", class: hot ? "acc" : "" }, svg).textContent = lab;
          el("rect", { x: L, y: by, width: sx(v) - L, height: 16, rx: 2, fill: hot ? acc : ink, "fill-opacity": hot ? 1 : 0.16 }, svg);
          el("text", { x: sx(v) + 6, y: by + 12, class: hot ? "acc" : "ink" }, svg).textContent = `${(v * 100).toFixed(1)}%`;
        });
      });
      void muted;
    });
  })();

  /* ---------- TDX: an attestation receipt you can tamper with ---------- */
  (() => {
    const list = $("#att-steps");
    if (!list) return;
    // FNV-1a, shortened. A toy stand-in for sha-384, but it really is computed from the text.
    const h = (t) => { let x = 0x811c9dc5; for (const c of t) { x ^= c.charCodeAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, "0"); };
    const published = "beta <- coef(lm(wage ~ training, data = d))";
    const edited = "beta <- coef(lm(wage ~ training + tenure, data = d))";
    const tamperBtn = $("#att-tamper"), runBtn = $("#att-run"), out = $("#att-out");
    let tamper = false, shown = 0, timer = 0;
    function steps() {
      const ran = tamper ? edited : published;
      const meas = h("tdx:" + ran), pub = h("tdx:" + published), res = h("out:" + ran);
      return [
        ["the journal's package", `<code>${published}</code>`, `published hash <b>${pub}</b>`],
        ["load it into a tdx vm", `<code class="${tamper ? "bad" : ""}">${ran}</code>`, `cpu measures what it loaded: <b class="${tamper ? "bad" : ""}">${meas}</b>`],
        ["run it", "the replication script produces the paper's tables", `output hash <b>${res}</b>`],
        ["cpu signs a quote", "measurement + output, signed with a key only the hardware holds", `quote <b>${h(meas + res)}</b>`],
        ["anyone checks it", `does the measurement equal the published hash?`, tamper ? `<b class="bad">${meas} ≠ ${pub} · rejected</b>` : `<b class="ok">${meas} = ${pub} · verified</b>`],
      ];
    }
    function render() {
      list.innerHTML = steps().map(([t, d, v], i) =>
        `<li class="${i < shown ? "on" : ""}"><span class="n mono">${i + 1}</span><div><b>${t}</b><p>${d}</p><p class="mono v">${v}</p></div></li>`).join("");
      out.innerHTML = shown < 5 ? "" : tamper
        ? "<b>caught.</b> one edited line changes the measurement, so the signed record no longer matches the code anyone can download."
        : "<b>verified.</b> the record shows this exact published code made these results, and you don't have to take the author's or the cloud's word for it.";
    }
    function run() {
      clearInterval(timer); shown = 0; render();
      if (reduceMotion) { shown = 5; render(); return; }
      timer = setInterval(() => { shown++; render(); if (shown >= 5) clearInterval(timer); }, 420);
    }
    runBtn.addEventListener("click", run);
    tamperBtn.addEventListener("click", () => { tamper = !tamper; tamperBtn.setAttribute("aria-pressed", tamper); run(); });
    shown = 5; render();
  })();

  /* ---------- StackUp: read, score with receipts, ask ---------- */
  (() => {
    const body = $("#su-body");
    if (!body) return;
    const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const REPOS = {
      bus: {
        files: [["app.py", 182], ["poller.py", 96], ["cache.py", 41], ["static/map.js", 233], ["tests/test_poller.py", 64]],
        lang: "python 64% · javascript 36%", commits: [2, 5, 9, 4, 0, 0, 0, 3, 7, 11, 6, 8, 2, 4, 9, 5],
        summary: "88 commits over 4 months, one author",
        scores: [
          { k: "difficulty", v: 3, file: "poller.py", code: "def next_poll_delay(eta_s):\n    # poll fast only when a bus is close; back off otherwise\n    if eta_s is None:\n        return 300\n    return max(15, min(120, eta_s // 4))",
            quote: "return max(15, min(120, eta_s // 4))", fake: "uses exponential backoff with jitter", why: "adaptive polling tied to arrival time, not a fixed timer" },
          { k: "quality", v: 4, file: "tests/test_poller.py", code: "def test_backs_off_when_no_bus():\n    assert next_poll_delay(None) == 300\n\ndef test_never_polls_faster_than_15s():\n    assert next_poll_delay(3) == 15",
            quote: "assert next_poll_delay(3) == 15", fake: "has full integration test coverage", why: "edge cases are pinned by tests" },
        ],
        qs: ["why does next_poll_delay divide the eta by 4 and not 2?",
          "what happens to cache.py if the city feed returns a 500 at rush hour?",
          "where did the 15-second floor come from?",
          "map.js redraws every bus on each update. what changes at 200 buses?",
          "your commits stop for three weeks in the middle. what were you stuck on?"],
      },
      chess: {
        files: [["board.cpp", 410], ["movegen.cpp", 388], ["search.cpp", 205], ["eval.cpp", 140], ["perft_test.cpp", 90]],
        lang: "c++ 100%", commits: [6, 9, 12, 3, 8, 14, 10, 2, 0, 5, 7, 11, 4, 6, 3, 1],
        summary: "131 commits over 4 months, one author",
        scores: [
          { k: "difficulty", v: 5, file: "search.cpp", code: "int alphabeta(Board& b, int depth, int alpha, int beta) {\n    if (depth == 0) return quiesce(b, alpha, beta);\n    for (Move m : order(b.legal_moves())) {\n        b.make(m);\n        int score = -alphabeta(b, depth - 1, -beta, -alpha);",
            quote: "int score = -alphabeta(b, depth - 1, -beta, -alpha);", fake: "implements a transposition table with zobrist hashing", why: "negamax alpha-beta with quiescence search" },
          { k: "quality", v: 3, file: "eval.cpp", code: "// TODO: magic numbers, tune later\nint eval(const Board& b) {\n    return 100*material(b) + 7*mobility(b) - 30*doubled_pawns(b);\n}",
            quote: "// TODO: magic numbers, tune later", fake: "evaluation weights are tuned with texel tuning", why: "hand-set weights the author flagged themselves" },
        ],
        qs: ["why call quiesce at depth 0 instead of eval?",
          "how does order() sort moves, and how much faster did search get?",
          "where do the 7 and the 30 in eval come from?",
          "perft_test checks depth 5 from the start position. what bug did it catch?",
          "how does movegen stop a king from castling through check?"],
      },
    };
    let repo = "bus", step = 0, faked = false;
    const repoChips = $$("#su-lab [data-repo]"), tabs = $$("#su-lab [role=tab]");
    function render() {
      const r = REPOS[repo];
      if (step === 0) {
        const max = Math.max(...r.commits), total = r.files.reduce((a, f) => a + f[1], 0);
        body.innerHTML = `<div class="su-read">
          <ul class="tree mono">${r.files.map(([f, n]) => `<li><span>${f}</span><i style="--w:${(n / 410) * 100}%"></i><span class="num">${n}</span></li>`).join("")}
            <li class="tot"><span>${total} lines · ${r.lang}</span></li></ul>
          <div><p class="q-label">commit history, by week</p><div class="spark">${r.commits.map((c) => `<i style="--h:${(c / max) * 100}%" title="${c} commits"></i>`).join("")}</div>
          <p class="mono meta" style="margin-top:8px">${r.summary}</p></div></div>`;
      }
      if (step === 1) {
        body.innerHTML = r.scores.map((sc) => {
          const quote = faked ? sc.fake : sc.quote;
          const found = sc.code.includes(quote);
          const code = esc(sc.code).replace(esc(sc.quote), found ? `<mark>${esc(sc.quote)}</mark>` : esc(sc.quote));
          return `<div class="su-score ${found ? "" : "rej"}">
            <div class="su-k"><b>${sc.k}</b><span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${found && i <= sc.v ? "on" : ""}"></i>`).join("")}</span><span class="mono">${found ? `${sc.v} / 5 · ${sc.why}` : "score discarded"}</span></div>
            <p class="mono q">evidence: "${esc(quote)}" ${found ? `<span class="ok">✓ found in ${sc.file}</span>` : `<span class="bad">✗ not in the repo</span>`}</p>
            <pre class="mono"><span class="fn">${sc.file}</span>\n${code}</pre></div>`;
        }).join("") + `<div class="chips" style="margin-top:12px"><button type="button" class="chip" id="su-fake" aria-pressed="${faked}">let the model invent evidence</button></div>
          <p class="mono meta" style="margin-top:8px">two scores side by side. stackup never adds them up into one number.</p>`;
        $("#su-fake").addEventListener("click", () => { faked = !faked; render(); });
      }
      if (step === 2) {
        body.innerHTML = `<ol class="su-qs">${r.qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
          <p class="mono meta">they come one at a time and you can't go back. easy if you wrote it, hard to fake if you didn't.</p>`;
      }
    }
    repoChips.forEach((c) => c.addEventListener("click", () => {
      repo = c.dataset.repo; faked = false;
      repoChips.forEach((x) => x.setAttribute("aria-pressed", x === c));
      render();
    }));
    tabs.forEach((t) => t.addEventListener("click", () => {
      step = +t.dataset.step;
      tabs.forEach((x) => x.setAttribute("aria-selected", x === t));
      render();
    }));
    render();
  })();

  /* ---------- SafeGround: the app's own text, in its own languages ---------- */
  (() => {
    const screen = $("#sg-screen");
    if (!screen) return;
    // copied from the app's own translation table
    const T = {
      en: { emg: "I am being detained right now", pol: ["Police stopped you", "I am exercising my right to remain silent. I want a lawyer."], door: ["Someone is at your door", "You do NOT have to open your door. ICE cannot enter without a judicial warrant."], det: ["You are being detained", "I want to speak to a lawyer immediately."] },
      fa: { rtl: 1, emg: "من الان بازداشت شده‌ام", pol: ["پولیس شما را متوقف کرد", "من حق سکوت خود را اعمال می‌کنم. می‌خواهم وکیل داشته باشم."], door: ["کسی دروازه‌ات را می‌زند", "شما مجبور نیستید در را باز کنید. ICE بدون حکم قضایی نمی‌تواند وارد شود."], det: ["شما بازداشت شده‌اید", "می‌خواهم فوری با وکیل صحبت کنم."] },
      ar: { rtl: 1, emg: "أنا محتجز الآن", pol: ["أوقفتك الشرطة", "أنا أمارس حقي في التزام الصمت. أريد محامياً."], door: ["شخص على بابك", "لست مضطراً لفتح بابك. ICE لا يمكنه الدخول بدون أمر قضائي."], det: ["أنت محتجز", "أريد التحدث إلى محامٍ فوراً."] },
      ur: { rtl: 1, emg: "مجھے ابھی حراست میں لیا جا رہا ہے", pol: ["پولیس نے آپ کو روکا", "میں اپنا خاموش رہنے کا حق استعمال کر رہا ہوں۔ میں وکیل چاہتا ہوں۔"], door: ["کوئی آپ کے دروازے پر ہے", "آپ کو دروازہ کھولنا ضروری نہیں۔ ICE جج کے وارنٹ کے بغیر داخل نہیں ہو سکتا۔"], det: ["آپ حراست میں ہیں", "میں فوری طور پر وکیل سے بات کرنا چاہتا ہوں۔"] },
      es: { emg: "Estoy siendo detenido ahora mismo", pol: ["La policía te detuvo", "Estoy ejerciendo mi derecho a guardar silencio. Quiero un abogado."], door: ["Alguien está en tu puerta", "NO tienes que abrir tu puerta. ICE no puede entrar sin una orden firmada por un juez."], det: ["Estás siendo detenido", "Quiero hablar con un abogado inmediatamente."] },
    };
    const NOTE = {
      pol: "back home, staying quiet can look like guilt. the app explains that here it's a right.",
      door: "you don't have to open the door. ask them to slide the warrant under it.",
      det: "stay calm, don't run, don't resist, and only say these words.",
    };
    let sit = "pol", lang = "en";
    function render() {
      const t = T[lang], [title, line] = t[sit];
      screen.dir = t.rtl ? "rtl" : "ltr";
      screen.lang = lang === "fa" ? "prs" : lang;
      screen.innerHTML = `<div class="ph-bar mono" dir="ltr"><span>safeground</span><span>${lang}</span></div>
        <div class="ph-emg">${t.emg}</div>
        <p class="ph-t">${title}</p>
        <div class="ph-say"><span class="mono" dir="ltr">say this</span><p>“${line}”</p>${lang !== "en" ? `<p class="gloss" dir="ltr">${T.en[sit][1]}</p>` : ""}</div>
        <p class="ph-note" dir="ltr">${NOTE[sit]}</p>`;
    }
    const wire = (sel, key, set) => $$(`${sel} .chip`).forEach((c) => c.addEventListener("click", () => {
      set(c.dataset[key]);
      $$(`${sel} .chip`).forEach((x) => x.setAttribute("aria-pressed", x === c));
      render();
    }));
    wire("#sg-sit", "sit", (v) => (sit = v));
    wire("#sg-lang", "lang", (v) => (lang = v));
    render();
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
