# Shader Architecture

This document describes the design and implementation of each shader in the
visualization, the raymarching framework shared between them, and guidelines
for extending or tuning them.

---

## 1 · Shared Infrastructure

The raymarching shaders (`disk.frag`, `kerr.frag`, `corona.frag`, `jet.frag`)
follow a common pattern (see `disk.frag` as the canonical reference):

```
#version 300 es
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uCameraPos;
uniform mat3  uCameraMatrix;
uniform float uFov;

out vec4 fragColor;
```

`lensing.frag` is the exception: it is an analytical screen-space shader and
uses only `uResolution`, `uTime`, and `uInclination`.

### 1.1 Camera Ray Construction

Every fragment begins by reconstructing a world-space ray direction from the
screen pixel:

```glsl
vec2 uv  = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
vec3 ro  = uCameraPos;
vec3 dir = normalize(uCameraMatrix * vec3(uv, uFov));
```

`uFov` is a focal-length-like scalar: `uFov = 1.6` gives ~55° vertical FOV.
`uCameraMatrix` is a 3×3 column-major matrix mapping camera→world space,
built in JS by `buildCamMatrix()`.

### 1.2 Coordinate Convention

All shaders use a right-handed coordinate system with **y as the polar/spin
axis** (the disk lies in the xz-plane).  This matches the Three.js default
world up-vector.

### 1.3 Tone Mapping and Gamma

All shaders apply **ACES filmic tone mapping** before gamma encoding:

```glsl
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

// …
color = aces(color * exposure);
color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
fragColor = vec4(color, 1.0);
```

Adjust the `exposure` multiplier (typically 0.55–0.75) to suit brightness.

---

## 2 · `disk.frag` — Schwarzschild Thin Disk

**Algorithm:** Schwarzschild null-geodesic raymarcher with curved ray paths.

### 2.1 Geodesic Integration

The shader approximates curved null geodesics using an Euler integration
of the Newtonian-analogy force:

```
F(r) = −(3/2) M / r³ · r_vec
```

This reproduces the correct Schwarzschild deflection to first post-Newtonian
order and is accurate enough for a visual simulation.  Iteration:

```glsl
vec3 accel = -(GR_COUPLING * M / (r2 * sqrt(r2))) * pos;
dir = normalize(dir + accel * STEP_SIZE);
pos += dir * STEP_SIZE;
```

`GR_COUPLING = 1.5` is a tuned constant matching the exact deflection.

### 2.2 Disk Intersection

At each step, the shader checks if the ray crosses the disk midplane (y = 0):

```glsl
// Sign change in y → disk crossing
if (prevY * pos.y < 0.0) { /* compute hit */ }
```

On a crossing, the disk emission is evaluated at the hit radius using the
Novikov-Thorne temperature profile.

### 2.3 Turbulence (fBm Co-rotating Frame)

Surface perturbations use a 4-octave fBm noise field that co-rotates with
the local Keplerian angular velocity:

```glsl
float omega = 1.0 / (pow(r_hit, 1.5) + 0.1);
float angle = atan(hit.z, hit.x) + omega * uTime;
```

This ensures that spiral features (arms, gaps) orbit the black hole at the
correct speed for their radius.

---

## 3 · `kerr.frag` — Kerr Thin Disk

**Algorithm:** Full Boyer-Lindquist geodesic integration with symplectic Euler.

### 3.1 State Vector

Each ray carries the state vector `(r, θ, φ, Pr, Pθ)`:

```glsl
struct GeoState {
  float r;    // BL radius
  float th;   // BL polar angle
  float phi;  // BL azimuthal angle
  float Pr;   // canonical momentum Σ·ṙ
  float Pth;  // canonical momentum Σ·θ̇
};
```

`b` (impact parameter) and `q` (Carter constant) are conserved and computed
once at ray initialization.

### 3.2 Initialization

`initRay()` converts the Cartesian camera ray to BL coordinates:

1. Solve the quartic for r using the analytic formula.
2. Compute θ and φ.
3. Project the Cartesian velocity onto BL frame to get Pr, Pth.
4. Compute b = (r_o × r_d)·ŷ and q from the initial momenta.

### 3.3 Geodesic Step (Symplectic Euler)

```glsl
// Update momenta first (uses old positions)
dPr  = dR_dr / (2.0 * Sigma);
dPth = dTheta_dth / (2.0 * Sigma);
state.Pr  += dPr  * ds;
state.Pth += dPth * ds;

// Then update positions
state.r   += (state.Pr   / Sigma) * ds;
state.th  += (state.Pth  / Sigma) * ds;
state.phi += dphids * ds;
```

Symplectic Euler preserves the Hamiltonian constraint (geodesic remains null)
better than non-symplectic schemes at the same step count.

### 3.4 Stability

The polar singularity (sin θ → 0) is guarded by clamping:

```glsl
float sinTh = max(abs(sin(state.th)), 1e-4);
```

The ergosphere adds an ambient glow at r < r_erg(θ), providing visual
confirmation of frame-dragging without requiring explicit Penrose-process physics.

### 3.5 Performance

`MAX_STEPS = 420` at `STEP_SIZE = 0.08` gives reliable coverage to `ESCAPE_DIST = 80M`.
On modern mobile GPUs this runs at 30–60fps at 1080p.  Reduce `MAX_STEPS` to 280 or
increase `STEP_SIZE` to 0.12 if frame rate is insufficient.

---

## 4 · `lensing.frag` — Analytical Gravitational Lensing

**Algorithm:** Screen-space analytical lens mapping (no raymarching).

For each pixel:
1. Convert screen position to impact parameter b = |screen_pos|.
2. Compute bending angle α(b) using the closed-form Bozza approximation.
3. Apply the lens equation: β = θ − α D_LS/D_S.
4. Map β back to a source position, look up the source texture.
5. Tint by winding number (number of π-turns around the black hole).

The winding number is `n = floor(α / π)`, corresponding to the image order:
- n = 0 → direct (primary) image
- n = 1 → photon makes a half-orbit (first relativistic image)
- n ≥ 2 → exponentially demagnified relativistic images

### 4.1 Tunable Parameters

| Parameter | Location | Effect |
|---|---|---|
| `HALF_FOV_M` | `lensing.frag` | Angular scale of the diagram |
| `D_OBS` / `D_SRC` | `lensing.frag` | Observer-source geometry |
| `B_CRIT * 1.01` blend width | `bendAngle()` | Sharp/smooth photon sphere |
| `uInclination` | `lensing.js` | Observer viewing angle |

---

## 5 · `corona.frag` — ADAF Hot Corona

**Algorithm:** Volumetric raymarcher with emission-only volume (no scattering).

### 5.1 Volume Integration

The render equation is evaluated as a standard emission-only ray integral:

```
I = ∫ ε(s) · T(s) ds
```

where `T(s) = exp(−∫₀ˢ κ ds')` is the optical depth transmittance and
`ε(s)` is the local emissivity.  Because ADAF is optically thin, `κ` is
very small and most photons escape without scattering.

### 5.2 Emission Components

Each voxel contributes:
1. **Synchrotron**: color gradient from orange-red (radio, outer) to blue (X-ray, inner)
2. **Bremsstrahlung**: blue-white thermal component, scales as ρ² T_e^(1/2)
3. **Reconnection flares**: bright Gaussian blobs orbiting near r_ISCO

### 5.3 Density Model

```glsl
float adafDensity(vec3 pos) {
  float vertProfile = exp(-0.5 * (sinElev / ADAF_H_OVER_R)²);
  float rhoRadial   = pow(r / ADAF_INNER, -1.5) * (1 − exp(...));
  float turb        = fbm(co-rotating noise);
  return vertProfile * rhoRadial * turb * 0.08;
}
```

The `H/R = 0.55` value gives the characteristic puffed-up appearance of an ADAF.

---

## 6 · `jet.frag` — Blandford-Znajek Relativistic Jet

**Algorithm:** Two-sided volumetric jet with Doppler beaming and helical B-field.

### 6.1 Jet Geometry

The jet occupies a cone:  `r_cyl < r_inner + |y| · tan(half_angle)`.

Structure:
- **Spine** (r < 0.3 · r_cone): pair-dominated, slightly hollow, maximum Lorentz factor
- **Sheath** (r > 0.3 · r_cone): declining exponential, KH mixing layer

### 6.2 Helical Field Density

The helical B-field modulates the synchrotron brightness:

```glsl
float helixPhase = phi_jet − y * (2π / HELIX_PITCH);
float helixRidge = exp(-sin(helixPhase)² * 8.0) * 0.4 + 0.3;
```

The helix slowly rotates over time to simulate jet precession.

### 6.3 KH Knots

Kelvin-Helmholtz instability knots are modeled as a propagating sinusoidal
density modulation:

```glsl
float knotPhase = (yAbs / KNOT_SPACING) − uTime * 0.15;
float knot      = pow(0.5 + 0.5 * sin(knotPhase * 2π), 5.0);
```

The `^5` sharpens the knot peaks to mimic the observed brightness contrast.

### 6.4 Doppler Amplification

For each lobe, the Doppler beaming factor is computed once per ray:

```glsl
float dopplerFactor(vec3 jetDir, vec3 rayDir) {
  float cosTheta = dot(jetDir, -rayDir);
  return 1.0 / (JET_GAMMA * (1.0 − JET_BETA * cosTheta));
}
float amp = pow(delta, DOPPLER_EXP);  // DOPPLER_EXP = 3.6
```

The color of the approaching jet is additionally shifted toward blue by
a fractional amount proportional to (δ − 1).

---

## 7 · Utility Functions

### 7.1 `hash3(p)` / `noise3(p)` / `fbm(p)`

Standard procedural noise stack.  The `fbm()` function uses a rotation matrix
to reduce axis-aligned artifacts between octaves.

### 7.2 `blackbodyRGB(T)`

Cubic polynomial approximation of the Planckian locus, valid from 800K to 6.5×10⁷ K.
Returns **linear** sRGB values (no gamma).

### 7.3 `starField(dir)`

Background star field sampled in three resolution layers.  Each layer hashes
grid cells and generates point sources with Planckian color.  A faint fBm
Milky Way diffuse component is added.

---

## 8 · Performance Tuning

| Shader | MAX_STEPS | STEP_SIZE | Typical cost (1080p, mobile) |
|---|---|---|---|
| disk.frag | 300 | 0.08 | ~4 ms |
| kerr.frag | 420 | 0.08 | ~5.5 ms |
| corona.frag | 280 | 0.10 | ~3.5 ms |
| jet.frag | 300 | 0.14 | ~3 ms |

To reduce cost:
- Decrease `MAX_STEPS` by 20–30%
- Increase `STEP_SIZE` by 0.02–0.04
- Reduce fBm octaves from 4 to 3
- Remove the star-field loop iteration (change `i < 3` to `i < 2`)
