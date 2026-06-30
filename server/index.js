import "dotenv/config";
import express from "express";
import cors from "cors";
import cvRoutes from "./routes/cvs.js";
import employerListRoutes from "./routes/employerLists.js";
import jobRoutes from "./routes/jobs.js";

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN.split(",") }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/cvs", cvRoutes);
app.use("/api/employers", employerListRoutes);
app.use("/api/jobs", jobRoutes);

// Generic error handler (catches anything that slipped through)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️  No ANTHROPIC_API_KEY set — copy .env.example to .env and add your key.");
  }
});
