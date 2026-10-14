# Knightfall Chess — Phase 6

Knightfall Chess includes local Stockfish play, account authentication, private online rooms, saved online game history, Elo ratings, server-managed clocks, quick matchmaking, draw offers, and room-code reconnection.

## What's included

- Create or join a private two-player chess room with a six-character code or invite URL.
- Server-side legal move and turn validation.
- Time controls of 1, 3, 5, 10, or 15 minutes, with 0, 2, or 5 seconds of increment.
- Clocks run only while both players are connected; a disconnected player's room pauses and can be rejoined by code while the server remains running.
- Quick matchmaking, draw offers and responses, resignation, and rematches.
- Completed games saved to MongoDB with player names, moves, PGN, final FEN, result, termination, and timestamps.
- Profile history with opponents, outcomes, and rating changes. Distinct signed-in players receive a basic Elo update (K=32); guests may play but do not receive ratings.
- Existing authentication, profile, and Stockfish computer play.

## Requirements

- Node.js 20 or newer
- MongoDB Atlas or a local MongoDB instance

## Run locally

### Backend

From `server/`:

```powershell
npm install
```

Copy `server/.env.example` to `server/.env`. Configure `MONGODB_URI` and a random `JWT_SECRET` of at least 32 characters. `CLIENT_URL` defaults to `http://localhost:5173`; `CLIENT_ORIGIN` can override it with one or more comma-separated origins. Keep `.env` private.

For MongoDB Atlas, create a database user and allow your development IP in Network Access. Start the API and Socket.IO server:

```powershell
npm run dev
```

The server listens on `http://localhost:5000`. Check `http://localhost:5000/api/health` for service status.

### Frontend

From `client/`:

```powershell
npm install
```

Copy `client/.env.example` to `client/.env` if you need to set a different API URL, then run:

```powershell
npm run dev
```

Open `http://localhost:5173`. Use two browser sessions to try private rooms, matchmaking, draw offers, and disconnect/rejoin behavior.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Service status |
| POST | `/api/auth/register` | Create an account and session |
| POST | `/api/auth/login` | Start a session |
| POST | `/api/auth/logout` | Clear the session cookie |
| GET | `/api/auth/me` | Return the signed-in user |
| GET | `/api/games/mine?page=1&limit=8` | Get the signed-in player's game history and stats |
| GET | `/api/games/:id` | Get a saved game for one of its signed-in participants |

## Limits and deployment notes

- Active rooms and matchmaking queues are held in memory. A backend restart clears them; completed game records remain in MongoDB.
- Rejoining uses a room code rather than a private resume token. Don't treat room codes as strong identity proof in a public competitive service.
- Quick matchmaking uses the incoming player's selected time control and doesn't use a rating window.
- Clocks update at one-second granularity. Game persistence and rating updates aren't transactional or idempotent across server failures.
- Elo is a basic K=32 system, not an official federation or commercial rating implementation.
- This source has not been exercised end-to-end with a live MongoDB instance and two browsers. Do that before deployment. Multi-instance hosting requires shared room state such as Redis and additional concurrency, monitoring, and abuse protections.
