import AIInsightPanel from "../components/shared/AIInsightPanel";
import AlertPanel from "../components/shared/AlertPanel";
import AssetCard from "../components/shared/AssetCard";
import DocumentTable from "../components/shared/DocumentTable";
import EmptyState from "../components/shared/EmptyState";
import NotesPanel from "../components/shared/NotesPanel";
import PageHeader from "../components/layout/PageHeader";
import SummaryPanel from "../components/shared/SummaryPanel";

function surfaceCard(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(226,232,240,0.92)",
    boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
    ...extra,
  };
}

export default function ModulePageShell({
  eyebrow,
  title,
  description,
  summaryItems,
  assetCards,
  alerts,
  notes,
  insight,
  documents,
}) {
  return (
    <div>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              placeholder="Search records, notes, institutions"
              style={{
                minWidth: 0,
                width: "100%",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                padding: "10px 12px",
                background: "#ffffff",
                flex: "1 1 260px",
              }}
            />
            <button
              type="button"
              style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
            >
              Filter
            </button>
          </div>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px", alignItems: "start" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "12px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Records Overview</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>List/detail-ready shell for this module.</div>
          {assetCards?.length > 0 ? (
            <div style={{ display: "grid", gap: "14px" }}>
              {assetCards.map((card) => (
                <AssetCard key={card.title} {...card} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No records loaded"
              description="This module is ready for records, documents, and intelligence blocks when data sources are connected."
            />
          )}
        </div>

        <div style={{ display: "grid", gap: "18px" }}>
          <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "12px" })}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>AI Summary</div>
            <AIInsightPanel title="Module Intelligence Placeholder" summary={insight.summary} bullets={insight.bullets} />
          </div>
          <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "12px" })}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Alerts and Watchlist</div>
            <AlertPanel title="Current Watchpoints" items={alerts} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px", alignItems: "start" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "12px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Document Register</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>Placeholder document table for module-linked records.</div>
          <DocumentTable rows={documents} />
        </div>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "12px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Notes and Continuity Context</div>
          <NotesPanel notes={notes} />
        </div>
      </div>
    </div>
  );
}
