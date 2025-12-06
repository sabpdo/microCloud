# Experiment Framework

This document describes how to run the comprehensive experiment suite and analyze results.

## Quick run

Start server: npm run dev:server
Run experiments: npm run experiments (in another terminal)
Analyze results: npm run analyze
Load in dashboard: Use "Load Results File" to view any JSON from results/

## Overview

The experiment framework runs multiple simulation scenarios:
- Jain's fairness index tables
- Baseline vs incresingly high churn
- Scalability with latency over time
- Flash crowds

**Note:** This may take a while (1 hr) depending on the number of experiments and duration settings.

### Experiment Scenarios (at least atm)

The framework runs the following scenarios:

#### 1. Flash Crowd
- **Varying**: Number of peers (20, 50, 100, 200), Join rate (2, 5, 10 peers/sec)
- **Fixed**: No churn, Flash crowd enabled
- **Duration**: 60 seconds

#### 2. Scalability
- **Varying**: Number of peers (20, 50, 100, 200, 500)
- **Fixed**: Join rate 5 peers/sec, No churn, Flash crowd enabled
- **Duration**: 120 seconds
- **Special**: Includes latency over time analysis

#### 3. High Churn
- **Varying**: Churn rate (0, 0.01, 0.05, 0.1)
- **Fixed**: 100 peers, Join rate 5 peers/sec, No flash crowd
- **Duration**: 60 seconds

#### 4. Baseline
- **Varying**: Number of peers (20, 50, 100, 200)
- **Fixed**: Origin-only mode (no P2P), No churn, No flash crowd
- **Duration**: 60 seconds



