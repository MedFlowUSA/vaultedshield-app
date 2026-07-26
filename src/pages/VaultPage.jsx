import { useEffect, useMemo, useRef, useState } from "react";
import DocumentTable from "../components/shared/DocumentTable";
import { summarizeVaultModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { listHouseholdDocuments } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const EMPTY_DOCUMENTS = [];

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "alert") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
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

function ActionButton({ label, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: "12px",
        border: primary ? "none" : "1px solid #e2e8f0",
        background: primary ? "#0f172a" : "#ffffff",
        color: primary ? "#ffffff" : "#0f172a",
        fontWeight: 700,
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function VaultPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const registryRef = useRef(null);
  const [documents, setDocuments] = useState(EMPTY_DOCUMENTS);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!householdState.context.householdId) {
      queueMicrotask(() => setDocuments(EMPTY_DOCUMENTS));
      return;
    }
    let active = true;
    async function loadDocuments() {
      const result = await listHouseholdDocuments(householdState.context.householdId);
      if (!active) return;
      setDocuments(result.data || []);
      setLoadError(result.error?.message || "");
    }
    loadDocuments();
    return () => { active = false; };
  }, [householdState.context.householdId]);

  const documentRows = documents.map((doc) => ({
    name: doc.file_name || "Unnamed document",
    role: [doc.assets?.asset_category, doc.assets?.asset_subcategory, doc.document_type].filter(Boolean).join(" / ") || "Household asset document",
    status: doc.processing_status || "uploaded",
    updatedAt: doc.created_at
      ? new Date(doc.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      : "Unknown",
  }));

  const vaultRead = useMemo(() => summarizeVaultModule(documents), [documents]);
  const heroScore = Math.round(
    documents.length > 0
      ? Math.min(90, 36 + documents.length * 3 + Number(vaultRead.metrics.assetLinked || 0) * 5)
      : 24
  );
  const scoreTone = heroScore >= 80 ? "good" : heroScore >= 60 ? "info" : heroScore >= 44 ? "warning" : "alert";
  const storedCount = documents.filter((d) => d.storage_path).length;
  const reviewCount = documents.filter((d) => d.processing_status === "needs_review").length;

  function scrollToRegistry() {
    registryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleVaultTileAction(action) {
    if (action === "registry") {
      scrollToRegistry();
      return;
    }
    if (action === "life-upload") {
      onNavigate?.("/insurance/life/upload");
      return;
    }
    onNavigate?.("/upload-center");
  }

  return (
    <div style={{ display: "grid", gap: "28px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Household Vault
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {documents.length === 0
                ? "Keep the household record in one durable place"
                : vaultRead.status === "Ready"
                  ? "Vault looks well-populated and usable"
                  : "Vault is taking shape — a few core documents still missing"}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "560px" }}>
              {vaultRead.headline}
            </div>
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
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#94a3b8" }}>{heroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>vault score</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "Documents", value: documents.length || "None" },
            { label: "Stored", value: storedCount || 0 },
            { label: "Asset Linked", value: vaultRead.metrics.assetLinked || 0 },
            { label: "Needs Review", value: reviewCount || 0 },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#cbd5e1" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label="Open Upload Center" primary onClick={() => onNavigate?.("/upload-center")} />
          <button
            type="button"
            onClick={() => onNavigate?.("/insurance/life/upload")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Upload Policy Files
          </button>
          <button
            type="button"
            onClick={scrollToRegistry}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            See Registry
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Vault Status",
            title: vaultRead.status === "Ready" ? "Vault looks usable" : "Vault is still building",
            detail: vaultRead.headline,
            metric: `${documents.length} doc${documents.length === 1 ? "" : "s"}`,
            tone: scoreTone,
            statusLabel: vaultRead.status,
            actionLabel: "See Registry",
            action: "registry",
          },
          {
            kicker: "Next Step",
            title: documents.length > 0 ? "Add the next missing core record" : "Upload the first household document",
            detail: vaultRead.notes[0] || "The first useful records matter more than perfect organization.",
            metric: `${reviewCount} review item${reviewCount === 1 ? "" : "s"}`,
            tone: "warning",
            statusLabel: documents.length > 0 ? "Keep Going" : "Get Started",
            actionLabel: "Upload Document",
            action: "upload",
          },
          {
            kicker: "Policy Intelligence",
            title: "Life policy parsing stays in its dedicated path",
            detail: "Specialized IUL and life-policy document intelligence is preserved in the dedicated upload flow — not merged into this vault view.",
            metric: `${vaultRead.metrics.assetLinked || 0} asset-linked`,
            tone: "info",
            statusLabel: "Separate Path",
            actionLabel: "Open IUL Upload",
            action: "life-upload",
          },
        ].map((tile) => (
          <div
            key={tile.kicker}
            style={{
              padding: "20px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: "12px",
              alignContent: "start",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.kicker}</div>
              <div style={{ ...pillStyle(tile.tone), padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{tile.statusLabel}</div>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{tile.title}</div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{tile.detail}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{tile.metric}</div>
            <button type="button" onClick={() => handleVaultTileAction(tile.action)} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Readiness + Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "12px" })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Vault Readiness</div>
            <div style={{ ...pillStyle(scoreTone), padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800 }}>{vaultRead.status}</div>
          </div>
          <div style={{ color: "#475569", lineHeight: "1.7", fontSize: "14px" }}>{vaultRead.headline}</div>
          {vaultRead.notes.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px", color: "#64748b", fontSize: "13px" }}>
              {vaultRead.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : null}
        </div>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "10px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Vault Metrics</div>
          <div style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong style={{ color: "#334155" }}>Stored:</strong> {vaultRead.metrics.stored}</div>
            <div><strong style={{ color: "#334155" }}>Asset-linked:</strong> {vaultRead.metrics.assetLinked}</div>
            <div><strong style={{ color: "#334155" }}>Household-level:</strong> {vaultRead.metrics.householdLevel}</div>
            <div><strong style={{ color: "#334155" }}>Needs review:</strong> {vaultRead.metrics.review}</div>
          </div>
        </div>
      </div>

      {/* Document Register */}
      <div ref={registryRef} style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "18px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Household Document Register</div>
            <div style={{ color: "#64748b", marginTop: "4px", lineHeight: "1.6" }}>Records currently shaping the household vault.</div>
          </div>
          <ActionButton label="Upload Document" primary onClick={() => onNavigate?.("/upload-center")} />
        </div>

        {documentRows.length > 0 ? (
          <DocumentTable rows={documentRows} />
        ) : (
          <div
            style={{
              padding: "36px 32px",
              borderRadius: "16px",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              display: "grid",
              gap: "16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "36px" }}>📂</div>
            <div style={{ display: "grid", gap: "6px" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>No household documents uploaded yet</div>
              <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "440px", margin: "0 auto" }}>
                Good first vault documents: trust or estate document, mortgage statement, insurance declaration page.
              </div>
            </div>
            {loadError ? (
              <div style={{ color: "#991b1b", fontSize: "13px" }}>{loadError}</div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
              <ActionButton label="Open Upload Center" primary onClick={() => onNavigate?.("/upload-center")} />
              <ActionButton label="Upload Policy Files" onClick={() => onNavigate?.("/insurance/life/upload")} />
            </div>
          </div>
        )}

        <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.7", borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
          Specialized life-policy document intelligence remains in the dedicated IUL upload path and is not merged into this table.
          {loadError ? <span style={{ color: "#991b1b" }}> Error: {loadError}</span> : null}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.7" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Documents: {documents.length}
        </div>
      ) : null}
    </div>
  );
}
