import express from "express";
import {
  createModerator,
  getAllModerators,
  getAllStudents,
  getAllScholarships,
  getPendingScholarships,
  reviewScholarship
} from "../controllers/adminController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";
const router = express.Router();

// 🔐 ADMIN ONLY ROUTES
router.post(
  "/moderator",
  authMiddleware,
  roleMiddleware("ADMIN"),
  createModerator
);

router.get(
  "/moderators",
  authMiddleware,
  roleMiddleware("ADMIN"),
  getAllModerators
);

router.get(
  "/students",
  authMiddleware,
  roleMiddleware("ADMIN"),
  getAllStudents
);

router.get(
  "/schoolerships",
  authMiddleware,
  roleMiddleware("ADMIN"),
  getAllScholarships
);

router.get(
  "/pending-schoolerships",
  authMiddleware,
  roleMiddleware("ADMIN"),
  getPendingScholarships
);

router.get(
  "/schoolerships",
  authMiddleware,
  roleMiddleware("ADMIN"),
  getAllScholarships
);

router.put(
  "/schoolerships/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  reviewScholarship
);



export default router;
