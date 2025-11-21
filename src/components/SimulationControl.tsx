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
  TextInput,
  SegmentedControl,
  Switch,
  ScrollArea,
  Divider,
  List,
} from '@mantine/core';
import { toast } from 'sonner';

interface SimulationConfig {
  numPeers: number;
  targetFile: string;
  duration: number;
  requestInterval: number;
  churnRate: number;
  flashCrowd: boolean;
  joinRate: number;
  anchorSignalingLatency: number;
}

interface PeerJoinEvent {
  peerId: string;
  timestamp: number;
  joinedViaAnchor?: string;
}

interface FileTransferEvent {
  fromPeer: string;
  toPeer: string;
  fileHash: string;
  timestamp: number;
  successful: boolean;
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
  peerJoinEvents: PeerJoinEvent[];
  fileTransferEvents: FileTransferEvent[];
  anchorNodes: string[];
  filePropagationTime?: number;
}

export function SimulationControl() {
  const [config, setConfig] = useState<SimulationConfig>({
    numPeers: 20,
    targetFile: '/sample.txt',
    duration: 30,
    requestInterval: 100,
    churnRate: 0,
    flashCrowd: false,
    joinRate: 2,
    anchorSignalingLatency: 100,
  });

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [targetType, setTargetType] = useState<'file' | 'url'>('file');
  const [customUrl, setCustomUrl] = useState<string>('');

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
    // Validate URL if using custom URL
    if (targetType === 'url') {
      if (!customUrl.trim()) {
        toast.error('Please enter a valid URL');
        return;
      }
      try {
        new URL(customUrl);
      } catch (error) {
        toast.error('Please enter a valid URL (e.g., https://example.com/file.txt)');
        return;
      }
    }

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

      // Use custom URL if provided, otherwise use selected file
      const target = targetType === 'url' ? customUrl.trim() : config.targetFile;

      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          targetFile: target,
        }),
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
          Simulate multiple peers making simultaneous requests to test cache performance under load.
          Peers have varied latency, bandwidth, and uptime characteristics.
        </Text>

        {availableFiles.length > 0 && (
          <Alert color="blue" mb="lg">
            <Text size="sm" fw={500} mb="xs">
              Available files for simulation:
            </Text>
            <Group gap="xs">
              {availableFiles.map((file) => (
                <Code key={file}>{file}</Code>
              ))}
            </Group>
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
          <NumberInput
            label="Number of Peers"
            description="20-100 peers recommended"
            value={config.numPeers}
            onChange={(value) => setConfig({ ...config, numPeers: Number(value) || 20 })}
            min={1}
            max={100}
            disabled={running}
          />

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Target Resource
            </Text>
            <SegmentedControl
              value={targetType}
              onChange={(value) => setTargetType(value as 'file' | 'url')}
              data={[
                { label: 'Local File', value: 'file' },
                { label: 'Custom URL', value: 'url' },
              ]}
              disabled={running}
              fullWidth
            />
            {targetType === 'file' ? (
              <Select
                label="Target File"
                description="Select a file to request during simulation"
                value={config.targetFile}
                onChange={(value) => setConfig({ ...config, targetFile: value || '/sample.txt' })}
                data={availableFiles.length > 0 ? availableFiles : ['/sample.txt']}
                disabled={running}
                searchable
                allowDeselect={false}
              />
            ) : (
              <TextInput
                label="Target URL"
                description="Enter a full URL to fetch (e.g., https://example.com/file.txt)"
                placeholder="https://example.com/path/to/file.txt"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={running}
              />
            )}
          </Stack>

          <NumberInput
            label="Duration (seconds)"
            description="How long to run simulation"
            value={config.duration}
            onChange={(value) => setConfig({ ...config, duration: Number(value) || 30 })}
            min={5}
            max={300}
            disabled={running}
          />

          <NumberInput
            label="Request Interval (ms)"
            description="Time between requests"
            value={config.requestInterval}
            onChange={(value) => setConfig({ ...config, requestInterval: Number(value) || 100 })}
            min={10}
            max={1000}
            disabled={running}
          />

          <NumberInput
            label="Churn Rate (0-1)"
            description="Probability of peer leaving per cycle (0 = stable, 0.1 = high churn)"
            value={config.churnRate}
            onChange={(value) => setConfig({ ...config, churnRate: Number(value) || 0 })}
            min={0}
            max={1}
            step={0.01}
            disabled={running}
          />

          <Switch
            label="Flash Crowd Mode"
            description="Peers join over time instead of all at once"
            checked={config.flashCrowd}
            onChange={(event) => setConfig({ ...config, flashCrowd: event.currentTarget.checked })}
            disabled={running}
          />

          {config.flashCrowd && (
            <>
              <NumberInput
                label="Join Rate (peers/second)"
                description="How many peers join per second in flash crowd mode"
                value={config.joinRate}
                onChange={(value) => setConfig({ ...config, joinRate: Number(value) || 2 })}
                min={0.1}
                max={10}
                step={0.1}
                disabled={running}
              />
              <NumberInput
                label="Anchor Signaling Latency (ms)"
                description="Constant latency for joining via anchor node"
                value={config.anchorSignalingLatency}
                onChange={(value) =>
                  setConfig({ ...config, anchorSignalingLatency: Number(value) || 100 })
                }
                min={50}
                max={500}
                disabled={running}
              />
            </>
          )}
        </SimpleGrid>

        {running && (
          <Alert color="blue" mb="md">
            <Text size="sm" mb="xs">
              Simulation running... {progress}%
            </Text>
            <Progress value={progress} size="sm" />
          </Alert>
        )}

        <Button onClick={runSimulation} disabled={running} size="lg" fullWidth color="blue">
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

            {results.filePropagationTime !== undefined && (
              <Paper p="md" withBorder>
                <Text size="xs" c="dimmed">
                  File Propagation Time
                </Text>
                <Text fw={700} size="xl">
                  {(results.filePropagationTime / 1000).toFixed(2)}s
                </Text>
              </Paper>
            )}
          </SimpleGrid>

          <Divider my="lg" />

          {/* Anchor Nodes */}
          {results.anchorNodes.length > 0 && (
            <Card shadow="sm" padding="md" radius="md" withBorder mb="lg">
              <Title order={3} mb="md" c="blue">
                Anchor Nodes ({results.anchorNodes.length})
              </Title>
              <Group gap="xs">
                {results.anchorNodes.map((anchorId) => (
                  <Badge key={anchorId} color="blue" size="lg" variant="light">
                    {anchorId}
                  </Badge>
                ))}
              </Group>
              <Text size="sm" c="dimmed" mt="xs">
                Anchor nodes host signaling servers and help new peers join the network
              </Text>
            </Card>
          )}

          {/* Peer Join Timeline */}
          {results.peerJoinEvents.length > 0 && (
            <Card shadow="sm" padding="md" radius="md" withBorder mb="lg">
              <Title order={3} mb="md" c="green">
                Peer Join Events ({results.peerJoinEvents.length})
              </Title>
              <ScrollArea h={300}>
                <List spacing="xs" size="sm">
                  {results.peerJoinEvents.slice(0, 50).map((event, idx) => {
                    const relativeTime =
                      event.timestamp - (results.peerJoinEvents[0]?.timestamp || event.timestamp);
                    return (
                      <List.Item
                        key={idx}
                        icon={
                          <Badge size="sm" variant="light">
                            {idx + 1}
                          </Badge>
                        }
                      >
                        <Group gap="xs" wrap="nowrap">
                          <Text size="sm" fw={500}>
                            {event.peerId}
                          </Text>
                          <Text size="sm" c="dimmed">
                            joined at {(relativeTime / 1000).toFixed(2)}s
                          </Text>
                          {event.joinedViaAnchor && (
                            <Badge color="blue" variant="light" size="xs">
                              via {event.joinedViaAnchor}
                            </Badge>
                          )}
                        </Group>
                      </List.Item>
                    );
                  })}
                  {results.peerJoinEvents.length > 50 && (
                    <List.Item>
                      <Text size="sm" c="dimmed">
                        ... and {results.peerJoinEvents.length - 50} more events
                      </Text>
                    </List.Item>
                  )}
                </List>
              </ScrollArea>
            </Card>
          )}

          {/* File Transfer Events */}
          {results.fileTransferEvents.length > 0 && (
            <Card shadow="sm" padding="md" radius="md" withBorder>
              <Title order={3} mb="md" c="orange">
                File Transfers ({results.fileTransferEvents.length})
              </Title>
              <Text size="sm" c="dimmed" mb="md">
                Successful: {results.fileTransferEvents.filter((e) => e.successful).length} |
                Failed: {results.fileTransferEvents.filter((e) => !e.successful).length}
              </Text>
              <ScrollArea h={300}>
                <Stack gap="xs">
                  {results.fileTransferEvents.slice(0, 100).map((event, idx) => {
                    const relativeTime =
                      event.timestamp -
                      (results.fileTransferEvents[0]?.timestamp || event.timestamp);
                    return (
                      <Paper key={idx} p="xs" withBorder>
                        <Group justify="space-between">
                          <Text size="sm" fw={500}>
                            {event.fromPeer} → {event.toPeer}
                          </Text>
                          <Badge
                            color={event.successful ? 'green' : 'red'}
                            variant="light"
                            size="sm"
                          >
                            {event.successful ? '✓' : '✗'}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {(relativeTime / 1000).toFixed(2)}s | {event.fileHash.substring(0, 8)}
                        </Text>
                      </Paper>
                    );
                  })}
                  {results.fileTransferEvents.length > 100 && (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      {results.fileTransferEvents.length - 100} more transfers...
                    </Text>
                  )}
                </Stack>
              </ScrollArea>
            </Card>
          )}
        </Card>
      )}
    </Stack>
  );
}
