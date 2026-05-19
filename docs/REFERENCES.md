# References

All papers are referenced using DOI where available.  ADS links are provided
for astrophysics preprints.  Each entry includes a one-sentence description
of its relevance to this project.

---

## General Relativity & Black Hole Metrics

**Schwarzschild, K. (1916)**  
"Über das Gravitationsfeld eines Massenpunktes nach der Einsteinschen Theorie."  
*Sitzungsberichte der Königlich Preußischen Akademie der Wissenschaften*, 189–196.  
→ The original exterior Schwarzschild solution; defines the metric used in `disk.frag`.

**Kerr, R. P. (1963)**  
"Gravitational field of a spinning mass as an example of algebraically special metrics."  
*Physical Review Letters* 11, 237.  
[DOI: 10.1103/PhysRevLett.11.237](https://doi.org/10.1103/PhysRevLett.11.237)  
→ The exact rotating black hole solution; the foundation for `kerr.frag`.

**Boyer, R. H. & Lindquist, R. W. (1967)**  
"Maximal analytic extension of the Kerr metric."  
*Journal of Mathematical Physics* 8, 265.  
[DOI: 10.1063/1.1705193](https://doi.org/10.1063/1.1705193)  
→ Establishes the Boyer-Lindquist coordinate system used for all Kerr geodesic integration.

**Carter, B. (1968)**  
"Global structure of the Kerr family of gravitational fields."  
*Physical Review* 174, 1559.  
[DOI: 10.1103/PhysRev.174.1559](https://doi.org/10.1103/PhysRev.174.1559)  
→ Introduces the Carter constant Q, enabling complete separation of the Kerr geodesic equations.

**Bardeen, J. M., Press, W. H., & Teukolsky, S. A. (1972)**  
"Rotating black holes: Locally nonrotating frames, energy extraction, and scalar synchrotron radiation."  
*Astrophysical Journal* 178, 347.  
[DOI: 10.1086/151796](https://doi.org/10.1086/151796)  
→ Derives the Kerr ISCO formula (prograde and retrograde) implemented in `kerr.frag` and `kerr.js`.

---

## Accretion Disk Theory

**Shakura, N. I. & Sunyaev, R. A. (1973)**  
"Black holes in binary systems: Observational appearance."  
*Astronomy & Astrophysics* 24, 337–355.  
[ADS: 1973A&A....24..337S](https://ui.adsabs.harvard.edu/abs/1973A%26A....24..337S)  
→ The standard α-disk model; motivates the Novikov-Thorne temperature profile used in `disk.frag`.

**Novikov, I. D. & Thorne, K. S. (1973)**  
"Astrophysics of Black Holes."  
In: *Black Holes*, ed. DeWitt & DeWitt.  Gordon & Breach, New York.  
→ Derives the exact relativistic emissivity profile T_eff(r) used in `disk.frag`; see eq. (5.6.9).

**Page, D. N. & Thorne, K. S. (1974)**  
"Disk-accretion onto a black hole.  I. Time-averaged structure of accretion disk."  
*Astrophysical Journal* 191, 499.  
[DOI: 10.1086/152990](https://doi.org/10.1086/152990)  
→ Extension of Novikov-Thorne to Kerr metric; provides the temperature profile for `kerr.frag`.

**Fishbone, L. G. & Moncrief, V. (1976)**  
"Relativistic fluid disks in orbit around Kerr black holes."  
*Astrophysical Journal* 207, 962.  
[DOI: 10.1086/154565](https://doi.org/10.1086/154565)  
→ Fishbone-Moncrief torus solutions; motivate the parametric thick torus in `corona.frag`.

---

## ADAF and Corona

**Narayan, R. & Yi, I. (1994)**  
"Advection-dominated accretion: A self-similar solution."  
*Astrophysical Journal Letters* 428, L13.  
[DOI: 10.1086/187381](https://doi.org/10.1086/187381)  
→ The original ADAF self-similar solution; establishes the ρ ∝ r^(−3/2) density profile.

**Narayan, R. & Yi, I. (1995)**  
"Advection-dominated accretion: Underfed black holes and neutron stars."  
*Astrophysical Journal* 452, 710.  
[DOI: 10.1086/176343](https://doi.org/10.1086/176343)  
→ Provides the two-temperature plasma structure (T_i ~ 10¹¹ K, T_e ~ 10⁹ K) used in `corona.frag`.

**Mahadevan, R. (1997)**  
"Scaling laws for advection-dominated flows: Applications to low-luminosity galactic nuclei."  
*Astrophysical Journal* 477, 585.  
[DOI: 10.1086/303727](https://doi.org/10.1086/303727)  
→ Derives the synchrotron and bremsstrahlung emissivities implemented in `corona.frag`.

**Yuan, F. & Narayan, R. (2014)**  
"Hot accretion flows around black holes."  
*Annual Review of Astronomy and Astrophysics* 52, 529.  
[DOI: 10.1146/annurev-astro-082812-141003](https://doi.org/10.1146/annurev-astro-082812-141003)  
→ Comprehensive review of ADAF/RIAF physics including magnetic reconnection flares.

---

## Jets and Blandford-Znajek Mechanism

**Blandford, R. D. & Znajek, R. L. (1977)**  
"Electromagnetic extraction of energy from Kerr black holes."  
*Monthly Notices of the Royal Astronomical Society* 179, 433.  
[DOI: 10.1093/mnras/179.3.433](https://doi.org/10.1093/mnras/179.3.433)  
→ The BZ mechanism for jet launching; derives P_BZ and Ω_H used in `jet.frag` and `PHYSICS.md`.

**Blandford, R. D. & Payne, D. G. (1982)**  
"Hydromagnetic flows from accretion discs and the production of radio jets."  
*Monthly Notices of the Royal Astronomical Society* 199, 883.  
[DOI: 10.1093/mnras/199.4.883](https://doi.org/10.1093/mnras/199.4.883)  
→ Disk-driven jet launching via centrifugally driven MHD winds.

**Bridle, A. H. & Perley, R. A. (1984)**  
"Extragalactic radio jets."  
*Annual Review of Astronomy and Astrophysics* 22, 319.  
[DOI: 10.1146/annurev.aa.22.090184.001535](https://doi.org/10.1146/annurev.aa.22.090184.001535)  
→ Observational review of jet morphology and KH knot structures reproduced in `jet.frag`.

---

## Gravitational Lensing

**Einstein, A. (1915)**  
"Erklärung der Perihelbewegung des Merkur aus der allgemeinen Relativitätstheorie."  
*Sitzungsberichte der Preußischen Akademie der Wissenschaften*.  
→ First derivation of light deflection α = 4GM/bc², implemented in `lensing.frag`.

**Schneider, P., Ehlers, J., & Falco, E. E. (1992)**  
*Gravitational Lenses.* Springer-Verlag.  
[DOI: 10.1007/978-3-662-03758-4](https://doi.org/10.1007/978-3-662-03758-4)  
→ Standard reference for the lens equation β = θ − α D_LS/D_S used in `lensing.frag`.

**Bozza, V., Capozziello, S., Iovane, G., & Scarpetta, G. (2001)**  
"Strong field limit of black hole gravitational lensing."  
*General Relativity and Gravitation* 33, 1535.  
[DOI: 10.1023/A:1012292927358](https://doi.org/10.1023/A:1012292927358)  
→ Derives the logarithmic strong-field deflection approximation α ~ −π + A ln(b/b_crit − 1) + B used in `lensing.frag`.

---

## Radiative Transfer and Color Science

**Rybicki, G. B. & Lightman, A. P. (1979)**  
*Radiative Processes in Astrophysics.* Wiley.  
→ Foundation reference for bremsstrahlung (§5.2) and synchrotron (§6.2) emissivities used throughout.

**Krystek, M. (1985)**  
"An algorithm to calculate correlated colour temperatures."  
*Color Research & Application* 10, 38.  
→ Polynomial approximation of the Planckian locus (T → xy → RGB) underlying `blackbodyRGB()`.

**Hill, S. (2016)**  
"Physically Based Shading in Theory and Practice" (SIGGRAPH Course).  
→ ACES filmic tone mapping coefficients (a=2.51, b=0.03, c=2.43, d=0.59, e=0.14) used in all shaders.

---

## GRMHD Simulations

**Gammie, C. F., McKinney, J. C., & Tóth, G. (2003)**  
"HARM: A numerical scheme for general relativistic magnetohydrodynamics."  
*Astrophysical Journal* 589, 444.  
[DOI: 10.1086/374594](https://doi.org/10.1086/374594)  
→ HARM code; the ADAF/MAD parameter space explored here is informed by HARM results.

**Event Horizon Telescope Collaboration (2019)**  
"First M87 Event Horizon Telescope Results. I–VI."  
*Astrophysical Journal Letters* 875.  
[DOI: 10.3847/2041-8213/ab0ec7](https://doi.org/10.3847/2041-8213/ab0ec7)  
→ The first direct image of a black hole shadow; the photon ring seen in `disk.frag`/`kerr.frag` corresponds to the observed bright ring.

**Event Horizon Telescope Collaboration (2022)**  
"First Sgr A* Event Horizon Telescope Results. I–VI."  
*Astrophysical Journal Letters* 930.  
[DOI: 10.3847/2041-8213/ac6674](https://doi.org/10.3847/2041-8213/ac6674)  
→ Milky Way galactic center black hole image; informs the near-extremal Kerr parameters in `kerr.frag`.

---

## Computer Graphics and Visualization

**Hart, J. C. (1996)**  
"Sphere tracing: A geometric method for the antialiased ray tracing of implicit surfaces."  
*The Visual Computer* 12, 527.  
[DOI: 10.1007/BF02429902](https://doi.org/10.1007/BF02429902)  
→ Sphere-marching foundation, adapted for volumetric emission in `corona.frag` and `jet.frag`.

**Müller, T. & Grave, F. (2010)**  
"GeodesicViewer — A tool for exploring geodesics in the theory of relativity."  
*Computer Physics Communications* 181, 413.  
[DOI: 10.1016/j.cpc.2009.10.010](https://doi.org/10.1016/j.cpc.2009.10.010)  
→ Reference for Boyer-Lindquist geodesic numerical integration approaches used in `kerr.frag`.

**James, O., von Tunzelmann, E., Franklin, P., & Thorne, K. S. (2015)**  
"Gravitational lensing by spinning black holes in astrophysics, and in the movie Interstellar."  
*Classical and Quantum Gravity* 32, 065001.  
[DOI: 10.1088/0264-9381/32/6/065001](https://doi.org/10.1088/0264-9381/32/6/065001)  
→ Describes the production of scientifically accurate disk images, directly motivating the visual goals of `kerr.frag`.
