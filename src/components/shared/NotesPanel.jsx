export default function NotesPanel({ notes = [] }) {
  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {notes.map((note) => (
        <div key={note} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.6" }}>
          {note}
        </div>
      ))}
    </div>
  );
}
