import express from "express";
import {
  createModerator,
  getAllModerators,
  getAllStudents,
  getAllScholarships,
  getPendingScholarships,
  reviewScholarship,
  getVerificationQueue,
  verifyScholarship,
  flagScholarship,
  addInternalNote,
  getPendingDocuments,
  reviewDocument,
  getAuditLogs,
  getFraudAlerts,
  markFraudAlertReviewed
} from "../controllers/adminController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware, { allowRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// 🔐 ADMIN ONLY
router.post("/moderator", authMiddleware, roleMiddleware("ADMIN"), createModerator);
router.get("/moderators", authMiddleware, roleMiddleware("ADMIN"), getAllModerators);
router.get("/students", authMiddleware, roleMiddleware("ADMIN"), getAllStudents);

// Backward-compatible typo routes (do not rename)
router.get("/schoolerships", authMiddleware, roleMiddleware("ADMIN"), getAllScholarships);
router.get("/pending-schoolerships", authMiddleware, roleMiddleware("ADMIN"), getPendingScholarships);
router.put("/schoolerships/:id", authMiddleware, roleMiddleware("ADMIN"), reviewScholarship);

// Scholarships (correct spelling) – ADMIN only for list/review
router.get("/scholarships", authMiddleware, roleMiddleware("ADMIN"), getAllScholarships);
router.put("/scholarships/:id/review", authMiddleware, roleMiddleware("ADMIN"), reviewScholarship);

// Verification – ADMIN or MODERATOR
router.get("/scholarships/verification-queue", authMiddleware, allowRoles(["ADMIN", "MODERATOR"]), getVerificationQueue);
router.put("/scholarships/:id/verify", authMiddleware, allowRoles(["ADMIN", "MODERATOR"]), verifyScholarship);
router.put("/scholarships/:id/flag", authMiddleware, allowRoles(["ADMIN", "MODERATOR"]), flagScholarship);
router.put("/scholarships/:id/internal-note", authMiddleware, allowRoles(["ADMIN", "MODERATOR"]), addInternalNote);

// Document review – ADMIN or MODERATOR
router.get("/documents/pending", authMiddleware, allowRoles(["ADMIN", "MODERATOR"]), getPendingDocuments);
router.put("/documents/:id/review", authMiddleware, allowRoles(["ADMIN", "MODERATOR"]), reviewDocument);

// Audit logs & fraud – ADMIN only
router.get("/audit-logs", authMiddleware, roleMiddleware("ADMIN"), getAuditLogs);
router.get("/fraud-alerts", authMiddleware, roleMiddleware("ADMIN"), getFraudAlerts);
router.put("/fraud-alerts/:id/reviewed", authMiddleware, roleMiddleware("ADMIN"), markFraudAlertReviewed);

export default router;
