import Application from "../models/Application.js";
import AssistanceRequest from "../models/AssistanceRequest.js";
import Document from "../models/Document.js";
import Scholarship from "../models/Scholarship.js";
import UserProfile from "../models/UserProfile.js";

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

function normalizeScholarshipPayload(body, existing = {}) {
  return {
    title: String(body.title || existing.title || "").trim(),
    description: String(body.description || existing.description || "").trim(),
    provider: {
      type: body.provider?.type || existing.provider?.type,
      name: body.provider?.name || existing.provider?.name,
      website: body.provider?.website || existing.provider?.website
    },
    amount: Number(body.amount ?? existing.amount ?? 0),
    benefits: body.benefits || existing.benefits,
    eligibility: body.eligibility || existing.eligibility || {},
    documentsRequired: sanitizeStringList(body.documentsRequired ?? existing.documentsRequired),
    commonMistakes: sanitizeStringList(body.commonMistakes ?? existing.commonMistakes),
    applicationProcess: {
      mode: body.applicationProcess?.mode || existing.applicationProcess?.mode,
      applyLink: body.applicationProcess?.applyLink || existing.applicationProcess?.applyLink,
      steps: sanitizeStringList(body.applicationProcess?.steps ?? existing.applicationProcess?.steps)
    },
    deadline: body.deadline || existing.deadline
  };
}

export const createScholarship = async (req, res) => {
  try {
    const payload = normalizeScholarshipPayload(req.body);

    if (!payload.title || !payload.description || !payload.amount || !payload.deadline) {
      return res.status(400).json({
        msg: "Title, description, amount and deadline are required"
      });
    }

    if (!payload.provider?.type) {
      return res.status(400).json({
        msg: "Provider type is required"
      });
    }

    if (new Date(payload.deadline) < new Date()) {
      return res.status(400).json({
        msg: "Deadline must be a future date"
      });
    }

    if (!isValidExternalUrl(payload.applicationProcess?.applyLink)) {
      return res.status(400).json({
        msg: "A valid official application link is required (http/https)."
      });
    }

    const scholarship = await Scholarship.create({
      ...payload,
      status: "PENDING",
      createdBy: req.user.id
    });

    res.status(201).json({
      msg: "Scholarship submitted for admin review",
      scholarship
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Failed to create scholarship",
      error: err.message
    });
  }
};

export const getMyScholarships = async (req, res) => {
  try {
    const data = await Scholarship.find({
      createdBy: req.user.id
    }).sort({ createdAt: -1 });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to fetch scholarships" });
  }
};

export const updateScholarship = async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);
    if (!scholarship) return res.status(404).json({ msg: "Scholarship not found" });
    if (scholarship.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your scholarship" });
    }
    if (scholarship.status !== "PENDING") {
      return res.status(400).json({ msg: "Can only edit PENDING scholarships" });
    }
    if (scholarship.verificationStatus === "VERIFIED") {
      return res.status(400).json({ msg: "Cannot edit verified scholarship" });
    }

    const payload = normalizeScholarshipPayload(req.body, scholarship.toObject());

    if (!payload.title || !payload.description || !payload.amount || !payload.deadline) {
      return res.status(400).json({ msg: "Title, description, amount and deadline are required" });
    }
    if (new Date(payload.deadline) < new Date()) {
      return res.status(400).json({ msg: "Deadline must be a future date" });
    }
    if (!isValidExternalUrl(payload.applicationProcess?.applyLink)) {
      return res.status(400).json({
        msg: "A valid official application link is required (http/https)."
      });
    }

    const updated = await Scholarship.findByIdAndUpdate(
      id,
      {
        ...payload,
        status: "PENDING"
      },
      { new: true }
    );

    res.json({ msg: "Scholarship updated; resubmitted for review", scholarship: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to update scholarship" });
  }
};

export const deleteScholarship = async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);
    if (!scholarship) return res.status(404).json({ msg: "Scholarship not found" });
    if (scholarship.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your scholarship" });
    }
    if (scholarship.status !== "PENDING") {
      return res.status(400).json({ msg: "Can only withdraw PENDING scholarships" });
    }

    await Scholarship.findByIdAndDelete(id);
    res.json({ msg: "Scholarship withdrawn" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to withdraw scholarship" });
  }
};

export const getAssistanceRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { moderatorId: req.user.id };
    if (status && ["OPEN", "RESOLVED"].includes(status)) filter.status = status;

    const list = await AssistanceRequest.find(filter)
      .populate("studentId", "name email")
      .populate("scholarshipId", "title")
      .sort({ updatedAt: -1 });

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to fetch assistance requests" });
  }
};

export const getAssistanceRequestDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await AssistanceRequest.findById(id)
      .populate("studentId", "name email")
      .populate("scholarshipId", "title deadline amount documentsRequired commonMistakes applicationProcess");

    if (!request) return res.status(404).json({ msg: "Assistance request not found" });
    if (request.moderatorId.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your assistance request" });
    }

    const [studentProfile, application] = await Promise.all([
      UserProfile.findOne({ userId: request.studentId._id }).lean(),
      Application.findOne({
        studentId: request.studentId._id,
        scholarshipId: request.scholarshipId._id
      }).lean()
    ]);

    const documents = await Document.find({
      userId: request.studentId._id,
      scholarshipId: request.scholarshipId._id
    })
      .select(
        "_id documentType fileUrl fileName mimeType sizeBytes status reviewComment rejectionReason createdAt updatedAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      assistanceRequest: request,
      studentProfile,
      application,
      documents,
      disclaimer:
        "Document review is guidance-only. Final submission and verification happens on official scholarship portals."
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to fetch assistance request details" });
  }
};

export const replyToAssistance = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ msg: "Message required" });

    const ar = await AssistanceRequest.findById(id);
    if (!ar) return res.status(404).json({ msg: "Assistance request not found" });
    if (ar.moderatorId.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your assistance request" });
    }
    if (ar.status === "RESOLVED") {
      return res.status(400).json({ msg: "Request already resolved" });
    }

    ar.messages.push({
      from: "MODERATOR",
      authorId: req.user.id,
      text: message.trim(),
      createdAt: new Date()
    });
    ar.updatedAt = new Date();
    await ar.save();

    res.json({ msg: "Reply sent", assistanceRequest: ar });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to reply" });
  }
};

export const resolveAssistance = async (req, res) => {
  try {
    const { id } = req.params;
    const ar = await AssistanceRequest.findById(id);
    if (!ar) return res.status(404).json({ msg: "Assistance request not found" });
    if (ar.moderatorId.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your assistance request" });
    }

    ar.status = "RESOLVED";
    ar.updatedAt = new Date();
    await ar.save();

    res.json({ msg: "Assistance marked resolved", assistanceRequest: ar });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to resolve" });
  }
};

export const getScholarshipApplications = async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);
    if (!scholarship) return res.status(404).json({ msg: "Scholarship not found" });
    if (scholarship.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ msg: "Not your scholarship" });
    }

    const applications = await Application.find({ scholarshipId: id })
      .populate("studentId", "name email")
      .sort({ lastUpdated: -1 });

    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to fetch applications" });
  }
};
