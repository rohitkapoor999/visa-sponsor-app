import { useState, useRef, useEffect, useCallback } from "react";
import * as api from "../api/client.js";

const STEPS = { IDLE: "idle", EXTRACTING: "extracting", FILTERING: "filtering", REVIEW: "review", SAVING: "saving" };

export default function EmployerListManager({ country, cfg, activeCvId, onListsChange }) {
  const [lists, setLists] = useState([]);
  const [title, setTitle] = useState("");
  const [step, setStep] = useState(STEPS.IDLE);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState(null);
  const [filterResult, setFilterResult] = useState(null); // {profession, key_skills, kept, removed}
  const [searching, setSearching] = useState(false);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getEmployerLists(country);
      setLists(data);
      onListsChange?.(data);
    } catch (e) { setError(e.message); }
  }, [country, onListsChange]);

  useEffect(() => { refresh(); setStep(STEPS.IDLE); setFilterResult(null); setError(null); }, [refresh]);

  // Move a company between kept and removed
  const moveCompany = (company, from, to) => {
    setFilterResult((prev) => ({
      ...prev,
      [from]: prev[from].filter((c) => c.name !== company.name),
      [to]: [...prev[to], { ...company, reason: to === "kept" ? "Manually added by you" : "Manually removed by you" }],
    }));
  };

  const handleUploadAndFilter = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!title.trim()) return setError("Please give this list a title.");
    if (!file) return setError("Please choose a file.");
    if (!activeCvId) return setError("Please select a CV first (in the CV section above) — needed for smart filtering.");

    setError(null);
    setStep(STEPS.EXTRACTING);
    setStatusMsg("Step 1/2: Extracting company names from your file…");

    try {
      const { companies } = await api.extractEmployerList(country, file);
      if (!companies || companies.length === 0) {
        setStep(STEPS.IDLE);
        return setError("No company names found in this file. Try a different format.");
      }

      setStep(STEPS.FILTERING);
      setStatusMsg(`Step 2/2: Filtering ${companies.length} companies against your CV — finding relevant ones…`);

      const result = await api.prefilterEmployers(country, companies, activeCvId);
      setFilterResult(result);
      setStep(STEPS.REVIEW);
      setStatusMsg("");
    } catch (err) {
      setStep(STEPS.IDLE);
      setError(err.message);
    }
  };

  const handleSave = async () => {
    if (!filterResult?.kept?.length) return setError("No companies in the kept list to save.");
    setStep(STEPS.SAVING);
    setError(null);
    try {
      await api.saveEmployerList(country, title.trim(), filterResult.kept, "uploaded");
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      setFilterResult(null);
      setStep(STEPS.IDLE);
      await refresh();
    } catch (err) {
      setStep(STEPS.IDLE);
      setError(err.message);
    }
  };

  const handleAiSearch = async () => {
    setSearching(true); setError(null);
    try {
      await api.aiSearchEmployers(country);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setSearching(false); }
  };

  const handlePin = async (id) => { try { await api.pinEmployerList(country, id); await refresh(); } catch (e) { setError(e.message); } };
  const handleDelete = async (id) => {
    if (!confirm("Delete this employer list?")) return;
    try { await api.deleteEmployerList(country, id); await refresh(); } catch (e) { setError(e.message); }
  };

  const isLoading = [STEPS.EXTRACTING, STEPS.FILTERING, STEPS.SAVING].includes(step);

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "18px 20px", marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: 4 }}>
        🏢 Accredited Employer Lists — {cfg.label} ({lists.length}/5)
      </div>
      <div style={{ fontSize: "0.76rem", color: "#9CA3AF", marginBottom: 14 }}>
        Upload a file with company names — AI will filter relevant ones based on your selected CV before saving.
      </div>

      {/* AI Search button */}
      {step === STEPS.IDLE && (
        <button onClick={handleAiSearch} disabled={searching || lists.length >= 5} style={{
          marginBottom: 12, padding: "9px 16px", borderRadius: 8,
          border: `1px solid ${cfg.color}`, background: cfg.accentLight,
          color: cfg.color, fontWeight: 700, fontSize: "0.83rem",
          cursor: searching || lists.length >= 5 ? "not-allowed" : "pointer",
        }}>
          {searching ? "Searching the web…" : "🔍 AI Web Search for Employers"}
        </button>
      )}

      {/* Upload form */}
      {step === STEPS.IDLE && (
        <form onSubmit={handleUploadAndFilter} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <input type="text" placeholder="List title (e.g. NZ Sponsors List)" value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ flex: "1 1 200px", padding: "9px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: "0.85rem" }} />
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,image/*"
            style={{ fontSize: "0.8rem", flex: "1 1 200px" }} />
          <button type="submit" disabled={lists.length >= 5} style={{
            padding: "9px 18px", borderRadius: 8, border: "none", background: cfg.color,
            color: "#fff", fontWeight: 600, fontSize: "0.85rem",
            cursor: lists.length >= 5 ? "not-allowed" : "pointer", opacity: lists.length >= 5 ? 0.6 : 1,
          }}>
            Upload & Filter
          </button>
        </form>
      )}

      {/* Loading state */}
      {isLoading && (
        <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 10, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #E5E7EB", borderTopColor: cfg.color, animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            <div style={{ fontSize: "0.85rem", color: "#0369A1", fontWeight: 600 }}>{statusMsg}</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Review screen — kept vs removed with move buttons */}
      {step === STEPS.REVIEW && filterResult && (
        <div style={{ marginBottom: 16 }}>
          {/* CV detection summary */}
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#166534", marginBottom: 4 }}>
              ✅ CV detected: {filterResult.profession}
            </div>
            <div style={{ fontSize: "0.78rem", color: "#166534" }}>
              Key skills identified: {(filterResult.key_skills || []).join(", ")}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* Kept list */}
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#059669", marginBottom: 8 }}>
                ✅ Kept ({filterResult.kept?.length || 0}) — click to remove
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {(filterResult.kept || []).map((c, i) => (
                  <div key={i} onClick={() => moveCompany(c, "kept", "removed")} style={{
                    padding: "8px 10px", borderRadius: 8, border: "1px solid #D1FAE5",
                    background: "#ECFDF5", cursor: "pointer",
                  }}>
                    <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#065F46" }}>{c.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "#6B7280", marginTop: 2 }}>{c.reason}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Removed list */}
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#DC2626", marginBottom: 8 }}>
                ❌ Removed ({filterResult.removed?.length || 0}) — click to add back
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {(filterResult.removed || []).map((c, i) => (
                  <div key={i} onClick={() => moveCompany(c, "removed", "kept")} style={{
                    padding: "8px 10px", borderRadius: 8, border: "1px solid #FECACA",
                    background: "#FEF2F2", cursor: "pointer",
                  }}>
                    <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#991B1B" }}>{c.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "#6B7280", marginTop: 2 }}>{c.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ fontSize: "0.75rem", color: "#6B7280", marginBottom: 12 }}>
            💡 Click any company to move it between lists. Once happy, save to proceed to job search.
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSave} style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: cfg.color, color: "#fff", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
            }}>
              ✅ Save {filterResult.kept?.length || 0} Companies & Continue
            </button>
            <button onClick={() => { setStep(STEPS.IDLE); setFilterResult(null); setError(null); }} style={{
              padding: "10px 16px", borderRadius: 8, border: "1px solid #D1D5DB",
              background: "#fff", color: "#6B7280", fontWeight: 600, fontSize: "0.88rem", cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: "#DC2626", fontSize: "0.8rem", marginBottom: 10 }}>{error}</div>}

      {/* Saved lists */}
      {lists.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>No employer lists yet for {cfg.label}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lists.map((list) => (
            <div key={list.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              padding: "10px 12px", borderRadius: 9, border: "1px solid #E5E7EB",
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#111827" }}>
                  {list.title} {list.pinned ? "📌" : ""}
                  {list.source === "ai_search" && (
                    <span style={{ marginLeft: 6, fontSize: "0.68rem", fontWeight: 600, color: "#92400E", background: "#FEF3C7", padding: "1px 7px", borderRadius: 10 }}>AI-compiled</span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: 2 }}>
                  {list.employer_count} employers · {new Date(list.created_at).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => handlePin(list.id)} style={{ fontSize: "0.72rem", padding: "4px 9px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer" }}>
                  {list.pinned ? "Unpin" : "Pin"}
                </button>
                <button onClick={() => handleDelete(list.id)} style={{ fontSize: "0.72rem", padding: "4px 9px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#991B1B", cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
