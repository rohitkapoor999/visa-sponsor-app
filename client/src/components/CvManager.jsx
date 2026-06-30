import { useState, useRef } from "react";
import * as api from "../api/client.js";

export default function CvManager({ cvs, activeCvId, setActiveCvId, onChange }) {
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!title.trim()) return setError("Please give this CV a title.");
    if (!file) return setError("Please choose a PDF or DOCX file.");

    setUploading(true);
    setError(null);
    try {
      const saved = await api.uploadCv(title.trim(), file);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      setActiveCvId(saved.id);
      onChange();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePin = async (id) => {
    try {
      await api.pinCv(id);
      onChange();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this CV? This can't be undone.")) return;
    try {
      await api.deleteCv(id);
      onChange();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "18px 20px", marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: 12 }}>
        📄 Your CVs ({cvs.length}/5)
      </div>

      {/* Upload form */}
      <form onSubmit={handleUpload} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          type="text"
          placeholder="CV title (e.g. Software Engineer CV)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: "1 1 220px", padding: "9px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: "0.85rem" }}
        />
        <input ref={fileRef} type="file" accept=".pdf,.docx" style={{ fontSize: "0.8rem", flex: "1 1 200px" }} />
        <button
          type="submit"
          disabled={uploading || cvs.length >= 5}
          style={{
            padding: "9px 18px", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff",
            fontWeight: 600, fontSize: "0.85rem", cursor: uploading || cvs.length >= 5 ? "not-allowed" : "pointer",
            opacity: uploading || cvs.length >= 5 ? 0.6 : 1,
          }}
        >
          {uploading ? "Uploading…" : "Upload CV"}
        </button>
      </form>

      {cvs.length >= 5 && (
        <div style={{ fontSize: "0.78rem", color: "#9CA3AF", marginBottom: 10 }}>
          You have 5 CVs saved (the max). Delete or pin one to make room, or unpinned oldest will auto-rotate.
        </div>
      )}

      {error && <div style={{ color: "#DC2626", fontSize: "0.8rem", marginBottom: 10 }}>{error}</div>}

      {/* CV list */}
      {cvs.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>No CVs uploaded yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cvs.map((cv) => (
            <div
              key={cv.id}
              onClick={() => setActiveCvId(cv.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                padding: "10px 12px", borderRadius: 9, cursor: "pointer",
                border: `2px solid ${activeCvId === cv.id ? "#2563EB" : "#E5E7EB"}`,
                background: activeCvId === cv.id ? "#EFF6FF" : "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {activeCvId === cv.id && <span style={{ fontSize: "0.75rem" }}>✅</span>}
                <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#111827" }}>{cv.title}</span>
                {cv.pinned ? <span title="Pinned">📌</span> : null}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePin(cv.id); }}
                  style={{ fontSize: "0.72rem", padding: "4px 9px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer" }}
                >
                  {cv.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(cv.id); }}
                  style={{ fontSize: "0.72rem", padding: "4px 9px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#991B1B", cursor: "pointer" }}
                >
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
