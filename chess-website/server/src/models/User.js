import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 20, unique: true, lowercase: true, index: true },
  displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  rating: { type: Number, default: 1200 },
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },
  gamesDrawn: { type: Number, default: 0 }
}, { timestamps: true, versionKey: false });

userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.email;
    return ret;
  }
});

export default mongoose.model("User", userSchema);
