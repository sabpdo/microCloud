import { useState, useEffect } from 'react';
import {
    Card,
    Title,
    Text,
    Stack,
    NumberInput,
    Select,
    Button,
    Progress,
    Alert,
    Paper,
    SimpleGrid,
    Badge,
    Group,
    Code,
} from '@mantine/core';
import { toast } from 'sonner';

interface SimulationConfig {
    numPeers: number;
    targetFile: string;
    duration: number;
    requestInterval: number;
    churnRate: number;
}

interface SimulationResults {
    totalRequests: number;
    peerRequests: number;
    originRequests: number;
    cacheHitRatio: number;
    bandwidthSaved: number;
    avgLatency: number;
    latencyImprovement: number;
    jainFairnessIndex: number;
    recoverySpeed?: number;
    peersSimulated: number;
    duration: number;
}

export function SimulationControl() {
    const [config, setConfig] = useState<SimulationConfig>({
        numPeers: 20,
        targetFile: '/sample.txt',
        duration: 30,
        requestInterval: 100,
        churnRate: 0,
    });

    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<SimulationResults | null>(null);
    const [availableFiles, setAvailableFiles] = useState<string[]>([]);

    // Fetch available files on mount
    useEffect(() => {
        fetch('/api/files')
            .then((res) => res.json())
            .then((data) => {
                if (data.files) {
                    setAvailableFiles(data.files);
                }
            })
            .catch((error) => {
                console.error('Error fetching available files:', error);
            });
    }, []);

    const runSimulation = async () => {
        setRunning(true);
        setProgress(0);
        setResults(null);
        toast.info('Starting flash crowd simulation...');

        try {
            // Simulate progress updates
            const progressInterval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return prev;
                    }
                    return prev + 5;
                });
            }, 500);

            const response = await fetch('/api/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });

            clearInterval(progressInterval);
            setProgress(100);

            if (!response.ok) {
                throw new Error('Simulation failed');
            }

            const data = await response.json();
            setResults(data.results);
            toast.success('Simulation completed!');
        } catch (error) {
            console.error('Simulation error:', error);
            toast.error('Simulation failed. Check server logs.');
        } finally {
            setRunning(false);
            setProgress(0);
        }
    };

    return (
        <Stack gap="xl">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={2} mb="xs" c="blue">
                    Flash Crowd Simulation
                </Title>
                <Text size="sm" c="dimmed" mb="md">
                    Simulate multiple peers making simultaneous requests to test cache
                    performance under load. Peers have varied latency, bandwidth, and
                    uptime characteristics.
                </Text>

                {availableFiles.length > 0 && (
                    <Alert color="blue" mb="lg">
                        <Text size="sm" fw={500} mb="xs">
                            Available files for simulation:
                        </Text>
                        <Group gap="xs">
                            {availableFiles.map((file) => (
                                <Code key={file}>
                                    {file}
                                </Code>
                            ))}
                        </Group>
                    </Alert>
                )}

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
                    <NumberInput
                        label="Number of Peers"
                        description="20-100 peers recommended"
                        value={config.numPeers}
                        onChange={(value) =>
                            setConfig({ ...config, numPeers: Number(value) || 20 })
                        }
                        min={1}
                        max={100}
                        disabled={running}
                    />

                    <Select
                        label="Target File"
                        description="Select a file to request during simulation"
                        value={config.targetFile}
                        onChange={(value) =>
                            setConfig({ ...config, targetFile: value || '/sample.txt' })
                        }
                        data={availableFiles.length > 0 ? availableFiles : ['/sample.txt']}
                        disabled={running}
                        searchable
                        allowDeselect={false}
                    />

                    <NumberInput
                        label="Duration (seconds)"
                        description="How long to run simulation"
                        value={config.duration}
                        onChange={(value) =>
                            setConfig({ ...config, duration: Number(value) || 30 })
                        }
                        min={5}
                        max={300}
                        disabled={running}
                    />

                    <NumberInput
                        label="Request Interval (ms)"
                        description="Time between requests"
                        value={config.requestInterval}
                        onChange={(value) =>
                            setConfig({ ...config, requestInterval: Number(value) || 100 })
                        }
                        min={10}
                        max={1000}
                        disabled={running}
                    />

                    <NumberInput
                        label="Churn Rate (0-1)"
                        description="Probability of peer leaving per cycle (0 = stable, 0.1 = high churn)"
                        value={config.churnRate}
                        onChange={(value) =>
                            setConfig({ ...config, churnRate: Number(value) || 0 })
                        }
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={running}
                    />
                </SimpleGrid>

                {running && (
                    <Alert color="blue" mb="md">
                        <Text size="sm" mb="xs">
                            Simulation running... {progress}%
                        </Text>
                        <Progress value={progress} size="sm" />
                    </Alert>
                )}

                <Button
                    onClick={runSimulation}
                    disabled={running}
                    size="lg"
                    fullWidth
                    color="blue"
                >
                    {running ? 'Running Simulation...' : 'Start Flash Crowd Simulation'}
                </Button>
            </Card>

            {results && (
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                    <Title order={2} mb="md" c="green">
                        Simulation Results
                    </Title>

                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Cache Hit Ratio
                            </Text>
                            <Text fw={700} size="xl" c="green">
                                {results.cacheHitRatio.toFixed(2)}%
                            </Text>
                        </Paper>

                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Bandwidth Saved
                            </Text>
                            <Text fw={700} size="xl" c="blue">
                                {results.bandwidthSaved.toFixed(2)}%
                            </Text>
                        </Paper>

                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Total Requests
                            </Text>
                            <Text fw={700} size="xl">
                                {results.totalRequests}
                            </Text>
                        </Paper>

                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Peer Requests (Hits)
                            </Text>
                            <Text fw={700} size="xl" c="green">
                                {results.peerRequests}
                            </Text>
                        </Paper>

                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Origin Requests (Misses)
                            </Text>
                            <Text fw={700} size="xl" c="red">
                                {results.originRequests}
                            </Text>
                        </Paper>

                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Average Latency
                            </Text>
                            <Text fw={700} size="xl">
                                {results.avgLatency.toFixed(0)}ms
                            </Text>
                        </Paper>

                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Latency Improvement
                            </Text>
                            <Text fw={700} size="xl" c="green">
                                {results.latencyImprovement.toFixed(1)}%
                            </Text>
                        </Paper>

                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Jain's Fairness Index
                            </Text>
                            <Text fw={700} size="xl">
                                {results.jainFairnessIndex.toFixed(3)}
                            </Text>
                            <Badge
                                color={
                                    results.jainFairnessIndex > 0.8
                                        ? 'green'
                                        : results.jainFairnessIndex > 0.5
                                            ? 'yellow'
                                            : 'red'
                                }
                                size="sm"
                                mt="xs"
                            >
                                {results.jainFairnessIndex > 0.8
                                    ? 'Fair'
                                    : results.jainFairnessIndex > 0.5
                                        ? 'Moderate'
                                        : 'Unfair'}
                            </Badge>
                        </Paper>

                        {results.recoverySpeed !== undefined && (
                            <Paper p="md" withBorder>
                                <Text size="xs" c="dimmed">
                                    Recovery Speed
                                </Text>
                                <Text fw={700} size="xl">
                                    {results.recoverySpeed.toFixed(1)} req/s
                                </Text>
                            </Paper>
                        )}

                        <Paper p="md" withBorder>
                            <Text size="xs" c="dimmed">
                                Simulation Duration
                            </Text>
                            <Text fw={700} size="xl">
                                {results.duration.toFixed(1)}s
                            </Text>
                        </Paper>
                    </SimpleGrid>
                </Card>
            )}
        </Stack>
    );
}

