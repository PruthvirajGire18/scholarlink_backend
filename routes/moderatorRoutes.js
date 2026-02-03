import express from "express";
import {
  createScholarship,
  getMyScholarships,
  updateScholarship,
  deleteScholarship,
  getAssistanceRequests,
  replyToAssistance,
  resolveAssistance,
  getScholarshipApplications
} from "../controllers/moderatorController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/scholarships", authMiddleware, roleMiddleware("MODERATOR"), createScholarship);
router.get("/scholarships", authMiddleware, roleMiddleware("MODERATOR"), getMyScholarships);
router.put("/scholarships/:id", authMiddleware, roleMiddleware("MODERATOR"), updateScholarship);
router.delete("/scholarships/:id", authMiddleware, roleMiddleware("MODERATOR"), deleteScholarship);
router.get("/scholarships/:id/applications", authMiddleware, roleMiddleware("MODERATOR"), getScholarshipApplications);

router.get("/assistance", authMiddleware, roleMiddleware("MODERATOR"), getAssistanceRequests);
router.put("/assistance/:id/reply", authMiddleware, roleMiddleware("MODERATOR"), replyToAssistance);
router.put("/assistance/:id/resolve", authMiddleware, roleMiddleware("MODERATOR"), resolveAssistance);

export default router;
