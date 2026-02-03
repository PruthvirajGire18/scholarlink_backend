import Scholarship from "../models/Scholarship.js";

/**
 * Rule-based risk score 0–100 for a scholarship.
 * Used for verification queue prioritization.
 */
export async function calculateRiskScore(scholarship) {
  let score = 0;
  const doc = scholarship._doc || scholarship;

  const title = (doc.title || "").trim().toLowerCase();
  const deadline = doc.deadline ? new Date(doc.deadline) : null;
  const createdBy = doc.createdBy;
  const providerWebsite = doc.provider?.website;
  const applyLink = doc.applicationProcess?.applyLink;

  if (!title) return 0;

  const duplicateTitle = await Scholarship.countDocuments({
    title: new RegExp(`^${escapeRegex(doc.title)}$`, "i"),
    _id: { $ne: doc._id }
  });
  if (duplicateTitle > 0) score += 25;

  if (deadline) {
    const now = new Date();
    const daysLeft = (deadline - now) / (1000 * 60 * 60 * 24);
    if (daysLeft < 0) score += 20;
    else if (daysLeft < 7) score += 15;
    else if (daysLeft > 365) score += 10;
  }

  const hasOfficialUrl = !!(providerWebsite || applyLink);
  if (!hasOfficialUrl) score += 20;

  if (createdBy) {
    const sameCreatorCount = await Scholarship.countDocuments({
      createdBy,
      _id: { $ne: doc._id }
    });
    if (sameCreatorCount >= 5) score += 25;
    else if (sameCreatorCount >= 2) score += 15;
  }

  return Math.min(100, score);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
