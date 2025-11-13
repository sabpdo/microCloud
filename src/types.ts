export interface Config {
    weights: {
        success: number;
        verify: number;
        fail: number;
        bandwidth: number;
        uptime: number;
        storage: number;
        battery: number;
    };
    preferences: {
        selected: string[];
        multiplier: number;
    };
    roleAssignment: {
        anchorThreshold: number;
        updateCycle: number;
    };
    contentPolicies: {
        video: boolean;
        images: boolean;
        json: boolean;
        text: boolean;
    };
    security: {
        trustMode: 'open' | 'local' | 'whitelist';
        whitelist: string[];
        requireIntegrity: boolean;
        energyAware: boolean;
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

