import { useMemo } from "react";
import PageHeader from "../components/layout/PageHeader";
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

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <PageHeader
        eyebrow="Life Policy Intelligence"
        title="Life Policy Workflow Guide"
        description="This page is the workflow guide for life-policy analysis in VaultedShield. Use it to understand where uploads, policy review, and reports fit without duplicating the main insurance workspace."
      />

      <SectionCard
        title="Start Here"
        subtitle="Use the modern shell pages below. This guide explains the path, but the real working surfaces are Insurance Intelligence, Life Policy Upload, and Reports."
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => onNavigate?.("/insurance")} style={actionStyle(true)}>
            Open Insurance Intelligence
          </button>
          <button type="button" onClick={() => onNavigate?.("/insurance/life/upload")} style={actionStyle(false)}>
            Upload New Policy Documents
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
