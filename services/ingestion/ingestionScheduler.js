import { runScholarshipIngestion } from "./scholarshipIngestionService.js";

let schedulerTimer = null;

function parseDailyHourUtc() {
  const parsed = Number(process.env.INGEST_DAILY_HOUR_UTC);
  if (Number.isNaN(parsed)) return 2;
  return Math.min(23, Math.max(0, Math.floor(parsed)));
}

function getMsUntilNextRun(hourUtc) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function scheduleNextDailyRun(hourUtc) {
  const waitMs = getMsUntilNextRun(hourUtc);
  schedulerTimer = setTimeout(async () => {
    try {
      await runScholarshipIngestion({ trigger: "SCHEDULED" });
    } catch (error) {
      console.error("[ingestionScheduler] scheduled run failed:", error.message);
    } finally {
      scheduleNextDailyRun(hourUtc);
    }
  }, waitMs);

  if (typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }
}

export function startScholarshipIngestionScheduler() {
  const isVercelRuntime = Boolean(process.env.VERCEL);
  const schedulerFlag = String(process.env.INGEST_SCHEDULER_ENABLED || "").toLowerCase();

  // On Vercel serverless, prefer Vercel Cron endpoint. Enable this only if explicitly required.
  if (isVercelRuntime && !schedulerFlag) {
    return;
  }

  if (schedulerFlag === "false") {
    return;
  }

  const runOnBoot = String(process.env.INGEST_RUN_ON_BOOT || "true").toLowerCase() !== "false";
  const hourUtc = parseDailyHourUtc();

  if (runOnBoot) {
    runScholarshipIngestion({ trigger: "STARTUP" }).catch((error) => {
      console.error("[ingestionScheduler] startup run failed:", error.message);
    });
  }

  scheduleNextDailyRun(hourUtc);
}

export function stopScholarshipIngestionScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}
