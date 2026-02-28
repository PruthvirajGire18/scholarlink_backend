import mongoose from "mongoose";

const languageEnum = ["en", "hi", "mr"];
const categoryEnum = ["OPEN", "OBC", "SC", "ST", "VJNT", "EWS", "SEBC"];
const educationLevelEnum = ["DIPLOMA", "UG", "PG", "PHD"];
const documentSourceEnum = ["PROFILE_UPLOAD", "APPLICATION_UPLOAD", "MANUAL"];

const uploadedDocumentSchema = new mongoose.Schema(
  {
    isUploaded: { type: Boolean, default: false },
    fileUrl: { type: String, default: "" },
    cloudinaryPublicId: { type: String, default: "" },
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    uploadedAt: { type: Date },
    source: {
      type: String,
      enum: documentSourceEnum,
      default: "PROFILE_UPLOAD"
    }
  },
  { _id: false }
);

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

    personal: {
      fullName: { type: String, trim: true },
      firstName: { type: String, trim: true },
      middleName: { type: String, trim: true },
      lastName: { type: String, trim: true },
      fatherName: { type: String, trim: true },
      motherName: { type: String, trim: true },
      maritalStatus: {
        type: String,
        enum: ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER"]
      },
      religion: { type: String, trim: true },
      caste: { type: String, trim: true },
      subCaste: { type: String, trim: true },
      nationality: { type: String, trim: true },
      aadhaarNumber: {
        type: String,
        trim: true,
        validate: {
          validator: (value) => !value || /^\d{12}$/.test(value),
          message: "Invalid Aadhaar number"
        }
      },
      panNumber: { type: String, trim: true },
      abcId: { type: String, trim: true },
      domicileState: { type: String, trim: true }
    },

    address: {
      state: { type: String, trim: true },
      district: { type: String, trim: true },
      taluka: { type: String, trim: true },
      city: { type: String, trim: true },
      village: { type: String, trim: true },
      pincode: { type: String, trim: true },
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      correspondenceSameAsPermanent: { type: Boolean, default: true }
    },

    family: {
      guardianName: { type: String, trim: true },
      fatherOccupation: { type: String, trim: true },
      motherOccupation: { type: String, trim: true },
      familySize: { type: Number, min: 0 }
    },

    education: {
      course: { type: String, trim: true },
      branch: { type: String, trim: true },
      institute: { type: String, trim: true },
      instituteCode: { type: String, trim: true },
      university: { type: String, trim: true },
      currentYear: Number,
      currentSemester: Number,
      admissionYear: Number,
      admissionType: { type: String, trim: true },
      previousExamBoard: { type: String, trim: true },
      previousPassingYear: Number,
      previousPercentage: { type: Number, min: 0, max: 100 },
      percentage: { type: Number, min: 0, max: 100 },
      educationLevel: {
        type: String,
        enum: educationLevelEnum
      }
    },

    category: {
      type: String,
      enum: categoryEnum
    },

    annualIncome: { type: Number, min: 0 },

    bankDetails: {
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
      bankName: { type: String, trim: true },
      branchName: { type: String, trim: true },
      isAadhaarSeeded: { type: Boolean, default: false }
    },

    financial: {
      hasDisability: { type: Boolean, default: false },
      isFirstGenerationLearner: { type: Boolean, default: false },
      guardianOccupation: { type: String, trim: true },
      incomeCertificateNumber: { type: String, trim: true },
      bplCardHolder: { type: Boolean, default: false },
      isFarmerChild: { type: Boolean, default: false },
      familyIncomeSource: { type: String, trim: true }
    },

    social: {
      minorityStatus: { type: Boolean, default: false },
      minorityType: { type: String, trim: true },
      isOrphan: { type: Boolean, default: false },
      isHosteller: { type: Boolean, default: false }
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
      incomeCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      casteCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      casteValidityCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      nonCreamyLayerCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      domicileCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      marksheet: { type: uploadedDocumentSchema, default: () => ({}) },
      transferCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      gapCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      bankPassbook: { type: uploadedDocumentSchema, default: () => ({}) },
      feeReceipt: { type: uploadedDocumentSchema, default: () => ({}) },
      admissionLetter: { type: uploadedDocumentSchema, default: () => ({}) },
      bonafideCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      disabilityCertificate: { type: uploadedDocumentSchema, default: () => ({}) },
      minorityDeclaration: { type: uploadedDocumentSchema, default: () => ({}) },
      rationCard: { type: uploadedDocumentSchema, default: () => ({}) },
      selfDeclaration: { type: uploadedDocumentSchema, default: () => ({}) },
      aadhaar: { type: uploadedDocumentSchema, default: () => ({}) }
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
userProfileSchema.index({ "address.state": 1, "address.district": 1 });

export default mongoose.model("UserProfile", userProfileSchema);
