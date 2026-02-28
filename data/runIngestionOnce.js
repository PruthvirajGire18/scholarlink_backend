import dotenv from "dotenv";

import { connectDB } from "../config/db.js";
import { runScholarshipIngestion } from "../services/ingestion/scholarshipIngestionService.js";

dotenv.config();

async function main() {
  await connectDB();
  const result = await runScholarshipIngestion({ trigger: "MANUAL" });
  console.log(JSON.stringify(result, null, 2));

  if (!result.accepted || result.status === "FAILED") {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Ingestion run failed:", error.message);
  process.exit(1);
});
