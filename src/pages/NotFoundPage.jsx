import { FriendlyActionTile, FriendlyPageHero, CalmEmptyState } from "../components/shared/FriendlyIntelligenceUI";

const pageShellStyle = {
  display: "grid",
  gap: "24px",
  padding: "24px 0 40px",
};

export default function NotFoundPage({ onNavigate, requestedPath = "" }) {
  return (
    <div style={pageShellStyle}>
      <FriendlyPageHero
        eyebrow="Navigation"
        sectionTitle="Page Not Found"
        headline="That page is not available here"
        summary="VaultedShield could not match this link to a live page. The safest next move is to return to a known area and keep working from there."
        transition={
          requestedPath
            ? `Requested path: ${requestedPath}`
            : "This can happen when a link is outdated, incomplete, or points to an older screen that has been replaced."
        }
        actions={[
          {
            label: "Open Dashboard",
            onClick: () => onNavigate?.("/dashboard"),
            kind: "primary",
          },
          {
            label: "Open Guidance",
            onClick: () => onNavigate?.("/guidance"),
          },
        ]}
        score={0}
        scoreTone="warning"
        scoreSubtitle="route"
        scoreIconLabel="path"
        asideHeadline="Use a known starting point"
        asideSummary="Dashboard, Guidance, and Insurance are the clearest recovery paths when a saved or shared link no longer lines up with the current app structure."
        glanceItems={[
          { label: "Best recovery page", value: "Dashboard" },
          { label: "Help with navigation", value: "Guidance" },
          { label: "Main demo flow", value: "Dashboard -> Insurance -> Review Workspace -> Reports" },
        ]}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <FriendlyActionTile
          kicker="Best First Step"
          title="Return to the household overview"
          detail="Go back to the dashboard when you want the clearest read on what matters next."
          metric="Overview"
          tone="info"
          statusLabel="Guided Focus"
          actionLabel="Open Dashboard"
          onAction={() => onNavigate?.("/dashboard")}
        />
        <FriendlyActionTile
          kicker="If You Were Uploading"
          title="Use the right intake path"
          detail="Upload Center is for general records. Life Policy Intake is for life-policy illustrations and annual statements."
          metric="2 paths"
          tone="warning"
          statusLabel="Needs Review"
          actionLabel="Open Upload Center"
          onAction={() => onNavigate?.("/upload-center")}
        />
        <FriendlyActionTile
          kicker="If You Were Reviewing"
          title="Jump back into insurance"
          detail="Insurance Intelligence is the easiest way to reopen saved policies, priorities, and deeper technical review."
          metric="Policy read"
          tone="good"
          statusLabel="Simple Read"
          actionLabel="Open Insurance"
          onAction={() => onNavigate?.("/insurance")}
        />
      </div>

      <CalmEmptyState
        title="Need a stable entry point?"
        description="Use Guidance if you want VaultedShield to explain where a workflow belongs before you choose a page."
        icon="Guide"
        tone="neutral"
        actionLabel="Open Guidance"
        onAction={() => onNavigate?.("/guidance")}
      />
    </div>
  );
}
