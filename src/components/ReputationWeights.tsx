import { Card, Title, Text, SimpleGrid, Code } from '@mantine/core';
import { Config } from '../types';
import { SliderControl } from './SliderControl';

interface ReputationWeightsProps {
    config: Config;
    onUpdate: (updates: Partial<Config>) => void;
    onApplyMultiplier: () => void;
}

export function ReputationWeights({
    config,
    onUpdate,
}: ReputationWeightsProps) {
    const handleWeightChange = (key: keyof Config['weights'], value: number) => {
        onUpdate({
            weights: {
                ...config.weights,
                [key]: value,
            },
        });
        // Don't call onApplyMultiplier here - manual adjustments should be preserved
    };

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={2} mb="xs" c="blue">
                Reputation Scoring Weights
            </Title>
            <Text size="sm" c="dimmed" mb="lg">
                Adjust the weights (a-g) for the reputation scoring function:{' '}
                <Code>
                    S(peer) = a·n<sub>success</sub> + b·n<sub>verify</sub> + c·n
                    <sub>fail</sub> + d·B + e·T + f·M + g·P
                </Code>
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                <SliderControl
                    id="weight-success"
                    label="a: Successful Uploads (nsuccess)"
                    value={config.weights.success}
                    min={0}
                    max={10}
                    step={0.1}
                    onChange={(value) => handleWeightChange('success', value)}
                />

                <SliderControl
                    id="weight-verify"
                    label="b: Integrity Verifications (nverify)"
                    value={config.weights.verify}
                    min={0}
                    max={10}
                    step={0.1}
                    onChange={(value) => handleWeightChange('verify', value)}
                />

                <SliderControl
                    id="weight-fail"
                    label="c: Failed Transfers (nfail)"
                    value={config.weights.fail}
                    min={-10}
                    max={0}
                    step={0.1}
                    onChange={(value) => handleWeightChange('fail', value)}
                />

                <SliderControl
                    id="weight-bandwidth"
                    label="d: Bandwidth (B)"
                    value={config.weights.bandwidth}
                    min={0}
                    max={10}
                    step={0.1}
                    onChange={(value) => handleWeightChange('bandwidth', value)}
                />

                <SliderControl
                    id="weight-uptime"
                    label="e: Uptime (T)"
                    value={config.weights.uptime}
                    min={0}
                    max={10}
                    step={0.1}
                    onChange={(value) => handleWeightChange('uptime', value)}
                />

                <SliderControl
                    id="weight-storage"
                    label="f: Available Storage (M)"
                    value={config.weights.storage}
                    min={0}
                    max={10}
                    step={0.1}
                    onChange={(value) => handleWeightChange('storage', value)}
                />

                <SliderControl
                    id="weight-battery"
                    label="g: Battery Percentage (P)"
                    value={config.weights.battery}
                    min={0}
                    max={10}
                    step={0.1}
                    onChange={(value) => handleWeightChange('battery', value)}
                />
            </SimpleGrid>
        </Card>
    );
}
