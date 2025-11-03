import { Card, Title, Text, Stack, Select, Textarea, Checkbox } from '@mantine/core';
import { Config } from '../types';

interface SecuritySettingsProps {
    config: Config;
    onUpdate: (updates: Partial<Config>) => void;
}

export function SecuritySettings({
    config,
    onUpdate,
}: SecuritySettingsProps) {
    const handleWhitelistChange = (value: string) => {
        onUpdate({
            security: {
                ...config.security,
                whitelist: value ? value.split(',').map((s) => s.trim()) : [],
            },
        });
    };

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={2} mb="xs" c="blue">
                Security & Trust Boundaries
            </Title>
            <Text size="sm" c="dimmed" mb="lg">
                Configure who may join the μCloud swarm and security settings.
            </Text>

            <Stack gap="md">
                <Select
                    label="Trust Mode"
                    value={config.security.trustMode}
                    onChange={(value: string | null) =>
                        onUpdate({
                            security: {
                                ...config.security,
                                trustMode: (value || 'open') as Config['security']['trustMode'],
                            },
                        })
                    }
                    data={[
                        { value: 'open', label: 'Open (anyone can join)' },
                        { value: 'local', label: 'Local Network Only' },
                        { value: 'whitelist', label: 'Whitelist Only' },
                    ]}
                />

                {config.security.trustMode === 'whitelist' && (
                    <Textarea
                        label="Peer Whitelist"
                        description="Comma-separated peer IDs"
                        placeholder="peer1, peer2, peer3"
                        value={config.security.whitelist.join(', ')}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleWhitelistChange(e.currentTarget.value)}
                        minRows={3}
                    />
                )}

                <Checkbox
                    id="require-integrity"
                    label="Require Integrity Verification (SHA-256)"
                    checked={config.security.requireIntegrity}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onUpdate({
                            security: {
                                ...config.security,
                                requireIntegrity: e.currentTarget.checked,
                            },
                        })
                    }
                />

                <Checkbox
                    id="energy-aware"
                    label="Enable Energy-Aware Scheduling"
                    checked={config.security.energyAware}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onUpdate({
                            security: {
                                ...config.security,
                                energyAware: e.currentTarget.checked,
                            },
                        })
                    }
                />
            </Stack>
        </Card>
    );
}
