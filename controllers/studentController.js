import Scholarship from "../models/Scholarship.js";
import AssistanceRequest from "../models/AssistanceRequest.js";

/* ===========================
   STUDENT: VIEW APPROVED SCHOLARSHIPS
=========================== */
export const getApprovedScholarships = async (req, res) => {
  const data = await Scholarship.find({
    status: "APPROVED",
    isActive: true
  }).sort({ deadline: 1 });

  res.json(data);
};

/* ===========================
   STUDENT: SCHOLARSHIP DETAIL (for Need Help flow)
=========================== */
export const getScholarshipById = async (req, res) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id)
      .populate("createdBy", "name email");
    if (!scholarship) return res.status(404).json({ message: "Scholarship not found" });
    if (scholarship.status !== "APPROVED" || !scholarship.isActive)
      return res.status(403).json({ message: "Scholarship not available" });
    res.json(scholarship);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ===========================
   STUDENT: ASSISTANCE (moderatorId derived from scholarship.createdBy)
=========================== */
export const createAssistanceRequest = async (req, res) => {
  try {
    const { scholarshipId, message } = req.body;
    if (!scholarshipId || !message || !message.trim())
      return res.status(400).json({ message: "scholarshipId and message required" });

    const scholarship = await Scholarship.findById(scholarshipId);
    if (!scholarship) return res.status(404).json({ message: "Scholarship not found" });
    if (scholarship.status !== "APPROVED" || !scholarship.isActive)
      return res.status(400).json({ message: "Scholarship not available for assistance" });

    const moderatorId = scholarship.createdBy;
    if (!moderatorId)
      return res.status(400).json({ message: "No moderator assigned for this scholarship" });

    const existing = await AssistanceRequest.findOne({
      studentId: req.user.id,
      scholarshipId,
      status: "OPEN"
    });
    if (existing)
      return res.status(400).json({ message: "You already have an open request for this scholarship" });

    const ar = await AssistanceRequest.create({
      studentId: req.user.id,
      scholarshipId,
      moderatorId,
      messages: [
        { from: "STUDENT", authorId: req.user.id, text: message.trim(), createdAt: new Date() }
      ],
      status: "OPEN"
    });

    const populated = await AssistanceRequest.findById(ar._id)
      .populate("scholarshipId", "title")
      .populate("moderatorId", "name email");
    res.status(201).json({ message: "Assistance request created", assistanceRequest: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMyAssistanceRequests = async (req, res) => {
  try {
    const list = await AssistanceRequest.find({ studentId: req.user.id })
      .populate("scholarshipId", "title")
      .populate("moderatorId", "name email")
      .sort({ updatedAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
