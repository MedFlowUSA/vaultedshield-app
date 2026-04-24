import { CalmEmptyState } from "./FriendlyIntelligenceUI";

export default function EmptyState({
  title,
  description,
  children,
  icon = "📄",
  tone = "neutral",
  supportLabel = "",
  actionLabel = "",
  onAction,
}) {
  return (
    <CalmEmptyState
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      supportLabel={supportLabel}
      actionLabel={actionLabel}
      onAction={onAction}
    >
      {children}
    </CalmEmptyState>
  );
}
