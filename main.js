(() => {
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ---------- Reveal on scroll ---------- */
  if (!reduceMotion && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-motion");
    document.querySelectorAll(".hero .reveal").forEach((n, i) => n.style.setProperty("--d", `${i * 90}ms`));
    document.querySelectorAll(".proof .reveal").forEach((n, i) => n.style.setProperty("--d", `${i * 60}ms`));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach((n) => io.observe(n));
  }

  /* ---------- athletIQ forecast lab ----------
     Port of athletiq-coach/analytics.py: exp_weight, robust_linear_fit, forecast_times. */
  const fl = (() => {
    const svg = $("#fl-svg");
    if (!svg) return;
    const W = 560, H = 330, M = { l: 48, r: 18, t: 18, b: 34 };
    const races = [[0, 281.6], [21, 280.9], [49, 283.2], [77, 279.8], [140, 279.1], [168, 277.6], [203, 278.4], [238, 276.2]];
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

    const xMax = 238 + 365;
    const sx = (d) => M.l + (d / xMax) * (W - M.l - M.r);
    let yLo = 258, yHi = 290;
    const sy = (t) => M.t + ((t - yLo) / (yHi - yLo)) * (H - M.t - M.b);
    const ty = (py) => yLo + ((py - M.t) / (H - M.t - M.b)) * (yHi - yLo);

    const gGrid = el("g", {}, svg), gLines = el("g", {}, svg), gPts = el("g", {}, svg);

    function drawGrid() {
      gGrid.innerHTML = "";
      const line = css("--line");
      for (let t = 260; t <= 290; t += 5) {
        el("line", { x1: M.l, x2: W - M.r, y1: sy(t), y2: sy(t), stroke: line }, gGrid);
        el("text", { x: M.l - 8, y: sy(t) + 4, "text-anchor": "end" }, gGrid).textContent = mmss(t).replace(".0", "");
      }
      const today = 238;
      el("line", { x1: sx(today), x2: sx(today), y1: M.t, y2: H - M.b, stroke: line, "stroke-dasharray": "3 4" }, gGrid);
      [["last race", today], ["+3 mo", today + 90], ["+6 mo", today + 180], ["+12 mo", today + 365]].forEach(([lab, d]) => {
        el("text", { x: sx(d), y: H - 12, "text-anchor": d === today + 365 ? "end" : "middle" }, gGrid).textContent = lab;
      });
    }

    const readout = $("#fl-readout");
    function render() {
      const ink = css("--ink"), acc = css("--accent"), muted = css("--muted"), bg = css("--panel-2");
      gLines.innerHTML = "";
      const last = races[races.length - 1][0];
      let sw = 0, swt = 0;
      for (const [d, t] of races) { const w = expWeight(last - d, halfLife); sw += w; swt += w * t; }
      const rating = swt / sw;
      const fit = linearFit(races);
      const fc = forecast(races);

      // weighted rating line
      el("line", { x1: sx(0), x2: sx(last), y1: sy(rating), y2: sy(rating), stroke: muted, "stroke-dasharray": "2 3" }, gLines);
      el("text", { x: sx(4), y: sy(rating) - 6 }, gLines).textContent = `rating ${mmss(rating)}`;
      // fit across data, then projection
      el("line", { x1: sx(0), y1: sy(fit.icpt), x2: sx(last), y2: sy(fit.slope * last + fit.icpt), stroke: ink, "stroke-width": 1.5 }, gLines);
      const pathD = [`M${sx(last)},${sy(races[races.length - 1][1])}`].concat(fc.map((f) => `L${sx(last + f.d)},${sy(f.t)}`)).join(" ");
      el("path", { d: pathD, fill: "none", stroke: acc, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, gLines);
      fc.forEach((f) => {
        if (f.capped) el("circle", { cx: sx(last + f.d), cy: sy(Math.max(f.raw, yLo)), r: 4, fill: "none", stroke: muted, "stroke-dasharray": "2 2" }, gLines);
        el("circle", { cx: sx(last + f.d), cy: sy(f.t), r: 5.5, fill: bg, stroke: acc, "stroke-width": 2 }, gLines);
      });

      // race points
      gPts.querySelectorAll(".pt").forEach((g, i) => {
        const [d, t] = races[i];
        g.setAttribute("transform", `translate(${sx(d)},${sy(t)})`);
        g.setAttribute("aria-valuenow", t.toFixed(1));
        g.setAttribute("aria-valuetext", `${mmss(t)}`);
        g.querySelector(".dot").setAttribute("fill", ink);
      });

      const anyCap = fc.some((f) => f.capped);
      readout.innerHTML = [
        ["rating", mmss(rating)],
        ["trend", `${(fit.slope * 30).toFixed(2)} s/mo`],
        ["fit r²", fit.r2.toFixed(2), fit.r2 < 0.5],
        ["+3 mo", mmss(fc[0].t), fc[0].capped],
        ["+6 mo", mmss(fc[1].t), fc[1].capped],
        ["+12 mo", mmss(fc[2].t), fc[2].capped],
      ].map(([k, v, f]) => `<div><dt>${k}</dt><dd class="${f ? "flag" : ""}">${v}</dd></div>`).join("");
      readout.setAttribute("title", anyCap ? "Guardrail active: weak fit, improvement capped at 3% per 90 days" : "");
      $("#fl-readout").dataset.guard = anyCap ? "on" : "off";
      guardNote.textContent = anyCap
        ? "Guardrail on. The fit is weak, so the forecast is capped at 3% improvement per 90 days. The dashed circle shows what the raw line wanted."
        : fit.r2 < 0.5
          ? "Weak fit, but the line already projects less than 3% per 90 days, so the cap does not bind."
          : "Guardrail off. The trend is consistent enough (r² ≥ 0.5) to trust the line.";
    }

    const guardNote = document.createElement("p");
    guardNote.className = "small";
    guardNote.style.margin = "12px 0 0";
    readout.after(guardNote);

    races.forEach((r, i) => {
      const g = el("g", { class: "pt", tabindex: 0, role: "slider", "aria-label": `Race ${i + 1} time`, "aria-valuemin": 262, "aria-valuemax": 292 }, gPts);
      el("circle", { class: "hit", r: 16 }, g);
      el("circle", { class: "dot", r: 6 }, g);
      g.addEventListener("pointerdown", (e) => {
        g.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
          const p = pt.matrixTransform(svg.getScreenCTM().inverse());
          races[i][1] = Math.min(289, Math.max(262, ty(p.y)));
          render();
        };
        const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); };
        g.addEventListener("pointermove", move);
        g.addEventListener("pointerup", up);
      });
      g.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 2 : 0.5;
        if (e.key === "ArrowUp") races[i][1] = Math.max(262, races[i][1] - step);
        else if (e.key === "ArrowDown") races[i][1] = Math.min(289, races[i][1] + step);
        else return;
        e.preventDefault(); render();
      });
    });

    const hl = $("#fl-hl"), hlOut = $("#fl-hl-out");
    hl.addEventListener("input", () => { halfLife = +hl.value; hlOut.textContent = hl.value; render(); });

    drawGrid(); render();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { drawGrid(); render(); });
  })();

  /* ---------- Pan-Out charts (numbers from the held-out report card) ---------- */
  (() => {
    const svg = $("#cohort-svg");
    if (!svg) return;
    const draw = () => {
      svg.innerHTML = "";
      const ink = css("--ink"), acc = css("--accent");
      const x0 = 10, x1 = 410, y0 = 1988, y1 = 2002;
      const sx = (y) => x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
      const segs = [
        ["train", "born ≤1995", 1988, 1996, ink, 0.85],
        ["stack", "96-97", 1996, 1998, ink, 0.5],
        ["calibrate", "98-99", 1998, 2000, ink, 0.28],
        ["grade", "00-01", 2000, 2002, acc, 1],
      ];
      segs.forEach(([name, yrs, a, b, col, op], i) => {
        el("rect", { x: sx(a) + 1, y: 40, width: sx(b) - sx(a) - 2, height: 36, rx: 4, fill: col, "fill-opacity": op }, svg);
        const lx = i === 0 ? sx(a) : sx(a) + (sx(b) - sx(a)) / 2;
        const anchor = i === 0 ? "start" : "middle";
        // stagger labels on two rows so the narrow segments don't collide
        const ly = i % 2 ? 126 : 98;
        el("text", { x: lx, y: ly, "text-anchor": anchor, class: i === 3 ? "acc" : "ink" }, svg).textContent = name;
        el("text", { x: lx, y: ly + 14, "text-anchor": anchor }, svg).textContent = yrs;
      });
      el("text", { x: x0, y: 24 }, svg).textContent = "birth year →";
    };
    draw();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
  })();

  (() => {
    const svg = $("#auc-svg");
    if (!svg) return;
    const rows = [["Tennis", 0.843, 0.942], ["Chess", 0.841, 0.941], ["Baseball", 0.846, 0.920], ["Hockey", 0.908, 0.963]];
    const L = 96, R = 610, lo = 0.8, hi = 1.0;
    const sx = (v) => L + ((v - lo) / (hi - lo)) * (R - L);
    let movers = [];
    const draw = (settled) => {
      svg.innerHTML = ""; movers = [];
      const ink = css("--ink"), acc = css("--accent"), line = css("--line"), muted = css("--muted"), bg = css("--panel");
      [0.8, 0.85, 0.9, 0.95, 1.0].forEach((v) => {
        el("line", { x1: sx(v), x2: sx(v), y1: 10, y2: 176, stroke: line }, svg);
        el("text", { x: sx(v), y: 194, "text-anchor": "middle" }, svg).textContent = v.toFixed(2);
      });
      rows.forEach(([name, mkt, model], i) => {
        const y = 30 + i * 40;
        el("text", { x: 0, y: y + 4, class: "ink" }, svg).textContent = name;
        const bar = el("line", { x1: sx(mkt), x2: settled ? sx(model) : sx(mkt), y1: y, y2: y, stroke: acc, "stroke-width": 3, "stroke-linecap": "round" }, svg);
        el("circle", { cx: sx(mkt), cy: y, r: 6, fill: bg, stroke: muted, "stroke-width": 2 }, svg);
        const dot = el("circle", { cx: settled ? sx(model) : sx(mkt), cy: y, r: 7, fill: acc }, svg);
        const lab = el("text", { x: sx(model) + 12, y: y + 4, class: "acc", opacity: settled ? 1 : 0 }, svg);
        lab.textContent = model.toFixed(3);
        el("text", { x: sx(mkt) - 12, y: y + 4, "text-anchor": "end" }, svg).textContent = mkt.toFixed(3);
        movers.push({ bar, dot, lab, from: sx(mkt), to: sx(model) });
      });
      const ly = 226;
      el("circle", { cx: L + 6, cy: ly - 4, r: 5, fill: "none", stroke: muted, "stroke-width": 2 }, svg);
      el("text", { x: L + 16, y: ly }, svg).textContent = "rating alone";
      el("circle", { cx: L + 190, cy: ly - 4, r: 5, fill: acc }, svg);
      el("text", { x: L + 200, y: ly, class: "acc" }, svg).textContent = "Pan-Out";
    };
    const animate = () => {
      const start = performance.now(), dur = 1100;
      const tick = (now) => {
        const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3);
        movers.forEach((m) => {
          const x = m.from + (m.to - m.from) * e;
          m.bar.setAttribute("x2", x); m.dot.setAttribute("cx", x); m.lab.setAttribute("opacity", k > 0.85 ? 1 : 0);
        });
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (reduceMotion || !("IntersectionObserver" in window)) { draw(true); }
    else {
      draw(false);
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(animate, 250); } }, { threshold: 0.5 });
      io.observe(svg);
    }
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => draw(true));
  })();

  /* ---------- Indus method walkthrough (toy corpus, computed live) ---------- */
  (() => {
    const box = $("#corpus");
    if (!box) return;
    const corpus = [
      [740], [267], [342, 740], [99, 51, 740], [99, 51, 267], [176, 59, 342, 740], [176, 59, 267],
      [220, 99, 51, 740], [12, 342], [12, 267], [415], [415, 342, 740], [176, 59, 415], [220, 12, 740],
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

    // Step 3: exclusivity = min(P(b follows a), P(a precedes b))
    const pairsAt = (th) => {
      const out = [];
      for (const [k, c] of bigram) {
        const [a, b] = k.split(">").map(Number);
        const ex = Math.min(c / count.get(a), c / count.get(b));
        if (ex >= th) out.push({ a, b, ex });
      }
      return out.sort((x, y) => y.ex - x.ex);
    };

    box.innerHTML = corpus.map((ins, r) =>
      `<div class="inscr"><span class="n">${String(r + 1).padStart(2, "0")}</span>${ins.map((s) => `<span class="sign" data-s="${s}">${s}</span>`).join("")}</div>`
    ).join("");
    const rowsEl = [...box.querySelectorAll(".inscr")];

    const stepText = $("#step-text"), exclCtl = $("#excl-ctl"), excl = $("#excl"), exclOut = $("#excl-out");
    let step = 0;
    const list = (arr) => arr.length ? arr.join(", ") : "none";

    function paint() {
      box.querySelectorAll(".sign").forEach((n) => n.className = "sign");
      exclCtl.hidden = step !== 3;
      if (step === 0) {
        stepText.innerHTML = `Each row is one inscription, read as a sequence of signs. This toy set has <b>${corpus.length}</b> inscriptions and <b>${count.size}</b> distinct signs. Nothing is labelled yet.`;
      }
      if (step >= 1 && step <= 2) {
        box.querySelectorAll(".sign").forEach((n) => { const s = +n.dataset.s; if (singletons.has(s)) n.classList.add("logo"); });
      }
      if (step === 1) {
        stepText.innerHTML = `A sign that appears completely alone has to carry a whole meaning by itself. Those <b>singletons</b> become the first logogram candidates: <b>${list([...singletons])}</b>.`;
      }
      if (step === 2) {
        box.querySelectorAll(".sign").forEach((n) => { const s = +n.dataset.s; if (expanded.has(s)) n.classList.add("expand"); });
        const e = [...expanded].map(([s, k]) => `${s} (shares slots with ${k})`);
        stepText.innerHTML = `A sign that keeps filling the same slots as the candidates is probably doing the same job. Expanding by shared neighbours adds <b>${list(e)}</b>.`;
      }
      if (step === 3) {
        const th = +excl.value; exclOut.textContent = th.toFixed(2);
        const pairs = pairsAt(th);
        rowsEl.forEach((row, r) => {
          const ins = corpus[r], spans = row.querySelectorAll(".sign");
          ins.forEach((s, i) => {
            if (i < ins.length - 1 && pairs.some((p) => p.a === s && p.b === ins[i + 1])) { spans[i].classList.add("pair"); spans[i + 1].classList.add("pair"); }
          });
        });
        box.querySelectorAll(".sign:not(.pair)").forEach((n) => n.classList.add("dim"));
        stepText.innerHTML = `Some pairs almost never appear apart. If A is nearly always followed by B, and B nearly always preceded by A, they behave like syllables spelling one word. At this threshold: <b>${list(pairs.map((p) => `${p.a}+${p.b} (${p.ex.toFixed(2)})`))}</b>.`;
      }
    }

    const tabs = [...document.querySelectorAll(".method-steps button")];
    tabs.forEach((b) => b.addEventListener("click", () => {
      step = +b.dataset.step;
      tabs.forEach((t) => t.setAttribute("aria-selected", t === b ? "true" : "false"));
      paint();
    }));
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
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    function check() {
      const q = ta.value.trim();
      const idx = q.length ? essay.indexOf(q) : -1;
      if (idx >= 0 && q.length >= 12) {
        essayEl.innerHTML = esc(essay.slice(0, idx)) + "<mark>" + esc(q) + "</mark>" + esc(essay.slice(idx + q.length));
        out.className = "q-result pass"; out.textContent = "Accepted. The quote is a literal substring, so the score can stand.";
      } else {
        essayEl.textContent = essay;
        out.className = "q-result fail";
        out.textContent = !q.length ? "Rejected. No evidence, no score."
          : q.length < 12 ? "Rejected. Too short to count as evidence."
          : "Rejected. Not found word for word in the application. Score discarded.";
      }
    }
    document.querySelectorAll(".q-presets button").forEach((b) => b.addEventListener("click", () => { ta.value = presets[+b.dataset.q]; check(); }));
    ta.addEventListener("input", check);
    ta.value = presets[0]; check();
  })();

  /* ---------- Optional media: hide gracefully until real files exist ---------- */
  const secretImg = $("#secret-photo img");
  if (secretImg) {
    const noPhoto = () => $("#secret").classList.add("no-photo");
    secretImg.addEventListener("error", noPhoto);
    if (secretImg.complete && !secretImg.naturalWidth) noPhoto();
  }
  const reel = $("#reel");
  if (reel) {
    const hideFilm = () => { $("#film").hidden = true; };
    reel.querySelector("source").addEventListener("error", hideFilm);
    reel.addEventListener("error", hideFilm);
    fetch("assets/reel.mp4", { method: "HEAD" }).then((r) => { if (!r.ok) hideFilm(); }).catch(hideFilm);
  }
})();
