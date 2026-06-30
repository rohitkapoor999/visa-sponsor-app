import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import db, { enforceLimit } from "../db.js";
import { extractTextFromFile } from "../utils/fileParsers.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const MAX_CVS = 5;

// GET all saved CVs (metadata only, no full text, to keep payload light)
router.get("/", (req, res) => {
  const rows = db.data.cvs
    .map(({ id, title, pinned, created_at, text_content }) => ({
      id, title, pinned, created_at, text_length: text_content.length,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(rows);
});

// GET single CV with full text
router.get("/:id", (req, res) => {
  const row = db.data.cvs.find((c) => c.id === req.params.id);
  if (!row) return res.status(404).json({ error: "CV not found" });
  res.json(row);
});

// POST upload a new CV (PDF or DOCX)
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "A title is required for the CV." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const text = await extractTextFromFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!text || text.length < 20) {
      return res.status(400).json({ error: "Couldn't extract meaningful text from this file. Try a different PDF/DOCX export." });
    }

    const newCv = {
      id: uuidv4(),
      title: title.trim(),
      text_content: text,
      pinned: false,
      created_at: new Date().toISOString(),
    };
    db.data.cvs.push(newCv);
    await db.write();

    await enforceLimit("cvs", () => true, MAX_CVS, true);

    res.status(201).json({ id: newCv.id, title: newCv.title, pinned: newCv.pinned, created_at: newCv.created_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH toggle pin
router.patch("/:id/pin", async (req, res) => {
  const row = db.data.cvs.find((c) => c.id === req.params.id);
  if (!row) return res.status(404).json({ error: "CV not found" });
  row.pinned = !row.pinned;
  await db.write();
  res.json({ id: row.id, pinned: row.pinned });
});

// DELETE a CV
router.delete("/:id", async (req, res) => {
  const before = db.data.cvs.length;
  db.data.cvs = db.data.cvs.filter((c) => c.id !== req.params.id);
  if (db.data.cvs.length === before) return res.status(404).json({ error: "CV not found" });
  await db.write();
  res.json({ success: true });
});

export default router;
