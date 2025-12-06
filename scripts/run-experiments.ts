/**
 * Experiment Runner
 * 
 * Runs all experiment scenarios and saves results to results/ folder
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface ExperimentConfig {
  name: string;
  description: string;
  numPeers: number[];
  duration: number;
  bandwidthMin: number;
  bandwidthMax: number;
  flashCrowd?: boolean;
  joinRate?: number;
  churnRate?: number;
  baselineMode?: boolean;
}

interface ExperimentResult {
  metadata: {
    simulationName: string;
    exportDate: string;
    exportVersion: string;
    scenario: string;
    variant: string;
    experimentType: string;
  };
  configuration: {
    numPeers: number;
    targetFile: string;
    duration: number;
    requestProbability?: number;
    flashCrowd?: boolean;
    joinRate?: number;
    churnRate?: number;
    churnMode?: string;
    baselineMode?: boolean;
    deviceHeterogeneity?: {
      latencyMin: number;
      latencyMax: number;
      bandwidthMin: number;
      bandwidthMax: number;
    };
  };
  results: {
    microcloud: any;
    baseline: any;
  };
  // Additional experiment metadata for analysis
  experimentMetadata?: {
    scenario: string;
    variant: string;
    timestamp: string;
  };
}

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TARGET_FILE = '/sample.txt';
const RESULTS_DIR = join(process.cwd(), 'results');

// Ensure results directory exists
mkdirSync(RESULTS_DIR, { recursive: true });

/**
 * Run a single simulation via API
 */
async function runSimulation(config: any): Promise<any> {
  const response = await fetch(`${SERVER_URL}/api/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Simulation failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Simulation failed: ${data.error || 'Unknown error'}`);
  }

  return data.results;
}

/**
 * Run both P2P and baseline simulations for comparison
 * Returns results in dashboard-compatible format
 */
async function runSimulationWithBaseline(config: any): Promise<{
  microcloud: any;
  baseline: any;
}> {
  const isBaseline = config.baselineMode === true;

  if (isBaseline) {
    // For baseline experiments, run only baseline
    const baselineResults = await runSimulation({ ...config, baselineMode: true });
    return {
      microcloud: baselineResults, // Dashboard expects both, so duplicate
      baseline: baselineResults,
    };
  } else {
    // For P2P experiments, run both P2P and baseline for comparison
    // IMPORTANT: Run sequentially, not in parallel, to avoid shared global state
    // The simulation uses global state (requestMetrics, peerRegistry, etc.) that gets cleared
    // at the start of each simulation, but running in parallel causes race conditions
    console.log('    Running P2P simulation...');
    const microcloudResults = await runSimulation({ ...config, baselineMode: false });
    
    console.log('    Running baseline simulation...');
    const baselineResults = await runSimulation({ ...config, baselineMode: true });

    return {
      microcloud: microcloudResults,
      baseline: baselineResults,
    };
  }
}

/**
 * Run all experiments for a scenario
 */
async function runExperimentScenario(
  scenario: string,
  baseConfig: ExperimentConfig,
  variants: Array<{ name: string; config: Partial<ExperimentConfig> }>
): Promise<ExperimentResult[]> {
  const results: ExperimentResult[] = [];

  console.log(`\n=== Running ${scenario} Scenario ===`);

  for (const variant of variants) {
    const config = { ...baseConfig, ...variant.config };
    const variantName = variant.name;

    console.log(`\n  Running: ${variantName}`);

    // Run experiments for each numPeers value
    for (const numPeers of config.numPeers) {
      const experimentName = `${scenario}_${variantName}_${numPeers}peers`;
      console.log(`    - ${numPeers} peers...`);

      try {
        const simulationConfig = {
          numPeers,
          targetFile: TARGET_FILE,
          duration: config.duration,
          requestProbability: 0.5,
          flashCrowd: config.flashCrowd !== undefined ? config.flashCrowd : false,
          joinRate: config.joinRate,
          churnRate: config.churnRate || 0,
          churnMode: config.churnRate && config.churnRate > 0 ? 'leaving' : undefined,
          baselineMode: config.baselineMode || false,
          deviceHeterogeneity: {
            latencyMin: 10,
            latencyMax: 250,
            bandwidthMin: config.bandwidthMin,
            bandwidthMax: config.bandwidthMax,
          },
        };

        // Run simulation(s) - includes baseline comparison for non-baseline experiments
        const simulationResults = await runSimulationWithBaseline(simulationConfig);

        // Create dashboard-compatible result format
        const result: ExperimentResult = {
          metadata: {
            simulationName: experimentName,
            exportDate: new Date().toISOString(),
            exportVersion: '1.0',
            scenario,
            variant: variantName,
            experimentType: config.baselineMode ? 'baseline' : 'p2p',
          },
          configuration: {
            ...simulationConfig,
          },
          results: simulationResults,
          experimentMetadata: {
            scenario,
            variant: variantName,
            timestamp: new Date().toISOString(),
          },
        };

        // Save individual result
        const filename = `${experimentName}.json`;
        const filepath = join(RESULTS_DIR, filename);
        writeFileSync(filepath, JSON.stringify(result, null, 2));
        console.log(`      ✓ Saved: ${filename}`);

        results.push(result);
      } catch (error) {
        console.error(`      ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return results;
}

/**
 * Main experiment runner
 */
async function runAllExperiments() {
  console.log('Starting Experiment Suite');
  console.log('========================\n');
  console.log(`Server URL: ${SERVER_URL}`);
  console.log(`Results directory: ${RESULTS_DIR}\n`);

  // Check if server is running
  try {
    const healthCheck = await fetch(`${SERVER_URL}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numPeers: 1, duration: 1 }),
    });
    if (!healthCheck.ok) {
      throw new Error('Server health check failed');
    }
  } catch (error) {
    console.error('\n❌ ERROR: Server is not running or not accessible!');
    console.error(`   Please start the server with: npm run dev:server`);
    console.error(`   Then run this script again.\n`);
    process.exit(1);
  }

  const allResults: ExperimentResult[] = [];

  // ===== FLASH CROWD SCENARIO =====
  // Changing number of people, changing join rate, no churn
  const flashCrowdBase: ExperimentConfig = {
    name: 'flash_crowd',
    description: 'Flash crowd: changing number of people, changing join rate, no churn',
    numPeers: [20, 50, 100, 200],
    duration: 60,
    bandwidthMin: 10,
    bandwidthMax: 100,
    flashCrowd: true,
    churnRate: 0,
  };

  const flashCrowdVariants = [
    { name: 'joinrate_2', config: { joinRate: 2 } },
    { name: 'joinrate_5', config: { joinRate: 5 } },
    { name: 'joinrate_10', config: { joinRate: 10 } },
  ];

  const flashCrowdResults = await runExperimentScenario(
    'flash_crowd',
    flashCrowdBase,
    flashCrowdVariants
  );
  allResults.push(...flashCrowdResults);

  // ===== SCALABILITY SCENARIO =====
  // Changing number of people, join rate ~5 peers/sec, no churn, latency over time
  const scalabilityBase: ExperimentConfig = {
    name: 'scalability',
    description: 'Scalability: changing number of people, join rate 5 peers/sec, no churn',
    numPeers: [20, 50, 100, 200, 500],
    duration: 120, // Longer duration for scalability testing
    bandwidthMin: 10,
    bandwidthMax: 100,
    flashCrowd: true,
    joinRate: 5,
    churnRate: 0,
  };

  const scalabilityVariants = [
    { name: 'baseline', config: {} },
  ];

  const scalabilityResults = await runExperimentScenario(
    'scalability',
    scalabilityBase,
    scalabilityVariants
  );
  allResults.push(...scalabilityResults);

  // ===== HIGH CHURN SCENARIO =====
  // Static number of people, static join rate, changing churn rate
  const highChurnBase: ExperimentConfig = {
    name: 'high_churn',
    description: 'High churn: static number of people, static join rate, changing churn rate',
    numPeers: [100], // Static number
    duration: 60,
    bandwidthMin: 10,
    bandwidthMax: 100,
    flashCrowd: false, // All peers join at once
    joinRate: 5,
  };

  const highChurnVariants = [
    { name: 'churn_0', config: { churnRate: 0 } },
    { name: 'churn_0.01', config: { churnRate: 0.01 } },
    { name: 'churn_0.05', config: { churnRate: 0.05 } },
    { name: 'churn_0.1', config: { churnRate: 0.1 } },
  ];

  const highChurnResults = await runExperimentScenario(
    'high_churn',
    highChurnBase,
    highChurnVariants
  );
  allResults.push(...highChurnResults);

  // ===== BASELINE SCENARIO =====
  // Baseline performance (no P2P, origin only)
  const baselineBase: ExperimentConfig = {
    name: 'baseline',
    description: 'Baseline: origin server only, no P2P',
    numPeers: [20, 50, 100, 200],
    duration: 60,
    bandwidthMin: 10,
    bandwidthMax: 100,
    flashCrowd: false,
    churnRate: 0,
    baselineMode: true,
  };

  const baselineVariants = [
    { name: 'origin_only', config: {} },
  ];

  const baselineResults = await runExperimentScenario(
    'baseline',
    baselineBase,
    baselineVariants
  );
  allResults.push(...baselineResults);

  // Save summary of all experiments
  const summary = {
    timestamp: new Date().toISOString(),
    totalExperiments: allResults.length,
    scenarios: {
      flash_crowd: flashCrowdResults.length,
      scalability: scalabilityResults.length,
      high_churn: highChurnResults.length,
      baseline: baselineResults.length,
    },
    experiments: allResults.map(r => ({
      scenario: r.metadata.scenario,
      variant: r.metadata.variant,
      numPeers: r.configuration.numPeers,
      filename: `${r.metadata.scenario}_${r.metadata.variant}_${r.configuration.numPeers}peers.json`,
    })),
  };

  const summaryPath = join(RESULTS_DIR, 'experiments_summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\n========================');
  console.log('Experiment Suite Complete');
  console.log('========================');
  console.log(`\nTotal experiments run: ${allResults.length}`);
  console.log(`Results saved to: ${RESULTS_DIR}`);
  console.log(`Summary saved to: ${summaryPath}\n`);
}

// Run experiments
runAllExperiments().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

