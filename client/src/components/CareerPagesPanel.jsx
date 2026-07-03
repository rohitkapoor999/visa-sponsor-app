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

function downloadResults(results) {
  const header = "Employer,Job Title,Location,Match %,Sponsorship,Source,URL,Missing From CV\n";
  const rows = results.map((j) =>
    `"${(j.employer||"").replace(/"/g,'""')}","${(j.title||"").replace(/"/g,'""')}","${(j.location||"").replace(/"/g,'""')}","${j.match_percentage ?? "N/A"}","${j.sponsorship_mentioned ? "Yes" : "No"}","${(j.source||"").replace(/"/g,'""')}","${(j.url||"").replace(/"/g,'""')}","${(j.missing_from_cv||[]).join("; ").replace(/"/g,'""')}"`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `career-page-jobs-${new Date().toLocaleDateString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CareerPagesPanel({ cfg, activeCvId, cvs }) {
  const [pages, setPages] = useState([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [country, setCountry] = useState("NZ");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [results, setResults] = useState(null);
  const [pageResults, setPageResults] = useState([]);
  const [error, setError] = useState(null);
  const [appliedMap, setAppliedMap] = useState({});

  const activeCv = cvs.find((c) => c.id === activeCvId);

  const refresh = useCallback(async () => {
    try { setPages(await api.getCareerPages()); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter a name.");
    if (!url.trim()) return setError("Please enter a URL.");
    setAdding(true); setError(null); setAddResult(null);
    try {
      const data = await api.addCareerPage(name.trim(), url.trim(), country);
      setAddResult(data.accessibility_check);
      setName(""); setUrl("");
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setAdding(false); }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const selectAll = () => setSelectedIds(pages.filter((p) => p.accessible).map((p) => p.id));
  const clearAll = () => setSelectedIds([]);

  const handleFetch = async () => {
    if (selectedIds.length === 0) return setError("Select at least one career page.");
    if (!activeCvId) return setError("Select a CV first.");
    setFetching(true); setError(null); setResults(null); setPageResults([]);
    try {
      const data = await api.fetchCareerPageJobs(selectedIds, activeCvId);
      deductCredit(selectedIds.length * 0.02 + 0.08, `Reading ${selectedIds.length} career page${selectedIds.length > 1 ? "s" : ""} + CV matching`);
      setResults(data.results);
      setPageResults(data.pageResults || []);
      setAppliedMap({});
    } catch (e) {
      if (e.message.includes("credit balance")) markCreditsDepleted();
      setError(e.message);
    }
    finally { setFetching(false); }
  };

  const handlePin = async (id) => {
    try { await api.pinCareerPage(id); await refresh(); } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this career page?")) return;
    try {
      await api.deleteCareerPage(id);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      await refresh();
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "18px 20px", marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: 4 }}>
        🌐 Trusted Career Pages ({pages.length}/500)
      </div>
      <div style={{ fontSize: "0.76rem", color: "#9CA3AF", marginBottom: 14 }}>
        Add publicly accessible company career pages. App verifies each URL is readable, then fetches live jobs and scores them against your CV.
      </div>

      {/* Add URL form */}
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input type="text" placeholder="Name (e.g. ANZ Bank NZ)" value={name} onChange={(e) => setName(e.target.value)}
          style={{ flex: "1 1 160px", padding: "9px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: "0.85rem" }} />
        <input type="url" placeholder="https://careers.company.com/jobs" value={url} onChange={(e) => setUrl(e.target.value)}
          style={{ flex: "2 1 260px", padding: "9px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: "0.85rem" }} />
        <select value={country} onChange={(e) => setCountry(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: "0.85rem" }}>
          <option value="NZ">🇳🇿 NZ</option>
          <option value="AU">🇦🇺 AU</option>
          <option value="BOTH">🌏 Both</option>
        </select>
        <button type="submit" disabled={adding || pages.length >= 500} style={{
          padding: "9px 18px", borderRadius: 8, border: "none", background: "#059669",
          color: "#fff", fontWeight: 600, fontSize: "0.85rem",
          cursor: adding || pages.length >= 500 ? "not-allowed" : "pointer",
          opacity: adding || pages.length >= 500 ? 0.6 : 1,
        }}>
          {adding ? "Checking URL…" : "Add Page"}
        </button>
      </form>

      {/* URL accessibility result */}
      {addResult && (
        <div style={{
          padding: "8px 12px", borderRadius: 8, marginBottom: 10, fontSize: "0.82rem",
          background: addResult.ok ? "#ECFDF5" : "#FEF2F2",
          border: `1px solid ${addResult.ok ? "#BBF7D0" : "#FECACA"}`,
          color: addResult.ok ? "#065F46" : "#991B1B",
        }}>
          {addResult.message}
        </div>
      )}

      {error && <div style={{ color: "#DC2626", fontSize: "0.8rem", marginBottom: 10 }}>{error}</div>}

      {/* Saved pages list */}
      {pages.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "#9CA3AF", marginBottom: 14 }}>No career pages saved yet. Add your first one above.</div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={selectAll} style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer" }}>
              Select All Accessible
            </button>
            <button onClick={clearAll} style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer" }}>
              Clear Selection
            </button>
            <span style={{ fontSize: "0.75rem", color: "#6B7280", alignSelf: "center" }}>
              {selectedIds.length} selected
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
            {pages.map((page) => (
              <div key={page.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 9,
                border: `2px solid ${selectedIds.includes(page.id) ? "#059669" : "#E5E7EB"}`,
                background: selectedIds.includes(page.id) ? "#ECFDF5" : "#fff",
                opacity: page.accessible ? 1 : 0.6,
              }}>
                <input type="checkbox" checked={selectedIds.includes(page.id)}
                  onChange={() => page.accessible && toggleSelect(page.id)}
                  disabled={!page.accessible}
                  style={{ width: 15, height: 15, cursor: page.accessible ? "pointer" : "not-allowed", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.83rem", color: "#111827" }}>
                    {page.name} {page.pinned ? "📌" : ""}
                    <span style={{
                      marginLeft: 6, fontSize: "0.68rem", fontWeight: 600,
                      padding: "1px 7px", borderRadius: 10,
                      background: page.country === "NZ" ? "#E6F7F5" : page.country === "AU" ? "#FFF0EA" : "#F3F4F6",
                      color: page.country === "NZ" ? "#00558B" : page.country === "AU" ? "#FF6B35" : "#374151",
                    }}>
                      {page.country}
                    </span>
                    {!page.accessible && <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "#DC2626" }}>⚠️ Blocked</span>}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#6B7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {page.url}
                    {page.last_fetched_at && ` · Last checked: ${new Date(page.last_fetched_at).toLocaleDateString()} · ${page.job_count} jobs found`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => handlePin(page.id)} style={{ fontSize: "0.68rem", padding: "3px 8px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer" }}>
                    {page.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button onClick={() => handleDelete(page.id)} style={{ fontSize: "0.68rem", padding: "3px 8px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#991B1B", cursor: "pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fetch Jobs button */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={handleFetch} disabled={fetching || selectedIds.length === 0 || !activeCvId} style={{
          padding: "10px 24px", borderRadius: 8, border: "none", background: "#059669",
          color: "#fff", fontWeight: 700, fontSize: "0.88rem",
          cursor: fetching || selectedIds.length === 0 || !activeCvId ? "not-allowed" : "pointer",
          opacity: fetching || selectedIds.length === 0 || !activeCvId ? 0.6 : 1,
        }}>
          {fetching ? "Fetching jobs…" : `🌐 Fetch Jobs from ${selectedIds.length} Page${selectedIds.length !== 1 ? "s" : ""}`}
        </button>
        <CostEstimate items={[
          { cost: 0.00, label: "Page fetching — free" },
          { cost: Math.max(selectedIds.length * 0.02, 0.02), label: `Job extraction (${selectedIds.length} page${selectedIds.length !== 1 ? "s" : ""})` },
          { cost: 0.08, label: "CV matching" },
        ]} />
        <div style={{ fontSize: "0.8rem", color: activeCv ? "#111827" : "#DC2626" }}>
          CV: <strong>{activeCv ? activeCv.title : "None selected"}</strong>
        </div>
      </div>

      {fetching && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#6B7280", fontSize: "0.85rem" }}>
          Reading career pages and scoring jobs against your CV — please wait…
        </div>
      )}

      {/* Page fetch summary */}
      {pageResults.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {pageResults.map((pr, i) => (
            <span key={i} style={{
              fontSize: "0.72rem", padding: "3px 10px", borderRadius: 20, fontWeight: 600,
              background: pr.ok ? "#ECFDF5" : "#FEF2F2",
              color: pr.ok ? "#065F46" : "#991B1B",
              border: `1px solid ${pr.ok ? "#BBF7D0" : "#FECACA"}`,
            }}>
              {pr.ok ? `✅ ${pr.name} (${pr.jobs} jobs)` : `❌ ${pr.name} — ${pr.reason}`}
            </span>
          ))}
        </div>
      )}

      {/* Results */}
      {results && !fetching && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>
              <strong>{results.length}</strong> jobs found · ✅ = applied
            </div>
            {results.length > 0 && (
              <button onClick={() => downloadResults(results)} style={{
                padding: "6px 14px", borderRadius: 8, border: "1px solid #059669",
                background: "#ECFDF5", color: "#059669", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer",
              }}>
                ⬇ Download Results
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div style={{ fontSize: "0.85rem", color: "#9CA3AF", textAlign: "center", padding: "16px 0" }}>
              No jobs found on the selected pages. Try adding more career pages or check if the pages are accessible.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {results.map((job, i) => (
                <div key={i} style={{
                  background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB",
                  padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
                  opacity: appliedMap[i] ? 0.65 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", flex: 1 }}>
                      <input type="checkbox" checked={!!appliedMap[i]}
                        onChange={(e) => setAppliedMap((prev) => ({ ...prev, [i]: e.target.checked }))}
                        style={{ marginTop: 4, width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#111827", textDecoration: appliedMap[i] ? "line-through" : "none" }}>
                          {job.title}
                        </div>
                        <div style={{ fontSize: "0.81rem", color: "#059669", fontWeight: 600, marginTop: 1 }}>{job.employer}</div>
                      </div>
                    </label>
                    <MatchBadge pct={job.match_percentage} />
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "0.78rem", color: "#6B7280" }}>
                    {job.location && <span>📍 {job.location}</span>}
                    {job.source && <span>🌐 {job.source}</span>}
                    {job.sponsorship_mentioned && <span style={{ color: "#059669", fontWeight: 600 }}>✈ Sponsorship indicated</span>}
                  </div>
                  {job.match_reason && <div style={{ fontSize: "0.8rem", color: "#4B5563" }}>{job.match_reason}</div>}
                  {job.missing_from_cv && job.missing_from_cv.length > 0 && (
                    <div style={{ fontSize: "0.78rem", color: "#991B1B", background: "#FEF2F2", padding: "6px 10px", borderRadius: 7 }}>
                      <strong>Missing from your CV:</strong> {job.missing_from_cv.join(", ")}
                    </div>
                  )}
                  {job.url && <a href={job.url} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", color: "#059669", fontWeight: 700 }}>View / Apply →</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
