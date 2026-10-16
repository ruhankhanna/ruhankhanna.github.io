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
    new ResizeObserver(() => {
      if (Math.round(svg.getBoundingClientRect().width) !== w) run();
    }).observe(svg);
    darkMQ.addEventListener("change", run);
    run();
    return run;
  }

  /* ---------- Nav: mark the section in view ---------- */
  (() => {
    const links = [...document.querySelectorAll(".nav nav a")];
    const owner = { athletiq: "work", panout: "work", fellows: "work", work: "work", indus: "research", markets: "markets", more: "markets", contact: "contact" };
    const linkFor = { work: links[0], research: links[1], markets: links[2], contact: links[3] };
    const visible = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null, bestR = 0;
      visible.forEach((r, id) => { if (r > bestR) { bestR = r; best = id; } });
      links.forEach((a) => a.removeAttribute("aria-current"));
      if (best && owner[best]) linkFor[owner[best]].setAttribute("aria-current", "true");
    }, { threshold: [0, 0.15, 0.4, 0.7], rootMargin: "-60px 0px -35% 0px" });
    Object.keys(owner).forEach((id) => { const n = document.getElementById(id); if (n) io.observe(n); });
  })();

  /* ---------- athletIQ forecast lab ----------
     Port of athletiq-coach/analytics.py: exp_weight, robust_linear_fit, forecast_times. */
  (() => {
    const svg = $("#fl-svg");
    if (!svg) return;
    const SAMPLE = [[0, 281.6], [21, 280.9], [49, 283.2], [77, 279.8], [140, 279.1], [168, 277.6], [203, 278.4], [238, 276.2]];
    const BAD_LAST = [[0, 287.0], [21, 280.0], [49, 285.5], [77, 277.0], [140, 282.0], [168, 272.0], [203, 277.0], [238, 287.5]];
    const races = SAMPLE.map((r) => r.slice());
    const T_MIN = 258, T_MAX = 290, MIN_T = 262, MAX_T = 289;
    let halfLife = 90;

    const expWeight = (daysAgo, hl) => Math.pow(0.5, daysAgo / hl);
    function linearFit(pts) {
      const n = pts.length, xb = pts.reduce((a, p) => a + p[0], 0) / n, yb = pts.reduce((a, p) => a + p[1], 0) / n;
      let num = 0, den = 0, sst = 0, ssr = 0;
      for (const [x, y] of pts) { num += (x - xb) * (y - yb); den += (x - xb) ** 2; }
      den = den || 1e-9;
      const slope = num / den, icpt = yb - slope * xb;
      for (const [x, y] of pts) { sst += (y - yb) ** 2; ssr += (y - (slope * x + icpt)) ** 2; }
      return { slope, icpt, r2: 1 - ssr / (sst || 1e-9) };
    }
    function forecast(pts) {
      const { slope, icpt, r2 } = linearFit(pts);
      const last = pts[pts.length - 1], current = last[1];
      return [90, 180, 365].map((d) => {
        const raw = Math.max(slope * (last[0] + d) + icpt, 0);
        const cap = current * (1 - 0.03 * (d / 90));
        const capped = r2 < 0.5 && raw < cap;
        return { d, t: capped ? cap : raw, raw, capped };
      });
    }
    const mmss = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(1).padStart(4, "0")}`; };
    const spoken = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m} minutes ${r.toFixed(1)} seconds`; };

    const xMax = 238 + 365;
    let W = 560, H = 300, M = { l: 46, r: 16, t: 16, b: 30 };
    const sx = (d) => M.l + (d / xMax) * (W - M.l - M.r);
    const sy = (t) => M.t + ((t - T_MIN) / (T_MAX - T_MIN)) * (H - M.t - M.b);
    const ty = (py) => T_MIN + ((py - M.t) / (H - M.t - M.b)) * (T_MAX - T_MIN);

    const gGrid = el("g", {}, svg), gLines = el("g", {}, svg), gPts = el("g", {}, svg);
    const readout = $("#fl-readout"), guard = $("#fl-guard");

    function drawGrid() {
      gGrid.innerHTML = "";
      const line = css("--line");
      for (let t = 260; t <= 290; t += 5) {
        el("line", { x1: M.l, x2: W - M.r, y1: sy(t), y2: sy(t), stroke: line }, gGrid);
        el("text", { x: M.l - 8, y: sy(t) + 4, "text-anchor": "end" }, gGrid).textContent = mmss(t).replace(".0", "");
      }
      const today = 238;
      el("line", { x1: sx(today), x2: sx(today), y1: M.t, y2: H - M.b, stroke: css("--line-strong"), "stroke-dasharray": "3 4" }, gGrid);
      const labels = W < 420 ? [["last", today], ["+6 mo", today + 180], ["+12 mo", today + 365]]
        : [["last race", today], ["+3 mo", today + 90], ["+6 mo", today + 180], ["+12 mo", today + 365]];
      labels.forEach(([lab, d]) => {
        el("text", { x: sx(d), y: H - 8, "text-anchor": d === today + 365 ? "end" : "middle" }, gGrid).textContent = lab;
      });
    }

    function render() {
      const ink = css("--ink"), acc = css("--accent"), muted = css("--muted"), bg = css("--panel-2");
      gLines.innerHTML = "";
      const last = races[races.length - 1][0];
      let sw = 0, swt = 0;
      for (const [d, t] of races) { const w = expWeight(last - d, halfLife); sw += w; swt += w * t; }
      const rating = swt / sw;
      const fit = linearFit(races);
      const fc = forecast(races);

      el("line", { x1: sx(0), x2: sx(last), y1: sy(rating), y2: sy(rating), stroke: muted, "stroke-dasharray": "2 3" }, gLines);
      el("line", { x1: sx(0), y1: sy(fit.icpt), x2: sx(last), y2: sy(fit.slope * last + fit.icpt), stroke: ink, "stroke-width": 1.5 }, gLines);
      const pathD = [`M${sx(last)},${sy(races[races.length - 1][1])}`].concat(fc.map((f) => `L${sx(last + f.d)},${sy(Math.max(f.t, T_MIN))}`)).join(" ");
      el("path", { d: pathD, fill: "none", stroke: acc, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, gLines);
      fc.forEach((f) => {
        if (f.capped) el("circle", { cx: sx(last + f.d), cy: sy(Math.max(f.raw, T_MIN)), r: 4, fill: "none", stroke: muted, "stroke-dasharray": "2 2" }, gLines);
        el("circle", { cx: sx(last + f.d), cy: sy(Math.max(f.t, T_MIN)), r: 5.5, fill: bg, stroke: acc, "stroke-width": 2 }, gLines);
      });
      // rating label sits in the projection area, away from the race points, with a halo for legibility
      el("text", { x: sx(last) + 8, y: sy(rating) + 16, class: "halo" }, gLines).textContent = `rating ${mmss(rating)}`;

      gPts.querySelectorAll(".pt").forEach((g, i) => {
        const [d, t] = races[i];
        g.setAttribute("transform", `translate(${sx(d)},${sy(t)})`);
        g.setAttribute("aria-valuenow", t.toFixed(1));
        g.setAttribute("aria-valuetext", spoken(t));
        g.querySelector(".dot").setAttribute("fill", ink);
        g.querySelector(".hit").setAttribute("r", matchMedia("(pointer: coarse)").matches ? 24 : 16);
      });

      readout.innerHTML = [
        ["Rating", mmss(rating)],
        ["Trend", `${(fit.slope * 30).toFixed(2)} s/mo`],
        ["Fit r²", fit.r2.toFixed(2), fit.r2 < 0.5],
        ["+3 mo", mmss(fc[0].t), fc[0].capped],
        ["+6 mo", mmss(fc[1].t), fc[1].capped],
        ["+12 mo", mmss(fc[2].t), fc[2].capped],
      ].map(([k, v, f]) => `<div><dt>${k}</dt><dd class="${f ? "flag" : ""}">${v}</dd></div>`).join("");

      const capped = fc.filter((f) => f.capped).map((f) => ["+3 mo", "+6 mo", "+12 mo"][[90, 180, 365].indexOf(f.d)]);
      if (capped.length) {
        guard.innerHTML = `<b>Guardrail on at ${capped.join(", ")}.</b> The fit is weak, so ${capped.length > 1 ? "those forecasts are" : "that forecast is"} held to 3% improvement per 90 days. Dashed circles show where the raw trend line pointed.`;
      } else if (fit.r2 < 0.5) {
        guard.innerHTML = `<b>Weak fit.</b> The trend already projects less than 3% improvement per 90 days, so the cap doesn't bind.`;
      } else {
        guard.textContent = "Guardrail off. The trend is consistent enough (r² of 0.5 or more) to trust the line.";
      }
    }

    races.forEach((r, i) => {
      const g = el("g", {
        class: "pt", tabindex: 0, role: "slider", "aria-orientation": "vertical",
        "aria-label": `Race ${i + 1} time`, "aria-valuemin": MIN_T, "aria-valuemax": MAX_T,
      }, gPts);
      el("circle", { class: "hit", r: 16 }, g);
      el("circle", { class: "dot", r: 6 }, g);
      g.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        g.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
          const p = pt.matrixTransform(svg.getScreenCTM().inverse());
          races[i][1] = Math.min(MAX_T, Math.max(MIN_T, ty(p.y)));
          render();
        };
        const end = () => {
          g.removeEventListener("pointermove", move);
          ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => g.removeEventListener(t, end));
        };
        g.addEventListener("pointermove", move);
        ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => g.addEventListener(t, end));
      });
      g.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 2 : 0.5;
        const v = races[i][1];
        const next = { ArrowUp: v - step, ArrowRight: v - step, ArrowDown: v + step, ArrowLeft: v + step, PageUp: v - 5, PageDown: v + 5, Home: MIN_T, End: MAX_T }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        races[i][1] = Math.min(MAX_T, Math.max(MIN_T, next));
        render();
      });
    });

    const hl = $("#fl-hl"), hlOut = $("#fl-hl-out");
    hl.addEventListener("input", () => { halfLife = +hl.value; hlOut.textContent = hl.value; render(); });
    const load = (set) => { set.forEach((r, i) => { races[i][1] = r[1]; }); render(); };
    $("#fl-noisy").addEventListener("click", () => load(BAD_LAST));
    $("#fl-reset").addEventListener("click", () => { hl.value = 90; halfLife = 90; hlOut.textContent = "90"; load(SAMPLE); });

    responsive(svg, (w) => (w < 480 ? 250 : 300), (w, h) => {
      W = w; H = h; M = { l: 46, r: w < 480 ? 10 : 16, t: 16, b: 30 };
      drawGrid(); render();
    });
  })();

  /* ---------- Pan-Out charts (numbers from the held-out report card) ---------- */
  (() => {
    const svg = $("#cohort-svg");
    if (!svg) return;
    responsive(svg, 128, (w) => {
      svg.innerHTML = "";
      const ink = css("--ink"), acc = css("--accent");
      const x0 = 1, x1 = w - 1, y0 = 1988, y1 = 2002;
      const sx = (y) => x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
      const segs = [
        ["train", "born 1995 or earlier", 1988, 1996, ink, 0.85],
        ["combine", "1996-97", 1996, 1998, ink, 0.5],
        ["calibrate", "1998-99", 1998, 2000, ink, 0.28],
        ["grade", "2000-01", 2000, 2002, acc, 1],
      ];
      el("text", { x: x0, y: 14 }, svg).textContent = "birth year";
      segs.forEach(([, , a, b, col, op]) => {
        el("rect", { x: sx(a) + 1, y: 24, width: sx(b) - sx(a) - 2, height: 32, rx: 4, fill: col, "fill-opacity": op }, svg);
      });
      el("text", { x: sx(1988), y: 76, class: "ink" }, svg).textContent = segs[0][0];
      el("text", { x: sx(1988), y: 92 }, svg).textContent = segs[0][1];
      // the three narrow segments get a stacked key on the right so labels never collide
      const right = sx(2002) - 1;
      [["combine 1996-97", 0.5], ["calibrate 1998-99", 0.28], ["grade 2000-01", 1]].forEach(([t, op], i) => {
        const y = 76 + i * 17;
        const txt = el("text", { x: right, y, "text-anchor": "end", class: i === 2 ? "acc" : "" }, svg);
        txt.textContent = t;
        el("rect", { x: right - txt.getComputedTextLength() - 16, y: y - 9, width: 10, height: 10, rx: 2, fill: i === 2 ? acc : ink, "fill-opacity": op }, svg);
      });
    });
  })();

  (() => {
    const svg = $("#auc-svg");
    if (!svg) return;
    const rows = [["Tennis", 0.843, 0.942], ["Chess", 0.841, 0.941], ["Baseball", 0.846, 0.920], ["Hockey", 0.908, 0.963]];
    responsive(svg, 222, (w) => {
      svg.innerHTML = "";
      const acc = css("--accent"), line = css("--line"), muted = css("--muted"), bg = css("--panel");
      const L = w < 480 ? 74 : 96, R = w - (w < 480 ? 46 : 60), lo = 0.8, hi = 1.0;
      const sx = (v) => L + ((v - lo) / (hi - lo)) * (R - L);
      const ticks = w < 480 ? [0.8, 0.9, 1.0] : [0.8, 0.85, 0.9, 0.95, 1.0];
      ticks.forEach((v) => {
        el("line", { x1: sx(v), x2: sx(v), y1: 10, y2: 168, stroke: line }, svg);
        el("text", { x: sx(v), y: 186, "text-anchor": "middle" }, svg).textContent = v.toFixed(2);
      });
      rows.forEach(([name, mkt, model], i) => {
        const y = 28 + i * 38;
        el("text", { x: 0, y: y + 4, class: "ink" }, svg).textContent = name;
        el("line", { x1: sx(mkt), x2: sx(model), y1: y, y2: y, stroke: acc, "stroke-width": 3, "stroke-linecap": "round" }, svg);
        el("circle", { cx: sx(mkt), cy: y, r: 6, fill: bg, stroke: muted, "stroke-width": 2 }, svg);
        el("circle", { cx: sx(model), cy: y, r: 7, fill: acc }, svg);
        el("text", { x: sx(model) + 12, y: y + 4, class: "acc" }, svg).textContent = model.toFixed(3);
        if (w >= 480) el("text", { x: sx(mkt) - 12, y: y + 4, "text-anchor": "end" }, svg).textContent = mkt.toFixed(3);
      });
      const ly = 214;
      el("circle", { cx: L + 6, cy: ly - 4, r: 5, fill: "none", stroke: muted, "stroke-width": 2 }, svg);
      el("text", { x: L + 16, y: ly }, svg).textContent = "rating alone";
      el("circle", { cx: L + 130, cy: ly - 4, r: 5, fill: acc }, svg);
      el("text", { x: L + 140, y: ly, class: "acc" }, svg).textContent = "Pan-Out";
    });
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

    // Step 1: signs that stand alone
    const singletons = new Set(corpus.filter((i) => i.length === 1).map((i) => i[0]));

    // Step 2: share a left or right neighbour with at least two distinct candidates
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

    // Step 3: exclusivity = min(P(b follows a), P(a precedes b)), for every pair worth listing
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
      if (step === 0) {
        stepText.innerHTML = `Each row is one inscription, read as a sequence of signs. This toy set has <b>${corpus.length}</b> inscriptions and <b>${count.size}</b> distinct signs. Nothing is labelled yet.`;
      }
      if (step === 1 || step === 2) {
        signs.forEach((n) => { if (singletons.has(+n.dataset.s)) n.classList.add("logo"); });
      }
      if (step === 1) {
        stepText.innerHTML = `A sign that appears completely alone has to carry a whole meaning by itself. Those <b>singletons</b> become the first logogram candidates: <b>${list([...singletons])}</b>.`;
      }
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
        stepText.innerHTML = `Some pairs almost never appear apart. If A is nearly always followed by B, and B nearly always preceded by A, they behave like syllables spelling one word. Lower the threshold to admit weaker pairs.`;
        pairList.innerHTML = allPairs.map((p) =>
          `<li class="${p.ex >= th - 1e-9 ? "on" : ""}"><span>${p.a} + ${p.b}</span><span class="num">${p.ex.toFixed(2)}</span></li>`
        ).join("");
      }
    }

    const tabs = [...document.querySelectorAll(".method-steps [role=tab]")];
    function select(tab, focus) {
      step = +tab.dataset.step;
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
      panel.setAttribute("aria-labelledby", tab.id);
      if (focus) tab.focus();
      paint();
    }
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t, false));
      t.addEventListener("keydown", (e) => {
        const idx = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (idx === undefined) return;
        e.preventDefault();
        select(tabs[(idx + tabs.length) % tabs.length], true);
      });
    });
    excl.addEventListener("input", paint);
    paint();
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
    const chips = [...document.querySelectorAll(".q-presets .chip")];
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");
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
      else if (q.length < 12) out.textContent = "Rejected. Too short to count as evidence; quote at least a phrase.";
      else if (norm(essay).includes(norm(q))) out.textContent = "Rejected. Close, but the capitalization or spacing differs. The check is exact.";
      else out.textContent = "Rejected. These words never appear in the application. Score discarded.";
    }
    chips.forEach((b) => b.addEventListener("click", () => { ta.value = presets[+b.dataset.q]; check(); }));
    ta.addEventListener("input", check);
    ta.value = presets[0]; check();
  })();
})();
