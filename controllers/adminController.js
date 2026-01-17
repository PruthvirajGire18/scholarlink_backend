import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Scholarship from "../models/Scholarship.js";

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

  const scholarship = await Scholarship.findByIdAndUpdate(
    req.params.id,
    {
      status,
      reviewRemarks: remarks,
      reviewedBy: req.user.id
    },
    { new: true }
  );

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