import { useMemo } from "react";
import { FriendlyActionTile, FriendlyPageHero } from "../components/shared/FriendlyIntelligenceUI";
import SectionCard from "../components/shared/SectionCard";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";

function actionStyle(primary = false) {
  return {
    padding: "12px 16px",
    borderRadius: "10px",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
  };
}

export default function LifePolicyDetailPage({ onNavigate }) {
  const { savedPolicies, loadingStates, errors } = usePlatformShellData();
  const loading = loadingStates.insurancePortfolio;
  const error = errors.insurancePortfolio;
  const sortedPolicies = useMemo(
    () => [...savedPolicies].sort((left, right) => String(right.last_saved_at || "").localeCompare(String(left.last_saved_at || ""))),
    [savedPolicies]
  );
  const heroTone = sortedPolicies.length > 0 ? "good" : loading ? "info" : "warning";
  const heroHeadline =
    sortedPolicies.length > 0
      ? "Your life-policy workflow is ready to use"
      : "Start the first life-policy intake here";
  const heroSummary =
    sortedPolicies.length > 0
      ? `${sortedPolicies.length} saved life polic${sortedPolicies.length === 1 ? "y is" : "ies are"} available for review, comparison, and deeper evidence-backed analysis.`
      : "This guide keeps life-policy intake simple: begin with the baseline policy file, add annual statements, then open the saved policy for deeper review.";

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <FriendlyPageHero
        eyebrow="Life Policy Intelligence"
        sectionTitle="Life Policy Intake Guide"
        headline={heroHeadline}
        summary={heroSummary}
        transition="Use this as the plain-English entry point into the life-policy workflow. The specialized intake page, policy detail pages, and reports still hold the technical depth underneath."
        actions={[
          {
            label: "Open Insurance Intelligence",
            onClick: () => onNavigate?.("/insurance"),
            kind: "primary",
          },
          {
            label: "Open Life Policy Intake",
            onClick: () => onNavigate?.("/insurance/life/upload"),
          },
          {
            label: "Open Reports",
            onClick: () => onNavigate?.("/reports"),
          },
        ]}
        score={sortedPolicies.length > 0 ? 82 : 46}
        scoreTone={heroTone}
        scoreSubtitle="workflow"
        scoreIconLabel="life policy"
        asideHeadline={sortedPolicies.length > 0 ? "Clear next step" : "Simple starting point"}
        asideSummary={
          sortedPolicies.length > 0
            ? "Open the intake when you need more document support, or open a saved policy when you are ready for deeper analysis."
            : "Bring in the baseline policy file first, then layer annual statements on top so the deeper technical read has enough support."
        }
        glanceEyebrow="At A Glance"
        glanceItems={[
          { label: "Saved policies", value: sortedPolicies.length },
          { label: "Guide purpose", value: "Life-policy intake path" },
          { label: "Best first move", value: sortedPolicies.length > 0 ? "Open saved policy" : "Start intake" },
          { label: "Technical depth", value: "Available underneath" },
        ]}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <FriendlyActionTile
          kicker="Start Here"
          title="Open the intake workflow"
          detail="Use the dedicated life-policy intake when you need to add the baseline policy file, scan pages, or upload annual statements."
          metric="Baseline first"
          tone="info"
          statusLabel="Guided Action"
          actionLabel="Open Intake"
          onAction={() => onNavigate?.("/insurance/life/upload")}
        />
        <FriendlyActionTile
          kicker="What This Produces"
          title="Build a saved policy you can reopen"
          detail="Once intake is complete, VaultedShield saves the policy into the main insurance workflow for ranking, comparison, and evidence review."
          metric={`${sortedPolicies.length} saved`}
          tone={sortedPolicies.length > 0 ? "good" : "warning"}
          statusLabel={sortedPolicies.length > 0 ? "Well Supported" : "Needs Review"}
          actionLabel="Open Insurance"
          onAction={() => onNavigate?.("/insurance")}
        />
        <FriendlyActionTile
          kicker="When You Want Depth"
          title="Use reports after the packet is built"
          detail="Reports and policy detail pages still hold the technical comparison, timeline, and evidence layers once the intake is complete."
          metric="Deep detail"
          tone="neutral"
          statusLabel="Simple Read"
          actionLabel="Open Reports"
          onAction={() => onNavigate?.("/reports")}
        />
      </div>

      <SectionCard
        title="Start Here"
        subtitle="Use the modern shell pages below. This guide explains the path, but the real working surfaces are Insurance Intelligence, Life Policy Intake, and Reports."
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => onNavigate?.("/insurance")} style={actionStyle(true)}>
            Open Insurance Intelligence
          </button>
          <button type="button" onClick={() => onNavigate?.("/insurance/life/upload")} style={actionStyle(false)}>
            Open Life Policy Intake
          </button>
          <button type="button" onClick={() => onNavigate?.("/reports")} style={actionStyle(false)}>
            Open Reports
          </button>
        </div>
      </SectionCard>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "18px",
        }}
      >
        <SectionCard
          title="1. Initial Policy / Illustration Upload"
          subtitle="Start with the original illustration or baseline policy PDF so the system can establish carrier, product, issue date, death benefit, and original design assumptions."
        >
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              Use this first when starting a new life policy file. Best pages usually include the policy summary, illustration summary, and any ledger pages that show policy-year values.
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
              <li>Initial illustration or in-force illustration</li>
              <li>Policy summary / identity page</li>
              <li>Ledger pages if available</li>
            </ul>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => onNavigate?.("/insurance/life/upload")} style={actionStyle(true)}>
                Upload Initial Policy File
              </button>
              <button type="button" onClick={() => onNavigate?.("/insurance")} style={actionStyle(false)}>
                Open Insurance Intelligence
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="2. Annual Statement History Upload"
          subtitle="Upload yearly statements separately after the initial policy file so VaultedShield can build trend history, charge visibility, and current performance context."
        >
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              Add all annual statements you have, oldest to newest if possible. This is what improves policy health reads, cash-value trends, COI visibility, and projected-vs-actual support.
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
              <li>Annual statement summary pages</li>
              <li>Charges / deductions pages</li>
              <li>Allocation / indexed strategy pages</li>
            </ul>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => onNavigate?.("/insurance/life/upload")} style={actionStyle(true)}>
                Upload Yearly Statements
              </button>
              <button type="button" onClick={() => onNavigate?.("/reports")} style={actionStyle(false)}>
                Open Review Reports
              </button>
            </div>
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="Saved Life Policies"
        subtitle="Open a specific saved policy detail page from the current VaultedShield beta shell."
      >
        {loading ? (
          <div style={{ color: "#475569" }}>Loading saved life policies...</div>
        ) : error ? (
          <div style={{ color: "#991b1b" }}>{error}</div>
        ) : sortedPolicies.length === 0 ? (
          <div style={{ color: "#475569" }}>No saved life policies are available yet.</div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {sortedPolicies.map((policy) => (
              <button
                key={policy.id}
                type="button"
                onClick={() => onNavigate?.(`/insurance/${policy.id}`)}
                style={{
                  ...actionStyle(false),
                  display: "grid",
                  gap: "6px",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 700 }}>
                  {policy.product_name || policy.carrier_name || "Saved life policy"}
                </div>
                <div style={{ color: "#475569", fontWeight: 500 }}>
                  {policy.carrier_name || "Carrier pending"} | {policy.policy_type || "Type pending"}
                </div>
                <div style={{ color: "#64748b", fontSize: "13px", fontWeight: 500 }}>
                  Latest statement: {policy.latest_statement_date || "Not resolved"} | Last saved: {policy.last_saved_at || "Unknown"}
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
