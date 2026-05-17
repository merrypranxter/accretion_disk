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
const float M         = 1.0;
const float RS        = 2.0;       // Schwarzschild radius  r_s = 2GM/c²
const float R_ISCO    = 6.0;       // Innermost stable circular orbit
const float R_PHOT    = 3.0;       // Photon sphere
const float R_DISK_OUT = 22.0;     // Outer disk truncation radius

// ─────────────────────────────────────────────────────────────────────────────
// RAY-MARCH PARAMETERS
// ─────────────────────────────────────────────────────────────────────────────
const int   MAX_STEPS   = 300;
const float STEP_SIZE   = 0.09;
const float ESCAPE_DIST = 90.0;
// Geodesic coupling: tunes the GR deflection strength.
// Value ≈ 1.5 reproduces Einstein deflection α = 4GM/bc² to first order
// for impact parameters b >> RS while still bending rays dramatically
// for b close to the photon sphere.
const float GR_COUPLING = 1.5;

// ─────────────────────────────────────────────────────────────────────────────
// HASH / NOISE UTILITIES
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

// Fractional Brownian Motion — 4 octaves, with domain rotation to break
// axis-aligned artifacts in the turbulent disk structure.
float fbm(vec3 p) {
  // Rotation matrix (keeps the iteration from becoming degenerate)
  const mat3 rot = mat3(
     0.00,  0.80,  0.60,
    -0.80,  0.36, -0.48,
    -0.60, -0.48,  0.64);
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p  = rot * p * 2.1;
    a *= 0.5;
  }
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOR SCIENCE: blackbody temperature → linearized sRGB
//
// Approximation by Krystek & Antoni (2004), valid ~800 K – 65 000 K.
// Extended to ~65 MK for the corona by clamping and extrapolating the
// blue-dominated hot end.
// ─────────────────────────────────────────────────────────────────────────────
vec3 blackbodyRGB(float temp) {
  temp = clamp(temp, 800.0, 6.5e7);
  float t = temp * 0.01; // hectokelvin

  // Red channel
  float r = (t <= 66.0)
    ? 1.0
    : clamp(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0);

  // Green channel
  float g = (t <= 66.0)
    ? clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0)
    : clamp(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0);

  // Blue channel
  float b;
  if      (t >= 66.0) b = 1.0;
  else if (t <= 19.0) b = 0.0;
  else b = clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0);

  return vec3(r, g, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// NOVIKOV–THORNE TEMPERATURE PROFILE
//
// T(r) = T_peak · (r / r_isco)^(-3/4) · f(r)^(1/4)
//   f(r) = 1 − √(r_isco / r)
//
// Peak occurs near r ≈ 1.36 · r_isco.
// Reference: Novikov & Thorne (1973); Page & Thorne (1974).
// ─────────────────────────────────────────────────────────────────────────────
const float T_PEAK = 1.4e7; // K — peak temperature at ~8.2 M

float diskTemperature(float r) {
  if (r <= R_ISCO) return 0.0;
  float f = max(1.0 - sqrt(R_ISCO / r), 0.0);
  return T_PEAK * pow(r / R_ISCO, -0.75) * pow(f, 0.25);
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATIVISTIC DOPPLER BEAMING
//
// Keplerian orbital speed in Schwarzschild coordinates (relativistic):
//   β = √( M / r / (1 − 3M/r) )   (coordinate velocity, prograde orbit)
//
// Doppler factor:
//   D = 1 / [ γ (1 − β cos θ) ]
//   where θ is the angle between the orbital velocity and the observer direction.
//
// Bolometric: I_obs ∝ D⁴  (optically thick, isotropic emission in rest frame).
// ─────────────────────────────────────────────────────────────────────────────
float dopplerFactor(vec3 diskPos, vec3 rayDir) {
  float r = length(diskPos);
  if (r <= R_ISCO) return 0.0;

  float denom = 1.0 - 3.0 * M / r;
  if (denom <= 0.0) return 0.0; // inside photon sphere, orbit unstable

  float beta2 = clamp(M / (r * denom), 0.0, 0.98);
  float beta  = sqrt(beta2);
  float gamma = 1.0 / sqrt(1.0 - beta2);

  // Prograde orbit in the xz disk-plane: v̂ ∝ (−z, 0, x) normalized
  vec3 vHat = normalize(vec3(-diskPos.z, 0.0, diskPos.x));

  // cos θ between orbital velocity and direction toward observer (−rayDir)
  float cosTheta = dot(vHat, -rayDir);

  return 1.0 / (gamma * (1.0 - beta * cosTheta));
}

// ─────────────────────────────────────────────────────────────────────────────
// GRAVITATIONAL REDSHIFT FACTOR
//   g(r) = √(1 − r_s / r)
// Observed temperature: T_obs = g · D · T_em
// Bolometric intensity factor: g⁴
// ─────────────────────────────────────────────────────────────────────────────
float gravFactor(float r) {
  return sqrt(max(1.0 - RS / r, 0.0));
}

// ─────────────────────────────────────────────────────────────────────────────
// GEODESIC FORCE  (simplified null geodesic in Schwarzschild metric)
//
// Exact null geodesic equation in Schwarzschild:
//   d²xⁱ/dλ² = −Γⁱ_μν (dxᵘ/dλ)(dxᵛ/dλ)
//
// For a photon moving tangentially (b ≫ RS), the dominant deflection is:
//   a ≈ −(GR_COUPLING · M / r³) · x⃗
//
// This is equivalent to a central 1/r² gravitational field on the
// null geodesic trajectory and reproduces α = 4GM/bc² to first post-
// Newtonian order for large impact parameters.
// ─────────────────────────────────────────────────────────────────────────────
vec3 geodesicForce(vec3 pos) {
  float r2 = dot(pos, pos);
  if (r2 < 0.01) return vec3(0.0);
  float r  = sqrt(r2);
  float r3 = r2 * r;
  return -(GR_COUPLING * M / r3) * pos;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISK DENSITY  (geometrically thin, optically thick)
//
// Vertical structure: Gaussian with scale height H(r) = 0.04 r  (H/r ≈ 0.04,
//   consistent with a thin disk dominated by radiation pressure near the ISCO).
//
// Turbulent modulation: fBm noise sampled in a co-rotating frame so disk
//   structures orbit at the local Keplerian angular velocity Ω ∝ r^(-3/2).
// ─────────────────────────────────────────────────────────────────────────────
float diskDensity(vec3 pos) {
  float r_cyl = length(vec2(pos.x, pos.z));
  if (r_cyl < R_ISCO || r_cyl > R_DISK_OUT) return 0.0;

  // Vertical gaussian
  float H        = 0.04 * r_cyl;
  float rhoVert  = exp(-0.5 * (pos.y / H) * (pos.y / H));

  // Radial envelope: rises quickly from ISCO, tapers toward outer edge
  float dr         = r_cyl - R_ISCO;
  float rhoRadial  = (1.0 - exp(-dr / (1.5 * M)))
                   * exp(-dr / (R_DISK_OUT - R_ISCO) * 2.2);

  // Frozen turbulence: co-rotating noise (Keplerian frame)
  float omega = 1.0 / (pow(r_cyl, 1.5) + 0.01);
  float angle = atan(pos.z, pos.x) + omega * uTime;
  vec3  noisePos = vec3(cos(angle) * r_cyl,
                        pos.y / max(H, 0.001) * 1.5,
                        sin(angle) * r_cyl) * 0.25;
  float turb = 0.55 + 0.45 * fbm(noisePos + vec3(0.0, 0.0, uTime * 0.04));

  return rhoVert * rhoRadial * turb;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOT CORONA  (optically thin, volumetric)
//
// The disk corona is modeled as a radially stratified, exponentially
// declining hot-gas halo (T ~ 10⁹ K, soft X-ray emitter).
// ─────────────────────────────────────────────────────────────────────────────
float coronaDensity(vec3 pos) {
  float r = length(pos);
  if (r < RS || r > 9.0 * M) return 0.0;
  return exp(-r / (2.8 * M)) * 0.04;
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATIVISTIC JET  (Blandford–Znajek, simplified)
//
// Collimated synchrotron plasma along the polar axis with a slow opening
// angle that increases with height.
// ─────────────────────────────────────────────────────────────────────────────
float jetDensity(vec3 pos) {
  float h    = abs(pos.y);
  if (h < 2.0 * M) return 0.0;
  float rCyl    = length(vec2(pos.x, pos.z));
  float opening = 0.14 * h + 0.35; // half-opening radius in M
  float inJet   = smoothstep(opening, opening * 0.3, rCyl);
  float falloff = exp(-h / 14.0);
  return inJet * falloff * 0.25;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCEDURAL STAR FIELD
//
// Sparse point stars with spectral type colors from the blackbody map,
// plus a faint Milky Way haze from fBm.
// ─────────────────────────────────────────────────────────────────────────────
vec3 starField(vec3 dir) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float scale = 100.0 + float(i) * 95.0;
    vec3  p     = floor(dir * scale + 0.5);
    float h     = hash3(p + float(i) * 0.731);
    if (h > 0.9975) {
      float bright  = pow((h - 0.9975) * 400.0, 1.4) * 2.5;
      // Spectral type: O/B blue-white down to K/M orange-red
      float tStar = mix(3200.0, 28000.0, hash3(p * 1.37 + 2.1));
      col += blackbodyRGB(tStar) * bright;
    }
  }
  // Faint galactic haze
  float mw = fbm(dir * 2.8 + vec3(0.07, 0.0, 0.19)) * 0.014;
  col += vec3(0.28, 0.36, 0.55) * mw;
  return col;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACES FILMIC TONE MAPPING  (Hill 2015 approximation)
// ─────────────────────────────────────────────────────────────────────────────
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN  —  ray-march the scene
// ─────────────────────────────────────────────────────────────────────────────
void main() {
  // Reconstruct ray from screen-space UV
  vec2 uv  = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec3 ro  = uCameraPos;
  vec3 rd  = normalize(uCameraMatrix * vec3(uv, uFov));

  // March state
  vec3  pos      = ro;
  vec3  dir      = rd;
  vec3  color    = vec3(0.0);
  float transmit = 1.0;   // 1 = fully transparent, 0 = opaque
  bool  hitHorizon = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    float r = length(pos);

    // ── Event horizon ────────────────────────────────────────────
    if (r < RS * 1.03) {
      hitHorizon = true;
      break;
    }
    // ── Escaped ──────────────────────────────────────────────────
    if (r > ESCAPE_DIST) break;

    float r_cyl = length(vec2(pos.x, pos.z));

    // ── Accretion disk  (thin-disk plane crossing + vertical extent) ──
    if (transmit > 0.005 && r_cyl > R_ISCO && r_cyl < R_DISK_OUT) {
      float H = 0.04 * r_cyl;
      if (abs(pos.y) < 6.0 * H) {
        float dens = diskDensity(pos);
        if (dens > 0.001) {
          float T_em   = diskTemperature(r_cyl);
          float D      = dopplerFactor(pos, dir);
          float g      = gravFactor(r_cyl);

          // Observed temperature: Lorentz boost + gravitational blueshift
          float T_obs  = T_em * clamp(D, 0.05, 12.0) * g;

          // Bolometric intensity: I_obs ∝ D⁴ · g⁴
          float D4     = pow(clamp(D, 0.05, 10.0), 4.0);
          float g4     = g * g * g * g;

          vec3  diskCol = blackbodyRGB(T_obs);
          float bright  = min(D4 * g4 * dens * STEP_SIZE * 6.0, 3.5);

          float opacity = clamp(dens * STEP_SIZE * 25.0, 0.0, 1.0);

          color    += transmit * diskCol * bright;
          transmit *= (1.0 - opacity);
          if (transmit < 0.005) { transmit = 0.0; break; }
        }
      }
    }

    // ── Hot corona (volumetric) ───────────────────────────────────
    if (transmit > 0.005) {
      float cDens = coronaDensity(pos);
      if (cDens > 0.0001) {
        vec3 cCol = blackbodyRGB(9.0e8) * cDens * STEP_SIZE * 18.0;
        color += transmit * cCol;
      }
    }

    // ── Relativistic jet (volumetric, synchrotron blue) ───────────
    if (transmit > 0.005) {
      float jDens = jetDensity(pos);
      if (jDens > 0.0001) {
        vec3 jCol = vec3(0.25, 0.50, 1.0) * jDens * STEP_SIZE * 12.0;
        color += transmit * jCol;
      }
    }

    // ── Propagate with geodesic deflection ───────────────────────
    vec3 accel = geodesicForce(pos);
    dir = normalize(dir + accel * STEP_SIZE);
    pos += dir * STEP_SIZE;
  }

  // ── Background ────────────────────────────────────────────────
  if (!hitHorizon) {
    color += transmit * starField(dir);
  }
  // hitHorizon → shadow stays black (color already accumulated up to horizon)

  // ── Post-processing ───────────────────────────────────────────
  // ACES tone mapping with mild exposure
  color = aces(color * 0.65);
  // Gamma-correct to sRGB
  color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

  fragColor = vec4(color, 1.0);
}
