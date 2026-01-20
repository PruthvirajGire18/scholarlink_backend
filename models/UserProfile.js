import mongoose from "mongoose";

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
      pincode: { type: String, trim: true }
    },

    education: {
      course: String,
      branch: String,
      institute: String,
      currentYear: Number,
      percentage: { type: Number, min: 0, max: 100 }
    },

    category: {
      type: String,
      enum: ["OPEN", "OBC", "SC", "ST", "VJNT", "EWS", "SEBC"]
    },

    annualIncome: Number,

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
    }
  },
  { timestamps: true }
);

export default mongoose.model("UserProfile", userProfileSchema);
