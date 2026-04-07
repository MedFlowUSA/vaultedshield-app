export function authInputStyle() {
  return {
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid #cbd5e1",
    background: "rgba(255,255,255,0.96)",
    color: "#0f172a",
    fontSize: "15px",
    boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.04)",
  };
}

export function authActionStyle(primary = false) {
  return {
    padding: "13px 16px",
    borderRadius: "14px",
    border: primary ? "1px solid #0f172a" : "1px solid #cbd5e1",
    background: primary ? "linear-gradient(135deg, #0f172a 0%, #172554 100%)" : "rgba(255,255,255,0.94)",
    color: primary ? "#fff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
    boxShadow: primary ? "0 12px 30px rgba(15, 23, 42, 0.18)" : "0 6px 18px rgba(15, 23, 42, 0.04)",
  };
}
