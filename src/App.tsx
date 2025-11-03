import { Container, Title, Text, Stack, Paper, Tabs } from '@mantine/core';
import { useConfig } from './hooks/useConfig';
import { defaultConfig } from './types';
import { ReputationWeights } from './components/ReputationWeights';
import { PeerSelection } from './components/PeerSelection';
import { RoleAssignment } from './components/RoleAssignment';
import { ContentPolicies } from './components/ContentPolicies';
import { SecuritySettings } from './components/SecuritySettings';
import { ActionButtons } from './components/ActionButtons';
import { MetricsDashboard } from './components/MetricsDashboard';
import { Toaster, toast } from 'sonner';

function App() {
    const {
        config,
        updateConfig,
        resetConfig,
        exportConfig,
        importConfig,
    } = useConfig();

    const applyPreferencesMultiplier = () => {
        // Start with current weights (preserve manually adjusted values)
        const baseWeights = { ...defaultConfig.weights };
        const newWeights = { ...config.weights };

        // Apply multiplier to selected preferences only
        const multiplier = config.preferences.multiplier;
        const preferenceMap: Record<string, keyof typeof baseWeights> = {
            bandwidth: 'bandwidth',
            uptime: 'uptime',
            success: 'success',
            storage: 'storage',
        };

        // Reset selected preference weights to base, then apply multiplier
        config.preferences.selected.forEach((pref) => {
            const weightKey = preferenceMap[pref];
            if (weightKey && newWeights[weightKey] !== undefined) {
                newWeights[weightKey] = baseWeights[weightKey] * multiplier;
            }
        });

        // Reset non-selected preference weights to base if they match the multiplier-adjusted value
        Object.keys(preferenceMap).forEach((pref: string) => {
            if (!config.preferences.selected.includes(pref)) {
                const weightKey = preferenceMap[pref];
                if (weightKey) {
                    const expectedMultiplied = baseWeights[weightKey] * config.preferences.multiplier;
                    // Only reset if current value matches what would be the multiplied value
                    if (Math.abs(newWeights[weightKey] - expectedMultiplied) < 0.01) {
                        newWeights[weightKey] = baseWeights[weightKey];
                    }
                }
            }
        });

        updateConfig({ weights: newWeights });
    };

    const handleSave = () => {
        // Configuration is auto-saved, show confirmation
        toast.success('Configuration saved!');
    };

    const handleReset = () => {
        resetConfig();
        // Toast is handled in useConfig
    };

    return (
        <Container size="xl" py="xl">
            <Paper
                p="xl"
                radius="md"
                style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    marginBottom: '2rem',
                }}
            >
                <Title order={1} c="white" mb="xs">
                    μCloud Dashboard
                </Title>
                <Text size="lg" c="white" opacity={0.95}>
                    Configure peer selection, caching behavior, and view performance metrics
                </Text>
            </Paper>

            <Tabs defaultValue="config">
                <Tabs.List>
                    <Tabs.Tab value="config">Configuration</Tabs.Tab>
                    <Tabs.Tab value="metrics">Performance Metrics</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="config" pt="xl">
                    <Stack gap="xl">
                        <ReputationWeights
                            config={config}
                            onUpdate={updateConfig}
                            onApplyMultiplier={applyPreferencesMultiplier}
                        />

                        <PeerSelection
                            config={config}
                            onUpdate={updateConfig}
                            onApplyMultiplier={applyPreferencesMultiplier}
                        />

                        <RoleAssignment config={config} onUpdate={updateConfig} />

                        <ContentPolicies config={config} onUpdate={updateConfig} />

                        <SecuritySettings config={config} onUpdate={updateConfig} />

                        <ActionButtons
                            onSave={handleSave}
                            onReset={handleReset}
                            onExport={exportConfig}
                            onImport={importConfig}
                        />
                    </Stack>

                    <Text size="sm" c="dimmed" ta="center" mt="xl" py="xl">
                        μCloud Configuration Dashboard - All changes are saved locally
                    </Text>
                </Tabs.Panel>

                <Tabs.Panel value="metrics" pt="xl">
                    <MetricsDashboard />
                </Tabs.Panel>
            </Tabs>

            <Toaster position="top-right" richColors />
        </Container>
    );
}

export default App;
