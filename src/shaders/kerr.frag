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
uniform float uSpin;   // Kerr spin parameter  a/M  (0.0 – 0.998)

out vec4 fragColor;

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICAL CONSTANTS  (geometrized units: G = c = M = 1)
// ─────────────────────────────────────────────────────────────────────────────
const float M           = 1.0;
const float R_DISK_OUT  = 20.0;    // Outer disk truncation radius

// ─────────────────────────────────────────────────────────────────────────────
// RAY-MARCH PARAMETERS
// ─────────────────────────────────────────────────────────────────────────────
const int   MAX_STEPS   = 420;
// Affine-parameter step Δλ.  For a near-radial ray at large r,
// dr/dλ = P_r/Σ ≈ 1 M/λ so each step covers ~ STEP_SIZE M in radius.
const float STEP_SIZE   = 0.08;
const float ESCAPE_DIST = 75.0;

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

// 4-octave fBm with domain rotation to break axis-aligned artefacts
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
// Krystek & Antoni (2004) approximation, extended to ~65 MK.
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
// KERR METRIC  –  Boyer-Lindquist utilities
//
//   Σ(r,θ) = r² + a²cos²θ
//   Δ(r)   = r² − 2Mr + a²      (M = 1)
//
// ─────────────────────────────────────────────────────────────────────────────
float kerrSigma(float r, float costh, float a2) {
  return r*r + a2*costh*costh;
}
float kerrDelta(float r, float a2) {
  return r*r - 2.0*r + a2;
}

// ─────────────────────────────────────────────────────────────────────────────
// KERR ISCO  –  Bardeen (1972) prograde formula
//
//   Z₁ = 1 + (1−a²)^(1/3) [ (1+a)^(1/3) + (1−a)^(1/3) ]
//   Z₂ = √( 3a² + Z₁² )
//   r_ISCO = 3 + Z₂ − √( (3−Z₁)(3+Z₁+2Z₂) )
//
// At a = 0: r_ISCO = 6M.  At a = 0.998: r_ISCO ≈ 1.237M.
// ─────────────────────────────────────────────────────────────────────────────
float kerrISCO(float a) {
  float a2 = a * a;
  float z1 = 1.0 + pow(max(1.0 - a2, 0.0), 1.0/3.0)
           * (pow(max(1.0 + a, 0.0), 1.0/3.0)
            + pow(max(1.0 - a, 0.0), 1.0/3.0));
  float z2 = sqrt(max(3.0*a2 + z1*z1, 0.0));
  return 3.0 + z2 - sqrt(max((3.0 - z1)*(3.0 + z1 + 2.0*z2), 0.0));
}

// ─────────────────────────────────────────────────────────────────────────────
// NOVIKOV–THORNE TEMPERATURE PROFILE  (Kerr generalisation)
//
// T(r) = T_peak · (r / r_ISCO)^(−3/4) · (1 − √(r_ISCO/r))^(1/4)
//
// T_peak is scaled from the Schwarzschild value by the ratio of ISCO radii:
//   T_peak(a) ≈ 1.4×10⁷ K · (6/r_ISCO)^(3/4)
// At a=0.998: T_peak ≈ 5.0×10⁷ K, reflecting ~3.8× more energy release.
// ─────────────────────────────────────────────────────────────────────────────
float diskTemperature(float r, float r_isco) {
  if (r <= r_isco) return 0.0;
  float tPeak = 1.4e7 * pow(6.0 / max(r_isco, 0.5), 0.75);
  float f = max(1.0 - sqrt(r_isco / r), 0.0);
  return tPeak * pow(r / r_isco, -0.75) * pow(f, 0.25);
}

// ─────────────────────────────────────────────────────────────────────────────
// KERR DOPPLER + GRAVITATIONAL REDSHIFT FACTOR
//
// For a photon with conserved specific angular momentum b = L/E emitted
// from equatorial circular (Keplerian) orbit at BL radius r:
//
//   Ω_K  = M^(1/2) / (r^(3/2) + a M^(1/2))   [prograde, M=1]
//   D    = g_orb / (1 − b · Ω_K)
//   g_orb = √(−(g_tt + 2 g_tφ Ω_K + g_φφ Ω_K²))
//
// where at θ = π/2 (equatorial):
//   g_tt  = −(1 − 2M/r),  g_tφ = −2aM/r,  g_φφ = r²+a²+2a²M/r
//
// D⁴ gives the bolometric intensity boost (isotropic emission rest frame).
// Reference: Fabian et al. (1989); Laor (1991); Dovčiak et al. (2004).
// ─────────────────────────────────────────────────────────────────────────────
float kerrDoppler(float r, float b_photon, float a) {
  if (r <= 2.0) return 0.0; // inside / on ergosphere
  float r32    = r * sqrt(r);
  float OmegaK = 1.0 / (r32 + a);      // M = 1

  // Kerr equatorial metric components
  float gtt    = -(1.0 - 2.0/r);
  float gtphi  = -2.0*a/r;
  float gphiphi = r*r + a*a + 2.0*a*a/r;

  float disc   = -(gtt + 2.0*gtphi*OmegaK + gphiphi*OmegaK*OmegaK);
  float g_orb  = sqrt(max(disc, 0.0));

  float denom  = 1.0 - b_photon * OmegaK;
  if (abs(denom) < 0.04) return 0.0;  // degenerate: photon co-rotating
  return g_orb / denom;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISK DENSITY  (thin, optically thick, turbulent)
//
// Identical treatment to disk.frag with the Kerr ISCO replacing r = 6M,
// and noise co-rotating in the faster Keplerian frame of near-extremal Kerr.
// ─────────────────────────────────────────────────────────────────────────────
float diskDensity(vec3 pos, float r_isco) {
  float r_cyl = length(vec2(pos.x, pos.z));
  if (r_cyl < r_isco || r_cyl > R_DISK_OUT) return 0.0;

  float H       = 0.04 * r_cyl;
  float rhoVert = exp(-0.5 * (pos.y / H) * (pos.y / H));

  float dr        = r_cyl - r_isco;
  float rhoRadial = (1.0 - exp(-dr / (1.5 * M)))
                  * exp(-dr / (R_DISK_OUT - r_isco) * 2.2);

  float omega   = 1.0 / (pow(r_cyl, 1.5) + 0.01);
  float angle   = atan(pos.z, pos.x) + omega * uTime;
  vec3  noiseP  = vec3(cos(angle) * r_cyl,
                       pos.y / max(H, 1e-4) * 1.5,
                       sin(angle) * r_cyl) * 0.25;
  float turb    = 0.55 + 0.45 * fbm(noiseP + vec3(0.0, 0.0, uTime * 0.04));

  return rhoVert * rhoRadial * turb;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOT CORONA  (volumetric, optically thin, ~10⁹ K)
// ─────────────────────────────────────────────────────────────────────────────
float coronaDensity(vec3 pos) {
  float r = length(pos);
  if (r < 1.1 || r > 7.0) return 0.0;
  return exp(-r / 2.5) * 0.05;
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATIVISTIC JET  (Blandford-Znajek)
//
// For a = 0.998 the horizon angular velocity Ω_H = a/(2r_+) ≈ 0.47 M⁻¹,
// boosting jet power ∝ Ω_H² by ~50× relative to Schwarzschild.
// The jet spine is tighter (higher magnetisation) for near-extremal spin.
// ─────────────────────────────────────────────────────────────────────────────
float jetDensity(vec3 pos) {
  float h    = abs(pos.y);
  if (h < 1.5) return 0.0;
  float rCyl    = length(vec2(pos.x, pos.z));
  float opening = 0.10 * h + 0.25;  // tighter collimation for high-spin BZ jet
  float inJet   = 1.0 - smoothstep(opening * 0.25, opening, rCyl);
  float falloff = exp(-h / 18.0);
  // Knotty structure from Kelvin-Helmholtz: see jet.frag for full treatment
  float knot    = 0.7 + 0.3 * sin(h * 2.1 - uTime * 3.0);
  return inJet * falloff * 0.30 * knot;
}

// ─────────────────────────────────────────────────────────────────────────────
// ERGOSPHERE GLOW
//
// The ergosphere boundary in Boyer-Lindquist coordinates:
//   r_erg(θ) = M + √(M² − a²cos²θ)
// At θ=π/2 (equator): r_erg = 2M for any a.
// At θ=0 (poles):    r_erg = r_+ (coincides with the horizon).
// Inside the ergosphere all observers must co-rotate with the BH.
// ─────────────────────────────────────────────────────────────────────────────
float ergosphereDensity(float r, float costh, float a2) {
  float r_erg = 1.0 + sqrt(max(1.0 - a2 * costh * costh, 0.0));
  if (r >= r_erg || r < sqrt(a2)) return 0.0;
  float depth = (r_erg - r) / max(r_erg - sqrt(a2), 0.1);
  return smoothstep(0.0, 0.4, depth) * 0.6;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAR FIELD  (spectral-type coloring)
// ─────────────────────────────────────────────────────────────────────────────
vec3 starField(vec3 dir) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float scale = 100.0 + float(i) * 95.0;
    vec3  p     = floor(dir * scale + 0.5);
    float h     = hash3(p + float(i) * 0.731);
    if (h > 0.9975) {
      float bright = pow((h - 0.9975) * 400.0, 1.4) * 2.5;
      float tStar  = mix(3200.0, 28000.0, hash3(p * 1.37 + 2.1));
      col += blackbodyRGB(tStar) * bright;
    }
  }
  float mw = fbm(dir * 2.8 + vec3(0.07, 0.0, 0.19)) * 0.014;
  col += vec3(0.28, 0.36, 0.55) * mw;
  return col;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACES FILMIC TONE MAPPING  (Hill 2015 approximation)
// ─────────────────────────────────────────────────────────────────────────────
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// BOYER-LINDQUIST → CARTESIAN
//
// Kerr BL relation (spin axis = y):
//   x = √(r²+a²) sinθ cosφ
//   y = r cosθ
//   z = √(r²+a²) sinθ sinφ
// ─────────────────────────────────────────────────────────────────────────────
vec3 blToCart(float r, float th, float phi, float a2) {
  float rA   = sqrt(r*r + a2);
  float sth  = sin(th);
  return vec3(rA * sth * cos(phi),
              r  * cos(th),
              rA * sth * sin(phi));
}

// ─────────────────────────────────────────────────────────────────────────────
// GEODESIC STEP  –  Symplectic Euler in Boyer-Lindquist coordinates
//
// State variables:
//   r, th  – BL position (φ tracked separately)
//   Pr     = Σ dr/dλ   (Σ-scaled radial "momentum")
//   Pth    = Σ dθ/dλ   (Σ-scaled polar "momentum")
//
// Conserved along geodesic:
//   b = L/E – specific angular momentum (impact parameter)
//   q = Q/E² – Carter constant
//
// Evolution equations (Carter 1968; Bardeen, Press & Teukolsky 1972):
//
//   dPr/dλ   = R_r′(r) / (2Σ)
//   dPth/dλ  = Θ′(θ)  / (2Σ)
//   dr/dλ    = Pr / Σ
//   dθ/dλ    = Pth / Σ
//   dφ/dλ    = ( a·P/Δ + b/sin²θ − a ) / Σ
//
// where:
//   P   = r² + a² − a·b
//   R_r = P² − Δ·[ (b−a)² + q ]
//   Θ   = q − a²cos²θ + b²cos²θ/sin²θ
//
//   R_r′ = 4r·P − 2(r−M)·[ (b−a)² + q ]
//   Θ′   = 2 cosθ ( a²sinθ − b²/sin³θ )
//
// ─────────────────────────────────────────────────────────────────────────────
void geodesicStep(inout float r, inout float th, inout float phi,
                  inout float Pr, inout float Pth,
                  float b, float q, float a, float a2, float h) {
  float costh = cos(th);
  float sinth = max(abs(sin(th)), 1e-4);  // guard pole singularity
  float sth2  = sinth * sinth;

  float Sigma = r*r + a2 * costh * costh;
  float Delta = max(r*r - 2.0*r + a2, 1e-6);  // clamp at horizon

  float P     = r*r + a2 - a * b;
  float bma2  = (b - a)*(b - a) + q;

  // Derivatives of the effective potentials
  float dRr   = 4.0*r*P - 2.0*(r - M) * bma2;
  float dTh   = 2.0 * costh * (a2 * sinth - b*b / (sth2 * sinth));

  // ── Momentum update (then position, symplectic order) ────────────────
  Pr  += (dRr  / (2.0 * Sigma)) * h;
  Pth += (dTh  / (2.0 * Sigma)) * h;

  // ── Position update ──────────────────────────────────────────────────
  r   += (Pr  / Sigma) * h;
  th  += (Pth / Sigma) * h;

  // φ update uses values at the NEW r, th for better accuracy
  float costh2 = cos(th);
  float sinth2n = max(abs(sin(th)), 1e-4);
  float sth2n  = sinth2n * sinth2n;
  float Sigma2 = r*r + a2 * costh2 * costh2;
  float Delta2 = max(r*r - 2.0*r + a2, 1e-6);
  float P2     = r*r + a2 - a * b;
  float phiDot = (a * P2 / Delta2 + b / sth2n - a) / Sigma2;
  phi += phiDot * h;
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL CONDITIONS
//
// Given a camera ray (origin ro, direction rd) in Cartesian space
// (spin axis = y), computes the Boyer-Lindquist initial state and
// the conserved impact parameter b and Carter constant q.
//
// BL radial coordinate from Cartesian (y-axis spin):
//   x²+z² = (r²+a²)sin²θ,  y = r cosθ
//   →  r⁴ − (|ro|²−a²) r² − a²y² = 0
//   →  r² = ½[ D + √(D²+4a²y²) ],  D = |ro|²−a²
//
// The velocity conversion uses the large-r spherical approximation
// (valid when the camera is at r_obs ≫ a, which holds in all typical views).
// ─────────────────────────────────────────────────────────────────────────────
void initRay(vec3 ro, vec3 rd, float a, float a2,
             out float r0, out float th0, out float phi0,
             out float Pr0, out float Pth0, out float b, out float q) {

  // ── Compute BL r ─────────────────────────────────────────────────────
  float rho2  = dot(ro, ro);
  float D     = rho2 - a2;
  float r2    = 0.5 * (D + sqrt(max(D*D + 4.0*a2*ro.y*ro.y, 0.0)));
  r0          = sqrt(max(r2, 0.01));

  // ── BL angles (y = polar axis) ───────────────────────────────────────
  th0  = acos(clamp(ro.y / r0, -1.0, 1.0));
  phi0 = atan(ro.z, ro.x);

  float Sigma0 = r0*r0 + a2 * cos(th0) * cos(th0);
  float rcyl   = length(vec2(ro.x, ro.z));
  float rho    = sqrt(rho2);

  // ── Orthonormal basis at observer (large-r spherical approx) ─────────
  vec3 eR  = ro / rho;  // radial unit vector
  // ê_φ unit vector (azimuthal, around y-axis)
  vec3 ePh = (rcyl > 1e-4) ? vec3(-ro.z, 0.0, ro.x) / rcyl
                            : vec3(0.0, 0.0, 1.0);
  // ê_θ unit vector (polar, pointing toward equator)
  float cosTh0 = ro.y / rho;
  float sinTh0 = rcyl   / rho;
  float cosP0  = (rcyl > 1e-4) ? ro.x / rcyl : 1.0;
  float sinP0  = (rcyl > 1e-4) ? ro.z / rcyl : 0.0;
  vec3  eTh    = vec3(cosTh0 * cosP0, -sinTh0, cosTh0 * sinP0);

  // ── Coordinate velocity components ───────────────────────────────────
  float dr_dl  = dot(rd, eR);
  float dth_dl = dot(rd, eTh) / r0;  // arc-length in θ: r dθ = dot(rd, ê_θ)

  // ── Conserved impact parameter  b = L/E ──────────────────────────────
  // b = (ro × rd)_y  = y-component of angular momentum
  b = ro.x * rd.z - ro.z * rd.x;

  // ── Σ-scaled momenta ─────────────────────────────────────────────────
  Pr0  = Sigma0 * dr_dl;
  Pth0 = Sigma0 * dth_dl;

  // ── Carter constant  q = Q/E² ────────────────────────────────────────
  //   Q = Pθ² + cos²θ (a² − b²/sin²θ)
  float sin2th = max(sinTh0 * sinTh0, 1e-5);
  float cos2th = cosTh0 * cosTh0;
  q = Pth0*Pth0 + cos2th * (a2 - b*b / sin2th);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN  —  Boyer-Lindquist ray-march
// ─────────────────────────────────────────────────────────────────────────────
void main() {
  // ── Reconstruct ray ──────────────────────────────────────────────────
  vec2 uv  = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec3 ro  = uCameraPos;
  vec3 rd  = normalize(uCameraMatrix * vec3(uv, uFov));

  // ── Spin-dependent derived constants ─────────────────────────────────
  float a  = clamp(uSpin, 0.0, 0.9999);
  float a2 = a * a;
  float r_plus  = 1.0 + sqrt(max(1.0 - a2, 0.0));   // outer event horizon
  float r_isco  = kerrISCO(a);                        // prograde ISCO

  // ── Initialise geodesic ──────────────────────────────────────────────
  float r, th, phi, Pr, Pth, b, q;
  initRay(ro, rd, a, a2, r, th, phi, Pr, Pth, b, q);

  // ── March state ──────────────────────────────────────────────────────
  vec3  color      = vec3(0.0);
  float transmit   = 1.0;
  bool  hitHorizon = false;

  for (int i = 0; i < MAX_STEPS; i++) {

    // ── Event horizon ─────────────────────────────────────────────────
    if (r < r_plus * 1.02) {
      hitHorizon = true;
      break;
    }
    // ── Escape ────────────────────────────────────────────────────────
    if (r > ESCAPE_DIST) break;

    float costh  = cos(th);
    float sinth  = max(abs(sin(th)), 1e-4);
    float Sigma  = r*r + a2 * costh * costh;

    // ── BL → Cartesian for scene sampling ─────────────────────────────
    vec3 pos = blToCart(r, th, phi, a2);

    // ── Ergosphere glow  (amber) ──────────────────────────────────────
    if (transmit > 0.005) {
      float eGlow = ergosphereDensity(r, costh, a2);
      if (eGlow > 0.001) {
        // Deep amber → orange matching ~5000 K ergosphere estimate
        vec3 ergoCol = vec3(1.0, 0.55, 0.10) * eGlow * STEP_SIZE * 5.0;
        color += transmit * ergoCol;
      }
    }

    float r_cyl = length(vec2(pos.x, pos.z));

    // ── Accretion disk ────────────────────────────────────────────────
    if (transmit > 0.005 && r > r_isco && r_cyl < R_DISK_OUT) {
      float H = 0.04 * r_cyl;
      if (abs(pos.y) < 6.0 * H) {
        float dens = diskDensity(pos, r_isco);
        if (dens > 0.001) {
          float T_em  = diskTemperature(r, r_isco);
          // Correct Kerr Doppler factor using conserved impact parameter b
          float D     = kerrDoppler(r, b, a);
          float T_obs = T_em * clamp(D, 0.05, 15.0);
          float D4    = pow(clamp(D, 0.05, 12.0), 4.0);

          vec3  diskCol = blackbodyRGB(T_obs);
          float bright  = min(D4 * dens * STEP_SIZE * 7.0, 4.0);
          float opacity = clamp(dens * STEP_SIZE * 28.0, 0.0, 1.0);

          color    += transmit * diskCol * bright;
          transmit *= (1.0 - opacity);
          if (transmit < 0.005) { transmit = 0.0; break; }
        }
      }
    }

    // ── Hot corona ────────────────────────────────────────────────────
    if (transmit > 0.005) {
      float cDens = coronaDensity(pos);
      if (cDens > 0.0001) {
        color += transmit * blackbodyRGB(9.0e8) * cDens * STEP_SIZE * 18.0;
      }
    }

    // ── Relativistic jet  (synchrotron blue, Blandford-Znajek) ───────
    if (transmit > 0.005) {
      float jDens = jetDensity(pos);
      if (jDens > 0.0001) {
        // Brighter blue for high-spin BZ jet; slight violet tint
        vec3 jCol = vec3(0.20, 0.40, 1.0) * jDens * STEP_SIZE * 15.0;
        color += transmit * jCol;
      }
    }

    // ── Propagate geodesic ────────────────────────────────────────────
    geodesicStep(r, th, phi, Pr, Pth, b, q, a, a2, STEP_SIZE);
  }

  // ── Background ───────────────────────────────────────────────────────
  if (!hitHorizon) {
    // Reconstruct approximate Cartesian exit direction for star field
    vec3 exitDir = normalize(blToCart(r, th, phi, a2) - blToCart(r - 0.5, th, phi, a2));
    color += transmit * starField(exitDir);
  }

  // ── Post-processing ──────────────────────────────────────────────────
  color = aces(color * 0.60);
  color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

  fragColor = vec4(color, 1.0);
}
