import { useState } from 'react';
import { Card, Button, Group, FileButton, Modal, Text } from '@mantine/core';

interface ActionButtonsProps {
    onSave: () => void;
    onReset: () => void;
    onExport: () => void;
    onImport: (file: File) => void;
}

export function ActionButtons({
    onSave,
    onReset,
    onExport,
    onImport,
}: ActionButtonsProps) {
    const [resetModalOpened, setResetModalOpened] = useState(false);

    const handleFileChange = (file: File | null) => {
        if (file) {
            onImport(file);
        }
    };

    const handleReset = () => {
        setResetModalOpened(false);
        onReset();
    };

    return (
        <>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Group justify="center" gap="md">
                    <Button onClick={onSave} color="blue">
                        Save Configuration
                    </Button>
                    <Button onClick={() => setResetModalOpened(true)} color="gray">
                        Reset to Defaults
                    </Button>
                    <Button onClick={onExport} variant="outline" color="blue">
                        Export Config
                    </Button>
                    <FileButton
                        onChange={handleFileChange}
                        accept=".json"
                    >
                        {(props: React.ComponentPropsWithoutRef<'button'>) => (
                            <Button {...props} variant="outline" color="blue">
                                Import Config
                            </Button>
                        )}
                    </FileButton>
                </Group>
            </Card>

            <Modal
                opened={resetModalOpened}
                onClose={() => setResetModalOpened(false)}
                title="Reset Configuration"
                centered
            >
                <Text mb="lg">
                    Are you sure you want to reset all settings to defaults? This action
                    cannot be undone.
                </Text>
                <Group justify="flex-end">
                    <Button variant="outline" onClick={() => setResetModalOpened(false)}>
                        Cancel
                    </Button>
                    <Button color="red" onClick={handleReset}>
                        Reset
                    </Button>
                </Group>
            </Modal>
        </>
    );
}
