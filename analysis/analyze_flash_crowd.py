#!/usr/bin/env python3
"""
Flash Crowd Analysis Script

Generates tables and visualizations specifically for flash crowd scenarios:
- Latency distributions across different peer counts
- P2P vs Baseline comparisons
- Cache hit ratios and bandwidth savings
- Jain's fairness index
- Summary tables formatted for research papers
"""

import json
import os
import glob
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
import pandas as pd
import numpy as np

sns.set_style("whitegrid")
sns.set_palette("husl")
plt.rcParams['figure.figsize'] = (12, 8)
plt.rcParams['font.size'] = 11
plt.rcParams['axes.labelsize'] = 12
plt.rcParams['axes.titlesize'] = 14
plt.rcParams['xtick.labelsize'] = 10
plt.rcParams['ytick.labelsize'] = 10
plt.rcParams['legend.fontsize'] = 10
plt.rcParams['figure.dpi'] = 300
plt.rcParams['savefig.dpi'] = 300
plt.rcParams['savefig.bbox'] = 'tight'

def load_flash_crowd_results(results_dir: str = 'analysis/flash_crowd') -> List[Dict[str, Any]]:
    """Load all flash crowd experiment results from JSON files."""
    results = []
    pattern = os.path.join(results_dir, '*.json')
    
    for filepath in glob.glob(pattern):
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
                data['_filename'] = os.path.basename(filepath)
                results.append(data)
        except Exception as e:
            print(f"Warning: Could not load {filepath}: {e}")
    
    return results

def extract_flash_crowd_metrics(result: Dict[str, Any]) -> Dict[str, Any]:
    """Extract key metrics from a flash crowd result."""
    config = result.get('configuration', {})
    metadata = result.get('metadata', {})
    
    # Extract microcloud results
    microcloud = result.get('results', {}).get('microcloud', {})
    baseline = result.get('results', {}).get('baseline', {})
    
    # Calculate network metrics
    microcloud_network_requests = microcloud.get('networkRequests', 
        microcloud.get('peerRequests', 0) + microcloud.get('originRequests', 0))
    baseline_network_requests = baseline.get('networkRequests',
        baseline.get('peerRequests', 0) + baseline.get('originRequests', 0))
    
    return {
        'numPeers': config.get('numPeers', 0),
        'joinRate': config.get('joinRate', 0),
        'churnRate': config.get('churnRate', 0),
        'duration': config.get('duration', 0),
        'targetFile': config.get('targetFile', ''),
        
        # Microcloud metrics
        'microcloud_totalRequests': microcloud.get('totalRequests', 0),
        'microcloud_peerRequests': microcloud.get('peerRequests', 0),
        'microcloud_originRequests': microcloud.get('originRequests', 0),
        'microcloud_localCacheHits': microcloud.get('localCacheHits', 0),
        'microcloud_networkRequests': microcloud_network_requests,
        'microcloud_cacheHitRatio': microcloud.get('cacheHitRatio', 0),
        'microcloud_networkCacheHitRatio': microcloud.get('networkCacheHitRatio', 0),
        'microcloud_bandwidthSaved': microcloud.get('bandwidthSaved', 0),
        'microcloud_avgLatency': microcloud.get('avgLatency', 0),
        'microcloud_networkAvgLatency': microcloud.get('networkAvgLatency', 0),
        'microcloud_latencyImprovement': microcloud.get('latencyImprovement', 0),
        'microcloud_jainFairnessIndex': microcloud.get('jainFairnessIndex', 0),
        
        # Baseline metrics
        'baseline_totalRequests': baseline.get('totalRequests', 0),
        'baseline_peerRequests': baseline.get('peerRequests', 0),
        'baseline_originRequests': baseline.get('originRequests', 0),
        'baseline_localCacheHits': baseline.get('localCacheHits', 0),
        'baseline_networkRequests': baseline_network_requests,
        'baseline_cacheHitRatio': baseline.get('cacheHitRatio', 0),
        'baseline_networkCacheHitRatio': baseline.get('networkCacheHitRatio', 0),
        'baseline_bandwidthSaved': baseline.get('bandwidthSaved', 0),
        'baseline_avgLatency': baseline.get('avgLatency', 0),
        'baseline_networkAvgLatency': baseline.get('networkAvgLatency', 0),
        'baseline_latencyImprovement': baseline.get('latencyImprovement', 0),
        'baseline_jainFairnessIndex': baseline.get('jainFairnessIndex', 0),
        
        # Latency distribution data (if available)
        'microcloud_latencyDistribution': microcloud.get('latencyDistribution', []),
        'baseline_latencyDistribution': baseline.get('latencyDistribution', []),
    }

def create_flash_crowd_summary_table(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create summary table comparing P2P vs Baseline across different peer counts."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_flash_crowd_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No flash crowd results found")
        return
    
    # Sort by number of peers
    df = df.sort_values('numPeers')
    
    # Create summary table
    summary_data = []
    for _, row in df.iterrows():
        summary_data.append({
            'Num Peers': int(row['numPeers']),
            'Join Rate (peers/s)': int(row['joinRate']),
            'Duration (s)': int(row['duration']),
            
            # P2P Metrics
            'P2P Network Avg Latency (ms)': round(row['microcloud_networkAvgLatency'], 1),
            'P2P Cache Hit Ratio (%)': round(row['microcloud_networkCacheHitRatio'], 2),
            'P2P Bandwidth Saved (%)': round(row['microcloud_bandwidthSaved'], 2),
            'P2P Latency Improvement (%)': round(row['microcloud_latencyImprovement'], 2),
            "P2P Jain's Index": round(row['microcloud_jainFairnessIndex'], 3),
            'P2P Origin Requests': int(row['microcloud_originRequests']),
            
            # Baseline Metrics
            'Baseline Network Avg Latency (ms)': round(row['baseline_networkAvgLatency'], 1),
            'Baseline Cache Hit Ratio (%)': round(row['baseline_networkCacheHitRatio'], 2),
            'Baseline Origin Requests': int(row['baseline_originRequests']),
            
            # Comparison
            'Latency Reduction (ms)': round(row['baseline_networkAvgLatency'] - row['microcloud_networkAvgLatency'], 1),
            'Latency Reduction (%)': round(row['microcloud_latencyImprovement'], 2),
            'Origin Load Reduction': int(row['baseline_originRequests'] - row['microcloud_originRequests']),
            'Origin Load Reduction (%)': round(
                ((row['baseline_originRequests'] - row['microcloud_originRequests']) / row['baseline_originRequests'] * 100) 
                if row['baseline_originRequests'] > 0 else 0, 2
            ),
        })
    
    summary_df = pd.DataFrame(summary_data)
    
    # Save CSV
    csv_path = os.path.join(output_dir, 'flash_crowd_summary_table.csv')
    summary_df.to_csv(csv_path, index=False)
    print(f"✓ Saved flash crowd summary table: {csv_path}")
    
    # Create LaTeX table
    latex_path = os.path.join(output_dir, 'flash_crowd_summary_table.tex')
    with open(latex_path, 'w') as f:
        f.write("\\begin{table}[h]\n")
        f.write("\\centering\n")
        f.write("\\caption{Flash Crowd Performance: P2P vs Baseline}\n")
        f.write("\\label{tab:flash-crowd-summary}\n")
        f.write("\\resizebox{\\textwidth}{!}{")
        f.write(summary_df.to_latex(index=False, float_format="%.2f"))
        f.write("}\n")
        f.write("\\end{table}\n")
    print(f"✓ Saved LaTeX table: {latex_path}")

def create_latency_comparison_chart(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create latency comparison chart across peer counts."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_flash_crowd_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No flash crowd results found for latency comparison")
        return
    
    df = df.sort_values('numPeers')
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))
    
    # Left plot: Latency comparison
    # Use integer positions for x-axis to make bars visible
    x_pos = np.arange(len(df))
    x_labels = [f'{int(p)}' for p in df['numPeers'].values]
    width = 0.35
    
    ax1.bar(x_pos - width/2, df['microcloud_networkAvgLatency'], width, 
            label='P2P (µCloud)', color='#3498db', alpha=0.8, edgecolor='black', linewidth=0.5)
    ax1.bar(x_pos + width/2, df['baseline_networkAvgLatency'], width,
            label='Baseline (Origin Only)', color='#95a5a6', alpha=0.8, edgecolor='black', linewidth=0.5)
    
    ax1.set_xlabel('Number of Peers', fontsize=12)
    ax1.set_ylabel('Network Average Latency (ms)', fontsize=12)
    ax1.set_title('Latency Comparison: P2P vs Baseline', fontsize=14, fontweight='bold')
    ax1.set_xticks(x_pos)
    ax1.set_xticklabels(x_labels)
    ax1.legend(fontsize=10)
    ax1.grid(axis='y', alpha=0.3)
    
    # Right plot: Latency improvement percentage
    latency_improvement = df['microcloud_latencyImprovement'].values
    colors = ['#2ecc71' if x > 0 else '#e74c3c' for x in latency_improvement]
    
    ax2.bar(x_pos, latency_improvement, width=width*2, color=colors, alpha=0.8, 
            edgecolor='black', linewidth=0.5)
    ax2.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
    ax2.set_xlabel('Number of Peers', fontsize=12)
    ax2.set_ylabel('Latency Improvement (%)', fontsize=12)
    ax2.set_title('Latency Improvement with P2P Caching', fontsize=14, fontweight='bold')
    ax2.set_xticks(x_pos)
    ax2.set_xticklabels(x_labels)
    ax2.grid(axis='y', alpha=0.3)
    
    # Add value labels on bars
    for i, v in enumerate(latency_improvement):
        ax2.text(x_pos[i], v + (1 if v >= 0 else -3), f'{v:.1f}%', 
                ha='center', va='bottom' if v >= 0 else 'top', fontsize=9)
    
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'flash_crowd_latency_comparison.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved latency comparison chart: {chart_path}")

def create_cache_hit_ratio_chart(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create cache hit ratio comparison chart."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_flash_crowd_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No flash crowd results found for cache hit ratio")
        return
    
    df = df.sort_values('numPeers')
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Use integer positions for x-axis to make bars visible
    x_pos = np.arange(len(df))
    x_labels = [f'{int(p)}' for p in df['numPeers'].values]
    width = 0.6
    
    # Only show P2P cache hit ratio (baseline is always 0% since it doesn't use P2P)
    ax.bar(x_pos, df['microcloud_networkCacheHitRatio'], width,
           label='P2P Network Cache Hit Ratio', color='#3498db', alpha=0.8, 
           edgecolor='black', linewidth=0.5)
    
    ax.set_xlabel('Number of Peers', fontsize=12)
    ax.set_ylabel('Cache Hit Ratio (%)', fontsize=12)
    ax.set_title('P2P Network Cache Hit Ratio in Flash Crowd Scenarios', fontsize=14, fontweight='bold')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(x_labels)
    ax.legend(fontsize=10)
    ax.grid(axis='y', alpha=0.3)
    ax.set_ylim([0, 100])
    
    # Add value labels
    for i, p2p in enumerate(df['microcloud_networkCacheHitRatio']):
        ax.text(x_pos[i], p2p + 2, f'{p2p:.1f}%', 
                ha='center', va='bottom', fontsize=9)
    
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'flash_crowd_cache_hit_ratio.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved cache hit ratio chart: {chart_path}")

def create_origin_load_reduction_table(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create table showing origin server load reduction."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_flash_crowd_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No flash crowd results found")
        return
    
    df = df.sort_values('numPeers')
    
    load_data = []
    for _, row in df.iterrows():
        baseline_requests = row['baseline_originRequests']
        p2p_requests = row['microcloud_originRequests']
        reduction = baseline_requests - p2p_requests
        reduction_pct = (reduction / baseline_requests * 100) if baseline_requests > 0 else 0
        
        load_data.append({
            'Num Peers': int(row['numPeers']),
            'Baseline Origin Requests': int(baseline_requests),
            'P2P Origin Requests': int(p2p_requests),
            'Load Reduction': int(reduction),
            'Load Reduction (%)': round(reduction_pct, 2),
            'Bandwidth Saved (%)': round(row['microcloud_bandwidthSaved'], 2),
        })
    
    load_df = pd.DataFrame(load_data)
    
    # Save CSV
    csv_path = os.path.join(output_dir, 'flash_crowd_origin_load_reduction.csv')
    load_df.to_csv(csv_path, index=False)
    print(f"✓ Saved origin load reduction table: {csv_path}")
    
    # Create LaTeX table
    latex_path = os.path.join(output_dir, 'flash_crowd_origin_load_reduction.tex')
    with open(latex_path, 'w') as f:
        f.write("\\begin{table}[h]\n")
        f.write("\\centering\n")
        f.write("\\caption{Origin Server Load Reduction in Flash Crowd Scenarios}\n")
        f.write("\\label{tab:flash-crowd-load-reduction}\n")
        f.write(load_df.to_latex(index=False, float_format="%.2f"))
        f.write("\\end{table}\n")
    print(f"✓ Saved LaTeX table: {latex_path}")

def create_fairness_comparison(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create Jain's fairness index comparison."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_flash_crowd_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No flash crowd results found for fairness comparison")
        return
    
    df = df.sort_values('numPeers')
    
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Use integer positions for x-axis to make bars visible
    x_pos = np.arange(len(df))
    x_labels = [f'{int(p)}' for p in df['numPeers'].values]
    fairness = df['microcloud_jainFairnessIndex'].values
    width = 0.6
    
    bars = ax.bar(x_pos, fairness, width=width, color='#9b59b6', alpha=0.8, 
                   edgecolor='black', linewidth=0.5)
    
    ax.set_xlabel('Number of Peers', fontsize=12)
    ax.set_ylabel("Jain's Fairness Index", fontsize=12)
    ax.set_title("Jain's Fairness Index Across Flash Crowd Scenarios", fontsize=14, fontweight='bold')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(x_labels)
    ax.set_ylim([0, 1])
    ax.grid(axis='y', alpha=0.3)
    
    # Add value labels
    for i, v in enumerate(fairness):
        ax.text(x_pos[i], v + 0.02, f'{v:.3f}', ha='center', va='bottom', fontsize=9)
    
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'flash_crowd_fairness_index.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved fairness index chart: {chart_path}")

def main():
    """Main analysis function."""
    parser = argparse.ArgumentParser(description='Analyze flash crowd simulation results')
    parser.add_argument('--results-dir', '-r', default='analysis/flash_crowd',
                        help='Directory containing flash crowd JSON result files (default: analysis/flash_crowd)')
    parser.add_argument('--output-dir', '-o', default='analysis',
                        help='Directory to save analysis outputs (default: analysis)')
    args = parser.parse_args()
    
    print("=" * 60)
    print("Flash Crowd Results Analysis")
    print("=" * 60)
    print()
    
    results_dir = args.results_dir
    output_dir = args.output_dir
    
    if not os.path.exists(results_dir):
        print(f"Error: Results directory '{results_dir}' not found!")
        return
    
    # Load results
    print("Loading flash crowd results...")
    results = load_flash_crowd_results(results_dir)
    
    if not results:
        print(f"No results found in '{results_dir}'!")
        return
    
    print(f"✓ Loaded {len(results)} flash crowd experiment results\n")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Generate analyses
    print("Generating flash crowd analyses...\n")
    
    create_flash_crowd_summary_table(results, output_dir)
    print()
    
    create_latency_comparison_chart(results, output_dir)
    print()
    
    create_cache_hit_ratio_chart(results, output_dir)
    print()
    
    create_origin_load_reduction_table(results, output_dir)
    print()
    
    create_fairness_comparison(results, output_dir)
    print()
    
    print("=" * 60)
    print("Flash Crowd Analysis Complete!")
    print("=" * 60)
    print(f"\nAll outputs saved to: {output_dir}/")
    print("\nGenerated files:")
    print("  - flash_crowd_summary_table.csv / .tex")
    print("  - flash_crowd_latency_comparison.png")
    print("  - flash_crowd_cache_hit_ratio.png")
    print("  - flash_crowd_origin_load_reduction.csv / .tex")
    print("  - flash_crowd_fairness_index.png")
    print()

if __name__ == '__main__':
    main()
