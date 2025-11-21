/**
 * Simulation Analysis Tool
 *
 * Analyzes simulation results and generates summary statistics
 */

import fs from 'fs';
import path from 'path';

export interface SimulationResult {
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
  peerJoinEvents?: Array<{ peerId: string; timestamp: number; joinedViaAnchor?: string }>;
  fileTransferEvents?: Array<{
    fromPeer: string;
    toPeer: string;
    fileHash: string;
    timestamp: number;
    successful: boolean;
  }>;
  anchorNodes?: string[];
  filePropagationTime?: number;
}

export interface AnalysisSummary {
  totalSimulations: number;
  avgCacheHitRatio: number;
  avgLatency: number;
  avgLatencyImprovement: number;
  avgBandwidthSaved: number;
  avgFairnessIndex: number;
  avgFilePropagationTime?: number;
  metricsByPeerCount: Map<
    number,
    {
      count: number;
      avgCacheHitRatio: number;
      avgLatency: number;
    }
  >;
}

/**
 * Analyze a single simulation result
 */
export function analyzeSimulation(result: SimulationResult): {
  cacheEfficiency: number;
  networkEfficiency: number;
  fairness: number;
  propagationSpeed?: number;
} {
  return {
    cacheEfficiency: result.cacheHitRatio,
    networkEfficiency: result.bandwidthSaved,
    fairness: result.jainFairnessIndex,
    propagationSpeed: result.filePropagationTime,
  };
}

/**
 * Analyze multiple simulation results
 */
export function analyzeMultipleResults(results: SimulationResult[]): AnalysisSummary {
  if (results.length === 0) {
    throw new Error('No results to analyze');
  }

  const metricsByPeerCount = new Map<
    number,
    { count: number; cacheHitRatios: number[]; latencies: number[] }
  >();

  let totalCacheHitRatio = 0;
  let totalLatency = 0;
  let totalLatencyImprovement = 0;
  let totalBandwidthSaved = 0;
  let totalFairnessIndex = 0;
  let totalPropagationTime = 0;
  let propagationTimeCount = 0;

  results.forEach((result) => {
    totalCacheHitRatio += result.cacheHitRatio;
    totalLatency += result.avgLatency;
    totalLatencyImprovement += result.latencyImprovement;
    totalBandwidthSaved += result.bandwidthSaved;
    totalFairnessIndex += result.jainFairnessIndex;

    if (result.filePropagationTime !== undefined) {
      totalPropagationTime += result.filePropagationTime;
      propagationTimeCount++;
    }

    // Group by peer count
    const peerCount = result.peersSimulated;
    if (!metricsByPeerCount.has(peerCount)) {
      metricsByPeerCount.set(peerCount, { count: 0, cacheHitRatios: [], latencies: [] });
    }
    const metrics = metricsByPeerCount.get(peerCount)!;
    metrics.count++;
    metrics.cacheHitRatios.push(result.cacheHitRatio);
    metrics.latencies.push(result.avgLatency);
  });

  // Calculate averages by peer count
  const metricsByPeerCountAvg = new Map<
    number,
    { count: number; avgCacheHitRatio: number; avgLatency: number }
  >();
  metricsByPeerCount.forEach((metrics, peerCount) => {
    metricsByPeerCountAvg.set(peerCount, {
      count: metrics.count,
      avgCacheHitRatio:
        metrics.cacheHitRatios.reduce((a, b) => a + b, 0) / metrics.cacheHitRatios.length,
      avgLatency: metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length,
    });
  });

  return {
    totalSimulations: results.length,
    avgCacheHitRatio: totalCacheHitRatio / results.length,
    avgLatency: totalLatency / results.length,
    avgLatencyImprovement: totalLatencyImprovement / results.length,
    avgBandwidthSaved: totalBandwidthSaved / results.length,
    avgFairnessIndex: totalFairnessIndex / results.length,
    avgFilePropagationTime:
      propagationTimeCount > 0 ? totalPropagationTime / propagationTimeCount : undefined,
    metricsByPeerCount: metricsByPeerCountAvg,
  };
}

/**
 * Load simulation results from a JSON file
 */
export function loadResults(filePath: string): SimulationResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Load multiple simulation results from a directory
 */
export function loadResultsFromDirectory(dirPath: string): SimulationResult[] {
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
  return files.map((file) => loadResults(path.join(dirPath, file)));
}

/**
 * Print analysis summary to console
 */
export function printSummary(summary: AnalysisSummary): void {
  console.log('\n=== Simulation Analysis Summary ===\n');
  console.log(`Total Simulations: ${summary.totalSimulations}`);
  console.log(`Average Cache Hit Ratio: ${summary.avgCacheHitRatio.toFixed(2)}%`);
  console.log(`Average Latency: ${summary.avgLatency.toFixed(0)}ms`);
  console.log(`Average Latency Improvement: ${summary.avgLatencyImprovement.toFixed(2)}%`);
  console.log(`Average Bandwidth Saved: ${summary.avgBandwidthSaved.toFixed(2)}%`);
  console.log(`Average Fairness Index: ${summary.avgFairnessIndex.toFixed(3)}`);
  if (summary.avgFilePropagationTime !== undefined) {
    console.log(
      `Average File Propagation Time: ${(summary.avgFilePropagationTime / 1000).toFixed(2)}s`
    );
  }

  console.log('\n=== Metrics by Peer Count ===\n');
  const sortedPeerCounts = Array.from(summary.metricsByPeerCount.keys()).sort((a, b) => a - b);
  sortedPeerCounts.forEach((peerCount) => {
    const metrics = summary.metricsByPeerCount.get(peerCount)!;
    console.log(`${peerCount} peers (${metrics.count} runs):`);
    console.log(`  Cache Hit Ratio: ${metrics.avgCacheHitRatio.toFixed(2)}%`);
    console.log(`  Average Latency: ${metrics.avgLatency.toFixed(0)}ms`);
  });
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: tsx analyze-simulation.ts <results.json | results-dir>');
    process.exit(1);
  }

  const inputPath = args[0];
  const stats = fs.statSync(inputPath);

  if (stats.isDirectory()) {
    const results = loadResultsFromDirectory(inputPath);
    const summary = analyzeMultipleResults(results);
    printSummary(summary);
  } else if (stats.isFile()) {
    const result = loadResults(inputPath);
    const analysis = analyzeSimulation(result);
    console.log('\n=== Simulation Analysis ===\n');
    console.log(`Cache Efficiency: ${analysis.cacheEfficiency.toFixed(2)}%`);
    console.log(`Network Efficiency: ${analysis.networkEfficiency.toFixed(2)}%`);
    console.log(`Fairness: ${analysis.fairness.toFixed(3)}`);
    if (analysis.propagationSpeed !== undefined) {
      console.log(`File Propagation Time: ${(analysis.propagationSpeed / 1000).toFixed(2)}s`);
    }
  }
}
