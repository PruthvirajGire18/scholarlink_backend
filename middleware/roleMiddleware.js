const roleMiddleware = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: "Access Denied" });
    }
    next();
  };
};

/** Allow multiple roles (e.g. ADMIN or MODERATOR) */
export const allowRoles = (roles) => {
  const set = new Set(Array.isArray(roles) ? roles : [roles]);
  return (req, res, next) => {
    if (!set.has(req.user.role)) {
      return res.status(403).json({ message: "Access Denied" });
    }
    next();
  };
};

export default roleMiddleware;
