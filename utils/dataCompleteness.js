function asText(value) {
  return String(value || "").trim();
}

function toList(value) {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((item) => String(item || "").split(/\n|,|;|\|/g))
    .map((item) => item.trim())
    .filter(Boolean);
}

function isHttpUrl(value) {
  const text = asText(value);
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function hasEligibilityDetails(eligibility = {}) {
  const summary = asText(eligibility.summary);
  if (summary.length >= 20) return true;
  if (eligibility.minMarks !== undefined && eligibility.minMarks !== null) return true;
  if (eligibility.maxIncome !== undefined && eligibility.maxIncome !== null) return true;
  if (Array.isArray(eligibility.categories) && eligibility.categories.length > 0) return true;
  if (Array.isArray(eligibility.statesAllowed) && eligibility.statesAllowed.length > 0) return true;
  if (asText(eligibility.educationLevel)) return true;
  return false;
}

export function calculateScholarshipDataCompleteness(rawScholarship) {
  const scholarship = rawScholarship?.toObject ? rawScholarship.toObject() : rawScholarship || {};
  const description = asText(scholarship.description);
  const benefits = asText(scholarship.benefits);
  const documents = toList(scholarship.documentsRequired);
  const steps = toList(scholarship.applicationProcess?.steps);
  const mistakes = toList(scholarship.commonMistakes);
  const applyLink = asText(scholarship.applicationProcess?.applyLink);
  const providerName = asText(scholarship.provider?.name);
  const providerType = asText(scholarship.provider?.type);

  const checks = [
    {
      key: "description",
      label: "Description",
      weight: 15,
      ok: description.length >= 40
    },
    {
      key: "benefits",
      label: "Benefits",
      weight: 5,
      ok: benefits.length >= 20
    },
    {
      key: "eligibility",
      label: "Eligibility details",
      weight: 20,
      ok: hasEligibilityDetails(scholarship.eligibility || {})
    },
    {
      key: "documents",
      label: "Required documents",
      weight: 20,
      ok: documents.length > 0
    },
    {
      key: "steps",
      label: "Application steps",
      weight: 15,
      ok: steps.length > 0
    },
    {
      key: "common_mistakes",
      label: "Common mistakes",
      weight: 10,
      ok: mistakes.length > 0
    },
    {
      key: "apply_link",
      label: "Official apply link",
      weight: 10,
      ok: isHttpUrl(applyLink)
    },
    {
      key: "provider",
      label: "Provider details",
      weight: 5,
      ok: Boolean(providerName && providerType)
    }
  ];

  const totalWeight = checks.reduce((acc, item) => acc + item.weight, 0);
  const score = Math.round(
    checks.reduce((acc, item) => acc + (item.ok ? item.weight : 0), 0)
  );

  return {
    score: Math.max(0, Math.min(score, totalWeight)),
    maxScore: totalWeight,
    missingFields: checks.filter((item) => !item.ok).map((item) => item.label),
    filledFields: checks.filter((item) => item.ok).map((item) => item.label)
  };
}

export function withScholarshipDataCompleteness(rawScholarship) {
  const scholarship = rawScholarship?.toObject ? rawScholarship.toObject() : rawScholarship || {};
  return {
    ...scholarship,
    dataCompleteness: calculateScholarshipDataCompleteness(scholarship)
  };
}
