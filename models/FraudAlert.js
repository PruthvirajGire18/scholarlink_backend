import mongoose from "mongoose";

const fraudAlertSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["USER", "DOCUMENT", "APPLICATION"],
      required: true
    },

    entityId: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    signalType: {
      type: String,
      required: true
    },

    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM"
    },

    metadata: { type: mongoose.Schema.Types.Mixed },

    detectedAt: { type: Date, default: Date.now },

    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isResolved: { type: Boolean, default: false }
  },
  { timestamps: true }
);

fraudAlertSchema.index({ isResolved: 1, severity: 1 });
fraudAlertSchema.index({ detectedAt: -1 });

export default mongoose.model("FraudAlert", fraudAlertSchema);
