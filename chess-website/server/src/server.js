import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { Chess } from "chess.js";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import Game from "./models/Game.js";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/games.js";

const allowedOrigins = (process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || "http://localhost:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const required = ["MONGODB_URI", "JWT_SECRET"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and configure it.`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters long.");
  process.exit(1);
}

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
  transports: ["websocket", "polling"]
});
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many requests. Please wait a few minutes and try again." } }));
app.use("/api/games", rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "knightfall-api", multiplayer: "enabled", gameHistory: "enabled" }));
app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);
app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Something went wrong on the server. Please try again." });
});

// Active rooms remain in memory; finished games and ratings are stored in MongoDB.
const rooms = new Map();
const matchmakingQueue = [];
const makeRoomCode = () => randomBytes(5).toString("hex").slice(0, 6).toUpperCase();
const safeName = (value) => String(value || "Guest").trim().replace(/[<>]/g, "").slice(0, 24) || "Guest";
const playerSnapshot = (socket, name) => ({
  socketId: socket.id,
  userId: socket.data.userId || null,
  name: safeName(socket.data.displayName || name),
  rating: Number.isFinite(socket.data.rating) ? socket.data.rating : null,
  connected: true
});
function publicState(room) {
  const endedByResignation = Boolean(room.resignedBy);
  const endedByFlag = Boolean(room.flaggedBy);
  const agreedDraw = Boolean(room.agreedDraw);
  const isOver = room.game.isGameOver() || endedByResignation || endedByFlag || agreedDraw;
  const status = endedByResignation
    ? `${room.resignedBy === "white" ? "White" : "Black"} resigned — ${room.resignedBy === "white" ? "Black" : "White"} wins`
    : endedByFlag
      ? `${room.flaggedBy === "white" ? "White" : "Black"} ran out of time — ${room.flaggedBy === "white" ? "Black" : "White"} wins`
      : agreedDraw
        ? "Draw agreed"
        : room.game.isGameOver()
      ? (room.game.isCheckmate() ? `Checkmate — ${room.game.turn() === "w" ? "Black" : "White"} wins` : "Game drawn")
      : `${room.game.turn() === "w" ? "White" : "Black"} to move${room.game.isCheck() ? " — Check!" : ""}`;
  return {
    roomId: room.id, fen: room.game.fen(), pgn: room.game.pgn(), moves: room.game.history(),
    turn: room.game.turn() === "w" ? "white" : "black", status, isGameOver: isOver,
    gameRecordId: room.savedGameId || null,
    clock: { whiteMs: Math.max(0, room.clock.whiteMs), blackMs: Math.max(0, room.clock.blackMs), incrementMs: room.clock.incrementMs, initialMinutes: room.clock.initialMinutes },
    drawOfferBy: room.drawOfferBy || null,
    players: {
      white: room.players.white ? { name: room.players.white.name, connected: room.players.white.connected } : null,
      black: room.players.black ? { name: room.players.black.name, connected: room.players.black.connected } : null
    },
    started: Boolean(room.players.white && room.players.black && room.players.white.connected && room.players.black.connected)
  };
}
function emitState(room) { io.to(room.id).emit("game:state", publicState(room)); }
function clocksCanRun(room) {
  return Boolean(room.players.white?.connected && room.players.black?.connected && room.startedAt && !room.game.isGameOver() && !room.resignedBy && !room.flaggedBy && !room.agreedDraw && !room.savedGameId);
}
function settleClock(room) {
  if (!room.clockLastStartedAt || !clocksCanRun(room)) return false;
  const elapsed = Date.now() - room.clockLastStartedAt;
  room.clockLastStartedAt = Date.now();
  const color = room.game.turn() === "w" ? "white" : "black";
  room.clock[color + "Ms"] = Math.max(0, room.clock[color + "Ms"] - elapsed);
  if (room.clock[color + "Ms"] <= 0) {
    room.flaggedBy = color;
    room.clockLastStartedAt = null;
    room.clock[color + "Ms"] = 0;
    return true;
  }
  return false;
}
function startClockIfReady(room) {
  if (clocksCanRun(room) && !room.clockLastStartedAt) room.clockLastStartedAt = Date.now();
}
function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room) { settleClock(room); room.clockLastStartedAt = null; }
  socket.leave(roomId);
  socket.data.roomId = null;
  socket.data.color = null;
  if (!room) return;
  for (const color of ["white", "black"]) {
    if (room.players[color]?.socketId === socket.id) room.players[color].connected = false;
  }
  if (room.players.white?.connected && room.players.black?.connected) startClockIfReady(room);
  emitState(room);
}
function finishDetails(room) {
  if (room.flaggedBy) { const winner = room.flaggedBy === "white" ? "black" : "white"; return { result: winner === "white" ? "1-0" : "0-1", winner, termination: "time forfeit" }; }
  if (room.resignedBy) {
    const winner = room.resignedBy === "white" ? "black" : "white";
    return { result: winner === "white" ? "1-0" : "0-1", winner, termination: "resignation" };
  }
  if (room.game.isCheckmate()) {
    const winner = room.game.turn() === "w" ? "black" : "white";
    return { result: winner === "white" ? "1-0" : "0-1", winner, termination: "checkmate" };
  }
  let termination = "draw";
  if (room.game.isStalemate()) termination = "stalemate";
  else if (room.game.isThreefoldRepetition()) termination = "threefold repetition";
  else if (room.game.isInsufficientMaterial()) termination = "insufficient material";
  else if (room.game.isDraw()) termination = "draw rule";
  return { result: "1/2-1/2", winner: null, termination };
}
const expectedScore = (rating, opponentRating) => 1 / (1 + 10 ** ((opponentRating - rating) / 400));
async function persistFinishedGame(room) {
  if (!room.game.isGameOver() && !room.resignedBy && !room.flaggedBy && !room.agreedDraw) return;
  if (room.savedGameId || room.persisting) return;
  room.persisting = true;
  try {
    const details = finishDetails(room);
    const white = room.players.white;
    const black = room.players.black;
    const bothRatedUsers = Boolean(white?.userId && black?.userId && String(white.userId) !== String(black.userId));
    const gameDoc = new Game({
      roomCode: room.id,
      white: { userId: white?.userId || null, name: safeName(white?.name), ratingBefore: white?.rating ?? null, ratingAfter: white?.rating ?? null },
      black: { userId: black?.userId || null, name: safeName(black?.name), ratingBefore: black?.rating ?? null, ratingAfter: black?.rating ?? null },
      result: details.result,
      winnerUserId: details.winner ? room.players[details.winner]?.userId || null : null,
      termination: details.termination,
      pgn: room.game.pgn(), moves: room.game.history(), finalFen: room.game.fen(), rated: bothRatedUsers,
      startedAt: room.startedAt || room.createdAt || new Date(), endedAt: new Date()
    });

    // Record first, then update account stats. The room guard prevents duplicate saves during normal operation.
    await gameDoc.save();
    const scoreWhite = details.result === "1-0" ? 1 : details.result === "0-1" ? 0 : 0.5;
    const updates = [];
    for (const color of ["white", "black"]) {
      const player = room.players[color];
      if (!player?.userId) continue;
      const isWhite = color === "white";
      const score = isWhite ? scoreWhite : 1 - scoreWhite;
      const update = { $inc: { gamesPlayed: 1 } };
      if (score === 1) update.$inc.gamesWon = 1;
      if (score === 0.5) update.$inc.gamesDrawn = 1;
      if (bothRatedUsers) {
        const ownRating = isWhite ? white.rating : black.rating;
        const opponentRating = isWhite ? black.rating : white.rating;
        const nextRating = Math.max(100, Math.round(ownRating + 32 * (score - expectedScore(ownRating, opponentRating))));
        update.$set = { rating: nextRating };
        gameDoc[color].ratingAfter = nextRating;
      }
      updates.push(User.findByIdAndUpdate(player.userId, update, { new: true }));
    }
    await Promise.all(updates);
    if (bothRatedUsers) await gameDoc.save();
    room.savedGameId = String(gameDoc._id);
    room.persisting = false;
    io.to(room.id).emit("game:recorded", { gameId: room.savedGameId, result: details.result, termination: details.termination });
    emitState(room);
  } catch (error) {
    room.persisting = false;
    console.error("Could not persist finished game:", error.message);
    io.to(room.id).emit("game:save-error", { message: "The game ended, but saving its record failed. Please contact support before leaving this room." });
  }
}

// Authentication is optional for sockets: logged-in players are linked to their account; guests can still play.
io.use(async (socket, next) => {
  try {
    const rawCookie = socket.handshake.headers.cookie || "";
    const tokenPart = rawCookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("knightfall_token="));
    if (tokenPart) {
      const token = decodeURIComponent(tokenPart.slice("knightfall_token=".length));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub);
      if (user) {
        socket.data.userId = String(user._id);
        socket.data.displayName = user.displayName;
        socket.data.username = user.username;
        socket.data.rating = user.rating;
      }
    }
  } catch { /* An expired or invalid cookie simply connects as a guest. */ }
  next();
});

io.on("connection", (socket) => {
  socket.on("room:create", (payload = {}, ack = () => {}) => {
    const { name } = payload;
    leaveCurrentRoom(socket);
    let id;
    do { id = makeRoomCode(); } while (rooms.has(id));
    const player = playerSnapshot(socket, name);
    const minutes = [1, 3, 5, 10, 15].includes(Number(payload.timeControlMinutes)) ? Number(payload.timeControlMinutes) : 5;
    const incrementSeconds = [0, 2, 5].includes(Number(payload.incrementSeconds)) ? Number(payload.incrementSeconds) : 0;
    const room = { id, game: new Chess(), players: { white: player, black: null }, createdAt: new Date(), startedAt: null, savedGameId: null, persisting: false, clock: { whiteMs: minutes * 60_000, blackMs: minutes * 60_000, incrementMs: incrementSeconds * 1000, initialMinutes: minutes }, clockLastStartedAt: null, drawOfferBy: null, resignedBy: null, flaggedBy: null, agreedDraw: false };
    rooms.set(id, room);
    socket.join(id); socket.data.roomId = id; socket.data.color = "white";
    ack({ ok: true, state: publicState(room), color: "white" }); emitState(room);
  });

  socket.on("room:join", ({ roomId, name } = {}, ack = () => {}) => {
    const id = String(roomId || "").trim().toUpperCase();
    const room = rooms.get(id);
    if (!room) return ack({ ok: false, message: "Room not found. Ask the host to create a new room." });
    if (socket.data.roomId === id) return ack({ ok: true, state: publicState(room), color: socket.data.color });
    const openColor = !room.players.white ? "white" : !room.players.black ? "black" : ["white", "black"].find((color) => !room.players[color]?.connected);
    if (!openColor) return ack({ ok: false, message: "This room already has two connected players." });
    if (socket.data.userId && Object.values(room.players).some((player) => player?.userId && player.userId === socket.data.userId && player.connected)) {
      return ack({ ok: false, message: "This account is already playing in this room. Use a different account or play as a guest." });
    }
    leaveCurrentRoom(socket);
    room.players[openColor] = playerSnapshot(socket, name);
    socket.join(id); socket.data.roomId = id; socket.data.color = openColor;
    if (room.players.white?.connected && room.players.black?.connected && !room.startedAt) room.startedAt = new Date();
    startClockIfReady(room);
    ack({ ok: true, state: publicState(room), color: openColor }); emitState(room);
  });

  socket.on("game:move", ({ from, to, promotion } = {}, ack = () => {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return ack({ ok: false, message: "Join a room before moving." });
    if (!room.players.white || !room.players.black || !room.players.white.connected || !room.players.black.connected) return ack({ ok: false, message: "Waiting for both players to be connected." });
    if (settleClock(room)) { emitState(room); void persistFinishedGame(room); return ack({ ok: false, message: "Your clock has expired." }); }
    if (room.game.isGameOver() || room.resignedBy || room.flaggedBy || room.agreedDraw || room.savedGameId) return ack({ ok: false, message: "This game has already ended." });
    const color = socket.data.color;
    if (!color || room.players[color]?.socketId !== socket.id) return ack({ ok: false, message: "You are not a player in this room." });
    const expectedColor = room.game.turn() === "w" ? "white" : "black";
    if (color !== expectedColor) return ack({ ok: false, message: "It is your opponent's turn." });
    try {
      const move = room.game.move({ from, to, promotion: promotion || "q" });
      if (!move) return ack({ ok: false, message: "That move is not legal." });
      room.clock[color + "Ms"] += room.clock.incrementMs;
      room.drawOfferBy = null;
      room.clockLastStartedAt = null;
      startClockIfReady(room);
      ack({ ok: true, san: move.san }); emitState(room);
      if (room.game.isGameOver()) void persistFinishedGame(room);
    } catch { ack({ ok: false, message: "That move is not legal." }); }
  });

  socket.on("game:resign", (_payload, ack = () => {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !socket.data.color || !room.players.white || !room.players.black || room.game.isGameOver() || room.resignedBy || room.flaggedBy || room.agreedDraw || room.savedGameId) return ack({ ok: false, message: "No active game to resign from." });
    settleClock(room); room.clockLastStartedAt = null; room.resignedBy = socket.data.color;
    io.to(room.id).emit("game:ended", { reason: "resignation", resignedBy: socket.data.color });
    emitState(room); ack({ ok: true }); void persistFinishedGame(room);
  });

  socket.on("game:reset", (_payload, ack = () => {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.players.white || !room.players.black) return ack({ ok: false, message: "Both players must be in the room to start a new game." });
    if (!room.game.isGameOver() && !room.resignedBy && !room.flaggedBy && !room.agreedDraw && room.game.history().length > 0) return ack({ ok: false, message: "Finish the current game before starting a rematch." });
    if (room.persisting) return ack({ ok: false, message: "The previous game is still being saved. Try again in a moment." });
    room.game = new Chess(); room.resignedBy = null; room.flaggedBy = null; room.agreedDraw = false; room.drawOfferBy = null; room.savedGameId = null; room.persisting = false; room.startedAt = new Date();
    room.clock.whiteMs = room.clock.initialMinutes * 60_000; room.clock.blackMs = room.clock.initialMinutes * 60_000; room.clockLastStartedAt = null; startClockIfReady(room);
    ack({ ok: true }); emitState(room);
  });

  socket.on("game:draw-offer", (_payload, ack = () => {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !socket.data.color || !room.players.white || !room.players.black || room.game.isGameOver() || room.resignedBy || room.flaggedBy || room.agreedDraw || room.savedGameId) return ack({ ok: false, message: "No active game for a draw offer." });
    if (settleClock(room)) { emitState(room); void persistFinishedGame(room); return ack({ ok: false, message: "Your clock has expired." }); }
    room.drawOfferBy = socket.data.color;
    io.to(room.id).emit("game:draw-offered", { by: socket.data.color }); emitState(room); ack({ ok: true });
  });

  socket.on("game:draw-response", ({ accept } = {}, ack = () => {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.drawOfferBy || room.drawOfferBy === socket.data.color || !socket.data.color) return ack({ ok: false, message: "There is no draw offer from your opponent." });
    if (accept) { settleClock(room); room.clockLastStartedAt = null; room.agreedDraw = true; room.drawOfferBy = null; io.to(room.id).emit("game:ended", { reason: "draw-agreed" }); void persistFinishedGame(room); }
    else { room.drawOfferBy = null; io.to(room.id).emit("game:draw-declined"); }
    emitState(room); ack({ ok: true });
  });

  socket.on("matchmaking:join", ({ name, timeControlMinutes = 5, incrementSeconds = 0 } = {}, ack = () => {}) => {
    leaveCurrentRoom(socket);
    const minutes = [1, 3, 5, 10, 15].includes(Number(timeControlMinutes)) ? Number(timeControlMinutes) : 5;
    const increment = [0, 2, 5].includes(Number(incrementSeconds)) ? Number(incrementSeconds) : 0;
    let opponentSocket = null;
    while (matchmakingQueue.length && !opponentSocket) {
      const candidateId = matchmakingQueue.shift();
      const candidate = io.sockets.sockets.get(candidateId);
      if (candidate && candidate.connected && candidate.id !== socket.id && !candidate.data.roomId) opponentSocket = candidate;
    }
    if (!opponentSocket) {
      matchmakingQueue.push(socket.id); socket.data.matchmakingName = safeName(name); socket.data.matchmakingMinutes = minutes; socket.data.matchmakingIncrement = increment;
      socket.data.matchmakingQueued = true; ack({ ok: true, waiting: true }); socket.emit("matchmaking:waiting"); return;
    }
    const id = makeRoomCode();
    const room = { id, game: new Chess(), players: { white: playerSnapshot(opponentSocket, opponentSocket.data.matchmakingName), black: playerSnapshot(socket, name) }, createdAt: new Date(), startedAt: new Date(), savedGameId: null, persisting: false, clock: { whiteMs: minutes * 60_000, blackMs: minutes * 60_000, incrementMs: increment * 1000, initialMinutes: minutes }, clockLastStartedAt: null, drawOfferBy: null, resignedBy: null, flaggedBy: null, agreedDraw: false };
    rooms.set(id, room);
    for (const [playerSocket, color] of [[opponentSocket, "white"], [socket, "black"]]) {
      playerSocket.data.roomId = id; playerSocket.data.color = color; playerSocket.data.matchmakingQueued = false; playerSocket.join(id);
      playerSocket.emit("matchmaking:matched", { state: publicState(room), color });
    }
    startClockIfReady(room); emitState(room); ack({ ok: true, waiting: false, state: publicState(room), color: "black" });
  });

  socket.on("matchmaking:cancel", (_payload, ack = () => {}) => {
    const index = matchmakingQueue.indexOf(socket.id);
    if (index >= 0) matchmakingQueue.splice(index, 1);
    socket.data.matchmakingQueued = false; ack({ ok: true }); socket.emit("matchmaking:cancelled");
  });

  socket.on("room:leave", () => leaveCurrentRoom(socket));
  socket.on("disconnect", () => {
    const index = matchmakingQueue.indexOf(socket.id);
    if (index >= 0) matchmakingQueue.splice(index, 1);
    leaveCurrentRoom(socket);
  });
});

const clockTicker = setInterval(() => {
  for (const room of rooms.values()) {
    if (settleClock(room)) { emitState(room); void persistFinishedGame(room); }
    else if (clocksCanRun(room)) emitState(room);
  }
}, 1000);
clockTicker.unref();

const port = Number(process.env.PORT || 5000);
try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");
  httpServer.listen(port, () => console.log(`Knightfall API and Socket.IO listening on http://localhost:${port}`));
} catch (error) {
  console.error("Could not connect to MongoDB. Check MONGODB_URI and your Atlas network access settings.", error.message);
  process.exit(1);
}
