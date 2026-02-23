import mongoose from "mongoose";

const scholarshipSchema = new mongoose.Schema(
  {
    /* BASIC INFO */
    title: {
      type: String,
      required: true
    },

    description: {
      type: String,
      required: true
    },

    localizedContent: {
      en: {
        title: String,
        description: String
      },
      hi: {
        title: String,
        description: String
      },
      mr: {
        title: String,
        description: String
      }
    },

    provider: {
      name: String,
      type: {
        type: String,
        enum: ["GOVERNMENT", "NGO", "CSR", "PRIVATE"],
        required: true
      },
      website: String
    },

    /* FINANCIAL INFO */
    amount: {
      type: Number, // yearly amount
      required: true
    },

    benefits: {
      type: String // tuition fee, stipend, hostel etc
    },

    tags: [String],

    /* ELIGIBILITY */
    eligibility: {
      minMarks: {
        type: Number // percentage
      },

      maxIncome: {
        type: Number // yearly income
      },

      categories: [
        {
          type: String,
          enum: ["OPEN", "OBC", "SC", "ST", "VJNT", "EWS", "SEBC"]
        }
      ],

      gender: {
        type: String,
        enum: ["MALE", "FEMALE", "ANY"],
        default: "ANY"
      },

      statesAllowed: [String], // Maharashtra, Gujarat, etc

      educationLevel: {
        type: String,
        enum: ["DIPLOMA", "UG", "PG", "PHD"]
      }
    },

    /* DOCUMENTS */
    documentsRequired: [
      {
        type: String // Aadhaar, Income Certificate, Caste Certificate etc
      }
    ],

    commonMistakes: [
      {
        type: String,
        trim: true
      }
    ],

    /* APPLICATION */
    applicationProcess: {
      mode: {
        type: String,
        enum: ["ONLINE", "OFFLINE", "BOTH"]
      },
      applyLink: String,
      steps: [String]
    },

    /* STATUS & CONTROL */
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING"
    },

    deadline: {
      type: Date,
      required: true
    },

    /* ADMIN / MODERATOR */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    reviewRemarks: {
      type: String
    },

    isActive: {
      type: Boolean,
      default: true
    },

    /* VERIFICATION (Admin/Moderator trust) */
    verificationStatus: {
      type: String,
      enum: ["UNVERIFIED", "VERIFIED", "FLAGGED"],
      default: "UNVERIFIED"
    },

    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    internalNotes: [
      {
        note: { type: String, required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        addedAt: { type: Date, default: Date.now }
      }
    ],

    flagReason: { type: String }
  },
  { timestamps: true }
);

scholarshipSchema.index({ status: 1, isActive: 1, deadline: 1 });
scholarshipSchema.index({ title: "text", description: "text", tags: "text" });
scholarshipSchema.index({ "provider.type": 1 });

export default mongoose.model("Scholarship", scholarshipSchema);
