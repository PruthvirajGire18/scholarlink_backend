import {
  getScholarshipIngestionStatus,
  listScholarshipIngestionRuns,
  runScholarshipIngestion
} from "../services/ingestion/scholarshipIngestionService.js";

function hasValidCronSecret(req) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected) return false;
  const header = String(req.headers.authorization || "");
  return header === `Bearer ${expected}`;
}

export const runIngestionNow = async (req, res) => {
  try {
    const result = await runScholarshipIngestion({
      trigger: "MANUAL",
      initiatedBy: req.user?.id
    });

    if (!result.accepted) {
      return res.status(409).json(result);
    }

    return res.status(202).json(result);
  } catch (error) {
    return res.status(500).json({ message: "Failed to start ingestion run", error: error.message });
  }
};

export const getIngestionStatus = async (req, res) => {
  try {
    const status = await getScholarshipIngestionStatus();
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch ingestion status", error: error.message });
  }
};

export const getIngestionRuns = async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const runs = await listScholarshipIngestionRuns(limit);
    return res.json(runs);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch ingestion runs", error: error.message });
  }
};

export const runIngestionFromCron = async (req, res) => {
  try {
    if (!hasValidCronSecret(req)) {
      return res.status(401).json({ message: "Unauthorized cron trigger" });
    }

    const result = await runScholarshipIngestion({ trigger: "CRON" });
    if (!result.accepted) {
      return res.status(409).json(result);
    }

    return res.status(202).json(result);
  } catch (error) {
    return res.status(500).json({ message: "Cron ingestion failed", error: error.message });
  }
};
