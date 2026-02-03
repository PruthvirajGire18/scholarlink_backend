import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Scholarship from "../models/Scholarship.js";
import Document from "../models/Document.js";
import AuditLog from "../models/AuditLog.js";
import FraudAlert from "../models/FraudAlert.js";
import { createAuditLog, getClientMeta } from "../utils/auditHelper.js";
import { calculateRiskScore } from "../utils/riskScore.js";

/* ===========================
   ADMIN → CREATE MODERATOR
=========================== */
export const createModerator = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const moderator = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "MODERATOR",
      createdBy: req.user.id // admin id
    });

    const meta = getClientMeta(req);
    await createAuditLog({
      actorId: req.user.id,
      actorRole: "ADMIN",
      actionType: "CREATE_MODERATOR",
      entityType: "USER",
      entityId: moderator._id,
      afterState: { name: moderator.name, email: moderator.email },
      ...meta
    });

    res.status(201).json({
      message: "Moderator created successfully",
      moderator: {
        id: moderator._id,
        name: moderator.name,
        email: moderator.email,
        role: moderator.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===========================
   ADMIN → GET ALL MODERATORS
=========================== */
export const getAllModerators = async (req, res) => {
  try {
    const moderators = await User.find({ role: "MODERATOR" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(moderators);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===========================
   ADMIN → GET ALL STUDENTS
=========================== */
export const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: "STUDENT" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===========================
   ADMIN → GET PENDING SCHOLARSHIPS
=========================== */
export const getPendingScholarships = async (req, res) => {
  const data = await Scholarship.find({ status: "PENDING" })
    .populate("createdBy", "name email");

  res.json(data);
};

/* ===========================
   ADMIN → APPROVE / REJECT
=========================== */
export const reviewScholarship = async (req, res) => {
  const { status, remarks } = req.body;
  const oldDoc = await Scholarship.findById(req.params.id).lean();

  const scholarship = await Scholarship.findByIdAndUpdate(
    req.params.id,
    {
      status,
      reviewRemarks: remarks,
      reviewedBy: req.user.id
    },
    { new: true }
  );

  const meta = getClientMeta(req);
  await createAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    actionType: status === "APPROVED" ? "APPROVE_SCHOLARSHIP" : "REJECT_SCHOLARSHIP",
    entityType: "SCHOLARSHIP",
    entityId: scholarship._id,
    beforeState: oldDoc ? { status: oldDoc.status } : null,
    afterState: { status: scholarship.status, reviewRemarks: remarks },
    ...meta
  });

  res.json({
    msg: `Scholarship ${status}`,
    scholarship
  });
};


/* ===========================
   ADMIN → GET ALL SCHOLARSHIPS
=========================== */
export const getAllScholarships = async (req, res) => {
  try {
    const { status } = req.query; 
    // optional: ?status=PENDING / APPROVED / REJECTED

    const filter = status ? { status } : {};

    const scholarships = await Scholarship.find(filter)
      .populate("createdBy", "name email role")
      .populate("reviewedBy", "name email role")
      .sort({ createdAt: -1 });

    res.json(scholarships);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===========================
   VERIFICATION QUEUE
=========================== */
export const getVerificationQueue = async (req, res) => {
  try {
    const list = await Scholarship.find({
      status: "PENDING",
      $or: [
        { verificationStatus: "UNVERIFIED" },
        { verificationStatus: { $exists: false } }
      ]
    })
      .populate("createdBy", "name email")
      .sort({ createdAt: 1 })
      .lean();

    const withRisk = await Promise.all(
      list.map(async (s) => {
        const riskScore = await calculateRiskScore(s);
        return { ...s, riskScore };
      })
    );

    res.json(withRisk);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const verifyScholarship = async (req, res) => {
  try {
    const { id } = req.params;
    const oldDoc = await Scholarship.findById(id).lean();
    if (!oldDoc) return res.status(404).json({ message: "Scholarship not found" });

    const scholarship = await Scholarship.findByIdAndUpdate(
      id,
      { verificationStatus: "VERIFIED" },
      { new: true }
    );

    const meta = getClientMeta(req);
    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: "VERIFY_SCHOLARSHIP",
      entityType: "SCHOLARSHIP",
      entityId: id,
      beforeState: { verificationStatus: oldDoc.verificationStatus },
      afterState: { verificationStatus: "VERIFIED" },
      ...meta
    });

    res.json({ message: "Scholarship verified", scholarship });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const flagScholarship = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const oldDoc = await Scholarship.findById(id).lean();
    if (!oldDoc) return res.status(404).json({ message: "Scholarship not found" });

    const scholarship = await Scholarship.findByIdAndUpdate(
      id,
      { verificationStatus: "FLAGGED", flagReason: reason || "" },
      { new: true }
    );

    const meta = getClientMeta(req);
    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: "FLAG_SCHOLARSHIP",
      entityType: "SCHOLARSHIP",
      entityId: id,
      beforeState: { verificationStatus: oldDoc.verificationStatus },
      afterState: { verificationStatus: "FLAGGED", flagReason: reason },
      ...meta
    });

    res.json({ message: "Scholarship flagged", scholarship });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const addInternalNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ message: "Note required" });

    const scholarship = await Scholarship.findByIdAndUpdate(
      id,
      {
        $push: {
          internalNotes: {
            note: note.trim(),
            addedBy: req.user.id,
            addedAt: new Date()
          }
        }
      },
      { new: true }
    );

    if (!scholarship) return res.status(404).json({ message: "Scholarship not found" });
    res.json({ message: "Note added", scholarship });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===========================
   DOCUMENT REVIEW
=========================== */
export const getPendingDocuments = async (req, res) => {
  try {
    const docs = await Document.find({ status: "PENDING" })
      .populate("userId", "name email")
      .populate("scholarshipId", "title")
      .sort({ createdAt: 1 });

    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const reviewDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    if (!status || !["APPROVED", "REJECTED"].includes(status))
      return res.status(400).json({ message: "status must be APPROVED or REJECTED" });

    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.status !== "PENDING")
      return res.status(400).json({ message: "Document already reviewed" });

    const beforeState = doc.toObject();
    doc.status = status;
    doc.reviewedBy = req.user.id;
    doc.reviewedAt = new Date();
    if (status === "REJECTED") doc.rejectionReason = rejectionReason || "";
    await doc.save();

    const meta = getClientMeta(req);
    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: status === "APPROVED" ? "APPROVE_DOCUMENT" : "REJECT_DOCUMENT",
      entityType: "DOCUMENT",
      entityId: doc._id,
      beforeState: { status: beforeState.status },
      afterState: { status: doc.status, rejectionReason: doc.rejectionReason },
      ...meta
    });

    if (status === "REJECTED") {
      await FraudAlert.create({
        entityType: "DOCUMENT",
        entityId: doc._id,
        signalType: "DOCUMENT_REJECTED",
        severity: "MEDIUM",
        metadata: { userId: doc.userId, documentType: doc.documentType }
      });
    }

    const duplicateByChecksum = await Document.countDocuments({
      checksum: doc.checksum,
      userId: { $ne: doc.userId },
      _id: { $ne: doc._id }
    });
    if (duplicateByChecksum > 0) {
      await FraudAlert.create({
        entityType: "DOCUMENT",
        entityId: doc._id,
        signalType: "DUPLICATE_DOCUMENT_ACROSS_USERS",
        severity: "HIGH",
        metadata: { userId: doc.userId, documentType: doc.documentType, checksum: doc.checksum }
      });
    }

    res.json({ message: `Document ${status}`, document: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===========================
   AUDIT LOGS (Admin only, read-only)
=========================== */
export const getAuditLogs = async (req, res) => {
  try {
    const { actorId, actionType, startDate, endDate } = req.query;
    const filter = {};

    if (actorId) filter.actorId = actorId;
    if (actionType) filter.actionType = actionType;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(filter)
      .populate("actorId", "name email role")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===========================
   FRAUD ALERTS
=========================== */
export const getFraudAlerts = async (req, res) => {
  try {
    const { resolved } = req.query;
    const filter = {};
    if (resolved !== undefined) filter.isResolved = resolved === "true";

    const alerts = await FraudAlert.find(filter)
      .sort({ detectedAt: -1 })
      .limit(200)
      .lean();

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const markFraudAlertReviewed = async (req, res) => {
  try {
    const { id } = req.params;
    const alert = await FraudAlert.findByIdAndUpdate(
      id,
      { isResolved: true, reviewedAt: new Date(), reviewedBy: req.user.id },
      { new: true }
    );
    if (!alert) return res.status(404).json({ message: "Alert not found" });

    const meta = getClientMeta(req);
    await createAuditLog({
      actorId: req.user.id,
      actorRole: "ADMIN",
      actionType: "MARK_FRAUD_ALERT_REVIEWED",
      entityType: "FRAUD_ALERT",
      entityId: id,
      afterState: { isResolved: true },
      ...meta
    });

    res.json({ message: "Alert marked as reviewed", alert });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};