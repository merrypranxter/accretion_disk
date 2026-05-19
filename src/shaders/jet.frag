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
const float M   = 1.0;
const float RS  = 2.0;    // Schwarzschild radius

// ─────────────────────────────────────────────────────────────────────────────
// JET PARAMETERS — Blandford-Znajek Mechanism
//
// The BZ process (Blandford & Znajek 1977, MNRAS 179, 433) extracts spin
// energy from a Kerr black hole via large-scale poloidal magnetic field:
//
//   P_BZ ≈ (κ/4πc) Φ_BH² Ω_H²
//
// where Ω_H = ac / (2r_+) is the horizon angular velocity,
// Φ_BH is the magnetic flux threading the horizon, and κ ≈ 0.044.
//
// The jet launches as a pair-dominated, relativistically magnetized outflow
// with Lorentz factor Γ ~ 10–30 on pc scales, decelerating to Γ ~ 2–5 on
// kpc scales via Kelvin-Helmholtz instabilities.
//
// Two-sided jet: approaching (south → camera) vs receding (north → away).
// Relativistic Doppler boosting: S_obs = S_em / (δ^(3+α)) where
//   δ = 1/(Γ(1 − β cosθ))   and α is spectral index.
// ─────────────────────────────────────────────────────────────────────────────
const float JET_INNER_RADIUS  = 0.8;   // M — half-opening radius at base
const float JET_OPENING_ANGLE = 0.06;  // rad — half-opening angle (collimated)
const float JET_LENGTH        = 40.0;  // M — jet visible length from nucleus
const float JET_BETA          = 0.96;  // v/c for Doppler calculation
const float JET_GAMMA         = 3.57;  // Lorentz factor √(1/(1−β²))

// Helical B-field helix pitch (VLBI: poloidal + toroidal, pitch~1)
const float HELIX_PITCH    = 3.5;   // M per full turn at the jet base
const float HELIX_DECAY    = 0.10;  // decay constant for helix radius growth

// KH instability knot spacing
const float KNOT_SPACING   = 4.5;   // M
const float KNOT_HALF_WIDTH= 0.9;   // M

// ─────────────────────────────────────────────────────────────────────────────
// RAY-MARCH PARAMETERS
// ─────────────────────────────────────────────────────────────────────────────
const int   MAX_STEPS  = 300;
const float STEP_SIZE  = 0.14;
const float ESCAPE_DIST= 70.0;
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
// COLOR SCIENCE
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
// SYNCHROTRON SPECTRUM  (relativistic electrons, power-law distribution)
//
// For an electron power-law spectrum N(E) ∝ E^(-p) with p ≈ 2.2:
//   I_ν ∝ B^((p+1)/2) · ν^(−(p−1)/2) = B^1.6 · ν^(−0.6)
//
// Colour: steep negative spectral slope means redder at lower ν.
// The BZ jet is pair-dominated and magnetically dominated near the base,
// with synchrotron self-absorption frequency ν_SSA ∝ B^(7/2) r^(-1).
// Above ν_SSA (optical/UV): I_ν ∝ ν^(−0.6) → blue-violet
// Below ν_SSA (radio): I_ν ∝ ν^(5/2) → self-absorbed (hidden)
//
// We colour by height along the jet:
//   Base: hot blue-white (high B, high Lorentz factor)
//   Mid:  cyan-blue (synchrotron cooling, particle reacceleration at knots)
//   Tip:  violet-magenta (aging electrons, steepened spectrum)
// ─────────────────────────────────────────────────────────────────────────────
vec3 jetColor(float yAbs, float density) {
  float t = clamp(yAbs / JET_LENGTH, 0.0, 1.0);
  // Base to mid: blue-white → cyan
  vec3 c0 = vec3(0.85, 0.92, 1.00);   // base: blue-white (T ~ 10^9 K synchrotron)
  vec3 c1 = vec3(0.20, 0.70, 1.00);   // mid:  cyan (cooling plasma)
  vec3 c2 = vec3(0.60, 0.15, 0.90);   // tip:  violet-magenta (aged electrons)
  float t1 = smoothstep(0.0, 0.4, t);
  float t2 = smoothstep(0.4, 1.0, t);
  return mix(mix(c0, c1, t1), c2, t2);
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATIVISTIC DOPPLER BEAMING
//
// For a relativistic jet at angle θ to line of sight:
//   δ = 1 / (Γ (1 − β cos θ))
//
// Observed flux: S_obs = δ^(3+α) · S_em  where α ≈ 0.6 (spectral index)
//
// Approaching jet (θ < π/2): δ > 1  →  amplified, blueshifted
// Receding  jet (θ > π/2): δ < 1  →  dimmed, redshifted
// ─────────────────────────────────────────────────────────────────────────────
float dopplerFactor(vec3 jetDir, vec3 rayDir) {
  // jetDir is unit vector of jet propagation (toward camera side)
  // rayDir is the ray direction (from lens toward observer, so negative)
  float cosTheta = dot(jetDir, -rayDir);
  float denom    = JET_GAMMA * (1.0 - JET_BETA * cosTheta);
  return 1.0 / max(denom, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELICAL B-FIELD DENSITY
//
// The jet spine carries a helical magnetic field threading the flow:
//   B_φ ∝ r^(-1)    (toroidal, azimuthal)
//   B_z ∝ r^(-2)    (poloidal, along jet axis)
//
// Combined helical field amplitude ∝ B_φ² + B_z² ∝ r^(-2) + r^(-4)
// Visualization: helical ridge of brighter synchrotron emission.
// ─────────────────────────────────────────────────────────────────────────────
float helixDensity(vec3 pos) {
  float y    = pos.y;
  float yAbs = abs(y);
  if (yAbs < 0.5 || yAbs > JET_LENGTH) return 0.0;

  float r_jet = length(vec2(pos.x, pos.z));

  // Jet cone boundary: opening angle grows slowly with height
  float jetRadius = JET_INNER_RADIUS + yAbs * JET_OPENING_ANGLE;
  if (r_jet > jetRadius * 2.0) return 0.0;

  // Azimuthal phase at this height along the jet
  float phi_jet = atan(pos.z, pos.x);

  // Helical pitch: phase advances by 2π over HELIX_PITCH distance
  float helixPhase = phi_jet - y * (2.0 * 3.14159) / HELIX_PITCH;

  // The bright ridge of the helix: narrow Gaussian around helixPhase = 0
  float phaseMod   = sin(helixPhase - uTime * 0.2);
  float helixRidge = exp(-phaseMod * phaseMod * 8.0) * 0.4 + 0.3;  // base + ridge

  // Radial density: peaked on the jet axis with a slight hollow core
  // (pair-dominated spine + sheath structure)
  float innerR  = jetRadius * 0.3;  // spine boundary
  float radDens;
  if (r_jet < innerR) {
    // Spine: mildly hollow (magnetized, pair-dominated)
    radDens = 0.4 + 0.6 * (r_jet / innerR);
  } else {
    // Sheath: declining exponential
    radDens = exp(-(r_jet - innerR) * (r_jet - innerR) / (jetRadius * jetRadius * 0.4));
  }

  // Axial density: power-law with height + KH knot structure
  float axialBase = pow(yAbs / JET_LENGTH + 0.1, -0.8);

  // KH instability knots: sinusoidal density modulation along jet axis
  // Knot pattern advects at a fraction of the jet speed
  float knotPhase = (yAbs / KNOT_SPACING) - uTime * 0.15;
  float knot      = 0.5 + 0.5 * sin(knotPhase * 6.28318);
  knot            = pow(knot, 5.0);  // sharpen knot peaks
  float axialDens = axialBase * (1.0 + knot * 1.5);

  // Turbulence in the KH mixing layer
  float turbFreq = 4.0;
  vec3  turbPos  = vec3(r_jet * cos(phi_jet), yAbs * 0.5, r_jet * sin(phi_jet)) * turbFreq;
  float turb     = 0.65 + 0.35 * fbm(turbPos + vec3(0.0, uTime * 0.06, 0.0));

  return radDens * axialDens * helixRidge * turb * 0.05;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEODESIC FORCE  (Schwarzschild approximation near disk/jet base)
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
    float scale = 90.0 + float(i) * 70.0;
    vec3  p     = floor(dir * scale + 0.5);
    float h     = hash3(p + float(i) * 0.617);
    if (h > 0.9982) {
      float bright = pow((h - 0.9982) * 556.0, 1.4) * 1.8;
      float tStar  = mix(3500.0, 30000.0, hash3(p * 1.41 + 2.3));
      col += blackbodyRGB(tStar) * bright;
    }
  }
  float mw = fbm(dir * 2.4 + vec3(0.0, 0.14, 0.0)) * 0.010;
  col += vec3(0.25, 0.33, 0.52) * mw;
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
// MAIN  —  two-sided BZ jet volumetric ray-march
// ─────────────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv  = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec3 ro  = uCameraPos;
  vec3 dir = normalize(uCameraMatrix * vec3(uv, uFov));

  vec3  pos      = ro;
  vec3  color    = vec3(0.0);
  float transmit = 1.0;
  bool  hitHorizon = false;

  // Axis of spin (and jet): y-axis  (same as kerr.frag convention)
  vec3 approachJetDir = vec3(0.0,  1.0, 0.0);  // approaching (toward observer)
  vec3 recedingJetDir = vec3(0.0, -1.0, 0.0);  // receding

  // Doppler amplification for each jet lobe
  float delta_app = dopplerFactor(approachJetDir, dir);
  float delta_rec = dopplerFactor(recedingJetDir, dir);

  // Spectral index for Doppler: S_obs ∝ δ^(3+α), α ≈ 0.6 → exponent ≈ 3.6
  const float DOPPLER_EXP = 3.6;
  float amp_app = pow(delta_app, DOPPLER_EXP);
  float amp_rec = pow(delta_rec, DOPPLER_EXP);

  for (int i = 0; i < MAX_STEPS; i++) {
    float r = length(pos);
    if (r < RS * 1.05) { hitHorizon = true; break; }
    if (r > ESCAPE_DIST) break;

    // ── Approaching jet (y > 0) ──────────────────────────────────────
    if (transmit > 0.005) {
      // Sample jet density regardless of pos.y sign; distinguish after
      vec3 posApp = pos;  // y component is already positive or negative
      float jDens = helixDensity(pos);

      if (jDens > 0.0003) {
        float yAbs = abs(pos.y);

        // Determine which lobe and get appropriate Doppler factor
        float amp = (pos.y > 0.0) ? amp_app : amp_rec;

        // Base synchrotron emission color
        vec3 jCol = jetColor(yAbs, jDens);

        // Doppler blueshift: shift toward blue for approaching jet
        // We approximate the colour shift as a hue rotation toward blue/violet
        float blueShift = (pos.y > 0.0) ? clamp(delta_app - 1.0, 0.0, 2.0) * 0.15 : 0.0;
        float redShift  = (pos.y < 0.0) ? clamp(1.0 - delta_rec, 0.0, 0.8) * 0.20 : 0.0;
        jCol += vec3(-redShift, -redShift * 0.5, blueShift);
        jCol  = max(jCol, vec3(0.0));

        // Total emitted contribution
        vec3 emission = jCol * jDens * STEP_SIZE * amp * 40.0;
        color += transmit * emission;

        // Jet plasma is optically thin (pair-dominated, low density)
        float opacity = clamp(jDens * STEP_SIZE * 0.4, 0.0, 0.04);
        transmit *= (1.0 - opacity);
      }
    }

    // ── Geodesic deflection (Schwarzschild) ──────────────────────────
    vec3 accel = geodesicForce(pos);
    dir = normalize(dir + accel * STEP_SIZE);
    pos += dir * STEP_SIZE;
  }

  // ── Background ────────────────────────────────────────────────────
  if (!hitHorizon) {
    color += transmit * starField(dir);
  }

  // ── Tone map & gamma ──────────────────────────────────────────────
  color = aces(color * 0.65);
  color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

  fragColor = vec4(color, 1.0);
}
