import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import IngestionRun from "../../models/IngestionRun.js";
import Scholarship from "../../models/Scholarship.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..", "..");

const DEFAULT_SOURCE_PATH = "data/raw_scholarships.json";
const STATUS_VALUES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const CATEGORY_VALUES = new Set(["OPEN", "OBC", "SC", "ST", "VJNT", "EWS", "SEBC"]);
const ADAPTER_VALUES = new Set(["json", "nsp_html", "mahadbt_html", "html_generic"]);
const KEYWORD_REGEX =
  /(scholarship|fellowship|stipend|grant|fee reimbursement|financial assistance|post\s*-?\s*matric|pre\s*-?\s*matric|शिष्यवृत्ती|छात्रवृत्ति|छात्रवृत्ती|विद्यार्थी)/i;
const TIMEOUT_MS = 30_000;
const MAX_RUN_HISTORY_DEFAULT = 20;
const MAX_ERRORS_PER_SOURCE = 50;
const MAX_CANDIDATES_PER_SOURCE_DEFAULT = 500;
const MAX_DETAIL_FETCH_PER_SOURCE_DEFAULT = 120;
const MAX_DETAIL_FETCH_ERRORS_PER_SOURCE = 20;
const DETAIL_CACHE_MAX_ENTRIES = 2000;
const GENERIC_DESCRIPTION_REGEX =
  /^(imported from|view official portal|verify details on official portal|learn more|apply now)\b/i;

let activeRun = null;

const isHttpUrl = (v) => {
  try {
    const parsed = new URL(String(v || "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};
const ws = (v) => String(v || "").replace(/\s+/g, " ").trim();
const list = (v) =>
  (Array.isArray(v) ? v : [v])
    .flatMap((x) => String(x || "").split(/[\n,;|]+|\band\b/gi))
    .map(ws)
    .filter(Boolean);
const pick = (...vals) => vals.map(ws).find(Boolean) || "";
const lower = (v) => String(v || "").toLowerCase();
const unique = (arr = []) => [...new Set((arr || []).map(ws).filter(Boolean))];
const isLikelyParagraph = (v) => ws(v).length >= 20;

function splitBulletLikeText(value) {
  const text = stripHtmlKeepLines(value);
  if (!text) return [];
  const normalized = text
    .replace(/\r/g, "\n")
    .replace(/[\u2022•●▪◦]/g, "\n")
    .replace(/(?:^|\s)[a-z]\)\s+/gi, "\n")
    .replace(/(?:^|\s)\d+\.\s+/g, "\n");
  return unique(
    normalized
      .split(/\n+/)
      .map((line) => ws(line.replace(/^[-–—]+\s*/, "")))
      .filter((line) => line.length >= 3)
  );
}

function isNoisyExtractedLine(value) {
  const line = lower(ws(value));
  if (!line) return true;
  if (line.length < 3) return true;
  if (/^(ul|li|div|span|a href|class=|style=|href=|http:\/\/|https:\/\/)$/.test(line)) return true;
  if (/(click here for help|guidelines on undisbursement benefit|guidelines for courses not visible|beneficiary search)/i.test(line)) return true;
  if (/(login to apply|open current link|related documents|user manuals)/i.test(line)) return true;
  return false;
}

function stripHtmlKeepLines(value) {
  return ws(
    decodeEntities(
      String(value || "")
        .replace(/<\/(p|li|h[1-6]|tr|td|th|div|br)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
    )
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
  );
}

function parseDate(value) {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const m = String(value).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]) < 100 ? Number(m[3]) + 2000 : Number(m[3]);
  const parsed = new Date(Date.UTC(year, month, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAmount(value) {
  if (typeof value === "number" && value > 0) return Math.round(value);
  const raw = String(value || "").replace(/,/g, "");
  const n = Number(raw.match(/\d+(\.\d+)?/)?.[0] || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (/(crore|cr\b)/i.test(raw)) return Math.round(n * 10_000_000);
  if (/(lakh|lac)/i.test(raw)) return Math.round(n * 100_000);
  if (/(thousand|k\b)/i.test(raw)) return Math.round(n * 1_000);
  return Math.round(n);
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(s) {
  return ws(decodeEntities(String(s || "").replace(/<[^>]*>/g, " ")));
}

function attr(attrs, key) {
  const m = String(attrs || "").match(new RegExp(`${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return ws(m?.[1] || m?.[2] || m?.[3] || "");
}

function absUrl(raw, base) {
  const value = ws(raw);
  if (!value) return "";
  if (isHttpUrl(value)) return value;
  const fallbackBase = ws(process.env.INGEST_DEFAULT_LINK_BASE_URL);
  const root = isHttpUrl(base) ? base : fallbackBase;
  if (!root) return "";
  try {
    const resolved = new URL(value, root).toString();
    return isHttpUrl(resolved) ? resolved : "";
  } catch {
    return "";
  }
}

function normalizeStatus(value, fallback = "APPROVED") {
  const status = String(value || fallback).toUpperCase();
  return STATUS_VALUES.has(status) ? status : fallback;
}

function inferAdapter(url, name = "") {
  const source = `${url} ${name}`.toLowerCase();
  if (!isHttpUrl(url)) return String(url).toLowerCase().endsWith(".json") ? "json" : "html_generic";
  if (source.includes(".json")) return "json";
  if (source.includes("scholarships.gov.in") || source.includes("nsp.gov.in")) return "nsp_html";
  if (source.includes("mahadbt.maharashtra.gov.in")) return "mahadbt_html";
  return "html_generic";
}

function sourceName(url, i) {
  if (!isHttpUrl(url)) return ws(path.basename(url, path.extname(url))) || `source_${i + 1}`;
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    const p = u.pathname.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
    return p ? `${h}_${p}` : h;
  } catch {
    return `source_${i + 1}`;
  }
}

function sourceConfigs() {
  const max = Math.max(1, Math.min(Number(process.env.INGEST_MAX_SOURCES || 10), 50));
  const raw = ws(process.env.SCHOLARSHIP_SOURCE_URLS);
  const entries = (raw ? raw.split(",") : [DEFAULT_SOURCE_PATH]).map((x) => ws(x)).filter(Boolean).slice(0, max);

  return entries.map((entry, i) => {
    const parts = entry.split("|").map(ws).filter(Boolean);
    let name = "";
    let url = "";
    let adapter = "";
    if (parts.length >= 3) [name, url, adapter] = parts;
    else if (parts.length === 2) {
      if (ADAPTER_VALUES.has(parts[1])) {
        url = parts[0];
        adapter = parts[1];
      } else {
        name = parts[0];
        url = parts[1];
      }
    } else {
      url = parts[0];
    }
    const finalName = name || sourceName(url, i);
    const finalAdapter = ADAPTER_VALUES.has(adapter) ? adapter : inferAdapter(url, finalName);
    return {
      name: finalName,
      displayName: finalName.replace(/[_-]+/g, " ").trim(),
      url,
      adapter: finalAdapter
    };
  });
}

function maxCandidatesPerSource() {
  return Math.max(
    1,
    Math.min(
      Number(process.env.INGEST_MAX_CANDIDATES_PER_SOURCE || MAX_CANDIDATES_PER_SOURCE_DEFAULT),
      5000
    )
  );
}

function maxDetailFetchPerSource() {
  return Math.max(
    0,
    Math.min(
      Number(process.env.INGEST_MAX_DETAIL_FETCH_PER_SOURCE || MAX_DETAIL_FETCH_PER_SOURCE_DEFAULT),
      1000
    )
  );
}

function isDetailFetchEnabled() {
  return String(process.env.INGEST_DETAIL_FETCH_ENABLED || "true").toLowerCase() !== "false";
}

function isDetailFetchVerbose() {
  return String(process.env.INGEST_DETAIL_FETCH_VERBOSE || "false").toLowerCase() === "true";
}

const detailPageCache = new Map();

function cacheSet(cacheKey, value) {
  detailPageCache.set(cacheKey, value);
  if (detailPageCache.size > DETAIL_CACHE_MAX_ENTRIES) {
    const oldest = detailPageCache.keys().next().value;
    if (oldest) detailPageCache.delete(oldest);
  }
}

async function fetchTextFromUrl(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/html;q=0.9, */*;q=0.8",
        "User-Agent": "ScholarLinkIngestionBot/1.0 (+https://scholarsetu.netlify.app/)",
        "Accept-Language": "en-IN,en;q=0.9"
      },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  } finally {
    clearTimeout(t);
  }
}

function textSummary(value, max = 500) {
  const cleaned = ws(stripHtmlKeepLines(value));
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}...`;
}

function sectionBlocks(html) {
  const clean = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const sections = [];
  const re = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<h[1-6][^>]*>|$)/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const heading = stripHtml(m[2]);
    const bodyHtml = m[3] || "";
    const bodyText = stripHtmlKeepLines(bodyHtml);
    if (!heading || !bodyText) continue;
    sections.push({ heading, bodyHtml, bodyText });
    if (sections.length >= 250) break;
  }
  return sections;
}

function pickSection(sections, patterns = []) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  const checks = patterns.map((p) => (p instanceof RegExp ? p : new RegExp(String(p), "i")));
  return sections.find((s) => checks.some((r) => r.test(s.heading))) || null;
}

function linesFromSection(section, minLen = 3) {
  if (!section) return [];
  return unique(
    splitBulletLikeText(section.bodyHtml)
      .concat(splitBulletLikeText(section.bodyText))
      .map((line) => ws(line.replace(/^[-–—]+\s*/, "")))
      .filter((line) => !isNoisyExtractedLine(line))
      .filter((line) => line.length >= minLen)
  );
}

function bestParagraphFromSection(section) {
  if (!section) return "";
  const body = ws(section.bodyText);
  if (!body) return "";
  const parts = body
    .split(/\.\s+|\n+/)
    .map(ws)
    .filter((x) => x.length >= 20);
  if (parts.length === 0) return textSummary(body, 650);
  return textSummary(parts.slice(0, 4).join(". "), 700);
}

function extractApplyLinkFromDetail(html, pageUrl) {
  const clean = String(html || "");
  const anchors = [...clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const match of anchors) {
    const href = attr(match[1], "href");
    const text = lower(stripHtml(match[2]));
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;
    if (/(login to apply|apply now|apply here|apply online|apply for)/i.test(text)) {
      const resolved = absUrl(href, pageUrl);
      if (isHttpUrl(resolved)) return resolved;
    }
  }
  return "";
}

function textChunkBetween(text, startRegex, stopRegexes = [], maxChars = 2500) {
  const source = String(text || "");
  if (!source) return "";
  const startMatch = source.match(startRegex);
  if (!startMatch || startMatch.index === undefined) return "";
  const startIdx = startMatch.index + startMatch[0].length;
  let endIdx = source.length;
  for (const stop of stopRegexes) {
    const next = source.slice(startIdx).match(stop);
    if (next && next.index !== undefined) {
      const candidate = startIdx + next.index;
      if (candidate > startIdx && candidate < endIdx) endIdx = candidate;
    }
  }
  const chunk = ws(source.slice(startIdx, Math.min(endIdx, startIdx + maxChars)));
  return chunk;
}

function extractDetailFromHtml(html, source, pageUrl) {
  const sections = sectionBlocks(html);
  const fullText = stripHtmlKeepLines(html);
  const detail = {
    description: "",
    benefits: "",
    eligibilitySummary: "",
    documentsRequired: [],
    steps: [],
    commonMistakes: [],
    applyLink: ""
  };

  const overview = pickSection(sections, [/about scheme/i, /overview/i, /objective/i, /description/i]);
  const benefits = pickSection(sections, [/benefit/i, /scholarship amount/i, /financial assistance/i]);
  const eligibility = pickSection(sections, [/eligibility/i, /who can apply/i, /criteria/i]);
  const documents = pickSection(sections, [/documents required/i, /required documents/i, /documents/i]);
  const procedure = pickSection(sections, [/how to apply/i, /application procedure/i, /procedure/i, /apply scheme/i]);
  const instructions = pickSection(sections, [/important instruction/i, /guideline/i, /error description/i, /action to be taken/i, /note/i]);

  detail.description =
    bestParagraphFromSection(overview) ||
    bestParagraphFromSection(eligibility) ||
    textSummary(stripHtmlKeepLines(html), 650);

  detail.benefits =
    bestParagraphFromSection(benefits) ||
    (linesFromSection(benefits, 4).length > 0 ? linesFromSection(benefits, 4).slice(0, 3).join(" | ") : "");

  detail.eligibilitySummary =
    bestParagraphFromSection(eligibility) ||
    bestParagraphFromSection(instructions);

  detail.documentsRequired = linesFromSection(documents, 4).slice(0, 20);
  detail.steps = linesFromSection(procedure, 6).slice(0, 20);
  detail.commonMistakes = linesFromSection(instructions, 8).slice(0, 20);

  if (detail.steps.length === 0) {
    const all = fullText;
    const stepMatches = [...all.matchAll(/(?:^|\n)\s*step\s*\d+\s*[:\-]?\s*(.+?)(?=\n\s*step\s*\d+|$)/gim)]
      .map((m) => ws(m[1]))
      .filter((line) => line.length >= 5);
    detail.steps = unique(stepMatches).slice(0, 20);
  }

  if (detail.eligibilitySummary.length < 30) {
    const eligibilityChunk = textChunkBetween(
      fullText,
      /eligibility(?: criteria)?/i,
      [/renewal policy/i, /documents required/i, /benefits?/i, /related documents/i, /user manuals/i]
    );
    if (eligibilityChunk.length >= 30) detail.eligibilitySummary = textSummary(eligibilityChunk, 700);
  }

  if (detail.documentsRequired.length === 0) {
    const docsChunk = textChunkBetween(
      fullText,
      /documents required/i,
      [/related documents/i, /user manuals/i, /login to apply/i, /benefits?/i, /eligibility/i]
    );
    const parsedDocs = splitBulletLikeText(docsChunk).filter((line) => !isNoisyExtractedLine(line)).slice(0, 20);
    if (parsedDocs.length > 0) detail.documentsRequired = parsedDocs;
  }

  if (detail.steps.length === 0) {
    const howToApplyChunk = textChunkBetween(
      fullText,
      /(how to apply|application procedure|procedure)/i,
      [/documents required/i, /related documents/i, /user manuals/i, /benefits?/i, /eligibility/i]
    );
    const parsedSteps = splitBulletLikeText(howToApplyChunk).filter((line) => !isNoisyExtractedLine(line)).slice(0, 20);
    if (parsedSteps.length > 0) detail.steps = parsedSteps;
  }

  detail.applyLink = extractApplyLinkFromDetail(html, pageUrl);

  // NSP/dashboard pages are mostly analytics pages; avoid polluting data with generic page text.
  if (source.adapter === "nsp_html" && sections.length < 2 && !detail.documentsRequired.length && !detail.steps.length) {
    detail.description = "";
    detail.benefits = "";
    detail.eligibilitySummary = "";
    detail.commonMistakes = [];
  }

  return detail;
}

function mergeRecordWithDetail(record, detail) {
  const merged = { ...(record || {}) };
  if (!record || !detail) return merged;

  const currentDescription = ws(record.description);
  if (detail.description && (!isLikelyParagraph(currentDescription) || GENERIC_DESCRIPTION_REGEX.test(currentDescription))) {
    merged.description = detail.description;
  }

  if (detail.benefits && !ws(record.benefits)) merged.benefits = detail.benefits;

  if (detail.eligibilitySummary && !ws(record.eligibility?.summary) && !ws(record.eligibilitySummary)) {
    merged.eligibilitySummary = detail.eligibilitySummary;
  }

  const currentDocs = unique(list(record.documentsRequired || record.requiredDocuments || record.documents || ""));
  if (Array.isArray(detail.documentsRequired) && detail.documentsRequired.length > currentDocs.length) {
    merged.documentsRequired = detail.documentsRequired;
  }

  const currentSteps = unique(list(record.applicationProcess?.steps || record.steps || ""));
  if (Array.isArray(detail.steps) && detail.steps.length > currentSteps.length) {
    merged.steps = detail.steps;
  }

  const currentMistakes = unique(list(record.commonMistakes || record.commonErrors || ""));
  if (Array.isArray(detail.commonMistakes) && detail.commonMistakes.length > currentMistakes.length) {
    merged.commonMistakes = detail.commonMistakes;
  }

  if (detail.applyLink && (!isHttpUrl(record.applyLink) || ws(record.applyLink) === ws(record.sourceUrl))) {
    merged.applyLink = detail.applyLink;
  }

  return merged;
}

function shouldFetchDetailForRecord(record, source) {
  if (!isDetailFetchEnabled()) return false;
  const link = absUrl(record?.applyLink || record?.applicationLink || record?.url || "", source.url);
  if (!isHttpUrl(link)) return false;
  if (source.adapter === "nsp_html" && /\/dashboard\/?$/i.test(link)) return false;
  const genericOnly = !isLikelyParagraph(record?.description) || GENERIC_DESCRIPTION_REGEX.test(record?.description || "");
  const hasFewFields =
    unique(list(record?.documentsRequired || "")).length === 0 ||
    unique(list(record?.steps || record?.applicationProcess?.steps || "")).length === 0 ||
    unique(list(record?.commonMistakes || "")).length === 0;
  return genericOnly || hasFewFields;
}

async function enrichRecordsWithDetailPages(records, source, summary) {
  if (!Array.isArray(records) || records.length === 0) return records;
  if (!isDetailFetchEnabled()) return records;

  const maxFetch = maxDetailFetchPerSource();
  if (maxFetch <= 0) return records;

  const out = [];
  let attempted = 0;

  for (const record of records) {
    let current = record;
    if (attempted < maxFetch && shouldFetchDetailForRecord(record, source)) {
      const pageUrl = absUrl(record.applyLink || record.applicationLink || record.url || "", source.url);
      if (isHttpUrl(pageUrl)) {
        attempted += 1;
        try {
          let detail = detailPageCache.get(pageUrl);
          if (!detail) {
            const html = await fetchTextFromUrl(pageUrl);
            detail = extractDetailFromHtml(html, source, pageUrl);
            cacheSet(pageUrl, detail);
          }
          current = mergeRecordWithDetail(record, detail);
        } catch (error) {
          if (isDetailFetchVerbose() && summary.errors.length < MAX_DETAIL_FETCH_ERRORS_PER_SOURCE) {
            summary.errors.push(`Detail fetch failed (${pageUrl}): ${error.message}`);
          }
        }
      }
    }
    out.push(current);
  }
  return out;
}

async function readSource(source) {
  if (isHttpUrl(source.url)) {
    const text = await fetchTextFromUrl(source.url);
    const trimmed = text.trim();
    if (source.adapter === "json" || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return { format: "json", payload: JSON.parse(trimmed) };
    }
    return { format: "html", payload: text };
  }
  const local = source.url.startsWith("file://")
    ? fileURLToPath(new URL(source.url))
    : path.resolve(SERVER_ROOT, source.url);
  const text = await fs.readFile(local, "utf8");
  const trimmed = text.trim();
  if (source.adapter === "json" || local.toLowerCase().endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { format: "json", payload: JSON.parse(trimmed) };
  }
  return { format: "html", payload: text };
}

function jsonRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["scholarships", "data", "items", "results"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function htmlRecords(html, source) {
  const clean = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const out = [];
  const seen = new Set();
  const push = (r) => {
    const title = ws(r.title);
    if (!title || !KEYWORD_REGEX.test(title)) return;
    const link = absUrl(r.applyLink, source.url);
    const key = link ? `link:${link.toLowerCase()}` : `title:${title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      title,
      description: ws(r.description),
      applyLink: link,
      deadline: r.deadline || null,
      amount: r.amount || 0,
      externalId: r.externalId || link
    });
  };

  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  let row;
  while ((row = rowRe.exec(clean)) !== null) {
    const rowHtml = row[0];
    const cells = [];
    let cell;
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    while ((cell = cellRe.exec(rowHtml)) !== null) cells.push(stripHtml(cell[1]));
    if (cells.length === 0) continue;
    const rowText = ws(cells.join(" | "));
    const title = cells.find((c) => KEYWORD_REGEX.test(c)) || cells[0];
    const firstHref = attr(rowHtml, "href");
    push({
      title,
      description: cells.slice(1).join(" | "),
      applyLink: firstHref,
      deadline: parseDate(rowText.match(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}\b/)?.[0]),
      amount: parseAmount(rowText),
      externalId: firstHref
    });
    if (out.length >= 500) break;
  }

  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let a;
  while ((a = aRe.exec(clean)) !== null) {
    const title = stripHtml(a[2]);
    if (title.length < 8 || title.length > 220) continue;
    const href = attr(a[1], "href");
    const ctx = stripHtml(clean.slice(Math.max(0, a.index - 260), Math.min(clean.length, a.index + a[0].length + 260)));
    push({
      title,
      description: ctx,
      applyLink: href,
      deadline: parseDate(ctx.match(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}\b/)?.[0]),
      amount: parseAmount(ctx),
      externalId: href
    });
    if (out.length >= 500) break;
  }
  return out;
}

function normalize(record, source) {
  const allowPartial = String(process.env.INGEST_ALLOW_PARTIAL_RECORDS || "true").toLowerCase() !== "false";
  const title = pick(record.title, record.scholarshipName, record.name);
  if (!title) return null;

  const rawDesc = pick(record.description, record.summary, record.details, record.purposeAward, record.reward, record.whoCanApply);
  const desc = rawDesc || `Imported from ${source.displayName}. Verify details on official portal.`;

  const d = parseDate(pick(record.deadline, record.deadlineDate, record.lastDate, record.lastDateToApply)) ||
    (allowPartial ? new Date(Date.now() + Math.max(30, Number(process.env.INGEST_FALLBACK_DEADLINE_DAYS || 120)) * 86400000) : null);
  const a = parseAmount(record.amount ?? record.awardAmount ?? record.purposeAward ?? record.reward ?? record.benefits ?? "");
  const amount = a > 0 ? a : allowPartial ? Math.max(1000, Number(process.env.INGEST_FALLBACK_AMOUNT || 10000)) : 0;
  if (!d || amount <= 0) return null;

  const providerName = pick(record.provider?.name, record.providerName, record.organization, record.postedBy, source.displayName);
  const providerType = /gov|ministry|state|central/i.test(`${record.providerType || ""} ${providerName}`) ? "GOVERNMENT" : /ngo|trust|foundation/i.test(`${record.providerType || ""} ${providerName}`) ? "NGO" : /csr|corporate|company/i.test(`${record.providerType || ""} ${providerName}`) ? "CSR" : "PRIVATE";
  const applyLink = absUrl(record.applicationProcess?.applyLink || record.applyLink || record.applicationLink || record.applyUrl || record.url || record.pageSlug, source.url);
  const sourcePortalLink = isHttpUrl(source.url) ? source.url : "";
  const usedFallback = !rawDesc || a <= 0 || !parseDate(pick(record.deadline, record.deadlineDate, record.lastDate, record.lastDateToApply));
  const autoApproveAll = String(process.env.INGEST_AUTO_APPROVE_ALL || "true").toLowerCase() !== "false";
  const defaultStatus = normalizeStatus(process.env.INGEST_DEFAULT_STATUS, "APPROVED");
  const status = autoApproveAll ? defaultStatus : usedFallback ? "PENDING" : normalizeStatus(record.status, defaultStatus);
  const tags = [...new Set(list(record.tags || record.tagList || record.oppurtunityType || record.type))];
  if (usedFallback) tags.push("auto-imported", "needs-review");
  const eligibilitySummary = pick(record.eligibility?.summary, record.eligibilitySummary, record.eligibilityText, record.whoCanApply);
  const documentsRequired = unique(list(record.documentsRequired || record.requiredDocuments || record.documents || ""));
  const commonMistakes = unique(list(record.commonMistakes || record.commonErrors || ""));
  const applicationSteps = unique(list(record.applicationProcess?.steps || record.steps || record.howToApply || ""));

  const dedupeKey = crypto.createHash("sha1").update(`${title.toLowerCase()}|${providerName.toLowerCase()}|${new Date(d).toISOString().slice(0, 10)}|${applyLink.toLowerCase()}`).digest("hex");
  return {
    title,
    description: desc,
    provider: { name: providerName, type: providerType, website: absUrl(record.provider?.website || record.providerWebsite || record.website, source.url) || undefined },
    amount,
    benefits: pick(record.benefits, record.reward, record.purposeAward) || undefined,
    tags,
    eligibility: {
      summary: eligibilitySummary || undefined,
      minMarks: Number(record.eligibility?.minMarks ?? record.minMarks ?? record.minimumMarks ?? NaN) || undefined,
      maxIncome: Number(record.eligibility?.maxIncome ?? record.maxIncome ?? record.incomeLimit ?? NaN) || undefined,
      categories: [...new Set(list(record.eligibility?.categories || record.categories || record.caste || record.category).map((c) => (c.toUpperCase() === "GENERAL" ? "OPEN" : c.toUpperCase())).filter((c) => CATEGORY_VALUES.has(c)))],
      gender: String(record.eligibility?.gender || record.gender || "ANY").toUpperCase().includes("FEMALE") ? "FEMALE" : String(record.eligibility?.gender || record.gender || "ANY").toUpperCase().includes("MALE") ? "MALE" : "ANY",
      statesAllowed: list(record.eligibility?.statesAllowed || record.statesAllowed || record.state || record.region),
      educationLevel: String(record.eligibility?.educationLevel || record.educationLevel || record.studyLevel || "").toUpperCase().includes("DIPLOMA") ? "DIPLOMA" : String(record.eligibility?.educationLevel || record.educationLevel || record.studyLevel || "").toUpperCase().includes("PHD") ? "PHD" : String(record.eligibility?.educationLevel || record.educationLevel || record.studyLevel || "").toUpperCase().includes("PG") || String(record.eligibility?.educationLevel || record.educationLevel || record.studyLevel || "").toUpperCase().includes("MASTER") ? "PG" : String(record.eligibility?.educationLevel || record.educationLevel || record.studyLevel || "").toUpperCase().includes("UG") || String(record.eligibility?.educationLevel || record.educationLevel || record.studyLevel || "").toUpperCase().includes("BACHELOR") ? "UG" : undefined
    },
    documentsRequired,
    commonMistakes,
    applicationProcess: {
      mode: ["ONLINE", "OFFLINE", "BOTH"].includes(String(record.applicationProcess?.mode || record.applicationMode || "ONLINE").toUpperCase()) ? String(record.applicationProcess?.mode || record.applicationMode || "ONLINE").toUpperCase() : "ONLINE",
      applyLink: applyLink || sourcePortalLink || undefined,
      steps: applicationSteps
    },
    status,
    deadline: new Date(d),
    isActive: new Date(d).getTime() >= Date.now(),
    verificationStatus: usedFallback ? "UNVERIFIED" : Boolean(record.verified ?? record.verifiedStatus ?? false) ? "VERIFIED" : "UNVERIFIED",
    source: {
      provider: source.name,
      adapter: source.adapter,
      externalId: pick(record.externalId, record.id, record._id, record.usid, record.slug, record.pageSlug, record.bsid) || undefined,
      dedupeKey,
      sourceUrl: source.url
    },
    lastSyncedAt: new Date()
  };
}

function dayBounds(dateValue) {
  const d = new Date(dateValue);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function mergeIntoExisting(existing, normalized) {
  const blockedStatus = existing.status === "REJECTED";
  const blockedVerification = existing.verificationStatus === "FLAGGED";
  Object.assign(existing, normalized);
  existing.status = blockedStatus ? "REJECTED" : normalized.status;
  existing.verificationStatus = blockedVerification ? "FLAGGED" : normalized.verificationStatus;
  existing.source = { ...(existing.source?.toObject?.() || existing.source || {}), ...(normalized.source || {}) };
  existing.lastSyncedAt = new Date();
  await existing.save();
  return { inserted: 0, updated: 1 };
}

async function upsert(normalized) {
  const sourceQuery = normalized.source.externalId
    ? { "source.provider": normalized.source.provider, "source.externalId": normalized.source.externalId }
    : { "source.provider": normalized.source.provider, "source.dedupeKey": normalized.source.dedupeKey };
  const { start, end } = dayBounds(normalized.deadline);
  const fallback = { title: normalized.title, "provider.name": normalized.provider.name, deadline: { $gte: start, $lt: end } };
  const existingBySource = await Scholarship.findOne(sourceQuery);
  const existing = existingBySource || (await Scholarship.findOne(fallback));
  if (!existing) {
    try {
      await Scholarship.create(normalized);
      return { inserted: 1, updated: 0 };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = (await Scholarship.findOne(sourceQuery)) ||
        (await Scholarship.findOne({ "source.provider": normalized.source.provider, "source.dedupeKey": normalized.source.dedupeKey })) ||
        (await Scholarship.findOne(fallback));
      if (!duplicate) throw error;
      return mergeIntoExisting(duplicate, normalized);
    }
  }
  return mergeIntoExisting(existing, normalized);
}

function runSnapshot() {
  return activeRun ? { runId: activeRun.runId, trigger: activeRun.trigger, startedAt: activeRun.startedAt } : null;
}

async function deactivateStaleSourceRecords(activeSources) {
  const shouldDeactivate = String(process.env.INGEST_DEACTIVATE_STALE_SOURCES || "true").toLowerCase() !== "false";
  if (!shouldDeactivate) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  const sourceList = [...new Set((activeSources || []).map((value) => ws(value)).filter(Boolean))];
  if (sourceList.length === 0) {
    return { matchedCount: 0, modifiedCount: 0 };
  }

  const result = await Scholarship.updateMany(
    {
      "source.provider": { $exists: true, $ne: "", $nin: sourceList },
      isActive: true
    },
    {
      $set: {
        isActive: false,
        lastSyncedAt: new Date()
      }
    }
  );

  return {
    matchedCount: Number(result.matchedCount || 0),
    modifiedCount: Number(result.modifiedCount || 0)
  };
}

export async function runScholarshipIngestion({ trigger = "MANUAL", initiatedBy = null } = {}) {
  if (activeRun) return { accepted: false, message: "Ingestion run already in progress", runId: activeRun.runId };

  const sources = sourceConfigs();
  const startedAt = new Date();
  const run = await IngestionRun.create({
    trigger,
    status: "RUNNING",
    initiatedBy: initiatedBy || undefined,
    sourceCount: sources.length,
    startedAt,
    totals: { fetched: 0, normalized: 0, inserted: 0, updated: 0, skipped: 0 },
    sourceSummaries: []
  });
  activeRun = { runId: String(run._id), trigger, startedAt };

  const totals = { fetched: 0, normalized: 0, inserted: 0, updated: 0, skipped: 0 };
  const sourceSummaries = [];

  try {
    for (const source of sources) {
      const summary = { name: source.name, url: source.url, adapter: source.adapter, fetched: 0, normalized: 0, inserted: 0, updated: 0, skipped: 0, errors: [] };
      try {
        const raw = await readSource(source);
        const records = raw.format === "json" ? jsonRecords(raw.payload) : htmlRecords(raw.payload, source);
        const limitedRecords = records.slice(0, maxCandidatesPerSource());
        if (records.length > limitedRecords.length && summary.errors.length < MAX_ERRORS_PER_SOURCE) {
          summary.errors.push(`Candidate cap applied: processed ${limitedRecords.length} of ${records.length} records`);
        }
        const enrichedRecords = await enrichRecordsWithDetailPages(limitedRecords, source, summary);
        summary.fetched = limitedRecords.length;
        totals.fetched += limitedRecords.length;
        for (const r of enrichedRecords) {
          const normalized = normalize(r, source);
          if (!normalized) {
            summary.skipped += 1;
            totals.skipped += 1;
            continue;
          }
          summary.normalized += 1;
          totals.normalized += 1;
          try {
            const result = await upsert(normalized);
            summary.inserted += result.inserted;
            summary.updated += result.updated;
            totals.inserted += result.inserted;
            totals.updated += result.updated;
          } catch (e) {
            summary.skipped += 1;
            totals.skipped += 1;
            if (summary.errors.length < MAX_ERRORS_PER_SOURCE) summary.errors.push(`Upsert failed for "${normalized.title}": ${e.message}`);
          }
        }
      } catch (e) {
        if (summary.errors.length < MAX_ERRORS_PER_SOURCE) summary.errors.push(`Source read failed: ${e.message}`);
      }
      sourceSummaries.push(summary);
    }

    const staleCleanup = await deactivateStaleSourceRecords(sources.map((source) => source.name));
    if (staleCleanup.modifiedCount > 0) {
      sourceSummaries.push({
        name: "stale_source_cleanup",
        url: "-",
        adapter: "system",
        fetched: 0,
        normalized: 0,
        inserted: 0,
        updated: staleCleanup.modifiedCount,
        skipped: 0,
        errors: [`Deactivated ${staleCleanup.modifiedCount} stale records from removed sources`]
      });
    }

    const finishedAt = new Date();
    const hasErrors = sourceSummaries.some((s) => s.errors.length > 0);
    const status = totals.normalized === 0 ? "FAILED" : hasErrors || totals.skipped > 0 ? "PARTIAL" : "SUCCESS";
    run.status = status;
    run.totals = totals;
    run.sourceSummaries = sourceSummaries;
    run.finishedAt = finishedAt;
    run.durationMs = finishedAt.getTime() - startedAt.getTime();
    await run.save();
    return { accepted: true, runId: run._id, status, totals, sourceSummaries };
  } catch (e) {
    const finishedAt = new Date();
    run.status = "FAILED";
    run.errorMessage = e.message;
    run.totals = totals;
    run.sourceSummaries = sourceSummaries;
    run.finishedAt = finishedAt;
    run.durationMs = finishedAt.getTime() - startedAt.getTime();
    await run.save();
    return { accepted: true, runId: run._id, status: "FAILED", error: e.message };
  } finally {
    activeRun = null;
  }
}

export async function getScholarshipIngestionStatus() {
  const latestRun = await IngestionRun.findOne({})
    .sort({ createdAt: -1 })
    .populate("initiatedBy", "name email role")
    .lean();
  return { isRunning: Boolean(activeRun), running: runSnapshot(), latestRun };
}

export async function listScholarshipIngestionRuns(limit = MAX_RUN_HISTORY_DEFAULT) {
  const safeLimit = Math.max(1, Math.min(Number(limit || MAX_RUN_HISTORY_DEFAULT), 100));
  return IngestionRun.find({})
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate("initiatedBy", "name email role")
    .lean();
}
