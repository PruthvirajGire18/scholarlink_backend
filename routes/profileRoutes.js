import express from "express";

import { getAuthenticatedProfile } from "../controllers/profileController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, getAuthenticatedProfile);

export default router;
