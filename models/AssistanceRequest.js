import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ["STUDENT", "MODERATOR"], required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const assistanceRequestSchema = new mongoose.Schema(
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

    moderatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    messages: {
      type: [messageSchema],
      default: []
    },

    status: {
      type: String,
      enum: ["OPEN", "RESOLVED"],
      default: "OPEN"
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

assistanceRequestSchema.index({ studentId: 1 });
assistanceRequestSchema.index({ moderatorId: 1, status: 1 });
assistanceRequestSchema.index({ scholarshipId: 1 });

export default mongoose.model("AssistanceRequest", assistanceRequestSchema);
