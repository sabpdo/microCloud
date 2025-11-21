/**
 * Batch Analysis Tool
 *
 * Runs multiple simulations with different parameters and analyzes results
 */

import { runFlashCrowdSimulation, SimulationConfig } from '../../../server/simulation';
import { analyzeMultipleResults, SimulationResult, printSummary } from './analyze-simulation';
import fs from 'fs';
import path from 'path';

interface BatchConfig {
  numPeers: number[];
  durations: number[];
  flashCrowd: boolean[];
  joinRates?: number[];
}

/**
 * Run batch analysis with different configurations
 */
export async function runBatchAnalysis(
  batchConfig: BatchConfig,
  baseConfig: Omit<SimulationConfig, 'numPeers' | 'duration' | 'flashCrowd' | 'joinRate'>
): Promise<SimulationResult[]> {
  const results: SimulationResult[] = [];

  const configs: SimulationConfig[] = [];

  for (const numPeers of batchConfig.numPeers) {
    for (const duration of batchConfig.durations) {
      for (const flashCrowd of batchConfig.flashCrowd) {
        const joinRates = batchConfig.joinRates || [2];

        for (const joinRate of joinRates) {
          configs.push({
            ...baseConfig,
            numPeers,
            duration,
            flashCrowd,
            joinRate: flashCrowd ? joinRate : undefined,
          });
        }
      }
    }
  }

  console.log(`Running ${configs.length} simulations...\n`);

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    console.log(`[${i + 1}/${configs.length}] Running simulation:`, {
      numPeers: config.numPeers,
      duration: config.duration,
      flashCrowd: config.flashCrowd,
      joinRate: config.joinRate,
    });

    try {
      const result = await runFlashCrowdSimulation(config);
      results.push(result);
    } catch (error) {
      console.error(`Simulation ${i + 1} failed:`, error);
    }
  }

  return results;
}

/**
 * Save results to JSON file
 */
export function saveResults(results: SimulationResult[], outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outputPath}`);
}

// CLI usage
if (require.main === module) {
  (async () => {
    const batchConfig: BatchConfig = {
      numPeers: [10, 20, 50, 100],
      durations: [30],
      flashCrowd: [false, true],
      joinRates: [1, 2, 5],
    };

    const baseConfig: Omit<SimulationConfig, 'numPeers' | 'duration' | 'flashCrowd' | 'joinRate'> =
      {
        targetFile: '/sample.txt',
        requestInterval: 100,
        churnRate: 0,
        anchorSignalingLatency: 100,
      };

    console.log('Starting batch analysis...\n');

    const results = await runBatchAnalysis(batchConfig, baseConfig);

    // Save results
    const outputDir = path.join(__dirname, '../../results');
    fs.mkdirSync(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `batch-analysis-${timestamp}.json`);
    saveResults(results, outputPath);

    // Analyze and print summary
    const { analyzeMultipleResults, printSummary } = await import('./analyze-simulation');
    const summary = analyzeMultipleResults(results);
    printSummary(summary);
  })();
}
