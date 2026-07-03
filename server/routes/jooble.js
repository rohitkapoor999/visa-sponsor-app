import express from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase, enforceLimit } from "../db.js";
import { callClaude, parseJsonResponse } from "../utils/claude.js";

const router = express.Router();
const MAX_RESULTS_PER_COUNTRY = 4;
const COUNTRY_MAP = { NZ: "New Zealand", AU: "Australia" };
const ADZUNA_COUNTRY = { NZ: "nz", AU: "au" };

// Extract keywords from CV using AI
async function extractKeywords(cvText) {
  const { text } = await callClaude({
    system: `Extract 5-8 most important job search keywords from this CV. Focus on job titles, technologies, and specializations. Return ONLY a JSON array of strings, no markdown: ["keyword1","keyword2"]`,
    messages: [{ role: "user", content: cvText.slice(0, 3000) }],
    maxTokens: 500,
  });
  try { return parseJsonResponse(text); }
  catch { return ["contact centre", "CX technology"]; }
}

// Search Jooble
async function searchJooble(keyword, location, apiKey) {
  try {
    const response = await fetch(`https://jooble.org/api/${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: keyword, location, ResultOnPage: 20, page: 1 }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.jobs || []).map((job) => ({
      employer: job.company || "Unknown",
      title: job.title || "Unknown Role",
      location: job.location || location,
      url: job.link || null,
      salary: job.salary || null,
      snippet: job.snippet ? job.snippet.slice(0, 200) : null,
      source: "Jooble",
      status: "found",
      sponsorship_mentioned: ["visa", "sponsor", "relocation", "work permit"].some((w) =>
        (job.snippet || "").toLowerCase().includes(w)
      ),
      sponsorship_evidence: null,
      match_percentage: null,
      match_reason: null,
      missing_from_cv: null,
    }));
  } catch { return []; }
}

// Search Adzuna
async function searchAdzuna(keyword, country, appId, appKey) {
  try {
    const countryCode = ADZUNA_COUNTRY[country];
    const url = `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=20&what=${encodeURIComponent(keyword)}&content-type=application/json`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.results || []).map((job) => ({
      employer: job.company?.display_name || "Unknown",
      title: job.title || "Unknown Role",
      location: job.location?.display_name || COUNTRY_MAP[country],
      url: job.redirect_url || null,
      salary: job.salary_min && job.salary_max
        ? `$${Math.round(job.salary_min).toLocaleString()} - $${Math.round(job.salary_max).toLocaleString()} per year`
        : null,
      snippet: job.description ? job.description.slice(0, 200) : null,
      source: "Adzuna",
      status: "found",
      sponsorship_mentioned: ["visa", "sponsor", "relocation", "work permit"].some((w) =>
        (job.description || "").toLowerCase().includes(w)
      ),
      sponsorship_evidence: null,
      match_percentage: null,
      match_reason: null,
      missing_from_cv: null,
    }));
  } catch { return []; }
}

// Combined Jooble + Adzuna search
router.post("/:country/search", async (req, res) => {
  try {
    const country = req.params.country;
    if (!["NZ", "AU"].includes(country)) return res.status(400).json({ error: "country must be NZ or AU" });

    const { cvId, keywords } = req.body;
    if (!cvId) return res.status(400).json({ error: "cvId is required" });

    const joobleKey = process.env.JOOBLE_API_KEY;
    const adzunaAppId = process.env.ADZUNA_APP_ID;
    const adzunaAppKey = process.env.ADZUNA_APP_KEY;

    const { data: cv, error: cvErr } = await supabase.from("cvs").select("*").eq("id", cvId).single();
    if (cvErr) return res.status(404).json({ error: "CV not found" });

    const location = COUNTRY_MAP[country];

    // Get keywords — either from request or auto-extract from CV
    let searchKeywords = keywords?.length ? keywords : await extractKeywords(cv.text_content);

    // Search both platforms in parallel for each keyword
    const allJobs = [];
    const seenUrls = new Set();

    for (const keyword of searchKeywords.slice(0, 4)) {
      const [joobleJobs, adzunaJobs] = await Promise.all([
        joobleKey ? searchJooble(keyword, location, joobleKey) : [],
        adzunaAppId && adzunaAppKey ? searchAdzuna(keyword, country, adzunaAppId, adzunaAppKey) : [],
      ]);

      for (const job of [...joobleJobs, ...adzunaJobs]) {
        if (!job.url || seenUrls.has(job.url)) continue;
        seenUrls.add(job.url);
        allJobs.push(job);
      }
    }

    if (allJobs.length === 0) {
      return res.status(200).json({
        id: null, results: [], cv_title: cv.title,
        created_at: new Date().toISOString(),
        message: "No jobs found. Try different keywords.",
      });
    }

    // Score top 40 jobs against CV
    let scoredJobs = allJobs;
    try {
      const toScore = allJobs.slice(0, 40);
      const { text: scoredRaw } = await callClaude({
        system: `You are a CV matching API. Return ONLY a valid JSON array. No text before or after. Start with [ end with ].

For each job add:
- match_percentage: 0-100
- match_reason: one sentence
- missing_from_cv: array of missing skills/qualifications

Keep ALL original fields. Return ALL jobs with scores.`,
        messages: [{ role: "user", content: `CV:\n${cv.text_content.slice(0, 5000)}\n\nJOBS:\n${JSON.stringify(toScore)}\n\nReturn ONLY JSON array with scores added.` }],
        maxTokens: 8000,
      });
      try { scoredJobs = parseJsonResponse(scoredRaw); }
      catch {
        const match = scoredRaw.match(/\[[\s\S]*\]/);
        if (match) scoredJobs = JSON.parse(match[0]);
      }
    } catch (e) { console.error("Scoring failed:", e.message); }

    // Sort by match percentage
    scoredJobs.sort((a, b) => (b.match_percentage || 0) - (a.match_percentage || 0));

    // Save results
    const { data: saved, error: saveErr } = await supabase.from("search_results").insert({
      id: uuidv4(), country, cv_id: cv.id, cv_title: cv.title,
      employer_list_id: null,
      results_json: JSON.stringify(scoredJobs),
      applied_json: "{}", job_count: scoredJobs.length,
      created_at: new Date().toISOString(),
    }).select().single();

    if (saveErr) return res.status(500).json({ error: saveErr.message });
    await enforceLimit("search_results", "country", country, MAX_RESULTS_PER_COUNTRY, false);

    res.status(201).json({
      ...saved,
      results: scoredJobs,
      applied: {},
      keywords: searchKeywords,
      sources: { jooble: !!joobleKey, adzuna: !!(adzunaAppId && adzunaAppKey) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
