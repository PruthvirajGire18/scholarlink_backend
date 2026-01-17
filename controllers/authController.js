import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/* ======================
   STUDENT SIGNUP
====================== */
export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1️⃣ Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ msg: "All fields required" });
    }

    // 2️⃣ Strong password check
    if (password.length < 8) {
      return res.status(400).json({
        msg: "Password must be at least 8 characters"
      });
    }

    // 3️⃣ Prevent duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ msg: "Email already registered" });
    }

    // 4️⃣ Hash password
    const hash = await bcrypt.hash(password, 12);

    await User.create({
      name,
      email,
      password: hash,
      role: "STUDENT"
    });

    res.status(201).json({ msg: "Student registered successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Signup failed" });
  }
};

/* ======================
   LOGIN (FIXED)
====================== */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const invalidMsg = "Invalid email or password";

    if (!email || !password) {
      return res.status(400).json({ msg: invalidMsg });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ msg: invalidMsg });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ msg: invalidMsg });
    }

    // 🔥 FIXED JWT PAYLOAD
    const token = jwt.sign(
      {
        id: user._id,        // ✅ WAS uid → NOW id
        role: user.role     // ✅ REQUIRED for RBAC
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
        issuer: "TFC-04"
      }
    );

    res.json({
      token,
      role: user.role
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Login failed" });
  }
};
