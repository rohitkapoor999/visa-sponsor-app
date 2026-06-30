import express from "express";
import { v4 as uuidv4 } from "uuid";
import db, { enforceLimit } from "../db.js";
import { callClaude, parseJsonResponse } from "../utils/claude.js";

const router = express.Router();
const MAX_RESULTS_PER_COUNTRY = 4;

const JOB_SCHEMA = `Return ONLY a JSON array, no markdown, no explanation, in this exact schema:
[{
  "employer": "Company Name",
  "title": "Job Title",
  "location": "City, Country",
  "url": "direct link to the job posting or careers page, or null",
  "sponsorship_mentioned": true,
  "sponsorship_evidence": "short quote or paraphrase of why this looks sponsorable, or null if uncertain",
  "status": "found" or "manual_check_needed",
  "manual_check_reason": "e.g. 'careers page requires login' or null if status is found"
}]`;

function countryGuard(req, res, next) {
  if (!["NZ", "AU"].includes(req.params.country)) {
    return res.status(400).json({ error: "country must be NZ or AU" });
  }
  next();
}

// POST run a job search across an employer list's career pages, then score matches against a CV
router.post("/:country/search", countryGuard, async (req, res) => {
  try {
    const country = req.params.country;
    const countryName = country === "NZ" ? "New Zealand" : "Australia";
    const { employerListId, cvId } = req.body;

    if (!employerListId) return res.status(400).json({ error: "employerListId is required" });
    if (!cvId) return res.status(400).json({ error: "cvId is required" });

    const employerList = db.data.employer_lists.find((l) => l.id === employerListId && l.country === country);
    if (!employerList) return res.status(404).json({ error: "Employer list not found" });
    const cv = db.data.cvs.find((c) => c.id === cvId);
    if (!cv) return res.status(404).json({ error: "CV not found" });

    const employers = employerList.employers;
    if (!employers || employers.length === 0) return res.status(400).json({ error: "This employer list is empty." });

    const batch = employers.slice(0, 12);
    const employerNames = batch.map((e) => `${e.name}${e.website ? ` (${e.website})` : ""}`).join(", ");

    const { text: jobsRaw } = await callClaude({
      system: `You search the web to find current, live job openings on specific companies' own career pages, prioritizing roles that mention visa sponsorship for overseas workers (${country === "NZ" ? "AEWV" : "TSS/ENS"}). If a careers page can't be accessed or requires login, mark it as manual_check_needed rather than guessing. ${JOB_SCHEMA}`,
      messages: [
        {
          role: "user",
          content: `For these employers in ${countryName}: ${employerNames}\n\nSearch each one's official careers/jobs page for current openings that look likely to sponsor overseas candidates on a work visa. Return up to 15 relevant jobs total across all employers. If you can't find a usable careers page for an employer, include one entry for that employer with status "manual_check_needed".`,
        },
      ],
      useWebSearch: true,
      maxTokens: 4000,
    });
    const jobs = parseJsonResponse(jobsRaw);

    const foundJobs = jobs.filter((j) => j.status === "found");
    const manualJobs = jobs.filter((j) => j.status !== "found");

    let scoredJobs = [];
    if (foundJobs.length > 0) {
      const { text: scoredRaw } = await callClaude({
        system: `You score how well a candidate's CV matches a list of jobs. For each job, return a match_percentage (0-100), a short reason, and a list of what's missing from the CV for that role. Return ONLY a JSON array, no markdown:
[{"employer":"...","title":"...","location":"...","url":"...","sponsorship_mentioned":true,"sponsorship_evidence":"...","match_percentage":0,"match_reason":"short explanation","missing_from_cv":["skill or qualification gaps, empty array if strong match"]}]
Preserve all original fields from the input jobs and add match_percentage, match_reason, missing_from_cv.`,
        messages: [
          {
            role: "user",
            content: `CV CONTENT:\n${cv.text_content.slice(0, 6000)}\n\nJOBS TO SCORE:\n${JSON.stringify(foundJobs)}`,
          },
        ],
        maxTokens: 4000,
      });
      scoredJobs = parseJsonResponse(scoredRaw);
    }

    const allResults = [
      ...scoredJobs.sort((a, b) => (b.match_percentage || 0) - (a.match_percentage || 0)),
      ...manualJobs.map((j) => ({ ...j, match_percentage: null, match_reason: null, missing_from_cv: null })),
    ];

    const newResultSet = {
      id: uuidv4(),
      country,
      cv_id: cv.id,
      cv_title: cv.title,
      employer_list_id: employerListId,
      results: allResults,
      applied: {},
      created_at: new Date().toISOString(),
    };
    db.data.search_results.push(newResultSet);
    await db.write();

    await enforceLimit("search_results", (r) => r.country === country, MAX_RESULTS_PER_COUNTRY, false);

    res.status(201).json(newResultSet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all saved result sets for a country (metadata only)
router.get("/:country/results", countryGuard, (req, res) => {
  const rows = db.data.search_results
    .filter((r) => r.country === req.params.country)
    .map(({ id, country, cv_title, created_at, results }) => ({
      id, country, cv_title, created_at, job_count: results.length,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(rows);
});

// GET a single saved result set, full detail
router.get("/:country/results/:id", countryGuard, (req, res) => {
  const row = db.data.search_results.find((r) => r.id === req.params.id && r.country === req.params.country);
  if (!row) return res.status(404).json({ error: "Result set not found" });
  res.json(row);
});

// PATCH toggle "applied" checkbox for a specific job within a result set
router.patch("/:country/results/:id/applied", countryGuard, async (req, res) => {
  const { jobIndex, applied } = req.body;
  const row = db.data.search_results.find((r) => r.id === req.params.id && r.country === req.params.country);
  if (!row) return res.status(404).json({ error: "Result set not found" });
  row.applied[jobIndex] = !!applied;
  await db.write();
  res.json({ success: true, applied: row.applied });
});

// DELETE a saved result set
router.delete("/:country/results/:id", countryGuard, async (req, res) => {
  const before = db.data.search_results.length;
  db.data.search_results = db.data.search_results.filter((r) => !(r.id === req.params.id && r.country === req.params.country));
  if (db.data.search_results.length === before) return res.status(404).json({ error: "Result set not found" });
  await db.write();
  res.json({ success: true });
});

export default router;
