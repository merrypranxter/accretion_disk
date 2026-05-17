# Accretion Disk — Schwarzschild Raymarcher

Real-time raymarched accretion disk visualization built on the
**Novikov–Thorne thin disk model**, running in WebGL via Three.js.

![accretion disk preview](docs/preview.png)

## Physics

| Parameter | Value |
|---|---|
| Spacetime | Schwarzschild (non-rotating black hole) |
| Disk model | Novikov–Thorne geometrically thin, optically thick |
| ISCO | r = 6 M |
| Photon sphere | r = 3 M |
| Outer disk radius | r = 22 M |
| Peak disk temperature | ~1.4 × 10⁷ K (at ~8.2 M) |
| Corona temperature | ~10⁹ K |

### Temperature Profile

Based on the Novikov–Thorne (1973) / Page–Thorne (1974) solution for the
time-averaged flux from a geometrically thin, optically thick accretion disk:

```
T(r) = T_peak · (r / r_isco)^(−3/4) · (1 − √(r_isco / r))^(1/4)
```

Peak temperature occurs at r ≈ 1.36 r_isco.

### Relativistic Doppler Beaming

Keplerian circular orbital speed in Schwarzschild coordinates:
```
β = √( M / r / (1 − 3M/r) )
```

Doppler factor: `D = 1 / [γ (1 − β cos θ)]`  
Bolometric observed intensity: `I_obs ∝ D⁴ · g⁴`  
where `g = √(1 − r_s/r)` is the gravitational redshift factor.

The approaching limb of the disk is brightened and blueshifted; the
receding limb is dimmed and redshifted — producing the characteristic
asymmetric brightness distribution seen in the Luminet (1979) images.

### Color

Temperature → color uses the Krystek & Antoni (2004) blackbody RGB
approximation, spanning:

- ~3×10⁵ K → deep orange-red (outer disk)
- ~1.4×10⁷ K → yellow-white (inner disk / ISCO)
- ~10⁹ K → blue-white (corona)

### Geodesic Integration

Light rays are deflected at each march step:
```
d²x/dλ² ≈ −(κ · M / r³) · x⃗
```
This reproduces the Einstein deflection angle α = 4GM/bc² to first
post-Newtonian order and curves rays dramatically near the photon sphere
(r = 3M), naturally generating the secondary photon ring image.

### Turbulent Disk Structure

Disk density is modulated by 4-octave fractional Brownian motion sampled
in a co-rotating Keplerian reference frame, so disk structures orbit at
the correct local angular velocity Ω ∝ r^(−3/2).

## Features

- 🌡️ Novikov–Thorne temperature + bolometric color gradient
- 🔴 Relativistic Doppler beaming + gravitational redshift (D⁴ · g⁴)
- 🌀 Geodesic light bending → photon ring secondary image
- 💫 Turbulent disk density (fBm, co-rotating Keplerian frame)
- 🔵 Polar synchrotron jet (Blandford–Znajek style)
- ☁️ Hot optically-thin corona (volumetric X-ray glow)
- ⭐ Procedural star field with spectral type coloring
- 🎬 ACES filmic tone mapping

## Running

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Controls

| Input | Action |
|---|---|
| Drag | Orbit camera around black hole |
| Scroll | Zoom in / out |

## References

- Novikov, I. D. & Thorne, K. S. (1973). "Astrophysics of Black Holes."
  *Black Holes*, Gordon & Breach, 343–450.
- Page, D. N. & Thorne, K. S. (1974). "Disk-Accretion onto a Black Hole."
  *ApJ*, 191, 499–506.
- Luminet, J.-P. (1979). "Image of a spherical black hole with thin accretion
  disk." *A&A*, 75, 228–235.
- Krystek, M. & Antoni, M. (2004). "A weighted vector method for estimating
  the color temperature." *Metrologia*, 41(5).
