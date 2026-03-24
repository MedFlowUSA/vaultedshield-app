import ModulePageShell from "./ModulePageShell";

export default function BankingHubPage() {
  return (
    <ModulePageShell
      eyebrow="Banking and Cash"
      title="Banking Hub"
      description="Overview shell for cash accounts, liquidity readiness, key institutions, and emergency-access continuity."
      summaryItems={[
        { label: "Liquidity Records", value: "Scaffolded", helper: "Institution and account shells ready" },
        { label: "Emergency Access", value: "Planned", helper: "Future continuity packet support" },
        { label: "AI Summary", value: "Placeholder", helper: "Ready for later balance/risk signals" },
      ]}
      assetCards={[
        { title: "Operating Cash Accounts", category: "Liquidity", status: "Placeholder", description: "Ready for account summaries, ownership visibility, and key-access notes." },
        { title: "Institution Directory", category: "Banking contacts", status: "Placeholder", description: "Ready for bank, private banking, and treasury contact records." },
      ]}
      alerts={["Banking ingestion is not implemented in this pass.", "This shell is intended for continuity and household visibility first."]}
      notes={["Design and layout are aligned with the live insurance module.", "Banking records can later share vault, contacts, and emergency workflows."]}
      insight={{
        summary: "The banking shell is ready for future liquidity and account continuity features without changing the broader platform structure.",
        bullets: ["Emergency-access logic can later connect here.", "Institution contacts and notes are planned as first-class records."],
      }}
      documents={[
        { name: "Bank statement register", role: "Banking", status: "Placeholder", updatedAt: "Pending" },
      ]}
    />
  );
}
