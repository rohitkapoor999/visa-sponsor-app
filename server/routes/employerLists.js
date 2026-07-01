import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { supabase, enforceLimit } from "../db.js";
import { extractEmployerListContent } from "../utils/fileParsers.js";
import { callClaude, parseJsonResponse } from "../utils/claude.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const MAX_LISTS_PER_COUNTRY = 5;

const EMPLOYER_SCHEMA_PROMPT = `Return ONLY a JSON array, no markdown, no explanation:
[{"name":"Company Name","industry":"Industry or null","location":"City/Region or null","website":"domain.com or null"}]`;

function countryGuard(req, res, next) {
  if (!["NZ", "AU"].includes(req.params.country)) return res.status(400).json({ error: "country must be NZ or AU" });
  next();
}

// GET all employer lists for a country
router.get("/:country", countryGuard, async (req, res) => {
  const { data, error } = await supabase
    .from("employer_lists")
    .select("id, title, source, pinned, created_at, employer_count")
    .eq("country", req.params.country)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET single list with full employer data
router.get("/:country/:id", countryGuard, async (req, res) => {
  const { data, error } = await supabase.from("employer_lists").select("*").eq("id", req.params.id).eq("country", req.params.country).single();
  if (error) return res.status(404).json({ error: "Employer list not found" });
  res.json({ ...data, employers: JSON.parse(data.employers_json) });
});

// POST upload a file to extract an employer list
router.post("/:country/upload", countryGuard, upload.single("file"), async (req, res) => {
  try {
    const { title } = req.body;
    const country = req.params.country;
    if (!title || !title.trim()) return res.status(400).json({ error: "A title is required." });
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const extracted = await extractEmployerListContent(req.file.buffer, req.file.mimetype, req.file.originalname);

    let messages;
    if (extracted.type === "image") {
      messages = [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: extracted.mimetype, data: extracted.content } },
        { type: "text", text: `Extract every employer/company name visible in this image (employer list for ${country === "NZ" ? "New Zealand" : "Australia"}). ${EMPLOYER_SCHEMA_PROMPT}` },
      ]}];
    } else {
      if (!extracted.content || extracted.content.length < 5) return res.status(400).json({ error: "Couldn't extract any readable content from this file." });
      messages = [{ role: "user", content: `Extract every employer/company name from this data (employer list for ${country === "NZ" ? "New Zealand" : "Australia"}). ${EMPLOYER_SCHEMA_PROMPT}\n\nRAW DATA:\n${extracted.content.slice(0, 15000)}` }];
    }

    const { text } = await callClaude({ system: "You extract structured employer data. Output ONLY valid JSON arrays, nothing else.", messages, maxTokens: 4000 });
    const employers = parseJsonResponse(text);

    const { data, error } = await supabase.from("employer_lists").insert({
      id: uuidv4(), country, title: title.trim(), source: "uploaded",
      employers_json: JSON.stringify(employers), employer_count: employers.length,
      pinned: false, created_at: new Date().toISOString(),
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    await enforceLimit("employer_lists", "country", country, MAX_LISTS_PER_COUNTRY, true);
    res.status(201).json({ ...data, employers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST AI web search to compile employer list
router.post("/:country/ai-search", countryGuard, async (req, res) => {
  try {
    const country = req.params.country;
    const countryName = country === "NZ" ? "New Zealand" : "Australia";
    const visaType = country === "NZ" ? "Accredited Employer Work Visa (AEWV)" : "Employer Nomination Scheme / TSS visa";

    const { text } = await callClaude({
      system: `You research real accredited/sponsoring employers in ${countryName} via web search. ${EMPLOYER_SCHEMA_PROMPT} Only include companies with evidence from search results. Aim for up to 20.`,
      messages: [{ role: "user", content: `Search for real companies in ${countryName} currently accredited under the ${visaType}. Search across multiple industries.` }],
      useWebSearch: true, maxTokens: 4000,
    });
    const employers = parseJsonResponse(text);
    const title = `AI search — ${new Date().toLocaleDateString()}`;

    const { data, error } = await supabase.from("employer_lists").insert({
      id: uuidv4(), country, title, source: "ai_search",
      employers_json: JSON.stringify(employers), employer_count: employers.length,
      pinned: false, created_at: new Date().toISOString(),
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    await enforceLimit("employer_lists", "country", country, MAX_LISTS_PER_COUNTRY, true);
    res.status(201).json({ ...data, employers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH toggle pin
router.patch("/:country/:id/pin", countryGuard, async (req, res) => {
  const { data: row, error: fetchErr } = await supabase.from("employer_lists").select("pinned").eq("id", req.params.id).single();
  if (fetchErr) return res.status(404).json({ error: "List not found" });
  const { error } = await supabase.from("employer_lists").update({ pinned: !row.pinned }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ id: req.params.id, pinned: !row.pinned });
});

// DELETE a list
router.delete("/:country/:id", countryGuard, async (req, res) => {
  const { error } = await supabase.from("employer_lists").delete().eq("id", req.params.id).eq("country", req.params.country);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
