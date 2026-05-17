import * as THREE from 'three';
import diskVertSrc from './shaders/disk.vert?raw';
import diskFragSrc from './shaders/disk.frag?raw';

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
  // Field-of-view expressed as focal length in UV-space:
  // larger → narrower FOV (more zoom).  1.6 ≈ 55° vertical FOV.
  uFov:          { value: 1.6 },
};

const mat = new THREE.RawShaderMaterial({
  vertexShader:   diskVertSrc,
  fragmentShader: diskFragSrc,
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
const DIST_MIN    = 7.0;
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
  const target = new THREE.Vector3(0, 0, 0);
  const worldUp = new THREE.Vector3(0, 1, 0);

  const fwd = new THREE.Vector3().subVectors(target, eye).normalize();

  // right = normalize(worldUp × fwd) — works for non-vertical gaze
  const right = new THREE.Vector3().crossVectors(worldUp, fwd);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0); // degenerate guard
  right.normalize();

  // up = cross(fwd, right) — camera's "up" in world space
  const up = new THREE.Vector3().crossVectors(fwd, right);

  // THREE.Matrix3.set() takes row-major arguments.
  // Resulting matrix M satisfies:
  //   M * (1,0,0) = right,  M * (0,1,0) = up,  M * (0,0,1) = fwd
  return new THREE.Matrix3().set(
    right.x, up.x, fwd.x,
    right.y, up.y, fwd.y,
    right.z, up.z, fwd.z,
  );
}

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
