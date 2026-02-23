import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    actorRole: {
      type: String,
      enum: ["ADMIN", "MODERATOR"],
      required: true
    },

    actionType: {
      type: String,
      required: true
    },

    entityType: {
      type: String,
      enum: ["USER", "SCHOLARSHIP", "DOCUMENT", "APPLICATION", "FRAUD_ALERT"],
      required: true
    },

    entityId: { type: mongoose.Schema.Types.Mixed },

    beforeState: { type: mongoose.Schema.Types.Mixed },
    afterState: { type: mongoose.Schema.Types.Mixed },

    ipAddress: { type: String },
    userAgent: { type: String },

    createdAt: { type: Date, default: Date.now, immutable: true }
  },
  { timestamps: false }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ actionType: 1 });
auditLogSchema.index({ createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
