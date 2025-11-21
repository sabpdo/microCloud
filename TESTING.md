# Testing Guide

## Prerequisites

- Node.js 18 or higher
- Python 3.8 or higher (for plotting tools)
- npm packages installed (`npm install`)

For Python plotting tools:

```bash
pip install -r analysis/utils/graphing/plotting/requirements.txt
```

## Starting the Server

Start the development server:

```bash
npm run dev
```

This starts both the backend server (port 3000) and the frontend development server.

Or start only the server:

```bash
npm run dev:server
```

The server provides:

- HTTP API at http://localhost:3000
- WebSocket signaling at ws://localhost:3000
- Dashboard at http://localhost:3000 (after building)

## Running Simulations via Dashboard

1. Start the server: `npm run dev`
2. Open http://localhost:3000 in a browser
3. Navigate to the "Simulation" tab
4. Configure simulation parameters:
   - Number of Peers: 20-100
   - Target File: Select a file or enter a custom URL
   - Duration: Simulation duration in seconds
   - Request Interval: Time between requests in milliseconds
   - Churn Rate: Probability of peer leaving per cycle (0-1)
   - Flash Crowd Mode: Enable staggered peer joins
   - Join Rate: Peers per second (if flash crowd enabled)
   - Anchor Signaling Latency: Latency for joining via anchor node (ms)
5. Click "Start Flash Crowd Simulation"
6. View results in the results panel

## Running Simulations via API

Send POST request to `/api/simulate`:

```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "numPeers": 20,
    "targetFile": "/sample.txt",
    "duration": 30,
    "requestInterval": 100,
    "churnRate": 0,
    "flashCrowd": false,
    "joinRate": 2,
    "anchorSignalingLatency": 100
  }'
```

## Batch Analysis (TypeScript)

Run multiple simulations with different parameters:

```bash
npx tsx analysis/utils/graphing/plotting/run-batch-analysis.ts
```

This runs simulations with:

- Peer counts: 10, 20, 50, 100
- Flash crowd: enabled and disabled
- Join rates: 1, 2, 5 peers/second

Results are saved to `analysis/results/batch-analysis-<timestamp>.json`

## Analyzing Results (TypeScript)

Analyze a single result file:

```bash
npx tsx analysis/utils/graphing/plotting/analyze-simulation.ts results.json
```

Analyze results from a directory:

```bash
npx tsx analysis/utils/graphing/plotting/analyze-simulation.ts results-dir/
```

## Generating Plots (Python)

Generate all plots from results:

```bash
python analysis/utils/graphing/plotting/plot-metrics.py results.json --all --output-dir ./plots
```

Generate dashboard with multiple metrics:

```bash
python analysis/utils/graphing/plotting/plot-metrics.py results.json --dashboard --output-dir ./plots
```

Available plots:

- Cache hit ratio vs number of peers
- Average latency vs number of peers
- Bandwidth saved vs number of peers
- Jain's fairness index vs number of peers
- File propagation time vs number of peers
- Dashboard with all metrics

## Multi-Run Analysis (Python)

Compare multiple simulation runs:

```bash
python analysis/utils/graphing/plotting/analyze-multi-run.py results-dir/ -o analysis-output.json
```

This generates:

- Metrics grouped by peer count
- Comparison of flash crowd vs normal scenarios
- Statistical summaries (mean, std deviation)

## Experiment Configurations

### Standard Flash Crowd Test

- numPeers: 50
- duration: 60
- flashCrowd: true
- joinRate: 2
- churnRate: 0

### High Churn Test

- numPeers: 30
- duration: 120
- flashCrowd: false
- churnRate: 0.05

### Scalability Test

Run batch analysis with varying peer counts:

- numPeers: [10, 20, 50, 100]
- duration: 30
- flashCrowd: [false, true]

### Anchor Node Test

- numPeers: 40
- duration: 45
- flashCrowd: true
- joinRate: 3
- anchorSignalingLatency: 50, 100, 200

## Viewing Results

Results include:

- Total requests and cache hit ratio
- Bandwidth saved percentage
- Average latency and latency improvement
- Jain's fairness index
- Peer join events (timestamp, anchor used)
- File transfer events (source, destination, success)
- Anchor node IDs
- File propagation time

Dashboard visualizations show:

- Timeline of peer joins
- List of file transfers
- Anchor node badges
- Performance metrics

## WebRTC File Transfer Testing

The system now supports actual file transfers via WebRTC DataChannels. The simulation models these transfers, but for real browser-based testing:

1. Use `PeerBrowser` class in browser environment
2. Create `MicroCloudClient` instances for each peer
3. Connect peers via WebSocket signaling
4. Files are transferred in chunks (16KB) over DataChannels

For browser testing:

- Open multiple browser tabs/windows
- Each tab creates a peer with unique ID
- Peers automatically discover and connect via WebRTC
- Files requested from peers are transferred via DataChannel

See `WEBRTC_USAGE.md` for detailed usage instructions.

## Exporting Results

Simulation results are JSON format. Save results from the dashboard or API response to analyze later:

```bash
# Save API response
curl -X POST http://localhost:3000/api/simulate ... > results.json

# Analyze saved results
npx tsx analysis/utils/graphing/plotting/analyze-simulation.ts results.json
python analysis/utils/graphing/plotting/plot-metrics.py results.json --all
```

## Step-by-Step Simulation Experiment

Follow these steps to run a complete simulation experiment:

### Step 1: Prepare the Environment

```bash
# Navigate to project directory
cd /path/to/microCloud

# Install dependencies (if not already done)
npm install

# Ensure sample files exist
ls public/sample.txt  # Should show the file
```

### Step 2: Start the Server

```bash
# Start the server (this also starts the frontend dev server)
npm run dev
```

You should see:

- Server running on http://localhost:3000
- WebSocket signaling available
- Static files being served

### Step 3: Run a Basic Simulation via Dashboard

1. Open browser to http://localhost:3000
2. Navigate to the "Simulation" tab
3. Configure parameters:
   - Number of Peers: 20
   - Target File: /sample.txt
   - Duration: 30 seconds
   - Request Interval: 100 ms
   - Churn Rate: 0
   - Flash Crowd Mode: OFF
4. Click "Start Flash Crowd Simulation"
5. Wait for simulation to complete
6. Review results:
   - Cache hit ratio
   - Bandwidth saved
   - Average latency
   - File transfer events

### Step 4: Run Flash Crowd Simulation

1. In the Simulation tab, enable "Flash Crowd Mode"
2. Set parameters:
   - Number of Peers: 50
   - Duration: 60 seconds
   - Join Rate: 2 peers/second
   - Anchor Signaling Latency: 100 ms
3. Click "Start Flash Crowd Simulation"
4. Observe peer join timeline in results
5. Check anchor node assignment
6. Review file propagation time

### Step 5: Run Simulation via API

```bash
# Basic simulation
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "numPeers": 30,
    "targetFile": "/sample.txt",
    "duration": 45,
    "requestInterval": 150,
    "churnRate": 0.02,
    "flashCrowd": true,
    "joinRate": 2,
    "anchorSignalingLatency": 100
  }' | jq .
```

Save results:

```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "numPeers": 30,
    "targetFile": "/sample.txt",
    "duration": 45,
    "requestInterval": 150,
    "churnRate": 0.02,
    "flashCrowd": true,
    "joinRate": 2,
    "anchorSignalingLatency": 100
  }' > simulation-result-1.json
```

### Step 6: Analyze Results

```bash
# Analyze single result
npx tsx analysis/utils/graphing/plotting/analyze-simulation.ts simulation-result-1.json

# Generate plots
python analysis/utils/graphing/plotting/plot-metrics.py simulation-result-1.json --all --output-dir ./plots
```

### Step 7: Run Batch Analysis

```bash
# Run multiple simulations with different parameters
npx tsx analysis/utils/graphing/plotting/run-batch-analysis.ts
```

This will:

- Run simulations with 10, 20, 50, 100 peers
- Test both flash crowd and normal modes
- Test different join rates
- Save results to `analysis/results/batch-analysis-<timestamp>.json`

### Step 8: Compare Multiple Runs

```bash
# Create results directory
mkdir -p my-results

# Run several simulations and save results
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/simulate \
    -H "Content-Type: application/json" \
    -d "{
      \"numPeers\": 20,
      \"targetFile\": \"/sample.txt\",
      \"duration\": 30,
      \"requestInterval\": 100,
      \"churnRate\": 0
    }" > my-results/run-$i.json
done

# Analyze all runs
python analysis/utils/graphing/plotting/analyze-multi-run.py my-results/ -o comparison-results.json
```

### Step 9: Generate Visualizations

```bash
# Generate dashboard plot
python analysis/utils/graphing/plotting/plot-metrics.py my-results/run-1.json --dashboard --output-dir ./plots

# Generate all individual plots
python analysis/utils/graphing/plotting/plot-metrics.py my-results/run-1.json --all --output-dir ./plots
```

Plots will be saved in `./plots/`:

- `dashboard.png` - Combined metrics dashboard
- `cache_hit_ratio.png` - Cache hit ratio vs peer count
- `latency.png` - Average latency vs peer count
- `bandwidth_saved.png` - Bandwidth saved vs peer count
- `fairness_index.png` - Jain's fairness index
- `file_propagation.png` - File propagation time

### Step 10: Interpret Results

Key metrics to examine:

1. **Cache Hit Ratio**: Percentage of requests served by peers
   - Higher is better (reduces origin server load)
   - Should increase with more peers and over time

2. **Bandwidth Saved**: Percentage of bandwidth saved vs all-origin
   - Directly related to cache hit ratio
   - Shows cost savings

3. **Average Latency**: Response time for requests
   - Should decrease with higher cache hit ratio
   - Peer transfers should be faster than origin

4. **File Propagation Time**: Time for file to spread to all peers
   - Should scale with number of peers
   - Flash crowd mode may show different patterns

5. **Jain's Fairness Index**: Distribution fairness (0-1)
   - 1.0 = perfect fairness
   - Higher values indicate more balanced load distribution

### Example Experiment: Scalability Test

Test how the system scales with different numbers of peers:

```bash
# Run simulations with different peer counts
for peers in 10 20 50 100; do
  curl -X POST http://localhost:3000/api/simulate \
    -H "Content-Type: application/json" \
    -d "{
      \"numPeers\": $peers,
      \"targetFile\": \"/sample.txt\",
      \"duration\": 30,
      \"requestInterval\": 100,
      \"churnRate\": 0
    }" > scalability-${peers}peers.json
done

# Analyze all scalability results
npx tsx analysis/utils/graphing/plotting/analyze-simulation.ts scalability-*.json
```

This helps identify:

- Optimal peer count for efficiency
- Point of diminishing returns
- System bottlenecks
