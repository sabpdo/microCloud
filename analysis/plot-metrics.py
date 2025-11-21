#!/usr/bin/env python3
"""
Plot Metrics from Simulation Results

Generates plots showing cache hit ratio, latency, bandwidth saved, etc.
across different simulation runs.
"""

import json
import sys
import argparse
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path
from typing import List, Dict, Any


def load_results(file_path: str) -> List[Dict[str, Any]]:
    """Load simulation results from JSON file."""
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Handle both single result and list of results
    if isinstance(data, list):
        return data
    elif isinstance(data, dict) and 'results' in data:
        return data['results']
    else:
        return [data]


def plot_cache_hit_ratio_by_peers(results: List[Dict[str, Any]], output_path: str):
    """Plot cache hit ratio vs number of peers."""
    peer_counts = {}
    
    for result in results:
        peer_count = result.get('peersSimulated', 0)
        cache_hit_ratio = result.get('cacheHitRatio', 0)
        
        if peer_count not in peer_counts:
            peer_counts[peer_count] = []
        peer_counts[peer_count].append(cache_hit_ratio)
    
    # Calculate averages
    peer_counts_sorted = sorted(peer_counts.items())
    x_values = [pc[0] for pc in peer_counts_sorted]
    y_values = [np.mean(pc[1]) for pc in peer_counts_sorted]
    y_stds = [np.std(pc[1]) if len(pc[1]) > 1 else 0 for pc in peer_counts_sorted]
    
    plt.figure(figsize=(10, 6))
    plt.errorbar(x_values, y_values, yerr=y_stds, marker='o', linestyle='-', capsize=5)
    plt.xlabel('Number of Peers', fontsize=12)
    plt.ylabel('Cache Hit Ratio (%)', fontsize=12)
    plt.title('Cache Hit Ratio vs Number of Peers', fontsize=14, fontweight='bold')
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Saved plot to {output_path}")


def plot_latency_by_peers(results: List[Dict[str, Any]], output_path: str):
    """Plot average latency vs number of peers."""
    peer_counts = {}
    
    for result in results:
        peer_count = result.get('peersSimulated', 0)
        avg_latency = result.get('avgLatency', 0)
        
        if peer_count not in peer_counts:
            peer_counts[peer_count] = []
        peer_counts[peer_count].append(avg_latency)
    
    # Calculate averages
    peer_counts_sorted = sorted(peer_counts.items())
    x_values = [pc[0] for pc in peer_counts_sorted]
    y_values = [np.mean(pc[1]) for pc in peer_counts_sorted]
    y_stds = [np.std(pc[1]) if len(pc[1]) > 1 else 0 for pc in peer_counts_sorted]
    
    plt.figure(figsize=(10, 6))
    plt.errorbar(x_values, y_values, yerr=y_stds, marker='s', linestyle='-', capsize=5, color='orange')
    plt.xlabel('Number of Peers', fontsize=12)
    plt.ylabel('Average Latency (ms)', fontsize=12)
    plt.title('Average Latency vs Number of Peers', fontsize=14, fontweight='bold')
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Saved plot to {output_path}")


def plot_bandwidth_saved(results: List[Dict[str, Any]], output_path: str):
    """Plot bandwidth saved across simulations."""
    bandwidth_saved = [r.get('bandwidthSaved', 0) for r in results]
    peer_counts = [r.get('peersSimulated', 0) for r in results]
    
    plt.figure(figsize=(10, 6))
    plt.scatter(peer_counts, bandwidth_saved, alpha=0.6, s=50)
    plt.xlabel('Number of Peers', fontsize=12)
    plt.ylabel('Bandwidth Saved (%)', fontsize=12)
    plt.title('Bandwidth Saved vs Number of Peers', fontsize=14, fontweight='bold')
    plt.grid(True, alpha=0.3)
    
    # Add trend line
    if len(peer_counts) > 1:
        z = np.polyfit(peer_counts, bandwidth_saved, 1)
        p = np.poly1d(z)
        plt.plot(peer_counts, p(peer_counts), "r--", alpha=0.5, label=f'Trend: y={z[0]:.2f}x+{z[1]:.2f}')
        plt.legend()
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Saved plot to {output_path}")


def plot_fairness_index(results: List[Dict[str, Any]], output_path: str):
    """Plot Jain's fairness index vs number of peers."""
    peer_counts = {}
    
    for result in results:
        peer_count = result.get('peersSimulated', 0)
        fairness = result.get('jainFairnessIndex', 0)
        
        if peer_count not in peer_counts:
            peer_counts[peer_count] = []
        peer_counts[peer_count].append(fairness)
    
    # Calculate averages
    peer_counts_sorted = sorted(peer_counts.items())
    x_values = [pc[0] for pc in peer_counts_sorted]
    y_values = [np.mean(pc[1]) for pc in peer_counts_sorted]
    y_stds = [np.std(pc[1]) if len(pc[1]) > 1 else 0 for pc in peer_counts_sorted]
    
    plt.figure(figsize=(10, 6))
    plt.errorbar(x_values, y_values, yerr=y_stds, marker='^', linestyle='-', capsize=5, color='green')
    plt.xlabel('Number of Peers', fontsize=12)
    plt.ylabel("Jain's Fairness Index", fontsize=12)
    plt.title("Jain's Fairness Index vs Number of Peers", fontsize=14, fontweight='bold')
    plt.axhline(y=1.0, color='r', linestyle='--', alpha=0.5, label='Perfect Fairness')
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Saved plot to {output_path}")


def plot_file_propagation(results: List[Dict[str, Any]], output_path: str):
    """Plot file propagation time vs number of peers."""
    peer_counts = {}
    
    for result in results:
        if 'filePropagationTime' in result and result['filePropagationTime'] is not None:
            peer_count = result.get('peersSimulated', 0)
            propagation_time = result['filePropagationTime'] / 1000  # Convert to seconds
            
            if peer_count not in peer_counts:
                peer_counts[peer_count] = []
            peer_counts[peer_count].append(propagation_time)
    
    if not peer_counts:
        print("No file propagation data found in results")
        return
    
    # Calculate averages
    peer_counts_sorted = sorted(peer_counts.items())
    x_values = [pc[0] for pc in peer_counts_sorted]
    y_values = [np.mean(pc[1]) for pc in peer_counts_sorted]
    y_stds = [np.std(pc[1]) if len(pc[1]) > 1 else 0 for pc in peer_counts_sorted]
    
    plt.figure(figsize=(10, 6))
    plt.errorbar(x_values, y_values, yerr=y_stds, marker='d', linestyle='-', capsize=5, color='purple')
    plt.xlabel('Number of Peers', fontsize=12)
    plt.ylabel('File Propagation Time (seconds)', fontsize=12)
    plt.title('File Propagation Time vs Number of Peers', fontsize=14, fontweight='bold')
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Saved plot to {output_path}")


def plot_comparison_dashboard(results: List[Dict[str, Any]], output_path: str):
    """Create a dashboard with multiple subplots."""
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('µCloud Simulation Metrics Dashboard', fontsize=16, fontweight='bold')
    
    # Group by peer count
    peer_counts = {}
    for result in results:
        pc = result.get('peersSimulated', 0)
        if pc not in peer_counts:
            peer_counts[pc] = {'cache_hit': [], 'latency': [], 'bandwidth': [], 'fairness': []}
        peer_counts[pc]['cache_hit'].append(result.get('cacheHitRatio', 0))
        peer_counts[pc]['latency'].append(result.get('avgLatency', 0))
        peer_counts[pc]['bandwidth'].append(result.get('bandwidthSaved', 0))
        peer_counts[pc]['fairness'].append(result.get('jainFairnessIndex', 0))
    
    sorted_counts = sorted(peer_counts.items())
    x_values = [pc[0] for pc in sorted_counts]
    
    # Cache Hit Ratio
    axes[0, 0].errorbar(x_values, [np.mean(pc[1]['cache_hit']) for pc in sorted_counts],
                       yerr=[np.std(pc[1]['cache_hit']) if len(pc[1]['cache_hit']) > 1 else 0 for pc in sorted_counts],
                       marker='o', capsize=5)
    axes[0, 0].set_xlabel('Number of Peers')
    axes[0, 0].set_ylabel('Cache Hit Ratio (%)')
    axes[0, 0].set_title('Cache Hit Ratio')
    axes[0, 0].grid(True, alpha=0.3)
    
    # Latency
    axes[0, 1].errorbar(x_values, [np.mean(pc[1]['latency']) for pc in sorted_counts],
                       yerr=[np.std(pc[1]['latency']) if len(pc[1]['latency']) > 1 else 0 for pc in sorted_counts],
                       marker='s', capsize=5, color='orange')
    axes[0, 1].set_xlabel('Number of Peers')
    axes[0, 1].set_ylabel('Average Latency (ms)')
    axes[0, 1].set_title('Average Latency')
    axes[0, 1].grid(True, alpha=0.3)
    
    # Bandwidth Saved
    axes[1, 0].errorbar(x_values, [np.mean(pc[1]['bandwidth']) for pc in sorted_counts],
                       yerr=[np.std(pc[1]['bandwidth']) if len(pc[1]['bandwidth']) > 1 else 0 for pc in sorted_counts],
                       marker='^', capsize=5, color='green')
    axes[1, 0].set_xlabel('Number of Peers')
    axes[1, 0].set_ylabel('Bandwidth Saved (%)')
    axes[1, 0].set_title('Bandwidth Saved')
    axes[1, 0].grid(True, alpha=0.3)
    
    # Fairness Index
    axes[1, 1].errorbar(x_values, [np.mean(pc[1]['fairness']) for pc in sorted_counts],
                       yerr=[np.std(pc[1]['fairness']) if len(pc[1]['fairness']) > 1 else 0 for pc in sorted_counts],
                       marker='d', capsize=5, color='purple')
    axes[1, 1].set_xlabel('Number of Peers')
    axes[1, 1].set_ylabel("Jain's Fairness Index")
    axes[1, 1].set_title("Fairness Index")
    axes[1, 1].axhline(y=1.0, color='r', linestyle='--', alpha=0.5)
    axes[1, 1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Saved dashboard to {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Plot metrics from simulation results')
    parser.add_argument('input_file', help='Path to JSON file with simulation results')
    parser.add_argument('-o', '--output-dir', default='./plots', help='Output directory for plots')
    parser.add_argument('--all', action='store_true', help='Generate all plots')
    parser.add_argument('--dashboard', action='store_true', help='Generate dashboard')
    
    args = parser.parse_args()
    
    # Load results
    results = load_results(args.input_file)
    print(f"Loaded {len(results)} simulation results")
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate plots
    if args.all or args.dashboard:
        plot_comparison_dashboard(results, str(output_dir / 'dashboard.png'))
    
    if args.all:
        plot_cache_hit_ratio_by_peers(results, str(output_dir / 'cache_hit_ratio.png'))
        plot_latency_by_peers(results, str(output_dir / 'latency.png'))
        plot_bandwidth_saved(results, str(output_dir / 'bandwidth_saved.png'))
        plot_fairness_index(results, str(output_dir / 'fairness_index.png'))
        plot_file_propagation(results, str(output_dir / 'file_propagation.png'))
    
    if not args.all and not args.dashboard:
        # Default: generate dashboard
        plot_comparison_dashboard(results, str(output_dir / 'dashboard.png'))


if __name__ == '__main__':
    main()

