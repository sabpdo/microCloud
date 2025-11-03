import { Card, Title, Text, SimpleGrid, Checkbox } from '@mantine/core';
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

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={2} mb="xs" c="blue">
                Content-Specific Policies
            </Title>
            <Text size="sm" c="dimmed" mb="lg">
                Prioritize certain content types for caching and peer distribution.
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
    );
}
