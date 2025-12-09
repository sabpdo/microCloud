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
  requestInterval?: number; // DEPRECATED: use requestProbability instead
  requestProbability?: number; // Probability per second (0-1)
  churnRate: number;
  flashCrowd: boolean;
  joinRate: number;
  anchorSignalingLatency: number;
  churnMode?: 'leaving' | 'joining' | 'mixed';
  deviceHeterogeneity?: {
    latencyMin?: number;
    latencyMax?: number;
    bandwidthMin?: number;
    bandwidthMax?: number;
  };
  fileSizeBytes?: number;
  baselineMode?: boolean;
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
  localCacheHits?: number; // requests served from local cache (peer already had file)
  networkRequests?: number; // peerRequests + originRequests (excludes local cache - for fair comparison)
  cacheHitRatio: number; // includes local cache
  networkCacheHitRatio?: number; // peerRequests / networkRequests (P2P effectiveness, excludes local cache)
  bandwidthSaved: number;
  avgLatency: number; // includes all requests
  networkAvgLatency?: number; // average latency of network requests only (excludes local cache)
  latencyImprovement: number;
  jainFairnessIndex: number;
  recoverySpeed?: number;
  peersSimulated: number;
  duration: number;
  peerJoinEvents: PeerJoinEvent[];
  fileTransferEvents: FileTransferEvent[];
  anchorNodes: string[];
  filePropagationTime?: number;
  propagationMetrics?: {
    timeTo50Percent: number;
    timeTo90Percent: number;
    timeTo100Percent: number;
    avgTimeToReceive: number;
    propagationRate: number;
    timeToFirstP2P: number;
    originLoadReduction: number;
  };
  latencyByNodeType?: {
    anchor: {
      avgLatency: number;
      p5: number;
      p50: number;
      p95: number;
      p99: number;
      requestCount: number;
    };
    transient: {
      avgLatency: number;
      p5: number;
      p50: number;
      p95: number;
      p99: number;
      requestCount: number;
    };
  };
  chunkFailureMetrics?: {
    totalChunkTransfers: number;
    chunkFailures: number;
    chunkFailureRate: number;
    avgChunksPerFile: number;
  };
  latencyPercentiles?: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  worstCaseMetrics?: {
    p99Latency: number;
    worstPerformingPeer?: {
      id: string;
      latency: number;
      bandwidth: number;
      tier: 'low' | 'medium' | 'high';
      isAnchor: boolean;
      p99Latency: number;
    };
  };
  allRequestMetrics?: Array<{
    timestamp: number;
    latency: number;
    source: 'local-cache' | 'peer-cache' | 'origin';
    peerId: string;
    peerBandwidthTier: 'low' | 'medium' | 'high';
    successful: boolean;
    isAnchor: boolean;
  }>;
}

export function SimulationControl() {
  const [config, setConfig] = useState<SimulationConfig>({
    numPeers: 20,
    targetFile: '/sample.txt',
    duration: 30,
    requestProbability: 0.5, // 50% chance per second
    churnRate: 0,
    flashCrowd: false,
    joinRate: 2,
    anchorSignalingLatency: 100,
    churnMode: 'mixed',
    deviceHeterogeneity: {
      latencyMin: 10,
      latencyMax: 250,
      bandwidthMin: 10,
      bandwidthMax: 100,
    },
  });

  const [simulationName, setSimulationName] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [baselineResults, setBaselineResults] = useState<SimulationResults | null>(null);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [fileInfo, setFileInfo] = useState<Array<{ path: string; size: number; chunks: number }>>([]);
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
        if (data.fileInfo) {
          setFileInfo(data.fileInfo);
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
    setBaselineResults(null);
    toast.info('Starting flash crowd simulation with baseline comparison...');

    try {
      // Use custom URL if provided, otherwise use selected file
      const target = targetType === 'url' ? customUrl.trim() : config.targetFile;

      // Calculate progress based on estimated simulation time
      // Each simulation takes approximately: duration + overhead (network, processing)
      const estimatedSimulationTime = config.duration + 2; // seconds per simulation
      const progressUpdateInterval = 100; // Update every 100ms for smooth progress
      
      // Progress tracking: 0-45% for first simulation, 45-90% for second, 90-100% for completion
      let currentDecimalProgress = 0; // Track decimal progress to avoid rounding errors
      
      const startProgressTracking = (startPercent: number, endPercent: number, duration: number, intervalRef: { current: NodeJS.Timeout | null }) => {
        const range = endPercent - startPercent;
        const totalUpdates = Math.ceil((duration * 1000) / progressUpdateInterval);
        const progressPerUpdate = range / totalUpdates;
        
        // Reset current progress to start
        currentDecimalProgress = startPercent;
        
        const interval = setInterval(() => {
          currentDecimalProgress = Math.min(currentDecimalProgress + progressPerUpdate, endPercent);
          setProgress(Math.round(currentDecimalProgress));
          
          if (currentDecimalProgress >= endPercent) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }
        }, progressUpdateInterval);
        
        intervalRef.current = interval;
        return interval;
      };

      const intervalRef = { current: null as NodeJS.Timeout | null };

      // Start progress tracking for first simulation (0-45%)
      startProgressTracking(0, 45, estimatedSimulationTime, intervalRef);

      // Run µCloud simulation
      toast.info('Running µCloud simulation...');
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          targetFile: target,
          baselineMode: false,
        }),
      });

      if (!response.ok) {
        throw new Error('µCloud simulation failed');
      }

      const data = await response.json();
      setResults(data.results);
      
      // Clear first progress interval and start second (45-90%)
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setProgress(45);
      startProgressTracking(45, 90, estimatedSimulationTime, intervalRef);

      // Run baseline simulation (origin-only) with same config
      toast.info('Running baseline (origin-only) simulation...');
      const baselineResponse = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          targetFile: target,
          baselineMode: true, // This disables P2P and only uses origin
        }),
      });

      if (!baselineResponse.ok) {
        throw new Error('Baseline simulation failed');
      }

      const baselineData = await baselineResponse.json();
      setBaselineResults(baselineData.results);

      // Complete progress
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setProgress(100);
      toast.success('Both simulations completed!');
    } catch (error) {
      console.error('Simulation error:', error);
      toast.error('Simulation failed. Check server logs.');
    } finally {
      setRunning(false);
      setProgress(0);
    }
  };

  const loadSimulationResults = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const loadedData = JSON.parse(content);

        // Validate the structure
        if (!loadedData.results || !loadedData.results.microcloud || !loadedData.results.baseline) {
          toast.error('Invalid simulation results file. Missing required data.');
          return;
        }

        // Load the results
        setResults(loadedData.results.microcloud);
        setBaselineResults(loadedData.results.baseline);
        
        // Load the configuration if available
        if (loadedData.configuration) {
          const loadedConfig = loadedData.configuration;
          setConfig(loadedConfig);
          
          // Handle targetType separately since it's stored in separate state
          if (loadedConfig.targetType) {
            setTargetType(loadedConfig.targetType);
            if (loadedConfig.targetType === 'url') {
              setCustomUrl(loadedConfig.targetFile || '');
            }
          }
        }
        
        // Load the simulation name if available
        if (loadedData.metadata?.simulationName) {
          setSimulationName(loadedData.metadata.simulationName);
        }

        toast.success(`Loaded simulation results: ${loadedData.metadata?.simulationName || 'Unnamed'}`);
      } catch (error) {
        console.error('Error loading simulation results:', error);
        toast.error('Failed to load simulation results file. Please check the file format.');
      }
    };

    reader.onerror = () => {
      toast.error('Error reading file.');
    };

    reader.readAsText(file);
    
    // Reset the input so the same file can be loaded again
    event.target.value = '';
  };

  const exportSimulationResults = () => {
    if (!results || !baselineResults) {
      toast.error('No simulation results to export. Please run a simulation first.');
      return;
    }

    const exportData = {
      metadata: {
        simulationName: simulationName || `simulation-${new Date().toISOString().replace(/[:.]/g, '-')}`,
        exportDate: new Date().toISOString(),
        exportVersion: '1.0',
      },
      configuration: {
        ...config,
        targetFile: targetType === 'url' ? customUrl : config.targetFile,
        targetType,
      },
      results: {
        microcloud: results,
        baseline: baselineResults,
        comparison: {
          latencyImprovement: {
            average: baselineResults.avgLatency > 0 
              ? ((baselineResults.avgLatency - results.avgLatency) / baselineResults.avgLatency * 100).toFixed(2) + '%'
              : 'N/A',
            p50: results.latencyPercentiles && baselineResults.latencyPercentiles
              ? ((baselineResults.latencyPercentiles.p50 - results.latencyPercentiles.p50) / baselineResults.latencyPercentiles.p50 * 100).toFixed(2) + '%'
              : 'N/A',
            p95: results.latencyPercentiles && baselineResults.latencyPercentiles
              ? ((baselineResults.latencyPercentiles.p95 - results.latencyPercentiles.p95) / baselineResults.latencyPercentiles.p95 * 100).toFixed(2) + '%'
              : 'N/A',
            p99: results.latencyByNodeType && baselineResults.latencyByNodeType
              ? {
                  anchor: ((baselineResults.latencyByNodeType.anchor.p99 - results.latencyByNodeType.anchor.p99) / baselineResults.latencyByNodeType.anchor.p99 * 100).toFixed(2) + '%',
                  transient: ((baselineResults.latencyByNodeType.transient.p99 - results.latencyByNodeType.transient.p99) / baselineResults.latencyByNodeType.transient.p99 * 100).toFixed(2) + '%',
                }
              : 'N/A',
          },
          cacheHitRatio: {
            microcloud: results.cacheHitRatio.toFixed(2) + '%',
            baseline: baselineResults.cacheHitRatio.toFixed(2) + '%',
          },
          originLoadReduction: results.propagationMetrics
            ? results.propagationMetrics.originLoadReduction.toFixed(2) + '%'
            : 'N/A',
        },
      },
      detailedEvents: {
        microcloud: {
          fileTransfers: results.fileTransferEvents || [],
          peerJoins: results.peerJoinEvents || [],
          requestMetrics: results.allRequestMetrics || [],
          chunkFailures: results.chunkFailureMetrics || null,
        },
        baseline: {
          fileTransfers: baselineResults.fileTransferEvents || [],
          peerJoins: baselineResults.peerJoinEvents || [],
          requestMetrics: baselineResults.allRequestMetrics || [],
          chunkFailures: baselineResults.chunkFailureMetrics || null,
        },
      },
      failureAnalysis: {
        microcloud: {
          totalFailures: results.fileTransferEvents?.filter(e => !e.successful).length || 0,
          failureRate: results.fileTransferEvents?.length > 0
            ? ((results.fileTransferEvents.filter(e => !e.successful).length / results.fileTransferEvents.length) * 100).toFixed(2) + '%'
            : '0%',
          chunkFailures: results.chunkFailureMetrics?.chunkFailures || 0,
          chunkFailureRate: results.chunkFailureMetrics?.chunkFailureRate.toFixed(2) + '%' || '0%',
          requestFailures: results.allRequestMetrics?.filter(m => !m.successful).length || 0,
        },
        baseline: {
          totalFailures: baselineResults.fileTransferEvents?.filter(e => !e.successful).length || 0,
          failureRate: baselineResults.fileTransferEvents?.length > 0
            ? ((baselineResults.fileTransferEvents.filter(e => !e.successful).length / baselineResults.fileTransferEvents.length) * 100).toFixed(2) + '%'
            : '0%',
          requestFailures: baselineResults.allRequestMetrics?.filter(m => !m.successful).length || 0,
        },
      },
      connectionAnalysis: {
        microcloud: {
          totalConnections: results.fileTransferEvents?.length || 0,
          successfulConnections: results.fileTransferEvents?.filter(e => e.successful).length || 0,
          uniquePeerConnections: results.fileTransferEvents 
            ? new Set([
                ...results.fileTransferEvents.map(e => e.fromPeer),
                ...results.fileTransferEvents.map(e => e.toPeer)
              ]).size
            : 0,
          peerJoins: results.peerJoinEvents?.length || 0,
          joinsViaAnchor: results.peerJoinEvents?.filter(e => e.joinedViaAnchor).length || 0,
          connectionSuccessRate: results.fileTransferEvents?.length > 0
            ? ((results.fileTransferEvents.filter(e => e.successful).length / results.fileTransferEvents.length) * 100).toFixed(2) + '%'
            : '0%',
        },
        baseline: {
          totalConnections: baselineResults.fileTransferEvents?.length || 0,
          successfulConnections: baselineResults.fileTransferEvents?.filter(e => e.successful).length || 0,
          peerJoins: baselineResults.peerJoinEvents?.length || 0,
          connectionSuccessRate: baselineResults.fileTransferEvents?.length > 0
            ? ((baselineResults.fileTransferEvents.filter(e => e.successful).length / baselineResults.fileTransferEvents.length) * 100).toFixed(2) + '%'
            : '0%',
        },
      },
    };

    // Create and download JSON file
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportData.metadata.simulationName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Simulation results exported as ${exportData.metadata.simulationName}.json`);
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

        <TextInput
          label="Simulation Name"
          description="Optional name for this simulation (used in export filename)"
          value={simulationName}
          onChange={(e) => setSimulationName(e.target.value)}
          placeholder="e.g., flash-crowd-150-peers"
          disabled={running}
          mb="md"
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
          <NumberInput
            label="Number of Peers"
            description="Maximum number of peers that can exist at any time. When peers leave due to churn, they don't rejoin. 20-100 peers recommended for normal tests, up to 500 for stress tests"
            value={config.numPeers}
            onChange={(value) => setConfig({ ...config, numPeers: Number(value) || 20 })}
            min={1}
            max={500}
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
              <Stack gap="xs">
              <Select
                label="Target File"
                description="Select a file to request during simulation"
                value={config.targetFile}
                onChange={(value) => setConfig({ ...config, targetFile: value || '/sample.txt' })}
                  data={availableFiles.length > 0 ? availableFiles.map(f => ({
                    value: f,
                    label: f + (fileInfo.find(info => info.path === f) 
                      ? ` (${(fileInfo.find(info => info.path === f)!.size / 1024).toFixed(1)}KB, ~${fileInfo.find(info => info.path === f)!.chunks} chunks)`
                      : '')
                  })) : [{ value: '/sample.txt', label: '/sample.txt' }]}
                disabled={running}
                searchable
                allowDeselect={false}
              />
                {(() => {
                  const selectedFileInfo = fileInfo.find(info => info.path === config.targetFile);
                  if (selectedFileInfo && selectedFileInfo.chunks > 1) {
                    return (
                      <Alert color="blue">
                        <Text size="xs">
                          This file will be transferred in <strong>{selectedFileInfo.chunks} chunks</strong> ({selectedFileInfo.chunks > 1 ? 'chunk failures possible' : 'single chunk'})
                        </Text>
                      </Alert>
                    );
                  }
                  return null;
                })()}
              </Stack>
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
            label="Request Probability (per second)"
            description="Probability of making a request each second (0-1). 0.5 = 50% chance per second"
            value={config.requestProbability ?? 0.5}
            onChange={(value) => setConfig({ ...config, requestProbability: Number(value) || 0.5 })}
            min={0}
            max={1}
            step={0.01}
            disabled={running}
          />

          <NumberInput
            label="Churn Rate (0-1)"
            description="Probability of peer leaving per cycle (0 = stable, 0.1 = high churn)"
            value={config.churnRate}
            onChange={(value) => {
              const newChurnRate = Number(value) || 0;
              setConfig({ 
                ...config, 
                churnRate: newChurnRate
              });
            }}
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
                description="How many peers join per second in flash crowd mode. Higher = faster spike, more server stress"
                value={config.joinRate}
                onChange={(value) => setConfig({ ...config, joinRate: Number(value) || 2 })}
                min={0.1}
                max={config.numPeers}
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

          <Select
            label="Churn Mode"
            description="How peers churn: leaving only, joining only, or mixed"
            value={config.churnMode ?? 'mixed'}
            onChange={(value) => setConfig({ ...config, churnMode: (value as 'leaving' | 'joining' | 'mixed') || 'mixed' })}
            data={[
              { label: 'Mixed (leaving and joining)', value: 'mixed' },
              { label: 'Leaving only', value: 'leaving' },
              { label: 'Joining only', value: 'joining' },
            ]}
            disabled={running}
          />
        </SimpleGrid>

        <Divider my="md" label="Device Heterogeneity" labelPosition="center" />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
          <NumberInput
            label="Min Latency (ms)"
            description="Minimum network latency for peers"
            value={config.deviceHeterogeneity?.latencyMin ?? 10}
            onChange={(value) => setConfig({ 
              ...config, 
              deviceHeterogeneity: { 
                ...config.deviceHeterogeneity, 
                latencyMin: Number(value) || 10 
              } 
            })}
            min={1}
            max={100}
            disabled={running}
          />

          <NumberInput
            label="Max Latency (ms)"
            description="Maximum network latency for peers"
            value={config.deviceHeterogeneity?.latencyMax ?? 250}
            onChange={(value) => setConfig({ 
              ...config, 
              deviceHeterogeneity: { 
                ...config.deviceHeterogeneity, 
                latencyMax: Number(value) || 250 
              } 
            })}
            min={50}
            max={1000}
            disabled={running}
          />

          <NumberInput
            label="Min Bandwidth (Mbps)"
            description="Minimum bandwidth for peers"
            value={config.deviceHeterogeneity?.bandwidthMin ?? 10}
            onChange={(value) => setConfig({ 
              ...config, 
              deviceHeterogeneity: { 
                ...config.deviceHeterogeneity, 
                bandwidthMin: Number(value) || 10 
              } 
            })}
            min={1}
            max={50}
            disabled={running}
          />

          <NumberInput
            label="Max Bandwidth (Mbps)"
            description="Maximum bandwidth for peers"
            value={config.deviceHeterogeneity?.bandwidthMax ?? 100}
            onChange={(value) => setConfig({ 
              ...config, 
              deviceHeterogeneity: { 
                ...config.deviceHeterogeneity, 
                bandwidthMax: Number(value) || 100 
              } 
            })}
            min={50}
            max={1000}
            disabled={running}
          />
        </SimpleGrid>

        {/* Configuration Summary */}
        <Card shadow="sm" padding="md" radius="md" withBorder mt="lg" mb="lg" style={{ backgroundColor: '#f8f9fa' }}>
          <Title order={4} mb="md" c="dimmed">
            Configuration Summary
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            <Text size="sm">
              <strong>Peers:</strong> {config.numPeers}
            </Text>
            <Text size="sm">
              <strong>Request Probability:</strong> {(config.requestProbability ?? 0.5).toFixed(2)}/s
            </Text>
            <Text size="sm">
              <strong>Duration:</strong> {config.duration}s
            </Text>
            <Text size="sm">
              <strong>Churn Rate:</strong> {config.churnRate.toFixed(2)}
            </Text>
            <Text size="sm">
              <strong>Churn Mode:</strong> {config.churnMode ?? 'mixed'}
            </Text>
            <Text size="sm">
              <strong>Flash Crowd:</strong> {config.flashCrowd ? 'Yes' : 'No'}
            </Text>
            {config.flashCrowd && (
              <Text size="sm">
                <strong>Join Rate:</strong> {config.joinRate} peers/s
              </Text>
            )}
            <Text size="sm">
              <strong>Latency Range:</strong> {config.deviceHeterogeneity?.latencyMin ?? 10}-{config.deviceHeterogeneity?.latencyMax ?? 250}ms
            </Text>
            <Text size="sm">
              <strong>Bandwidth Range:</strong> {config.deviceHeterogeneity?.bandwidthMin ?? 10}-{config.deviceHeterogeneity?.bandwidthMax ?? 100}Mbps
            </Text>
          </SimpleGrid>
        </Card>

        {running && (
          <Alert color="blue" mb="md">
            <Text size="sm" mb="xs">
              Simulation running... {progress}%
            </Text>
            <Progress value={progress} size="sm" />
          </Alert>
        )}

        <Group gap="md" grow>
          <Button onClick={runSimulation} disabled={running} size="lg" color="blue">
            {running ? 'Running Simulation...' : 'Start Flash Crowd Simulation'}
          </Button>
          <Button 
            onClick={exportSimulationResults} 
            disabled={!results || !baselineResults || running} 
            size="lg" 
            variant="outline"
            color="green"
          >
            Export Results
          </Button>
        </Group>
        
        <Divider label="or" labelPosition="center" my="md" />
        
        <Group gap="md">
          <Text size="sm" c="dimmed" style={{ flex: 1 }}>
            Load previously exported simulation results
          </Text>
          <label>
            <input
              type="file"
              accept=".json"
              onChange={loadSimulationResults}
              style={{ display: 'none' }}
            />
            <Button
              component="span"
              variant="light"
              color="blue"
              size="md"
            >
              Load Results File
            </Button>
          </label>
        </Group>
      </Card>

      {(results || baselineResults) && (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={2} mb="md" c="green">
            Simulation Results Comparison
          </Title>
          
          {results && baselineResults && (
            <>
              <Alert color="blue" mb="lg">
                <Text size="sm" fw={500} mb="xs">
                  Comparison: µCloud (P2P) vs Baseline (Origin-Only)
                </Text>
                <Text size="xs" c="dimmed">
                  Both simulations used the same configuration, request patterns, and node joining patterns.
                  The baseline shows what would happen if all requests went directly to the origin server.
                </Text>
                <Text size="xs" c="dimmed" mt="xs" fw={500}>
                  Note: Comparisons focus on network requests only (excludes local cache hits) for fair evaluation.
                  Both systems benefit equally from local caching, so we compare P2P vs Origin performance on actual network requests.
                </Text>
              </Alert>

              {/* Network-Only Comparison (Fair Comparison) */}
              <Divider my="lg" />
              <Title order={3} mb="md" c="orange">
                Network Requests Comparison (Fair Comparison)
              </Title>
              <Text size="sm" c="dimmed" mb="md">
                This comparison excludes local cache hits, which both systems benefit from equally.
                It shows the actual performance difference between P2P and origin-only for requests that need the network.
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
                <Paper p="md" withBorder style={{ backgroundColor: '#fff9e6' }}>
                  <Text size="xs" c="dimmed" mb="xs">
                    Network Avg Latency
                  </Text>
                  <Group gap="xs" align="baseline">
                    <Text fw={700} size="lg" c="green">
                      {results.networkAvgLatency?.toFixed(0) ?? results.avgLatency.toFixed(0)}ms
                    </Text>
                    <Text size="xs" c="dimmed">vs</Text>
                    <Text fw={700} size="lg" c="red">
                      {baselineResults.networkAvgLatency?.toFixed(0) ?? baselineResults.avgLatency.toFixed(0)}ms
                    </Text>
                  </Group>
                  {results.networkAvgLatency && baselineResults.networkAvgLatency && (
                    <Text size="xs" c="green" mt="xs" fw={500}>
                      Improvement: {((baselineResults.networkAvgLatency - results.networkAvgLatency) / baselineResults.networkAvgLatency * 100).toFixed(1)}%
                    </Text>
                  )}
                  <Text size="xs" c="dimmed" mt="xs">
                    Average latency of network requests only
                  </Text>
                </Paper>

                <Paper p="md" withBorder style={{ backgroundColor: '#fff9e6' }}>
                  <Text size="xs" c="dimmed" mb="xs">
                    Origin Server Load
                  </Text>
                  <Group gap="xs" align="baseline">
                    <Text fw={700} size="lg" c="green">
                      {results.originRequests}
                    </Text>
                    <Text size="xs" c="dimmed">vs</Text>
                    <Text fw={700} size="lg" c="red">
                      {baselineResults.originRequests}
                    </Text>
                  </Group>
                  {baselineResults.originRequests > 0 && (
                    <Text size="xs" c="green" mt="xs" fw={500}>
                      Reduction: {((baselineResults.originRequests - results.originRequests) / baselineResults.originRequests * 100).toFixed(1)}%
                    </Text>
                  )}
                  <Text size="xs" c="dimmed" mt="xs">
                    Requests that went to origin server
                  </Text>
                </Paper>
              </SimpleGrid>

              {/* Side-by-side Latency Comparison by Node Type */}
              {results.latencyByNodeType && baselineResults.latencyByNodeType && (
                <>
                  <Divider my="lg" />
                  <Title order={3} mb="md" c="purple">
                    Latency Comparison: µCloud vs Baseline
                  </Title>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
                    {/* Anchor Nodes Comparison */}
                    <Card shadow="sm" padding="md" radius="md" withBorder>
                      <Title order={4} mb="md" c="blue">
                        Anchor Nodes
                      </Title>
                      <Stack gap="sm">
                        <Paper p="sm" withBorder style={{ backgroundColor: '#f0f0f0' }}>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">Average Latency</Text>
                            <Group gap="xs">
                              <Badge color="green" size="sm">µCloud: {results.latencyByNodeType.anchor.avgLatency.toFixed(1)}ms</Badge>
                              <Badge color="red" size="sm">Baseline: {baselineResults.latencyByNodeType.anchor.avgLatency.toFixed(1)}ms</Badge>
                            </Group>
                          </Group>
                          <Text size="xs" c="dimmed">
                            Improvement: {((baselineResults.latencyByNodeType.anchor.avgLatency - results.latencyByNodeType.anchor.avgLatency) / baselineResults.latencyByNodeType.anchor.avgLatency * 100).toFixed(1)}%
                          </Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">5th Percentile (P5)</Text>
                            <Group gap="xs">
                              <Text size="sm" fw={500} c="green">{results.latencyByNodeType.anchor.p5.toFixed(1)}ms</Text>
                              <Text size="sm" c="dimmed">vs</Text>
                              <Text size="sm" fw={500} c="red">{baselineResults.latencyByNodeType.anchor.p5.toFixed(1)}ms</Text>
                            </Group>
                          </Group>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">50th Percentile (P50 / Median)</Text>
                            <Group gap="xs">
                              <Text size="sm" fw={500} c="green">{results.latencyByNodeType.anchor.p50.toFixed(1)}ms</Text>
                              <Text size="sm" c="dimmed">vs</Text>
                              <Text size="sm" fw={500} c="red">{baselineResults.latencyByNodeType.anchor.p50.toFixed(1)}ms</Text>
                            </Group>
                          </Group>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">95th Percentile (P95)</Text>
                            <Group gap="xs">
                              <Text size="sm" fw={500} c="green">{results.latencyByNodeType.anchor.p95.toFixed(1)}ms</Text>
                              <Text size="sm" c="dimmed">vs</Text>
                              <Text size="sm" fw={500} c="red">{baselineResults.latencyByNodeType.anchor.p95.toFixed(1)}ms</Text>
                            </Group>
                          </Group>
                        </Paper>
                        <Paper p="sm" withBorder style={{ backgroundColor: '#fff3cd' }}>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed" fw={500}>99th Percentile (P99) - Worst Case</Text>
                            <Group gap="xs">
                              <Text size="sm" fw={700} c="orange">{results.latencyByNodeType.anchor.p99.toFixed(1)}ms</Text>
                              <Text size="sm" c="dimmed">vs</Text>
                              <Text size="sm" fw={700} c="red">{baselineResults.latencyByNodeType.anchor.p99.toFixed(1)}ms</Text>
                            </Group>
                          </Group>
                          <Text size="xs" c="dimmed" mt="xs">
                            Worst-case latency (99% of requests are faster) - shows impact on worst-performing devices
                          </Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">Request Count</Text>
                          <Text size="sm" fw={500}>{results.latencyByNodeType.anchor.requestCount} (µCloud) vs {baselineResults.latencyByNodeType.anchor.requestCount} (Baseline)</Text>
                        </Paper>
                      </Stack>
                    </Card>

                    {/* Transient Nodes Comparison */}
                    <Card shadow="sm" padding="md" radius="md" withBorder>
                      <Title order={4} mb="md" c="green">
                        Transient Nodes
                      </Title>
                      <Stack gap="sm">
                        <Paper p="sm" withBorder style={{ backgroundColor: '#f0f0f0' }}>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">Average Latency</Text>
                            <Group gap="xs">
                              <Badge color="green" size="sm">µCloud: {results.latencyByNodeType.transient.avgLatency.toFixed(1)}ms</Badge>
                              <Badge color="red" size="sm">Baseline: {baselineResults.latencyByNodeType.transient.avgLatency.toFixed(1)}ms</Badge>
                            </Group>
                          </Group>
                          <Text size="xs" c="dimmed">
                            Improvement: {((baselineResults.latencyByNodeType.transient.avgLatency - results.latencyByNodeType.transient.avgLatency) / baselineResults.latencyByNodeType.transient.avgLatency * 100).toFixed(1)}%
                          </Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">5th Percentile (P5)</Text>
                            <Group gap="xs">
                              <Text size="sm" fw={500} c="green">{results.latencyByNodeType.transient.p5.toFixed(1)}ms</Text>
                              <Text size="sm" c="dimmed">vs</Text>
                              <Text size="sm" fw={500} c="red">{baselineResults.latencyByNodeType.transient.p5.toFixed(1)}ms</Text>
                            </Group>
                          </Group>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">50th Percentile (P50 / Median)</Text>
                            <Group gap="xs">
                              <Text size="sm" fw={500} c="green">{results.latencyByNodeType.transient.p50.toFixed(1)}ms</Text>
                              <Text size="sm" c="dimmed">vs</Text>
                              <Text size="sm" fw={500} c="red">{baselineResults.latencyByNodeType.transient.p50.toFixed(1)}ms</Text>
                            </Group>
                          </Group>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">95th Percentile (P95)</Text>
                            <Group gap="xs">
                              <Text size="sm" fw={500} c="green">{results.latencyByNodeType.transient.p95.toFixed(1)}ms</Text>
                              <Text size="sm" c="dimmed">vs</Text>
                              <Text size="sm" fw={500} c="red">{baselineResults.latencyByNodeType.transient.p95.toFixed(1)}ms</Text>
                            </Group>
                          </Group>
                        </Paper>
                        <Paper p="sm" withBorder style={{ backgroundColor: '#fff3cd' }}>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed" fw={500}>99th Percentile (P99) - Worst Case</Text>
                            <Group gap="xs">
                              <Text size="sm" fw={700} c="orange">{results.latencyByNodeType.transient.p99.toFixed(1)}ms</Text>
                              <Text size="sm" c="dimmed">vs</Text>
                              <Text size="sm" fw={700} c="red">{baselineResults.latencyByNodeType.transient.p99.toFixed(1)}ms</Text>
                            </Group>
                          </Group>
                          <Text size="xs" c="dimmed" mt="xs">
                            Worst-case latency (99% of requests are faster) - shows impact on worst-performing devices
                          </Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">Request Count</Text>
                          <Text size="sm" fw={500}>{results.latencyByNodeType.transient.requestCount} (µCloud) vs {baselineResults.latencyByNodeType.transient.requestCount} (Baseline)</Text>
                        </Paper>
                      </Stack>
                    </Card>
                  </SimpleGrid>
                </>
              )}

              <Divider my="lg" />
            </>
          )}

          {/* Original Results Display */}
          {results && (
            <>
              <Title order={3} mb="md" c="green">
                µCloud (P2P) Results
          </Title>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            <Paper p="md" withBorder>
              <Text size="xs" c="dimmed">
                Total Requests
              </Text>
              <Text fw={700} size="xl">
                {results.totalRequests}
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                Total number of requests made by all peers.
              </Text>
              {(results.localCacheHits !== undefined || (results.totalRequests - results.peerRequests - results.originRequests) > 0) && (
                <Text size="xs" c="dimmed" mt="xs" fw={500}>
                  Breakdown: {results.localCacheHits ?? (results.totalRequests - results.peerRequests - results.originRequests)} local cache + {results.peerRequests} P2P + {results.originRequests} origin = {results.totalRequests}
                </Text>
              )}
            </Paper>

            <Paper p="md" withBorder>
              <Text size="xs" c="dimmed">
                Local Cache Hits
              </Text>
              <Text fw={700} size="xl" c="cyan">
                {results.localCacheHits ?? (results.totalRequests - results.peerRequests - results.originRequests)}
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                Requests served from peer's local cache (peer already had the file). No network transfer needed.
              </Text>
            </Paper>

            <Paper p="md" withBorder>
              <Text size="xs" c="dimmed">
                Peer Requests (P2P Hits)
              </Text>
              <Text fw={700} size="xl" c="green">
                {results.peerRequests}
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                Number of requests served via peer-to-peer transfers. Higher means less origin server load.
              </Text>
            </Paper>

            <Paper p="md" withBorder>
              <Text size="xs" c="dimmed">
                Origin Requests (Misses)
              </Text>
              <Text fw={700} size="xl" c="red">
                {results.originRequests}
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                Number of requests that had to go to the origin server. Lower is better (reduces server load).
              </Text>
            </Paper>

            <Paper p="md" withBorder>
              <Text size="xs" c="dimmed">
                Average Latency
              </Text>
              <Text fw={700} size="xl">
                {results.avgLatency.toFixed(0)}ms
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                Average request latency across all requests. Lower is better for user experience.
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
              <Text size="xs" c="dimmed" mt="xs">
                Measures how evenly uploads are distributed among peers. Perfect fairness (1.0) may not be desirable in heterogeneous systems.
              </Text>
            </Paper>

            {results.recoverySpeed !== undefined && (
              <Paper p="md" withBorder>
                <Text size="xs" c="dimmed">
                  Recovery Speed
                </Text>
                <Text fw={700} size="xl">
                  {results.recoverySpeed.toFixed(1)} req/s
                </Text>
                <Text size="xs" c="dimmed" mt="xs">
                  Rate of requests per second after churn events, showing how quickly the system recovers.
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
              <Text size="xs" c="dimmed" mt="xs">
                Total time the simulation ran. Longer durations allow more time for file propagation and caching.
              </Text>
            </Paper>

          </SimpleGrid>

          {/* Propagation Metrics */}
          {results.propagationMetrics && (
            <>
              <Divider my="lg" />
              <Title order={3} mb="md" c="blue">
                File Propagation Metrics
              </Title>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" mb="lg">
                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Time to 50% of Peers
                  </Text>
                  <Text fw={700} size="xl" c="blue">
                    {(results.propagationMetrics.timeTo50Percent / 1000).toFixed(2)}s
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Time from first transfer until 50% of peers have the file. Shows initial spread rate.
                  </Text>
                </Paper>

                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Time to 90% of Peers
                  </Text>
                  <Text fw={700} size="xl" c="blue">
                    {(results.propagationMetrics.timeTo90Percent / 1000).toFixed(2)}s
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Time from first transfer until 90% of peers have the file. Shows near-complete propagation.
                  </Text>
                </Paper>

                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Time to 100% of Peers
                  </Text>
                  <Text fw={700} size="xl" c="blue">
                    {(results.propagationMetrics.timeTo100Percent / 1000).toFixed(2)}s
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Time from first transfer until all peers have the file. May be high if some peers join late.
                  </Text>
                </Paper>

                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Avg Time to Receive
                  </Text>
                  <Text fw={700} size="xl" c="green">
                    {(results.propagationMetrics.avgTimeToReceive / 1000).toFixed(2)}s
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Average time from when a peer joins until they receive the file. Lower is better for user experience.
                  </Text>
                </Paper>

                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Propagation Rate
                  </Text>
                  <Text fw={700} size="xl" c="green">
                    {results.propagationMetrics.propagationRate.toFixed(1)} peers/s
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Rate at which peers receive the file during active propagation. Higher means faster spread.
                  </Text>
                </Paper>

              </SimpleGrid>
            </>
          )}

          {/* Latency Metrics by Node Type */}
          {results.latencyByNodeType && (
            <>
              <Divider my="lg" />
              <Title order={3} mb="md" c="purple">
                Latency Metrics by Node Type
              </Title>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
                {/* Anchor Nodes Metrics */}
                <Card shadow="sm" padding="md" radius="md" withBorder>
                  <Title order={4} mb="md" c="blue">
                    Anchor Nodes
                  </Title>
                  <Stack gap="md">
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        Average Latency
                      </Text>
                      <Text fw={700} size="lg" c="blue">
                        {results.latencyByNodeType.anchor.avgLatency.toFixed(1)}ms
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        5th Percentile (P5)
                      </Text>
                      <Text fw={700} size="lg">
                        {results.latencyByNodeType.anchor.p5.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Best-case latency (5% of requests are faster)
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        50th Percentile (P50 / Median)
                      </Text>
                      <Text fw={700} size="lg">
                        {results.latencyByNodeType.anchor.p50.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Median latency (half of requests are faster)
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        95th Percentile (P95)
                      </Text>
                      <Text fw={700} size="lg" c="orange">
                        {results.latencyByNodeType.anchor.p95.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Worst-case latency (95% of requests are faster)
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder style={{ backgroundColor: '#fff3cd' }}>
                      <Text size="xs" c="dimmed" fw={500}>
                        99th Percentile (P99) - Worst Case
                      </Text>
                      <Text fw={700} size="lg" c="red">
                        {results.latencyByNodeType.anchor.p99.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Absolute worst-case latency (99% of requests are faster) - shows impact on worst-performing devices
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        Request Count
                      </Text>
                      <Text fw={700} size="lg">
                        {results.latencyByNodeType.anchor.requestCount}
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Total successful requests from anchor nodes
                      </Text>
                    </Paper>
                  </Stack>
                </Card>

                {/* Transient Nodes Metrics */}
                <Card shadow="sm" padding="md" radius="md" withBorder>
                  <Title order={4} mb="md" c="green">
                    Transient Nodes
                  </Title>
                  <Stack gap="md">
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        Average Latency
                      </Text>
                      <Text fw={700} size="lg" c="green">
                        {results.latencyByNodeType.transient.avgLatency.toFixed(1)}ms
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        5th Percentile (P5)
                      </Text>
                      <Text fw={700} size="lg">
                        {results.latencyByNodeType.transient.p5.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Best-case latency (5% of requests are faster)
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        50th Percentile (P50 / Median)
                      </Text>
                      <Text fw={700} size="lg">
                        {results.latencyByNodeType.transient.p50.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Median latency (half of requests are faster)
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        95th Percentile (P95)
                      </Text>
                      <Text fw={700} size="lg" c="orange">
                        {results.latencyByNodeType.transient.p95.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Worst-case latency (95% of requests are faster)
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder style={{ backgroundColor: '#fff3cd' }}>
                      <Text size="xs" c="dimmed" fw={500}>
                        99th Percentile (P99) - Worst Case
                      </Text>
                      <Text fw={700} size="lg" c="red">
                        {results.latencyByNodeType.transient.p99.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Absolute worst-case latency (99% of requests are faster) - shows impact on worst-performing devices
                      </Text>
                    </Paper>
                    <Paper p="sm" withBorder>
                      <Text size="xs" c="dimmed">
                        Request Count
                      </Text>
                      <Text fw={700} size="lg">
                        {results.latencyByNodeType.transient.requestCount}
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        Total successful requests from transient nodes
                      </Text>
                    </Paper>
                  </Stack>
                </Card>
              </SimpleGrid>
            </>
          )}

          {/* Chunk Failure Metrics */}
          {results.chunkFailureMetrics && results.chunkFailureMetrics.totalChunkTransfers > 0 && (
            <>
              <Divider my="lg" />
              <Title order={3} mb="md" c="orange">
                Chunk Transfer Metrics
              </Title>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md" mb="lg">
                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Multi-Chunk Transfers
                  </Text>
                  <Text fw={700} size="xl">
                    {results.chunkFailureMetrics.totalChunkTransfers}
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Number of file transfers that required multiple chunks
                  </Text>
                </Paper>
                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Chunk Failures
                  </Text>
                  <Text fw={700} size="xl" c="red">
                    {results.chunkFailureMetrics.chunkFailures}
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Number of transfers that failed due to chunk loss
                  </Text>
                </Paper>
                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Chunk Failure Rate
                  </Text>
                  <Text fw={700} size="xl" c="orange">
                    {results.chunkFailureMetrics.chunkFailureRate.toFixed(1)}%
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Percentage of multi-chunk transfers that failed
                  </Text>
                </Paper>
                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Avg Chunks Per File
                  </Text>
                  <Text fw={700} size="xl">
                    {results.chunkFailureMetrics.avgChunksPerFile.toFixed(1)}
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    Average number of chunks per file transfer
                  </Text>
                </Paper>
              </SimpleGrid>
            </>
          )}

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
            </>
          )}

          {/* Baseline Results Display */}
          {baselineResults && (
            <>
              <Divider my="lg" />
              <Title order={3} mb="md" c="red">
                Baseline (Origin-Only) Results
              </Title>
              <Alert color="orange" mb="md">
                <Text size="sm">
                  This shows what would happen if all requests went directly to the origin server (no P2P caching).
                  Compare with µCloud results above to see the impact of flash crowds on the origin server.
                </Text>
              </Alert>

              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" mb="lg">
                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Average Latency
                  </Text>
                  <Text fw={700} size="xl" c="red">
                    {baselineResults.avgLatency.toFixed(0)}ms
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    All requests go to origin server (no P2P caching)
                  </Text>
                </Paper>

                {baselineResults.latencyByNodeType && (
                  <>
                    <Paper p="md" withBorder>
                      <Text size="xs" c="dimmed">
                        Anchor Nodes - Avg Latency
                      </Text>
                      <Text fw={700} size="xl" c="red">
                        {baselineResults.latencyByNodeType.anchor.avgLatency.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        {baselineResults.latencyByNodeType.anchor.requestCount} requests
                      </Text>
                    </Paper>

                    <Paper p="md" withBorder>
                      <Text size="xs" c="dimmed">
                        Transient Nodes - Avg Latency
                      </Text>
                      <Text fw={700} size="xl" c="red">
                        {baselineResults.latencyByNodeType.transient.avgLatency.toFixed(1)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        {baselineResults.latencyByNodeType.transient.requestCount} requests
                      </Text>
                    </Paper>
                  </>
                )}

                <Paper p="md" withBorder>
                  <Text size="xs" c="dimmed">
                    Total Requests
                  </Text>
                  <Text fw={700} size="xl">
                    {baselineResults.totalRequests}
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    All requests hit origin server (100% load)
                  </Text>
                </Paper>
              </SimpleGrid>

              {baselineResults.latencyByNodeType && (
                <>
                  <Divider my="lg" />
                  <Title order={4} mb="md" c="red">
                    Baseline Latency Percentiles
                  </Title>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Card shadow="sm" padding="md" radius="md" withBorder>
                      <Title order={5} mb="md" c="blue">
                        Anchor Nodes
                      </Title>
                      <Stack gap="sm">
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">5th Percentile (P5)</Text>
                          <Text fw={500} size="sm">{baselineResults.latencyByNodeType.anchor.p5.toFixed(1)}ms</Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">50th Percentile (P50 / Median)</Text>
                          <Text fw={500} size="sm">{baselineResults.latencyByNodeType.anchor.p50.toFixed(1)}ms</Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">95th Percentile (P95)</Text>
                          <Text fw={500} size="sm" c="orange">{baselineResults.latencyByNodeType.anchor.p95.toFixed(1)}ms</Text>
                        </Paper>
                        <Paper p="sm" withBorder style={{ backgroundColor: '#fff3cd' }}>
                          <Text size="xs" c="dimmed" fw={500}>99th Percentile (P99) - Worst Case</Text>
                          <Text fw={700} size="sm" c="red">{baselineResults.latencyByNodeType.anchor.p99.toFixed(1)}ms</Text>
                          <Text size="xs" c="dimmed" mt="xs">Absolute worst-case latency</Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">Request Count</Text>
                          <Text fw={500} size="sm">{baselineResults.latencyByNodeType.anchor.requestCount}</Text>
                        </Paper>
                      </Stack>
                    </Card>

                    <Card shadow="sm" padding="md" radius="md" withBorder>
                      <Title order={5} mb="md" c="green">
                        Transient Nodes
                      </Title>
                      <Stack gap="sm">
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">5th Percentile (P5)</Text>
                          <Text fw={500} size="sm">{baselineResults.latencyByNodeType.transient.p5.toFixed(1)}ms</Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">50th Percentile (P50 / Median)</Text>
                          <Text fw={500} size="sm">{baselineResults.latencyByNodeType.transient.p50.toFixed(1)}ms</Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">95th Percentile (P95)</Text>
                          <Text fw={500} size="sm" c="orange">{baselineResults.latencyByNodeType.transient.p95.toFixed(1)}ms</Text>
                        </Paper>
                        <Paper p="sm" withBorder style={{ backgroundColor: '#fff3cd' }}>
                          <Text size="xs" c="dimmed" fw={500}>99th Percentile (P99) - Worst Case</Text>
                          <Text fw={700} size="sm" c="red">{baselineResults.latencyByNodeType.transient.p99.toFixed(1)}ms</Text>
                          <Text size="xs" c="dimmed" mt="xs">Absolute worst-case latency</Text>
                        </Paper>
                        <Paper p="sm" withBorder>
                          <Text size="xs" c="dimmed">Request Count</Text>
                          <Text fw={500} size="sm">{baselineResults.latencyByNodeType.transient.requestCount}</Text>
                        </Paper>
                      </Stack>
                    </Card>
                  </SimpleGrid>
                </>
              )}

              {/* Baseline Worst-Case Metrics */}
              {baselineResults.worstCaseMetrics && (
                <>
                  <Divider my="lg" />
                  <Title order={4} mb="md" c="red">
                    Baseline Worst-Case Scenarios (Server Overload Impact)
                  </Title>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
                    <Paper p="md" withBorder style={{ backgroundColor: '#fff3cd' }}>
                      <Text size="xs" c="dimmed" fw={500} mb="xs">
                        Overall P99 Latency (Worst Case)
                      </Text>
                      <Text fw={700} size="xl" c="red">
                        {baselineResults.worstCaseMetrics.p99Latency.toFixed(0)}ms
                      </Text>
                      <Text size="xs" c="dimmed" mt="xs">
                        99% of requests are faster than this. Shows absolute worst-case server overload impact.
                      </Text>
                    </Paper>

                    {baselineResults.worstCaseMetrics.worstPerformingPeer && (
                      <Paper p="md" withBorder style={{ backgroundColor: '#ffe6e6' }}>
                        <Text size="xs" c="dimmed" fw={500} mb="xs">
                          Worst-Performing Peer
                        </Text>
                        <Text fw={700} size="lg" c="red">
                          {baselineResults.worstCaseMetrics.worstPerformingPeer.id}
                        </Text>
                        <Stack gap="xs" mt="sm">
                          <Text size="xs">
                            <strong>P99 Latency:</strong> {baselineResults.worstCaseMetrics.worstPerformingPeer.p99Latency.toFixed(0)}ms
                          </Text>
                          <Text size="xs">
                            <strong>Network Latency:</strong> {baselineResults.worstCaseMetrics.worstPerformingPeer.latency}ms
                          </Text>
                          <Text size="xs">
                            <strong>Bandwidth:</strong> {baselineResults.worstCaseMetrics.worstPerformingPeer.bandwidth}Mbps ({baselineResults.worstCaseMetrics.worstPerformingPeer.tier} tier)
                          </Text>
                        </Stack>
                        <Text size="xs" c="dimmed" mt="xs">
                          This peer experienced the worst server overload impact
                        </Text>
                      </Paper>
                    )}
                  </SimpleGrid>
                </>
              )}

              {/* Baseline Overall Percentiles */}
              {baselineResults.latencyPercentiles && (
                <>
                  <Divider my="lg" />
                  <Title order={4} mb="md" c="red">
                    Baseline Overall Latency Distribution
                  </Title>
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }} spacing="md" mb="lg">
                    <Paper p="md" withBorder>
                      <Text size="xs" c="dimmed">P50 (Median)</Text>
                      <Text fw={700} size="lg">{baselineResults.latencyPercentiles.p50.toFixed(0)}ms</Text>
                    </Paper>
                    <Paper p="md" withBorder>
                      <Text size="xs" c="dimmed">P75</Text>
                      <Text fw={700} size="lg">{baselineResults.latencyPercentiles.p75.toFixed(0)}ms</Text>
                    </Paper>
                    <Paper p="md" withBorder>
                      <Text size="xs" c="dimmed">P90</Text>
                      <Text fw={700} size="lg" c="orange">{baselineResults.latencyPercentiles.p90.toFixed(0)}ms</Text>
                    </Paper>
                    <Paper p="md" withBorder>
                      <Text size="xs" c="dimmed">P95</Text>
                      <Text fw={700} size="lg" c="orange">{baselineResults.latencyPercentiles.p95.toFixed(0)}ms</Text>
                    </Paper>
                    <Paper p="md" withBorder style={{ backgroundColor: '#fff3cd' }}>
                      <Text size="xs" c="dimmed" fw={500}>P99 (Worst Case)</Text>
                      <Text fw={700} size="lg" c="red">{baselineResults.latencyPercentiles.p99.toFixed(0)}ms</Text>
                    </Paper>
                  </SimpleGrid>
                </>
              )}
            </>
          )}
        </Card>
      )}
    </Stack>
  );
}
