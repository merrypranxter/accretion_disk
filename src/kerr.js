import * as THREE from 'three';
import diskVertSrc from './shaders/disk.vert?raw';
import kerrFragSrc from './shaders/kerr.frag?raw';

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene  = new THREE.Scene();
// Orthographic camera for a full-screen quad — the real camera is in the shader.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ── Full-screen Quad ──────────────────────────────────────────────────────────
const geo = new THREE.PlaneGeometry(2, 2);

const uniforms = {
  uResolution:   { value: new THREE.Vector2() },
  uTime:         { value: 0.0 },
  uCameraPos:    { value: new THREE.Vector3(0, 5, -14) },
  uCameraMatrix: { value: new THREE.Matrix3() },
  // Field-of-view expressed as focal length in UV-space.
  uFov:          { value: 1.6 },
  // Black hole spin parameter a/M  (0.0 = Schwarzschild, 0.998 = near-extremal Kerr)
  uSpin:         { value: 0.998 },
};

const mat = new THREE.RawShaderMaterial({
  vertexShader:   diskVertSrc,
  fragmentShader: kerrFragSrc,
  uniforms,
  glslVersion: THREE.GLSL3,
});

scene.add(new THREE.Mesh(geo, mat));

// ── Camera Orbit State ────────────────────────────────────────────────────────
let phi   = 0.0;    // azimuthal angle, radians
let theta = 0.28;   // elevation above disk plane, radians
let dist  = 16.0;   // camera distance from origin

const PHI_SPEED   = 0.006;
const THETA_SPEED = 0.006;
const THETA_MIN   = 0.015;           // nearly edge-on
const THETA_MAX   = Math.PI * 0.48;  // nearly pole-on
const DIST_MIN    = 6.0;
const DIST_MAX    = 40.0;

let isDragging  = false;
let lastPointer = { x: 0, y: 0 };

function onPointerDown(x, y) {
  isDragging  = true;
  lastPointer = { x, y };
}
function onPointerMove(x, y) {
  if (!isDragging) return;
  phi   += (x - lastPointer.x) * PHI_SPEED;
  theta  = Math.max(THETA_MIN, Math.min(THETA_MAX,
             theta - (y - lastPointer.y) * THETA_SPEED));
  lastPointer = { x, y };
}
function onPointerUp() { isDragging = false; }

canvas.addEventListener('mousedown',  (e) => onPointerDown(e.clientX, e.clientY));
canvas.addEventListener('mousemove',  (e) => onPointerMove(e.clientX, e.clientY));
canvas.addEventListener('mouseup',    onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);

canvas.addEventListener('touchstart', (e) => {
  onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
canvas.addEventListener('touchend', onPointerUp);

canvas.addEventListener('wheel', (e) => {
  dist = Math.max(DIST_MIN, Math.min(DIST_MAX, dist + e.deltaY * 0.02));
  e.preventDefault();
}, { passive: false });

// ── Camera Matrix ─────────────────────────────────────────────────────────────
// Builds a column-major mat3 that maps camera-space (right, up, forward)
// to world space, for use in the shader's ray direction formula:
//   rd = normalize(uCameraMatrix * vec3(uv, uFov))
function buildCamMatrix(eye) {
  const target  = new THREE.Vector3(0, 0, 0);
  const worldUp = new THREE.Vector3(0, 1, 0);

  const fwd = new THREE.Vector3().subVectors(target, eye).normalize();

  // right = normalize(worldUp × fwd) — works for non-vertical gaze
  const right = new THREE.Vector3().crossVectors(worldUp, fwd);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0); // degenerate guard
  right.normalize();

  // up = cross(fwd, right) — camera's "up" in world space
  const up = new THREE.Vector3().crossVectors(fwd, right);

  // THREE.Matrix3.set() takes row-major arguments.
  return new THREE.Matrix3().set(
    right.x, up.x, fwd.x,
    right.y, up.y, fwd.y,
    right.z, up.z, fwd.z,
  );
}

// ── Physics Readout Panel ─────────────────────────────────────────────────────
// Displays spin-derived quantities computed in JS (matching shader formulas).
const hudISCO = document.getElementById('hud-isco');
const hudHorizon = document.getElementById('hud-horizon');
const hudErgosphere = document.getElementById('hud-ergosphere');
const hudOmegaH = document.getElementById('hud-omega-h');
const hudSpin = document.getElementById('hud-spin');
const spinSlider = document.getElementById('spin-slider');

function computeKerrPhysics(a) {
  // ── Kerr ISCO (Bardeen 1972, prograde) ──
  //   Z1 = 1 + (1−a²)^(1/3) [(1+a)^(1/3) + (1−a)^(1/3)]
  //   Z2 = √(3a² + Z1²)
  //   r_ISCO = 3 + Z2 − √((3−Z1)(3+Z1+2Z2))
  const z1 = 1.0 + Math.cbrt(1.0 - a * a) * (Math.cbrt(1.0 + a) + Math.cbrt(1.0 - a));
  const z2 = Math.sqrt(3.0 * a * a + z1 * z1);
  const rISCO = 3.0 + z2 - Math.sqrt((3.0 - z1) * (3.0 + z1 + 2.0 * z2));

  // ── Event horizon: r_+ = 1 + √(1 − a²) ──
  const rPlus = 1.0 + Math.sqrt(1.0 - a * a);

  // ── Ergosphere (equatorial): r_erg = 2M always for Schwarzschild equiv ──
  //   r_erg(θ) = 1 + √(1 − a² cos²θ); at equator: r_erg = 1 + √(1−0) = 2
  //   The equatorial ergosphere is r = 2M regardless of a.
  const rErg = 2.0; // equatorial, always 2M for any a

  // ── Horizon angular velocity: Ω_H = a / (2 r_+) ──
  const omegaH = a / (2.0 * rPlus);

  return { rISCO, rPlus, rErg, omegaH };
}

function updateHUD(a) {
  const { rISCO, rPlus, rErg, omegaH } = computeKerrPhysics(a);
  if (hudSpin)       hudSpin.textContent       = `a = ${a.toFixed(3)} M`;
  if (hudISCO)       hudISCO.textContent       = `r_ISCO = ${rISCO.toFixed(3)} M`;
  if (hudHorizon)    hudHorizon.textContent    = `r₊ = ${rPlus.toFixed(3)} M`;
  if (hudErgosphere) hudErgosphere.textContent = `r_erg(eq) = ${rErg.toFixed(2)} M`;
  if (hudOmegaH)     hudOmegaH.textContent     = `Ω_H = ${omegaH.toFixed(4)} M⁻¹`;
}

// Wire up the spin slider
if (spinSlider) {
  spinSlider.addEventListener('input', () => {
    const a = parseFloat(spinSlider.value);
    uniforms.uSpin.value = a;
    updateHUD(a);
  });
}

// Initial HUD state
updateHUD(uniforms.uSpin.value);

// ── Resize Handling ───────────────────────────────────────────────────────────
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  uniforms.uResolution.value.set(
    w * renderer.getPixelRatio(),
    h * renderer.getPixelRatio(),
  );
}
new ResizeObserver(resize).observe(canvas);
resize();

// ── Animation Loop ────────────────────────────────────────────────────────────
let startTime = -1;

function animate(ts) {
  requestAnimationFrame(animate);
  if (startTime < 0) startTime = ts;
  const time = (ts - startTime) * 0.001;

  uniforms.uTime.value = time;

  // Spherical → Cartesian
  const cy = dist * Math.sin(theta);
  const cr = dist * Math.cos(theta);
  const cx = cr * Math.sin(phi);
  const cz = cr * Math.cos(phi);

  const eye = new THREE.Vector3(cx, cy, cz);
  uniforms.uCameraPos.value.copy(eye);
  uniforms.uCameraMatrix.value = buildCamMatrix(eye);

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
