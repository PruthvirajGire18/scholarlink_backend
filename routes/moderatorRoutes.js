import express from "express";
import {
  createScholarship,
  getMyScholarships
} from "../controllers/moderatorController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post(
  "/scholarships",
  authMiddleware,
  roleMiddleware("MODERATOR"),
  createScholarship
);

router.get(
  "/scholarships",
  authMiddleware,
  roleMiddleware("MODERATOR"),
  getMyScholarships
);

export default router;
