import { Slider, Text, Stack, Group } from '@mantine/core';

interface SliderControlProps {
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}

export function SliderControl({
    id,
    label,
    value,
    min,
    max,
    step,
    onChange,
}: SliderControlProps) {
    return (
        <Stack gap="xs">
            <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>
                    {label}
                </Text>
                <Text
                    size="sm"
                    fw={700}
                    px="md"
                    py={4}
                    style={{
                        borderRadius: '20px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        minWidth: '50px',
                        textAlign: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                >
                    {value.toFixed(1)}
                </Text>
            </Group>
            <Slider
                id={id}
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={onChange}
                marks={[
                    { value: min, label: min.toFixed(1) },
                    { value: max, label: max.toFixed(1) },
                ]}
            />
        </Stack>
    );
}
