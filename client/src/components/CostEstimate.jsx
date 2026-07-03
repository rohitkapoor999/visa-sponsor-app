export default function CostEstimate({ items }) {
  if (!items || items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + item.cost, 0);
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      background: "#FFFBEB", border: "1px solid #FDE68A",
      borderRadius: 8, padding: "5px 12px", fontSize: "0.78rem",
    }}>
      <span style={{ color: "#92400E", fontWeight: 700 }}>
        💰 ~${total.toFixed(2)} estimated
      </span>
      <span style={{ color: "#B45309" }}>·</span>
      {items.map((item, i) => (
        <span key={i} style={{ color: "#B45309" }}>
          {item.label}
          {i < items.length - 1 && <span style={{ margin: "0 4px", opacity: 0.5 }}>+</span>}
        </span>
      ))}
    </div>
  );
}
