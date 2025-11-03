import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Config, defaultConfig } from '../types';

const STORAGE_KEY = 'microcloud_config';

export function useConfig() {
    const [config, setConfig] = useState<Config>(defaultConfig);

    // Load configuration from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Merge with defaults to handle missing properties
                // Only keep contentPolicies for simplified config
                const merged: Config = {
                    ...defaultConfig,
                    ...parsed,
                    contentPolicies: {
                        ...defaultConfig.contentPolicies,
                        ...(parsed.contentPolicies || {}),
                    },
                };
                setConfig(merged);
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            setConfig(defaultConfig);
        }
    }, []);

    // Save configuration to localStorage
    const saveConfig = useCallback((newConfig: Config) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
            setConfig(newConfig);
        } catch (error) {
            console.error('Error saving configuration:', error);
            toast.error('Error saving configuration');
        }
    }, []);

    // Update config and auto-save
    const updateConfig = useCallback(
        (updates: Partial<Config>) => {
            const newConfig = { ...config, ...updates };
            saveConfig(newConfig);
        },
        [config, saveConfig]
    );

    // Reset to defaults
    const resetConfig = useCallback(() => {
        setConfig(defaultConfig);
        saveConfig(defaultConfig);
        toast.info('Configuration reset to defaults');
    }, [saveConfig]);

    // Export configuration
    const exportConfig = useCallback(() => {
        const dataStr = JSON.stringify(config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `microcloud-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Configuration exported!');
    }, [config]);

    // Import configuration
    const importConfig = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const result = event.target?.result;
                if (!result || typeof result !== 'string') {
                    toast.error('Error reading file');
                    return;
                }
                const imported = JSON.parse(result);
                // Only keep contentPolicies for simplified config
                const merged: Config = {
                    ...defaultConfig,
                    ...imported,
                    contentPolicies: {
                        ...defaultConfig.contentPolicies,
                        ...(imported.contentPolicies || {}),
                    },
                };
                saveConfig(merged);
                toast.success('Configuration imported successfully!');
            } catch (error) {
                toast.error('Error importing configuration: Invalid JSON');
            }
        };
        reader.readAsText(file);
    }, [saveConfig]);

    return {
        config,
        updateConfig,
        resetConfig,
        exportConfig,
        importConfig,
    };
}

