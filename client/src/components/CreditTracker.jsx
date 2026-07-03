import { useState, useEffect } from "react";

const STORAGE_KEY = "visa_app_credits";
const TOPUP_AMOUNT = 5.00;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    remaining: TOPUP_AMOUNT,
    spent: 0,
    depleted: false,
    history: [],
    sessionStart: new Date().toISOString(),
  };
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// Global credit tracker - accessible from outside this component
let _setState = null;
let _state = loadState();

export function deductCredit(amount, label) {
  _state = {
    ..._state,
    spent: Math.min(parseFloat((_state.spent + amount).toFixed(4)), TOPUP_AMOUNT),
    remaining: Math.max(parseFloat((_state.remaining - amount).toFixed(4)), 0),
  };
  saveState(_state);
  if (_setState) _setState({ ..._state });
}

export function markCreditsDepleted() {
  const sessionConsumed = parseFloat(_state.spent.toFixed(2));
  const newHistory = [
    {
      date: new Date().toLocaleString(),
      consumed: sessionConsumed,
      actions: _state.spent > 0 ? "Session ended — credits ran out" : "Credits ran out",
    },
    ..._state.history.slice(0, 9),
  ];
  _state = {
    ..._state,
    remaining: 0,
    depleted: true,
    history: newHistory,
  };
  saveState(_state);
  if (_setState) _setState({ ..._state });
}

export default function CreditTracker() {
  const [state, setState] = useState(_state);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    _setState = setState;
    return () => { _setState = null; };
  }, []);

  const handleTopUp = () => {
    const sessionConsumed = parseFloat(state.spent.toFixed(2));
    const newHistory = sessionConsumed > 0 ? [
      {
        date: new Date().toLocaleString(),
        consumed: sessionConsumed,
        actions: "Session summary before top-up",
      },
      ...state.history.slice(0, 9),
    ] : state.history;

    const newState = {
      remaining: TOPUP_AMOUNT,
      spent: 0,
      depleted: false,
      history: newHistory,
      sessionStart: new Date().toISOString(),
    };
    _state = newState;
    saveState(newState);
    setState(newState);
  };

  const pct = Math.max(0, Math.min(100, (state.remaining / TOPUP_AMOUNT) * 100));
  const barColor = pct > 50 ? "#059669" : pct > 20 ? "#D97706" : "#DC2626";

  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB",
      padding: "14px 18px", marginBottom: 18,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        {/* Left: credit balance */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#111827" }}>💳 API Credit Tracker</span>
            {state.depleted && (
              <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#FEE2E2", color: "#DC2626", padding: "2px 8px", borderRadius: 20 }}>
                DEPLETED
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ background: "#F3F4F6", borderRadius: 20, height: 8, marginBottom: 6, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 20, transition: "width 0.3s" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
            <span style={{ color: "#6B7280" }}>
              Spent: <strong style={{ color: "#111827" }}>${state.spent.toFixed(3)}</strong>
            </span>
            <span style={{ color: "#6B7280" }}>
              Remaining: <strong style={{ color: barColor }}>${state.remaining.toFixed(3)}</strong> of $5.00
            </span>
          </div>
        </div>

        {/* Right: buttons */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {state.history.length > 0 && (
            <button onClick={() => setShowHistory(!showHistory)} style={{
              fontSize: "0.75rem", padding: "5px 10px", borderRadius: 6,
              border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", color: "#6B7280",
            }}>
              {showHistory ? "Hide history" : `History (${state.history.length})`}
            </button>
          )}
          <button onClick={handleTopUp} style={{
            fontSize: "0.78rem", padding: "6px 14px", borderRadius: 8,
            border: "none", background: "#059669", color: "#fff",
            fontWeight: 700, cursor: "pointer",
          }}>
            ✅ I topped up $5
          </button>
          <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer"
            style={{ fontSize: "0.75rem", padding: "5px 10px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer", color: "#6B7280", textDecoration: "none" }}>
            Check balance →
          </a>
        </div>
      </div>

      {/* Depleted alert */}
      {state.depleted && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginTop: 10, fontSize: "0.82rem", color: "#991B1B" }}>
          <strong>Credits ran out.</strong> Total consumed this session: <strong>${state.history[0]?.consumed?.toFixed(2) || state.spent.toFixed(2)}</strong>
          {" "}· Go to <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" style={{ color: "#991B1B", fontWeight: 700 }}>Anthropic billing</a> to top up $5, then click "I topped up $5" above.
        </div>
      )}

      {/* Free features info */}
      <div style={{ marginTop: 10, fontSize: "0.75rem", color: "#6B7280" }}>
        <strong style={{ color: "#059669" }}>✅ Always free:</strong> CV upload · File extraction · Skip filter · Download CSV · Adding career page URLs · Viewing saved lists
        {" · "}
        <strong style={{ color: "#D97706" }}>💰 Costs credits:</strong> AI filtering · Job search · CV matching
      </div>

      {/* History */}
      {showHistory && state.history.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid #E5E7EB", paddingTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", color: "#6B7280", marginBottom: 6 }}>Top-up history:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {state.history.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#6B7280", padding: "4px 0", borderBottom: "0.5px solid #F3F4F6" }}>
                <span>{h.date} · {h.actions}</span>
                <span style={{ fontWeight: 700, color: "#111827" }}>consumed ${h.consumed?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
