# Analysis and Plotting Tools

This directory contains tools for analyzing simulation results and generating visualizations.

## TypeScript Tools

- `analyze-simulation.ts` - Main analysis script that can process simulation results
- `metrics-comparison.ts` - Compare metrics across multiple simulation runs
- `run-batch-analysis.ts` - Run multiple simulations and analyze results

## Python Tools

- `plot-metrics.py` - Generate plots from simulation results (JSON format)
- `analyze-multi-run.py` - Analyze multiple simulation runs and compare
- `visualize-network.py` - Visualize peer network topology and transfers

## Usage

### TypeScript

```bash
# Run batch analysis
npx tsx analysis/utils/graphing/plotting/run-batch-analysis.ts

# Analyze specific results
npx tsx analysis/utils/graphing/plotting/analyze-simulation.ts results.json
```

### Python

```bash
# Install dependencies
pip install matplotlib numpy pandas

# Generate plots
python analysis/utils/graphing/plotting/plot-metrics.py results.json

# Analyze multiple runs
python analysis/utils/graphing/plotting/analyze-multi-run.py results_dir/
```
