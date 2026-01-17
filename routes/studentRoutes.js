import express from "express";
import { getApprovedScholarships } from "../controllers/studentController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get(
  "/scholarships",
  authMiddleware,
  roleMiddleware("STUDENT"),
  getApprovedScholarships
);

export default router;
