# µCloud - Peer-Assisted Caching System

**Sabrina, Abena, Alison, Victoria**

A client-layer, peer-assisted caching system that transforms nearby user devices into a self-organizing micro-cloud, reducing server load and latency through WebRTC-based P2P content distribution.

## Overview

µCloud Cache operates entirely at the client layer, requiring no server-side deployment. It uses WebRTC DataChannel to enable direct peer-to-peer transfers, with the system automatically falling back to the origin server when needed.

## Project Structure

```
microCloud/
├── server/              # Toy HTTP origin server
│   └── server.ts       # Express server serving static files (TypeScript)
├── public/             # Static files served by origin server
│   ├── demo.html       # Sample demo page
│   ├── sample.txt      # Sample text file
│   ├── sample.json     # Sample JSON file
│   └── style.css       # Styles for demo page
├── src/                # React TypeScript dashboard source
│   ├── cache/           # Caching system implementation
│   │   ├── index.ts     # Cache module exports
│   │   └── memory-cache.ts  # In-memory cache
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # React entry point
│   ├── types.ts        # TypeScript type definitions
│   └── index.css       # Global styles
├── index.html          # Vite entry point for React app
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript config for React app
├── tsconfig.server.json # TypeScript config for server
└── package.json        # Node.js dependencies
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/sabpdo/microCloud.git
cd microCloud
```

2. Install dependencies:

```bash
npm install
```

### Running the Toy HTTP Server

The toy HTTP server acts as the origin server that µCloud peers will query when cache misses occur.

```bash
npm start
# or
npm run server
```

The server will start on `http://localhost:3000` by default.

**Available Endpoints:**

- `GET /` - Main index page
- `GET /sample.txt` - Sample text file
- `GET /sample.json` - Sample JSON file
- `GET /health` - Health check endpoint
- `GET /stats` - Server statistics (requests, bandwidth, etc.)
- `POST /stats/reset` - Reset server statistics

**Server Features:**

- Serves static files from the `public/` directory
- Tracks request statistics (total requests, bytes served, per-path counts)
- CORS enabled for browser-based clients
- Request logging with timestamps

### Building and Accessing the Configuration Dashboard

The dashboard is built with React and TypeScript. To use it:

1. **Development mode** (with hot reload):

   ```bash
   npm run dev
   ```

   This starts the Vite dev server on `http://localhost:5173`

2. **Production build**:
   ```bash
   npm run build
   ```
   This creates a `dist/` folder with the compiled React app. The HTTP server will automatically serve it at `http://localhost:3000/` when you run `npm start`.

**Dashboard Features:**

The dashboard has two tabs:

1. **Configuration Tab** - Simple content caching policy selection

   - Choose which content types to prioritize for caching (Video, Images, JSON/Data, Text)
   - Changes are saved automatically to browser localStorage
   - Designed to be simple and user-friendly (Net Neutrality principle)

2. **Performance Metrics Tab** - Real-time cache performance visualization

   - Cache hit ratio visualization (ring chart)
   - Request statistics and data served
   - Auto-refreshing metrics with pause/resume controls
   - Requests breakdown by path

3. **Simulation Tab** - Flash crowd simulation (runs on the server)
   - Configure: number of peers, target file, duration, request interval, churn rate
   - Start simulation from the UI; results appear in a summary card
   - Metrics include cache hit ratio, bandwidth saved, avg latency, latency improvement, Jain's fairness index, recovery speed

## Simulation

Use the Simulation tab in the dashboard to run a flash crowd test against the toy origin server.

Configurable options:

- Number of peers (e.g., 20–100)
- Target file (e.g., `/sample.txt`, `/sample.json`)
- Duration (seconds)
- Request interval (ms)
- Churn rate (0–1 probability of peers leaving per cycle)

The simulation runs server-side and reports:

- Cache hit ratio, bandwidth saved
- Total/peer/origin requests
- Average latency and latency improvement
- Jain’s fairness index
- Recovery speed after churn

### Performance Metrics

The dashboard includes a **Performance Metrics** tab that displays:

- **Cache Hit Ratio** - Percentage of requests served by peers vs origin server
- **Request Statistics** - Total requests, cache hits/misses, data served
- **Requests by Path** - Breakdown of requests per file path
- **Server Info** - Uptime and start time

The metrics page auto-refreshes every 2 seconds and can be paused/resumed. Use the "Reset Stats" button to clear statistics for new tests.

**API Endpoints:**

- `GET /stats` - Get current statistics including cache hit ratio
- `POST /api/cache-hit` - Record a cache hit (when peer serves content)
- `POST /api/cache-miss` - Record a cache miss (when peer requests from origin)
- `POST /api/simulate` - Trigger a server-side flash crowd simulation
- `POST /stats/reset` - Reset all statistics

This allows comparison between server load with and without peer-assisted caching.

## License

MIT
