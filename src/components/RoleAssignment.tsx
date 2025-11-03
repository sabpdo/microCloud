import { Card, Title, Text, SimpleGrid } from '@mantine/core';
import { Config } from '../types';
import { SliderControl } from './SliderControl';

interface RoleAssignmentProps {
    config: Config;
    onUpdate: (updates: Partial<Config>) => void;
}

export function RoleAssignment({ config, onUpdate }: RoleAssignmentProps) {
    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={2} mb="xs" c="blue">
                Role Assignment Thresholds
            </Title>
            <Text size="sm" c="dimmed" mb="lg">
                Configure thresholds for anchor node promotion and role assignment.
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
                <SliderControl
                    id="anchor-threshold"
                    label="Anchor Node Reputation Threshold"
                    value={config.roleAssignment.anchorThreshold}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(value) =>
                        onUpdate({
                            roleAssignment: {
                                ...config.roleAssignment,
                                anchorThreshold: Math.round(value),
                            },
                        })
                    }
                />

                <SliderControl
                    id="update-cycle"
                    label="Update Cycle (seconds)"
                    value={config.roleAssignment.updateCycle}
                    min={5}
                    max={60}
                    step={1}
                    onChange={(value) =>
                        onUpdate({
                            roleAssignment: {
                                ...config.roleAssignment,
                                updateCycle: Math.round(value),
                            },
                        })
                    }
                />
            </SimpleGrid>
        </Card>
    );
}
