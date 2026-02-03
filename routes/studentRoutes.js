import express from "express";
import {
  getApprovedScholarships,
  getScholarshipById,
  createAssistanceRequest,
  getMyAssistanceRequests
} from "../controllers/studentController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/scholarships", authMiddleware, roleMiddleware("STUDENT"), getApprovedScholarships);
router.get("/scholarships/:id", authMiddleware, roleMiddleware("STUDENT"), getScholarshipById);

router.post("/assistance", authMiddleware, roleMiddleware("STUDENT"), createAssistanceRequest);
router.get("/assistance", authMiddleware, roleMiddleware("STUDENT"), getMyAssistanceRequests);

export default router;
