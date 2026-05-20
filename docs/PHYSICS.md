# Physics Reference

This document derives the key physical models used in the shaders, in
geometrized units **G = c = M = 1** throughout (so the gravitational radius
r_g = GM/c² = 1).

---

## 1 · Schwarzschild Metric

The exterior vacuum solution for a non-rotating, uncharged mass M is:

```
ds² = −(1 − 2M/r) dt²  +  (1 − 2M/r)⁻¹ dr²  +  r² dΩ²
```

where **dΩ² = dθ² + sin²θ dφ²**.

Key radii:

| Quantity | Value |
|---|---|
| Schwarzschild radius r_s | 2M |
| Photon sphere | 3M |
| Photon-sphere impact parameter b_crit | 3√3 M ≈ 5.196 M |
| ISCO (prograde) | 6M |

### 1.1 Null Geodesics

For photons (null geodesics) in the Schwarzschild equatorial plane,
the orbital equation reduces to:

```
(dr/dλ)² = E² − (1 − 2M/r)(L²/r²)     ≡  V_eff(r)
```

where E and L are the conserved energy and angular momentum per unit
energy, and b = L/E is the **impact parameter**.  The effective potential
has a maximum at r = 3M (photon sphere); rays with b < b_crit = 3√3 M
plunge into the hole.

### 1.2 Deflection Angle

The total bending angle for a ray with impact parameter b >> b_crit is

```
α ≈ 4M/b          (weak field, Einstein 1915)
```

In the strong-field limit (b → b_crit) the logarithmic approximation
(Bozza et al. 2001) gives:

```
α ≈ −π + 1.0 · ln(b/b_crit − 1) + 0.9246
```

The lens equation for a source at angular diameter distance D_S and
lens at D_L (with D_LS = D_S − D_L) is:

```
β = θ − α(θ) · (D_LS / D_S)
```

where θ = b/D_L and β is the true angular position of the source.

---

## 2 · Kerr Metric

The Boyer-Lindquist form of the Kerr metric for a rotating black hole
with spin parameter a = J/M (|a| ≤ M) is:

```
ds² = −(1 − 2Mr/Σ) dt²  −  (4Mar sin²θ / Σ) dt dφ
      + (Σ/Δ) dr²  +  Σ dθ²
      + (r² + a² + 2Ma²r sin²θ / Σ) sin²θ dφ²
```

where

```
Σ = r² + a² cos²θ
Δ = r² − 2Mr + a²
```

### 2.1 Key Radii

| Quantity | Formula | a = 0.998 M |
|---|---|---|
| Outer event horizon r₊ | 1 + √(1 − a²) M | 1.063 M |
| Ergosphere (equatorial) | 2M (always) | 2.000 M |
| ISCO (prograde, Bardeen 1972) | 3 + Z₂ − √((3−Z₁)(3+Z₁+2Z₂)) | 1.237 M |

where

```
Z₁ = 1 + (1 − a²)^(1/3) [(1 + a)^(1/3) + (1 − a)^(1/3)]
Z₂ = √(3a² + Z₁²)
```

### 2.2 Boyer-Lindquist Geodesics (Null Case)

The four constants of geodesic motion in Kerr are:

- **μ = 0** (null geodesic)
- **E** — conserved energy
- **L_z = b E** — conserved azimuthal angular momentum  
- **K (Carter constant)** — Q = K − (L_z − aE)²

In the canonical formulation with affine parameter λ = τ/E:

```
Σ dr/dλ = ±√R(r)
Σ dθ/dλ = ±√Θ(θ)
Σ dφ/dλ = (a P / Δ) − (a − b/sin²θ)
Σ dt/dλ = a(b − a sin²θ) + (r²+a²) P/Δ
```

where

```
P     = r² + a² − ab
R(r)  = P² − Δ[(b − a)² + q]
Θ(θ) = q − cos²θ(a² − b²/sin²θ)
q     = Q/E²  (reduced Carter constant)
```

The momenta used in the shader are Σ Pr = Σ dr/dλ and Σ Pθ = Σ dθ/dλ.
Their equations of motion follow from the geodesic equation:

```
dPr/dλ = ∂R/(2Σ) / ∂r
dPθ/dλ = ∂Θ/(2Σ) / ∂θ
```

### 2.3 Impact Parameter and Carter Constant from Initial Conditions

For a ray launched from position **r_o** in Cartesian coordinates with
unit direction **r_d**, we use:

```
b = (r_o × r_d) · ŷ        (y-component of angular momentum)
q = (Pθ)² + cos²θ (a² − b²/sin²θ)   (computed at launch point)
```

### 2.4 Doppler Factor (Equatorial Disk)

For a test particle in circular orbit in the equatorial plane, the
Keplerian angular velocity is:

```
Ω_K = 1 / (r^(3/2) + a)     (prograde)
```

The specific orbital energy determines the Doppler-beaming factor
observed at infinity.  For a photon emitted by a co-rotating fluid
element with angular velocity Ω_K:

```
g_tt  = −(1 − 2M/r)
g_tφ  = −2Ma/r
g_φφ  = r² + a² + 2Ma²/r     (equatorial, sin θ = 1)

g_orb = √(−(g_tt + 2 g_tφ Ω_K + g_φφ Ω_K²))

D = g_orb / (1 − b · Ω_K)
```

Observed temperature: T_obs = D · T_em.

---

## 3 · Novikov-Thorne Thin Disk (Schwarzschild)

The Novikov & Thorne (1973) model describes a geometrically thin
(H/R ≪ 1), optically thick accretion disk in local thermodynamic
equilibrium.  The local effective temperature profile is:

```
T_eff(r) = T_peak · f(r)^(1/4)
```

where the dimensionless emissivity profile f(r) is derived from
energy-momentum conservation:

```
f(r) = (√r − √r_ISCO) / r² · F(r, r_ISCO)
```

with F a slowly varying correction factor of order unity.  For a
Schwarzschild black hole (r_ISCO = 6M), T_eff peaks near r ≈ 9M.

The peak temperature for Eddington-rate accretion scales as:

```
T_peak ≈ 6.3×10⁶ K · (M / M_☉)^(−1/4) · (Ṁ / Ṁ_Edd)^(1/4)
```

In the shader, T_peak = 8×10⁶ K provides a visually bright disk.

---

## 4 · ADAF — Advection-Dominated Accretion Flow

### 4.1 Two-Temperature Plasma

In an ADAF (Narayan & Yi 1994, 1995), the accretion rate Ṁ ≪ Ṁ_crit
≈ 0.01 Ṁ_Edd.  Coulomb coupling between ions and electrons is
inefficient, leading to a two-temperature structure:

```
T_i ≈ 10¹¹ K  (virial temperature, ions are hot)
T_e ≈ 10⁹ K   (electrons, cooled by radiation)
```

### 4.2 Self-Similar Density Profile

The ADAF density follows a power-law:

```
ρ(r) ∝ r^(−3/2) · f(θ)
```

where f(θ) describes the vertical thickening (H/R ~ 0.3–1.0 for ADAF
versus 0.01–0.1 for thin disks).

### 4.3 Emission Mechanisms

**Bremsstrahlung (free-free):**

```
ε_ff ≈ 1.4 × 10⁻²⁷ n_e² T_e^(1/2) erg cm⁻³ s⁻¹
```

Spectrum: flat below h ν ≪ k T_e, exponential cutoff above.
In the corona shader, this produces a blue-white X-ray haze.

**Synchrotron (self-absorbed below ν_SSA):**

```
j_ν ∝ B² · n_e · ν^(1/3)       (below self-absorption)
j_ν ∝ B^((p+1)/2) · ν^(-(p-1)/2)  (optically thin)
```

For p ≈ 2.5 (ADAF electron power-law index), the observable optical-UV
synchrotron has spectral index α = −0.75.

---

## 5 · Blandford-Znajek Jet Mechanism

The BZ process (Blandford & Znajek 1977) taps the rotational energy of
a Kerr black hole via a large-scale magnetic field threading the ergosphere.

### 5.1 Jet Power

```
P_BZ ≈ (κ/4π) Φ_BH² Ω_H²
```

where:
- Φ_BH = magnetic flux through the horizon
- Ω_H = a / (2 r₊) — horizon angular velocity
- κ ≈ 0.044 (numerical factor from MHD geometry)

For a = 0.998 M: Ω_H ≈ 0.47 M⁻¹.

### 5.2 Doppler Beaming

Relativistic jets (Lorentz factor Γ ~ 3–30) exhibit strong Doppler
boosting.  For a jet at angle θ to the line of sight:

```
δ = 1 / (Γ (1 − β cos θ))
S_obs = δ^(3+α) · S_em
```

where α ≈ 0.6 is the synchrotron spectral index.

- Approaching jet (θ < 90°): δ > 1, flux amplified, blueshifted
- Receding jet  (θ > 90°): δ < 1, flux suppressed, redshifted

### 5.3 Kelvin-Helmholtz Instabilities

At the jet-cocoon shear boundary, the Kelvin-Helmholtz instability
produces quasi-periodic brightness knots.  The knot spacing is

```
λ_KH ≈ 2π r_jet · Γ_shear / (Γ_KH k_z)
```

In the shader, knots are modeled as sinusoidal density modulations
propagating at a fraction of the jet speed.

---

## 6 · Relativistic Beaming and Color Science

### 6.1 Blackbody Temperature to RGB

The Planckian locus maps temperature to CIE xy chromaticity.  The
shader uses the Krystek polynomial approximation (1985) to map T → RGB
directly in linear sRGB space (no white-point adaptation).

Key temperatures:
- 3,000 K — cool outer disk, far sub-ISCO → orange-red
- 10,000 K — inner thin disk → white
- 10⁷ K — Schwarzschild/Kerr inner disk → blue-white
- 10⁹ K — ADAF corona electrons → X-ray → rendered blue-white

### 6.2 Doppler Color Shift

The shader computes a multiplicative temperature factor D, so that
T_obs = D · T_em.  For a = 0.998 M, the peak D on the approaching
limb reaches ~ 1.6, shifting the blackbody curve about 1500 K bluer.

### 6.3 Gravitational Redshift

A photon escaping from radius r (Schwarzschild) is redshifted by

```
1 + z = 1 / √(1 − 2M/r)
```

In the disk shader, T_eff is modulated by the full Doppler-redshift
factor before blackbody lookup.

---

## 7 · Coordinate Conversions

### 7.1 Boyer-Lindquist → Cartesian

```
x = √(r² + a²) · sin θ · cos φ
y = r · cos θ
z = √(r² + a²) · sin θ · sin φ
```

(y is the spin/polar axis in all shaders.)

### 7.2 Cartesian → Boyer-Lindquist r

Given Cartesian **ρ** = (x, y, z) and spin a:

```
w² = |ρ|² − a²
r² = ½(w² + √(w⁴ + 4a²y²))
```

The θ and φ angles follow from the standard spherical relations applied
to the BL frame.
