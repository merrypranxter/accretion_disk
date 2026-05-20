import * as THREE from 'three';
import diskVertSrc   from './shaders/disk.vert?raw';
import lensingFragSrc from './shaders/lensing.frag?raw';

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
  // Observer inclination angle in radians.
  // 0.0 = face-on (looking down the jet axis)
  // π/2 = edge-on (in the disk plane, maximum lensing elongation)
  uInclination:  { value: 0.0 },
};

const mat = new THREE.RawShaderMaterial({
  vertexShader:   diskVertSrc,
  fragmentShader: lensingFragSrc,
  uniforms,
  glslVersion: THREE.GLSL3,
});

scene.add(new THREE.Mesh(geo, mat));

// ── Inclination Slider ────────────────────────────────────────────────────────
const inclSlider = document.getElementById('incl-slider');
const inclLabel  = document.getElementById('incl-label');

function updateInclination(deg) {
  const rad = deg * Math.PI / 180.0;
  uniforms.uInclination.value = rad;
  if (inclLabel) inclLabel.textContent = `${deg}°`;
}

if (inclSlider) {
  inclSlider.addEventListener('input', () => {
    updateInclination(parseFloat(inclSlider.value));
  });
  updateInclination(parseFloat(inclSlider.value));
} else {
  updateInclination(0);
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
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
