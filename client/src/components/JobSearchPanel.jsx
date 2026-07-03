import { useState, useEffect, useCallback } from "react";
import * as api from "../api/client.js";
import CostEstimate from "./CostEstimate.jsx";
import { deductCredit, markCreditsDepleted } from "./CreditTracker.jsx";

function MatchBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const color = pct >= 75 ? "#059669" : pct >= 50 ? "#D97706" : "#DC2626";
  const bg = pct >= 75 ? "#D1FAE5" : pct >= 50 ? "#FEF3C7" : "#FEE2E2";
  return <span style={{ background: bg, color, fontWeight: 800, fontSize: "0.78rem", padding: "3px 10px", borderRadius: 20 }}>{pct}% match</span>;
}

function JobCard({ job, index, applied, onToggleApplied, cfg }) {
  const isManual = job.status === "manual_check_needed";
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, opacity: applied ? 0.65 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", flex: 1 }}>
          <input type="checkbox" checked={!!applied} onChange={(e) => onToggleApplied(index, e.target.checked)}
            style={{ marginTop: 4, width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", textDecoration: applied ? "line-through" : "none" }}>
              {job.title || "Role — see employer"}
            </div>
            <div style={{ fontSize: "0.82rem", color: cfg.color, fontWeight: 600, marginTop: 1 }}>{job.employer}</div>
          </div>
        </label>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {job.source === "Jooble" && (
            <span style={{ fontSize: "0.68rem", fontWeight: 700, background: "#EDE9FE", color: "#5B21B6", padding: "2px 7px", borderRadius: 10 }}>Jooble</span>
          )}
          <MatchBadge pct={job.match_percentage} />
        </div>
      </div>

      {isManual ? (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", color: "#92400E" }}>
          ⚠️ Manual check needed — {job.manual_check_reason || "couldn't read their careers page"}.
          {job.url && <> <a href={job.url} target="_blank" rel="noreferrer" style={{ color: "#92400E", fontWeight: 700 }}>Visit careers page →</a></>}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "0.78rem", color: "#6B7280" }}>
            {job.location && <span>📍 {job.location}</span>}
            {job.salary && <span style={{ color: "#059669", fontWeight: 600 }}>💰 {job.salary}</span>}
            {job.sponsorship_mentioned && <span style={{ color: "#059669", fontWeight: 600 }}>✈ Sponsorship indicated</span>}
          </div>
          {job.snippet && <div style={{ fontSize: "0.78rem", color: "#4B5563", fontStyle: "italic" }}>"{job.snippet.slice(0, 200)}..."</div>}
          {job.sponsorship_evidence && <div style={{ fontSize: "0.78rem", color: "#4B5563", fontStyle: "italic" }}>"{job.sponsorship_evidence}"</div>}
          {job.match_reason && <div style={{ fontSize: "0.8rem", color: "#4B5563" }}>{job.match_reason}</div>}
          {job.missing_from_cv && job.missing_from_cv.length > 0 && (
            <div style={{ fontSize: "0.78rem", color: "#991B1B", background: "#FEF2F2", padding: "6px 10px", borderRadius: 7 }}>
              <strong>Missing from your CV:</strong> {job.missing_from_cv.join(", ")}
            </div>
          )}
          {job.url && <a href={job.url} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", color: cfg.color, fontWeight: 700 }}>View / Apply →</a>}
        </>
      )}
    </div>
  );
}

function downloadResults(results, cvTitle) {
  const header = "Employer,Job Title,Location,Match %,Salary,Sponsorship,Source,URL,Missing From CV\n";
  const rows = results.map((j) =>
    `"${(j.employer||"").replace(/"/g,'""')}","${(j.title||"").replace(/"/g,'""')}","${(j.location||"").replace(/"/g,'""')}","${j.match_percentage ?? "N/A"}","${(j.salary||"").replace(/"/g,'""')}","${j.sponsorship_mentioned ? "Yes" : "No"}","${(j.source||"").replace(/"/g,'""')}","${(j.url||"").replace(/"/g,'""')}","${(j.missing_from_cv||[]).join("; ").replace(/"/g,'""')}"`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `job-results-${cvTitle}-${new Date().toLocaleDateString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function JobSearchPanel({ country, cfg, cvs, activeCvId, employerLists }) {
  const [selectedListId, setSelectedListId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(null); // "company" | "jooble"
  const [error, setError] = useState(null);
  const [currentResult, setCurrentResult] = useState(null);
  const [savedResultSets, setSavedResultSets] = useState([]);
  const [joobleKeywords, setJoobleKeywords] = useState("");

  const refreshSaved = useCallback(async () => {
    try { setSavedResultSets(await api.getSearchResultsList(country)); } catch (e) { setError(e.message); }
  }, [country]);

  useEffect(() => { refreshSaved(); setCurrentResult(null); setSelectedListId(""); setError(null); }, [country, refreshSaved]);

  useEffect(() => {
    if (employerLists.length && !employerLists.find((l) => l.id === selectedListId)) {
      setSelectedListId(employerLists[0]?.id || "");
    }
  }, [employerLists, selectedListId]);

  const activeCv = cvs.find((c) => c.id === activeCvId);

  const handleCompanySearch = async () => {
    if (!selectedListId) return setError("Choose an employer list first.");
    if (!activeCvId) return setError("Choose a CV first.");
    setSearching(true); setSearchMode("company"); setError(null);
    try {
      const result = await api.runJobSearch(country, selectedListId, activeCvId);
      deductCredit(0.18, "Career page search + CV matching");
      setCurrentResult(result);
      await refreshSaved();
    } catch (e) {
      if (e.message.includes("credit balance")) markCreditsDepleted();
      setError(e.message);
    }
    finally { setSearching(false); setSearchMode(null); }
  };

  const handleJoobleSearch = async () => {
    if (!activeCvId) return setError("Choose a CV first.");
    setSearching(true); setSearchMode("jooble"); setError(null);
    try {
      const keywords = joobleKeywords.trim()
        ? joobleKeywords.split(",").map((k) => k.trim()).filter(Boolean)
        : [];
      const result = await api.joobleSearch(country, activeCvId, keywords);
      deductCredit(0.11, "Jooble + Adzuna search + CV matching");
      setCurrentResult(result);
      await refreshSaved();
    } catch (e) {
      if (e.message.includes("credit balance")) markCreditsDepleted();
      setError(e.message);
    }
    finally { setSearching(false); setSearchMode(null); }
  };

  const handleToggleApplied = async (jobIndex, applied) => {
    if (!currentResult) return;
    setCurrentResult((prev) => ({ ...prev, applied: { ...prev.applied, [jobIndex]: applied } }));
    try { await api.toggleApplied(country, currentResult.id, jobIndex, applied); } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "18px 20px" }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: 4 }}>
        ✈️ Visa-Sponsored Job Search — {cfg.label}
      </div>
      <div style={{ fontSize: "0.76rem", color: "#9CA3AF", marginBottom: 16 }}>
        Search via your employer list OR search Jooble directly by skills — both score results against your CV.
      </div>

      {/* Search Option 1: Company career pages */}
      <div style={{ background: "#F8FAFC", borderRadius: 10, border: "1px solid #E5E7EB", padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: "0.83rem", color: "#374151", marginBottom: 10 }}>
          Option 1 — Search employer career pages
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)}
            style={{ flex: "1 1 200px", padding: "9px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: "0.85rem" }}>
            <option value="">— Choose employer list —</option>
            {employerLists.map((l) => <option key={l.id} value={l.id}>{l.title} ({l.employer_count} employers)</option>)}
          </select>
          <button onClick={handleCompanySearch} disabled={searching || !selectedListId || !activeCvId}
            style={{
              padding: "10px 18px", borderRadius: 8, border: "none", background: cfg.color, color: "#fff",
              fontWeight: 700, fontSize: "0.85rem", cursor: searching || !selectedListId || !activeCvId ? "not-allowed" : "pointer",
              opacity: searching || !selectedListId || !activeCvId ? 0.6 : 1,
            }}>
            {searching && searchMode === "company" ? "Searching…" : "🔍 Search Career Pages"}
          </button>
        </div>
        <CostEstimate items={[
          { cost: 0.08, label: "AI web search (12 companies)" },
          { cost: 0.10, label: "CV matching up to 15 jobs" },
        ]} />
      </div>

      {/* Search Option 2: Jooble */}
      <div style={{ background: "#F5F3FF", borderRadius: 10, border: "1px solid #DDD6FE", padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: "0.83rem", color: "#5B21B6", marginBottom: 4 }}>
          Option 2 — Search Jooble job board (recommended)
        </div>
        <div style={{ fontSize: "0.76rem", color: "#7C3AED", marginBottom: 10 }}>
          Searches Jooble's live job listings using your CV skills automatically. Optionally add extra keywords.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Optional: add keywords e.g. Genesys, Contact Centre (comma separated)"
            value={joobleKeywords}
            onChange={(e) => setJoobleKeywords(e.target.value)}
            style={{ flex: "1 1 280px", padding: "9px 12px", borderRadius: 8, border: "1px solid #DDD6FE", fontSize: "0.85rem" }}
          />
          <button onClick={handleJoobleSearch} disabled={searching || !activeCvId}
            style={{
              padding: "10px 18px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff",
              fontWeight: 700, fontSize: "0.85rem", cursor: searching || !activeCvId ? "not-allowed" : "pointer",
              opacity: searching || !activeCvId ? 0.6 : 1,
            }}>
            {searching && searchMode === "jooble" ? "Searching Jooble…" : "🟣 Search Jooble + Adzuna"}
          </button>
        </div>
        <CostEstimate items={[
          { cost: 0.01, label: "Keyword extraction from CV" },
          { cost: 0.10, label: "CV matching up to 40 jobs" },
        ]} />
      </div>

      <div style={{ fontSize: "0.8rem", color: activeCv ? "#111827" : "#DC2626", marginBottom: 10 }}>
        Active CV: <strong>{activeCv ? activeCv.title : "None selected — pick one in the CV section above"}</strong>
      </div>

      {error && <div style={{ color: "#DC2626", fontSize: "0.8rem", marginBottom: 10 }}>{error}</div>}

      {searching && (
        <div style={{ textAlign: "center", padding: "30px 0", color: "#6B7280", fontSize: "0.85rem" }}>
          {searchMode === "jooble"
            ? "Searching Jooble for live jobs and scoring against your CV — please wait…"
            : "Searching career pages and scoring matches — this takes 20-60 seconds…"}
        </div>
      )}

      {/* Saved result sets */}
      {savedResultSets.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6B7280", marginBottom: 6 }}>
            Saved searches ({savedResultSets.length}/4):
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {savedResultSets.map((s) => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20,
                border: `1px solid ${currentResult?.id === s.id ? cfg.color : "#E5E7EB"}`,
                background: currentResult?.id === s.id ? cfg.accentLight : "#fff", fontSize: "0.76rem",
              }}>
                <span style={{ cursor: "pointer" }} onClick={() => api.getSearchResult(country, s.id).then(setCurrentResult)}>
                  {s.cv_title} · {new Date(s.created_at).toLocaleDateString()} ({s.job_count})
                </span>
                <span style={{ color: "#DC2626", fontWeight: 700, cursor: "pointer" }}
                  onClick={() => { if (confirm("Delete?")) api.deleteSearchResult(country, s.id).then(refreshSaved); }}>✕</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {currentResult && !searching && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>
              {currentResult.results.length} results for <strong>{currentResult.cv_title}</strong> · {new Date(currentResult.created_at).toLocaleString()}
              <span style={{ marginLeft: 8, fontSize: "0.72rem" }}>✅ = applied</span>
            </div>
            <button onClick={() => downloadResults(currentResult.results, currentResult.cv_title)}
              style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${cfg.color}`, background: cfg.accentLight, color: cfg.color, fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}>
              ⬇ Download Results
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {currentResult.results.map((job, i) => (
              <JobCard key={i} job={job} index={i} applied={currentResult.applied?.[i]} onToggleApplied={handleToggleApplied} cfg={cfg} />
            ))}
          </div>
        </div>
      )}

      {!currentResult && !searching && (
        <div style={{ fontSize: "0.85rem", color: "#9CA3AF", textAlign: "center", padding: "20px 0" }}>
          Choose a search option above and click Search.
        </div>
      )}
    </div>
  );
}
