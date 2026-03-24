export default function DocumentTable({ rows = [] }) {
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
