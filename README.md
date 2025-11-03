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
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # React entry point
│   ├── types.ts        # TypeScript type definitions
│   └── index.css       # Global styles
├── scripts/            # Testing and simulation scripts
│   └── flash-crowd-sim.ts  # Flash crowd simulation script
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

1. **Reputation Scoring Weights** - Adjust weights (a-g) for the reputation scoring function
2. **Peer Selection Preferences** - Select up to 2 factors to prioritize (bandwidth, uptime, upload success rate, storage)
3. **Role Assignment Thresholds** - Configure anchor node promotion and update cycles
4. **Content-Specific Policies** - Prioritize certain content types for caching
5. **Security & Trust Boundaries** - Configure trust modes, whitelists, and security settings

**Configuration Persistence:**

- All settings are saved to browser localStorage automatically
- Export/import configuration as JSON files
- Reset to defaults option available

## Development

### Adding Test Files

Add any static files you want to serve to the `public/` directory. The server will automatically serve them.

### Modifying the Dashboard

The dashboard is built with React and TypeScript. To modify it:

- `src/App.tsx` - Main application component
- `src/components/` - Individual React components
  - `ReputationWeights.tsx` - Reputation scoring weights configuration
  - `PeerSelection.tsx` - Peer selection preferences
  - `RoleAssignment.tsx` - Role assignment thresholds
  - `ContentPolicies.tsx` - Content-specific policies
  - `SecuritySettings.tsx` - Security and trust settings
  - `ActionButtons.tsx` - Save, reset, export, import buttons
  - `SliderControl.tsx` - Reusable slider component
  - `MetricsDashboard.tsx` - Performance metrics visualization
- `src/hooks/useConfig.ts` - Custom hook for configuration management
- `src/types.ts` - TypeScript type definitions
- `src/index.css` - Global styles

After making changes, the dev server will hot-reload automatically when running `npm run dev`.

## Testing

### Flash Crowd Simulation

The project includes a script to simulate multiple peers making simultaneous requests, allowing you to test cache hit ratios and server load during flash crowd scenarios.

**Run the simulation:**

```bash
npm run sim:flash
```

**Customize the simulation:**

```bash
NUM_PEERS=50 TARGET_FILE=/sample.json npm run sim:flash
```

Available environment variables:

- `NUM_PEERS` - Number of simulated peers (default: 20)
- `TARGET_FILE` - File path to request (default: /sample.txt)
- `REQUEST_INTERVAL` - Milliseconds between requests (default: 100)
- `SIMULATION_DURATION` - How long to run simulation in ms (default: 30000)
- `SERVER_URL` - Server URL (default: http://localhost:3000)

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
- `POST /stats/reset` - Reset all statistics

This allows comparison between server load with and without peer-assisted caching.

## Next Steps

- Implement WebRTC peer discovery and signaling
- Build the peer-assisted caching layer
- Implement dynamic role assignment
- Add cooperative offloading capabilities

## License

MIT
