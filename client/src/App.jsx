import { useEffect, useState, useCallback } from "react";
import * as api from "./api/client.js";
import CvManager from "./components/CvManager.jsx";
import EmployerListManager from "./components/EmployerListManager.jsx";
import JobSearchPanel from "./components/JobSearchPanel.jsx";

const COUNTRY_CONFIG = {
  NZ: { label: "New Zealand", flag: "🇳🇿", color: "#00558B", accent: "#00A693", accentLight: "#E6F7F5", visaType: "Accredited Employer Work Visa (AEWV)" },
  AU: { label: "Australia", flag: "🇦🇺", color: "#1B3A6B", accent: "#FF6B35", accentLight: "#FFF0EA", visaType: "Employer Nomination Scheme / TSS Visa" },
};

export default function App() {
  const [country, setCountry] = useState("NZ");
  const [cvs, setCvs] = useState([]);
  const [activeCvId, setActiveCvId] = useState(null);
  const [employerLists, setEmployerLists] = useState([]);
  const [globalError, setGlobalError] = useState(null);

  const cfg = COUNTRY_CONFIG[country];

  const refreshCvs = useCallback(async () => {
    try {
      const data = await api.getCvs();
      setCvs(data);
      if (data.length && !data.find((c) => c.id === activeCvId)) {
        setActiveCvId(data[0].id);
      }
    } catch (e) {
      setGlobalError(e.message);
    }
  }, [activeCvId]);

  useEffect(() => {
    refreshCvs();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: `linear-gradient(135deg, ${cfg.color} 0%, ${cfg.accent} 100%)`, padding: "28px 24px 24px", color: "#fff" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.13em", opacity: 0.7, textTransform: "uppercase", marginBottom: 5 }}>
            Work Visa Navigator
          </div>
          <h1 style={{ margin: 0, fontSize: "1.65rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
            {cfg.flag} {cfg.label} Sponsorship Hub
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "22px 16px" }}>
        {/* Country switcher */}
        <div style={{ display: "flex", background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 4, marginBottom: 18, gap: 4 }}>
          {Object.entries(COUNTRY_CONFIG).map(([code, c]) => (
            <button key={code} onClick={() => setCountry(code)} style={{
              flex: 1, padding: "10px 0", borderRadius: 9, border: "none", fontWeight: 700, fontSize: "0.88rem",
              cursor: "pointer", background: country === code ? c.color : "transparent", color: country === code ? "#fff" : "#6B7280",
            }}>
              {c.flag} {c.label}
            </button>
          ))}
        </div>

        {globalError && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "14px 18px", color: "#991B1B", fontSize: "0.85rem", marginBottom: 16 }}>
            <strong>Connection issue:</strong> {globalError} — make sure the backend server is running.
          </div>
        )}

        <CvManager cvs={cvs} activeCvId={activeCvId} setActiveCvId={setActiveCvId} onChange={refreshCvs} />

        <EmployerListManager country={country} cfg={cfg} onListsChange={setEmployerLists} />

        <JobSearchPanel country={country} cfg={cfg} cvs={cvs} activeCvId={activeCvId} employerLists={employerLists} />
      </div>
    </div>
  );
}
