import useResponsiveLayout from "../../lib/ui/useResponsiveLayout";

export default function DocumentTable({ rows = [] }) {
  const { isMobile } = useResponsiveLayout();

  if (isMobile) {
    return (
      <div style={{ display: "grid", gap: "12px" }}>
        {rows.map((row) => (
          <div
            key={`${row.name}-${row.role}`}
            style={{
              padding: "14px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>{row.name}</div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.55" }}>{row.role}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</div>
                <div style={{ marginTop: "4px", color: "#475569" }}>{row.status}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Updated</div>
                <div style={{ marginTop: "4px", color: "#475569" }}>{row.updatedAt}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#64748b", fontSize: "12px" }}>
            <th style={{ padding: "10px 0" }}>Document</th>
            <th style={{ padding: "10px 0" }}>Role</th>
            <th style={{ padding: "10px 0" }}>Status</th>
            <th style={{ padding: "10px 0" }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.name}-${row.role}`} style={{ borderTop: "1px solid #e2e8f0" }}>
              <td style={{ padding: "12px 0", color: "#0f172a" }}>{row.name}</td>
              <td style={{ padding: "12px 0", color: "#475569" }}>{row.role}</td>
              <td style={{ padding: "12px 0", color: "#475569" }}>{row.status}</td>
              <td style={{ padding: "12px 0", color: "#475569" }}>{row.updatedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
