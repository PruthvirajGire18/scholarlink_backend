import express from "express";

import {
  createAssistanceRequest,
  getApplicationById,
  getApprovedScholarships,
  getMyApplications,
  getMyAssistanceRequests,
  getMyNotifications,
  getMyProfile,
  getRecommendedScholarships,
  replyToMyAssistanceRequest,
  submitScholarshipDataFeedback,
  getScholarshipById,
  getScholarshipDiscovery,
  getStudentDashboard,
  markNotificationRead,
  startScholarshipApplication,
  submitApplication,
  toggleApplicationStep,
  updateMyApplicationStatus,
  uploadApplicationDocument,
  upsertMyProfile
} from "../controllers/studentController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { uploadDocument } from "../middleware/uploadMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(authMiddleware, roleMiddleware("STUDENT"));

router.get("/dashboard", getStudentDashboard);
router.get("/profile", getMyProfile);
router.put("/profile", upsertMyProfile);

router.get("/scholarships/recommended", getRecommendedScholarships);
router.get("/scholarships/discover", getScholarshipDiscovery);
router.get("/scholarships", getApprovedScholarships);
router.get("/scholarships/:id", getScholarshipById);
router.post("/scholarships/:id/feedback", submitScholarshipDataFeedback);

router.post("/applications/:scholarshipId/start", startScholarshipApplication);
router.get("/applications", getMyApplications);
router.get("/applications/:applicationId", getApplicationById);
router.patch("/applications/:applicationId/steps/:stepKey", toggleApplicationStep);
router.post("/applications/:applicationId/submit", submitApplication);
router.patch("/applications/:applicationId/status", updateMyApplicationStatus);
router.post("/applications/:applicationId/documents", uploadDocument.single("file"), uploadApplicationDocument);

router.get("/notifications", getMyNotifications);
router.patch("/notifications/:id/read", markNotificationRead);

router.post("/assistance", createAssistanceRequest);
router.get("/assistance", getMyAssistanceRequests);
router.put("/assistance/:id/reply", replyToMyAssistanceRequest);

export default router;
