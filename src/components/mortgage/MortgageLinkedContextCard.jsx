import EmptyState from "../shared/EmptyState";
import StatusBadge from "../shared/StatusBadge";
import {
  buildLinkedRecordFallbackRow,
  dedupeLinkedContextRows,
  formatCompletenessScore,
  formatConfidenceLabel,
  getCompletenessLabel,
  getLinkTone,
} from "../../lib/assetLinks/linkedContext";

function renderLinkList(rows, emptyTitle, emptyDescription, onNavigate, isMobile, actionButtonLayoutStyle) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            padding: "14px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>
                {row.asset?.asset_name || row.recordId || "Linked record"}
              </div>
              <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Category:</strong> {row.asset?.asset_category || row.module || "Linked record"}</div>
                <div><strong>Institution:</strong> {row.asset?.institution_name || "Limited visibility"}</div>
                <div><strong>Link Type:</strong> {row.link_type || "related_asset"}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <StatusBadge label={row.is_primary ? "Primary" : "Linked"} tone={row.is_primary ? "good" : "info"} />
              <StatusBadge label={formatConfidenceLabel(row.confidence_score)} tone={getLinkTone(row.confidence_score)} />
            </div>
          </div>
          {row.route ? (
            <button
              type="button"
              onClick={() => onNavigate?.(row.route)}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 700,
                ...(isMobile ? actionButtonLayoutStyle || {} : {}),
              }}
            >
              Open linked record
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function renderNotice(title, description, tone = "info") {
  const toneMap = {
    good: {
      border: "1px solid rgba(34,197,94,0.18)",
      background: "rgba(34,197,94,0.08)",
      titleColor: "#166534",
    },
    warning: {
      border: "1px solid rgba(245,158,11,0.24)",
      background: "rgba(245,158,11,0.10)",
      titleColor: "#92400e",
    },
    info: {
      border: "1px solid rgba(148,163,184,0.2)",
      background: "#ffffff",
      titleColor: "#0f172a",
    },
  };
  const resolvedTone = toneMap[tone] || toneMap.info;

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "14px",
        border: resolvedTone.border,
        background: resolvedTone.background,
        display: "grid",
        gap: "6px",
      }}
    >
      <div style={{ fontWeight: 800, color: resolvedTone.titleColor }}>{title}</div>
      <div style={{ color: "#475569", lineHeight: "1.7" }}>{description}</div>
    </div>
  );
}

export default function MortgageLinkedContextCard({
  propertyRows = [],
  protectionRows = [],
  propertyLinks = [],
  stackCompleteness = null,
  mortgageDocuments = [],
  assetBundle = null,
  onNavigate,
  isMobile = false,
  actionButtonLayoutStyle = null,
}) {
  const fallbackPropertyRows = (propertyLinks || []).map((link) =>
    buildLinkedRecordFallbackRow({
      id: link.id,
      asset: link.properties?.assets || null,
      module: "property",
      recordId: link.property_id || link.properties?.id || null,
      linkType: link.link_type,
      isPrimary: Boolean(link.is_primary),
      confidenceScore: 0.92,
    })
  );
  const linkedProperties = dedupeLinkedContextRows(
    propertyRows.length > 0 ? propertyRows : fallbackPropertyRows
  );
  const linkedProtections = dedupeLinkedContextRows(protectionRows);
  const sharedDocuments = assetBundle?.documents || [];
  const openAlerts = assetBundle?.alerts || [];
  const openTasks = assetBundle?.tasks || [];
  const portalLinks = assetBundle?.portalLinks || [];
  const recoveryMappedCount = portalLinks.filter((item) => item?.portal_profiles?.recovery_contact_hint).length;
  const summaryCards = [
    {
      title: "Stack Score",
      value: formatCompletenessScore(stackCompleteness?.score),
      helper:
        stackCompleteness?.score !== null && stackCompleteness?.score !== undefined
          ? `${getCompletenessLabel(stackCompleteness.score)} property-stack completeness from the linked property read.`
          : "A stored property-stack score is not available yet.",
    },
    {
      title: "Linked Property",
      value: linkedProperties.length,
      helper:
        linkedProperties.length > 0
          ? "This loan is connected into the property layer."
          : "A linked property has not been identified yet.",
    },
    {
      title: "Linked Protections",
      value: linkedProtections.length,
      helper:
        linkedProtections.length > 0
          ? "Protection tied to the same property stack is visible."
          : "No linked homeowners protection is visible through this stack yet.",
    },
    {
      title: "Linked Documents",
      value: mortgageDocuments.length + sharedDocuments.length,
      helper: `${mortgageDocuments.length} mortgage records and ${sharedDocuments.length} shared asset document${sharedDocuments.length === 1 ? "" : "s"} are visible.`,
    },
    {
      title: "Linked Portals",
      value: portalLinks.length,
      helper:
        portalLinks.length > 0
          ? `${recoveryMappedCount} portal${recoveryMappedCount === 1 ? "" : "s"} include recovery support.`
          : "Portal continuity is still limited for this mortgage asset.",
    },
  ];

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        {summaryCards.map((card) => (
          <div
            key={card.title}
            style={{
              padding: "14px 16px",
              borderRadius: "16px",
              background: "#f8fafc",
              border: "1px solid rgba(148, 163, 184, 0.18)",
            }}
          >
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {card.title}
            </div>
            <div style={{ marginTop: "8px", fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>{card.value}</div>
            <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.6" }}>{card.helper}</div>
          </div>
        ))}
      </div>

      {linkedProperties.length === 0
        ? renderNotice(
            "Linked property not identified",
            "This mortgage is visible, but a property dependency has not been confirmed yet. Until that link is created, the operating graph remains incomplete.",
            "warning"
          )
        : linkedProperties.length === 1
          ? renderNotice(
              "Single property connection visible",
              "This mortgage currently points to one property, which keeps the liability side of the stack readable from this page.",
              "good"
            )
          : renderNotice(
              "Multiple property links need confirmation",
              "This mortgage currently points to more than one property. That can be legitimate, but it should be reviewed so the financing relationship stays clear.",
              "warning"
            )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "16px",
        }}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Linked Property</div>
          {renderLinkList(
            linkedProperties,
            "No linked property yet",
            "Link a property to make the debt side of the property operating graph readable from this mortgage.",
            onNavigate,
            isMobile,
            actionButtonLayoutStyle
          )}
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Linked Protections</div>
          {renderLinkList(
            linkedProtections,
            "No linked protections yet",
            "When the connected property also shows homeowners coverage, the protection side of the stack will appear here.",
            onNavigate,
            isMobile,
            actionButtonLayoutStyle
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "16px",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Linked Documents</div>
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Mortgage records:</strong> {mortgageDocuments.length}</div>
            <div><strong>Shared asset docs:</strong> {sharedDocuments.length}</div>
            <div><strong>Open tasks:</strong> {openTasks.length}</div>
            <div><strong>Open alerts:</strong> {openAlerts.length}</div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onNavigate?.("/vault")}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 700,
                ...(isMobile ? actionButtonLayoutStyle || {} : {}),
              }}
            >
              Open Vault
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.("/upload-center")}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 700,
                ...(isMobile ? actionButtonLayoutStyle || {} : {}),
              }}
            >
              Upload Support
            </button>
          </div>
        </div>

        <div
          style={{
            padding: "16px 18px",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Linked Portals</div>
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Linked portals:</strong> {portalLinks.length}</div>
            <div><strong>Recovery mapped:</strong> {recoveryMappedCount}</div>
            <div><strong>Open tasks:</strong> {openTasks.length}</div>
            <div><strong>Open alerts:</strong> {openAlerts.length}</div>
          </div>
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            {portalLinks.length > 0
              ? "Continuity access is visible from the linked asset layer, which helps this mortgage stay actionable beyond the document record."
              : "Portal continuity appears limited, so access recovery still looks weaker than the visible debt record."}
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.("/portals")}
            style={{
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              cursor: "pointer",
              fontWeight: 700,
              ...(isMobile ? actionButtonLayoutStyle || {} : {}),
            }}
          >
            Open Portals
          </button>
        </div>
      </div>
    </div>
  );
}
