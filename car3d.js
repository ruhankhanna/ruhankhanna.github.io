import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* SECRET in 3D: a line-drawn model you can turn, explode and take apart.
   Units are metres. +x is the nose, +y is up, z is across the car. */

const root = document.getElementById("car3d");
if (root) init(root);

function init(root) {
  const canvas = root.querySelector("canvas");
  const info = root.querySelector(".car-info");
  const list = root.querySelector(".car-parts");
  const explodeIn = root.querySelector("#car-explode");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const INK = new THREE.Color(css("--ink") || "#1d1c1a");
  const ACCENT = new THREE.Color(css("--accent") || "#2448c8");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    root.classList.add("no-webgl");
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(2.5, 1.55, 2.85);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e7e2, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2.5, 5, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.09 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.4;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.32, 0);
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.6;

  /* ---------- materials ---------- */
  const mats = [];
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, transparent: true, ...extra });
    mats.push(m);
    return m;
  };
  const M = {
    shell: mat(0xfbfaf8, { side: THREE.DoubleSide }),
    black: mat(0x2a2a2a),
    rubber: mat(0x232323, { roughness: 0.9 }),
    alu: mat(0xc9ccd1, { metalness: 0.5, roughness: 0.4 }),
    red: mat(0xc0392b),
    batt: mat(0x3a3b3d),
    pcb: mat(0x2f6b4f),
    screen: mat(0x1b2a3a, { roughness: 0.3 }),
    yellow: mat(0xc9a227), green: mat(0x3f8a55), blue: mat(0x3e64b0),
    cable: mat(0x1f1f1f),
  };

  /* ---------- parts: each is a group that can glow, fade and explode ---------- */
  const parts = [];
  function part(id, name, sub, offset, desc) {
    const g = new THREE.Group();
    g.userData = { id, name, sub, desc, offset: new THREE.Vector3(...offset) };
    scene.add(g);
    parts.push(g);
    return g;
  }
  function add(g, geo, material, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const cyl = (r, h, s = 24) => new THREE.CylinderGeometry(r, r, h, s);
  const tube = (pts, r, s = 48) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), s, r, 10, false);

  // A loft through U-shaped cross sections: the fairing is a white tub, open over the cockpit.
  function loft(n, sectionAt, arcFrom, arcTo, seg = 28) {
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, { x, w, d, y0 } = sectionAt(t);
      for (let j = 0; j <= seg; j++) {
        const a = arcFrom + (arcTo - arcFrom) * (j / seg);
        pos.push(x, y0 + Math.sin(a) * d, Math.cos(a) * w);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  const L = 2.5, X0 = -1.15; // tail at X0, nose at X0 + L
  const profile = (t) => {
    // t: 0 = tail, 1 = nose. Width and depth swell through the cockpit and taper to a rounded nose.
    const s = Math.sin(Math.PI * Math.pow(t, 0.85));
    const nose = t > 0.8 ? Math.cos(((t - 0.8) / 0.2) * Math.PI / 2) : 1;
    const tip = t > 0.9 ? 1 - 0.85 * ((t - 0.9) / 0.1) : 1; // pinch the nose closed
    return { x: X0 + t * L, w: (0.08 + (t < 0.15 ? 0.05 : 0)) * tip + 0.27 * s * nose, d: 0.06 * tip + 0.26 * s * nose, y0: 0.38 };
  };

  /* 01 body shell */
  {
    const g = part("shell", "body shell", "the white fairing", [0, 0.95, 0],
      "The fairing over the chassis. At race speed most of the battery goes into pushing air, so the shell's shape does more for range than almost anything else on the car.");
    add(g, loft(40, profile, Math.PI * 1.02, Math.PI * 1.98), M.shell);
    // closed nose deck in front of the driver
    add(g, loft(16, (t) => profile(0.64 + t * 0.36), Math.PI * -0.02, Math.PI * 1.02), M.shell);
    // star decal on the nose
    const star = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.018 : 0.045, a = Math.PI / 2 + (k * Math.PI) / 5;
      k ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    add(g, new THREE.ShapeGeometry(star), M.red, [X0 + L * 0.86, 0.66, 0], [-Math.PI / 2, 0, -Math.PI / 2]);
  }

  /* 02 chassis */
  {
    const g = part("chassis", "aluminum chassis", "rebuilt by us", [0, -0.28, 0],
      "We rebuilt the chassis in aluminum: lighter than the original, with mounting points where we wanted the battery and electronics to sit.");
    [-0.17, 0.17].forEach((z) => add(g, box(2.0, 0.04, 0.04), M.alu, [0.05, 0.16, z]));
    [-0.85, -0.35, 0.35, 0.95].forEach((x) => add(g, box(0.04, 0.04, 0.38), M.alu, [x, 0.16, 0]));
    add(g, box(0.05, 0.05, 0.98), M.alu, [0.82, 0.2, 0]); // front axle beam
    add(g, box(0.5, 0.03, 0.05), M.alu, [-0.92, 0.2, 0]); // rear swing
  }

  /* 03 roll hoop + seat + harness */
  {
    const g = part("cockpit", "roll hoop, seat, harness", "driver safety cell", [0, 0.55, 0],
      "The roll hoop has to clear the driver's helmet if the car goes over. The seat sits low and reclined to keep the frontal area, and so the drag, small. A harness holds the driver in.");
    add(g, tube([[-0.25, 0.2, -0.2], [-0.27, 0.72, -0.2], [-0.28, 0.9, -0.1], [-0.28, 0.92, 0.1], [-0.27, 0.72, 0.2], [-0.25, 0.2, 0.2]], 0.017), M.black);
    [-0.2, 0.2].forEach((z) => add(g, tube([[-0.27, 0.78, z], [-0.55, 0.35, z * 0.8]], 0.013, 8), M.black));
    add(g, box(0.42, 0.06, 0.34), M.black, [0.0, 0.26, 0], [0, 0, -0.08]);
    add(g, box(0.06, 0.48, 0.34), M.black, [-0.22, 0.5, 0], [0, 0, 0.32]);
    [-0.08, 0.08].forEach((z) => add(g, box(0.012, 0.42, 0.05), M.red, [-0.17, 0.5, z], [0, 0, 0.32]));
    add(g, box(0.25, 0.012, 0.3), M.red, [0.06, 0.31, 0]);
  }

  /* 04 steering + throttle */
  {
    const g = part("steer", "steering yoke + thumb throttle", "regen on 0–20%", [0.2, 0.45, 0],
      "A yoke rather than a round wheel, to fit the narrow cockpit. The thumb throttle is a hall-effect sensor on the right grip; the first 20% of its travel is regenerative braking, so easing off puts energy back in the pack.");
    add(g, cyl(0.014, 0.42), M.black, [0.62, 0.48, 0], [0, 0, Math.PI / 2 - 0.5]);
    add(g, tube([[0.8, 0.62, -0.17], [0.82, 0.66, -0.08], [0.82, 0.66, 0.08], [0.8, 0.62, 0.17]], 0.016, 16), M.black);
    [-0.17, 0.17].forEach((z) => add(g, cyl(0.022, 0.09), M.rubber, [0.8, 0.62, z], [Math.PI / 2, 0, 0]));
    add(g, box(0.035, 0.03, 0.03), M.blue, [0.78, 0.65, 0.13]);
  }

  /* 05 dash electronics */
  {
    const g = part("dash", "cycle analyst, arduino, display", "the pacing brain", [0.3, 0.75, 0],
      "The cycle analyst counts every amp-hour through the shunt. Our Arduino reads it each lap, divides what is left by the laps left in the hour, and tells the driver on the display: speed up, hold, or back off.");
    add(g, box(0.07, 0.06, 0.11), M.black, [0.86, 0.74, -0.07], [0, 0, -0.4]);
    add(g, box(0.005, 0.04, 0.08), M.screen, [0.83, 0.75, -0.07], [0, 0, -0.4]);
    add(g, box(0.07, 0.01, 0.055), M.pcb, [0.9, 0.7, 0.06]);
    add(g, box(0.06, 0.07, 0.12), M.black, [0.88, 0.76, 0.08], [0, 0, -0.4]);
    add(g, box(0.005, 0.05, 0.09), M.screen, [0.85, 0.77, 0.08], [0, 0, -0.4]);
  }

  /* 06 front wheels */
  {
    const g = part("front", "front wheels", "steered, outboard", [0.1, 0, 0],
      "Steered wheels mounted outboard of the body. Alignment is free range: a wheel that is toed in even slightly scrubs energy every metre of the hour.");
    [-1, 1].forEach((s) => {
      const z = s * 0.5;
      add(g, new THREE.TorusGeometry(0.2, 0.032, 14, 40), M.rubber, [0.82, 0.23, z]);
      add(g, cyl(0.17, 0.03, 32), M.alu, [0.82, 0.23, z], [Math.PI / 2, 0, 0]);
      add(g, cyl(0.06, 0.08, 20), M.alu, [0.82, 0.23, z], [Math.PI / 2, 0, 0]);
      add(g, box(0.03, 0.03, 0.1), M.black, [0.82, 0.23, s * 0.43]);
      add(g, box(0.02, 0.05, 0.08), M.black, [0.62, 0.58, s * 0.36], [0, s * 0.3, 0]);
    });
    g.userData.offset.set(0, 0, 0); // wheels explode outward per side instead
    g.children.forEach((c) => { c.userData.side = Math.sign(c.position.z); });
  }

  /* 07 hub motor (rear) */
  {
    const g = part("motor", "rear hub motor", "brushless dc, in the wheel", [-0.55, 0.1, 0],
      "A brushless DC motor built into the rear wheel, so there is no chain or gearbox to lose energy in. Its three phases come from the controller; hall sensors tell the controller where the rotor is so it can time each switch.");
    add(g, new THREE.TorusGeometry(0.2, 0.034, 14, 40), M.rubber, [-1.0, 0.23, 0]);
    add(g, cyl(0.17, 0.035, 32), M.alu, [-1.0, 0.23, 0], [Math.PI / 2, 0, 0]);
    add(g, cyl(0.1, 0.11, 32), M.black, [-1.0, 0.23, 0], [Math.PI / 2, 0, 0]);
    [[M.yellow, -0.02], [M.green, 0], [M.blue, 0.02]].forEach(([m, dz]) =>
      add(g, tube([[-0.97, 0.3, 0.06 + dz], [-0.88, 0.36, 0.08 + dz], [-0.72, 0.36, 0.1 + dz], [-0.62, 0.33, 0.1 + dz]], 0.006, 16), m));
  }

  /* 08 battery pack */
  {
    const g = part("batt", "battery pack", "4 × 12 V lead-acid = 48 V", [-0.15, 0.75, 0],
      "Four 12 V sealed lead-acid batteries in series. Lead-acid loses usable capacity when you pull hard (Peukert's law), so a driver who goes out fast doesn't just run out sooner, they get less total energy. That is the whole case for pacing.");
    [[-0.5, -0.1], [-0.5, 0.1], [-0.3, -0.1], [-0.3, 0.1]].forEach(([x, z]) => {
      add(g, box(0.17, 0.16, 0.18), M.batt, [x, 0.27, z]);
      add(g, cyl(0.012, 0.02, 10), M.red, [x + 0.05, 0.36, z - 0.05]);
      add(g, cyl(0.012, 0.02, 10), M.black, [x - 0.05, 0.36, z - 0.05]);
    });
    add(g, tube([[-0.55, 0.37, -0.05], [-0.4, 0.42, 0], [-0.25, 0.37, 0.05]], 0.008, 12), M.cable);
  }

  /* 09 controller + power path */
  {
    const g = part("power", "controller, contactor, fuse, kill switches", "48 V dc → 3-phase", [-0.35, 1.05, 0],
      "Power runs battery → two keyed kill switches → 100 A fuse → contactor → controller. A precharge resistor fills the controller's capacitors before the contactor closes; switching straight onto 48 V would hit them with an inrush spike.");
    add(g, box(0.16, 0.06, 0.12), M.alu, [-0.62, 0.3, 0.08]);
    for (let k = 0; k < 6; k++) add(g, box(0.15, 0.02, 0.005), M.alu, [-0.62, 0.34, 0.03 + k * 0.02]);
    add(g, cyl(0.025, 0.06, 16), M.black, [-0.66, 0.31, -0.12]);
    add(g, box(0.05, 0.02, 0.025), M.alu, [-0.56, 0.3, -0.13]);
    [-0.26, 0.26].forEach((z) => {
      add(g, cyl(0.022, 0.03, 16), M.black, [0.22, 0.37, z]);
      add(g, box(0.012, 0.035, 0.02), M.red, [0.22, 0.4, z]);
    });
  }

  /* ---------- outlines: the "drawing" look ---------- */
  const lineMats = [];
  parts.forEach((g) => {
    g.traverse((o) => {
      if (!o.isMesh) return;
      const lm = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 });
      lineMats.push(lm);
      o.material = o.material.clone();
      o.userData.lm = lm;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 32), lm);
      o.add(e);
    });
    g.userData.home = g.position.clone();
  });

  /* ---------- parts list ---------- */
  parts.forEach((g, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" data-id="${g.userData.id}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="t">${g.userData.name}</span><span class="s">${g.userData.sub}</span></button>`;
    list.appendChild(li);
  });
  const buttons = [...list.querySelectorAll("button")];

  let selected = null, hovered = null;
  function paint() {
    parts.forEach((g) => {
      const id = g.userData.id;
      const on = !selected || selected === id;
      const hot = selected === id || hovered === id;
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.material.opacity = on ? 1 : 0.12;
        o.material.depthWrite = on;
        o.material.emissive?.set(selected === id ? 0x0b1a55 : 0x000000);
        o.userData.lm.color.copy(hot ? ACCENT : INK);
        o.userData.lm.opacity = on ? (hot ? 0.95 : 0.5) : 0.08;
      });
    });
    buttons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === selected ? "true" : "false"));
    const g = parts.find((p) => p.userData.id === selected);
    info.innerHTML = g
      ? `<b>${g.userData.name}</b>${g.userData.desc}`
      : "<b>drag to turn it, slide to take it apart.</b>pick a part to see what it does. the whole car is built around one constraint: the most distance in an hour on one charge.";
    needsRender = true;
  }
  function select(id) {
    selected = selected === id ? null : id;
    controls.autoRotate = false;
    paint();
  }
  buttons.forEach((b) => {
    b.addEventListener("click", () => select(b.dataset.id));
    b.addEventListener("pointerenter", () => { hovered = b.dataset.id; paint(); });
    b.addEventListener("pointerleave", () => { hovered = null; paint(); });
  });

  /* ---------- picking in the canvas ---------- */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(parts, true).find((h) => h.object.isMesh && h.object.material.opacity > 0.5);
    let o = hit?.object;
    while (o && !parts.includes(o)) o = o.parent;
    return o?.userData.id ?? null;
  };
  let downAt = null;
  canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; controls.autoRotate = false; });
  canvas.addEventListener("pointerup", (e) => {
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) {
      const id = pick(e);
      if (id) select(id); else if (selected) { selected = null; paint(); }
    }
    downAt = null;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || downAt) return;
    const id = pick(e);
    if (id !== hovered) { hovered = id; canvas.style.cursor = id ? "pointer" : "grab"; paint(); }
  });

  /* ---------- explode ---------- */
  let explode = 0, target = 0, lastE = 0;
  const offset = new THREE.Vector3();
  function applyExplode(k) {
    const e = k * k * (3 - 2 * k);
    // pull the camera back and up as the parts spread, keeping whatever zoom the reader chose
    offset.copy(camera.position).sub(controls.target).multiplyScalar((1 + 0.45 * e) / (1 + 0.45 * lastE));
    controls.target.y = 0.32 + 0.38 * e;
    camera.position.copy(controls.target).add(offset);
    lastE = e;
    parts.forEach((g) => {
      if (g.userData.id === "front") {
        g.children.forEach((c) => { c.position.z = c.userData.z0 + c.userData.side * 0.45 * e; });
      } else {
        g.position.copy(g.userData.home).addScaledVector(g.userData.offset, e);
      }
    });
  }
  parts.find((p) => p.userData.id === "front").children.forEach((c) => { c.userData.z0 = c.position.z; });
  explodeIn.addEventListener("input", () => { target = +explodeIn.value; needsRender = true; });

  /* ---------- sizing + loop, only while on screen ---------- */
  let needsRender = true, running = false, raf = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // hold the horizontal field of view, so a narrow phone screen still fits the whole car
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(14)) * 1.5);
    camera.fov = Math.min(62, Math.max(28, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect))));
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  new ResizeObserver(resize).observe(canvas);
  controls.addEventListener("change", () => { needsRender = true; });

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (Math.abs(target - explode) > 0.001) {
      explode += (target - explode) * (reduceMotion ? 1 : 0.12);
      applyExplode(explode);
      needsRender = true;
    }
    if (controls.update() || controls.autoRotate) needsRender = true;
    if (needsRender) { renderer.render(scene, camera); needsRender = false; }
  }
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  }, { threshold: 0.05 }).observe(canvas);

  resize();
  paint();
  root.classList.add("ready");
}
