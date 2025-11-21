#!/usr/bin/env python3
"""
Analyze Multiple Simulation Runs

Compares multiple simulation runs and generates comparative analysis.
"""

import json
import sys
import argparse
import statistics
from pathlib import Path
from typing import List, Dict, Any, Optional
from collections import defaultdict


def load_results_from_directory(dir_path: str) -> List[Dict[str, Any]]:
    """Load all JSON results from a directory."""
    results = []
    dir_path_obj = Path(dir_path)
    
    for json_file in dir_path_obj.glob('*.json'):
        try:
            with open(json_file, 'r') as f:
                data = json.load(f)
                if isinstance(data, list):
                    results.extend(data)
                elif isinstance(data, dict):
                    if 'results' in data:
                        results.extend(data['results'])
                    else:
                        results.append(data)
        except Exception as e:
            print(f"Warning: Failed to load {json_file}: {e}", file=sys.stderr)
    
    return results


def analyze_by_peer_count(results: List[Dict[str, Any]]) -> Dict[int, Dict[str, float]]:
    """Analyze metrics grouped by number of peers."""
    by_peer_count = defaultdict(lambda: {
        'cache_hit_ratios': [],
        'latencies': [],
        'bandwidth_saved': [],
        'fairness_indices': [],
        'latency_improvements': [],
    })
    
    for result in results:
        peer_count = result.get('peersSimulated', 0)
        by_peer_count[peer_count]['cache_hit_ratios'].append(result.get('cacheHitRatio', 0))
        by_peer_count[peer_count]['latencies'].append(result.get('avgLatency', 0))
        by_peer_count[peer_count]['bandwidth_saved'].append(result.get('bandwidthSaved', 0))
        by_peer_count[peer_count]['fairness_indices'].append(result.get('jainFairnessIndex', 0))
        by_peer_count[peer_count]['latency_improvements'].append(result.get('latencyImprovement', 0))
    
    # Calculate statistics for each peer count
    analysis = {}
    for peer_count, metrics in sorted(by_peer_count.items()):
        analysis[peer_count] = {
            'count': len(metrics['cache_hit_ratios']),
            'avg_cache_hit_ratio': statistics.mean(metrics['cache_hit_ratios']),
            'std_cache_hit_ratio': statistics.stdev(metrics['cache_hit_ratios']) if len(metrics['cache_hit_ratios']) > 1 else 0,
            'avg_latency': statistics.mean(metrics['latencies']),
            'std_latency': statistics.stdev(metrics['latencies']) if len(metrics['latencies']) > 1 else 0,
            'avg_bandwidth_saved': statistics.mean(metrics['bandwidth_saved']),
            'avg_fairness': statistics.mean(metrics['fairness_indices']),
            'avg_latency_improvement': statistics.mean(metrics['latency_improvements']),
        }
    
    return analysis


def analyze_by_flash_crowd(results: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    """Compare flash crowd vs non-flash crowd scenarios."""
    flash_crowd = []
    normal = []
    
    for result in results:
        # Infer from join events (if peers joined over time, it's flash crowd)
        join_events = result.get('peerJoinEvents', [])
        if len(join_events) > 1:
            # Calculate time span of joins
            timestamps = [e['timestamp'] for e in join_events]
            time_span = max(timestamps) - min(timestamps)
            if time_span > 1000:  # More than 1 second span indicates flash crowd
                flash_crowd.append(result)
            else:
                normal.append(result)
        else:
            normal.append(result)
    
    def calculate_stats(result_list: List[Dict[str, Any]]) -> Dict[str, float]:
        if not result_list:
            return {}
        
        return {
            'count': len(result_list),
            'avg_cache_hit_ratio': statistics.mean([r.get('cacheHitRatio', 0) for r in result_list]),
            'avg_latency': statistics.mean([r.get('avgLatency', 0) for r in result_list]),
            'avg_bandwidth_saved': statistics.mean([r.get('bandwidthSaved', 0) for r in result_list]),
            'avg_fairness': statistics.mean([r.get('jainFairnessIndex', 0) for r in result_list]),
        }
    
    return {
        'flash_crowd': calculate_stats(flash_crowd),
        'normal': calculate_stats(normal),
    }


def print_analysis(analysis: Dict[int, Dict[str, float]], flash_crowd_analysis: Dict[str, Dict[str, float]]):
    """Print analysis results to console."""
    print("\n" + "="*60)
    print("SIMULATION ANALYSIS RESULTS")
    print("="*60 + "\n")
    
    print("Metrics by Peer Count:\n")
    print(f"{'Peers':<8} {'Runs':<6} {'Cache Hit %':<12} {'Latency (ms)':<14} {'Bandwidth %':<12} {'Fairness':<10}")
    print("-" * 70)
    
    for peer_count in sorted(analysis.keys()):
        stats = analysis[peer_count]
        print(f"{peer_count:<8} {stats['count']:<6} "
              f"{stats['avg_cache_hit_ratio']:.2f}±{stats['std_cache_hit_ratio']:.2f}    "
              f"{stats['avg_latency']:.0f}±{stats['std_latency']:.0f}      "
              f"{stats['avg_bandwidth_saved']:.2f}        "
              f"{stats['avg_fairness']:.3f}")
    
    print("\n" + "="*60)
    print("Flash Crowd vs Normal Comparison:\n")
    
    if 'flash_crowd' in flash_crowd_analysis and flash_crowd_analysis['flash_crowd']:
        fc_stats = flash_crowd_analysis['flash_crowd']
        print(f"Flash Crowd ({fc_stats['count']} runs):")
        print(f"  Cache Hit Ratio: {fc_stats['avg_cache_hit_ratio']:.2f}%")
        print(f"  Average Latency: {fc_stats['avg_latency']:.0f}ms")
        print(f"  Bandwidth Saved: {fc_stats['avg_bandwidth_saved']:.2f}%")
        print(f"  Fairness Index: {fc_stats['avg_fairness']:.3f}\n")
    
    if 'normal' in flash_crowd_analysis and flash_crowd_analysis['normal']:
        normal_stats = flash_crowd_analysis['normal']
        print(f"Normal ({normal_stats['count']} runs):")
        print(f"  Cache Hit Ratio: {normal_stats['avg_cache_hit_ratio']:.2f}%")
        print(f"  Average Latency: {normal_stats['avg_latency']:.0f}ms")
        print(f"  Bandwidth Saved: {normal_stats['avg_bandwidth_saved']:.2f}%")
        print(f"  Fairness Index: {normal_stats['avg_fairness']:.3f}\n")


def main():
    parser = argparse.ArgumentParser(description='Analyze multiple simulation runs')
    parser.add_argument('input_dir', help='Directory containing simulation result JSON files')
    parser.add_argument('-o', '--output', help='Output JSON file for analysis results')
    
    args = parser.parse_args()
    
    # Load results
    results = load_results_from_directory(args.input_dir)
    
    if not results:
        print(f"Error: No results found in {args.input_dir}", file=sys.stderr)
        sys.exit(1)
    
    print(f"Loaded {len(results)} simulation results from {args.input_dir}")
    
    # Perform analysis
    peer_count_analysis = analyze_by_peer_count(results)
    flash_crowd_analysis = analyze_by_flash_crowd(results)
    
    # Print results
    print_analysis(peer_count_analysis, flash_crowd_analysis)
    
    # Save to JSON if requested
    if args.output:
        output_data = {
            'total_runs': len(results),
            'by_peer_count': peer_count_analysis,
            'flash_crowd_comparison': flash_crowd_analysis,
        }
        
        with open(args.output, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f"\nAnalysis results saved to {args.output}")


if __name__ == '__main__':
    main()

