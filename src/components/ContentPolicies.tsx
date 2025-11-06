import { Card, Title, Text, SimpleGrid, Checkbox, Stack, MultiSelect } from '@mantine/core';
import { Config } from '../types';

interface ContentPoliciesProps {
    config: Config;
    onUpdate: (updates: Partial<Config>) => void;
}

const contentTypes = [
    { id: 'video', label: 'Prioritize Video Content' },
    { id: 'images', label: 'Prioritize Images' },
    { id: 'json', label: 'Prioritize JSON/Data Files' },
    { id: 'text', label: 'Prioritize Text Documents' },
];

export function ContentPolicies({
    config,
    onUpdate,
}: ContentPoliciesProps) {
    const handlePolicyChange = (
        key: keyof Config['contentPolicies'],
        value: boolean
    ) => {
        onUpdate({
            contentPolicies: {
                ...config.contentPolicies,
                [key]: value,
            },
        });
    };

    const handlePreferencesChange = (values: string[]) => {
        const limited = values.slice(0, 2);
        onUpdate({
            preferences: {
                ...config.preferences,
                selected: limited,
            },
        });
    };

    const preferenceOptions = [
        { value: 'bandwidth', label: 'Bandwidth' },
        { value: 'uptime', label: 'Uptime' },
        { value: 'success', label: 'Upload Success Rate' },
        { value: 'storage', label: 'Storage' },
    ];

    return (
        <Stack gap="xl">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={2} mb="xs" c="blue">
                    Content Caching Policies
                </Title>
                <Text size="sm" c="dimmed" mb="lg">
                    Select which content types should be prioritized for caching and sharing with nearby peers.
                    This helps reduce server load and improve performance for popular content.
                </Text>

                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                    {contentTypes.map((type) => (
                        <Checkbox
                            key={type.id}
                            id={`policy-${type.id}`}
                            label={type.label}
                            checked={config.contentPolicies[type.id as keyof Config['contentPolicies']]}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                handlePolicyChange(
                                    type.id as keyof Config['contentPolicies'],
                                    e.currentTarget.checked
                                )
                            }
                        />
                    ))}
                </SimpleGrid>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="xs">
                    Peer Selection Preferences (Optional)
                </Title>
                <Text size="sm" c="dimmed" mb="md">
                    Choose up to two attributes to prioritize when selecting peers.
                    These guide the system towards peers with your preferred characteristics.
                </Text>

                <MultiSelect
                    label="Preferred attributes"
                    placeholder="Select up to 2"
                    data={preferenceOptions}
                    value={config.preferences.selected}
                    onChange={handlePreferencesChange}
                    searchable
                    clearable
                    maxValues={2}
                />

                <Text size="xs" c="dimmed" mt="sm">
                    Options: Bandwidth, Uptime, Upload Success Rate, Storage. Maximum 2 selections.
                </Text>
            </Card>
        </Stack>
    );
}
