import { GoogleGenerativeAI } from "@google/generative-ai";

const LANGUAGE_NAME_MAP = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi"
};

function normalizeLanguageCode(value) {
  const normalized = String(value || "en").trim().toLowerCase();
  if (!normalized) return "en";
  if (normalized.startsWith("hi")) return "hi";
  if (normalized.startsWith("mr")) return "mr";
  return "en";
}

function buildTranslationPrompt(text, targetLangCode, sourceLangCode) {
  const languageName = LANGUAGE_NAME_MAP[targetLangCode] || "English";
  const sourceLanguageName = LANGUAGE_NAME_MAP[sourceLangCode] || "source language";
  return [
    "You are a strict translation engine.",
    `Translate the text from ${sourceLanguageName} into ${languageName}.`,
    "Rules:",
    "- Preserve original meaning and tone.",
    "- Keep numbers, links, and names unchanged unless translation is required.",
    "- Return only translated text, no quotes, no markdown, no explanation.",
    "",
    `Text: ${text}`
  ].join("\n");
}

async function translateWithGemini(text, targetLangCode, sourceLangCode) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const modelName = String(process.env.GEMINI_MODEL || "gemini-1.5-flash").trim();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent(
    buildTranslationPrompt(text, targetLangCode, sourceLangCode)
  );
  const translated = result?.response?.text?.()?.trim();
  if (!translated) {
    throw new Error("Gemini returned empty translation");
  }

  return translated;
}

export const translateText = async (req, res) => {
  const text = String(req.body?.text || "").trim();
  const targetLang = normalizeLanguageCode(req.body?.targetLang);
  const sourceLang = normalizeLanguageCode(req.body?.sourceLang || "en");

  if (!text) {
    return res.status(400).json({ message: "text is required" });
  }

  // No translation required for English target.
  if (targetLang === "en") {
    return res.json({ translated: text });
  }

  // Fail-safe: keep app working even if Gemini key is not configured.
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return res.json({
      translated: text,
      fallback: true,
      reason: "missing_gemini_api_key"
    });
  }

  try {
    const translated = await translateWithGemini(text, targetLang, sourceLang);
    return res.json({ translated });
  } catch (error) {
    // Fail-safe: on provider errors, return original text instead of 500.
    return res.json({
      translated: text,
      fallback: true,
      reason: "provider_error",
      message: "Translation temporarily unavailable",
      error: String(error?.message || "Unknown translation error")
    });
  }
};
