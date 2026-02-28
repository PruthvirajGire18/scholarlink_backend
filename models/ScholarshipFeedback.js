import mongoose from "mongoose";

const scholarshipFeedbackSchema = new mongoose.Schema(
  {
    scholarshipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Scholarship",
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    missingFields: {
      type: [String],
      default: []
    },
    dataCompletenessScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    status: {
      type: String,
      enum: ["OPEN", "REVIEWED", "RESOLVED"],
      default: "OPEN",
      index: true
    },
    adminComment: {
      type: String,
      default: ""
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    reviewedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

scholarshipFeedbackSchema.index({ scholarshipId: 1, status: 1, createdAt: -1 });
scholarshipFeedbackSchema.index({ studentId: 1, scholarshipId: 1, status: 1 });

export default mongoose.model("ScholarshipFeedback", scholarshipFeedbackSchema);
