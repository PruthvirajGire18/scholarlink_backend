import express from "express";

import {
  addInternalNote,
  createModerator,
  flagScholarship,
  getAllModerators,
  getAllScholarships,
  getAllStudents,
  getApplicationsOverview,
  getAuditLogs,
  getCommonRejectionReasons,
  getDashboardAnalytics,
  getFraudAlerts,
  getPendingDocuments,
  getPendingScholarships,
  getStudentProfileForAdmin,
  getVerificationQueue,
  markFraudAlertReviewed,
  reviewDocument,
  reviewScholarship,
  sendStudentReminder,
  updateApplicationStatus,
  verifyScholarship
} from "../controllers/adminController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware, { allowRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/moderator", roleMiddleware("ADMIN"), createModerator);
router.get("/moderators", roleMiddleware("ADMIN"), getAllModerators);
router.get("/students", roleMiddleware("ADMIN"), getAllStudents);
router.get("/students/:id/profile", roleMiddleware("ADMIN"), getStudentProfileForAdmin);
router.post("/students/:id/reminder", roleMiddleware("ADMIN"), sendStudentReminder);

router.get("/dashboard/analytics", roleMiddleware("ADMIN"), getDashboardAnalytics);
router.get("/applications", allowRoles(["ADMIN", "MODERATOR"]), getApplicationsOverview);
router.patch("/applications/:id/status", roleMiddleware("ADMIN"), updateApplicationStatus);
router.get("/rejections/reasons", roleMiddleware("ADMIN"), getCommonRejectionReasons);

// Backward-compatible typo routes
router.get("/schoolerships", roleMiddleware("ADMIN"), getAllScholarships);
router.get("/pending-schoolerships", roleMiddleware("ADMIN"), getPendingScholarships);
router.put("/schoolerships/:id", roleMiddleware("ADMIN"), reviewScholarship);

router.get("/scholarships", roleMiddleware("ADMIN"), getAllScholarships);
router.get("/scholarships/pending", roleMiddleware("ADMIN"), getPendingScholarships);
router.put("/scholarships/:id/review", roleMiddleware("ADMIN"), reviewScholarship);

router.get("/scholarships/verification-queue", allowRoles(["ADMIN", "MODERATOR"]), getVerificationQueue);
router.put("/scholarships/:id/verify", allowRoles(["ADMIN", "MODERATOR"]), verifyScholarship);
router.put("/scholarships/:id/flag", allowRoles(["ADMIN", "MODERATOR"]), flagScholarship);
router.put("/scholarships/:id/internal-note", allowRoles(["ADMIN", "MODERATOR"]), addInternalNote);

router.get("/documents/pending", allowRoles(["ADMIN", "MODERATOR"]), getPendingDocuments);
router.put("/documents/:id/review", allowRoles(["ADMIN", "MODERATOR"]), reviewDocument);

router.get("/audit-logs", roleMiddleware("ADMIN"), getAuditLogs);
router.get("/fraud-alerts", roleMiddleware("ADMIN"), getFraudAlerts);
router.put("/fraud-alerts/:id/reviewed", roleMiddleware("ADMIN"), markFraudAlertReviewed);

export default router;
