import { Card, Title, Text, SimpleGrid, Checkbox, Stack } from '@mantine/core';
import { toast } from 'sonner';
import { Config } from '../types';
import { SliderControl } from './SliderControl';

interface PeerSelectionProps {
    config: Config;
    onUpdate: (updates: Partial<Config>) => void;
    onApplyMultiplier: () => void;
}

const preferenceOptions = [
    { id: 'bandwidth', label: 'Bandwidth' },
    { id: 'uptime', label: 'Uptime' },
    { id: 'success', label: 'Upload Success Rate' },
    { id: 'storage', label: 'Storage' },
];

export function PeerSelection({
    config,
    onUpdate,
    onApplyMultiplier,
}: PeerSelectionProps) {
    const handlePreferenceChange = (prefId: string, checked: boolean) => {
        const currentSelected = config.preferences.selected;
        let newSelected: string[];

        if (checked) {
            if (currentSelected.length >= 2) {
                toast.error('You can only select up to 2 preferences.');
                return;
            }
            newSelected = [...currentSelected, prefId];
        } else {
            newSelected = currentSelected.filter((id) => id !== prefId);
        }

        onUpdate({
            preferences: {
                ...config.preferences,
                selected: newSelected,
            },
        });
        onApplyMultiplier();
    };

    const handleMultiplierChange = (value: number) => {
        onUpdate({
            preferences: {
                ...config.preferences,
                multiplier: value,
            },
        });
        onApplyMultiplier();
    };

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={2} mb="xs" c="blue">
                Peer Selection Preferences
            </Title>
            <Text size="sm" c="dimmed" mb="lg">
                Select up to 2 factors to prioritize when selecting peers. Selected
                factors will have their weights multiplicatively increased by k.
            </Text>

            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="xl">
                {preferenceOptions.map((option) => (
                    <Checkbox
                        key={option.id}
                        id={`pref-${option.id}`}
                        label={option.label}
                        checked={config.preferences.selected.includes(option.id)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            handlePreferenceChange(option.id, e.currentTarget.checked)
                        }
                        disabled={
                            !config.preferences.selected.includes(option.id) &&
                            config.preferences.selected.length >= 2
                        }
                    />
                ))}
            </SimpleGrid>

            <Stack gap="xs">
                <SliderControl
                    id="multiplier-k"
                    label="Multiplier k:"
                    value={config.preferences.multiplier}
                    min={1.0}
                    max={5.0}
                    step={0.1}
                    onChange={handleMultiplierChange}
                />
            </Stack>
        </Card>
    );
}
