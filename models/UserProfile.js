import mongoose from "mongoose";

const languageEnum = ["en", "hi", "mr"];

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    gender: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER"]
    },

    dateOfBirth: Date,

    mobile: {
      type: String,
      match: [/^[6-9]\d{9}$/, "Invalid mobile number"]
    },

    address: {
      state: { type: String, trim: true },
      district: { type: String, trim: true },
      pincode: { type: String, trim: true },
      line1: { type: String, trim: true }
    },

    education: {
      course: String,
      branch: String,
      institute: String,
      currentYear: Number,
      percentage: { type: Number, min: 0, max: 100 },
      educationLevel: {
        type: String,
        enum: ["DIPLOMA", "UG", "PG", "PHD"]
      }
    },

    category: {
      type: String,
      enum: ["OPEN", "OBC", "SC", "ST", "VJNT", "EWS", "SEBC"]
    },

    annualIncome: { type: Number, min: 0 },

    financial: {
      hasDisability: { type: Boolean, default: false },
      isFirstGenerationLearner: { type: Boolean, default: false },
      guardianOccupation: { type: String, trim: true }
    },

    preferredLanguages: [
      {
        type: String,
        enum: languageEnum
      }
    ],

    notificationPreferences: {
      deadlineAlerts: { type: Boolean, default: true },
      applicationUpdates: { type: Boolean, default: true },
      adminMessages: { type: Boolean, default: true }
    },

    documents: {
      incomeCertificate: { type: Boolean, default: false },
      casteCertificate: { type: Boolean, default: false },
      domicileCertificate: { type: Boolean, default: false },
      marksheet: { type: Boolean, default: false },
      aadhaar: { type: Boolean, default: false }
    },

    profileCompletion: {
      type: Number,
      default: 0
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    lastProfileReminderAt: {
      type: Date
    }
  },
  { timestamps: true }
);

userProfileSchema.index({ annualIncome: 1, category: 1 });
userProfileSchema.index({ "education.educationLevel": 1 });

export default mongoose.model("UserProfile", userProfileSchema);
