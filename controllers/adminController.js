import bcrypt from "bcryptjs";

import Application from "../models/Application.js";
import AuditLog from "../models/AuditLog.js";
import Document from "../models/Document.js";
import FraudAlert from "../models/FraudAlert.js";
import Notification from "../models/Notification.js";
import Scholarship from "../models/Scholarship.js";
import ScholarshipFeedback from "../models/ScholarshipFeedback.js";
import User from "../models/User.js";
import UserProfile from "../models/UserProfile.js";
import { calculateProgress, deriveStatus, updateChecklistItem } from "../utils/applicationProgress.js";
import { createAuditLog, getClientMeta } from "../utils/auditHelper.js";
import { calculateRiskScore } from "../utils/riskScore.js";

const APPLICATION_DECISION_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const PROVIDER_TYPES = new Set(["GOVERNMENT", "NGO", "CSR", "PRIVATE"]);
const APPLICATION_MODES = new Set(["ONLINE", "OFFLINE", "BOTH"]);
const ELIGIBILITY_GENDERS = new Set(["MALE", "FEMALE", "ANY"]);
const EDUCATION_LEVELS = new Set(["DIPLOMA", "UG", "PG", "PHD"]);
const CATEGORY_VALUES = new Set(["OPEN", "OBC", "SC", "ST", "VJNT", "EWS", "SEBC"]);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function asText(value, fallback = "") {
  if (value === null || value === undefined) return String(fallback || "").trim();
  return String(value).trim();
}

function isValidExternalUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeStringList(value) {
  if (!value) return [];
  const rawList = Array.isArray(value) ? value : [value];
  return rawList
    .flatMap((item) => String(item || "").split(/\n|,|;|\/|\|/g))
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumberOrUndefined(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function normalizeProvider(input = {}, existing = {}) {
  const typeInput = asText(input.type || existing.type || "").toUpperCase();
  const type = PROVIDER_TYPES.has(typeInput) ? typeInput : existing.type;
  return {
    type,
    name: asText(hasOwn(input, "name") ? input.name : existing.name),
    website: asText(hasOwn(input, "website") ? input.website : existing.website)
  };
}

function normalizeEligibility(input = {}, existing = {}) {
  const categoriesRaw = sanitizeStringList(
    hasOwn(input, "categories") ? input.categories : existing.categories
  )
    .map((item) => (item.toUpperCase() === "GENERAL" ? "OPEN" : item.toUpperCase()))
    .filter((item) => CATEGORY_VALUES.has(item));

  const statesAllowed = sanitizeStringList(
    hasOwn(input, "statesAllowed") ? input.statesAllowed : existing.statesAllowed
  );

  const minMarks = toNumberOrUndefined(
    hasOwn(input, "minMarks") ? input.minMarks : existing.minMarks
  );
  const maxIncome = toNumberOrUndefined(
    hasOwn(input, "maxIncome") ? input.maxIncome : existing.maxIncome
  );

  const genderInput = asText(hasOwn(input, "gender") ? input.gender : existing.gender).toUpperCase();
  const educationInput = asText(
    hasOwn(input, "educationLevel") ? input.educationLevel : existing.educationLevel
  ).toUpperCase();
  const summary = asText(hasOwn(input, "summary") ? input.summary : existing.summary);

  return {
    summary,
    minMarks,
    maxIncome,
    categories: categoriesRaw,
    gender: ELIGIBILITY_GENDERS.has(genderInput) ? genderInput : existing.gender || "ANY",
    statesAllowed,
    educationLevel: EDUCATION_LEVELS.has(educationInput) ? educationInput : undefined
  };
}

function normalizeApplicationProcess(input = {}, existing = {}) {
  const modeInput = asText(hasOwn(input, "mode") ? input.mode : existing.mode).toUpperCase();
  const mode = APPLICATION_MODES.has(modeInput) ? modeInput : existing.mode || "ONLINE";

  const applyLinkInput = asText(
    hasOwn(input, "applyLink") ? input.applyLink : existing.applyLink
  );
  const applyLink = isValidExternalUrl(applyLinkInput) ? applyLinkInput : "";

  return {
    mode,
    applyLink: applyLink || undefined,
    steps: sanitizeStringList(hasOwn(input, "steps") ? input.steps : existing.steps)
  };
}

function buildAdminEnrichmentPatch(existingDoc, enrichment = {}) {
  const existing = existingDoc?.toObject ? existingDoc.toObject() : existingDoc || {};
  const patch = {};

  if (hasOwn(enrichment, "title")) patch.title = asText(enrichment.title, existing.title);
  if (hasOwn(enrichment, "description")) {
    patch.description = asText(enrichment.description, existing.description);
  }
  if (hasOwn(enrichment, "benefits")) patch.benefits = asText(enrichment.benefits, existing.benefits);
  if (hasOwn(enrichment, "tags")) patch.tags = sanitizeStringList(enrichment.tags);

  if (hasOwn(enrichment, "amount")) {
    const amount = toNumberOrUndefined(enrichment.amount);
    if (amount !== undefined && amount > 0) patch.amount = amount;
  }

  if (hasOwn(enrichment, "deadline")) {
    const parsedDeadline = new Date(enrichment.deadline);
    if (!Number.isNaN(parsedDeadline.getTime())) patch.deadline = parsedDeadline;
  }

  if (hasOwn(enrichment, "provider")) {
    patch.provider = normalizeProvider(enrichment.provider || {}, existing.provider || {});
  }

  if (hasOwn(enrichment, "eligibility")) {
    patch.eligibility = normalizeEligibility(enrichment.eligibility || {}, existing.eligibility || {});
  }

  if (hasOwn(enrichment, "documentsRequired")) {
    patch.documentsRequired = sanitizeStringList(enrichment.documentsRequired);
  }

  if (hasOwn(enrichment, "commonMistakes")) {
    patch.commonMistakes = sanitizeStringList(enrichment.commonMistakes);
  }

  if (hasOwn(enrichment, "applicationProcess")) {
    patch.applicationProcess = normalizeApplicationProcess(
      enrichment.applicationProcess || {},
      existing.applicationProcess || {}
    );
  }

  return patch;
}

function validateApprovalReady(scholarship) {
  const missing = [];
  const applyLink = scholarship?.applicationProcess?.applyLink;
  const docs = sanitizeStringList(scholarship?.documentsRequired);
  const steps = sanitizeStringList(scholarship?.applicationProcess?.steps);
  const mistakes = sanitizeStringList(scholarship?.commonMistakes);
  const eligibility = scholarship?.eligibility || {};
  const eligibilitySummary = asText(eligibility.summary);

  const hasEligibilityDetails =
    Boolean(eligibilitySummary) ||
    (eligibility.minMarks !== undefined &&
    eligibility.minMarks !== null
      ? true
      : eligibility.maxIncome !== undefined && eligibility.maxIncome !== null
        ? true
        : Array.isArray(eligibility.categories) && eligibility.categories.length > 0
          ? true
          : Array.isArray(eligibility.statesAllowed) && eligibility.statesAllowed.length > 0
            ? true
            : Boolean(eligibility.educationLevel));

  if (!isValidExternalUrl(applyLink)) missing.push("official apply link");
  if (docs.length === 0) missing.push("documents required");
  if (steps.length === 0) missing.push("application steps");
  if (mistakes.length === 0) missing.push("common mistakes");
  if (!hasEligibilityDetails) missing.push("eligibility details");

  return missing;
}

function applyApprovalFallbacks(scholarship) {
  if (!scholarship) return;

  const docs = sanitizeStringList(scholarship.documentsRequired);
  if (docs.length === 0) {
    scholarship.documentsRequired = [
      "Refer to official portal document checklist (Aadhaar, income proof, marksheet, caste/category certificate if applicable)."
    ];
  }

  const steps = sanitizeStringList(scholarship?.applicationProcess?.steps);
  if (steps.length === 0) {
    scholarship.applicationProcess = {
      ...(scholarship.applicationProcess || {}),
      steps: [
        "Open the official application portal from the link above.",
        "Read scheme instructions and fill the application form carefully.",
        "Upload required documents and submit before the deadline."
      ]
    };
  }

  const mistakes = sanitizeStringList(scholarship.commonMistakes);
  if (mistakes.length === 0) {
    scholarship.commonMistakes = [
      "Do not submit without verifying eligibility and required documents from the official notification."
    ];
  }

  const eligibility = scholarship.eligibility || {};
  const summary = asText(eligibility.summary);
  const hasEligibilityDetails =
    Boolean(summary) ||
    eligibility.minMarks !== undefined ||
    eligibility.maxIncome !== undefined ||
    (Array.isArray(eligibility.categories) && eligibility.categories.length > 0) ||
    (Array.isArray(eligibility.statesAllowed) && eligibility.statesAllowed.length > 0) ||
    Boolean(eligibility.educationLevel);

  if (!hasEligibilityDetails) {
    scholarship.eligibility = {
      ...eligibility,
      summary:
        "Detailed eligibility is available on the official portal. Verify category, income, education, and other conditions before applying."
    };
  }
}

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
    const data = await Scholarship.find({ status: "PENDING", isActive: true }).populate(
      "createdBy",
      "name email"
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const reviewScholarship = async (req, res) => {
  try {
    const { status, remarks, enrichment, feedbackIds = [] } = req.body;
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ message: "status must be APPROVED or REJECTED" });
    }

    const scholarship = await Scholarship.findById(req.params.id);
    if (!scholarship) return res.status(404).json({ message: "Scholarship not found" });
    const before = scholarship.toObject();

    if (enrichment && typeof enrichment === "object") {
      const patch = buildAdminEnrichmentPatch(scholarship, enrichment);
      Object.assign(scholarship, patch);
    }

    scholarship.status = status;
    scholarship.reviewRemarks = remarks || "";
    scholarship.reviewedBy = req.user.id;

    if (status === "APPROVED") {
      applyApprovalFallbacks(scholarship);
      const missing = validateApprovalReady(scholarship);
      if (missing.length > 0) {
        return res.status(400).json({
          message: `Before approval please complete: ${missing.join(", ")}`
        });
      }
    }

    await scholarship.save();

    if (Array.isArray(feedbackIds) && feedbackIds.length > 0) {
      await ScholarshipFeedback.updateMany(
        {
          _id: { $in: feedbackIds },
          scholarshipId: scholarship._id
        },
        {
          $set: {
            status: status === "APPROVED" ? "RESOLVED" : "REVIEWED",
            adminComment: scholarship.reviewRemarks || "",
            reviewedBy: req.user.id,
            reviewedAt: new Date()
          }
        }
      );
    }

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      actionType: status === "APPROVED" ? "APPROVE_SCHOLARSHIP" : "REJECT_SCHOLARSHIP",
      entityType: "SCHOLARSHIP",
      entityId: scholarship._id,
      beforeState: {
        status: before.status,
        applicationProcess: before.applicationProcess,
        eligibility: before.eligibility,
        documentsRequired: before.documentsRequired,
        commonMistakes: before.commonMistakes
      },
      afterState: {
        status: scholarship.status,
        reviewRemarks: scholarship.reviewRemarks,
        applicationProcess: scholarship.applicationProcess,
        eligibility: scholarship.eligibility,
        documentsRequired: scholarship.documentsRequired,
        commonMistakes: scholarship.commonMistakes
      },
      ...getClientMeta(req)
    });

    res.json({ message: `Scholarship ${status.toLowerCase()}`, scholarship });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getScholarshipFeedback = async (req, res) => {
  try {
    const status = String(req.query.status || "OPEN").toUpperCase();
    const limit = Math.max(1, Math.min(Number(req.query.limit || 200), 500));
    const allowedStatuses = new Set(["OPEN", "REVIEWED", "RESOLVED"]);
    const filter = {};
    if (allowedStatuses.has(status)) filter.status = status;

    const list = await ScholarshipFeedback.find(filter)
      .populate(
        "scholarshipId",
        "title description provider amount benefits eligibility documentsRequired commonMistakes applicationProcess deadline status verificationStatus source createdAt"
      )
      .populate("studentId", "name email")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateScholarshipFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body;
    if (!["OPEN", "REVIEWED", "RESOLVED"].includes(String(status || "").toUpperCase())) {
      return res.status(400).json({ message: "status must be OPEN, REVIEWED, or RESOLVED" });
    }

    const feedback = await ScholarshipFeedback.findById(id);
    if (!feedback) return res.status(404).json({ message: "Feedback not found" });

    feedback.status = String(status).toUpperCase();
    feedback.adminComment = String(adminComment || "").trim();
    feedback.reviewedBy = req.user.id;
    feedback.reviewedAt = new Date();
    await feedback.save();

    const populated = await ScholarshipFeedback.findById(feedback._id)
      .populate("scholarshipId", "title status")
      .populate("studentId", "name email")
      .populate("reviewedBy", "name email")
      .lean();

    res.json({ message: "Feedback status updated", feedback: populated });
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
      isActive: true,
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
