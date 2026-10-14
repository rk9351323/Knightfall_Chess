import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.knightfall_token;
    if (!token) return res.status(401).json({ message: "Please log in to continue." });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: "Your session is no longer valid. Please log in again." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Your session is invalid or expired. Please log in again." });
  }
}
