import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function buildAuthPayload(user) {
  return {
    id: user._id,
    role: user.role
  };
}

function getCookieDomain() {
  const configuredDomain = String(process.env.AUTH_COOKIE_DOMAIN || "").trim();
  return configuredDomain || undefined;
}

function buildAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: ONE_DAY_MS
  };

  const domain = getCookieDomain();
  if (domain) {
    cookieOptions.domain = domain;
  }

  return cookieOptions;
}

function buildClearCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/"
  };

  const domain = getCookieDomain();
  if (domain) {
    cookieOptions.domain = domain;
  }

  return cookieOptions;
}

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ msg: "Name, email and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ msg: "Password must be at least 8 characters" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ msg: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: "STUDENT"
    });

    res.status(201).json({
      msg: "Student registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ msg: "Signup failed", error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const invalidMessage = "Invalid email or password";

    if (!email || !password) {
      return res.status(400).json({ msg: invalidMessage });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
    if (!user) {
      return res.status(401).json({ msg: invalidMessage });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ msg: invalidMessage });
    }

    const token = jwt.sign(buildAuthPayload(user), process.env.JWT_SECRET, {
      expiresIn: "24h",
      issuer: "ScholarLink"
    });

    res.cookie("token", token, buildAuthCookieOptions());

    res.json({
      token,
      role: user.role,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ msg: "Login failed", error: error.message });
  }
};

export const logout = (req, res) => {
  res.clearCookie("token", buildClearCookieOptions());
  res.json({ msg: "Logged out successfully" });
};
