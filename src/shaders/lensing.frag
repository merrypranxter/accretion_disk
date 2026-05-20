#version 300 es
precision highp float;

// ─────────────────────────────────────────────────────────────────────────────
// Uniforms
// ─────────────────────────────────────────────────────────────────────────────
uniform vec2  uResolution;
uniform float uTime;
uniform float uInclination;   // observer inclination in radians (0 = face-on, π/2 = edge-on)

out vec4 fragColor;

// ─────────────────────────────────────────────────────────────────────────────
// PHYSICAL CONSTANTS  (geometrized units: G = c = M = 1)
// ─────────────────────────────────────────────────────────────────────────────
const float M  = 1.0;
const float RS = 2.0;   // Schwarzschild radius

// ─────────────────────────────────────────────────────────────────────────────
// ACES FILMIC TONE MAPPING
// ─────────────────────────────────────────────────────────────────────────────
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// HASH UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
float hash2(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHWARZSCHILD LENSING  –  Analytic Bending Angle
//
// For a Schwarzschild black hole, the exact bending angle of a photon with
// impact parameter b is given by the elliptic integral:
//
//   α(b) = 2 ∫_{r_min}^{∞} dr / (r² √(1/b² − (1−2M/r)/r²)) − π
//
// For b ≫ R_S (weak-field): α ≈ 4GM/bc²  (Einstein 1915)
// For b → b_crit = 3√3 M ≈ 5.196M (photon sphere):  α → ∞
//
// Series approximation valid for 1 < b/b_crit < ∞:
//   α ≈ −π + π/√(1 − b_crit/b) + correction terms  (Bozza 2001)
//
// This shader samples the analytic approximation for fast evaluation,
// and switches to the strong-field formula near the photon sphere.
// ─────────────────────────────────────────────────────────────────────────────

// b_crit = 3√3 M ≈ 5.196M for Schwarzschild
const float B_CRIT = 5.196152;

// Weak-field deflection angle (first post-Newtonian):
//   α_weak = 4M/b
float bendAngleWeak(float b) {
  return 4.0 * M / max(b, B_CRIT * 1.001);
}

// Strong-field deflection using the logarithmic approximation
// (Bozza et al. 2001, A&A 374, 824):
//   α_strong ≈ −π + A_BH · log(b/b_crit − 1) + B_BH
// where for Schwarzschild: A_BH = 1.0, B_BH ≈ −0.4002
float bendAngleStrong(float b) {
  float u = b / B_CRIT - 1.0;
  if (u <= 0.001) u = 0.001;
  // Multiple-image branch index n: n=0 → primary, n=1 → first relativistic image, etc.
  // The formula gives the TOTAL deflection = π + Δα, where Δα > 0.
  return -3.14159265 + 1.0 * log(u / 0.3223) + 0.9246;
}

// Total deflection angle (smoothly blended)
float bendAngle(float b) {
  if (b > B_CRIT * 3.0) return bendAngleWeak(b);
  if (b < B_CRIT * 1.01) return 12.56637;  // cap at 4π for near-photon-sphere rays
  float alpha_w = bendAngleWeak(b);
  float alpha_s = bendAngleStrong(b);
  float t = smoothstep(B_CRIT * 1.01, B_CRIT * 2.5, b);
  return mix(alpha_s, alpha_w, t);
}

// ─────────────────────────────────────────────────────────────────────────────
// RAY-SOURCE GEOMETRY
//
// The observer is at distance D_obs = 30M looking at angle θ_inc.
// A source plane at distance D_src = 60M is behind the black hole.
// We shoot rays from the observer toward the lens.
//
// For a screen-pixel with impact parameter b and azimuth φ_impact:
//   1. The ray is deflected by α(b).
//   2. The deflected ray direction is computed.
//   3. We determine which pixel on the source plane the ray hits.
//   4. We colour the source with a grid / checkerboard to show distortion.
// ─────────────────────────────────────────────────────────────────────────────
const float D_OBS = 30.0;
const float D_SRC = 60.0;

// ─────────────────────────────────────────────────────────────────────────────
// WINDING NUMBER COLORING
//
// Each image of the source is coloured by the number of half-orbits the
// photon makes around the black hole (n = 0 primary, 1 first relativistic…).
//
//   n(b) = floor( α(b) / π )
//
// Colour map:  n=0 → gold, n=1 → cyan, n=2 → magenta, n≥3 → white
// ─────────────────────────────────────────────────────────────────────────────
vec3 windingColor(int n) {
  if (n == 0) return vec3(1.00, 0.80, 0.10);   // primary    – gold
  if (n == 1) return vec3(0.10, 0.85, 0.90);   // 1st relat. – cyan
  if (n == 2) return vec3(0.90, 0.15, 0.80);   // 2nd relat. – magenta
              return vec3(1.00, 1.00, 1.00);   // higher     – white
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE TEXTURE: a coordinate grid with background colour
//
// Returns the color of the unlensed source at angular position (u,v)
// behind the black hole.
// ─────────────────────────────────────────────────────────────────────────────
vec3 sourceTexture(vec2 srcUV) {
  // Polar grid lines in the source plane
  float r_src   = length(srcUV);
  float phi_src = atan(srcUV.y, srcUV.x);

  // Concentric rings every 5M
  float ringDist = abs(fract(r_src / 5.0 + 0.5) - 0.5);
  float ring = 1.0 - smoothstep(0.02, 0.05, ringDist);

  // Radial spokes every 30°
  float spokeDist = abs(fract(phi_src / (3.14159 / 6.0) + 0.5) - 0.5);
  float spoke = 1.0 - smoothstep(0.02, 0.06, spokeDist);

  // Checkerboard background
  vec2 check = floor(srcUV / 4.0);
  float checker = mod(check.x + check.y, 2.0);
  vec3 bg = mix(vec3(0.08, 0.10, 0.18), vec3(0.12, 0.15, 0.25), checker);

  // Combine
  vec3 col = bg;
  col = mix(col, vec3(0.40, 0.70, 1.00), ring  * 0.7);
  col = mix(col, vec3(0.90, 0.50, 0.10), spoke * 0.5);
  return col;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPACT PARAMETER from screen position
//
// The screen is parameterised by (ξ, η) – position in the observer's sky
// in units of M.  The impact parameter b = √(ξ²+η²) for Schwarzschild.
// For the inclination transform: the source-plane φ is rotated by θ_inc.
// ─────────────────────────────────────────────────────────────────────────────

// Approximate source position from observer screen position (ξ, η)
// using the thin-lens approximation with the exact deflection angle:
//
//   θ_s ≈ θ − α(b) · D_LS / D_S   (Schneider-Ehlers-Falco lens equation)
//
// where D_LS = D_src − D_obs, D_S = D_src.
//
// Returns: 2D position on source plane (in M), and image winding number.
bool lensMap(vec2 screen, out vec2 srcPos, out int winding) {
  float b = length(screen);
  if (b < RS * 0.52) {
    // Ray captures into the shadow: return false (dark)
    srcPos  = vec2(0.0);
    winding = 0;
    return false;
  }

  float phi_b = atan(screen.y, screen.x);  // azimuthal angle of impact

  float alpha  = bendAngle(b);  // total deflection angle
  float n_half = alpha / 3.14159265;
  winding = int(floor(n_half));

  // Lens equation in the observer-lens-source plane
  // D_LS/D_S = (D_src - D_obs) / D_src
  float DLS_DS = (D_SRC - D_OBS) / D_SRC;
  float theta_s_r = b / D_OBS - alpha * DLS_DS;

  // Source position in M on source plane, in the lensing plane
  float src_r   = D_SRC * theta_s_r;
  vec2  srcFlat = src_r * vec2(cos(phi_b), sin(phi_b));

  // Apply observer inclination: project into inclined source plane
  float ci = cos(uInclination);
  srcPos = vec2(srcFlat.x, srcFlat.y * ci);

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// EINSTEIN RING HIGHLIGHT
//
// The Einstein ring occurs when the source is exactly behind the lens.
// Angular radius: θ_E = √(4GM D_LS / (c² D_L D_S)) ≈ √(4 D_LS/(D_L D_S)) M
// ─────────────────────────────────────────────────────────────────────────────
float einsteinRing(float b) {
  float theta_E = sqrt(4.0 * (D_SRC - D_OBS) / (D_OBS * D_SRC));
  float delta   = abs(b - D_OBS * theta_E);
  return (1.0 - smoothstep(0.0, 0.35, delta)) * 0.9;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHADOW BOUNDARY CAUSTIC GLOW
// ─────────────────────────────────────────────────────────────────────────────
float shadowGlow(float b) {
  float delta = b - B_CRIT;
  if (delta < 0.0) return 0.0;
  return exp(-delta * delta * 2.5) * 0.6;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  // Screen coordinates in units of M.
  // Field of view: ±15M across the shorter axis.
  const float HALF_FOV_M = 15.0;
  vec2 screen = uv * HALF_FOV_M * 2.0;

  float b = length(screen);

  vec3 color = vec3(0.0);

  // ── Shadow ─────────────────────────────────────────────────────────────
  if (b < B_CRIT * 0.98) {
    // Deep shadow interior — not quite black; faint accretion glow leaks in
    float glow = exp(-b * 0.8) * 0.03;
    color = vec3(0.02, 0.04, 0.08) + vec3(0.5, 0.2, 0.05) * glow;
  } else {
    // ── Primary + relativistic images ─────────────────────────────────
    vec2  srcPos;
    int   winding;
    bool  visible = lensMap(screen, srcPos, winding);

    if (visible) {
      vec3 srcCol     = sourceTexture(srcPos);
      vec3 windCol    = windingColor(winding);

      // Blend: source colour tinted by winding colour
      // Higher-order images get stronger winding tint (harder to resolve)
      float windBlend = clamp(float(winding) * 0.35, 0.0, 0.85);
      vec3  imgCol    = mix(srcCol, windCol * srcCol, windBlend);

      // Magnification: |dθ/dβ| ∝ 1 / |θ − α D_LS/D_S| near Einstein ring
      // Simple inverse-distance magnification approximation
      float mag = 1.0 / max(abs(length(srcPos) / D_SRC - 0.1), 0.08);
      mag = clamp(mag, 0.8, 8.0);

      color = imgCol * mag;
    }

    // ── Einstein ring highlight ──────────────────────────────────────────
    float er = einsteinRing(b);
    color += vec3(0.85, 0.90, 1.00) * er * 2.5;

    // ── Photon sphere caustic glow ────────────────────────────────────────
    float sg = shadowGlow(b);
    color += vec3(0.60, 0.75, 1.00) * sg;
  }

  // ── Outer background (faint grid showing unlensed sky) ────────────────
  if (b > HALF_FOV_M * 1.6) {
    vec3 bg = sourceTexture(screen * 0.5);
    float t = smoothstep(HALF_FOV_M * 1.6, HALF_FOV_M * 1.9, b);
    color   = mix(color, bg * 0.25, t);
  }

  // ── Slow animation: gentle inclination pulse for debug / demo ─────────
  // uTime used to animate the sweep arrow overlay only

  // ── Tone map & gamma ──────────────────────────────────────────────────
  color = aces(color * 0.55);
  color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

  fragColor = vec4(color, 1.0);
}
