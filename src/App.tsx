import { Container, Title, Text, Paper, Tabs } from '@mantine/core';
import { useConfig } from './hooks/useConfig';
import { ContentPolicies } from './components/ContentPolicies';
import { MetricsDashboard } from './components/MetricsDashboard';
import { SimulationControl } from './components/SimulationControl';
import { Toaster } from 'sonner';

function App() {
  const { config, updateConfig } = useConfig();

  return (
    <Container size="xl" py="xl">
      <Paper
        p="xl"
        radius="md"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          marginBottom: '2rem',
        }}
      >
        <Title order={1} c="white" mb="xs">
          μCloud Dashboard
        </Title>
        <Text size="lg" c="white" opacity={0.95}>
          Configure content caching policies and view performance metrics
        </Text>
      </Paper>

      <Tabs defaultValue="config">
        <Tabs.List>
          <Tabs.Tab value="config">Configuration</Tabs.Tab>
          <Tabs.Tab value="metrics">Performance Metrics</Tabs.Tab>
          <Tabs.Tab value="simulation">Simulation</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="config" pt="xl">
          <ContentPolicies config={config} onUpdate={updateConfig} />
          <Text size="sm" c="dimmed" ta="center" mt="xl" py="xl">
            All changes are saved automatically
          </Text>
        </Tabs.Panel>

        <Tabs.Panel value="metrics" pt="xl">
          <MetricsDashboard />
        </Tabs.Panel>

        <Tabs.Panel value="simulation" pt="xl">
          <SimulationControl />
        </Tabs.Panel>
      </Tabs>

      <Toaster position="top-right" richColors />
    </Container>
  );
}

export default App;
