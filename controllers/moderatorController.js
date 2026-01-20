import Scholarship from "../models/Scholarship.js";

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

