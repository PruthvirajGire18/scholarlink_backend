import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./config/db.js";
import errorHandler from "./middleware/errorHandler.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import moderatorRoutes from "./routes/moderatorRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import ingestionRoutes from "./routes/ingestionRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import { startScholarshipIngestionScheduler } from "./services/ingestion/ingestionScheduler.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://scholarsetu.netlify.app"
];
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOriginSet = new Set(allowedOrigins);

connectDB();

app.set("trust proxy", 1);
app.disable("etag");
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (requestOrigin && allowedOriginSet.has(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});
app.use(express.json());
app.use(helmet());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, try again later"
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/moderator", moderatorRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/ingestion", ingestionRoutes);
app.use("/api/profile", profileRoutes);

app.get("/", (req, res) => {
  res.send("ScholarLink API running");
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScholarshipIngestionScheduler();
});
