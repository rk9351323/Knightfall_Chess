import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers, and underscores for username."),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72)
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72)
});

function publicUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    rating: user.rating,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    gamesDrawn: user.gamesDrawn || 0,
    createdAt: user.createdAt
  };
}

function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("knightfall_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Please check your details." });
    const { displayName, username, email, password } = parsed.data;
    const normalizedUsername = username.toLowerCase();
    const normalizedEmail = email.toLowerCase();
    const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { username: normalizedUsername }] });
    if (existing) {
      const field = existing.email === normalizedEmail ? "email" : "username";
      return res.status(409).json({ message: `An account with that ${field} already exists.` });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ displayName, username: normalizedUsername, email: normalizedEmail, passwordHash });
    setSessionCookie(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "That email or username is already registered." });
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Enter a valid email and password." });
    const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
    const passwordMatches = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
    if (!passwordMatches) return res.status(401).json({ message: "Email or password is incorrect." });
    setSessionCookie(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("knightfall_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  res.json({ message: "You have been logged out." });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
