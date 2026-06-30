import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import db, { enforceLimit } from "../db.js";
import { extractEmployerListContent } from "../utils/fileParsers.js";
import { callClaude, parseJsonResponse } from "../utils/claude.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const MAX_LISTS_PER_COUNTRY = 5;

const EMPLOYER_SCHEMA_PROMPT = `Return ONLY a JSON array, no markdown, no explanation, in this exact schema:
[{"name":"Company Name","industry":"Industry or null if unknown","location":"City/Region or null if unknown","website":"domain.com or null if unknown"}]`;

function countryGuard(req, res, next) {
  if (!["NZ", "AU"].includes(req.params.country)) {
    return res.status(400).json({ error: "country must be NZ or AU" });
  }
  next();
}

// GET all employer lists for a country (metadata + count, not full employer data)
router.get("/:country", countryGuard, (req, res) => {
  const rows = db.data.employer_lists
    .filter((l) => l.country === req.params.country)
    .map(({ id, title, source, pinned, created_at, employers }) => ({
      id, title, source, pinned, created_at, employer_count: employers.length,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(rows);
});

// GET single list with full employer data
router.get("/:country/:id", countryGuard, (req, res) => {
  const row = db.data.employer_lists.find((l) => l.id === req.params.id && l.country === req.params.country);
  if (!row) return res.status(404).json({ error: "Employer list not found" });
  res.json(row);
});

// POST upload a file (xlsx/csv/pdf/docx/image) to extract an employer list
router.post("/:country/upload", countryGuard, upload.single("file"), async (req, res) => {
  try {
    const { title } = req.body;
    const country = req.params.country;
    if (!title || !title.trim()) return res.status(400).json({ error: "A title is required." });
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const extracted = await extractEmployerListContent(req.file.buffer, req.file.mimetype, req.file.originalname);

    let messages;
    if (extracted.type === "image") {
      messages = [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: extracted.mimetype, data: extracted.content } },
            { type: "text", text: `Extract every employer/company name visible in this image (it's a list/screenshot of employers in ${country === "NZ" ? "New Zealand" : "Australia"}). ${EMPLOYER_SCHEMA_PROMPT}` },
          ],
        },
      ];
    } else {
      if (!extracted.content || extracted.content.length < 5) {
        return res.status(400).json({ error: "Couldn't extract any readable content from this file." });
      }
      messages = [
        {
          role: "user",
          content: `Extract every employer/company name from this data (source file for an employer list in ${country === "NZ" ? "New Zealand" : "Australia"}). ${EMPLOYER_SCHEMA_PROMPT}\n\nRAW DATA:\n${extracted.content.slice(0, 15000)}`,
        },
      ];
    }

    const { text } = await callClaude({
      system: "You extract structured employer data from raw file content. Output ONLY valid JSON arrays as instructed, nothing else.",
      messages,
      maxTokens: 4000,
    });
    const employers = parseJsonResponse(text);

    const newList = {
      id: uuidv4(),
      country,
      title: title.trim(),
      source: "uploaded",
      employers,
      pinned: false,
      created_at: new Date().toISOString(),
    };
    db.data.employer_lists.push(newList);
    await db.write();

    await enforceLimit("employer_lists", (l) => l.country === country, MAX_LISTS_PER_COUNTRY, true);

    res.status(201).json(newList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST trigger an AI web search to compile an employer list (clearly labeled as AI-compiled)
router.post("/:country/ai-search", countryGuard, async (req, res) => {
  try {
    const country = req.params.country;
    const countryName = country === "NZ" ? "New Zealand" : "Australia";
    const visaType = country === "NZ" ? "Accredited Employer Work Visa (AEWV)" : "Employer Nomination Scheme / TSS visa";

    const { text } = await callClaude({
      system: `You are researching real, currently accredited/sponsoring employers in ${countryName} using web search. ${EMPLOYER_SCHEMA_PROMPT} Only include companies you have reasonable evidence for from search results. Aim for up to 20 results.`,
      messages: [
        {
          role: "user",
          content: `Search the web for real companies in ${countryName} that are currently accredited employers / approved visa sponsors under the ${visaType}. Use multiple searches if needed across different industries.`,
        },
      ],
      useWebSearch: true,
      maxTokens: 4000,
    });
    const employers = parseJsonResponse(text);

    const newList = {
      id: uuidv4(),
      country,
      title: `AI search — ${new Date().toLocaleDateString()}`,
      source: "ai_search",
      employers,
      pinned: false,
      created_at: new Date().toISOString(),
    };
    db.data.employer_lists.push(newList);
    await db.write();

    await enforceLimit("employer_lists", (l) => l.country === country, MAX_LISTS_PER_COUNTRY, true);

    res.status(201).json(newList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH toggle pin
router.patch("/:country/:id/pin", countryGuard, async (req, res) => {
  const row = db.data.employer_lists.find((l) => l.id === req.params.id && l.country === req.params.country);
  if (!row) return res.status(404).json({ error: "List not found" });
  row.pinned = !row.pinned;
  await db.write();
  res.json({ id: row.id, pinned: row.pinned });
});

// DELETE a list
router.delete("/:country/:id", countryGuard, async (req, res) => {
  const before = db.data.employer_lists.length;
  db.data.employer_lists = db.data.employer_lists.filter((l) => !(l.id === req.params.id && l.country === req.params.country));
  if (db.data.employer_lists.length === before) return res.status(404).json({ error: "List not found" });
  await db.write();
  res.json({ success: true });
});

export default router;
