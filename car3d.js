import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* SECRET in 3D, modelled from our race-day and garage photos.
   Units are metres. +x is the nose, +y is up, z is across the car (+z is the driver's left). */

const root = document.getElementById("car3d");
if (root) init(root);

function init(root) {
  const canvas = root.querySelector("canvas");
  const info = root.querySelector(".car-info");
  const list = root.querySelector(".car-parts");
  const explodeIn = root.querySelector("#car-explode");
  const xrayBtn = root.querySelector("#car-xray");
  const callout = root.querySelector(".car-callout");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ACCENT = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2448c8");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    root.classList.add("no-webgl");
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
  camera.position.set(2.9, 1.45, 2.55);

  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(1.5, 4.5, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 10 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.13 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // soft contact shadow so the car sits on the floor instead of floating over it
  {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d"), grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, "rgba(0,0,0,0.32)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.002;
    scene.add(blob);
  }

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.2;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0.05, 0.36, 0);
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.55;

  /* ---------- materials ---------- */
  const M = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xf7f6f3, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.18, side: THREE.DoubleSide }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c1c1d, roughness: 0.45, metalness: 0.2 }),
    tube: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.35, metalness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92 }),
    rimEdge: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }),
    alloy: new THREE.MeshStandardMaterial({ color: 0xd9dbdf, roughness: 0.22, metalness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.35, metalness: 0.9 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.4, metalness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xc9a777, roughness: 0.8 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.75 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8231f, roughness: 0.6 }),
    batt: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.6 }),
    pcb: new THREE.MeshStandardMaterial({ color: 0x1f6b4a, roughness: 0.5 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.45, metalness: 0.3 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xd2a72a, roughness: 0.5 }),
    green: new THREE.MeshStandardMaterial({ color: 0x3c8a52, roughness: 0.5 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x3a62b3, roughness: 0.5 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x0b0d12, roughness: 0.05, metalness: 0.4, clearcoat: 1 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.02, metalness: 1 }),
  };

  /* ---------- small geometry helpers ---------- */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rbox = (x, y, z, r = 0.01) => new RoundedBoxGeometry(x, y, z, 3, Math.min(r, x / 2 - 1e-4, y / 2 - 1e-4, z / 2 - 1e-4));
  const cyl = (r, h, s = 32) => new THREE.CylinderGeometry(r, r, h, s);
  const tubeAlong = (pts, r, seg = 64, closed = false) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p)), closed, "centripetal"), seg, r, 12, closed);
  function add(g, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  // a flat strap (harness, cables) laid between two points, facing `up`
  function strap(g, a, b, width, mat, up = V(0, 1, 0), thick = 0.004) {
    a = V(...a); b = V(...b);
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, width), mat);
    const t = b.clone().sub(a).normalize(), n = up.clone().sub(t.clone().multiplyScalar(up.dot(t))).normalize(), w = t.clone().cross(n);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, n, w));
    m.position.copy(mid);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  /* ---------- the fairing: a smooth loft through superellipse sections ---------- */
  // keyframes read off the photos: a long tail over the rear wheel, a tub around the driver,
  // a raised cowl in front of the cockpit, and a low rounded nose
  const KX = [-1.30, -1.18, -1.00, -0.75, -0.45, -0.10, 0.22, 0.45, 0.75, 1.02, 1.22, 1.36];
  const KW = [0.025, 0.09, 0.15, 0.21, 0.265, 0.295, 0.305, 0.30, 0.27, 0.21, 0.12, 0.03];
  const KYB = [0.33, 0.25, 0.17, 0.115, 0.085, 0.075, 0.075, 0.08, 0.10, 0.14, 0.21, 0.29];
  const KYT = [0.37, 0.46, 0.53, 0.575, 0.595, 0.60, 0.72, 0.755, 0.67, 0.55, 0.43, 0.335];
  const sampler = (vals) => {
    const curve = new THREE.CatmullRomCurve3(KX.map((x, i) => V(x, vals[i], 0)), false, "centripetal");
    const pts = curve.getSpacedPoints(800);
    return (x) => {
      let lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].x < x) lo = mid; else hi = mid; }
      const a = pts[lo], b = pts[hi], t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * Math.min(1, Math.max(0, t));
    };
  };
  const fW = sampler(KW), fYB = sampler(KYB), fYT = sampler(KYT);
  const EXP = 2.7;
  const pw = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  function surf(x, th) {
    const w = fW(x), yb = fYB(x), yt = fYT(x), yc = (yb + yt) / 2, h = (yt - yb) / 2;
    return V(x, yc + h * pw(Math.sin(th), 2 / EXP), w * pw(Math.cos(th), 2 / EXP));
  }
  const X0 = KX[0], X1 = KX[KX.length - 1];
  // the cockpit opening, seen from above
  const CK = { x: -0.07, ax: 0.34, az: 0.245 };
  const inCockpit = (x, z) => ((x - CK.x) / CK.ax) ** 2 + (z / CK.az) ** 2 < 1;
  const REAR = { x: -0.98 };

  function shellGeometry() {
    const N = 200, S = 112, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const x = X0 + (X1 - X0) * (i / N);
      for (let j = 0; j <= S; j++) {
        const th = -Math.PI / 2 + (2 * Math.PI * j) / S; // seam runs along the belly, out of sight
        const p = surf(x, th);
        pos.push(p.x, p.y, p.z);
        uv.push(i / N, j / S);
      }
    }
    const at = (i, j) => i * (S + 1) + j;
    for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) {
      const x = X0 + (X1 - X0) * ((i + 0.5) / N), th = -Math.PI / 2 + (2 * Math.PI * (j + 0.5)) / S, c = surf(x, th);
      if (Math.sin(th) > -0.2 && inCockpit(x, c.z)) continue; // open cockpit
      if (Math.sin(th) < -0.55 && Math.abs(c.z) < 0.06 && Math.abs(x - REAR.x) < 0.24) continue; // slot for the rear wheel
      idx.push(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
    // close both tips
    const capAt = (i, x) => {
      const c = pos.length / 3, w = fYB(x), t = fYT(x);
      pos.push(x, (w + t) / 2, 0); uv.push(0, 0);
      for (let j = 0; j < S; j++) i === 0 ? idx.push(c, at(i, j + 1), at(i, j)) : idx.push(c, at(i, j), at(i, j + 1));
    };
    capAt(0, X0); capAt(N, X1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  // a point on the top half of the shell at (x, z), for trims and stickers
  function topAt(x, z) {
    const w = fW(x), c = Math.max(-1, Math.min(1, pw(Math.min(1, Math.abs(z) / w), EXP / 2))) * Math.sign(z);
    return surf(x, Math.acos(c));
  }
  function frameAt(x, th, flip) {
    const p = surf(x, th), dx = surf(x + 0.004, th).sub(surf(x - 0.004, th)).normalize();
    const dth = surf(x, th + 0.004).sub(surf(x, th - 0.004)).normalize();
    const n = dx.clone().cross(dth).normalize();
    if (n.dot(V(0, p.y - (fYB(x) + fYT(x)) / 2, p.z)) < 0) n.negate();
    const t = flip ? dx.clone().negate() : dx;
    const b = n.clone().cross(t).normalize();
    return { p, m: new THREE.Matrix4().makeBasis(t, b, n) };
  }
  function sticker(g, tex, w, h, x, th, flip, lift = 0.002) {
    const { p, m } = frameAt(x, th, flip);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.position.copy(p).add(new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).multiplyScalar(lift));
    g.add(mesh);
    return mesh;
  }

  /* ---------- wheels ---------- */
  function wheel({ r = 0.22, tw = 0.07, hub = 0.045, spokes = 6, motor = false }) {
    const g = new THREE.Group();
    // tyre: a lathed rounded section, axis along z
    const th = 0.055, rc = r - th / 2, prof = [];
    for (let k = 0; k <= 40; k++) {
      const a = -Math.PI / 2 + (Math.PI * 2 * k) / 40;
      prof.push(new THREE.Vector2(rc + (th / 2) * pw(Math.cos(a), 0.6), (tw / 2) * pw(Math.sin(a), 0.6)));
    }
    const tyre = new THREE.LatheGeometry(prof, 64);
    tyre.rotateX(Math.PI / 2);
    add(g, tyre, M.rubber);
    // tread ribs
    for (let k = 0; k < 3; k++) add(g, new THREE.TorusGeometry(r - 0.001, 0.0035, 6, 80), M.rimEdge, [0, 0, (k - 1) * tw * 0.28]);
    // alloy rim barrel + lips
    const rr = r - th + 0.004;
    add(g, new THREE.CylinderGeometry(rr, rr, tw * 0.82, 64, 1, true), M.alloy, [0, 0, 0], [Math.PI / 2, 0, 0]);
    [-1, 1].forEach((s) => add(g, new THREE.TorusGeometry(rr, 0.005, 8, 64), M.alloy, [0, 0, s * tw * 0.41]));
    // spokes
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2, len = rr - hub;
      add(g, rbox(len, 0.022, 0.012, 0.005), M.alloy, [Math.cos(a) * (hub + len / 2), Math.sin(a) * (hub + len / 2), tw * 0.12], [0, 0, a]);
    }
    add(g, cyl(motor ? 0.1 : hub, motor ? tw * 0.95 : tw * 0.6, 40), motor ? M.black : M.alloy, [0, 0, 0], [Math.PI / 2, 0, 0]);
    if (motor) add(g, cyl(0.104, 0.008, 40), M.alloy, [0, 0, tw * 0.48], [Math.PI / 2, 0, 0]);
    add(g, cyl(0.016, tw + 0.03, 16), M.steel, [0, 0, 0], [Math.PI / 2, 0, 0]);
    // brake disc and caliper on the inboard side
    add(g, cyl(0.075, 0.003, 48), M.steel, [0, 0, -tw * 0.55], [Math.PI / 2, 0, 0]);
    add(g, rbox(0.04, 0.03, 0.02, 0.006), M.caliper, [0.055, 0.04, -tw * 0.55]);
    return g;
  }

  /* ---------- parts ---------- */
  const parts = [];
  function part(id, name, sub, offset, desc) {
    const g = new THREE.Group();
    g.userData = { id, name, sub, desc, offset: V(...offset) };
    scene.add(g);
    parts.push(g);
    return g;
  }

  /* 01 body shell */
  {
    const g = part("shell", "body shell", "the white fairing", [0, 0.8, 0],
      "The fairing over the chassis. At race speed most of the battery goes into pushing air, so the shell's shape does more for range than almost anything else on the car.");
    add(g, shellGeometry(), M.shell);
    // black rubber trim around the cockpit opening
    const rim = [];
    for (let k = 0; k <= 160; k++) {
      const a = (k / 160) * Math.PI * 2, x = CK.x + CK.ax * Math.cos(a), z = CK.az * Math.sin(a);
      rim.push(topAt(x, z).toArray());
    }
    add(g, tubeAlong(rim, 0.011, 240, true), M.black);
    // decals: MARCHAY on both flanks of the nose, the star on top, the shield up front
    const marchay = canvasTex(640, 120, (c, w, h) => {
      c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#111"; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = "#000"; c.font = "600 78px 'Helvetica Neue', Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.letterSpacing = "8px"; c.fillText("MARCHAY", w / 2, h / 2 + 4);
    });
    sticker(g, marchay, 0.3, 0.056, 0.95, 0.42, false);
    sticker(g, marchay, 0.3, 0.056, 0.95, Math.PI - 0.42, true);
    const star = canvasTex(128, 128, (c) => {
      c.fillStyle = "#c8231f"; c.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 24 : 58, a = -Math.PI / 2 + (k * Math.PI) / 5; c.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); }
      c.closePath(); c.fill();
    });
    sticker(g, star, 0.07, 0.07, 0.88, Math.PI / 2, false).rotateZ(Math.PI / 2);
    const shield = canvasTex(160, 200, (c) => {
      const path = () => { c.beginPath(); c.moveTo(10, 10); c.lineTo(150, 10); c.lineTo(150, 100); c.quadraticCurveTo(150, 170, 80, 192); c.quadraticCurveTo(10, 170, 10, 100); c.closePath(); };
      path(); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 10; c.strokeStyle = "#b51f24"; c.stroke();
      c.save(); path(); c.clip();
      c.fillStyle = "#1f3f7a"; c.fillRect(0, 0, 160, 92);
      for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? "#fff" : "#b51f24"; c.fillRect(30 + k * 26, 92, 26, 110); }
      c.restore();
      c.fillStyle = "#fff"; c.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 11 : 27, a = -Math.PI / 2 + (k * Math.PI) / 5; c.lineTo(80 + Math.cos(a) * r, 52 + Math.sin(a) * r); }
      c.fill();
    });
    sticker(g, shield, 0.07, 0.088, 1.17, Math.PI / 2 - 0.15, false).rotateZ(Math.PI / 2);
  }

  /* 02 chassis + floor */
  {
    const g = part("chassis", "aluminum chassis", "rebuilt by us", [0, 0, 0],
      "We rebuilt the chassis in aluminum: lighter than the original, with mounting points where we wanted the battery and electronics to sit. The plywood floor you can see at the shell's edge is bolted to it.");
    [-0.15, 0.15].forEach((z) => add(g, rbox(1.46, 0.035, 0.035, 0.006), M.alu, [0.04, 0.135, z]));
    [-0.62, -0.3, 0.05, 0.42, 0.74].forEach((x) => add(g, rbox(0.035, 0.03, 0.3, 0.006), M.alu, [x, 0.135, 0]));
    add(g, rbox(1.15, 0.014, 0.36, 0.004), M.wood, [0.0, 0.158, 0]);
    // front cross-beam that carries the suspension
    add(g, rbox(0.06, 0.05, 0.62, 0.008), M.alu, [0.82, 0.16, 0]);
  }

  /* 03 cockpit: seat, roll hoop, harness, mirrors, helmet */
  {
    const g = part("cockpit", "roll hoop, seat, harness", "driver safety cell", [-0.05, 0.42, 0],
      "The roll hoop has to clear the driver's helmet if the car goes over, and carries padded head supports. The seat sits low and reclined to keep the frontal area, and so the drag, small. A red harness holds the driver in.");
    // seat: base, reclined back, side bolsters
    add(g, rbox(0.46, 0.06, 0.36, 0.025), M.seat, [-0.04, 0.17, 0], [0, 0, -0.07]);
    const back = new THREE.Group();
    back.position.set(-0.3, 0.17, 0);
    back.rotation.z = 0.42;
    g.add(back);
    add(back, rbox(0.06, 0.56, 0.36, 0.025), M.seat, [0, 0.29, 0]);
    [-1, 1].forEach((s) => add(back, rbox(0.1, 0.42, 0.05, 0.02), M.seat, [0.04, 0.24, s * 0.17]));
    // harness: two shoulder straps, a lap belt, a buckle
    const up = V(1, 0.6, 0);
    [-1, 1].forEach((s) => {
      strap(g, [-0.36, 0.67, s * 0.07], [-0.2, 0.36, s * 0.065], 0.045, M.red, up);
      strap(g, [-0.2, 0.36, s * 0.065], [-0.02, 0.22, s * 0.03], 0.045, M.red, up);
      strap(g, [-0.08, 0.2, s * 0.17], [0.0, 0.23, s * 0.03], 0.045, M.red, V(0, 1, 0));
    });
    add(g, rbox(0.05, 0.012, 0.06, 0.004), M.steel, [0.0, 0.235, 0]);
    // roll hoop, braces and head pads
    const hoop = [[-0.36, 0.12, -0.235], [-0.375, 0.6, -0.225], [-0.385, 0.92, -0.17], [-0.39, 1.0, -0.06], [-0.39, 1.0, 0.06], [-0.385, 0.92, 0.17], [-0.375, 0.6, 0.225], [-0.36, 0.12, 0.235]];
    add(g, tubeAlong(hoop, 0.017, 120), M.tube);
    [-1, 1].forEach((s) => {
      add(g, tubeAlong([[-0.38, 0.86, s * 0.19], [-0.62, 0.6, s * 0.15], [-0.82, 0.4, s * 0.12]], 0.013, 40), M.tube);
      add(g, rbox(0.06, 0.17, 0.1, 0.03), M.seat, [-0.35, 0.86, s * 0.13], [0, s * 0.35, 0.15]);
    });
    add(g, tubeAlong([[-0.375, 0.6, -0.225], [-0.375, 0.6, 0.225]], 0.012, 8), M.tube);
    // mirrors on stalks from the cowl
    [-1, 1].forEach((s) => {
      const base = topAt(0.3, s * 0.27);
      add(g, tubeAlong([[base.x, base.y - 0.01, base.z], [0.3, base.y + 0.03, s * 0.33], [0.29, base.y + 0.05, s * 0.36]], 0.008, 16), M.tube);
      const head = add(g, rbox(0.035, 0.075, 0.12, 0.014), M.black, [0.285, base.y + 0.07, s * 0.38], [0, s * 0.2, 0]);
      add(head, new THREE.PlaneGeometry(0.085, 0.05), M.mirror, [-0.016, 0, 0], [0, -Math.PI / 2, 0], false);
    });
    // the helmet, resting on the cowl the way it does in our race-day photo
    const top = topAt(0.5, 0);
    const helm = new THREE.Group();
    helm.position.set(0.5, top.y + 0.098, 0);
    helm.rotation.set(0, -0.35, -0.1);
    g.add(helm);
    // shell with a flattened chin, a smoked visor facing forward, and a vent ridge on top
    add(helm, new THREE.SphereGeometry(0.13, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.78), M.helmet).scale.set(1.12, 1.0, 0.9);
    add(helm, new THREE.CircleGeometry(0.103, 40), M.helmet, [0, -0.101, 0], [Math.PI / 2, 0, 0]).scale.set(1.12, 0.9, 1);
    add(helm, new THREE.SphereGeometry(0.1315, 48, 24, -0.85, 1.7, 1.1, 0.55), M.visor, [0, 0, 0], [0, Math.PI / 2, 0]).scale.set(1.12, 1.0, 0.9);
    add(helm, rbox(0.12, 0.012, 0.03, 0.005), M.black, [-0.01, 0.128, 0]);
  }

  /* 04 steering + throttle */
  {
    const g = part("steer", "steering yoke + thumb throttle", "regen on 0–20%", [0.22, 0.3, 0],
      "A small yoke rather than a round wheel, to fit the narrow cockpit. The thumb throttle is a hall-effect sensor on the right grip; the first 20% of its travel is regenerative braking, so easing off puts energy back in the pack.");
    add(g, tubeAlong([[0.6, 0.2, 0], [0.4, 0.34, 0], [0.22, 0.45, 0]], 0.012, 20), M.steel);
    const yoke = new THREE.Group();
    yoke.position.set(0.19, 0.47, 0);
    yoke.rotation.z = -0.75;
    g.add(yoke);
    add(yoke, rbox(0.025, 0.11, 0.25, 0.012), M.black);
    [-1, 1].forEach((s) => add(yoke, rbox(0.04, 0.15, 0.045, 0.018), M.black, [0.0, -0.02, s * 0.15], [s * 0.25, 0, 0]));
    [[M.green, 0.03, -0.08], [M.yellow, 0.03, 0.08], [M.red, -0.02, -0.06], [M.blue, -0.02, 0.06]].forEach(([m, y, z]) =>
      add(yoke, new THREE.SphereGeometry(0.009, 16, 12), m, [-0.014, y, z]));
    add(yoke, rbox(0.02, 0.025, 0.02, 0.005), M.blue, [-0.02, 0.03, -0.16]); // thumb throttle, driver's right
  }

  /* 05 dash electronics */
  {
    const g = part("dash", "cycle analyst, arduino, display", "the pacing brain", [0.32, 0.55, 0],
      "The cycle analyst counts every amp-hour through the shunt. Our Arduino reads it each lap, divides what is left by the laps left in the hour, and tells the driver on the display: speed up, hold, or back off.");
    const lcd = (lines, fg, bg) => canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.fillStyle = fg; c.font = "bold 30px ui-monospace, Menlo, monospace";
      lines.forEach((l, i) => c.fillText(l, 14, 44 + i * 42));
    });
    // both screens sit on the inside lip of the cowl, facing the driver
    const mount = (x, z, tex) => {
      const p = topAt(x + 0.03, z);
      const box = add(g, rbox(0.03, 0.07, 0.11, 0.008), M.black, [x, p.y - 0.045, z], [0, 0, 0.5]);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.055), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      s.position.set(-0.0155, 0, 0);
      s.rotation.y = -Math.PI / 2;
      box.add(s);
    };
    mount(0.2, 0.1, lcd(["48.6V 21.4A", "6.83Ah 27mph"], "#b8f5c8", "#0f1a14"));
    mount(0.2, -0.1, lcd(["LAP 23", "> HOLD PACE"], "#ffd166", "#14110a"));
    add(g, rbox(0.07, 0.008, 0.055, 0.002), M.pcb, [0.42, 0.4, 0.1]);
    for (let k = 0; k < 8; k++) add(g, new THREE.BoxGeometry(0.004, 0.008, 0.004), M.black, [0.395 + k * 0.007, 0.408, 0.122]);
  }

  /* 06 front wheels + suspension */
  const FX = 0.82, FR = 0.22, FZ = 0.53;
  {
    const g = part("front", "front wheels", "steered, outboard", [0, 0, 0],
      "Steered wheels on wishbones, mounted outboard of the body. Alignment is free range: a wheel that is toed in even slightly scrubs energy every metre of the hour.");
    [-1, 1].forEach((s) => {
      const side = new THREE.Group();
      side.userData.side = s;
      g.add(side);
      const w = wheel({ r: FR, motor: false });
      w.position.set(FX, FR, s * FZ);
      if (s < 0) w.rotation.y = Math.PI;
      side.add(w);
      const upr = s * (FZ - 0.07);
      add(side, rbox(0.04, 0.16, 0.025, 0.008), M.black, [FX, FR + 0.01, upr]);
      // upper and lower wishbones back to the chassis beam
      [[0.31, 0.29], [0.15, 0.16]].forEach(([yo, yi]) => {
        add(side, tubeAlong([[FX - 0.09, yi, s * 0.27], [FX, yo, upr]], 0.009, 8), M.tube);
        add(side, tubeAlong([[FX + 0.08, yi, s * 0.27], [FX, yo, upr]], 0.009, 8), M.tube);
      });
      add(side, tubeAlong([[FX - 0.12, 0.22, s * 0.1], [FX - 0.07, 0.22, upr]], 0.006, 8), M.steel); // tie rod
    });
  }

  /* 07 hub motor (rear) */
  {
    const g = part("motor", "rear hub motor", "brushless dc, in the wheel", [-0.55, 0, 0],
      "A brushless DC motor built into the rear wheel, so there is no chain or gearbox to lose energy in. Its three phases come from the controller; hall sensors tell the controller where the rotor is so it can time each switch.");
    const w = wheel({ r: 0.23, tw: 0.06, motor: true, spokes: 0 });
    w.position.set(REAR.x, 0.23, 0);
    g.add(w);
    [-1, 1].forEach((s) => add(g, tubeAlong([[REAR.x, 0.23, s * 0.055], [-0.8, 0.22, s * 0.09], [-0.62, 0.15, s * 0.15]], 0.011, 16), M.tube));
    [[M.yellow, -0.012], [M.green, 0], [M.blue, 0.012]].forEach(([m, dz]) =>
      add(g, tubeAlong([[REAR.x + 0.02, 0.28, 0.05 + dz], [-0.88, 0.33, 0.08 + dz], [-0.74, 0.37, 0.09 + dz], [-0.66, 0.38, 0.06 + dz]], 0.005, 24), m));
  }

  /* 08 battery pack */
  {
    const g = part("batt", "battery pack", "4 × 12 V lead-acid = 48 V", [-0.05, 0.62, 0],
      "Four 12 V sealed lead-acid batteries in series. Lead-acid loses usable capacity when you pull hard (Peukert's law), so a driver who goes out fast doesn't just run out sooner, they get less total energy. That is the whole case for pacing.");
    const label = canvasTex(128, 64, (c) => { c.fillStyle = "#2b2d30"; c.fillRect(0, 0, 128, 64); c.fillStyle = "#e9e9e9"; c.font = "bold 22px Arial"; c.fillText("12V SLA", 14, 40); });
    [[-0.5, -0.095], [-0.5, 0.095], [-0.69, -0.095], [-0.69, 0.095]].forEach(([x, z]) => {
      add(g, rbox(0.17, 0.165, 0.175, 0.01), M.batt, [x, 0.23, z]);
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 }));
      l.position.set(x, 0.24, z + Math.sign(z) * 0.0885);
      if (z < 0) l.rotation.y = Math.PI;
      g.add(l);
      add(g, cyl(0.011, 0.018, 16), M.red, [x + 0.05, 0.32, z - 0.05]);
      add(g, cyl(0.011, 0.018, 16), M.black, [x - 0.05, 0.32, z - 0.05]);
    });
    add(g, tubeAlong([[-0.45, 0.33, -0.145], [-0.6, 0.36, -0.07], [-0.74, 0.33, 0.045]], 0.007, 20), M.red);
    add(g, tubeAlong([[-0.55, 0.33, 0.045], [-0.6, 0.35, 0], [-0.64, 0.33, -0.145]], 0.007, 20), M.black);
  }

  /* 09 controller + power path + kill switches */
  {
    const g = part("power", "controller, contactor, fuse, kill switches", "48 V dc → 3-phase", [-0.3, 0.95, 0],
      "Power runs battery → two keyed kill switches → 100 A fuse → contactor → controller. A precharge resistor fills the controller's capacitors before the contactor closes; switching straight onto 48 V would hit them with an inrush spike.");
    add(g, rbox(0.18, 0.05, 0.13, 0.008), M.alu, [-0.6, 0.345, 0]);
    for (let k = 0; k < 7; k++) add(g, new THREE.BoxGeometry(0.16, 0.022, 0.003), M.alu, [-0.6, 0.38, -0.054 + k * 0.018]);
    add(g, cyl(0.022, 0.05, 20), M.black, [-0.48, 0.345, -0.05]);
    add(g, rbox(0.05, 0.02, 0.025, 0.004), M.yellow, [-0.48, 0.33, 0.06]);
    [-1, 1].forEach((s) => {
      const p = topAt(-0.5, s * 0.14);
      add(g, cyl(0.02, 0.02, 20), M.black, [p.x, p.y + 0.005, p.z]);
      add(g, rbox(0.01, 0.035, 0.022, 0.003), M.red, [p.x, p.y + 0.03, p.z]);
    });
  }

  /* ---------- per-mesh material copies so parts can fade on their own ---------- */
  parts.forEach((g) => {
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.userData.baseEmissive = o.material.emissive ? o.material.emissive.clone() : null;
    });
    g.userData.home = g.position.clone();
  });
  const front = parts.find((p) => p.userData.id === "front");
  front.children.forEach((c) => { c.userData.z0 = c.position.z; });

  /* ---------- parts list ---------- */
  parts.forEach((g, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" data-id="${g.userData.id}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="t">${g.userData.name}</span><span class="s">${g.userData.sub}</span></button>`;
    list.appendChild(li);
  });
  const buttons = [...list.querySelectorAll("button")];

  let selected = null, hovered = null, xray = false;
  function paint() {
    parts.forEach((g) => {
      const id = g.userData.id;
      const on = !selected || selected === id;
      const shellGhost = xray && id === "shell" && selected !== "shell";
      g.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const op = !on ? 0.1 : shellGhost ? 0.16 : 1;
        o.material.opacity = op;
        o.material.depthWrite = op > 0.5;
        o.castShadow = op > 0.5;
        if (o.userData.baseEmissive) {
          o.material.emissive.copy(o.userData.baseEmissive);
          if (selected === id || hovered === id) o.material.emissive.lerp(ACCENT, selected === id ? 0.22 : 0.12);
        }
      });
    });
    buttons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === selected ? "true" : "false"));
    const g = parts.find((p) => p.userData.id === selected);
    info.innerHTML = g
      ? `<b>${g.userData.name}</b>${g.userData.desc}`
      : "<b>drag to turn it, slide to take it apart.</b>pick a part to see what it does. the whole car is built around one constraint: the most distance in an hour on one charge.";
    callout.hidden = !g;
    if (g) callout.textContent = g.userData.name;
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
  xrayBtn.addEventListener("click", () => {
    xray = !xray;
    xrayBtn.setAttribute("aria-pressed", xray);
    paint();
  });

  /* ---------- picking ---------- */
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
    offset.copy(camera.position).sub(controls.target).multiplyScalar((1 + 0.4 * e) / (1 + 0.4 * lastE));
    controls.target.y = 0.36 + 0.36 * e;
    camera.position.copy(controls.target).add(offset);
    lastE = e;
    parts.forEach((g) => {
      if (g === front) front.children.forEach((c) => { c.position.z = c.userData.z0 + c.userData.side * 0.38 * e; });
      else g.position.copy(g.userData.home).addScaledVector(g.userData.offset, e);
    });
  }
  explodeIn.addEventListener("input", () => { target = +explodeIn.value; needsRender = true; });

  /* ---------- callout follows the selected part ---------- */
  const box3 = new THREE.Box3(), cpos = new THREE.Vector3();
  function placeCallout() {
    const g = parts.find((p) => p.userData.id === selected);
    if (!g) return;
    box3.setFromObject(g).getCenter(cpos);
    cpos.y = box3.max.y;
    cpos.project(camera);
    const r = canvas.getBoundingClientRect();
    callout.style.transform = `translate(${((cpos.x + 1) / 2) * r.width}px, ${((1 - cpos.y) / 2) * r.height}px)`;
  }

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
    if (needsRender) {
      renderer.render(scene, camera);
      placeCallout();
      needsRender = false;
    }
  }
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  }, { threshold: 0.05 }).observe(canvas);

  resize();
  paint();
  root.classList.add("ready");
}
