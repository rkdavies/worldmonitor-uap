/**
 * Literature-derived relative weights for combining observation-opportunity proxies.
 *
 * Medina, Brewer & Kirkpatrick, Scientific Reports 13, 16459 (2023)
 * "An environmental analysis of public UAP sightings and sky view potential"
 * — Bayesian regression over ~98k US reports (2001–2020). Credible associations
 * with: (1) sky visibility / light pollution / canopy, (2) proximity to airports,
 * (3) proximity to military installations. Cloud cover was less consistent.
 *
 * Weights are normalized to sum to 1. They approximate relative emphasis across
 * those factor families (not literal posterior odds ratios, which are in the paper).
 */
export const W_SKY_VISIBILITY = 0.35;
export const W_AIR_TRAFFIC_CONTEXT = 0.32;
export const W_MILITARY_TRAINING_CONTEXT = 0.33;

/** Minimum expectation multiplier (low reporting opportunity regions). */
export const EXPECTATION_MULT_MIN = 0.42;
/** Maximum expectation multiplier (high opportunity: dark skies + dense air/mil activity). */
export const EXPECTATION_MULT_MAX = 1.78;
