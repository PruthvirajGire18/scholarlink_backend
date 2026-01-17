import Scholarship from "../models/Scholarship.js";

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
