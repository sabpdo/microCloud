import { useEffect, useState } from 'react';
import {
  Card,
  Title,
  Text,
  Group,
  Stack,
  Progress,
  RingProgress,
  Badge,
  Button,
  Grid,
  Paper,
} from '@mantine/core';

interface Stats {
  totalRequests: number;
  totalBytes: number;
  requestsByPath: Record<string, number>;
  startTime: string;
  uptime: number;
  peerRequests: number;
  originRequests: number;
  cacheHitRatio: number;
}

export function MetricsDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStats = async () => {
    try {
      const response = await fetch('/stats');
      const data = await response.json();
      setStats(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => {
      if (autoRefresh) {
        fetchStats();
      }
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const resetStats = async () => {
    try {
      await fetch('/stats/reset', { method: 'POST' });
      fetchStats();
    } catch (error) {
      console.error('Error resetting stats:', error);
    }
  };

  if (loading) {
    return (
      <Card>
        <Text>Loading metrics...</Text>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <Text c="red">Error loading metrics</Text>
      </Card>
    );
  }

  const totalCacheableRequests = stats.peerRequests + stats.originRequests;
  const cacheMissRatio = 100 - stats.cacheHitRatio;
  const bytesServedKB = (stats.totalBytes / 1024).toFixed(2);
  const bytesServedMB = (stats.totalBytes / (1024 * 1024)).toFixed(2);

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Title order={2} c="blue">
          Cache Performance Metrics
        </Title>
        <Group>
          <Button variant="light" onClick={() => setAutoRefresh(!autoRefresh)} size="sm">
            {autoRefresh ? 'Pause' : 'Resume'} Auto-refresh
          </Button>
          <Button variant="outline" color="red" onClick={resetStats} size="sm">
            Reset Stats
          </Button>
        </Group>
      </Group>

      <Grid>
        {/* Cache Hit Ratio */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text fw={600} size="lg">
                Cache Hit Ratio
              </Text>
              <Badge color="green" size="lg">
                {stats.cacheHitRatio.toFixed(2)}%
              </Badge>
            </Group>
            <RingProgress
              size={200}
              thickness={20}
              sections={[
                {
                  value: stats.cacheHitRatio,
                  color: 'green',
                  tooltip: `Cache Hits: ${stats.peerRequests}`,
                },
                {
                  value: cacheMissRatio,
                  color: 'red',
                  tooltip: `Cache Misses: ${stats.originRequests}`,
                },
              ]}
              label={
                <Text ta="center" fw={700} size="xl">
                  {stats.cacheHitRatio.toFixed(1)}%
                </Text>
              }
            />
            <Group justify="space-between" mt="md">
              <Text size="sm" c="green">
                Hits: {stats.peerRequests}
              </Text>
              <Text size="sm" c="red">
                Misses: {stats.originRequests}
              </Text>
            </Group>
          </Card>
        </Grid.Col>

        {/* Request Statistics */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text fw={600} size="lg" mb="md">
              Request Statistics
            </Text>
            <Stack gap="md">
              <Paper p="md" withBorder>
                <div>
                  <Text size="xs" c="dimmed">
                    Total Requests
                  </Text>
                  <Text fw={700} size="xl">
                    {stats.totalRequests}
                  </Text>
                </div>
              </Paper>

              <Paper p="md" withBorder>
                <div>
                  <Text size="xs" c="dimmed">
                    Cacheable Requests
                  </Text>
                  <Text fw={700} size="xl">
                    {totalCacheableRequests}
                  </Text>
                </div>
              </Paper>

              <Paper p="md" withBorder>
                <Group justify="space-between">
                  <div>
                    <Text size="xs" c="dimmed">
                      Data Served
                    </Text>
                    <Text fw={700} size="xl">
                      {bytesServedMB > '1' ? `${bytesServedMB} MB` : `${bytesServedKB} KB`}
                    </Text>
                  </div>
                </Group>
              </Paper>
            </Stack>
          </Card>
        </Grid.Col>

        {/* Requests by Path */}
        <Grid.Col span={12}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text fw={600} size="lg" mb="md">
              Requests by Path
            </Text>
            <Stack gap="sm">
              {Object.entries(stats.requestsByPath)
                .sort(([, a], [, b]) => b - a)
                .map(([path, count]) => {
                  const percentage =
                    stats.totalRequests > 0 ? (count / stats.totalRequests) * 100 : 0;
                  return (
                    <div key={path}>
                      <Group justify="space-between" mb={4}>
                        <Text size="sm" fw={500}>
                          {path}
                        </Text>
                        <Badge variant="light">{count}</Badge>
                      </Group>
                      <Progress value={percentage} size="sm" radius="xl" />
                    </div>
                  );
                })}
              {Object.keys(stats.requestsByPath).length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  No requests recorded yet
                </Text>
              )}
            </Stack>
          </Card>
        </Grid.Col>

        {/* Server Info */}
        <Grid.Col span={12}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed">
                  Server Uptime
                </Text>
                <Text fw={600} size="lg">
                  {Math.floor(stats.uptime / 60)}m {stats.uptime % 60}s
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Started
                </Text>
                <Text fw={600} size="sm">
                  {new Date(stats.startTime).toLocaleTimeString()}
                </Text>
              </div>
            </Group>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
