import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import moderatorRoutes from "./routes/moderatorRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";

import { connectDB } from "./config/db.js";

dotenv.config();

const app = express();

/* 🔹 DB */
connectDB();

/* 🔹 Global Middlewares */
app.use(cors());
app.use(express.json());
app.use(helmet());

/* 🔹 Rate Limiter (Auth only) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, try again later"
});

/* 🔹 Routes */
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/moderator", moderatorRoutes);
app.use("/api/student", studentRoutes);

/* 🔹 Health */
app.get("/", (req, res) => {
  res.send("ScholarLink API running 🚀");
});

/* 🔹 Server */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
