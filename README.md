# Accretion Disk Visualization Suite

Real-time raymarched astrophysical simulations running in WebGL via Three.js —
five scientifically-grounded shaders covering the full landscape of black hole
accretion physics from thin-disk thermodynamics to relativistic jet beaming.

---

## Visualizations

### 1 · Schwarzschild Thin Disk (`index.html`)

The canonical Novikov–Thorne thin disk around a non-rotating black hole.
Null geodesics are bent through the Schwarzschild metric producing the
characteristic asymmetric brightness distribution, photon ring, and relativistic
Doppler color gradient.

| Parameter | Value |
|---|---|
| Spacetime | Schwarzschild (non-rotating) |
| Disk model | Novikov–Thorne geometrically thin, optically thick |
| ISCO | r = 6 M |
| Photon sphere | r = 3 M |
| Outer disk radius | r = 22 M |
| Peak disk temperature | ~1.4 × 10⁷ K (at ~8.2 M) |

### 2 · Kerr Thin Disk (`kerr.html`)

Full Boyer-Lindquist geodesic raymarcher for a spinning (Kerr) black hole.
A slider controls spin parameter a/M from 0.0 (Schwarzschild) to 0.998
(near-extremal).  The physics readout panel shows ISCO radius, event horizon,
ergosphere boundary, and frame-drag rate Ω_H in real time.

| Parameter | Value at a = 0.998 M |
|---|---|
| Spacetime | Kerr (Boyer-Lindquist coordinates) |
| ISCO (prograde) | r ≈ 1.237 M |
| Event horizon r₊ | r ≈ 1.063 M |
| Ergosphere (equatorial) | r = 2 M |
| Horizon angular velocity Ω_H | ≈ 0.47 M⁻¹ |
| Peak disk temperature | ~3.5 × 10⁷ K |

**Controls:** Drag to orbit · Scroll to zoom · Spin slider (bottom right)

### 3 · Gravitational Lensing (`lensing.html`)

Analytical Schwarzschild lensing map in the observer sky.  Shows the primary
image (gold), first relativistic image (cyan), second relativistic image
(magenta), higher-order images (white), the Einstein ring highlight, and the
photon-sphere caustic glow.  An inclination slider sweeps the source from
face-on to edge-on, deforming the Einstein ring into two arcs.

| Quantity | Value |
|---|---|
| Photon sphere | r = 3 M |
| Critical impact parameter b_crit | 3√3 M ≈ 5.196 M |
| Deflection law (weak field) | α = 4M/b |
| Deflection law (strong field) | α ≈ −π + ln(b/b_crit − 1) + 0.92 |

**Controls:** Inclination slider (0° = face-on, 89° = near-edge-on)

### 4 · ADAF Hot Corona (`corona.frag` — via `src/main.js` swap)

Volumetric raymarcher for an advection-dominated accretion flow (ADAF / hot
corona).  Geometrically thick (H/R ~ 0.55), optically thin plasma with
two-temperature structure (T_e ~ 10⁹ K, T_i ~ 10¹¹ K).  Shows synchrotron
and bremsstrahlung emission, plus three animated magnetic-reconnection flare
blobs orbiting near the ISCO.

### 5 · BZ Relativistic Jet (`jet.frag` — via `src/main.js` swap)

Two-sided Blandford-Znajek jet with helical B-field structure, Kelvin-Helmholtz
instability knots, and relativistic Doppler beaming (Γ = 3.57, β = 0.96).
Approaching jet is amplified and blue-shifted; receding jet dimmed and
red-shifted by δ^3.6.

---

## Observable Phenomena

| Phenomenon | Shader | Physics |
|---|---|---|
| Asymmetric disk brightness | disk.frag, kerr.frag | Relativistic Doppler D⁴ · g⁴ |
| Photon ring (secondary image) | disk.frag, kerr.frag | Geodesic bending at r = 3M |
| ISCO inner edge | disk.frag, kerr.frag | No stable orbit below r_ISCO |
| Color gradient (red → white → blue) | all disk | T ∝ r^(−3/4) blackbody |
| Ergosphere amber glow | kerr.frag | r_erg = 2M, frame-dragging |
| Einstein ring | lensing.frag | Lens equation β = θ − α D_LS/D_S |
| Multiple images / photon sphere caustic | lensing.frag | Bozza strong-field limit |
| Puffed-up thick torus | corona.frag | ADAF H/R ~ 0.5 |
| Reconnection flares | corona.frag | MAD magnetic topology |
| Doppler-boosted jet | jet.frag | δ = 1/Γ(1−β cos θ) |
| KH knots | jet.frag | Kelvin-Helmholtz instability |
| Helical B-field ridge | jet.frag | Toroidal + poloidal B |

---

## Physics

### Schwarzschild Temperature Profile

Based on the Novikov–Thorne (1973) / Page–Thorne (1974) solution for the
time-averaged flux from a geometrically thin, optically thick accretion disk:

```
T(r) = T_peak · (r / r_isco)^(−3/4) · (1 − √(r_isco / r))^(1/4)
```

Peak temperature occurs at r ≈ 1.36 r_isco.

### Kerr ISCO (Bardeen 1972, prograde)

```
Z₁ = 1 + (1 − a²)^(1/3) [(1 + a)^(1/3) + (1 − a)^(1/3)]
Z₂ = √(3a² + Z₁²)
r_ISCO = 3 + Z₂ − √((3 − Z₁)(3 + Z₁ + 2Z₂))
```

### Relativistic Doppler Beaming

Keplerian circular orbital speed in Schwarzschild coordinates:
```
β = √( M / r / (1 − 3M/r) )
```

Doppler factor: `D = 1 / [γ (1 − β cos θ)]`  
Bolometric observed intensity: `I_obs ∝ D⁴ · g⁴`  
where `g = √(1 − r_s/r)` is the gravitational redshift factor.

### Geodesic Integration

Light rays are deflected at each march step:
```
d²x/dλ² ≈ −(3/2 · M / r³) · x⃗
```
This reproduces the Einstein deflection angle α = 4GM/bc² to first
post-Newtonian order and curves rays dramatically near the photon sphere
(r = 3M), naturally generating the secondary photon ring image.

For Kerr, the shader integrates the full Boyer-Lindquist geodesic equations
with Carter constant Q and symplectic Euler integration.

---

## Shader Architecture

See [`docs/SHADERS.md`](docs/SHADERS.md) for a detailed breakdown of every shader's
algorithm, the raymarching loop, geodesic approximations, fBm co-rotating frame
trick, ACES math, tuning parameters, and performance tips.

---

## Running

```bash
npm install
npm run dev
```

| Page | URL |
|---|---|
| Schwarzschild thin disk | [http://localhost:5173](http://localhost:5173) |
| Kerr thin disk | [http://localhost:5173/kerr.html](http://localhost:5173/kerr.html) |
| Gravitational lensing | [http://localhost:5173/lensing.html](http://localhost:5173/lensing.html) |

These pages are available in the Vite dev server (`npm run dev`). The default
`vite build` output currently emits `index.html` unless multi-page build inputs
are explicitly configured.

## Controls

| Input | Action | Available In |
|---|---|---|
| Drag (mouse / touch) | Orbit camera around black hole | disk, kerr |
| Scroll / pinch | Zoom in / out | disk, kerr |
| Spin slider | Adjust a/M from 0 to 0.998 | kerr |
| Inclination slider | Rotate observer 0°–89° | lensing |

---

## Repository Structure

```
accretion_disk/
├── index.html            — Schwarzschild thin disk
├── kerr.html             — Kerr thin disk + spin slider
├── lensing.html          — Gravitational lensing diagram
├── src/
│   ├── main.js           — Three.js entrypoint (Schwarzschild)
│   ├── kerr.js           — Three.js entrypoint (Kerr + physics HUD)
│   ├── lensing.js        — Three.js entrypoint (lensing)
│   ├── style.css         — Shared HUD styles
│   └── shaders/
│       ├── disk.vert     — Shared passthrough vertex shader
│       ├── disk.frag     — Schwarzschild raymarcher
│       ├── kerr.frag     — Kerr BL geodesic raymarcher
│       ├── lensing.frag  — Analytical lensing map
│       ├── corona.frag   — ADAF hot corona (volumetric)
│       └── jet.frag      — BZ relativistic jet (two-sided)
└── docs/
    ├── PHYSICS.md        — Full derivations of all physical models
    ├── SHADERS.md        — Shader architecture and tuning guide
    └── REFERENCES.md     — Annotated bibliography with DOIs
```

---

## References

Full annotated bibliography: [`docs/REFERENCES.md`](docs/REFERENCES.md)

Key papers:
- Novikov & Thorne (1973) — thin disk temperature profile
- Page & Thorne (1974) — Kerr disk emissivity
- Bardeen, Press & Teukolsky (1972) — Kerr ISCO formula
- Carter (1968) — Carter constant for Kerr geodesics
- Bozza et al. (2001) — strong-field lensing approximation
- Narayan & Yi (1994, 1995) — ADAF self-similar solution
- Blandford & Znajek (1977) — BZ jet mechanism
- EHT Collaboration (2019, 2022) — M87* and Sgr A* observations
