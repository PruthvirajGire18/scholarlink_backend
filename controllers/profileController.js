import User from "../models/User.js";
import UserProfile from "../models/UserProfile.js";

export const getAuthenticatedProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const [user, profile] = await Promise.all([
      User.findById(userId).select("name email role").lean(),
      UserProfile.findOne({ userId }).lean()
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      profile: {
        ...(profile || {}),
        preferredLanguage: Array.isArray(profile?.preferredLanguages)
          ? profile.preferredLanguages[0] || "en"
          : "en",
        userId,
        name: user.name || "",
        email: user.email || "",
        role: user.role || ""
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
};
