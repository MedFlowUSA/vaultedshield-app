import AccessValuePreview from "./AccessValuePreview";
import PageHeader from "../layout/PageHeader";

function AuthHero({ eyebrow, title, description }) {
  return (
    <div
      style={{
        padding: "clamp(22px, 4vw, 30px)",
        borderRadius: "28px",
        background: "linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(239,246,255,0.96) 100%)",
        border: "1px solid rgba(191, 219, 254, 0.9)",
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
        backdropFilter: "blur(10px)",
      }}
    >
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
    </div>
  );
}

export function AuthPrimaryShell({ title, subtitle, children }) {
  return (
    <div
      style={{
        padding: "1px",
        borderRadius: "24px",
        background: "linear-gradient(180deg, rgba(191,219,254,0.95) 0%, rgba(219,234,254,0.6) 100%)",
        boxShadow: "0 22px 50px rgba(15, 23, 42, 0.08)",
      }}
    >
      <section
        style={{
          background: "#ffffff",
          border: "1px solid transparent",
          borderRadius: "16px",
          padding: "clamp(16px, 4vw, 20px)",
          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
          minWidth: 0,
          overflowX: "clip",
        }}
      >
        <div style={{ marginBottom: "16px", minWidth: 0 }}>
          <h3 style={{ margin: 0, color: "#0f172a", fontSize: "clamp(1.05rem, 2.8vw, 1.35rem)", lineHeight: "1.3", wordBreak: "break-word" }}>
            {title}
          </h3>
          {subtitle ? (
            <p style={{ marginTop: "6px", marginBottom: 0, color: "#64748b", lineHeight: "1.6", maxWidth: "68ch", wordBreak: "break-word" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </section>
    </div>
  );
}

export function AuthSupportTiles({ items = [] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: "14px 16px",
            borderRadius: "18px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.96) 100%)",
            border: "1px solid rgba(191,219,254,0.9)",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
            display: "grid",
            gap: "6px",
          }}
        >
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {item.label}
          </div>
          <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: "1.5" }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function AuthPortalLayout({
  eyebrow,
  title,
  description,
  previewTitle,
  previewSubtitle,
  left,
  right = null,
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(191,219,254,0.8) 0%, rgba(239,246,255,0.7) 26%, rgba(248,250,252,0.92) 56%, rgba(255,255,255,1) 100%)",
      }}
    >
      <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "clamp(28px, 6vw, 72px) 20px", display: "grid", gap: "28px" }}>
        <AuthHero eyebrow={eyebrow} title={title} description={description} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "20px", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "18px" }}>{left}</div>
          {right || (
            <AccessValuePreview
              title={previewTitle}
              subtitle={previewSubtitle}
              compact
            />
          )}
        </div>
      </div>
    </div>
  );
}
