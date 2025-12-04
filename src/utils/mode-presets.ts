/**
 * Mode presets for reputation weight configuration
 * Different modes prioritize different aspects of peer behavior
 */

export interface Weights {
  a: number; // Weight for successful uploads (n_success)
  b: number; // Weight for bandwidth (B in Mbps)
  c: number; // Weight for uptime (T in seconds)
}

/**
 * Operating modes for μCloud
 * Each mode has different weight priorities for reputation calculation
 */
export type Mode = 'education' | 'conference' | 'custom';

/**
 * Get reputation weights for a given mode
 * @param mode - Operating mode
 * @returns Weights object with a, b, c values
 */
export function weightsForMode(mode: Mode): Weights {
  switch (mode) {
    case 'education':
      // Education mode: prioritize fairness and cooperation
      // Higher weight on serving others (a=2.0) to reward cooperative behavior
      return { a: 2.0, b: 1.0, c: 1.0 };

    case 'conference':
      // Conference mode: prioritize performance and capacity
      // Heavy weight on bandwidth (b=5.0) to favor high-capacity peers
      return { a: 1.0, b: 5.0, c: 1.0 };

    case 'custom':
    default:
      // Default/custom mode: balanced weights
      // Standard configuration suitable for general use
      return { a: 1.0, b: 3.0, c: 1.0 };
  }
}

/**
 * Get anchor threshold for a given mode
 * Thresholds are scaled based on mode's bandwidth weight to maintain consistency
 * @param mode - Operating mode
 * @returns Anchor threshold value
 */
export function anchorThresholdForMode(mode: Mode): number {
  const weights = weightsForMode(mode);
  // Base threshold of 60, scaled by bandwidth weight to ensure consistency
  // Higher bandwidth weight means higher threshold (since bandwidth contributes more to score)
  return 60 * (weights.b / 3.0); // Normalize to default b=3.0
}

