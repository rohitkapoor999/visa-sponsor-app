import { useState, useRef, useEffect, useCallback } from "react";
import * as api from "../api/client.js";

export default function EmployerListManager({ country, cfg, onListsChange }) {
  const [lists, setLists] = useState([]);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getEmployerLists(country);
      setLists(data);
      onListsChange?.(data);
    } catch (e) {
      setError(e.message);
    }
  }, [country, onListsChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!title.trim()) return setError("Please give this list a title.");
    if (!file) return setError("Please choose a file (Excel, CSV, PDF, Word, or image).");

    setUploading(true);
    setError(null);
    try {
      await api.uploadEmployerList(country, title.trim(), file);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAiSearch = async () => {
    setSearching(true);
    setError(null);
    try {
      await api.aiSearchEmployers(country);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const handlePin = async (id) => {
    try {
      await api.pinEmployerList(country, id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this employer list?")) return;
    try {
      await api.deleteEmployerList(country, id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "18px 20px", marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: 4 }}>
        🏢 Accredited Employer Lists — {cfg.label} ({lists.length}/5)
      </div>
      <div style={{ fontSize: "0.76rem", color: "#9CA3AF", marginBottom: 14 }}>
        Upload your own list, or let AI compile one from web search (clearly labeled, always verify before relying on it).
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={handleAiSearch}
          disabled={searching || lists.length >= 5}
          style={{
            padding: "9px 16px", borderRadius: 8, border: `1px solid ${cfg.color}`, background: searching ? "#F3F4F6" : cfg.accentLight,
            color: cfg.color, fontWeight: 700, fontSize: "0.83rem", cursor: searching || lists.length >= 5 ? "not-allowed" : "pointer",
          }}
        >
          {searching ? "Searching the web…" : "🔍 AI Web Search for Employers"}
        </button>
      </div>

      <form onSubmit={handleUpload} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          type="text"
          placeholder="List title (e.g. My LinkedIn export)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: "1 1 220px", padding: "9px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: "0.85rem" }}
        />
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,image/*" style={{ fontSize: "0.8rem", flex: "1 1 220px" }} />
        <button
          type="submit"
          disabled={uploading || lists.length >= 5}
          style={{
            padding: "9px 18px", borderRadius: 8, border: "none", background: cfg.color, color: "#fff",
            fontWeight: 600, fontSize: "0.85rem", cursor: uploading || lists.length >= 5 ? "not-allowed" : "pointer",
            opacity: uploading || lists.length >= 5 ? 0.6 : 1,
          }}
        >
          {uploading ? "Processing…" : "Upload List"}
        </button>
      </form>

      {lists.length >= 5 && (
        <div style={{ fontSize: "0.78rem", color: "#9CA3AF", marginBottom: 10 }}>
          5 lists saved (max for {cfg.label}). Pin important ones, or oldest unpinned will rotate out.
        </div>
      )}

      {error && <div style={{ color: "#DC2626", fontSize: "0.8rem", marginBottom: 10 }}>{error}</div>}

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
                    <span style={{ marginLeft: 6, fontSize: "0.68rem", fontWeight: 600, color: "#92400E", background: "#FEF3C7", padding: "1px 7px", borderRadius: 10 }}>
                      AI-compiled
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: 2 }}>
                  {list.employer_count} employers · Last updated {new Date(list.created_at).toLocaleString()}
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
