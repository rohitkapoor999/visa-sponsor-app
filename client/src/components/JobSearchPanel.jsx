import { useState, useEffect, useCallback } from "react";
import * as api from "../api/client.js";

function MatchBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  const color = pct >= 75 ? "#059669" : pct >= 50 ? "#D97706" : "#DC2626";
  const bg = pct >= 75 ? "#D1FAE5" : pct >= 50 ? "#FEF3C7" : "#FEE2E2";
  return (
    <span style={{ background: bg, color, fontWeight: 800, fontSize: "0.78rem", padding: "3px 10px", borderRadius: 20 }}>
      {pct}% match
    </span>
  );
}

function JobCard({ job, index, applied, onToggleApplied, cfg }) {
  const isManual = job.status === "manual_check_needed";
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 8,
      opacity: applied ? 0.65 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", flex: 1 }}>
          <input
            type="checkbox"
            checked={!!applied}
            onChange={(e) => onToggleApplied(index, e.target.checked)}
            style={{ marginTop: 4, width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", textDecoration: applied ? "line-through" : "none" }}>
              {job.title || "Role unclear — see employer"}
            </div>
            <div style={{ fontSize: "0.82rem", color: cfg.color, fontWeight: 600, marginTop: 1 }}>{job.employer}</div>
          </div>
        </label>
        {!isManual && <MatchBadge pct={job.match_percentage} />}
      </div>

      {isManual ? (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", color: "#92400E" }}>
          ⚠️ Manual check needed — {job.manual_check_reason || "couldn't automatically read their careers page"}.
          {job.url && (
            <>
              {" "}
              <a href={job.url} target="_blank" rel="noreferrer" style={{ color: "#92400E", fontWeight: 700 }}>Visit careers page →</a>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "0.78rem", color: "#6B7280" }}>
            {job.location && <span>📍 {job.location}</span>}
            {job.sponsorship_mentioned && <span style={{ color: "#059669", fontWeight: 600 }}>✈ Sponsorship indicated</span>}
          </div>
          {job.sponsorship_evidence && (
            <div style={{ fontSize: "0.78rem", color: "#4B5563", fontStyle: "italic" }}>"{job.sponsorship_evidence}"</div>
          )}
          {job.match_reason && (
            <div style={{ fontSize: "0.8rem", color: "#4B5563" }}>{job.match_reason}</div>
          )}
          {job.missing_from_cv && job.missing_from_cv.length > 0 && (
            <div style={{ fontSize: "0.78rem", color: "#991B1B", background: "#FEF2F2", padding: "6px 10px", borderRadius: 7 }}>
              <strong>Missing from your CV:</strong> {job.missing_from_cv.join(", ")}
            </div>
          )}
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", color: cfg.color, fontWeight: 700, marginTop: 2 }}>
              View posting →
            </a>
          )}
        </>
      )}
    </div>
  );
}

export default function JobSearchPanel({ country, cfg, cvs, activeCvId, employerLists }) {
  const [selectedListId, setSelectedListId] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [currentResult, setCurrentResult] = useState(null);
  const [savedResultSets, setSavedResultSets] = useState([]);

  const refreshSavedSets = useCallback(async () => {
    try {
      const data = await api.getSearchResultsList(country);
      setSavedResultSets(data);
    } catch (e) {
      setError(e.message);
    }
  }, [country]);

  useEffect(() => {
    refreshSavedSets();
    setCurrentResult(null);
    setSelectedListId("");
  }, [country, refreshSavedSets]);

  useEffect(() => {
    if (employerLists.length && !employerLists.find((l) => l.id === selectedListId)) {
      setSelectedListId(employerLists[0]?.id || "");
    }
  }, [employerLists, selectedListId]);

  const activeCv = cvs.find((c) => c.id === activeCvId);

  const handleSearch = async () => {
    if (!selectedListId) return setError("Choose an employer list first.");
    if (!activeCvId) return setError("Choose a CV first (select one in the CV section above).");
    setSearching(true);
    setError(null);
    try {
      const result = await api.runJobSearch(country, selectedListId, activeCvId);
      setCurrentResult(result);
      await refreshSavedSets();
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const handleLoadSaved = async (id) => {
    try {
      const result = await api.getSearchResult(country, id);
      setCurrentResult(result);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggleApplied = async (jobIndex, applied) => {
    if (!currentResult) return;
    // optimistic update
    setCurrentResult((prev) => ({ ...prev, applied: { ...prev.applied, [jobIndex]: applied } }));
    try {
      await api.toggleApplied(country, currentResult.id, jobIndex, applied);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteSaved = async (id) => {
    if (!confirm("Delete this saved search result?")) return;
    try {
      await api.deleteSearchResult(country, id);
      if (currentResult?.id === id) setCurrentResult(null);
      await refreshSavedSets();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "18px 20px" }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: 4 }}>
        ✈️ Visa-Sponsored Job Search — {cfg.label}
      </div>
      <div style={{ fontSize: "0.76rem", color: "#9CA3AF", marginBottom: 14 }}>
        Searches each employer's own careers page live, then scores matches against your selected CV.
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
          style={{ flex: "1 1 220px", padding: "9px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: "0.85rem" }}
        >
          <option value="">— Choose employer list —</option>
          {employerLists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} ({l.employer_count} employers)
            </option>
          ))}
        </select>

        <div style={{ flex: "1 1 220px", fontSize: "0.83rem", color: activeCv ? "#111827" : "#DC2626" }}>
          CV: <strong>{activeCv ? activeCv.title : "None selected — pick one above"}</strong>
        </div>

        <button
          onClick={handleSearch}
          disabled={searching || !selectedListId || !activeCvId}
          style={{
            padding: "10px 20px", borderRadius: 8, border: "none", background: cfg.accent, color: "#fff",
            fontWeight: 700, fontSize: "0.85rem", cursor: searching || !selectedListId || !activeCvId ? "not-allowed" : "pointer",
            opacity: searching || !selectedListId || !activeCvId ? 0.6 : 1,
          }}
        >
          {searching ? "Searching live…" : "🔍 Search Jobs"}
        </button>
      </div>

      {error && <div style={{ color: "#DC2626", fontSize: "0.8rem", marginBottom: 10 }}>{error}</div>}

      {searching && (
        <div style={{ textAlign: "center", padding: "30px 0", color: "#6B7280", fontSize: "0.85rem" }}>
          Searching career pages and scoring matches — this can take 20-40 seconds…
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
                background: currentResult?.id === s.id ? cfg.accentLight : "#fff", fontSize: "0.76rem", cursor: "pointer",
              }}>
                <span onClick={() => handleLoadSaved(s.id)}>
                  {s.cv_title} · {new Date(s.created_at).toLocaleDateString()} ({s.job_count})
                </span>
                <span onClick={() => handleDeleteSaved(s.id)} style={{ color: "#DC2626", fontWeight: 700, cursor: "pointer" }}>✕</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {currentResult && !searching && (
        <div>
          <div style={{ fontSize: "0.8rem", color: "#6B7280", marginBottom: 10 }}>
            {currentResult.results.length} results for <strong>{currentResult.cv_title}</strong> · {new Date(currentResult.created_at).toLocaleString()}
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
          Select an employer list and CV, then run a search.
        </div>
      )}
    </div>
  );
}
