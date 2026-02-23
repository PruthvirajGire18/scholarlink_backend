import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    scholarshipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Scholarship",
      required: true
    },

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application"
    },

    documentType: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },

    fileUrl: {
      type: String,
      required: true
    },

    cloudinaryPublicId: {
      type: String,
      default: ""
    },

    fileName: {
      type: String,
      default: ""
    },

    mimeType: {
      type: String,
      default: ""
    },

    sizeBytes: {
      type: Number,
      default: 0
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING"
    },

    rejectionReason: { type: String, default: "" },
    reviewComment: { type: String, default: "" },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },

    checksum: {
      type: String,
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, scholarshipId: 1, documentType: 1 });
documentSchema.index({ applicationId: 1, documentType: 1 });

export default mongoose.model("Document", documentSchema);
