import { Router } from "express";
import mongoose from "mongoose";
import Game from "../models/Game.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/mine", async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.max(1, Math.min(20, Number.parseInt(req.query.limit, 10) || 10));
    const userId = req.user._id;
    const filter = { $or: [{ "white.userId": userId }, { "black.userId": userId }] };
    const [docs, total] = await Promise.all([
      Game.find(filter).sort({ endedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Game.countDocuments(filter)
    ]);
    const games = docs.map((game) => {
      const isWhite = String(game.white.userId || "") === String(userId);
      const player = isWhite ? game.white : game.black;
      const opponent = isWhite ? game.black : game.white;
      const outcome = game.result === "1/2-1/2" ? "draw" : (isWhite ? game.result === "1-0" : game.result === "0-1") ? "win" : "loss";
      return {
        id: String(game._id), roomCode: game.roomCode, color: isWhite ? "White" : "Black",
        opponent: opponent.name, result: game.result, outcome, termination: game.termination,
        pgn: game.pgn, moves: game.moves, finalFen: game.finalFen, rated: game.rated,
        ratingBefore: player.ratingBefore, ratingAfter: player.ratingAfter,
        ratingChange: Number.isFinite(player.ratingBefore) && Number.isFinite(player.ratingAfter) ? player.ratingAfter - player.ratingBefore : null,
        endedAt: game.endedAt
      };
    });
    res.json({ games, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, stats: {
      rating: req.user.rating, gamesPlayed: req.user.gamesPlayed, gamesWon: req.user.gamesWon,
      gamesDrawn: req.user.gamesDrawn || 0
    } });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Game not found." });
    const game = await Game.findById(req.params.id).lean();
    if (!game) return res.status(404).json({ message: "Game not found." });
    const userId = String(req.user._id);
    if (![String(game.white.userId || ""), String(game.black.userId || "")].includes(userId)) {
      return res.status(403).json({ message: "You do not have access to this game." });
    }
    res.json({ game: { id: String(game._id), roomCode: game.roomCode, white: game.white.name, black: game.black.name,
      result: game.result, termination: game.termination, pgn: game.pgn, moves: game.moves,
      finalFen: game.finalFen, rated: game.rated, startedAt: game.startedAt, endedAt: game.endedAt } });
  } catch (error) { next(error); }
});

export default router;
