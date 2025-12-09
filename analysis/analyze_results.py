#!/usr/bin/env python3
"""
Analysis Script for Simulation Experiments

Generates tables and bar charts comparing:
- Jain's fairness index across scenarios
- Baseline vs high churn
- Summary tables of all scenarios
- Latency over time for scalability
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

# Color palette for scenarios
SCENARIO_COLORS = {
    'flash_crowd': '#3498db',
    'scalability': '#2ecc71',
    'high_churn': '#e74c3c',
    'baseline': '#95a5a6',
}

def load_results(results_dir: str = 'results') -> List[Dict[str, Any]]:
    """Load all experiment results from JSON files (searches recursively)."""
    results = []
    # Search recursively in subdirectories
    pattern = os.path.join(results_dir, '**', '*.json')
    
    for filepath in glob.glob(pattern, recursive=True):
        if os.path.basename(filepath) == 'experiments_summary.json':
            continue
        
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
                data['_filename'] = os.path.basename(filepath)
                results.append(data)
        except Exception as e:
            print(f"Warning: Could not load {filepath}: {e}")
    
    return results

def extract_metrics(result: Dict[str, Any]) -> Dict[str, Any]:
    """Extract key metrics from a result."""
    # Support both old format (for backward compatibility) and new dashboard-compatible format
    if 'results' in result and 'microcloud' in result.get('results', {}):
        # New dashboard-compatible format
        config = result.get('configuration', {})
        metadata = result.get('metadata', {})
        res = result.get('results', {}).get('microcloud', {})
        
        # Calculate network requests if not present (backward compatibility)
        network_requests = res.get('networkRequests')
        if network_requests is None:
            network_requests = res.get('peerRequests', 0) + res.get('originRequests', 0)
        
        # Calculate network cache hit ratio if not present
        network_cache_hit_ratio = res.get('networkCacheHitRatio')
        if network_cache_hit_ratio is None and network_requests > 0:
            network_cache_hit_ratio = (res.get('peerRequests', 0) / network_requests) * 100
        
        # Use network avg latency if available, fallback to regular avg latency
        avg_latency = res.get('networkAvgLatency') or res.get('avgLatency', 0)
        
        return {
            'scenario': metadata.get('scenario', result.get('experimentMetadata', {}).get('scenario', 'unknown')),
            'variant': metadata.get('variant', result.get('experimentMetadata', {}).get('variant', 'unknown')),
            'numPeers': config.get('numPeers', 0),
            'duration': config.get('duration', 0),
            'joinRate': config.get('joinRate', 0),
            'churnRate': config.get('churnRate', 0),
            'baselineMode': config.get('baselineMode', False),
            'jainFairnessIndex': res.get('jainFairnessIndex', 0),
            'avgLatency': avg_latency,  # Use network-only latency for fair comparison
            'networkAvgLatency': res.get('networkAvgLatency', avg_latency),
            'cacheHitRatio': res.get('cacheHitRatio', 0),
            'networkCacheHitRatio': network_cache_hit_ratio or 0,  # P2P effectiveness on network requests
            'bandwidthSaved': res.get('bandwidthSaved', 0),
            'latencyImprovement': res.get('latencyImprovement', 0),
            'totalRequests': res.get('totalRequests', 0),
            'networkRequests': network_requests,  # Network requests only (for fair comparison)
            'peerRequests': res.get('peerRequests', 0),
            'originRequests': res.get('originRequests', 0),
            'localCacheHits': res.get('localCacheHits', 0),
            'timeSeriesData': res.get('timeSeriesData', []),
        }
    else:
        # Old format (backward compatibility)
        config = result.get('config', {})
        res = result.get('results', {})
        
        # Calculate network requests if not present
        network_requests = res.get('networkRequests')
        if network_requests is None:
            network_requests = res.get('peerRequests', 0) + res.get('originRequests', 0)
        
        # Calculate network cache hit ratio if not present
        network_cache_hit_ratio = res.get('networkCacheHitRatio')
        if network_cache_hit_ratio is None and network_requests > 0:
            network_cache_hit_ratio = (res.get('peerRequests', 0) / network_requests) * 100
        
        # Use network avg latency if available, fallback to regular avg latency
        avg_latency = res.get('networkAvgLatency') or res.get('avgLatency', 0)
        
        return {
            'scenario': result.get('scenario', 'unknown'),
            'variant': result.get('variant', 'unknown'),
            'numPeers': config.get('numPeers', 0),
            'duration': config.get('duration', 0),
            'joinRate': config.get('joinRate', 0),
            'churnRate': config.get('churnRate', 0),
            'baselineMode': config.get('baselineMode', False),
            'jainFairnessIndex': res.get('jainFairnessIndex', 0),
            'avgLatency': avg_latency,  # Use network-only latency for fair comparison
            'networkAvgLatency': res.get('networkAvgLatency', avg_latency),
            'cacheHitRatio': res.get('cacheHitRatio', 0),
            'networkCacheHitRatio': network_cache_hit_ratio or 0,
            'bandwidthSaved': res.get('bandwidthSaved', 0),
            'latencyImprovement': res.get('latencyImprovement', 0),
            'totalRequests': res.get('totalRequests', 0),
            'networkRequests': network_requests,
            'peerRequests': res.get('peerRequests', 0),
            'originRequests': res.get('originRequests', 0),
            'localCacheHits': res.get('localCacheHits', 0),
            'timeSeriesData': res.get('timeSeriesData', []),
        }

def create_jains_fairness_table(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create table of Jain's fairness index for all scenarios."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    # Filter out baseline mode for fairness comparison (baseline doesn't have P2P)
    df_p2p = df[~df['baselineMode']].copy()
    
    # Create pivot table: scenario x numPeers -> jainFairnessIndex
    pivot = df_p2p.pivot_table(
        values='jainFairnessIndex',
        index='scenario',
        columns='numPeers',
        aggfunc='mean'
    )
    
    # Format for display
    pivot_formatted = pivot.round(3)
    
    # Save as CSV
    csv_path = os.path.join(output_dir, 'jains_fairness_table.csv')
    pivot_formatted.to_csv(csv_path)
    print(f"✓ Saved Jain's fairness table: {csv_path}")
    
    # Create LaTeX table
    latex_path = os.path.join(output_dir, 'jains_fairness_table.tex')
    with open(latex_path, 'w') as f:
        f.write("\\begin{table}[h]\n")
        f.write("\\centering\n")
        f.write("\\caption{Jain's Fairness Index by Scenario and Number of Peers}\n")
        f.write("\\label{tab:jains-fairness}\n")
        f.write(pivot_formatted.to_latex(float_format="%.3f"))
        f.write("\\end{table}\n")
    print(f"✓ Saved LaTeX table: {latex_path}")
    
    # Create bar chart
    fig, ax = plt.subplots(figsize=(12, 6))
    
    x = np.arange(len(pivot.index))
    width = 0.2
    num_peer_cols = len(pivot.columns)
    
    for i, num_peers in enumerate(pivot.columns):
        offset = (i - num_peer_cols / 2) * width + width / 2
        values = pivot[num_peers].values
        color = SCENARIO_COLORS.get(pivot.index[0], '#95a5a6') if len(pivot.index) == 1 else None
        
        if num_peer_cols == 1:
            bars = ax.bar(x + offset, values, width, label=f'{num_peers} peers',
                         color=[SCENARIO_COLORS.get(s, '#95a5a6') for s in pivot.index])
        else:
            bars = ax.bar(x + offset, values, width, label=f'{num_peers} peers')
    
    ax.set_xlabel('Scenario')
    ax.set_ylabel("Jain's Fairness Index")
    ax.set_title("Jain's Fairness Index Across Scenarios")
    ax.set_xticks(x)
    ax.set_xticklabels(pivot.index, rotation=45, ha='right')
    ax.legend(title='Number of Peers')
    ax.set_ylim([0, 1.1])
    ax.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'jains_fairness_bar_chart.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved bar chart: {chart_path}")

def create_baseline_vs_high_churn_comparison(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Compare baseline vs high churn scenarios."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    # Get baseline results
    baseline = df[df['baselineMode'] == True].copy()
    
    # Get high churn results
    high_churn = df[(df['scenario'] == 'high_churn') & (df['baselineMode'] == False)].copy()
    
    # Create comparison table (using network-only metrics for fair comparison)
    comparison_data = []
    
    # Baseline metrics
    for _, row in baseline.iterrows():
        comparison_data.append({
            'Scenario': 'Baseline',
            'Churn Rate': 0,
            'Num Peers': row['numPeers'],
            'Network Requests': row.get('networkRequests', row['peerRequests'] + row['originRequests']),
            'Network Avg Latency (ms)': row.get('networkAvgLatency', row['avgLatency']),
            'Network Cache Hit Ratio (%)': row.get('networkCacheHitRatio', 0),
            'Origin Requests': row['originRequests'],
            "Jain's Index": 0,  # Baseline doesn't have P2P fairness
        })
    
    # High churn metrics
    for _, row in high_churn.iterrows():
        comparison_data.append({
            'Scenario': 'High Churn',
            'Churn Rate': row['churnRate'],
            'Num Peers': row['numPeers'],
            'Network Requests': row.get('networkRequests', row['peerRequests'] + row['originRequests']),
            'Network Avg Latency (ms)': row.get('networkAvgLatency', row['avgLatency']),
            'Network Cache Hit Ratio (%)': row.get('networkCacheHitRatio', row.get('bandwidthSaved', 0)),
            'Origin Requests': row['originRequests'],
            "Jain's Index": row['jainFairnessIndex'],
        })
    
    comp_df = pd.DataFrame(comparison_data)
    
    # Save CSV
    csv_path = os.path.join(output_dir, 'baseline_vs_high_churn.csv')
    comp_df.to_csv(csv_path, index=False)
    print(f"✓ Saved comparison table: {csv_path}")
    
    # Calculate origin request ratio and latency
    baseline['network_requests'] = baseline.get('networkRequests', baseline['peerRequests'] + baseline['originRequests'])
    baseline['origin_ratio'] = baseline['originRequests'] / baseline['network_requests'].replace(0, 1) * 100
    baseline['latency_for_comparison'] = baseline.get('networkAvgLatency', baseline['avgLatency'])
    
    high_churn['network_requests'] = high_churn.get('networkRequests', high_churn['peerRequests'] + high_churn['originRequests'])
    high_churn['origin_ratio'] = high_churn['originRequests'] / high_churn['network_requests'].replace(0, 1) * 100
    high_churn['latency_for_comparison'] = high_churn.get('networkAvgLatency', high_churn['avgLatency'])
    
    # Calculate baseline metrics (averaged across all baseline runs)
    # NOTE: Baseline mode doesn't use P2P, so churn rate doesn't affect baseline performance.
    # All requests go directly to origin regardless of churn configuration. Therefore,
    # we average all baseline runs together and show the same value at each churn rate
    # position for fair comparison with high churn scenarios.
    baseline_ratio_avg = baseline['origin_ratio'].mean()
    baseline_lat_avg = baseline['latency_for_comparison'].mean()
    
    # Group high churn by churnRate (averaging across numPeers for each churn rate)
    churn_ratio = high_churn.groupby('churnRate')['origin_ratio'].mean()
    churn_lat = high_churn.groupby('churnRate')['latency_for_comparison'].mean()
    
    # Get all churn rates from high churn data
    churn_rates = sorted(churn_ratio.index.tolist())
    
    if not churn_rates:
        print("No high churn data found for comparison")
        return
    
    # Create plot with origin ratio as bars and latency as line overlay
    fig, ax = plt.subplots(figsize=(12, 7))
    
    # Determine x positions: baseline at position 0, then churn rates at positions 1, 2, 3, etc.
    # Baseline is shown once on the left, not repeated at each churn rate
    x_baseline = 0
    x_churn = np.arange(1, len(churn_rates) + 1)
    width = 0.6  # Width for each bar
    
    # Plot baseline bar (gray) once on the left
    ax.bar(x_baseline, baseline_ratio_avg, width, label='Baseline (Origin Ratio)', 
           color=SCENARIO_COLORS['baseline'], alpha=0.7)
    
    # Plot high churn bars (colored) at each churn rate position
    churn_ratio_values = [churn_ratio.get(cr, baseline_ratio_avg) for cr in churn_rates]
    ax.bar(x_churn, churn_ratio_values, width, label='High Churn (Origin Ratio)', 
           color=SCENARIO_COLORS['high_churn'], alpha=0.7)
    
    # Create secondary y-axis for latency
    ax2 = ax.twinx()
    
    # Plot baseline latency line (gray) once on the left
    ax2.plot(x_baseline, baseline_lat_avg, 'o--', linewidth=2, markersize=8,
            label='Baseline (Latency)', color=SCENARIO_COLORS['baseline'], alpha=0.8)
    
    # Plot high churn latency line (black) at each churn rate position
    churn_lat_values = [churn_lat.get(cr, baseline_lat_avg) for cr in churn_rates]
    ax2.plot(x_churn, churn_lat_values, 'o--', linewidth=2, markersize=8,
            label='High Churn (Latency)', color='black', alpha=0.9)
    
    # Set labels and titles
    ax.set_xlabel('Churn Rate', fontsize=12)
    ax.set_ylabel('Origin Request Ratio (%)', fontsize=12, color='black')
    ax2.set_ylabel('Network Avg Latency (ms)', fontsize=12, color='black')
    ax.set_title('Origin Request Ratio and Latency: Baseline vs High Churn', fontsize=14, fontweight='bold')
    
    # Set x-axis ticks: baseline at 0, then churn rates
    all_x_positions = [x_baseline] + x_churn.tolist()
    all_labels = ['Baseline'] + [f'{cr:.3f}' for cr in churn_rates]
    ax.set_xticks(all_x_positions)
    ax.set_xticklabels(all_labels)
    
    # Combine legends
    lines1, labels1 = ax.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax.legend(lines1 + lines2, labels1 + labels2, loc='upper left', fontsize=10)
    
    # Grid
    ax.grid(axis='y', alpha=0.3)
    ax2.grid(axis='y', alpha=0.2, linestyle=':')
    
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'baseline_vs_high_churn_comparison.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved comparison chart: {chart_path}")

def create_summary_table(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create summary table of all scenarios."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    # Create summary by scenario (using network-only metrics for fair comparison)
    summary_cols = ['scenario', 'numPeers', 'joinRate', 'churnRate', 'baselineMode']
    
    # Use network metrics if available, fallback to regular metrics
    df['latency_for_summary'] = df.get('networkAvgLatency', df['avgLatency'])
    df['hit_ratio_for_summary'] = df.get('networkCacheHitRatio', df.get('bandwidthSaved', df.get('cacheHitRatio', 0)))
    df['network_requests_for_summary'] = df.get('networkRequests', df['peerRequests'] + df['originRequests'])
    
    agg_dict = {
        'latency_for_summary': 'mean',
        'hit_ratio_for_summary': 'mean',
        'network_requests_for_summary': 'mean',
        'originRequests': 'mean',
        'jainFairnessIndex': 'mean',
        'totalRequests': 'mean',
    }
    
    summary = df.groupby(summary_cols).agg(agg_dict).reset_index()
    
    # Format for readability
    summary['Scenario'] = summary['scenario'].str.replace('_', ' ').str.title()
    summary['Num Peers'] = summary['numPeers']
    summary['Join Rate'] = summary['joinRate'].apply(lambda x: f'{x:.1f}' if x > 0 else 'N/A')
    summary['Churn Rate'] = summary['churnRate'].apply(lambda x: f'{x:.3f}' if x > 0 else '0')
    summary['Baseline'] = summary['baselineMode'].apply(lambda x: 'Yes' if x else 'No')
    summary['Network Avg Latency (ms)'] = summary['latency_for_summary'].round(1)
    summary['Network Cache Hit Ratio (%)'] = summary['hit_ratio_for_summary'].round(2)
    summary['Network Requests'] = summary['network_requests_for_summary'].round(0).astype(int)
    summary['Origin Requests'] = summary['originRequests'].round(0).astype(int)
    summary["Jain's Index"] = summary['jainFairnessIndex'].round(3)
    summary['Total Requests'] = summary['totalRequests'].round(0).astype(int)
    
    display_cols = ['Scenario', 'Num Peers', 'Join Rate', 'Churn Rate', 'Baseline',
                   'Network Avg Latency (ms)', 'Network Cache Hit Ratio (%)', 'Network Requests',
                   'Origin Requests', "Jain's Index", 'Total Requests']
    
    summary_display = summary[display_cols].copy()
    
    # Save CSV
    csv_path = os.path.join(output_dir, 'summary_table.csv')
    summary_display.to_csv(csv_path, index=False)
    print(f"✓ Saved summary table: {csv_path}")
    
    # Create LaTeX table
    latex_path = os.path.join(output_dir, 'summary_table.tex')
    with open(latex_path, 'w') as f:
        f.write("\\begin{table}[h]\n")
        f.write("\\centering\n")
        f.write("\\caption{Summary of All Experiment Scenarios}\n")
        f.write("\\label{tab:summary}\n")
        f.write("\\resizebox{\\textwidth}{!}{")
        f.write(summary_display.to_latex(index=False, float_format="%.2f"))
        f.write("}\n")
        f.write("\\end{table}\n")
    print(f"✓ Saved LaTeX table: {latex_path}")

def create_scalability_latency_over_time(results: List[Dict[str, Any]], output_dir: str = 'analysis'):
    """Create latency over time charts for scalability scenario."""
    os.makedirs(output_dir, exist_ok=True)
    
    metrics = [extract_metrics(r) for r in results]
    df = pd.DataFrame(metrics)
    
    # Filter scalability scenario
    scalability = df[df['scenario'] == 'scalability'].copy()
    
    if scalability.empty:
        print("⚠ No scalability results found")
        return
    
    # Create figure with subplots for each numPeers
    num_peers_list = sorted(scalability['numPeers'].unique())
    n_plots = len(num_peers_list)
    
    if n_plots == 0:
        print("⚠ No scalability data to plot")
        return
    
    cols = min(3, n_plots)
    rows = (n_plots + cols - 1) // cols
    
    fig, axes = plt.subplots(rows, cols, figsize=(15, 5*rows))
    if n_plots == 1:
        axes = [axes]
    else:
        axes = axes.flatten()
    
    for idx, num_peers in enumerate(num_peers_list):
        ax = axes[idx]
        
        # Get time series data for this numPeers
        row = scalability[scalability['numPeers'] == num_peers].iloc[0]
        time_series = row['timeSeriesData']
        
        # Handle case where timeSeriesData might be a list or empty
        if not isinstance(time_series, list):
            time_series = []
        
        if not time_series:
            ax.text(0.5, 0.5, 'No time series data', ha='center', va='center', transform=ax.transAxes)
            ax.set_title(f'{num_peers} Peers')
            continue
        
        times = [d['time'] for d in time_series]
        latencies = [d['avgLatency'] for d in time_series]
        
        ax.plot(times, latencies, linewidth=2, color=SCENARIO_COLORS['scalability'])
        ax.set_xlabel('Time (seconds)')
        ax.set_ylabel('Average Latency (ms)')
        ax.set_title(f'Latency Over Time: {num_peers} Peers')
        ax.grid(alpha=0.3)
    
    # Hide unused subplots
    for idx in range(n_plots, len(axes)):
        axes[idx].set_visible(False)
    
    plt.tight_layout()
    chart_path = os.path.join(output_dir, 'scalability_latency_over_time.png')
    plt.savefig(chart_path)
    plt.close()
    print(f"✓ Saved latency over time chart: {chart_path}")

def main():
    """Main analysis function."""
    parser = argparse.ArgumentParser(description='Analyze simulation experiment results')
    parser.add_argument('--results-dir', '-r', default='results',
                        help='Directory containing JSON result files (default: results)')
    parser.add_argument('--output-dir', '-o', default='analysis',
                        help='Directory to save analysis outputs (default: analysis)')
    args = parser.parse_args()
    
    print("=" * 60)
    print("Simulation Results Analysis")
    print("=" * 60)
    print()
    
    results_dir = args.results_dir
    output_dir = args.output_dir
    
    if not os.path.exists(results_dir):
        print(f"Error: Results directory '{results_dir}' not found!")
        print("   Please run the experiment runner first: npm run experiments")
        return
    
    # Load results
    print("Loading results...")
    results = load_results(results_dir)
    
    if not results:
        print(f"No results found in '{results_dir}'!")
        print("   Please run the experiment runner first: npm run experiments")
        return
    
    print(f"✓ Loaded {len(results)} experiment results\n")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Generate analyses
    print("Generating analyses...\n")
    
    create_jains_fairness_table(results, output_dir)
    print()
    
    create_baseline_vs_high_churn_comparison(results, output_dir)
    print()
    
    create_summary_table(results, output_dir)
    print()
    
    create_scalability_latency_over_time(results, output_dir)
    print()
    
    print("=" * 60)
    print("Analysis Complete!")
    print("=" * 60)
    print(f"\nAll outputs saved to: {output_dir}/")
    print("\nGenerated files:")
    print("  - jains_fairness_table.csv / .tex")
    print("  - jains_fairness_bar_chart.png")
    print("  - baseline_vs_high_churn.csv")
    print("  - baseline_vs_high_churn_comparison.png")
    print("  - summary_table.csv / .tex")
    print("  - scalability_latency_over_time.png")
    print()

if __name__ == '__main__':
    main()

