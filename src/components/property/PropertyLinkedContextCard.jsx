import EmptyState from "../shared/EmptyState";
import StatusBadge from "../shared/StatusBadge";
import {
  formatCompletenessScore,
  getCompletenessLabel,
  dedupeLinkedContextRows,
  formatConfidenceLabel,
  getLinkTone,
  normalizeLinkedContextRows,
} from "../../lib/assetLinks/linkedContext";

function renderLinkList(rows, emptyTitle, emptyDescription, onNavigate, isMobile, actionButtonLayoutStyle) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {rows.map((row) => {
        const route = row.route || null;
        return (
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
            {route ? (
              <button
                type="button"
                onClick={() => onNavigate(route)}
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
        );
      })}
    </div>
  );
}

export default function PropertyLinkedContextCard({
  currentAssetId,
  propertyAssetLinks = [],
  propertyDocuments = [],
  assetBundle = null,
  propertyStackAnalytics = null,
  onNavigate,
  isMobile = false,
  actionButtonLayoutStyle = null,
}) {
  const normalizedLinks = dedupeLinkedContextRows(
    normalizeLinkedContextRows(propertyAssetLinks || [], currentAssetId)
  );

  const liabilityLinks = normalizedLinks.filter((row) => row.bucket === "liability");
  const protectionLinks = normalizedLinks.filter((row) => row.bucket === "protection");
  const otherLinks = normalizedLinks.filter((row) => row.bucket === "other");
  const portalLinks = assetBundle?.portalLinks || [];
  const sharedDocuments = assetBundle?.documents || [];
  const openAlerts = assetBundle?.alerts || [];
  const openTasks = assetBundle?.tasks || [];
  const recoveryMappedCount = portalLinks.filter((item) => item?.portal_profiles?.recovery_contact_hint).length;
  const summaryCards = [
    {
      title: "Stack Score",
      value: formatCompletenessScore(propertyStackAnalytics?.completeness_score),
      helper:
        propertyStackAnalytics?.completeness_score !== null && propertyStackAnalytics?.completeness_score !== undefined
          ? `${getCompletenessLabel(propertyStackAnalytics?.completeness_score)} property stack continuity read.`
          : "Stored property stack scoring is still limited.",
    },
    {
      title: "Linked Liabilities",
      value: liabilityLinks.length,
      helper:
        liabilityLinks.length > 0
          ? "Debt records are connected to this property."
          : "No financing linkage is mirrored yet.",
    },
    {
      title: "Linked Protections",
      value: protectionLinks.length,
      helper:
        protectionLinks.length > 0
          ? "Protection records are connected to this property."
          : "No homeowners protection is mirrored yet.",
    },
    {
      title: "Linked Documents",
      value: propertyDocuments.length + sharedDocuments.length,
      helper: `${propertyDocuments.length} property records and ${sharedDocuments.length} household vault document${sharedDocuments.length === 1 ? "" : "s"} are visible.`,
    },
    {
      title: "Linked Portals",
      value: portalLinks.length,
      helper:
        portalLinks.length > 0
          ? `${recoveryMappedCount} portal${recoveryMappedCount === 1 ? "" : "s"} include recovery support.`
          : "No portal continuity is attached to this property asset yet.",
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "16px",
        }}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Linked Liabilities</div>
          {renderLinkList(
            liabilityLinks,
            "No linked liabilities yet",
            "When financing is connected, the debt side of the property operating stack will appear here.",
            onNavigate,
            isMobile,
            actionButtonLayoutStyle
          )}
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Linked Protections</div>
          {renderLinkList(
            protectionLinks,
            "No linked protections yet",
            "When homeowners coverage is connected, the protection side of the property stack will appear here.",
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
            <div><strong>Property records:</strong> {propertyDocuments.length}</div>
            <div><strong>Household vault docs:</strong> {sharedDocuments.length}</div>
            <div><strong>Open tasks:</strong> {openTasks.length}</div>
            <div><strong>Open alerts:</strong> {openAlerts.length}</div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onNavigate("/vault")}
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
              onClick={() => onNavigate("/upload-center")}
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
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Linked Portals And Graph Context</div>
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Linked portals:</strong> {portalLinks.length}</div>
            <div><strong>Recovery mapped:</strong> {recoveryMappedCount}</div>
            <div><strong>Graph links:</strong> {normalizedLinks.length}</div>
            <div><strong>Stack continuity:</strong> {propertyStackAnalytics?.continuity_status || "Limited visibility"}</div>
          </div>
          {otherLinks.length > 0 ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {otherLinks.slice(0, 3).map((link) => (
                <StatusBadge key={link.id} label={link.asset?.asset_name || link.link_type || "related"} tone="info" />
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => onNavigate("/portals")}
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
