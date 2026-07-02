import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { supabase, enforceLimit } from "../db.js";
import { extractEmployerListContent } from "../utils/fileParsers.js";
import { callClaude, parseJsonResponse } from "../utils/claude.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const MAX_LISTS_PER_COUNTRY = 5;

const EMPLOYER_SCHEMA_PROMPT = `Return ONLY a JSON array, no markdown:
[{"name":"Company Name","industry":"Industry or null","location":"City/Region or null","website":"domain.com or null"}]`;

function countryGuard(req, res, next) {
  if (!["NZ", "AU"].includes(req.params.country)) return res.status(400).json({ error: "country must be NZ or AU" });
  next();
}

router.get("/:country", countryGuard, async (req, res) => {
  const { data, error } = await supabase.from("employer_lists").select("id, title, source, pinned, created_at, employer_count").eq("country", req.params.country).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/:country/:id", countryGuard, async (req, res) => {
  const { data, error } = await supabase.from("employer_lists").select("*").eq("id", req.params.id).eq("country", req.params.country).single();
  if (error) return res.status(404).json({ error: "Not found" });
  res.json({ ...data, employers: JSON.parse(data.employers_json) });
});

// Step 1: Extract company names from uploaded file
router.post("/:country/extract", countryGuard, upload.single("file"), async (req, res) => {
  try {
    const country = req.params.country;
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const extracted = await extractEmployerListContent(req.file.buffer, req.file.mimetype, req.file.originalname);
    let messages;
    if (extracted.type === "image") {
      messages = [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: extracted.mimetype, data: extracted.content } },
        { type: "text", text: `Extract every company/employer name from this image. ${EMPLOYER_SCHEMA_PROMPT}` },
      ]}];
    } else {
      if (!extracted.content || extracted.content.length < 5) return res.status(400).json({ error: "Couldn't extract readable content from this file." });
      messages = [{ role: "user", content: `Extract every company/employer name from this data. ${EMPLOYER_SCHEMA_PROMPT}\n\nDATA:\n${extracted.content.slice(0, 15000)}` }];
    }
    const { text } = await callClaude({ system: "Extract company names from file content. Output ONLY valid JSON arrays.", messages, maxTokens: 4000 });
    const companies = parseJsonResponse(text);
    res.json({ companies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 2: Pre-filter extracted companies against a CV
router.post("/:country/prefilter", countryGuard, async (req, res) => {
  try {
    const { companies, cvId } = req.body;
    if (!companies || companies.length === 0) return res.status(400).json({ error: "No companies provided." });
    if (!cvId) return res.status(400).json({ error: "cvId is required." });
    const { data: cv, error: cvErr } = await supabase.from("cvs").select("text_content").eq("id", cvId).single();
    if (cvErr) return res.status(404).json({ error: "CV not found." });
    const companyList = companies.map((c, i) => `${i + 1}. ${c.name}${c.industry ? ` (${c.industry})` : ""}`).join("\n");
    const { text } = await callClaude({
      system: `You are a smart job search assistant. Given a CV and a list of companies, filter which companies likely have relevant job openings for that person. Large companies often have finance/admin/HR departments even if their core industry differs — keep those unless clearly irrelevant.

Return ONLY a JSON object, no markdown:
{"profession":"detected profession in one line","key_skills":["skill1","skill2","skill3"],"kept":[{"name":"Company Name","reason":"why relevant"}],"removed":[{"name":"Company Name","reason":"why removed"}]}`,
      messages: [{ role: "user", content: `CV:\n${cv.text_content.slice(0, 5000)}\n\nCOMPANIES:\n${companyList}\n\nFilter this list based on the CV above.` }],
      maxTokens: 4000,
    });
    const result = parseJsonResponse(text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 3: Save the user-approved filtered list
router.post("/:country/save", countryGuard, async (req, res) => {
  try {
    const { title, employers, source } = req.body;
    const country = req.params.country;
    if (!title || !title.trim()) return res.status(400).json({ error: "A title is required." });
    if (!employers || employers.length === 0) return res.status(400).json({ error: "No employers to save." });
    const { data, error } = await supabase.from("employer_lists").insert({
      id: uuidv4(), country, title: title.trim(), source: source || "uploaded",
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

// AI web search
router.post("/:country/ai-search", countryGuard, async (req, res) => {
  try {
    const country = req.params.country;
    const countryName = country === "NZ" ? "New Zealand" : "Australia";
    const visaType = country === "NZ" ? "Accredited Employer Work Visa (AEWV)" : "Employer Nomination Scheme / TSS visa";
    const { text } = await callClaude({
      system: `Research real accredited/sponsoring employers in ${countryName} via web search. ${EMPLOYER_SCHEMA_PROMPT}`,
      messages: [{ role: "user", content: `Search for companies in ${countryName} currently accredited under ${visaType}. Search multiple industries.` }],
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

router.patch("/:country/:id/pin", countryGuard, async (req, res) => {
  const { data: row, error: fetchErr } = await supabase.from("employer_lists").select("pinned").eq("id", req.params.id).single();
  if (fetchErr) return res.status(404).json({ error: "Not found" });
  const { error } = await supabase.from("employer_lists").update({ pinned: !row.pinned }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ id: req.params.id, pinned: !row.pinned });
});

router.delete("/:country/:id", countryGuard, async (req, res) => {
  const { error } = await supabase.from("employer_lists").delete().eq("id", req.params.id).eq("country", req.params.country);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
