import mongoose from "mongoose";

const sourceSummarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    adapter: { type: String, default: "" },
    fetched: { type: Number, default: 0 },
    normalized: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    errors: { type: [String], default: [] }
  },
  { _id: false, suppressReservedKeysWarning: true }
);

const ingestionRunSchema = new mongoose.Schema(
  {
    trigger: {
      type: String,
      enum: ["MANUAL", "SCHEDULED", "STARTUP", "CRON"],
      default: "MANUAL"
    },
    status: {
      type: String,
      enum: ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"],
      default: "RUNNING",
      index: true
    },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sourceCount: { type: Number, default: 0 },
    totals: {
      fetched: { type: Number, default: 0 },
      normalized: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 }
    },
    sourceSummaries: {
      type: [sourceSummarySchema],
      default: []
    },
    startedAt: { type: Date, default: Date.now, required: true },
    finishedAt: { type: Date },
    durationMs: { type: Number, default: 0 },
    errorMessage: { type: String, default: "" }
  },
  { timestamps: true }
);

ingestionRunSchema.index({ createdAt: -1 });

export default mongoose.model("IngestionRun", ingestionRunSchema);
