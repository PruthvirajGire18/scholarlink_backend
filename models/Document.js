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

    documentType: {
      type: String,
      enum: [
        "INCOME_CERTIFICATE",
        "CASTE_CERTIFICATE",
        "TRANSCRIPT",
        "AADHAAR",
        "MARKSHEET",
        "DOMICILE",
        "OTHER"
      ],
      required: true
    },

    fileUrl: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING"
    },

    rejectionReason: { type: String },

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

export default mongoose.model("Document", documentSchema);
