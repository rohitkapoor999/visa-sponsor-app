import express from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../db.js";
import { callClaude, parseJsonResponse } from "../utils/claude.js";

const router = express.Router();
const MAX_CAREER_PAGES = 500;

// Test if a URL is publicly accessible and extract job listings
async function testAndFetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { accessible: false, reason: `Page returned error ${response.status}`, content: null };
    }

    const html = await response.text();

    // Check for login walls
    const loginSignals = ["sign in to", "log in to", "please login", "authentication required", "access denied"];
    const lowerHtml = html.toLowerCase();
    if (loginSignals.some((s) => lowerHtml.includes(s)) && html.length < 5000) {
      return { accessible: false, reason: "Page appears to require login", content: null };
    }

    // Strip HTML tags for cleaner content
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15000);

    return { accessible: true, reason: null, content: text };
  } catch (err) {
    return { accessible: false, reason: `Could not reach page: ${err.message}`, content: null };
  }
}

// Extract jobs from page content using AI
async function extractJobsFromContent(content, pageUrl, pageName) {
  const { text } = await callClaude({
    system: `You extract job listings from webpage text content. Return ONLY a JSON array, no markdown:
[{
  "title": "Job Title",
  "employer": "Company Name",
  "location": "City, Country or null",
  "url": "direct job URL or null",
  "description": "brief description or null",
  "sponsorship_mentioned": true or false
}]
If no jobs found, return an empty array [].`,
    messages: [{
      role: "user",
      content: `Extract all job listings from this careers page content.\nPage: ${pageName} (${pageUrl})\n\nCONTENT:\n${content}`
    }],
    maxTokens: 4000,
  });

  try { return parseJsonResponse(text); }
  catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}

// GET all saved career pages
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("career_pages")
    .select("id, name, url, country, pinned, last_fetched_at, job_count, accessible, created_at")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST add a new career page URL (with accessibility check)
router.post("/", async (req, res) => {
  try {
    const { name, url, country } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "A name is required." });
    if (!url || !url.trim()) return res.status(400).json({ error: "A URL is required." });
    if (!["NZ", "AU", "BOTH"].includes(country)) return res.status(400).json({ error: "country must be NZ, AU, or BOTH." });

    // Check total count
    const { count } = await supabase.from("career_pages").select("id", { count: "exact", head: true });
    if (count >= MAX_CAREER_PAGES) {
      return res.status(400).json({ error: `Maximum of ${MAX_CAREER_PAGES} career pages reached. Delete some to add more.` });
    }

    // Test accessibility
    const { accessible, reason } = await testAndFetchPage(url.trim());

    const { data, error } = await supabase.from("career_pages").insert({
      id: uuidv4(),
      name: name.trim(),
      url: url.trim(),
      country,
      pinned: false,
      accessible,
      job_count: 0,
      created_at: new Date().toISOString(),
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json({
      ...data,
      accessibility_check: accessible
        ? { ok: true, message: "✅ Page is accessible and can be read automatically." }
        : { ok: false, message: `❌ ${reason}` },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST fetch jobs from selected career pages and score against CV
router.post("/fetch-jobs", async (req, res) => {
  try {
    const { pageIds, cvId } = req.body;
    if (!pageIds || pageIds.length === 0) return res.status(400).json({ error: "Select at least one career page." });
    if (!cvId) return res.status(400).json({ error: "cvId is required." });

    const { data: cv, error: cvErr } = await supabase.from("cvs").select("*").eq("id", cvId).single();
    if (cvErr) return res.status(404).json({ error: "CV not found." });

    const { data: pages, error: pagesErr } = await supabase.from("career_pages").select("*").in("id", pageIds);
    if (pagesErr) return res.status(500).json({ error: pagesErr.message });

    const allJobs = [];
    const pageResults = [];

    for (const page of pages) {
      const { accessible, reason, content } = await testAndFetchPage(page.url);

      if (!accessible) {
        pageResults.push({ id: page.id, name: page.name, ok: false, reason, jobs: 0 });
        await supabase.from("career_pages").update({ accessible: false, last_fetched_at: new Date().toISOString() }).eq("id", page.id);
        continue;
      }

      const jobs = await extractJobsFromContent(content, page.url, page.name);
      const jobsWithSource = jobs.map((j) => ({
        ...j,
        employer: j.employer || page.name,
        source: page.name,
        status: "found",
        match_percentage: null,
        match_reason: null,
        missing_from_cv: null,
      }));

      allJobs.push(...jobsWithSource);
      pageResults.push({ id: page.id, name: page.name, ok: true, jobs: jobs.length });
      await supabase.from("career_pages").update({
        accessible: true,
        job_count: jobs.length,
        last_fetched_at: new Date().toISOString(),
      }).eq("id", page.id);
    }

    if (allJobs.length === 0) {
      return res.json({ results: [], pageResults, cv_title: cv.title, created_at: new Date().toISOString() });
    }

    // Score jobs against CV
    let scoredJobs = allJobs;
    try {
      const { text: scoredRaw } = await callClaude({
        system: `You are a CV matching API. Return ONLY a valid JSON array. Start with [ end with ].
For each job add:
- match_percentage: 0-100
- match_reason: one sentence
- missing_from_cv: array of missing skills/qualifications
Keep ALL original fields.`,
        messages: [{
          role: "user",
          content: `CV:\n${cv.text_content.slice(0, 5000)}\n\nJOBS:\n${JSON.stringify(allJobs.slice(0, 40))}\n\nReturn ONLY JSON array with scores.`
        }],
        maxTokens: 8000,
      });

      try { scoredJobs = parseJsonResponse(scoredRaw); }
      catch {
        const match = scoredRaw.match(/\[[\s\S]*\]/);
        if (match) scoredJobs = JSON.parse(match[0]);
      }
    } catch (e) { console.error("Scoring failed:", e.message); }

    scoredJobs.sort((a, b) => (b.match_percentage || 0) - (a.match_percentage || 0));

    res.json({ results: scoredJobs, pageResults, cv_title: cv.title, created_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH toggle pin
router.patch("/:id/pin", async (req, res) => {
  const { data: row, error: fetchErr } = await supabase.from("career_pages").select("pinned").eq("id", req.params.id).single();
  if (fetchErr) return res.status(404).json({ error: "Not found" });
  const { error } = await supabase.from("career_pages").update({ pinned: !row.pinned }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ id: req.params.id, pinned: !row.pinned });
});

// DELETE a career page
router.delete("/:id", async (req, res) => {
  const { error } = await supabase.from("career_pages").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
