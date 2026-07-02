import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { supabase, enforceLimit } from "../db.js";
import { extractCompaniesFromFile } from "../utils/extractCompanies.js";
import { callClaude, parseJsonResponse } from "../utils/claude.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const MAX_LISTS_PER_COUNTRY = 5;
const FILTER_BATCH_SIZE = 300; // companies per AI filter batch

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
  if (error) return res.status(404).json({ error: "Not found" });
  res.json({ ...data, employers: JSON.parse(data.employers_json) });
});

// Step 1: Extract company names from file — NO AI, pure file parsing, no token limit
router.post("/:country/extract", countryGuard, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const companies = await extractCompaniesFromFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!companies || companies.length === 0) return res.status(400).json({ error: "No company names found in this file. Make sure it contains a list of company names." });
    res.json({ companies, total: companies.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 2: Pre-filter extracted companies against a CV — batched for large lists
router.post("/:country/prefilter", countryGuard, async (req, res) => {
  try {
    const { companies, cvId } = req.body;
    if (!companies || companies.length === 0) return res.status(400).json({ error: "No companies provided." });
    if (!cvId) return res.status(400).json({ error: "cvId is required." });

    const { data: cv, error: cvErr } = await supabase.from("cvs").select("text_content").eq("id", cvId).single();
    if (cvErr) return res.status(404).json({ error: "CV not found." });

    // Split into batches of 300 companies each
    const batches = [];
    for (let i = 0; i < companies.length; i += FILTER_BATCH_SIZE) {
      batches.push(companies.slice(i, i + FILTER_BATCH_SIZE));
    }

    let profession = "";
    let key_skills = [];
    let allKept = [];
    let allRemoved = [];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const companyList = batch.map((c, i) => `${i + 1}. ${c.name}`).join("\n");

      const { text } = await callClaude({
        system: `You are a smart job search assistant. Given a CV and a list of companies, filter which companies likely have relevant job openings for that person based on their skills and profession. Consider that large companies often have finance/admin/HR roles even if their core industry differs.

Return ONLY a JSON object, no markdown:
{"profession":"detected profession in one line","key_skills":["skill1","skill2","skill3"],"kept":[{"name":"Company Name","reason":"why relevant"}],"removed":[{"name":"Company Name","reason":"why removed"}]}`,
        messages: [{
          role: "user",
          content: `CV:\n${cv.text_content.slice(0, 4000)}\n\nCOMPANIES (batch ${b + 1} of ${batches.length}):\n${companyList}\n\nFilter this list based on the CV above.`
        }],
        maxTokens: 4000,
      });

      const result = parseJsonResponse(text);
      if (b === 0) { profession = result.profession; key_skills = result.key_skills; }
      allKept = [...allKept, ...(result.kept || [])];
      allRemoved = [...allRemoved, ...(result.removed || [])];
    }

    res.json({ profession, key_skills, kept: allKept, removed: allRemoved });
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

// AI web search to compile employer list
router.post("/:country/ai-search", countryGuard, async (req, res) => {
  try {
    const country = req.params.country;
    const countryName = country === "NZ" ? "New Zealand" : "Australia";
    const visaType = country === "NZ" ? "Accredited Employer Work Visa (AEWV)" : "Employer Nomination Scheme / TSS visa";

    const { text } = await callClaude({
      system: `Research real accredited/sponsoring employers in ${countryName} via web search. Return ONLY a JSON array, no markdown:
[{"name":"Company Name","industry":"Industry or null","location":"City or null","website":"domain.com or null"}]`,
      messages: [{ role: "user", content: `Search for companies in ${countryName} currently accredited under ${visaType}. Search multiple industries. Aim for 20 results.` }],
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
  if (fetchErr) return res.status(404).json({ error: "Not found" });
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
