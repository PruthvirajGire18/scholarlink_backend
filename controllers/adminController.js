import bcrypt from "bcryptjs";

import Application from "../models/Application.js";
import AuditLog from "../models/AuditLog.js";
import Document from "../models/Document.js";
import FraudAlert from "../models/FraudAlert.js";
import Notification from "../models/Notification.js";
import Scholarship from "../models/Scholarship.js";
import User from "../models/User.js";
import UserProfile from "../models/UserProfile.js";
import { calculateProgress, deriveStatus, updateChecklistItem } from "../utils/applicationProgress.js";
import { createAuditLog, getClientMeta } from "../utils/auditHelper.js";
import { calculateRiskScore } from "../utils/riskScore.js";

const APPLICATION_DECISION_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

export const createModerator = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const moderator = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: "MODERATOR",
      createdBy: req.user.id
    });

    await createAuditLog({
      actorId: req.user.id,
      actorRole: "ADMIN",
      actionType: "CREATE_MODERATOR",
      entityType: "USER",
      entityId: moderator._id,
      afterState: { name: moderator.name, email: moderator.email },
      ...getClientMeta(req)
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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllModerators = async (req, res) => {
  try {
    const moderators = await User.find({ role: "MODERATOR" }).select("-password").sort({ createdAt: -1 });
    res.json(moderators);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: "STUDENT" }).select("-password").sort({ createdAt: -1 }).lean();
    const profiles = await UserProfile.find({
      userId: { $in: students.map((student) => student._id) }
    }).lean();

    const profileMap = new Map(profiles.map((profile) => [String(profile.userId), profile]));

    const data = students.map((student) => ({
      ...student,
      profile: profileMap.get(String(student._id)) || null
    }));

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPendingScholarships = async (req, res) => {
  try {
    const data = await Scholarship.find({ status: "PENDING" }).populate("createdBy", "name email");
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const reviewScholarship = async (req, res) => {
  try {
    const { status, remarks } = req.body;
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ message: "status must be APPROVED or REJECTED" });
    }

    const before = await Scholarship.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: "Scholarship not found" });

    const scholarship = await Scholarship.findByIdAndUpdate(
      req.params.id,
      { status, reviewRemarks: remarks || "", reviewedBy: req.user.id },
      { new: true }
    );

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: status === "APPROVED" ? "APPROVE_SCHOLARSHIP" : "REJECT_SCHOLARSHIP",
      entityType: "SCHOLARSHIP",
      entityId: scholarship._id,
      beforeState: { status: before.status },
      afterState: { status: scholarship.status, reviewRemarks: scholarship.reviewRemarks },
      ...getClientMeta(req)
    });

    res.json({ message: `Scholarship ${status.toLowerCase()}`, scholarship });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllScholarships = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    const scholarships = await Scholarship.find(filter)
      .populate("createdBy", "name email role")
      .populate("reviewedBy", "name email role")
      .sort({ createdAt: -1 });

    res.json(scholarships);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getVerificationQueue = async (req, res) => {
  try {
    const list = await Scholarship.find({
      status: "PENDING",
      $or: [{ verificationStatus: "UNVERIFIED" }, { verificationStatus: { $exists: false } }]
    })
      .populate("createdBy", "name email")
      .sort({ createdAt: 1 })
      .lean();

    const withRisk = await Promise.all(
      list.map(async (item) => ({
        ...item,
        riskScore: await calculateRiskScore(item)
      }))
    );

    res.json(withRisk);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const verifyScholarship = async (req, res) => {
  try {
    const { id } = req.params;
    const before = await Scholarship.findById(id).lean();
    if (!before) return res.status(404).json({ message: "Scholarship not found" });

    const scholarship = await Scholarship.findByIdAndUpdate(
      id,
      { verificationStatus: "VERIFIED" },
      { new: true }
    );

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: "VERIFY_SCHOLARSHIP",
      entityType: "SCHOLARSHIP",
      entityId: id,
      beforeState: { verificationStatus: before.verificationStatus },
      afterState: { verificationStatus: "VERIFIED" },
      ...getClientMeta(req)
    });

    res.json({ message: "Scholarship verified", scholarship });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const flagScholarship = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const before = await Scholarship.findById(id).lean();
    if (!before) return res.status(404).json({ message: "Scholarship not found" });

    const scholarship = await Scholarship.findByIdAndUpdate(
      id,
      { verificationStatus: "FLAGGED", flagReason: reason || "" },
      { new: true }
    );

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: "FLAG_SCHOLARSHIP",
      entityType: "SCHOLARSHIP",
      entityId: id,
      beforeState: { verificationStatus: before.verificationStatus },
      afterState: { verificationStatus: "FLAGGED", flagReason: scholarship.flagReason },
      ...getClientMeta(req)
    });

    res.json({ message: "Scholarship flagged", scholarship });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPendingDocuments = async (req, res) => {
  try {
    const docs = await Document.find({ status: "PENDING" })
      .populate("userId", "name email")
      .populate("scholarshipId", "title")
      .sort({ createdAt: 1 });

    res.json(docs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const reviewDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, reviewComment } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ message: "status must be APPROVED or REJECTED" });
    }

    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.status !== "PENDING") return res.status(400).json({ message: "Document already reviewed" });

    const before = doc.toObject();
    doc.status = status;
    doc.reviewedBy = req.user.id;
    doc.reviewedAt = new Date();
    doc.reviewComment = reviewComment || "";
    doc.rejectionReason = status === "REJECTED" ? rejectionReason || "Invalid document" : "";
    await doc.save();

    if (doc.applicationId) {
      const application = await Application.findById(doc.applicationId);
      if (application) {
        application.documentChecklist = updateChecklistItem(application.documentChecklist, doc.documentType, {
          isUploaded: status === "APPROVED",
          isVerified: status === "APPROVED",
          comment: status === "REJECTED" ? doc.rejectionReason : reviewComment || "Verified",
          documentId: doc._id
        });

        application.progressPercent = calculateProgress(application);
        application.status = status === "REJECTED" ? "IN_PROGRESS" : deriveStatus(application);
        application.lastUpdated = new Date();
        await application.save();

        await Notification.create({
          userId: doc.userId,
          type: "DOCUMENT_REVIEW",
          title: `Document ${status.toLowerCase()}`,
          message:
            status === "APPROVED"
              ? `${doc.documentType} verified successfully.`
              : `${doc.documentType} rejected: ${doc.rejectionReason}`,
          data: {
            applicationId: application._id,
            scholarshipId: doc.scholarshipId,
            signature: `doc-${doc._id}-${status.toLowerCase()}`
          }
        });
      }
    }

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: status === "APPROVED" ? "APPROVE_DOCUMENT" : "REJECT_DOCUMENT",
      entityType: "DOCUMENT",
      entityId: doc._id,
      beforeState: { status: before.status },
      afterState: { status: doc.status, rejectionReason: doc.rejectionReason, reviewComment: doc.reviewComment },
      ...getClientMeta(req)
    });

    if (status === "REJECTED") {
      await FraudAlert.create({
        entityType: "DOCUMENT",
        entityId: doc._id,
        signalType: "DOCUMENT_REJECTED",
        severity: "MEDIUM",
        metadata: { userId: doc.userId, documentType: doc.documentType, reason: doc.rejectionReason }
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

    res.json({ message: `Document ${status.toLowerCase()}`, document: doc });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getApplicationsOverview = async (req, res) => {
  try {
    const { status, scholarshipId, studentId, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (scholarshipId) filter.scholarshipId = scholarshipId;
    if (studentId) filter.studentId = studentId;

    const applications = await Application.find(filter)
      .populate("studentId", "name email")
      .populate("scholarshipId", "title deadline amount provider")
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();

    const filtered = !search
      ? applications
      : applications.filter((item) => {
          const term = search.toLowerCase();
          return (
            item.studentId?.name?.toLowerCase().includes(term) ||
            item.studentId?.email?.toLowerCase().includes(term) ||
            item.scholarshipId?.title?.toLowerCase().includes(term)
          );
        });

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewComment, rejectionReason } = req.body;

    if (!APPLICATION_DECISION_STATUSES.has(status)) {
      return res.status(400).json({ message: "status must be PENDING, APPROVED, or REJECTED" });
    }

    const application = await Application.findById(id).populate("scholarshipId", "title");
    if (!application) return res.status(404).json({ message: "Application not found" });

    const beforeStatus = application.status;
    application.status = status;
    application.reviewComment = reviewComment || "";

    if (status === "REJECTED") {
      application.rejectionReason = rejectionReason || "Rejected during admin review";
      application.decisionAt = new Date();
    } else {
      application.rejectionReason = "";
      if (status === "APPROVED") {
        application.decisionAt = new Date();
      }
    }

    if (status === "PENDING" && !application.submittedAt) {
      application.submittedAt = new Date();
    }

    application.lastUpdated = new Date();
    await application.save();

    await Notification.create({
      userId: application.studentId,
      type: "APPLICATION_STATUS",
      title: `Application ${status.toLowerCase()}`,
      message:
        status === "REJECTED"
          ? `Your application for ${application.scholarshipId?.title || "scholarship"} was rejected: ${application.rejectionReason}`
          : `Your application for ${application.scholarshipId?.title || "scholarship"} is now ${status}.`,
      data: {
        applicationId: application._id,
        scholarshipId: application.scholarshipId?._id,
        signature: `application-${application._id}-${status.toLowerCase()}`
      }
    });

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: "UPDATE_APPLICATION_STATUS",
      entityType: "APPLICATION",
      entityId: application._id,
      beforeState: { status: beforeStatus },
      afterState: { status: application.status, rejectionReason: application.rejectionReason },
      ...getClientMeta(req)
    });

    res.json({ message: "Application status updated", application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDashboardAnalytics = async (req, res) => {
  try {
    const [students, moderators, pendingScholarships, pendingDocuments, applicationsByStatus, rejectionReasons] =
      await Promise.all([
        User.countDocuments({ role: "STUDENT" }),
        User.countDocuments({ role: "MODERATOR" }),
        Scholarship.countDocuments({ status: "PENDING" }),
        Document.countDocuments({ status: "PENDING" }),
        Application.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
        Application.aggregate([
          { $match: { status: "REJECTED", rejectionReason: { $nin: [null, ""] } } },
          { $group: { _id: "$rejectionReason", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ])
      ]);

    const statusMap = applicationsByStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const upcomingDeadlines = await Scholarship.countDocuments({
      status: "APPROVED",
      deadline: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      cards: {
        students,
        moderators,
        pendingScholarships,
        pendingDocuments,
        upcomingDeadlines
      },
      applicationsByStatus: statusMap,
      commonRejectionReasons: rejectionReasons.map((item) => ({
        reason: item._id,
        count: item.count
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCommonRejectionReasons = async (req, res) => {
  try {
    const [applicationReasons, documentReasons] = await Promise.all([
      Application.aggregate([
        { $match: { status: "REJECTED", rejectionReason: { $nin: [null, ""] } } },
        { $group: { _id: "$rejectionReason", count: { $sum: 1 }, source: { $first: "APPLICATION" } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      Document.aggregate([
        { $match: { status: "REJECTED", rejectionReason: { $nin: [null, ""] } } },
        { $group: { _id: "$rejectionReason", count: { $sum: 1 }, source: { $first: "DOCUMENT" } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ])
    ]);

    res.json([
      ...applicationReasons.map((item) => ({ reason: item._id, count: item.count, source: "APPLICATION" })),
      ...documentReasons.map((item) => ({ reason: item._id, count: item.count, source: "DOCUMENT" }))
    ]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const sendStudentReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Reminder message is required" });
    }

    const student = await User.findOne({ _id: id, role: "STUDENT" });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const notification = await Notification.create({
      userId: id,
      type: "ADMIN_MESSAGE",
      title: title?.trim() || "Reminder from admin",
      message: message.trim(),
      data: {
        signature: `admin-reminder-${Date.now()}-${id}`,
        senderId: req.user.id
      }
    });

    await Application.updateMany(
      { studentId: id, status: { $in: ["IN_PROGRESS", "APPLIED", "PENDING"] } },
      { $inc: { remindersSent: 1 }, $set: { lastUpdated: new Date() } }
    );

    res.status(201).json({ message: "Reminder sent", notification });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentProfileForAdmin = async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.id, role: "STUDENT" }).select("-password");
    if (!student) return res.status(404).json({ message: "Student not found" });

    const [profile, applications] = await Promise.all([
      UserProfile.findOne({ userId: student._id }),
      Application.find({ studentId: student._id })
        .populate("scholarshipId", "title deadline amount")
        .sort({ updatedAt: -1 })
    ]);

    res.json({ student, profile, applications });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFraudAlerts = async (req, res) => {
  try {
    const { resolved } = req.query;
    const filter = {};
    if (resolved !== undefined) filter.isResolved = resolved === "true";

    const alerts = await FraudAlert.find(filter).sort({ detectedAt: -1 }).limit(300).lean();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    await createAuditLog({
      actorId: req.user.id,
      actorRole: "ADMIN",
      actionType: "MARK_FRAUD_ALERT_REVIEWED",
      entityType: "FRAUD_ALERT",
      entityId: id,
      afterState: { isResolved: true },
      ...getClientMeta(req)
    });

    res.json({ message: "Alert marked as reviewed", alert });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
