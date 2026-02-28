import jwt from "jsonwebtoken";

function getTokenFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null;

  const tokenCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("token="));

  if (!tokenCookie) return null;

  const rawToken = tokenCookie.slice("token=".length);
  if (!rawToken) return null;

  try {
    return decodeURIComponent(rawToken);
  } catch {
    return rawToken;
  }
}

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cookieToken = getTokenFromCookieHeader(req.headers.cookie);
  const token = headerToken || cookieToken;

  if (!token)
    return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role }
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

export default authMiddleware;
