export function normalizeDocumentType(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export function humanizeDocumentType(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function buildDefaultRoadmap() {
  return [
    {
      key: "profile",
      title: "Complete Profile",
      description: "Fill personal, academic, and financial details.",
      isDone: false
    },
    {
      key: "documents",
      title: "Upload Required Documents",
      description: "Upload all mandatory documents for guidance and pre-check support.",
      isDone: false
    },
    {
      key: "review",
      title: "Review Eligibility Assistant",
      description: "Review checklist, common mistakes, and official portal instructions.",
      isDone: false
    },
    {
      key: "submit",
      title: "Mark Official Submission",
      description: "Apply on the official portal and then update status here.",
      isDone: false
    }
  ];
}

export function buildChecklistFromScholarship(scholarship) {
  const unique = new Set();
  const rawList = Array.isArray(scholarship.documentsRequired)
    ? scholarship.documentsRequired
    : [scholarship.documentsRequired];

  for (const rawItem of rawList) {
    for (const docType of splitAndNormalizeDocumentTypes(rawItem)) {
      unique.add(docType);
    }
  }

  return Array.from(unique).map((documentType) => ({
    documentType,
    label: humanizeDocumentType(documentType),
    isRequired: true,
    isUploaded: false,
    isVerified: false,
    comment: ""
  }));
}

export function markStep(steps, stepKey, isDone) {
  return (steps || []).map((step) => {
    if (step.key !== stepKey) return step;
    return {
      ...step,
      isDone,
      completedAt: isDone ? new Date() : null
    };
  });
}

export function updateChecklistItem(checklist, documentType, patch = {}) {
  const normalizedType = normalizeDocumentType(documentType);
  return (checklist || []).map((item) => {
    if (item.documentType !== normalizedType) return item;
    return { ...item, ...patch };
  });
}

export function calculateProgress(application) {
  const steps = application.roadmapSteps || [];
  const checklist = application.documentChecklist || [];

  const completedSteps = steps.filter((step) => step.isDone).length;
  const roadmapScore = steps.length > 0 ? (completedSteps / steps.length) * 60 : 0;

  const uploadedDocs = checklist.filter((item) => item.isUploaded).length;
  const documentsScore = checklist.length > 0 ? (uploadedDocs / checklist.length) * 40 : 40;

  return Math.min(100, Math.round(roadmapScore + documentsScore));
}

export function deriveStatus(application) {
  if (
    application.status === "APPROVED" ||
    application.status === "REJECTED" ||
    application.status === "PENDING"
  ) {
    return application.status;
  }

  if (application.submittedAt && application.status !== "APPROVED" && application.status !== "REJECTED") {
    return "APPLIED";
  }

  return "IN_PROGRESS";
}

function splitAndNormalizeDocumentTypes(rawItem) {
  const source = String(rawItem || "").trim();
  if (!source) return [];

  const normalized = normalizeDocumentType(source);
  const known = [];

  if (normalized.includes("AADHAAR")) known.push("AADHAAR");
  if (normalized.includes("INCOME_CERTIFICATE")) known.push("INCOME_CERTIFICATE");
  if (normalized.includes("CASTE_CERTIFICATE")) known.push("CASTE_CERTIFICATE");
  if (normalized.includes("DOMICILE_CERTIFICATE") || normalized.includes("DOMICILE")) known.push("DOMICILE");
  if (normalized.includes("MARKSHEET") || normalized.includes("TRANSCRIPT")) known.push("MARKSHEET");

  if (known.length > 0) return known;

  return source
    .split(/[,;|/\n]+|\band\b/gi)
    .map(normalizeDocumentType)
    .filter(Boolean);
}
