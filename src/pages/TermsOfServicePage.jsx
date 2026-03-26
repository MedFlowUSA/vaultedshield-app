const sectionStyle = {
  display: "grid",
  gap: "12px",
  padding: "20px 22px",
  borderRadius: "18px",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
};

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            These terms describe the basic rules for using the VaultedShield beta platform, including account use, document uploads, generated outputs, and product limitations.
          </div>
          <div style={{ color: "#64748b", fontSize: "14px" }}>Last updated: March 25, 2026</div>
        </div>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Use of the Service</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            VaultedShield is provided as a software platform for household continuity, document organization, and policy intelligence workflows. Users are responsible for the accuracy, legality, and authorization of the files and account data they submit.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Beta Product Status</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            The current product is still in beta. Features, data models, analysis outputs, and availability may change without notice. Users should independently verify critical insurance, estate, and financial decisions.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>No Professional Advice</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            VaultedShield does not replace legal, tax, insurance, investment, or estate-planning advice. Platform outputs should be treated as informational workflow support unless separately reviewed by a qualified professional.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Accounts and Access</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            Users are responsible for maintaining secure access credentials and for activity under their accounts. Unauthorized use, abuse of document ingestion features, or attempts to access another user’s data are prohibited.
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#0f172a" }}>Limitations and Liability</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            To the maximum extent allowed by law, the service is provided on an as-available basis during beta. Formal limitation-of-liability, governing-law, dispute, and indemnity language should be reviewed with counsel before broad production rollout.
          </div>
        </section>
      </div>
    </div>
  );
}
