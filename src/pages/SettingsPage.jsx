import NotesPanel from "../components/shared/NotesPanel";
import {
  FriendlyActionTile,
  FriendlyPageHero,
} from "../components/shared/FriendlyIntelligenceUI";
import SectionCard from "../components/shared/SectionCard";

export default function SettingsPage() {
  const settingsHeroGlanceItems = [
    { label: "User Profile", value: "Ready" },
    { label: "Household Roles", value: "Planned" },
    { label: "Notifications", value: "Planned" },
    { label: "Security", value: "Planned" },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <FriendlyPageHero
        eyebrow="Settings"
        sectionTitle="Platform Settings"
        headline="Keep profile, access, and notification controls understandable before they grow into a bigger settings system."
        summary="This surface is still a shell, but it already tells you where personal, household, role, and security controls will live."
        transition="The top layer should keep settings calm: what is already shaped, what is planned next, and which control area matters first. The placeholder detail cards stay below."
        actions={[]}
        score={58}
        scoreTone="info"
        scoreSubtitle="settings score"
        scoreIconLabel="settings"
        asideHeadline="Settings structure is taking shape"
        asideSummary="The key value here is clarity of direction. The settings system can deepen later without becoming hard to read on first open."
        glanceItems={settingsHeroGlanceItems}
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
          title="Settings layout is understandable"
          detail="The major control areas are already staged clearly even though the deeper configuration work is still coming."
          metric="4 core areas"
          tone="info"
          statusLabel="Simple Read"
          actionLabel="View Profile"
          onAction={() => document.querySelector('[data-settings-profile="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <FriendlyActionTile
          kicker="Best First Step"
          title="Start with profile and household roles"
          detail="Those two areas usually matter first because they shape identity, continuity access, and household coordination."
          metric="identity first"
          tone="warning"
          statusLabel="Guided Focus"
          actionLabel="Open Roles"
          onAction={() => document.querySelector('[data-settings-roles="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <FriendlyActionTile
          kicker="What Can Wait"
          title="Notification tuning can come after access"
          detail="Alert routing and security detail matter, but they do not need to block the first clean settings experience."
          metric="alerts later"
          tone="info"
          statusLabel="Building"
          actionLabel="See Security"
          onAction={() => document.querySelector('[data-settings-security="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <SectionCard data-settings-profile="true" title="User Profile">
          <NotesPanel notes={["Primary profile details, advisor visibility, and personal settings will live here."]} />
        </SectionCard>
        <SectionCard title="Household Profile">
          <NotesPanel notes={["Household structure, continuity preferences, and family identity settings will live here."]} />
        </SectionCard>
        <SectionCard data-settings-roles="true" title="Roles and Access">
          <NotesPanel notes={["Member roles, advisor access, trustee visibility, and future permissions will live here."]} />
        </SectionCard>
        <SectionCard data-settings-security="true" title="Notifications and Security">
          <NotesPanel notes={["Notification routing, document alerts, and security preferences will live here."]} />
        </SectionCard>
      </div>
    </div>
  );
}
