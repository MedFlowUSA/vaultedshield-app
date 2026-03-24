import AIInsightPanel from "../components/shared/AIInsightPanel";
import AlertPanel from "../components/shared/AlertPanel";
import AssetCard from "../components/shared/AssetCard";
import DocumentTable from "../components/shared/DocumentTable";
import EmptyState from "../components/shared/EmptyState";
import NotesPanel from "../components/shared/NotesPanel";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";

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
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              placeholder="Search records, notes, institutions"
              style={{
                minWidth: "260px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                padding: "10px 12px",
                background: "#ffffff",
              }}
            />
            <button
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: "10px",
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Filter
            </button>
          </div>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div
        style={{
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "18px",
          alignItems: "start",
        }}
      >
        <SectionCard title="Records Overview" subtitle="List/detail-ready shell for this module.">
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
        </SectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="AI Summary">
            <AIInsightPanel title="Module Intelligence Placeholder" summary={insight.summary} bullets={insight.bullets} />
          </SectionCard>
          <SectionCard title="Alerts and Watchlist">
            <AlertPanel title="Current Watchpoints" items={alerts} />
          </SectionCard>
        </div>
      </div>

      <div
        style={{
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: "18px",
          alignItems: "start",
        }}
      >
        <SectionCard title="Document Register" subtitle="Placeholder document table for module-linked records.">
          <DocumentTable rows={documents} />
        </SectionCard>
        <SectionCard title="Notes and Continuity Context">
          <NotesPanel notes={notes} />
        </SectionCard>
      </div>
    </div>
  );
}
