import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { supabase, enforceLimit } from "../db.js";
import { extractTextFromFile } from "../utils/fileParsers.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MAX_CVS = 5;

router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("cvs")
    .select("id, title, pinned, created_at, text_length")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get("/:id", async (req, res) => {
  const { data, error } = await supabase.from("cvs").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: "CV not found" });
  res.json(data);
});

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "A title is required for the CV." });
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const text = await extractTextFromFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!text || text.length < 20) return res.status(400).json({ error: "Couldn't extract meaningful text from this file. Try a different PDF/DOCX export." });

    const { data, error } = await supabase.from("cvs").insert({
      id: uuidv4(),
      title: title.trim(),
      text_content: text,
      text_length: text.length,
      pinned: false,
      created_at: new Date().toISOString(),
    }).select("id, title, pinned, created_at").single();

    if (error) return res.status(500).json({ error: error.message });
    await enforceLimit("cvs", null, null, MAX_CVS, true);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/pin", async (req, res) => {
  const { data: row, error: fetchErr } = await supabase.from("cvs").select("pinned").eq("id", req.params.id).single();
  if (fetchErr) return res.status(404).json({ error: "CV not found" });
  const { error } = await supabase.from("cvs").update({ pinned: !row.pinned }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ id: req.params.id, pinned: !row.pinned });
});

router.delete("/:id", async (req, res) => {
  const { error } = await supabase.from("cvs").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
