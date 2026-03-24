import ModulePageShell from "./ModulePageShell";

export default function EstateHubPage() {
  return (
    <ModulePageShell
      eyebrow="Estate and Legal"
      title="Estate Hub"
      description="Overview shell for trusts, wills, powers, executors, beneficiaries, and legal continuity documents."
      summaryItems={[
        { label: "Legal Record Types", value: "Core estate", helper: "Wills, trusts, powers, directives" },
        { label: "Executor Readiness", value: "Placeholder", helper: "Future transfer and handoff layer" },
        { label: "Continuity State", value: "Scaffolded", helper: "Prepared for detail records and packet export" },
      ]}
      assetCards={[
        { title: "Estate Document Registry", category: "Legal", status: "Placeholder", description: "Ready for wills, trusts, and powers with continuity notes and owner mapping." },
        { title: "Executor and Trustee Readiness", category: "Handoff", status: "Placeholder", description: "Ready for successor roles, access instructions, and packet completeness checks." },
      ]}
      alerts={["Estate/legal ingestion is not implemented in this pass.", "Emergency and contact modules can later feed this hub directly."]}
      notes={["Estate records are central to household continuity and emergency handoff.", "This shell is prepared for secure document and contact linking."]}
      insight={{
        summary: "Estate is scaffolded as a core continuity module, with room for legal document indexing and successor-readiness intelligence.",
        bullets: ["Handoff packaging will later connect estate, contacts, and emergency views.", "The current shell preserves the same design language as insurance."],
      }}
      documents={[
        { name: "Trust and will packet", role: "Estate", status: "Placeholder", updatedAt: "Pending" },
      ]}
    />
  );
}
