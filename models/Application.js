import mongoose from "mongoose";

const stepSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    isDone: { type: Boolean, default: false },
    completedAt: { type: Date }
  },
  { _id: false }
);

const checklistItemSchema = new mongoose.Schema(
  {
    documentType: { type: String, required: true },
    label: { type: String, required: true },
    isRequired: { type: Boolean, default: true },
    isUploaded: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
    comment: { type: String, default: "" }
  },
  { _id: false }
);

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
      enum: ["IN_PROGRESS", "APPLIED", "PENDING", "APPROVED", "REJECTED"],
      default: "IN_PROGRESS"
    },
    progressPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    roadmapSteps: {
      type: [stepSchema],
      default: []
    },
    documentChecklist: {
      type: [checklistItemSchema],
      default: []
    },
    finalSubmissionDone: {
      type: Boolean,
      default: false
    },
    submittedAt: { type: Date },
    decisionAt: { type: Date },
    reviewComment: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    deadlineSnapshot: { type: Date },
    remindersSent: {
      type: Number,
      default: 0
    },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

applicationSchema.index({ scholarshipId: 1 });
applicationSchema.index({ studentId: 1, scholarshipId: 1 }, { unique: true });
applicationSchema.index({ status: 1, updatedAt: -1 });
applicationSchema.index({ deadlineSnapshot: 1 });

export default mongoose.model("Application", applicationSchema);
