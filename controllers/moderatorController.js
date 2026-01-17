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

    if (!title || !amount || !deadline) {
      return res.status(400).json({
        msg: "Title, amount and deadline are required"
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
    res.status(500).json({ msg: "Failed to create scholarship" });
  }
};

/* ===========================
   MODERATOR: VIEW OWN SCHOLARSHIPS
=========================== */
export const getMyScholarships = async (req, res) => {
  const data = await Scholarship.find({
    createdBy: req.user.id
  }).sort({ createdAt: -1 });

  res.json(data);
};
