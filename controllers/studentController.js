import crypto from "crypto";

import Application from "../models/Application.js";
import AssistanceRequest from "../models/AssistanceRequest.js";
import Document from "../models/Document.js";
import Notification from "../models/Notification.js";
import Scholarship from "../models/Scholarship.js";
import UserProfile from "../models/UserProfile.js";
import { uploadBufferToCloudinary } from "../config/cloudinary.js";
import {
  buildChecklistFromScholarship,
  buildDefaultRoadmap,
  calculateProgress,
  deriveStatus,
  markStep,
  normalizeDocumentType,
  updateChecklistItem
} from "../utils/applicationProgress.js";
import { evaluateEligibility, recommendScholarships } from "../utils/eligibilityEngine.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const APPLICATION_POPULATE_FIELDS =
  "title deadline amount provider documentsRequired commonMistakes applicationProcess";
const STUDENT_TRACKABLE_STATUSES = new Set(["APPLIED", "PENDING", "APPROVED", "REJECTED"]);

const DOCUMENT_PROFILE_FIELD_MAP = {
  AADHAAR: "documents.aadhaar",
  INCOME_CERTIFICATE: "documents.incomeCertificate",
  CASTE_CERTIFICATE: "documents.casteCertificate",
  DOMICILE: "documents.domicileCertificate",
  MARKSHEET: "documents.marksheet"
};

function getProfileDocumentFieldPath(documentType) {
  const normalized = normalizeDocumentType(documentType);
  if (normalized.includes("AADHAAR")) return DOCUMENT_PROFILE_FIELD_MAP.AADHAAR;
  if (normalized.includes("INCOME_CERTIFICATE")) return DOCUMENT_PROFILE_FIELD_MAP.INCOME_CERTIFICATE;
  if (normalized.includes("CASTE_CERTIFICATE")) return DOCUMENT_PROFILE_FIELD_MAP.CASTE_CERTIFICATE;
  if (normalized.includes("DOMICILE")) return DOCUMENT_PROFILE_FIELD_MAP.DOMICILE;
  if (normalized.includes("MARKSHEET") || normalized.includes("TRANSCRIPT")) {
    return DOCUMENT_PROFILE_FIELD_MAP.MARKSHEET;
  }
  return DOCUMENT_PROFILE_FIELD_MAP[normalized] || null;
}

function calculateProfileCompletion(profile) {
  const fields = [
    profile.gender,
    profile.dateOfBirth,
    profile.mobile,
    profile.address?.state,
    profile.address?.district,
    profile.address?.pincode,
    profile.education?.course,
    profile.education?.educationLevel,
    profile.education?.institute,
    profile.education?.currentYear,
    profile.education?.percentage,
    profile.category,
    profile.annualIncome
  ];

  const filled = fields.filter((value) => value !== undefined && value !== null && value !== "").length;
  return Math.round((filled / fields.length) * 100);
}

function getDeadlineInfo(dateValue) {
  const deadline = new Date(dateValue);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / DAY_MS);
  return { deadline, daysLeft };
}

async function ensureNotification({ userId, type, title, message, data = {} }) {
  const recentWindow = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const exists = await Notification.findOne({
    userId,
    type,
    "data.signature": data.signature,
    createdAt: { $gte: recentWindow }
  });

  if (!exists) {
    await Notification.create({
      userId,
      type,
      title,
      message,
      data
    });
  }
}

function syncDocumentsRoadmapStep(application) {
  const allUploaded = (application.documentChecklist || []).every((item) => !item.isRequired || item.isUploaded);
  application.roadmapSteps = markStep(application.roadmapSteps, "documents", allUploaded);
}

async function getStudentProfile(studentId) {
  return UserProfile.findOne({ userId: studentId });
}

function applyScholarshipFilters(query = {}) {
  const filter = {
    status: "APPROVED",
    isActive: true,
    deadline: { $gte: new Date() }
  };

  if (query.providerType) {
    filter["provider.type"] = query.providerType.toUpperCase();
  }

  if (query.search) {
    filter.$or = [
      { title: { $regex: query.search, $options: "i" } },
      { description: { $regex: query.search, $options: "i" } },
      { tags: { $regex: query.search, $options: "i" } }
    ];
  }

  return filter;
}

export const getMyProfile = async (req, res) => {
  try {
    const profile = await getStudentProfile(req.user.id);
    res.json({ profile });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
};

export const upsertMyProfile = async (req, res) => {
  try {
    const update = {
      gender: req.body.gender,
      dateOfBirth: req.body.dateOfBirth,
      mobile: req.body.mobile,
      address: req.body.address || {},
      education: req.body.education || {},
      category: req.body.category,
      annualIncome: req.body.annualIncome,
      financial: req.body.financial || {},
      preferredLanguages: req.body.preferredLanguages || ["en", "hi", "mr"],
      notificationPreferences: req.body.notificationPreferences || {}
    };

    const profileCompletion = calculateProfileCompletion(update);
    update.profileCompletion = profileCompletion;

    const profile = await UserProfile.findOneAndUpdate(
      { userId: req.user.id },
      { ...update, userId: req.user.id },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (profileCompletion < 75) {
      await ensureNotification({
        userId: req.user.id,
        type: "MISSING_STEP",
        title: "Complete profile for better scholarship match",
        message: `Your profile is ${profileCompletion}% complete. Fill remaining details to unlock accurate matches.`,
        data: { signature: `profile-${profileCompletion}` }
      });
    }

    res.json({ message: "Profile saved", profile });
  } catch (error) {
    res.status(500).json({ message: "Failed to save profile", error: error.message });
  }
};

export const getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.user.id;
    const [profile, scholarships, applications] = await Promise.all([
      getStudentProfile(studentId),
      Scholarship.find({
        status: "APPROVED",
        isActive: true,
        deadline: { $gte: new Date() }
      })
        .sort({ deadline: 1 })
        .limit(100),
      Application.find({ studentId })
        .populate("scholarshipId", APPLICATION_POPULATE_FIELDS)
        .sort({ updatedAt: -1 })
    ]);

    const recommendations = recommendScholarships(profile, scholarships);

    for (const application of applications) {
      const progressPercent = calculateProgress(application);
      const nextStatus = deriveStatus(application);

      if (application.progressPercent !== progressPercent || application.status !== nextStatus) {
        application.progressPercent = progressPercent;
        application.status = nextStatus;
        application.lastUpdated = new Date();
        await application.save();
      }

      if (
        application.scholarshipId?.deadline &&
        ["IN_PROGRESS", "APPLIED", "PENDING"].includes(application.status)
      ) {
        const { daysLeft } = getDeadlineInfo(application.scholarshipId.deadline);
        if (daysLeft <= 7 && daysLeft >= 0) {
          await ensureNotification({
            userId: studentId,
            type: "DEADLINE_ALERT",
            title: "Scholarship deadline approaching",
            message: `${application.scholarshipId.title} closes in ${daysLeft} day(s).`,
            data: {
              signature: `deadline-${application._id}-${daysLeft}`,
              applicationId: application._id,
              scholarshipId: application.scholarshipId._id
            }
          });
        }
      }
    }

    const notifications = await Notification.find({ userId: studentId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const upcomingDeadlines = applications
      .filter((app) => app.scholarshipId?.deadline)
      .map((app) => {
        const { daysLeft } = getDeadlineInfo(app.scholarshipId.deadline);
        return {
          applicationId: app._id,
          scholarshipId: app.scholarshipId._id,
          title: app.scholarshipId.title,
          deadline: app.scholarshipId.deadline,
          daysLeft,
          status: app.status
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);

    res.json({
      profile: profile || null,
      portalDisclaimer:
        "Final submission and verification happens on official government/NGO scholarship portals only.",
      profileCompletion: profile?.profileCompletion || 0,
      metrics: {
        eligibleScholarships: recommendations.eligible.length,
        partiallyEligibleScholarships: recommendations.partiallyEligible.length,
        inProgressApplications: applications.filter((app) => app.status === "IN_PROGRESS").length,
        pendingReview: applications.filter((app) => app.status === "PENDING" || app.status === "APPLIED").length,
        approvedCount: applications.filter((app) => app.status === "APPROVED").length
      },
      recommendedScholarships: recommendations.eligible.slice(0, 8),
      partiallyEligibleScholarships: recommendations.partiallyEligible.slice(0, 8),
      nearMissScholarships: recommendations.nearMisses.slice(0, 5),
      upcomingDeadlines,
      applications,
      notifications,
      unreadNotificationCount: notifications.filter((item) => !item.isRead).length
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard", error: error.message });
  }
};

export const getRecommendedScholarships = async (req, res) => {
  try {
    const profile = await getStudentProfile(req.user.id);
    const scholarships = await Scholarship.find({
      status: "APPROVED",
      isActive: true,
      deadline: { $gte: new Date() }
    }).sort({ deadline: 1 });

    const recommendations = recommendScholarships(profile, scholarships);
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch recommendations", error: error.message });
  }
};

export const getScholarshipDiscovery = async (req, res) => {
  try {
    const profile = await getStudentProfile(req.user.id);
    const scholarships = await Scholarship.find(applyScholarshipFilters(req.query)).sort({ deadline: 1 });

    const enriched = scholarships.map((scholarship) => {
      const eligibility = evaluateEligibility(profile, scholarship);
      return {
        scholarship,
        ...eligibility
      };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch scholarships", error: error.message });
  }
};

export const getApprovedScholarships = async (req, res) => {
  try {
    const data = await Scholarship.find({
      status: "APPROVED",
      isActive: true,
      deadline: { $gte: new Date() }
    }).sort({ deadline: 1 });

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch scholarships", error: error.message });
  }
};

export const getScholarshipById = async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id).populate("createdBy", "name email");
    if (!scholarship) return res.status(404).json({ message: "Scholarship not found" });

    if (scholarship.status !== "APPROVED" || !scholarship.isActive) {
      return res.status(403).json({ message: "Scholarship not available" });
    }

    const profile = await getStudentProfile(req.user.id);
    const eligibility = evaluateEligibility(profile, scholarship);

    res.json({
      ...scholarship.toObject(),
      eligibilityCheck: eligibility,
      disclaimer:
        "Final submission and verification happens on official government/NGO portals only."
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const startScholarshipApplication = async (req, res) => {
  try {
    const { scholarshipId } = req.params;
    const studentId = req.user.id;

    const scholarship = await Scholarship.findById(scholarshipId);
    if (!scholarship || scholarship.status !== "APPROVED" || !scholarship.isActive) {
      return res.status(404).json({ message: "Scholarship not available for applications" });
    }

    const profile = await getStudentProfile(studentId);
    if (!profile) {
      return res.status(400).json({ message: "Complete profile first before applying." });
    }

    const eligibility = evaluateEligibility(profile, scholarship);
    if (!eligibility.canProceed) {
      return res.status(400).json({
        message: "You are not eligible for this scholarship right now.",
        eligibilityStatus: eligibility.eligibilityStatus,
        reasons: eligibility.hardFails
      });
    }

    const existing = await Application.findOne({ studentId, scholarshipId }).populate(
      "scholarshipId",
      APPLICATION_POPULATE_FIELDS
    );
    if (existing) {
      return res.json({ message: "Application already exists", application: existing });
    }

    const roadmapSteps = buildDefaultRoadmap();
    if (profile.profileCompletion >= 75) {
      roadmapSteps[0].isDone = true;
      roadmapSteps[0].completedAt = new Date();
    }

    const application = await Application.create({
      studentId,
      scholarshipId,
      status: "IN_PROGRESS",
      progressPercent: 0,
      roadmapSteps,
      documentChecklist: buildChecklistFromScholarship(scholarship),
      deadlineSnapshot: scholarship.deadline
    });

    application.progressPercent = calculateProgress(application);
    await application.save();

    await ensureNotification({
      userId: studentId,
      type: "MISSING_STEP",
      title: "Application started",
      message: `You started ${scholarship.title}. Complete checklist, apply on official portal, then update your status here.`,
      data: { signature: `start-${application._id}`, applicationId: application._id }
    });

    const populated = await Application.findById(application._id).populate(
      "scholarshipId",
      APPLICATION_POPULATE_FIELDS
    );

    res.status(201).json({
      message: "Application created",
      eligibilityStatus: eligibility.eligibilityStatus,
      application: populated
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to start application", error: error.message });
  }
};

export const getMyApplications = async (req, res) => {
  try {
    const applications = await Application.find({ studentId: req.user.id })
      .populate("scholarshipId", APPLICATION_POPULATE_FIELDS)
      .sort({ updatedAt: -1 });

    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch applications", error: error.message });
  }
};

export const getApplicationById = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const application = await Application.findOne({
      _id: applicationId,
      studentId: req.user.id
    }).populate("scholarshipId", APPLICATION_POPULATE_FIELDS);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch application", error: error.message });
  }
};

export const toggleApplicationStep = async (req, res) => {
  try {
    const { applicationId, stepKey } = req.params;
    const { isDone } = req.body;

    const application = await Application.findOne({
      _id: applicationId,
      studentId: req.user.id
    });
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    application.roadmapSteps = markStep(application.roadmapSteps, stepKey, Boolean(isDone));
    syncDocumentsRoadmapStep(application);
    application.progressPercent = calculateProgress(application);
    application.status = deriveStatus(application);
    application.lastUpdated = new Date();
    await application.save();

    res.json({ message: "Step updated", application });
  } catch (error) {
    res.status(500).json({ message: "Failed to update step", error: error.message });
  }
};

export const submitApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findOne({
      _id: applicationId,
      studentId: req.user.id
    }).populate("scholarshipId", "title applicationProcess");

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const missingDocuments = (application.documentChecklist || []).filter(
      (item) => item.isRequired && !item.isUploaded
    );

    if (missingDocuments.length > 0) {
      return res.status(400).json({
        message:
          "Upload all required guidance documents before marking as applied on the official portal.",
        missingDocuments
      });
    }

    if (!application.scholarshipId?.applicationProcess?.applyLink) {
      return res.status(400).json({
        message: "Official application link is missing for this scholarship. Contact moderator."
      });
    }

    application.finalSubmissionDone = true;
    application.roadmapSteps = markStep(application.roadmapSteps, "submit", true);
    application.submittedAt = new Date();
    application.status = "APPLIED";
    application.progressPercent = calculateProgress(application);
    application.lastUpdated = new Date();
    await application.save();

    await Notification.create({
      userId: req.user.id,
      type: "APPLICATION_STATUS",
      title: "Marked as applied",
      message: `You marked ${application.scholarshipId.title} as applied on the official portal.`,
      data: {
        applicationId: application._id,
        scholarshipId: application.scholarshipId._id,
        signature: `submit-${application._id}`
      }
    });

    res.json({
      message: "Application marked as applied. Final verification happens on the official portal.",
      application
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to submit application", error: error.message });
  }
};

export const updateMyApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, note, rejectionReason } = req.body;

    if (!STUDENT_TRACKABLE_STATUSES.has(status)) {
      return res.status(400).json({
        message: "status must be one of APPLIED, PENDING, APPROVED, REJECTED"
      });
    }

    const application = await Application.findOne({
      _id: applicationId,
      studentId: req.user.id
    }).populate("scholarshipId", "title");

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    application.status = status;
    application.reviewComment = note ? String(note).trim() : "";
    application.rejectionReason = status === "REJECTED" ? String(rejectionReason || "").trim() : "";

    if (status === "APPLIED" && !application.submittedAt) {
      application.submittedAt = new Date();
      application.finalSubmissionDone = true;
      application.roadmapSteps = markStep(application.roadmapSteps, "submit", true);
    }

    if (status === "APPROVED" || status === "REJECTED") {
      application.decisionAt = new Date();
    }

    application.progressPercent = calculateProgress(application);
    application.lastUpdated = new Date();
    await application.save();

    await ensureNotification({
      userId: req.user.id,
      type: "APPLICATION_STATUS",
      title: `Application status updated to ${status}`,
      message: `Status for ${application.scholarshipId?.title || "scholarship"} is now ${status}.`,
      data: {
        signature: `student-status-${application._id}-${status}-${Date.now()}`,
        applicationId: application._id,
        scholarshipId: application.scholarshipId?._id
      }
    });

    res.json({
      message: "Application status updated",
      application,
      disclaimer: "Final approval/rejection is decided only on official scholarship portals."
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update application status", error: error.message });
  }
};

export const uploadApplicationDocument = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { documentType } = req.body;
    const normalizedType = normalizeDocumentType(documentType);

    if (!req.file) {
      return res.status(400).json({ message: "Document file is required" });
    }

    const application = await Application.findOne({
      _id: applicationId,
      studentId: req.user.id
    });
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const expectedDocument = (application.documentChecklist || []).find(
      (item) => item.documentType === normalizedType
    );

    if (!expectedDocument) {
      return res.status(400).json({ message: "This document is not in scholarship checklist." });
    }

    const checksum = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const cloudinaryUpload = await uploadBufferToCloudinary(req.file.buffer, {
      publicId: `${req.user.id}_${application._id}_${normalizedType}_${Date.now()}`
    });

    const document = await Document.create({
      userId: req.user.id,
      scholarshipId: application.scholarshipId,
      applicationId: application._id,
      documentType: normalizedType,
      fileUrl: cloudinaryUpload.secureUrl,
      cloudinaryPublicId: cloudinaryUpload.publicId,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      checksum,
      status: "PENDING"
    });

    application.documentChecklist = updateChecklistItem(application.documentChecklist, normalizedType, {
      isUploaded: true,
      isVerified: false,
      documentId: document._id,
      comment: ""
    });

    syncDocumentsRoadmapStep(application);
    application.progressPercent = calculateProgress(application);
    application.status = deriveStatus(application);
    application.lastUpdated = new Date();
    await application.save();

    const profileDocumentFieldPath = getProfileDocumentFieldPath(normalizedType);
    if (profileDocumentFieldPath) {
      await UserProfile.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { [profileDocumentFieldPath]: true } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    res.status(201).json({
      message: "Document uploaded for guidance review",
      document,
      application,
      disclaimer:
        "This upload is for guidance only. Final submission and verification happens on official portals."
    });
  } catch (error) {
    console.error("[uploadApplicationDocument] failed:", error);
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "Notification marked as read", notification });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notification", error: error.message });
  }
};

export const createAssistanceRequest = async (req, res) => {
  try {
    const { scholarshipId, message } = req.body;
    if (!scholarshipId || !message || !message.trim()) {
      return res.status(400).json({ message: "scholarshipId and message are required" });
    }

    const scholarship = await Scholarship.findById(scholarshipId);
    if (!scholarship) return res.status(404).json({ message: "Scholarship not found" });
    if (scholarship.status !== "APPROVED" || !scholarship.isActive) {
      return res.status(400).json({ message: "Scholarship not available for assistance" });
    }

    const moderatorId = scholarship.createdBy;
    if (!moderatorId) {
      return res.status(400).json({ message: "No moderator assigned for this scholarship" });
    }

    const application = await Application.findOne({
      studentId: req.user.id,
      scholarshipId
    }).lean();
    if (!application) {
      return res.status(400).json({
        message: "Start an application assistant first, then request moderator help."
      });
    }
    if (!["APPLIED", "PENDING", "APPROVED", "REJECTED"].includes(application.status)) {
      return res.status(400).json({
        message: "Mark your official portal application status before requesting moderator guidance."
      });
    }

    const existing = await AssistanceRequest.findOne({
      studentId: req.user.id,
      scholarshipId,
      status: "OPEN"
    });
    if (existing) {
      return res.status(400).json({ message: "You already have an open request for this scholarship" });
    }

    const created = await AssistanceRequest.create({
      studentId: req.user.id,
      scholarshipId,
      moderatorId,
      messages: [{ from: "STUDENT", authorId: req.user.id, text: message.trim(), createdAt: new Date() }],
      status: "OPEN"
    });

    const populated = await AssistanceRequest.findById(created._id)
      .populate("scholarshipId", "title")
      .populate("moderatorId", "name email");

    res.status(201).json({
      message: "Assistance request created",
      assistanceRequest: populated,
      disclaimer: "Moderator feedback is guidance-only and not official verification."
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const replyToMyAssistanceRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    const request = await AssistanceRequest.findOne({
      _id: id,
      studentId: req.user.id
    });
    if (!request) {
      return res.status(404).json({ message: "Assistance request not found" });
    }
    if (request.status !== "OPEN") {
      return res.status(400).json({
        message: "This request is resolved. Create a new help request if you need more support."
      });
    }

    request.messages.push({
      from: "STUDENT",
      authorId: req.user.id,
      text: message.trim(),
      createdAt: new Date()
    });
    request.updatedAt = new Date();
    await request.save();

    const populated = await AssistanceRequest.findById(request._id)
      .populate("scholarshipId", "title")
      .populate("moderatorId", "name email");

    res.json({
      message: "Reply sent to moderator",
      assistanceRequest: populated
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyAssistanceRequests = async (req, res) => {
  try {
    const list = await AssistanceRequest.find({ studentId: req.user.id })
      .populate("scholarshipId", "title")
      .populate("moderatorId", "name email")
      .sort({ updatedAt: -1 });

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
