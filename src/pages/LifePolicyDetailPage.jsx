import { useMemo } from "react";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function surfaceCard(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(226,232,240,0.92)",
    boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
    ...extra,
  };
}

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
  const _heroTone = sortedPolicies.length > 0 ? "good" : loading ? "info" : "warning";
  const heroHeadline =
    sortedPolicies.length > 0
      ? "Your life-policy workflow is ready to use"
      : "Start the first life-policy intake here";
  const heroSummary =
    sortedPolicies.length > 0
      ? `${sortedPolicies.length} saved life polic${sortedPolicies.length === 1 ? "y is" : "ies are"} available for review, comparison, and deeper evidence-backed analysis.`
      : "This guide keeps life-policy intake simple: begin with the baseline policy file, add annual statements, then open the saved policy for deeper review.";

  const heroScore = sortedPolicies.length > 0 ? 82 : 46;

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #312e81 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Life Policy Intelligence
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>{heroHeadline}</div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>{heroSummary}</div>
          </div>
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "grid",
              gap: "4px",
              textAlign: "center",
              minWidth: "100px",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#a5b4fc" }}>{heroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>workflow</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onNavigate?.("/insurance")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#4338ca", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Insurance Intelligence
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/insurance/life/upload")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Life Policy Intake
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/reports")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Reports
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Start Here",
            title: "Open the intake workflow",
            detail: "Use the dedicated life-policy intake when you need to add the baseline policy file, scan pages, or upload annual statements.",
            metric: "Baseline first",
            tone: "info",
            statusLabel: "Guided Action",
            actionLabel: "Open Intake",
            onAction: () => onNavigate?.("/insurance/life/upload"),
          },
          {
            kicker: "What This Produces",
            title: "Build a saved policy you can reopen",
            detail: "Once intake is complete, VaultedShield saves the policy into the main insurance workflow for ranking, comparison, and evidence review.",
            metric: `${sortedPolicies.length} saved`,
            tone: sortedPolicies.length > 0 ? "good" : "warning",
            statusLabel: sortedPolicies.length > 0 ? "Well Supported" : "Needs Review",
            actionLabel: "Open Insurance",
            onAction: () => onNavigate?.("/insurance"),
          },
          {
            kicker: "When You Want Depth",
            title: "Use reports after the packet is built",
            detail: "Reports and policy detail pages still hold the technical comparison, timeline, and evidence layers once the intake is complete.",
            metric: "Deep detail",
            tone: "neutral",
            statusLabel: "Simple Read",
            actionLabel: "Open Reports",
            onAction: () => onNavigate?.("/reports"),
          },
        ].map((tile) => (
          <div
            key={tile.kicker}
            style={{ padding: "20px", borderRadius: "18px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "12px", alignContent: "start" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.kicker}</div>
              <div style={{ ...pillStyle(tile.tone), padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{tile.statusLabel}</div>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{tile.title}</div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{tile.detail}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{tile.metric}</div>
            <button type="button" onClick={tile.onAction} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Start Here</div>
          <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>The real working surfaces are Insurance Intelligence, Life Policy Intake, and Reports.</div>
        </div>
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
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>1. Initial Policy / Illustration Upload</div>
            <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Start with the original illustration or baseline policy PDF so the system can establish carrier, product, issue date, death benefit, and original design assumptions.</div>
          </div>
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
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>2. Annual Statement History Upload</div>
            <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Upload yearly statements separately after the initial policy file so VaultedShield can build trend history, charge visibility, and current performance context.</div>
          </div>
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
        </div>
      </div>

      <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Saved Life Policies</div>
          <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Open a specific saved policy detail page from the current VaultedShield beta shell.</div>
        </div>
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
                style={{ ...actionStyle(false), display: "grid", gap: "6px", textAlign: "left" }}
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
      </div>
    </div>
  );
}
