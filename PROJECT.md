# Project: IPC Manager

## Architecture
- **Backend:** Node.js (TypeScript, Express)
- **Frontend:** React (Vite, TypeScript, TailwindCSS)
- **Media Processing:** FFmpeg for RTSP to HLS/MJPEG streaming and MP4 recording.
- **Discovery Protocol:** ONVIF WS-Discovery.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Backend Foundation | Express setup, basic routing, error handling | none | DONE |
| 2 | ONVIF Discovery | Implement WS-Discovery to find cameras | M1 | DONE |
| 3 | RTSP Streaming API | Convert RTSP to HLS/WebSockets for browser viewing | 2 | DONE |
| 4 | Recording Service | Spawning FFmpeg to record RTSP to MP4 files on disk | M1 | DONE |
| 5 | Web Interface | React frontend for discovery, live view, and record control | M2, M3, M4 | DONE |
| 6 | E2E Testing (Tier 1) | Pass E2E tests for Feature Coverage | M5 | DONE |
| 7 | E2E Testing (Tier 2) | Pass E2E tests for Boundary & Corner Cases | M6 | DONE |
| 8 | E2E Testing (Tier 3) | Pass E2E tests for Cross-Feature Combinations | M7 | IN_PROGRESS |
| 9 | E2E Testing (Tier 4) | Pass E2E tests for Real-World Scenarios | M8 | PLANNED |
| 10 | E2E Testing (Tier 5) | Adversarial Coverage Hardening | M9 | PLANNED |

## Interface Contracts
### Discovery API
- `GET /api/cameras` -> Returns `[{ ip, port, name, rtspUrl }]`
### Streaming API
- `POST /api/stream/start` body: `{ rtspUrl }` -> Returns stream identifier or HLS URL
- `POST /api/stream/stop` body: `{ streamId }`
### Recording API
- `POST /api/record/start` body: `{ rtspUrl }` -> Returns `{ recordId, filename }`
- `POST /api/record/stop` body: `{ recordId }`

## Code Layout
- `backend/`
  - `src/`
    - `index.ts`
    - `routes/`
    - `services/` (discovery, stream, record)
- `frontend/`
  - `src/`
    - `components/`
    - `pages/`
- `recordings/` (folder for saved MP4 files)
