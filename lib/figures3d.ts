"use client";

// Die Figuren in echtem 3D (three.js), komplett aus Grundformen gebaut – keine Bilddateien.
// Jede Figur bewegt sich leicht im Leerlauf und spielt beim Antippen eine eigene Bewegung ab.
import type * as T from "three";

type Three = typeof T;
export type Anim = "bounce" | "wobble" | "spin" | "float" | "hop" | "twinkle" | "launch" | "buzz" | "wave" | "roll";

type Built = {
  root: T.Group;
  /** optionale Teile, die sich extra bewegen */
  arm?: T.Object3D;
  wings?: T.Object3D[];
  spinner?: T.Object3D;
  flame?: T.Object3D;
  tentacles?: T.Object3D[];
};

export type FigureScene = { tap: () => void; start: () => void; stop: () => void; dispose: () => void };

export async function createFigureScene(canvas: HTMLCanvasElement, id: string, anim: Anim): Promise<FigureScene> {
  const THREE = await import("three");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth || 130, canvas.clientHeight || 130, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.35, 5.2);
  camera.lookAt(0, -0.05, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f6b, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 3.5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd9a8, 1.0);
  rim.position.set(-3, 1.5, -2);
  scene.add(rim);

  // weicher Schatten am Boden
  const shadowTex = radialTexture(THREE);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.12;
  scene.add(shadow);

  const built = BUILDERS[id]?.(THREE) || BUILDERS.wuschel(THREE);
  const holder = new THREE.Group(); // für Tap-Bewegungen
  holder.add(built.root);
  scene.add(holder);

  let raf = 0;
  let running = false;
  let tapAt = -10;
  const clock = new THREE.Clock();
  const DUR: Partial<Record<Anim, number>> = { launch: 1.6, float: 1.6, roll: 1.4 };
  const dur = DUR[anim] || 1.1;

  function frame() {
    const t = clock.getElapsedTime();
    const k = (t - tapAt) / dur; // 0…1 während der Tap-Bewegung
    const active = k >= 0 && k <= 1;
    const e = active ? k : 0;
    // Leerlauf: leicht wiegen und atmen
    holder.position.set(0, Math.sin(t * 1.7) * 0.04, 0);
    holder.rotation.set(0, Math.sin(t * 0.6) * 0.35, 0);
    holder.scale.set(1, 1, 1);
    built.root.rotation.set(0, 0, 0);
    built.root.position.set(0, 0, 0);
    if (built.arm) built.arm.rotation.z = Math.sin(t * 2) * 0.12;
    built.wings?.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * (anim === "buzz" ? 30 : 3)) * 0.25)));
    if (built.spinner) built.spinner.rotation.z = t * 0.4;
    if (built.flame) built.flame.scale.setScalar(0.85 + Math.sin(t * 25) * 0.15);
    built.tentacles?.forEach((tt, i) => (tt.rotation.z = Math.sin(t * 2 + i) * 0.18));

    if (active) {
      const s = Math.sin(Math.PI * e);
      switch (anim) {
        case "bounce":
          holder.position.y += Math.max(0, Math.sin(Math.PI * Math.min(1, e * 1.25))) * 0.75;
          holder.scale.set(1 + 0.15 * Math.sin(e * Math.PI * 4) * (1 - e), 1 - 0.15 * Math.sin(e * Math.PI * 4) * (1 - e), 1);
          break;
        case "hop":
          holder.position.y += Math.abs(Math.sin(e * Math.PI * 2)) * 0.55 * (1 - e * 0.4);
          holder.rotation.z = Math.sin(e * Math.PI * 2) * 0.15;
          break;
        case "spin":
          holder.rotation.y += easeInOut(e) * Math.PI * 2;
          holder.position.y += s * 0.3;
          break;
        case "twinkle":
          holder.rotation.y += easeInOut(e) * Math.PI * 2;
          holder.scale.setScalar(1 + s * 0.3);
          break;
        case "wobble":
          holder.rotation.z = Math.sin(e * Math.PI * 6) * 0.35 * (1 - e);
          break;
        case "float":
          holder.position.y += s * 0.7;
          holder.position.x = Math.sin(e * Math.PI * 2) * 0.35;
          break;
        case "wave":
          if (built.arm) built.arm.rotation.z = 2.2 + Math.sin(e * Math.PI * 8) * 0.45;
          holder.position.y += s * 0.12;
          break;
        case "launch": {
          const up = e < 0.55 ? Math.pow(e / 0.55, 2) * 4.2 : -2.5 + ((e - 0.55) / 0.45) * 2.5;
          holder.position.y += e < 0.55 ? up : Math.min(0, up);
          if (built.flame) built.flame.scale.setScalar(1.8);
          break;
        }
        case "buzz":
          holder.position.x = Math.sin(e * 40) * 0.12 * (1 - e);
          holder.position.y += Math.sin(e * 23) * 0.1 + s * 0.35;
          holder.rotation.z = Math.sin(e * 30) * 0.2 * (1 - e);
          break;
        case "roll":
          built.root.rotation.z = -easeInOut(e) * Math.PI * 4;
          holder.position.x = Math.sin(e * Math.PI) * 0.6;
          break;
      }
    }
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }

  return {
    tap() {
      tapAt = clock.getElapsedTime();
      if (!running) {
        running = true;
        frame();
      }
    },
    start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as T.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as T.Material | T.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      shadowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function easeInOut(x: number) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function radialTexture(THREE: Three) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(0,0,0,0.45)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ---------------------------------------------------------------- Bausteine
function kit(THREE: Three) {
  const SPH = new THREE.SphereGeometry(1, 40, 28);
  const mat = (color: number, extra: Partial<T.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.02, ...extra });
  const ball = (color: number, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, extra = {}) => {
    const m = new THREE.Mesh(SPH, mat(color, extra));
    m.scale.set(r * sx, r * sy, r * sz);
    m.position.set(x, y, z);
    return m;
  };
  const cone = (color: number, r: number, h: number, x = 0, y = 0, z = 0, extra = {}) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 32), mat(color, extra));
    m.position.set(x, y, z);
    return m;
  };
  const cyl = (color: number, r1: number, r2: number, h: number, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 32), mat(color));
    m.position.set(x, y, z);
    return m;
  };
  const box = (color: number, w: number, h: number, d: number, x = 0, y = 0, z = 0, extra = {}) => {
    const m = new THREE.Mesh(roundedBox(THREE, w, h, d, Math.min(w, h, d) * 0.22), mat(color, extra));
    m.position.set(x, y, z);
    return m;
  };
  const capsule = (color: number, r: number, len: number, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 20), mat(color));
    m.position.set(x, y, z);
    return m;
  };
  /** Punkt auf einer Kugel (Mitte c, Radius R) in Blickrichtung (dx, dy) */
  const onSphere = (c: [number, number, number], R: number, dx: number, dy: number) => {
    const v = new THREE.Vector3(dx, dy, 1).normalize();
    return { pos: new THREE.Vector3(c[0] + v.x * R, c[1] + v.y * R, c[2] + v.z * R), dir: v };
  };
  /** Gesicht auf eine Kugel setzen: Augen, Mund, Bäckchen */
  const face = (
    g: T.Group,
    c: [number, number, number],
    R: number,
    o: { eyeY?: number; eyeDX?: number; eyeR?: number; mouthY?: number; mouthW?: number; cheeks?: boolean; mouth?: boolean } = {},
  ) => {
    const { eyeY = 0.18, eyeDX = 0.3, eyeR = 0.17, mouthY = -0.22, mouthW = 0.2, cheeks = true, mouth = true } = o;
    for (const side of [-1, 1]) {
      const p = onSphere(c, R * 0.97, side * eyeDX, eyeY);
      const white = ball(0xffffff, eyeR, p.pos.x, p.pos.y, p.pos.z, 1, 1.1, 0.6, { roughness: 0.2 });
      const pupil = ball(0x15172a, eyeR * 0.55, p.pos.x + p.dir.x * eyeR * 0.45, p.pos.y + p.dir.y * eyeR * 0.45 - eyeR * 0.05, p.pos.z + eyeR * 0.42, 1, 1.1, 0.6, { roughness: 0.15 });
      const shine = ball(0xffffff, eyeR * 0.18, pupil.position.x + eyeR * 0.2, pupil.position.y + eyeR * 0.25, pupil.position.z + eyeR * 0.15, 1, 1, 1, { emissive: 0xffffff, emissiveIntensity: 0.6 });
      g.add(white, pupil, shine);
      if (cheeks) {
        const q = onSphere(c, R * 0.98, side * (eyeDX + 0.22), eyeY - 0.32);
        g.add(ball(0xff8fab, eyeR * 0.6, q.pos.x, q.pos.y, q.pos.z, 1.3, 0.8, 0.4, { transparent: true, opacity: 0.75 }));
      }
    }
    if (mouth) {
      const p = onSphere(c, R * 0.99, 0, mouthY);
      const smile = new THREE.Mesh(new THREE.TorusGeometry(mouthW, mouthW * 0.18, 10, 24, Math.PI), mat(0x2a1a2e));
      smile.rotation.z = Math.PI;
      smile.position.copy(p.pos);
      smile.position.y += mouthW * 0.35;
      smile.rotation.x = -Math.asin(Math.max(-1, Math.min(1, p.dir.y)));
      g.add(smile);
    }
  };
  return { ball, cone, cyl, box, capsule, face, mat, onSphere };
}

function roundedBox(THREE: Three, w: number, h: number, d: number, r: number) {
  const shape = new THREE.Shape();
  const x = -w / 2 + r;
  const y = -h / 2 + r;
  shape.moveTo(x, y - r);
  shape.lineTo(x + w - 2 * r, y - r);
  shape.quadraticCurveTo(x + w - r, y - r, x + w - r, y);
  shape.lineTo(x + w - r, y + h - 2 * r);
  shape.quadraticCurveTo(x + w - r, y + h - r, x + w - 2 * r, y + h - r);
  shape.lineTo(x, y + h - r);
  shape.quadraticCurveTo(x - r, y + h - r, x - r, y + h - 2 * r);
  shape.lineTo(x - r, y);
  shape.quadraticCurveTo(x - r, y - r, x, y - r);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 4, curveSegments: 8 });
  geo.translate(0, 0, -(d - 2 * r) / 2);
  return geo;
}

function starGeometry(THREE: Three, outer: number, inner: number, depth: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.1, bevelSegments: 5 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------------------------------------------------------- Figuren
const BUILDERS: Record<string, (THREE: Three) => Built> = {
  gespenst(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const ghost = { transparent: true, opacity: 0.93, roughness: 0.3, emissive: 0xc7d2fe, emissiveIntensity: 0.15 };
    g.add(k.ball(0xf5f7ff, 0.72, 0, 0.15, 0, 1, 1.15, 0.95, ghost));
    g.add(k.cyl(0xf5f7ff, 0.7, 0.78, 0.6, 0, -0.45, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(k.ball(0xf5f7ff, 0.2, Math.cos(a) * 0.62, -0.78, Math.sin(a) * 0.62, 1, 1, 1, ghost));
    }
    const arms = [k.ball(0xf5f7ff, 0.2, -0.78, -0.05, 0.1, 1.4, 0.8, 0.8, ghost), k.ball(0xf5f7ff, 0.2, 0.78, -0.05, 0.1, 1.4, 0.8, 0.8, ghost)];
    g.add(...arms);
    k.face(g, [0, 0.15, 0], 0.72, { eyeY: 0.25, eyeDX: 0.32, eyeR: 0.16, mouth: false });
    const p = k.onSphere([0, 0.15, 0], 0.7, 0, -0.18);
    g.add(k.ball(0x2a1a2e, 0.12, p.pos.x, p.pos.y, p.pos.z, 1, 1.3, 0.5));
    return { root: g };
  },
  kuerbis(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const seg = k.ball(i % 2 ? 0xf97316 : 0xfb8c2a, 0.5, Math.cos(a) * 0.38, -0.25, Math.sin(a) * 0.38, 0.75, 1.15, 1);
      seg.rotation.y = -a;
      g.add(seg);
    }
    const stem = k.cyl(0x4d7c0f, 0.07, 0.11, 0.35, 0.03, 0.45, 0);
    stem.rotation.z = -0.25;
    g.add(stem);
    g.add(k.ball(0x65a30d, 0.16, 0.22, 0.42, 0.05, 1.4, 0.4, 0.8));
    k.face(g, [0, -0.25, 0], 0.88, { eyeY: 0.22, eyeDX: 0.28, eyeR: 0.13, mouthY: -0.12, mouthW: 0.26, cheeks: false });
    return { root: g };
  },
  nikolaus(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    g.add(k.ball(0xdc2626, 0.62, 0, -0.6, 0, 1, 0.85, 0.9)); // Mantel
    g.add(k.ball(0xffffff, 0.12, 0, -0.35, 0.55, 1, 1, 0.6));
    g.add(k.ball(0xffd8b5, 0.45, 0, 0.18, 0, 1, 1, 1)); // Kopf
    g.add(k.ball(0xffffff, 0.42, 0, -0.05, 0.12, 1.05, 0.75, 0.9)); // Bart
    g.add(k.ball(0xffffff, 0.16, -0.14, 0.08, 0.4, 1.3, 0.6, 0.8));
    g.add(k.ball(0xffffff, 0.16, 0.14, 0.08, 0.4, 1.3, 0.6, 0.8));
    g.add(k.ball(0xf08080, 0.08, 0, 0.16, 0.45));
    k.face(g, [0, 0.18, 0], 0.45, { eyeY: 0.42, eyeDX: 0.33, eyeR: 0.08, mouth: false, cheeks: false });
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 14, 32), k.mat(0xffffff));
    brim.rotation.x = Math.PI / 2 - 0.15;
    brim.position.set(0, 0.48, 0);
    g.add(brim);
    const hat = k.cone(0xdc2626, 0.4, 0.75, 0.05, 0.85, -0.05);
    hat.rotation.z = -0.3;
    g.add(hat, k.ball(0xffffff, 0.12, 0.27, 1.17, -0.05));
    const arm = new THREE.Group();
    arm.position.set(0.5, -0.4, 0.05);
    const sleeve = k.capsule(0xdc2626, 0.13, 0.35, 0, 0.28, 0);
    arm.add(sleeve, k.ball(0x1f2937, 0.15, 0, 0.6, 0));
    arm.rotation.z = 0.3;
    g.add(arm, k.ball(0xdc2626, 0.15, -0.58, -0.55, 0.05, 1, 1.4, 1));
    return { root: g, arm };
  },
  stern(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const star = new THREE.Mesh(starGeometry(THREE, 0.95, 0.45, 0.3), k.mat(0xffd43b, { emissive: 0xffb400, emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.15 }));
    g.add(star);
    for (const side of [-1, 1]) {
      g.add(k.ball(0xffffff, 0.1, side * 0.17, 0.08, 0.27, 1, 1.15, 0.5));
      g.add(k.ball(0x15172a, 0.06, side * 0.17 + 0.01, 0.07, 0.31, 1, 1.15, 0.5));
      g.add(k.ball(0xff8fab, 0.06, side * 0.3, -0.1, 0.25, 1.3, 0.8, 0.4));
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 20, Math.PI), k.mat(0x2a1a2e));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.1, 0.28);
    g.add(smile);
    return { root: g };
  },
  rakete(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const y = -0.7 + (i / 20) * 1.5;
      const r = 0.38 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.0) / 0.8, 2))) + (y < -0.4 ? 0.03 : 0);
      pts.push(new THREE.Vector2(Math.max(0.02, r), y));
    }
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 40), k.mat(0xf1f5f9, { roughness: 0.3, metalness: 0.2 })));
    const tip = k.cone(0xef4444, 0.2, 0.3, 0, 0.72, 0);
    g.add(tip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 12, 28), k.mat(0x1e3a8a, { metalness: 0.4 }));
    ring.position.set(0, 0.15, 0.33);
    g.add(ring, k.ball(0x60a5fa, 0.15, 0, 0.15, 0.31, 1, 1, 0.5, { roughness: 0.1 }));
    g.add(k.ball(0xffffff, 0.045, -0.05, 0.17, 0.39), k.ball(0xffffff, 0.045, 0.05, 0.17, 0.39));
    g.add(k.ball(0x15172a, 0.025, -0.05, 0.17, 0.42), k.ball(0x15172a, 0.025, 0.05, 0.17, 0.42));
    for (let i = 0; i < 3; i++) {
      const fin = k.box(0xef4444, 0.06, 0.4, 0.3, 0, -0.55, 0);
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.sin(a) * 0.38, -0.55, Math.cos(a) * 0.38);
      fin.rotation.y = a + Math.PI / 2;
      g.add(fin);
    }
    const flame = new THREE.Group();
    const f1 = k.cone(0xffd43b, 0.17, 0.45, 0, 0, 0, { emissive: 0xffb400, emissiveIntensity: 1 });
    f1.rotation.x = Math.PI;
    const f2 = k.cone(0xf97316, 0.1, 0.3, 0, 0.03, 0, { emissive: 0xff5a00, emissiveIntensity: 1 });
    f2.rotation.x = Math.PI;
    flame.add(f1, f2);
    flame.position.y = -0.95;
    g.add(flame);
    g.scale.setScalar(1.15);
    return { root: g, flame };
  },
  schneemann(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const snow = { roughness: 0.85 };
    g.add(k.ball(0xf8fafc, 0.62, 0, -0.55, 0, 1, 0.95, 1, snow));
    g.add(k.ball(0xf8fafc, 0.42, 0, 0.25, 0, 1, 1, 1, snow));
    k.face(g, [0, 0.25, 0], 0.42, { eyeY: 0.3, eyeDX: 0.32, eyeR: 0.08, mouthY: -0.3, mouthW: 0.12 });
    const nose = k.cone(0xf97316, 0.06, 0.32, 0, 0.23, 0.55);
    nose.rotation.x = Math.PI / 2;
    g.add(nose);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.09, 14, 32), k.mat(0xdc2626, { roughness: 0.8 }));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = -0.1;
    g.add(scarf, k.box(0xdc2626, 0.16, 0.38, 0.08, 0.2, -0.3, 0.33, { roughness: 0.8 }));
    g.add(k.cyl(0x1f2937, 0.36, 0.36, 0.05, 0, 0.62, 0), k.cyl(0x1f2937, 0.24, 0.26, 0.38, 0, 0.82, 0));
    for (const y of [-0.35, -0.6]) g.add(k.ball(0x1f2937, 0.06, 0, y, 0.6));
    const arm = new THREE.Group();
    arm.position.set(0.5, -0.25, 0);
    const stick = k.cyl(0x7c4a1e, 0.03, 0.04, 0.6, 0, 0.3, 0);
    arm.add(stick);
    arm.rotation.z = -0.9;
    g.add(arm);
    return { root: g, arm };
  },
  clown(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    g.add(k.ball(0x8b5cf6, 0.55, 0, -0.7, 0, 1, 0.75, 0.9));
    for (const [x, y] of [[-0.18, -0.5], [0.18, -0.55]]) g.add(k.ball(0xffd43b, 0.08, x, y, 0.48));
    const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.11, 10, 20), k.mat(0xffffff));
    ruff.rotation.x = Math.PI / 2;
    ruff.position.y = -0.25;
    g.add(ruff);
    g.add(k.ball(0xfff1e6, 0.46, 0, 0.15, 0));
    g.add(k.ball(0xf97316, 0.24, -0.46, 0.2, -0.05, 1, 1.1, 1, { roughness: 0.9 }), k.ball(0xf97316, 0.24, 0.46, 0.2, -0.05, 1, 1.1, 1, { roughness: 0.9 }));
    k.face(g, [0, 0.15, 0], 0.46, { eyeY: 0.3, eyeDX: 0.32, eyeR: 0.1, mouthY: -0.35, mouthW: 0.17 });
    g.add(k.ball(0xef4444, 0.12, 0, 0.1, 0.47, 1, 1, 1, { roughness: 0.25 }));
    const hat = k.cone(0x22c55e, 0.25, 0.5, 0, 0.75, 0);
    hat.rotation.z = 0.15;
    g.add(hat, k.ball(0xffd43b, 0.09, -0.04, 1.0, 0));
    return { root: g };
  },
  hase(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const fur = { roughness: 0.75 };
    g.add(k.ball(0xf5f5f4, 0.55, 0, -0.62, 0, 1, 0.9, 0.95, fur));
    g.add(k.ball(0xffffff, 0.3, 0, -0.62, 0.32, 1, 1.1, 0.6, fur));
    g.add(k.ball(0xf5f5f4, 0.45, 0, 0.1, 0.05, 1, 0.95, 1, fur));
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.2, 0.45, 0);
      ear.rotation.z = -side * 0.18;
      ear.add(k.capsule(0xf5f5f4, 0.11, 0.55, 0, 0.35, 0), k.ball(0xfbcfe8, 0.07, 0, 0.35, 0.08, 1, 4, 0.5));
      g.add(ear);
      g.add(k.ball(0xf5f5f4, 0.17, side * 0.3, -1.05, 0.25, 1, 0.6, 1.4, fur));
    }
    k.face(g, [0, 0.1, 0.05], 0.45, { eyeY: 0.22, eyeDX: 0.33, eyeR: 0.1, mouthY: -0.38, mouthW: 0.08 });
    g.add(k.ball(0xf472b6, 0.06, 0, 0.0, 0.5, 1.2, 0.9, 0.7));
    return { root: g };
  },
  biene(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const body = new THREE.Group();
    body.add(k.ball(0xfacc15, 0.55, 0, -0.35, -0.15, 1, 0.9, 1.15));
    for (const z of [-0.05, -0.35]) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 12, 32), k.mat(0x1f2937));
      stripe.position.set(0, -0.35, z);
      stripe.scale.set(1.02, 0.92, 1);
      body.add(stripe);
    }
    body.add(k.cone(0x1f2937, 0.1, 0.25, 0, -0.35, -0.8));
    body.children[body.children.length - 1].rotation.x = -Math.PI / 2;
    g.add(body);
    g.add(k.ball(0xfacc15, 0.42, 0, 0.25, 0.35));
    k.face(g, [0, 0.25, 0.35], 0.42, { eyeY: 0.18, eyeDX: 0.34, eyeR: 0.11, mouthY: -0.3, mouthW: 0.1 });
    for (const side of [-1, 1]) {
      const a = k.cyl(0x1f2937, 0.02, 0.02, 0.35, side * 0.15, 0.75, 0.3);
      a.rotation.z = -side * 0.35;
      g.add(a, k.ball(0x1f2937, 0.06, side * 0.22, 0.92, 0.3));
    }
    const wings = [-1, 1].map((side) => {
      const w = new THREE.Group();
      w.position.set(side * 0.2, 0.1, -0.2);
      w.add(k.ball(0xe0f2fe, 0.32, side * 0.32, 0.18, 0, 1, 0.55, 0.12, { transparent: true, opacity: 0.6, roughness: 0.05 }));
      g.add(w);
      return w;
    });
    return { root: g, wings };
  },
  sonne(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const rays = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = k.cone(0xf59f00, 0.13, 0.32, Math.cos(a) * 0.82, Math.sin(a) * 0.82, -0.1, { emissive: 0xf59f00, emissiveIntensity: 0.3 });
      r.rotation.z = a - Math.PI / 2;
      rays.add(r);
    }
    g.add(rays, k.ball(0xffd43b, 0.62, 0, 0, 0, 1, 1, 0.9, { emissive: 0xffc300, emissiveIntensity: 0.35, roughness: 0.35 }));
    k.face(g, [0, 0, 0], 0.6, { eyeY: 0.18, eyeDX: 0.3, eyeR: 0.12, mouthW: 0.17 });
    return { root: g, spinner: rays };
  },
  eis(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const waffle = k.cone(0xd99a4e, 0.42, 1.1, 0, -0.55, 0, { roughness: 0.8 });
    waffle.rotation.x = Math.PI;
    g.add(waffle);
    g.add(k.ball(0x86efac, 0.42, 0, 0.05, 0, 1, 0.85, 1));
    g.add(k.ball(0xf9a8d4, 0.38, 0, 0.5, 0.03));
    g.add(k.ball(0xef4444, 0.11, 0.05, 0.92, 0.05, 1, 1, 1, { roughness: 0.15 }));
    const stem = k.cyl(0x166534, 0.015, 0.015, 0.2, 0.1, 1.05, 0.05);
    stem.rotation.z = -0.4;
    g.add(stem);
    k.face(g, [0, 0.5, 0.03], 0.38, { eyeY: 0.15, eyeDX: 0.3, eyeR: 0.09, mouthY: -0.28, mouthW: 0.09 });
    return { root: g };
  },
  igel(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    g.add(k.ball(0xa16207, 0.6, 0, -0.45, -0.1, 1.15, 0.85, 1));
    // Stacheln gleichmäßig auf dem Rücken verteilt
    const n = 70;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 1.4;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * 2.399963;
      const dir = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
      if (dir.z > 0.55 || dir.y < -0.25) continue;
      const spike = k.cone(i % 3 ? 0x5b2d0c : 0x78350f, 0.07, 0.38, 0, 0, 0, { roughness: 0.9 });
      spike.position.set(dir.x * 0.62 * 1.1, -0.45 + dir.y * 0.52, -0.1 + dir.z * 0.6);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.add(spike);
    }
    g.add(k.ball(0xfde68a, 0.32, 0, -0.42, 0.45, 1, 0.9, 1.1));
    const snout = k.ball(0xfde68a, 0.16, 0, -0.5, 0.78, 1, 0.8, 1.2);
    g.add(snout, k.ball(0x15172a, 0.07, 0, -0.47, 0.96, 1, 1, 1, { roughness: 0.2 }));
    k.face(g, [0, -0.42, 0.45], 0.32, { eyeY: 0.35, eyeDX: 0.4, eyeR: 0.07, mouth: false, cheeks: true });
    for (const side of [-1, 1]) g.add(k.ball(0xfde68a, 0.1, side * 0.35, -0.95, 0.2, 1.2, 0.6, 1.4));
    return { root: g };
  },
  wuschel(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const fluff = { roughness: 0.95 };
    g.add(k.ball(0x14b8a6, 0.72, 0, -0.2, 0, 1, 1, 0.92, fluff));
    for (let i = 0; i < 26; i++) {
      const a = i * 2.399963;
      const y = 1 - (i / 25) * 2;
      const r = Math.sqrt(1 - y * y);
      const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      if (d.z > 0.45) continue;
      g.add(k.ball(i % 2 ? 0x0d9488 : 0x2dd4bf, 0.16, d.x * 0.7, -0.2 + d.y * 0.72, d.z * 0.66, 1, 1, 1, fluff));
    }
    for (const side of [-1, 1]) {
      const horn = k.cone(0xfde68a, 0.08, 0.28, side * 0.38, 0.6, 0);
      horn.rotation.z = -side * 0.35;
      g.add(horn);
      g.add(k.ball(0x14b8a6, 0.18, side * 0.35, -0.95, 0.15, 1.1, 0.6, 1.3, fluff));
    }
    k.face(g, [0, -0.2, 0], 0.72, { eyeY: 0.3, eyeDX: 0.28, eyeR: 0.19, mouth: false, cheeks: false });
    const mouthP = k.onSphere([0, -0.2, 0], 0.68, 0, -0.15);
    g.add(k.ball(0x3b0d2b, 0.2, mouthP.pos.x, mouthP.pos.y, mouthP.pos.z, 1.2, 0.6, 0.4));
    g.add(k.box(0xffffff, 0.08, 0.08, 0.04, -0.07, mouthP.pos.y + 0.06, mouthP.pos.z + 0.07), k.box(0xffffff, 0.08, 0.08, 0.04, 0.07, mouthP.pos.y + 0.06, mouthP.pos.z + 0.07));
    return { root: g };
  },
  frosch(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    g.add(k.ball(0x4ade80, 0.68, 0, -0.45, 0, 1.1, 0.75, 1, { roughness: 0.3 }));
    g.add(k.ball(0xbbf7d0, 0.45, 0, -0.55, 0.35, 1, 0.7, 0.6));
    for (const side of [-1, 1]) {
      const c: [number, number, number] = [side * 0.36, 0.08, 0.1];
      g.add(k.ball(0x4ade80, 0.25, ...c, 1, 1, 1, { roughness: 0.3 }));
      g.add(k.ball(0xffffff, 0.17, c[0], c[1] + 0.03, c[2] + 0.13, 1, 1, 0.7));
      g.add(k.ball(0x15172a, 0.09, c[0] + side * 0.01, c[1] + 0.03, c[2] + 0.26, 1, 1.1, 0.6));
      g.add(k.ball(0xffffff, 0.03, c[0] + 0.03, c[1] + 0.07, c[2] + 0.3));
      g.add(k.ball(0x22c55e, 0.2, side * 0.55, -0.95, 0.25, 1.4, 0.4, 1.2));
      g.add(k.ball(0xff8fab, 0.09, side * 0.45, -0.38, 0.55, 1.3, 0.8, 0.4, { transparent: true, opacity: 0.7 }));
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 10, 32, Math.PI), k.mat(0x166534));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.15, 0.6);
    smile.rotation.x = -0.3;
    g.add(smile);
    return { root: g };
  },
  eule(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    g.add(k.ball(0xb45309, 0.62, 0, -0.25, 0, 1, 1.25, 0.95, { roughness: 0.8 }));
    g.add(k.ball(0xfde68a, 0.42, 0, -0.45, 0.3, 1, 1.15, 0.7, { roughness: 0.9 }));
    for (const side of [-1, 1]) {
      g.add(k.ball(0xfef3c7, 0.24, side * 0.25, 0.25, 0.48, 1, 1, 0.45));
      g.add(k.ball(0x15172a, 0.12, side * 0.25, 0.25, 0.58, 1, 1, 0.5));
      g.add(k.ball(0xffffff, 0.04, side * 0.25 + 0.04, 0.3, 0.64));
      const tuft = k.cone(0x92400e, 0.12, 0.3, side * 0.38, 0.75, 0);
      tuft.rotation.z = -side * 0.4;
      g.add(tuft);
      g.add(k.ball(0xf59f00, 0.08, side * 0.15, -1.0, 0.35, 1.4, 0.5, 1));
    }
    const beak = k.cone(0xf59f00, 0.08, 0.2, 0, 0.08, 0.6);
    beak.rotation.x = Math.PI;
    g.add(beak);
    const wings = [-1, 1].map((side) => {
      const w = new THREE.Group();
      w.position.set(side * 0.55, 0.0, 0);
      w.add(k.ball(0x92400e, 0.32, side * 0.05, -0.3, 0, 0.45, 1.1, 0.8, { roughness: 0.8 }));
      g.add(w);
      return w;
    });
    return { root: g, wings };
  },
  roboter(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const metal = { metalness: 0.45, roughness: 0.35 };
    g.add(k.box(0x94a3b8, 0.95, 0.7, 0.7, 0, 0.35, 0, metal));
    g.add(k.box(0x1e293b, 0.72, 0.42, 0.06, 0, 0.37, 0.34));
    for (const side of [-1, 1]) g.add(k.ball(0x22d3ee, 0.09, side * 0.17, 0.4, 0.38, 1, 1, 0.5, { emissive: 0x22d3ee, emissiveIntensity: 1.2 }));
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 16, Math.PI), k.mat(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 1.2 }));
    smile.rotation.z = Math.PI;
    smile.position.set(0, 0.27, 0.38);
    g.add(smile);
    g.add(k.cyl(0x64748b, 0.03, 0.03, 0.3, 0, 0.85, 0), k.ball(0xef4444, 0.08, 0, 1.02, 0, 1, 1, 1, { emissive: 0xef4444, emissiveIntensity: 0.9 }));
    g.add(k.box(0x64748b, 0.8, 0.6, 0.55, 0, -0.45, 0, metal));
    g.add(k.ball(0xfacc15, 0.07, -0.18, -0.4, 0.29, 1, 1, 0.5, { emissive: 0xfacc15, emissiveIntensity: 0.6 }));
    g.add(k.ball(0x22c55e, 0.07, 0.0, -0.4, 0.29, 1, 1, 0.5, { emissive: 0x22c55e, emissiveIntensity: 0.6 }));
    for (const side of [-1, 1]) g.add(k.box(0x475569, 0.22, 0.25, 0.3, side * 0.22, -0.95, 0.02, metal));
    const arm = new THREE.Group();
    arm.position.set(0.48, -0.3, 0);
    arm.add(k.capsule(0x94a3b8, 0.09, 0.35, 0, 0.25, 0), k.ball(0x64748b, 0.12, 0, 0.55, 0));
    arm.rotation.z = 0.25;
    const left = k.capsule(0x94a3b8, 0.09, 0.35, -0.55, -0.45, 0);
    left.rotation.z = -0.2;
    g.add(arm, left);
    return { root: g, arm };
  },
  dino(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const skin = { roughness: 0.5 };
    g.add(k.ball(0x34d399, 0.6, -0.1, -0.45, 0, 1.15, 0.9, 0.9, skin));
    g.add(k.ball(0xa7f3d0, 0.38, 0.05, -0.5, 0.32, 1, 1.1, 0.6));
    g.add(k.ball(0x34d399, 0.42, 0.25, 0.3, 0.1, 1.1, 0.95, 1, skin));
    const tail = k.cone(0x34d399, 0.28, 0.8, -0.85, -0.65, -0.1, skin);
    tail.rotation.z = Math.PI / 2 + 0.35;
    g.add(tail);
    for (let i = 0; i < 5; i++) {
      const sp = k.cone(0xfbbf24, 0.08, 0.2, -0.55 + i * 0.22, 0.08 - Math.abs(i - 2) * -0.02 + (i > 2 ? 0.25 : 0), -0.05);
      sp.position.y = i < 3 ? 0.05 + i * 0.03 : 0.55 + (i - 3) * 0.12;
      sp.position.x = i < 3 ? -0.55 + i * 0.25 : 0.05 + (i - 3) * 0.18;
      g.add(sp);
    }
    k.face(g, [0.25, 0.3, 0.1], 0.42, { eyeY: 0.3, eyeDX: 0.28, eyeR: 0.1, mouthY: -0.25, mouthW: 0.15 });
    for (const side of [-1, 1]) g.add(k.ball(0x10b981, 0.18, -0.1 + side * 0.3, -1.0, 0.15, 1, 0.6, 1.3, skin));
    g.add(k.ball(0x10b981, 0.1, 0.4, -0.25, 0.4, 1, 1.4, 1, skin));
    return { root: g };
  },
  krake(THREE) {
    const k = kit(THREE);
    const g = new THREE.Group();
    const skin = { roughness: 0.35 };
    g.add(k.ball(0xc084fc, 0.62, 0, 0.15, 0, 1, 1.05, 0.95, skin));
    const tentacles: T.Object3D[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2;
      const t = new THREE.Group();
      t.position.set(Math.cos(a) * 0.38, -0.35, Math.sin(a) * 0.38);
      t.rotation.y = -a;
      for (let j = 0; j < 4; j++) t.add(k.ball(j % 2 ? 0xd8b4fe : 0xc084fc, 0.16 - j * 0.028, j * 0.12, -j * 0.17, 0, 1, 1, 1, skin));
      g.add(t);
      tentacles.push(t);
    }
    k.face(g, [0, 0.15, 0], 0.62, { eyeY: 0.2, eyeDX: 0.3, eyeR: 0.16, mouthW: 0.15 });
    return { root: g, tentacles };
  },
};
