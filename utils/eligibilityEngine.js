const DOC_PROFILE_FIELD_MAP = {
  AADHAAR: "aadhaar",
  INCOME_CERTIFICATE: "incomeCertificate",
  CASTE_CERTIFICATE: "casteCertificate",
  CASTE_VALIDITY_CERTIFICATE: "casteValidityCertificate",
  NON_CREAMY_LAYER_CERTIFICATE: "nonCreamyLayerCertificate",
  DOMICILE: "domicileCertificate",
  MARKSHEET: "marksheet",
  TRANSFER_CERTIFICATE: "transferCertificate",
  GAP_CERTIFICATE: "gapCertificate",
  BANK_PASSBOOK: "bankPassbook",
  FEE_RECEIPT: "feeReceipt",
  ADMISSION_LETTER: "admissionLetter",
  BONAFIDE_CERTIFICATE: "bonafideCertificate",
  DISABILITY_CERTIFICATE: "disabilityCertificate",
  MINORITY_DECLARATION: "minorityDeclaration",
  RATION_CARD: "rationCard",
  SELF_DECLARATION: "selfDeclaration"
};

function normalizeDocumentType(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function humanizeDocumentType(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function splitDocumentTokens(value) {
  return String(value || "")
    .split(/[,;|/\n]+|\band\b/gi)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getProfileDocumentKey(rawDocument) {
  const normalized = normalizeDocumentType(rawDocument);
  if (!normalized) return null;
  if (normalized.includes("AADHAAR")) return DOC_PROFILE_FIELD_MAP.AADHAAR;
  if (normalized.includes("INCOME_CERTIFICATE")) return DOC_PROFILE_FIELD_MAP.INCOME_CERTIFICATE;
  if (normalized.includes("CASTE_CERTIFICATE")) return DOC_PROFILE_FIELD_MAP.CASTE_CERTIFICATE;
  if (normalized.includes("CASTE_VALIDITY")) return DOC_PROFILE_FIELD_MAP.CASTE_VALIDITY_CERTIFICATE;
  if (normalized.includes("NON_CREAMY") || normalized.includes("NCL")) {
    return DOC_PROFILE_FIELD_MAP.NON_CREAMY_LAYER_CERTIFICATE;
  }
  if (normalized.includes("DOMICILE")) return DOC_PROFILE_FIELD_MAP.DOMICILE;
  if (normalized.includes("MARKSHEET") || normalized.includes("TRANSCRIPT")) {
    return DOC_PROFILE_FIELD_MAP.MARKSHEET;
  }
  if (normalized.includes("TRANSFER_CERTIFICATE") || normalized.includes("LEAVING_CERTIFICATE")) {
    return DOC_PROFILE_FIELD_MAP.TRANSFER_CERTIFICATE;
  }
  if (normalized.includes("GAP_CERTIFICATE")) return DOC_PROFILE_FIELD_MAP.GAP_CERTIFICATE;
  if (normalized.includes("PASSBOOK") || normalized.includes("BANK_BOOK")) {
    return DOC_PROFILE_FIELD_MAP.BANK_PASSBOOK;
  }
  if (normalized.includes("FEE_RECEIPT")) return DOC_PROFILE_FIELD_MAP.FEE_RECEIPT;
  if (normalized.includes("ADMISSION_LETTER") || normalized.includes("ALLOTMENT_LETTER")) {
    return DOC_PROFILE_FIELD_MAP.ADMISSION_LETTER;
  }
  if (normalized.includes("BONAFIDE")) return DOC_PROFILE_FIELD_MAP.BONAFIDE_CERTIFICATE;
  if (normalized.includes("DISABILITY")) return DOC_PROFILE_FIELD_MAP.DISABILITY_CERTIFICATE;
  if (normalized.includes("MINORITY")) return DOC_PROFILE_FIELD_MAP.MINORITY_DECLARATION;
  if (normalized.includes("RATION_CARD")) return DOC_PROFILE_FIELD_MAP.RATION_CARD;
  if (normalized.includes("SELF_DECLARATION") || normalized.includes("UNDERTAKING")) {
    return DOC_PROFILE_FIELD_MAP.SELF_DECLARATION;
  }
  return DOC_PROFILE_FIELD_MAP[normalized] || null;
}

function getMissingProfileDocuments(profile, scholarship) {
  const required = new Map();
  const rawList = Array.isArray(scholarship.documentsRequired)
    ? scholarship.documentsRequired
    : [scholarship.documentsRequired];

  for (const rawItem of rawList) {
    for (const token of splitDocumentTokens(rawItem)) {
      const profileKey = getProfileDocumentKey(token);
      if (profileKey) required.set(profileKey, humanizeDocumentType(normalizeDocumentType(token)));
    }
  }

  const profileDocs = profile?.documents || {};
  return Array.from(required.entries())
    .filter(([profileKey]) => {
      const value = profileDocs[profileKey];
      if (value === true) return false;
      if (value && typeof value === "object") {
        if (value.isUploaded === true) return false;
        if (String(value.fileUrl || "").trim()) return false;
      }
      return true;
    })
    .map(([, label]) => label);
}

/**
 * Rule-based matching engine.
 * Returns explainable output with tri-state eligibility:
 * ELIGIBLE | PARTIALLY_ELIGIBLE | NOT_ELIGIBLE
 */
export function evaluateEligibility(profile, scholarship) {
  const passes = [];
  const hardFails = [];

  if (!profile) {
    return {
      eligibilityStatus: "NOT_ELIGIBLE",
      isEligible: false,
      isPartiallyEligible: false,
      canProceed: false,
      score: 0,
      passes,
      hardFails: ["Complete your profile to unlock eligibility matching."],
      missingDocuments: [],
      fails: ["Complete your profile to unlock eligibility matching."]
    };
  }

  const eligibility = scholarship.eligibility || {};
  const academic = profile.education || {};
  const addressState = profile.address?.state?.toLowerCase?.();

  if (eligibility.minMarks != null) {
    if ((academic.percentage ?? -1) >= eligibility.minMarks) {
      passes.push(`Marks >= ${eligibility.minMarks}%`);
    } else {
      hardFails.push(`Marks below ${eligibility.minMarks}%`);
    }
  }

  if (eligibility.maxIncome != null) {
    if ((profile.annualIncome ?? Number.MAX_SAFE_INTEGER) <= eligibility.maxIncome) {
      passes.push(`Income <= INR ${eligibility.maxIncome.toLocaleString("en-IN")}`);
    } else {
      hardFails.push(`Income exceeds INR ${eligibility.maxIncome.toLocaleString("en-IN")}`);
    }
  }

  if (Array.isArray(eligibility.categories) && eligibility.categories.length > 0) {
    if (eligibility.categories.includes(profile.category)) {
      passes.push(`Category ${profile.category} accepted`);
    } else {
      hardFails.push("Category criteria not met");
    }
  }

  if (eligibility.gender && eligibility.gender !== "ANY") {
    if (profile.gender === eligibility.gender) {
      passes.push(`Gender ${eligibility.gender} eligible`);
    } else {
      hardFails.push(`Only for ${eligibility.gender}`);
    }
  }

  if (Array.isArray(eligibility.statesAllowed) && eligibility.statesAllowed.length > 0) {
    const allowedStates = eligibility.statesAllowed.map((state) => state.toLowerCase());
    if (addressState && allowedStates.includes(addressState)) {
      passes.push("State criteria matched");
    } else {
      hardFails.push("State criteria not met");
    }
  }

  if (eligibility.educationLevel) {
    if ((academic.educationLevel || "").toUpperCase() === eligibility.educationLevel) {
      passes.push(`Education level ${eligibility.educationLevel} matched`);
    } else {
      hardFails.push(`Only for ${eligibility.educationLevel} students`);
    }
  }

  if (scholarship.deadline && new Date(scholarship.deadline) < new Date()) {
    hardFails.push("Deadline passed");
  }

  const missingDocuments = hardFails.length === 0 ? getMissingProfileDocuments(profile, scholarship) : [];

  const eligibilityStatus =
    hardFails.length > 0
      ? "NOT_ELIGIBLE"
      : missingDocuments.length > 0
        ? "PARTIALLY_ELIGIBLE"
        : "ELIGIBLE";

  const totalChecks = passes.length + hardFails.length + missingDocuments.length;
  const baseScore = totalChecks > 0 ? Math.round((passes.length / totalChecks) * 100) : 60;
  const amountBoost = scholarship.amount >= 50000 ? 8 : scholarship.amount >= 20000 ? 4 : 0;

  let score = Math.min(100, baseScore + amountBoost);
  if (eligibilityStatus === "PARTIALLY_ELIGIBLE") score = Math.min(score, 85);
  if (eligibilityStatus === "NOT_ELIGIBLE") score = Math.min(score, 60);

  const missingDocumentReasons = missingDocuments.map((label) => `Missing document: ${label}`);
  const fails = [...hardFails, ...missingDocumentReasons];

  return {
    eligibilityStatus,
    isEligible: eligibilityStatus === "ELIGIBLE",
    isPartiallyEligible: eligibilityStatus === "PARTIALLY_ELIGIBLE",
    canProceed: eligibilityStatus !== "NOT_ELIGIBLE",
    score,
    passes,
    hardFails,
    missingDocuments,
    fails
  };
}

export function recommendScholarships(profile, scholarships) {
  const evaluated = scholarships.map((scholarship) => {
    const result = evaluateEligibility(profile, scholarship);
    return {
      scholarship,
      ...result
    };
  });

  const rankByScoreThenDeadline = (a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.scholarship.deadline) - new Date(b.scholarship.deadline);
  };

  const eligible = evaluated.filter((item) => item.eligibilityStatus === "ELIGIBLE").sort(rankByScoreThenDeadline);

  const partiallyEligible = evaluated
    .filter((item) => item.eligibilityStatus === "PARTIALLY_ELIGIBLE")
    .sort(rankByScoreThenDeadline);

  const nearMisses = evaluated
    .filter((item) => item.eligibilityStatus === "NOT_ELIGIBLE" && item.hardFails.length <= 2)
    .sort((a, b) => b.score - a.score);

  return {
    eligible,
    partiallyEligible,
    nearMisses
  };
}
