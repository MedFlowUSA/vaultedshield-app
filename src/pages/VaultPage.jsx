import { useEffect, useMemo, useState } from "react";
import DocumentTable from "../components/shared/DocumentTable";
import EmptyState from "../components/shared/EmptyState";
import {
  FriendlyActionTile,
  FriendlyPageHero,
} from "../components/shared/FriendlyIntelligenceUI";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import { summarizeVaultModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { listHouseholdDocuments } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

const EMPTY_DOCUMENTS = [];

export default function VaultPage({ onNavigate }) {
  const { isTablet } = useResponsiveLayout();
  const householdState = usePlatformHousehold();
  const [documents, setDocuments] = useState([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!householdState.context.householdId) {
      queueMicrotask(() => {
        setDocuments(EMPTY_DOCUMENTS);
      });
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
    return () => {
      active = false;
    };
  }, [householdState.context.householdId]);

  const documentRows = documents.map((document) => ({
    name: document.file_name || "Unnamed document",
    role: [
      document.assets?.asset_category,
      document.assets?.asset_subcategory,
      document.document_type,
    ]
      .filter(Boolean)
      .join(" / ") || "Household asset document",
    status: document.processing_status || "uploaded",
    updatedAt: document.created_at
      ? new Date(document.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "Unknown",
  }));
  const vaultRead = useMemo(() => summarizeVaultModule(documents), [documents]);
  const topRailLayout = isTablet ? "1fr" : "1.35fr 1fr";
  const contentRailLayout = isTablet ? "1fr" : "1.4fr 1fr";
  const vaultHeroScore = Math.round(
    documents.length > 0
      ? Math.min(90, 36 + documents.length * 3 + Number(vaultRead.metrics.assetLinked || 0) * 5)
      : 24
  );
  const vaultHeroTone =
    vaultHeroScore >= 80 ? "good" : vaultHeroScore >= 60 ? "info" : vaultHeroScore >= 44 ? "warning" : "alert";
  const vaultHeroGlanceItems = [
    { label: "Working Household", value: householdState.household?.household_name || "Loading" },
    { label: "Household Documents", value: documents.length },
    { label: "Stored Records", value: documents.filter((item) => item.storage_path).length },
    { label: "Needs Review", value: documents.filter((item) => item.processing_status === "needs_review").length },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <FriendlyPageHero
        eyebrow="Vault"
        sectionTitle="Household Vault"
        headline="Keep the household record in one durable place, then open details only when they matter."
        summary={vaultRead.headline}
        transition="The vault should feel calm first: what is stored, what still needs attention, and where to go next. The deeper document register remains below."
        actions={[
          {
            label: "Open Upload Center",
            onClick: () => onNavigate?.("/upload-center"),
            kind: "primary",
          },
          {
            label: "Upload Policy Files",
            onClick: () => onNavigate?.("/insurance/life/upload"),
          },
        ]}
        score={vaultHeroScore}
        scoreTone={vaultHeroTone}
        scoreSubtitle="vault score"
        scoreIconLabel="vault"
        asideHeadline={documents.length > 0 ? "Household record is taking shape" : "Start with a few core documents"}
        asideSummary={vaultRead.notes[0] || "A few shared records make the broader household picture much easier to trust."}
        glanceItems={vaultHeroGlanceItems}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <FriendlyActionTile
          kicker="Simple Read"
          title={vaultRead.status === "Ready" ? "Vault looks usable" : "Vault is still building"}
          detail={vaultRead.headline}
          metric={`${documents.length} doc${documents.length === 1 ? "" : "s"}`}
          tone={vaultHeroTone}
          statusLabel="Simple Read"
          actionLabel="Open Upload Center"
          onAction={() => onNavigate?.("/upload-center")}
        />
        <FriendlyActionTile
          kicker="Best First Step"
          title={documents.length > 0 ? "Add the next missing core record" : "Upload the first household document"}
          detail={vaultRead.notes[0] || "The first useful records matter more than perfect organization."}
          metric={`${vaultRead.metrics.review || 0} review item${vaultRead.metrics.review === 1 ? "" : "s"}`}
          tone="warning"
          statusLabel="Guided Focus"
          actionLabel="Upload Document"
          onAction={() => onNavigate?.("/upload-center")}
        />
        <FriendlyActionTile
          kicker="What Can Wait"
          title="Specialized parsing stays in module workflows"
          detail="The vault keeps the shared record clean while deeper life-policy intelligence remains in its dedicated path."
          metric={`${vaultRead.metrics.assetLinked || 0} asset-linked`}
          tone="info"
          statusLabel="Building"
          actionLabel="Open IUL Upload"
          onAction={() => onNavigate?.("/insurance/life/upload")}
        />
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: topRailLayout, gap: "18px" }}>
        <SectionCard title="Vault Readiness">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{vaultRead.headline}</div>
              <StatusBadge label={vaultRead.status} tone={vaultRead.status === "Ready" ? "good" : vaultRead.status === "Building" ? "warning" : "alert"} />
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {vaultRead.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Vault Metrics">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Stored:</strong> {vaultRead.metrics.stored}</div>
            <div><strong>Asset-linked:</strong> {vaultRead.metrics.assetLinked}</div>
            <div><strong>Household-level:</strong> {vaultRead.metrics.householdLevel}</div>
            <div><strong>Needs review:</strong> {vaultRead.metrics.review}</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: contentRailLayout, gap: "18px" }}>
        <SectionCard title="Household Document Register" subtitle="The records currently shaping the household vault.">
          {documentRows.length > 0 ? (
            <DocumentTable rows={documentRows} />
          ) : (
            <EmptyState
              title="No household documents uploaded yet"
              description="Upload the first shared household document through the Upload Center to start populating this vault view."
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ color: "#475569", fontSize: "14px", lineHeight: "1.7" }}>
                  Good first vault documents:
                </div>
                <div style={{ display: "grid", gap: "8px", color: "#64748b", fontSize: "14px" }}>
                  <div>Trust or estate document</div>
                  <div>Mortgage or property statement</div>
                  <div>Annual insurance statement or declaration page</div>
                </div>
                {onNavigate ? (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onNavigate("/upload-center")}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Open Upload Center
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate("/insurance/life/upload")}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Upload Policy Files
                    </button>
                  </div>
                ) : null}
              </div>
            </EmptyState>
          )}
        </SectionCard>

        <SectionCard title="Vault Notes">
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            <p style={{ marginTop: 0 }}>
              Shared household documents now have a durable home in the platform vault.
            </p>
            <p>
              Specialized life-policy document intelligence remains preserved in the dedicated IUL path and is not being merged into this table yet.
            </p>
            {loadError ? <p style={{ color: "#991b1b" }}>{loadError}</p> : null}
          </div>
        </SectionCard>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Documents: {documents.length}
        </div>
      ) : null}
    </div>
  );
}
