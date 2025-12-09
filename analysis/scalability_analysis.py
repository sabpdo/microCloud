#!/usr/bin/env python3
"""
Scalability Analysis Script

Generates visualizations and LaTeX tables for scalability experiments:
- Cache hit ratio by network size
- Jain's Fairness Index by network size
- Combined bar charts and tables
"""

import json
import os
import glob
from pathlib import Path
from typing import Dict, List, Any
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np

sns.set_style("whitegrid")
sns.set_palette("husl")
plt.rcParams['figure.figsize'] = (10, 6)
plt.rcParams['font.size'] = 11
plt.rcParams['axes.labelsize'] = 12
plt.rcParams['axes.titlesize'] = 14
plt.rcParams['xtick.labelsize'] = 10
plt.rcParams['ytick.labelsize'] = 10
plt.rcParams['legend.fontsize'] = 10
plt.rcParams['figure.dpi'] = 300
plt.rcParams['savefig.dpi'] = 300
plt.rcParams['savefig.bbox'] = 'tight'

SCALABILITY_COLOR = '#2ecc71'

def load_results(results_dir: str = 'results') -> List[Dict[str, Any]]:
    """Load all scalability experiment results from JSON files."""
    results = []
    pattern = os.path.join(results_dir, 'scalability_*.json')
    
    for filepath in sorted(glob.glob(pattern)):
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
                data['_filename'] = os.path.basename(filepath)
                results.append(data)
        except Exception as e:
            print(f"Warning: Could not load {filepath}: {e}")
    
    return results

def extract_scalability_metrics(result: Dict[str, Any]) -> Dict[str, Any]:
    """Extract key metrics from a scalability result."""
    if 'results' in result and 'microcloud' in result.get('results', {}):
        config = result.get('configuration', {})
        metadata = result.get('metadata', {})
        res = result.get('results', {}).get('microcloud', {})
        
        # Calculate network requests if not present
        network_requests = res.get('networkRequests')
        if network_requests is None:
            network_requests = res.get('peerRequests', 0) + res.get('originRequests', 0)
        
        # Calculate network cache hit ratio if not present
        network_cache_hit_ratio = res.get('networkCacheHitRatio')
        if network_cache_hit_ratio is None and network_requests > 0:
            network_cache_hit_ratio = (res.get('peerRequests', 0) / network_requests) * 100
        
        return {
            'numPeers': config.get('numPeers', 0),
            'networkCacheHitRatio': network_cache_hit_ratio or 0,
            'jainFairnessIndex': res.get('jainFairnessIndex', 0),
            'avgLatency': res.get('networkAvgLatency') or res.get('avgLatency', 0),
            'peerRequests': res.get('peerRequests', 0),
            'originRequests': res.get('originRequests', 0),
            'totalRequests': res.get('totalRequests', 0),
        }
    return {}

def create_cache_hit_chart(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create histogram-style chart of cache hit ratio by network size."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_scalability_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No scalability results found")
        return
    
    # Sort by number of peers
    df = df.sort_values('numPeers')
    
    # Create figure
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Use equidistant x positions (histogram style)
    x_positions = np.arange(len(df))
    bar_width = 0.8  # Bars touch each other (histogram style)
    
    # Create histogram-style bars (touching, no gaps)
    bars = ax.bar(x_positions, df['networkCacheHitRatio'], 
                   width=bar_width, color=SCALABILITY_COLOR, alpha=0.7, 
                   edgecolor='black', linewidth=1.5)
    
    # Add value labels on bars
    for i, (x_pos, hit_ratio) in enumerate(zip(x_positions, df['networkCacheHitRatio'])):
        ax.text(x_pos, hit_ratio + 1, f'{hit_ratio:.1f}%', 
                ha='center', va='bottom', fontsize=11, fontweight='bold')
    
    ax.set_xlabel('Number of Peers', fontweight='bold')
    ax.set_ylabel('Network Cache Hit Ratio (%)', fontweight='bold')
    ax.set_title('Scalability: Network Cache Hit Ratio by Network Size', fontweight='bold', pad=20)
    ax.set_ylim(0, max(df['networkCacheHitRatio']) * 1.15)
    ax.grid(axis='y', alpha=0.3, linestyle='--')
    
    # Set x-axis ticks to show peer counts at equidistant positions
    ax.set_xticks(x_positions)
    ax.set_xticklabels(df['numPeers'].astype(int))
    
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'scalability_cache_hit_ratio.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved cache hit ratio chart: {chart_path}")

def create_jains_fairness_chart(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create histogram-style chart of Jain's Fairness Index by network size."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_scalability_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No scalability results found")
        return
    
    # Sort by number of peers
    df = df.sort_values('numPeers')
    
    # Create figure
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Use equidistant x positions (histogram style)
    x_positions = np.arange(len(df))
    bar_width = 0.8  # Bars touch each other (histogram style)
    
    # Create histogram-style bars (touching, no gaps)
    bars = ax.bar(x_positions, df['jainFairnessIndex'], 
                   width=bar_width, color=SCALABILITY_COLOR, alpha=0.7, 
                   edgecolor='black', linewidth=1.5)
    
    # Add value labels on bars
    for i, (x_pos, fairness) in enumerate(zip(x_positions, df['jainFairnessIndex'])):
        ax.text(x_pos, fairness + 0.005, f'{fairness:.3f}', 
                ha='center', va='bottom', fontsize=10, fontweight='bold')
    
    ax.set_xlabel('Number of Peers', fontweight='bold')
    ax.set_ylabel("Jain's Fairness Index", fontweight='bold')
    ax.set_title("Scalability: Jain's Fairness Index by Network Size", fontweight='bold', pad=20)
    ax.set_ylim(0, max(df['jainFairnessIndex']) * 1.2)
    ax.grid(axis='y', alpha=0.3, linestyle='--')
    
    # Set x-axis ticks to show peer counts at equidistant positions
    ax.set_xticks(x_positions)
    ax.set_xticklabels(df['numPeers'].astype(int))
    
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'scalability_jains_fairness.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved Jain's fairness chart: {chart_path}")

def create_combined_chart(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create combined histogram-style chart with both metrics."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_scalability_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No scalability results found")
        return
    
    # Sort by number of peers
    df = df.sort_values('numPeers')
    
    # Use equidistant x positions (histogram style)
    x_positions = np.arange(len(df))
    bar_width = 0.8  # Bars touch each other (histogram style)
    
    # Create figure with two subplots
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))
    
    # Cache hit ratio chart (histogram style)
    bars1 = ax1.bar(x_positions, df['networkCacheHitRatio'], 
                    width=bar_width, color=SCALABILITY_COLOR, alpha=0.7, 
                    edgecolor='black', linewidth=1.5)
    for x_pos, hit_ratio in zip(x_positions, df['networkCacheHitRatio']):
        ax1.text(x_pos, hit_ratio + 1, f'{hit_ratio:.1f}%', 
                ha='center', va='bottom', fontsize=10, fontweight='bold')
    ax1.set_xlabel('Number of Peers', fontweight='bold')
    ax1.set_ylabel('Network Cache Hit Ratio (%)', fontweight='bold')
    ax1.set_title('Network Cache Hit Ratio', fontweight='bold', pad=15)
    ax1.set_ylim(0, max(df['networkCacheHitRatio']) * 1.15)
    ax1.grid(axis='y', alpha=0.3, linestyle='--')
    ax1.set_xticks(x_positions)
    ax1.set_xticklabels(df['numPeers'].astype(int))
    
    # Jain's Fairness Index chart (histogram style)
    bars2 = ax2.bar(x_positions, df['jainFairnessIndex'], 
                    width=bar_width, color=SCALABILITY_COLOR, alpha=0.7, 
                    edgecolor='black', linewidth=1.5)
    for x_pos, fairness in zip(x_positions, df['jainFairnessIndex']):
        ax2.text(x_pos, fairness + 0.005, f'{fairness:.3f}', 
                ha='center', va='bottom', fontsize=10, fontweight='bold')
    ax2.set_xlabel('Number of Peers', fontweight='bold')
    ax2.set_ylabel("Jain's Fairness Index", fontweight='bold')
    ax2.set_title("Jain's Fairness Index", fontweight='bold', pad=15)
    ax2.set_ylim(0, max(df['jainFairnessIndex']) * 1.2)
    ax2.grid(axis='y', alpha=0.3, linestyle='--')
    ax2.set_xticks(x_positions)
    ax2.set_xticklabels(df['numPeers'].astype(int))
    
    plt.suptitle('Scalability Metrics by Network Size', fontsize=16, fontweight='bold', y=1.02)
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'scalability_combined_metrics.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved combined metrics chart: {chart_path}")

def create_scalability_table(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create LaTeX table with scalability metrics."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_scalability_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    if df.empty:
        print("⚠ No scalability results found")
        return
    
    # Sort by number of peers
    df = df.sort_values('numPeers')
    
    # Create LaTeX table
    latex_lines = [
        "\\begin{table}[h]",
        "\\centering",
        "\\caption{Scalability Metrics by Network Size}",
        "\\label{tab:scalability-metrics}",
        "\\begin{tabular}{lrrr}",
        "\\toprule",
        "Number of Peers & Cache Hit Ratio (\\%) & Jain's Index & Avg Latency (ms) \\\\",
        "\\midrule"
    ]
    
    for _, row in df.iterrows():
        latex_lines.append(
            f"{int(row['numPeers'])} & {row['networkCacheHitRatio']:.1f} & {row['jainFairnessIndex']:.3f} & {row['avgLatency']:.1f} \\\\"
        )
    
    latex_lines.extend([
        "\\bottomrule",
        "\\end{tabular}",
        "\\end{table}"
    ])
    
    latex_content = "\n".join(latex_lines)
    table_path = os.path.join(output_dir, 'scalability_metrics_table.tex')
    
    with open(table_path, 'w') as f:
        f.write(latex_content)
    
    print(f"✓ Saved LaTeX table: {table_path}")
    
    # Also save as CSV
    csv_path = os.path.join(output_dir, 'scalability_metrics_table.csv')
    df_output = df[['numPeers', 'networkCacheHitRatio', 'jainFairnessIndex', 'avgLatency']].copy()
    df_output['networkCacheHitRatio'] = df_output['networkCacheHitRatio'].round(1)
    df_output['jainFairnessIndex'] = df_output['jainFairnessIndex'].round(3)
    df_output['avgLatency'] = df_output['avgLatency'].round(1)
    df_output.columns = ['Number of Peers', 'Cache Hit Ratio (%)', "Jain's Index", 'Avg Latency (ms)']
    df_output.to_csv(csv_path, index=False)
    print(f"✓ Saved CSV table: {csv_path}")

def main():
    """Main analysis function."""
    print("=" * 60)
    print("Scalability Analysis")
    print("=" * 60)
    print()
    
    results_dir = 'results'
    output_dir = 'analysis'
    
    if not os.path.exists(results_dir):
        print(f"Error: Results directory '{results_dir}' not found!")
        return
    
    # Load scalability results
    print("Loading scalability results...")
    results = load_results(results_dir)
    
    if not results:
        print(f"No scalability results found in '{results_dir}'!")
        return
    
    print(f"✓ Loaded {len(results)} scalability experiment results\n")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Generate analyses
    print("Generating analyses...\n")
    
    create_cache_hit_chart(results, output_dir)
    print()
    
    create_jains_fairness_chart(results, output_dir)
    print()
    
    create_combined_chart(results, output_dir)
    print()
    
    create_scalability_table(results, output_dir)
    print()
    
    print("=" * 60)
    print("Analysis complete!")
    print("=" * 60)
    print(f"\nGenerated files in '{output_dir}':")
    print("  - scalability_cache_hit_ratio.png")
    print("  - scalability_jains_fairness.png")
    print("  - scalability_combined_metrics.png")
    print("  - scalability_metrics_table.tex")
    print("  - scalability_metrics_table.csv")

if __name__ == '__main__':
    main()

