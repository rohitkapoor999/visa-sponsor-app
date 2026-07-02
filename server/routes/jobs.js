import express from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase, enforceLimit } from "../db.js";
import { callClaude, parseJsonResponse } from "../utils/claude.js";

const router = express.Router();
const MAX_RESULTS_PER_COUNTRY = 4;

function countryGuard(req, res, next) {
  if (!["NZ", "AU"].includes(req.params.country)) return res.status(400).json({ error: "country must be NZ or AU" });
  next();
}

router.post("/:country/search", countryGuard, async (req, res) => {
  try {
    const country = req.params.country;
    const countryName = country === "NZ" ? "New Zealand" : "Australia";
    const visaType = country === "NZ" ? "AEWV" : "TSS/ENS";
    const { employerListId, cvId } = req.body;

    if (!employerListId) return res.status(400).json({ error: "employerListId is required" });
    if (!cvId) return res.status(400).json({ error: "cvId is required" });

    const { data: employerList, error: elErr } = await supabase.from("employer_lists").select("*").eq("id", employerListId).eq("country", country).single();
    if (elErr) return res.status(404).json({ error: "Employer list not found" });

    const { data: cv, error: cvErr } = await supabase.from("cvs").select("*").eq("id", cvId).single();
    if (cvErr) return res.status(404).json({ error: "CV not found" });

    const employers = JSON.parse(employerList.employers_json);
    if (!employers || employers.length === 0) return res.status(400).json({ error: "This employer list is empty." });

    const batch = employers.slice(0, 12);
    const employerNames = batch.map((e) => `${e.name}${e.website ? ` (${e.website})` : ""}`).join(", ");

    const { text: jobsRaw } = await callClaude({
      system: `You are a job search API. You MUST return ONLY a valid JSON array. No text before or after. No explanation. No introduction. Start your response with [ and end with ]. Nothing else.

Search each employer's careers page for current job openings that sponsor overseas workers on ${visaType} visa in ${countryName}.

JSON array format — each item must have these exact fields:
[{
  "employer": "string",
  "title": "string",
  "location": "string",
  "url": "string or null",
  "sponsorship_mentioned": true or false,
  "sponsorship_evidence": "string or null",
  "status": "found" or "manual_check_needed",
  "manual_check_reason": "string or null"
}]

If a careers page cannot be accessed, set status to "manual_check_needed". Do NOT write any text outside the JSON array.`,
      messages: [{ role: "user", content: `Search these employers in ${countryName} for current job openings that sponsor overseas workers: ${employerNames}

Return ONLY a JSON array. Start with [ and end with ]. No other text.` }],
      useWebSearch: true,
      maxTokens: 6000,
    });

    // Try to extract JSON even if there's some text around it
    let jobs;
    try {
      jobs = parseJsonResponse(jobsRaw);
    } catch {
      const match = jobsRaw.match(/\[[\s\S]*\]/);
      if (match) {
        jobs = JSON.parse(match[0]);
      } else {
        throw new Error("Could not extract job results. Please try again.");
      }
    }

    const foundJobs = jobs.filter((j) => j.status === "found");
    const manualJobs = jobs.filter((j) => j.status !== "found");

    let scoredJobs = [];
    if (foundJobs.length > 0) {
      const { text: scoredRaw } = await callClaude({
        system: `You are a CV matching API. You MUST return ONLY a valid JSON array. No text before or after. Start with [ and end with ].

Score how well the CV matches each job. Add these fields to each job object:
- match_percentage: number 0-100
- match_reason: short string explaining the score
- missing_from_cv: array of strings listing skills/qualifications the CV is missing for this role

Return ALL the original job fields plus the three new fields above. Start with [ and end with ]. No other text.`,
        messages: [{ role: "user", content: `CV:\n${cv.text_content.slice(0, 6000)}\n\nJOBS TO SCORE:\n${JSON.stringify(foundJobs)}\n\nReturn ONLY a JSON array with match scores added. Start with [ end with ].` }],
        maxTokens: 6000,
      });

      try {
        scoredJobs = parseJsonResponse(scoredRaw);
      } catch {
        const match = scoredRaw.match(/\[[\s\S]*\]/);
        if (match) scoredJobs = JSON.parse(match[0]);
        else scoredJobs = foundJobs.map((j) => ({ ...j, match_percentage: null, match_reason: "Scoring failed", missing_from_cv: [] }));
      }
    }

    const allResults = [
      ...scoredJobs.sort((a, b) => (b.match_percentage || 0) - (a.match_percentage || 0)),
      ...manualJobs.map((j) => ({ ...j, match_percentage: null, match_reason: null, missing_from_cv: null })),
    ];

    const { data: saved, error: saveErr } = await supabase.from("search_results").insert({
      id: uuidv4(), country, cv_id: cv.id, cv_title: cv.title,
      employer_list_id: employerListId, results_json: JSON.stringify(allResults),
      applied_json: "{}", job_count: allResults.length,
      created_at: new Date().toISOString(),
    }).select().single();

    if (saveErr) return res.status(500).json({ error: saveErr.message });
    await enforceLimit("search_results", "country", country, MAX_RESULTS_PER_COUNTRY, false);

    res.status(201).json({ ...saved, results: allResults, applied: {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:country/results", countryGuard, async (req, res) => {
  const { data, error } = await supabase
    .from("search_results")
    .select("id, country, cv_title, created_at, job_count")
    .eq("country", req.params.country)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/:country/results/:id", countryGuard, async (req, res) => {
  const { data, error } = await supabase.from("search_results").select("*").eq("id", req.params.id).eq("country", req.params.country).single();
  if (error) return res.status(404).json({ error: "Result set not found" });
  res.json({ ...data, results: JSON.parse(data.results_json), applied: JSON.parse(data.applied_json) });
});

router.patch("/:country/results/:id/applied", countryGuard, async (req, res) => {
  const { jobIndex, applied } = req.body;
  const { data: row, error: fetchErr } = await supabase.from("search_results").select("applied_json").eq("id", req.params.id).single();
  if (fetchErr) return res.status(404).json({ error: "Result set not found" });
  const appliedMap = JSON.parse(row.applied_json);
  appliedMap[jobIndex] = !!applied;
  const { error } = await supabase.from("search_results").update({ applied_json: JSON.stringify(appliedMap) }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, applied: appliedMap });
});

router.delete("/:country/results/:id", countryGuard, async (req, res) => {
  const { error } = await supabase.from("search_results").delete().eq("id", req.params.id).eq("country", req.params.country);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
