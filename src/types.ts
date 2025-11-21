/**
 * System configuration interface
 * Defines all tunable parameters for peer selection, caching, and security
 */
export interface Config {
  // Weights for reputation calculation
  // Different factors contribute to peer reputation score
  weights: {
    success: number; // Weight for successful uploads
    verify: number; // Weight for integrity verifications
    fail: number; // Weight for failed transfers (typically negative)
    bandwidth: number; // Weight for bandwidth capacity
    uptime: number; // Weight for connection uptime
    storage: number; // Weight for available storage
    battery: number; // Weight for battery level
  };
  // User preferences for peer selection
  preferences: {
    selected: string[]; // Which factors to prioritize
    multiplier: number; // Multiplier for selected factors
  };
  // Role assignment configuration
  roleAssignment: {
    anchorThreshold: number; // Reputation threshold to become anchor node
    updateCycle: number; // How often to recalculate roles (seconds)
  };
  // Content type policies (what types to cache)
  contentPolicies: {
    video: boolean; // Cache video files
    images: boolean; // Cache image files
    json: boolean; // Cache JSON files
    text: boolean; // Cache text files
  };
  // Security and trust settings
  security: {
    trustMode: 'open' | 'local' | 'whitelist'; // Who can join
    whitelist: string[]; // Allowed peer IDs (if whitelist mode)
    requireIntegrity: boolean; // Require hash verification
    energyAware: boolean; // Consider battery/energy usage
  };
}

export const defaultConfig: Config = {
  weights: {
    success: 1.0,
    verify: 1.0,
    fail: -1.0,
    bandwidth: 1.0,
    uptime: 1.0,
    storage: 1.0,
    battery: 1.0,
  },
  preferences: {
    selected: [],
    multiplier: 2.0,
  },
  roleAssignment: {
    anchorThreshold: 50,
    updateCycle: 10,
  },
  contentPolicies: {
    video: true,
    images: true,
    json: true,
    text: false,
  },
  security: {
    trustMode: 'open',
    whitelist: [],
    requireIntegrity: true,
    energyAware: true,
  },
};
