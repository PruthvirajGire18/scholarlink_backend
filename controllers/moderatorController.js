import Scholarship from "../models/Scholarship.js";
import AssistanceRequest from "../models/AssistanceRequest.js";
import Application from "../models/Application.js";

/* ===========================
   MODERATOR: CREATE SCHOLARSHIP
=========================== */
export const createScholarship = async (req, res) => {
  try {
    const {
      title,
      description,
      provider,
      amount,
      eligibility,
      documentsRequired,
      applicationProcess,
      deadline
    } = req.body;

    // 🔹 Required fields validation
    if (!title || !description || !amount || !deadline) {
      return res.status(400).json({
        msg: "Title, description, amount and deadline are required"
      });
    }

    // 🔹 Provider validation
    if (!provider || !provider.type) {
      return res.status(400).json({
        msg: "Provider type is required"
      });
    }

    // 🔹 Deadline validation
    if (new Date(deadline) < new Date()) {
      return res.status(400).json({
        msg: "Deadline must be a future date"
      });
    }

    const scholarship = await Scholarship.create({
      title,
      description,
      provider,
      amount,
      eligibility,
      documentsRequired,
      applicationProcess,
      deadline,
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

/* ===========================
   MODERATOR: VIEW OWN SCHOLARSHIPS
=========================== */
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

/* ===========================
   MODERATOR: EDIT OWN SCHOLARSHIP (only PENDING, not VERIFIED)
=========================== */
export const updateScholarship = async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);
    if (!scholarship) return res.status(404).json({ msg: "Scholarship not found" });
    if (scholarship.createdBy.toString() !== req.user.id)
      return res.status(403).json({ msg: "Not your scholarship" });
    if (scholarship.status !== "PENDING")
      return res.status(400).json({ msg: "Can only edit PENDING scholarships" });
    if (scholarship.verificationStatus === "VERIFIED")
      return res.status(400).json({ msg: "Cannot edit verified scholarship" });

    const {
      title,
      description,
      provider,
      amount,
      eligibility,
      documentsRequired,
      applicationProcess,
      deadline
    } = req.body;

    if (!title || !description || !amount || !deadline) {
      return res.status(400).json({ msg: "Title, description, amount and deadline are required" });
    }
    if (new Date(deadline) < new Date()) {
      return res.status(400).json({ msg: "Deadline must be a future date" });
    }

    const updated = await Scholarship.findByIdAndUpdate(
      id,
      {
        title,
        description,
        provider: provider || scholarship.provider,
        amount,
        eligibility: eligibility || scholarship.eligibility,
        documentsRequired: documentsRequired ?? scholarship.documentsRequired,
        applicationProcess: applicationProcess || scholarship.applicationProcess,
        deadline,
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

/* ===========================
   MODERATOR: WITHDRAW SCHOLARSHIP (before admin review)
=========================== */
export const deleteScholarship = async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);
    if (!scholarship) return res.status(404).json({ msg: "Scholarship not found" });
    if (scholarship.createdBy.toString() !== req.user.id)
      return res.status(403).json({ msg: "Not your scholarship" });
    if (scholarship.status !== "PENDING")
      return res.status(400).json({ msg: "Can only withdraw PENDING scholarships" });

    await Scholarship.findByIdAndDelete(id);
    res.json({ msg: "Scholarship withdrawn" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to withdraw scholarship" });
  }
};

/* ===========================
   MODERATOR: ASSISTANCE (only for scholarships they created)
=========================== */
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

export const replyToAssistance = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ msg: "Message required" });

    const ar = await AssistanceRequest.findById(id);
    if (!ar) return res.status(404).json({ msg: "Assistance request not found" });
    if (ar.moderatorId.toString() !== req.user.id)
      return res.status(403).json({ msg: "Not your assistance request" });
    if (ar.status === "RESOLVED")
      return res.status(400).json({ msg: "Request already resolved" });

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
    if (ar.moderatorId.toString() !== req.user.id)
      return res.status(403).json({ msg: "Not your assistance request" });

    ar.status = "RESOLVED";
    ar.updatedAt = new Date();
    await ar.save();

    res.json({ msg: "Assistance marked resolved", assistanceRequest: ar });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to resolve" });
  }
};

/* ===========================
   MODERATOR: APPLICATION PROGRESS (read-only, for scholarships they created)
=========================== */
export const getScholarshipApplications = async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);
    if (!scholarship) return res.status(404).json({ msg: "Scholarship not found" });
    if (scholarship.createdBy.toString() !== req.user.id)
      return res.status(403).json({ msg: "Not your scholarship" });

    const applications = await Application.find({ scholarshipId: id })
      .populate("studentId", "name email")
      .sort({ lastUpdated: -1 });

    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to fetch applications" });
  }
};
