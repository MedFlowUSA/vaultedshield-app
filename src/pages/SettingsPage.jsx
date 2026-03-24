import NotesPanel from "../components/shared/NotesPanel";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Platform Settings"
        description="Shell for user profile, household profile, roles, notifications, security, and continuity preferences."
      />
      <SummaryPanel
        items={[
          { label: "User Profile", value: "Placeholder", helper: "Ready for account settings" },
          { label: "Household Roles", value: "Placeholder", helper: "Ready for member access and continuity roles" },
          { label: "Notifications", value: "Placeholder", helper: "Ready for policy and continuity alerts" },
        ]}
      />
      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <SectionCard title="User Profile">
          <NotesPanel notes={["Primary profile details, advisor visibility, and personal settings will live here."]} />
        </SectionCard>
        <SectionCard title="Household Profile">
          <NotesPanel notes={["Household structure, continuity preferences, and family identity settings will live here."]} />
        </SectionCard>
        <SectionCard title="Roles and Access">
          <NotesPanel notes={["Member roles, advisor access, trustee visibility, and future permissions will live here."]} />
        </SectionCard>
        <SectionCard title="Notifications and Security">
          <NotesPanel notes={["Notification routing, document alerts, and security preferences will live here."]} />
        </SectionCard>
      </div>
    </div>
  );
}
