import AuditLog from "../models/AuditLog.js";

/**
 * Create immutable audit log for admin/moderator actions.
 * Call after successful action; does not throw.
 */
export async function createAuditLog({
  actorId,
  actorRole,
  actionType,
  entityType,
  entityId,
  beforeState = null,
  afterState = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    await AuditLog.create({
      actorId,
      actorRole,
      actionType,
      entityType,
      entityId,
      beforeState,
      afterState,
      ipAddress,
      userAgent
    });
  } catch (err) {
    console.error("[AuditLog] Failed to write:", err.message);
  }
}

export function getClientMeta(req) {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get("user-agent") || null
  };
}
