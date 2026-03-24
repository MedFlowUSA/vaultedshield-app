import { useEffect, useState } from "react";
import DocumentTable from "../components/shared/DocumentTable";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import { listHouseholdDocuments } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

export default function VaultPage() {
  const householdState = usePlatformHousehold();
  const [documents, setDocuments] = useState([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!householdState.context.householdId) {
      setDocuments([]);
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
      .join(" / ") || "Generic asset document",
    status: document.processing_status || "uploaded",
    updatedAt: document.created_at
      ? new Date(document.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "Unknown",
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Vault"
        title="Household Vault"
        description="The vault shell now reads generic household asset documents while the deep life-policy document workflow remains under Insurance > Life."
      />
      <SummaryPanel
        items={[
          { label: "Working Household", value: householdState.household?.household_name || "Loading", helper: "Current platform context" },
          { label: "Generic Documents", value: documents.length, helper: "Asset-linked platform documents" },
          { label: "Stored Records", value: documents.filter((item) => item.storage_path).length, helper: "Documents with storage references" },
          { label: "Needs Review", value: documents.filter((item) => item.processing_status === "needs_review").length, helper: "Document processing watchlist" },
        ]}
      />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "18px" }}>
        <SectionCard title="Household Document Register" subtitle="Generic platform documents linked to household assets.">
          {documentRows.length > 0 ? (
            <DocumentTable rows={documentRows} />
          ) : (
            <EmptyState
              title="No generic vault documents yet"
              description="This vault view reads from the new platform document table. Specialized life-policy documents continue to live under the deep insurance workflow for now."
            />
          )}
        </SectionCard>

        <SectionCard title="Vault Notes">
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            <p style={{ marginTop: 0 }}>
              Generic household documents now have a durable home in the platform vault.
            </p>
            <p>
              Specialized life-policy document intelligence remains preserved in the dedicated IUL path and is not being merged into this table yet.
            </p>
            {loadError ? <p style={{ color: "#991b1b" }}>{loadError}</p> : null}
          </div>
        </SectionCard>
      </div>

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Documents: {documents.length}
        </div>
      ) : null}
    </div>
  );
}
