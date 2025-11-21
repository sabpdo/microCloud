# Simulation Experiment Walkthrough

This guide walks you through running a complete simulation experiment step-by-step.

## Prerequisites Check

First, verify your environment:

```bash
# Check Node.js version (should be 18+)
node --version

# Check Python version (should be 3.8+, for plotting)
python3 --version

# Verify dependencies are installed
npm list --depth=0

# Verify sample file exists
ls -lh public/sample.txt
```

## Experiment 1: Basic Simulation

### Step 1: Start the Server

Open a terminal and start the server:

```bash
cd /Users/alisonsoong/Desktop/microCloud
npm run dev:server
```

You should see:

```
μCloud Server running on http://localhost:3000
  - HTTP API & static files
  - WebSocket signaling (ws://localhost:3000)
```

Keep this terminal running.

### Step 2: Run Simulation via API

Open a **new terminal** (keep the server running) and run:

```bash
cd /Users/alisonsoong/Desktop/microCloud

# Run a basic simulation
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "numPeers": 20,
    "targetFile": "/sample.txt",
    "duration": 30,
    "requestInterval": 100,
    "churnRate": 0
  }'
```

**Expected output:** JSON with simulation results including:

- `totalRequests`: Total number of requests made
- `cacheHitRatio`: Percentage of cache hits
- `peerRequests`: Number of requests served by peers
- `originRequests`: Number of requests to origin server
- `avgLatency`: Average latency in milliseconds
- `bandwidthSaved`: Percentage of bandwidth saved

### Step 3: Save and Analyze Results

Save the results:

```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "numPeers": 20,
    "targetFile": "/sample.txt",
    "duration": 30,
    "requestInterval": 100,
    "churnRate": 0
  }' > experiment1-basic.json
```

Analyze the results:

```bash
npx tsx analysis/analyze-simulation.ts experiment1-basic.json
```

This will print:

- Cache hit ratio
- Average latency
- Bandwidth saved
- Fairness index

## Experiment 2: Flash Crowd Simulation

### Step 1: Run Flash Crowd Simulation

In your second terminal:

```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "numPeers": 50,
    "targetFile": "/sample.txt",
    "duration": 60,
    "requestInterval": 100,
    "churnRate": 0,
    "flashCrowd": true,
    "joinRate": 2,
    "anchorSignalingLatency": 100
  }' > experiment2-flashcrowd.json
```

### Step 2: Review Results

```bash
# View the JSON results
cat experiment2-flashcrowd.json | jq '.results | {
  peersSimulated,
  cacheHitRatio,
  bandwidthSaved,
  avgLatency,
  anchorNodes: (.anchorNodes | length),
  peerJoinEvents: (.peerJoinEvents | length),
  fileTransferEvents: (.fileTransferEvents | length)
}'
```

You should see:

- `anchorNodes`: Number of anchor nodes that formed
- `peerJoinEvents`: Timeline of peers joining
- `fileTransferEvents`: File transfers between peers

### Step 3: Analyze Join Timeline

```bash
cat experiment2-flashcrowd.json | jq '.results.peerJoinEvents[0:5]'
```

This shows the first 5 peer join events with timestamps and which anchor they joined via.

## Experiment 3: Scalability Test

Test how performance changes with different numbers of peers:

```bash
# Create directory for results
mkdir -p scalability-test

# Run simulations with different peer counts
for peers in 10 20 50 100; do
  echo "Running simulation with $peers peers..."
  curl -X POST http://localhost:3000/api/simulate \
    -H "Content-Type: application/json" \
    -d "{
      \"numPeers\": $peers,
      \"targetFile\": \"/sample.txt\",
      \"duration\": 30,
      \"requestInterval\": 100,
      \"churnRate\": 0
    }" > scalability-test/${peers}peers.json
  sleep 2  # Small delay between runs
done
```

### Analyze Scalability Results

```bash
# Analyze all scalability results
npx tsx analysis/analyze-simulation.ts scalability-test/
```

This will show:

- Average cache hit ratio across all runs
- Average latency by peer count
- Metrics grouped by number of peers

## Experiment 4: Generate Visualizations

### Step 1: Generate Plots (requires Python)

First, install Python dependencies:

```bash
pip3 install matplotlib numpy pandas
```

Or:

```bash
pip3 install -r analysis/requirements.txt
```

### Step 2: Create Plots

Generate dashboard:

```bash
python3 analysis/plot-metrics.py \
  scalability-test/20peers.json \
  --dashboard \
  --output-dir ./plots
```

Generate all individual plots:

```bash
python3 analysis/plot-metrics.py \
  scalability-test/20peers.json \
  --all \
  --output-dir ./plots
```

### Step 3: View Results

Check the `./plots/` directory:

```bash
ls -lh plots/
```

You should see:

- `dashboard.png` - Combined metrics
- `cache_hit_ratio.png` - Cache performance
- `latency.png` - Latency analysis
- `bandwidth_saved.png` - Bandwidth savings
- `fairness_index.png` - Fairness analysis

## Experiment 5: Dashboard Simulation

### Step 1: Start Full Dev Environment

In a terminal, start both server and frontend:

```bash
npm run dev
```

This starts:

- Backend server on http://localhost:3000
- Frontend dev server (usually on http://localhost:5173)

### Step 2: Open Dashboard

Open browser to:

- http://localhost:5173 (or the port shown in terminal)

### Step 3: Run Simulation via Dashboard

1. Navigate to the "Simulation" tab
2. Set parameters:
   - Number of Peers: 30
   - Target File: /sample.txt
   - Duration: 45
   - Request Interval: 150
   - Churn Rate: 0.02
   - Flash Crowd Mode: **ON**
   - Join Rate: 2 peers/second
   - Anchor Signaling Latency: 100 ms
3. Click "Start Flash Crowd Simulation"
4. Watch progress bar
5. Review results when complete

### Step 4: Analyze Dashboard Results

The dashboard shows:

- **Performance Metrics**: Cache hit ratio, latency, bandwidth saved
- **Anchor Nodes**: Which peers became anchor nodes
- **Peer Join Timeline**: When each peer joined and via which anchor
- **File Transfer Events**: All P2P transfers between peers
- **File Propagation Time**: Time for file to reach all peers

## Experiment 6: Churn Test

Test system resilience with peer churn:

```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "numPeers": 40,
    "targetFile": "/sample.txt",
    "duration": 90,
    "requestInterval": 100,
    "churnRate": 0.05,
    "flashCrowd": true,
    "joinRate": 2,
    "anchorSignalingLatency": 100
  }' > experiment6-churn.json
```

Analyze churn impact:

```bash
cat experiment6-churn.json | jq '.results | {
  totalRequests,
  cacheHitRatio,
  recoverySpeed
}'
```

## Interpreting Results

### Good Results Indicators

1. **High Cache Hit Ratio** (>50%)
   - Shows peers are successfully serving each other
   - Reduces origin server load

2. **Low Average Latency** (<200ms for peer transfers)
   - Peer transfers should be faster than origin
   - Indicates good P2P performance

3. **High Bandwidth Saved** (>50%)
   - Directly related to cache hit ratio
   - Shows cost/bandwidth savings

4. **Fairness Index Close to 1.0**
   - Indicates balanced load distribution
   - No single peer is overloaded

5. **Multiple Anchor Nodes**
   - Shows system can identify stable peers
   - Improves resilience

### Troubleshooting

**Low Cache Hit Ratio:**

- Increase simulation duration
- Reduce request interval (more requests)
- Check that peers can discover each other

**High Latency:**

- Normal for initial requests (peer discovery)
- Should decrease as cache builds up
- Check network configuration

**No Anchor Nodes:**

- Increase simulation duration
- Reduce churn rate
- Check reputation scoring parameters

## Next Steps

1. **Compare Configurations**: Run multiple simulations with different parameters
2. **Generate Reports**: Use Python scripts to create visual comparisons
3. **Test Edge Cases**: High churn, large files, many peers
4. **Real WebRTC Testing**: Use PeerBrowser in browser environment (see WEBRTC_USAGE.md)
