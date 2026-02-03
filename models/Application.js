import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    scholarshipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Scholarship",
      required: true
    },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "UNDER_ADMIN_REVIEW"],
      default: "NOT_STARTED"
    },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

applicationSchema.index({ scholarshipId: 1 });
applicationSchema.index({ studentId: 1, scholarshipId: 1 }, { unique: true });

export default mongoose.model("Application", applicationSchema);
