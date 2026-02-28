import express from "express";

import {
  getIngestionRuns,
  getIngestionStatus,
  runIngestionFromCron,
  runIngestionNow
} from "../controllers/ingestionController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/cron", runIngestionFromCron);

router.use(authMiddleware, roleMiddleware("ADMIN"));
router.get("/status", getIngestionStatus);
router.get("/runs", getIngestionRuns);
router.post("/run", runIngestionNow);

export default router;
