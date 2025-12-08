# µCloud – Peer-Assisted Caching System

**Sabrina, Abena, Alison, Victoria**

µCloud turns nearby devices into a lightweight micro-cloud. Peers exchange content over WebRTC DataChannels, report cache hits/misses to the origin, and fall back to the server when needed. A React dashboard configures policies, monitors metrics, and drives flash-crowd simulations.

## Highlights

- Client-layer P2P cache: browser peers fetch from each other before hitting origin.
- Combined origin + WebRTC signaling server (Express + ws) on one port.
- React dashboard with config, metrics, and simulation controls.
- Flash-crowd simulator with churn, latency, and fairness metrics.
- Standalone WebRTC client bundle for manual peer testing.

## Project Structure

```
microCloud/
├── server/               # Express origin + WebRTC signaling + simulations
├── src/                  # React dashboard (Vite)
│   ├── cache/            # Cache core, manifest, origin fallback
│   ├── components/       # UI: config, metrics, simulations
│   └── Peer*.ts          # Peer and browser peer implementation
├── client/               # Standalone WebRTC client bundle + demo page
├── analysis/             # Experiment analysis + plots
├── public/               # Files served by origin for demos/tests
├── scripts/              # Utility + experiment runners
└── README.md
```

## Prerequisites

- Node.js 18+ (matches engines in `package.json`)
- npm

## Quick Start (Dev)

```bash
npm install
npm run dev           # runs server on :3000 and Vite on :5173
```

- Dashboard: http://localhost:5173
- API + signaling + static files: http://localhost:3000
- If port 3000 is busy, `npm run dev:clean-port` is included in `npm run dev`.

## Production Build & Run

```bash
npm run build         # typecheck + build client bundle + build server
npm start             # serves dist/, public/, API, and WebSocket signaling on :3000
```

Artifacts:
- `dist/` React build auto-served by the server.
- `client/dist/webrtc.js` standalone client bundle.

## Dashboard Features

- **Configuration tab**: pick content types to cache (video/images/json/text). Persists to `localStorage`.
- **Performance Metrics tab**: cache hit ratio ring, request stats, per-path breakdown, server uptime. Auto-refresh with pause/resume; reset stats button.
- **Simulation tab**: configure and run flash-crowd scenarios; see `SIMULATION_WALKTHROUGH.md` for steps and metrics.

## WebRTC Client (standalone)

- Build with `npm run build:client`, then open `client/index.html` via any static file server. Detailed connection flow and troubleshooting: `WEBRTC_USAGE.md`.

## API & Endpoints (served on :3000)

- `GET /health` – liveness.
- `GET /stats` – totals, bytes, per-path counts, peer vs origin requests, cache hit ratio.
- `POST /api/cache-hit` – report peer-served request.
- `POST /api/cache-miss` – report origin-served request.
- `POST /api/simulate` – run flash-crowd simulation (used by dashboard).
- `GET /api/files` – list available demo files in `public/` with sizes.
- `POST /stats/reset` – clear counters.

## Troubleshooting

- Port already in use: stop other services on 3000/5173 or run `npm run dev:clean-port`.
- Missing client bundle: run `npm run build:client` before loading `client/index.html`.
- No peers visible: ensure all clients join the same room and the server is running on :3000.
- CORS issues: server sets permissive `Access-Control-Allow-Origin` for dev; tighten for production as needed.

## Additional Docs

- `TESTING.md` – test strategy, batch analysis, visualization.
- `SIMULATION_WALKTHROUGH.md` – end-to-end simulation steps.
- `WEBRTC_USAGE.md` – WebRTC file transfer API and integration details.