const sectionStyle = {
  display: "grid",
  gap: "12px",
  padding: "20px 22px",
  borderRadius: "18px",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
};

export default function PrivacyPolicyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
        padding: "clamp(18px, 4vw, 36px)",
      }}
    >
      <div style={{ width: "min(960px, 100%)", margin: "0 auto", display: "grid", gap: "18px" }}>
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#475569" }}>
            Legal
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(30px, 5vw, 44px)", lineHeight: 1.1, color: "#0f172a" }}>
            Privacy Policy
          </h1>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            VaultedShield handles household continuity and financial-document workflows. This page explains the high-level privacy terms for product access, uploaded documents, and account-scoped data handling.
          </div>
          <div style={{ color: "#64748b", fontSize: "14px" }}>Last updated: March 25, 2026</div>
        </div>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Information We Collect</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            VaultedShield may collect account information, household workspace details, uploaded documents, extracted policy data, and operational diagnostics needed to run the platform securely.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>How We Use Information</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            We use submitted information to authenticate users, isolate account-owned data, analyze uploaded documents, generate continuity and policy intelligence, and improve product reliability and security.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Document Handling</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            Uploaded files and extracted policy outputs are intended to stay tied to the authenticated account that created them. During beta, users should still treat the product as an evolving system and validate important records independently.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Security and Retention</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            VaultedShield uses authenticated access controls and account-scoped persistence patterns. Data retention, deletion, export, and operational support practices may change as the product matures.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Contact</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            If you need a production legal review, jurisdiction-specific language, or formal privacy contact handling, replace this beta policy with reviewed counsel-approved language before broader release.
          </div>
        </section>
      </div>
    </div>
  );
}
