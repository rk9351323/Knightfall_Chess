import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  name: { type: String, required: true, maxlength: 24 },
  ratingBefore: { type: Number, default: null },
  ratingAfter: { type: Number, default: null }
}, { _id: false });

const gameSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, index: true },
  white: { type: playerSchema, required: true },
  black: { type: playerSchema, required: true },
  result: { type: String, enum: ["1-0", "0-1", "1/2-1/2"], required: true },
  winnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  termination: { type: String, required: true, maxlength: 40 },
  pgn: { type: String, default: "" },
  moves: { type: [String], default: [] },
  finalFen: { type: String, required: true },
  rated: { type: Boolean, default: false },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true, versionKey: false });

gameSchema.index({ "white.userId": 1, endedAt: -1 });
gameSchema.index({ "black.userId": 1, endedAt: -1 });

export default mongoose.model("Game", gameSchema);
