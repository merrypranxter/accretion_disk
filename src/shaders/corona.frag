#version 300 es
precision highp float;

// ─────────────────────────────────────────────────────────────────────────────
// Uniforms
// ─────────────────────────────────────────────────────────────────────────────
uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uCameraPos;
uniform mat3  uCameraMatrix;
uniform float uFov;

out vec4 fragColor;

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICAL CONSTANTS  (geometrized units: G = c = M = 1)
// ─────────────────────────────────────────────────────────────────────────────
const float M  = 1.0;
const float RS = 2.0;    // Schwarzschild radius

// ─────────────────────────────────────────────────────────────────────────────
// ADAF GEOMETRY PARAMETERS
//
// Advection-Dominated Accretion Flow (Narayan & Yi 1994, 1995):
//   - Geometrically THICK: H/R ~ 0.5 – 1.0  (vs 0.04 for thin disk)
//   - Optically THIN: free-free absorption κ_ff << 1
//   - Very hot: T_e ~ 10⁹ K (electrons), T_i ~ 10¹¹ K (ions)
//   - Sub-Eddington: Ṁ ≪ Ṁ_Edd
//   - Hot gas advects energy into the hole rather than radiating it away
// ─────────────────────────────────────────────────────────────────────────────
const float ADAF_INNER  = 2.5;   // inner edge (≥ RS)
const float ADAF_OUTER  = 18.0;  // outer truncation radius
const float ADAF_H_OVER_R = 0.55; // geometric thickness parameter

// ─────────────────────────────────────────────────────────────────────────────
// CORONA EMISSION PARAMETERS
//
// Two dominant emission mechanisms in the hot ADAF plasma:
//   1. Bremsstrahlung (free-free): ε_ff ∝ n² T^(1/2) exp(-hν/kT)
//      Emissivity: j_ff ≈ 1.4×10⁻²⁷ n² T^(1/2) erg/cm³/s
//   2. Synchrotron: ε_sync ∝ n B² ν^(1/3) (optically thick self-abs.)
//      Peak synchrotron frequency ∝ B T²  → radio/IR/optical in ADAF
//
// Both processes produce hard X-ray continuum. The corona Comptonises
// seed photons from the truncated outer disk, producing a power-law
// spectrum with photon index Γ ~ 1.5–2.0.
// ─────────────────────────────────────────────────────────────────────────────
const float T_CORONA_ELECTRON = 1.2e9;  // K — electron temperature
const float T_CORONA_ION      = 5.0e11; // K — ion temperature (virial)

// ─────────────────────────────────────────────────────────────────────────────
// RAY-MARCH PARAMETERS
// ─────────────────────────────────────────────────────────────────────────────
const int   MAX_STEPS  = 280;
const float STEP_SIZE  = 0.10;
const float ESCAPE_DIST = 70.0;
const float GR_COUPLING = 1.5;

// ─────────────────────────────────────────────────────────────────────────────
// HASH / NOISE / fBm
// ─────────────────────────────────────────────────────────────────────────────
float hash3(vec3 p) {
  p  = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  const mat3 rot = mat3(
     0.00,  0.80,  0.60,
    -0.80,  0.36, -0.48,
    -0.60, -0.48,  0.64);
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p  = rot * p * 2.1;
    a *= 0.5;
  }
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOR SCIENCE: blackbody temperature → linearized sRGB
// ─────────────────────────────────────────────────────────────────────────────
vec3 blackbodyRGB(float temp) {
  temp = clamp(temp, 800.0, 6.5e7);
  float t = temp * 0.01;
  float r = (t <= 66.0) ? 1.0
          : clamp(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0);
  float g = (t <= 66.0)
          ? clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0)
          : clamp(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0);
  float b;
  if      (t >= 66.0) b = 1.0;
  else if (t <= 19.0) b = 0.0;
  else b = clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0);
  return vec3(r, g, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNCHROTRON COLOR  (power-law spectrum approximation)
//
// For a relativistic plasma with pitch-angle-averaged distribution,
// optically-thin synchrotron emission peaks in the radio, but the visible
// part of the spectrum follows ε_ν ∝ ν^(1−2p)/2 where p is the electron
// power-law index.  For p ≈ 2.5 (typical ADAF):
//   α_ν ≈ −0.75  → I_ν ∝ ν^(−0.75)  (steep red spectrum)
//
// We represent this as a blend from orange-red to deep blue for the
// "hard" comptonized component, peaking in the soft X-ray.
// ─────────────────────────────────────────────────────────────────────────────
vec3 synchrotronColor(float normFreq) {
  // normFreq: 0.0 = radio/IR, 1.0 = X-ray/gamma
  vec3 radio  = vec3(0.90, 0.30, 0.05);  // radio: deep orange
  vec3 optical= vec3(0.50, 0.50, 1.00);  // optical: blue-violet
  vec3 xray   = vec3(0.20, 0.60, 1.00);  // X-ray: cool blue-white
  float t1 = clamp(normFreq * 2.0, 0.0, 1.0);
  float t2 = clamp(normFreq * 2.0 - 1.0, 0.0, 1.0);
  return mix(mix(radio, optical, t1), xray, t2);
}

// ─────────────────────────────────────────────────────────────────────────────
// ADAF TORUS DENSITY
//
// Fishbone-Moncrief (1976) torus profile (simplified parametric version):
//   The constant-density surfaces follow   l(r, θ) = l_0 = const
//   where l(r,θ) is the specific angular momentum.
//
// For the visualization we use a simpler parametric torus:
//   ρ(r, θ) ∝ (sin θ)^(n_θ) · r^(n_r) · f(r)
//
// Geometrically thick: H(r)/r ≈ ADAF_H_OVER_R, so the torus occupies
// the angular range |θ − π/2| < arctan(H/R) ≈ 29°.
// ─────────────────────────────────────────────────────────────────────────────
float adafDensity(vec3 pos) {
  float r_cyl = length(vec2(pos.x, pos.z));
  float r     = length(pos);

  if (r < ADAF_INNER || r_cyl > ADAF_OUTER) return 0.0;

  // Vertical (θ) structure: much thicker than thin disk
  // Angle from midplane: elevation / r_cyl
  float sinElev = abs(pos.y) / max(r, 0.01);
  float halfOpen = ADAF_H_OVER_R;  // ~ 0.55
  float vertProfile = exp(-0.5 * (sinElev / halfOpen) * (sinElev / halfOpen));

  // Radial structure: power-law decline ρ ∝ r^(-3/2) (ADAF self-similar)
  float rhoRadial = pow(r / ADAF_INNER, -1.5)
                  * (1.0 - exp(-(r - ADAF_INNER) / (1.5 * M)));

  // Turbulent modulation in ADAF: MHD turbulence drives large filling factor
  float omega   = 0.5 / (pow(r_cyl, 1.5) + 0.1);
  float angle   = atan(pos.z, pos.x) + omega * uTime;
  vec3  noiseP  = vec3(cos(angle) * r_cyl * 0.2, pos.y * 0.15, sin(angle) * r_cyl * 0.2);
  float turb    = 0.50 + 0.50 * fbm(noiseP + vec3(uTime * 0.03, 0.0, 0.0));

  return vertProfile * rhoRadial * turb * 0.08;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAGNETIC RECONNECTION FLARES
//
// Magnetic reconnection in a magnetically-arrested disk (MAD state) releases
// compact bursts of energy.  These are modelled as moving hot spots with
// brightness ∝ B² ∝ n_flare(pos, t).
//
// The spots orbit at the local Keplerian frequency and decay on timescale
// t_orb ≈ 2π r^(3/2) / M^(1/2).
// ─────────────────────────────────────────────────────────────────────────────
float flareDensity(vec3 pos) {
  float r_cyl = length(vec2(pos.x, pos.z));
  if (r_cyl < ADAF_INNER || r_cyl > 12.0) return 0.0;

  float total = 0.0;
  // Three distinct flare sites with different orbital phases and timescales
  for (int k = 0; k < 3; k++) {
    float phase = float(k) * 2.094;      // 2π/3 apart
    float r_k   = ADAF_INNER + float(k) * 2.5;
    float omega  = 1.0 / (pow(r_k, 1.5) + 0.01);
    float phi_k  = phase + omega * uTime;

    vec3  center = vec3(cos(phi_k) * r_k, 0.0, sin(phi_k) * r_k);
    float dist   = length(pos - center);

    // Flare amplitude pulses: bright burst + exponential decay
    float pulse = 0.5 + 0.5 * sin(uTime * (1.5 + float(k) * 0.4));
    pulse = pow(max(pulse, 0.0), 3.0);  // sharpen the burst

    float blob = exp(-dist * dist / 0.8) * pulse;
    total += blob;
  }
  return total * 0.6;
}

// ─────────────────────────────────────────────────────────────────────────────
// BREMSSTRAHLUNG EMISSIVITY
//
// Thermal bremsstrahlung (free-free) emissivity:
//   ε_ff ∝ n² T_e^(1/2) (in optically thin limit)
// Colour: approximated by a hot blackbody at T_e clipped to X-ray band.
// ─────────────────────────────────────────────────────────────────────────────
vec3 bremsstrahlungColor(float density, float T_e) {
  // X-ray bremsstrahlung: mostly flat above peak, sharp cutoff hν > kT
  // Visible portion: blue-dominated continuum
  vec3  bbCol = blackbodyRGB(T_e);
  float emiss = density * density * sqrt(T_e / 1.0e9) * STEP_SIZE * 22.0;
  return bbCol * emiss;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEODESIC FORCE  (Schwarzschild null geodesic, same as disk.frag)
// ─────────────────────────────────────────────────────────────────────────────
vec3 geodesicForce(vec3 pos) {
  float r2 = dot(pos, pos);
  if (r2 < 0.01) return vec3(0.0);
  return -(GR_COUPLING * M / (r2 * sqrt(r2))) * pos;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAR FIELD
// ─────────────────────────────────────────────────────────────────────────────
vec3 starField(vec3 dir) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float scale = 100.0 + float(i) * 80.0;
    vec3  p     = floor(dir * scale + 0.5);
    float h     = hash3(p + float(i) * 0.731);
    if (h > 0.9978) {
      float bright = pow((h - 0.9978) * 454.0, 1.4) * 2.0;
      float tStar  = mix(3200.0, 28000.0, hash3(p * 1.37 + 2.1));
      col += blackbodyRGB(tStar) * bright;
    }
  }
  float mw = fbm(dir * 2.8 + vec3(0.07, 0.0, 0.19)) * 0.012;
  col += vec3(0.28, 0.36, 0.55) * mw;
  return col;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACES FILMIC TONE MAPPING
// ─────────────────────────────────────────────────────────────────────────────
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN  —  volumetric ADAF ray-march
// ─────────────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv  = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec3 ro  = uCameraPos;
  vec3 dir = normalize(uCameraMatrix * vec3(uv, uFov));

  vec3  pos      = ro;
  vec3  color    = vec3(0.0);
  float transmit = 1.0;
  bool  hitHorizon = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    float r = length(pos);

    // ── Event horizon ────────────────────────────────────────────────
    if (r < RS * 1.03) { hitHorizon = true; break; }
    if (r > ESCAPE_DIST) break;

    float r_cyl = length(vec2(pos.x, pos.z));

    // ── ADAF torus volume emission ───────────────────────────────────
    if (transmit > 0.005) {
      float aDens = adafDensity(pos);
      if (aDens > 0.0002) {
        // Radial temperature gradient: hot inside, cooler outside
        // ADAF T_e ∝ r^(-1)  (virial-like electron heating)
        float T_e   = T_CORONA_ELECTRON * clamp(ADAF_INNER / r, 0.1, 5.0);

        // Synchrotron component (peaks at ~ν ~ 10^11 Hz → visible-UV for high B)
        float normF = clamp(1.0 - r / ADAF_OUTER, 0.0, 1.0);
        vec3  syncCol = synchrotronColor(normF) * aDens * STEP_SIZE * 12.0;
        color += transmit * syncCol;

        // Bremsstrahlung component (X-ray tail)
        vec3 bremsCol = bremsstrahlungColor(aDens, T_e);
        color += transmit * bremsCol;

        // Very mild opacity (ADAF is optically thin!)
        float opacity = clamp(aDens * STEP_SIZE * 0.8, 0.0, 0.08);
        transmit *= (1.0 - opacity);
      }
    }

    // ── Magnetic reconnection flares ─────────────────────────────────
    if (transmit > 0.005) {
      float fDens = flareDensity(pos);
      if (fDens > 0.001) {
        // Flares are extremely hot and bright: T_flare ~ 10^10 K (hard X-ray)
        vec3 flareCol = vec3(0.90, 0.95, 1.00) * fDens * STEP_SIZE * 30.0;
        color += transmit * flareCol;
      }
    }

    // ── Geodesic deflection (Schwarzschild approximation) ─────────────
    vec3 accel = geodesicForce(pos);
    dir = normalize(dir + accel * STEP_SIZE);
    pos += dir * STEP_SIZE;
  }

  // ── Background stars ──────────────────────────────────────────────
  if (!hitHorizon) {
    color += transmit * starField(dir);
  }

  // ── Post-processing ───────────────────────────────────────────────
  color = aces(color * 0.75);
  color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

  fragColor = vec4(color, 1.0);
}
