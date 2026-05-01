/* eslint-disable react-refresh/only-export-components */
import { getReadinessPalette } from "../../lib/presentation/readinessVerdicts";

const RING_SIZES = {
  sm: { outer: 88, inner: 66, valueSize: 24, subtitleSize: 10, iconSize: 10 },
  md: { outer: 100, inner: 74, valueSize: 28, subtitleSize: 11, iconSize: 11 },
  lg: { outer: 144, inner: 112, valueSize: 40, subtitleSize: 12, iconSize: 12 },
};

function getTone(tone = "neutral") {
  return getReadinessPalette(tone);
}

function actionButtonStyle(kind = "secondary") {
  if (kind === "primary") {
    return {
      padding: "11px 16px",
      borderRadius: "999px",
      border: "none",
      background: "#0f172a",
      color: "#ffffff",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: "13px",
      boxShadow: "0 14px 28px rgba(15, 23, 42, 0.16)",
    };
  }

  return {
    padding: "11px 16px",
    borderRadius: "999px",
    border: "1px solid rgba(148, 163, 184, 0.28)",
    background: "#ffffff",
    color: "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
    boxShadow: "0 10px 22px rgba(148, 163, 184, 0.12)",
  };
}

export function friendlySurfaceCardStyle(extra = {}) {
  return {
    padding: "26px 28px",
    borderRadius: "24px",
    background: "#ffffff",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.06)",
    ...extra,
  };
}

export function FriendlySurfaceCard({ children, style = {}, ...rest }) {
  return (
    <section style={friendlySurfaceCardStyle(style)} {...rest}>
      {children}
    </section>
  );
}

export function ScoreRing({ value = 0, size = "md", tone = "info", iconLabel = "", subtitle = "of 100" }) {
  const config = RING_SIZES[size] || RING_SIZES.md;
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const degrees = Math.max(8, Math.min(360, (safeValue / 100) * 360));
  const accent = getReadinessPalette(tone).accent;

  return (
    <div
      style={{
        width: `${config.outer}px`,
        height: `${config.outer}px`,
        borderRadius: "999px",
        background: `conic-gradient(${accent} 0deg ${degrees}deg, #e2e8f0 ${degrees}deg 360deg)`,
        display: "grid",
        placeItems: "center",
        boxShadow: "0 24px 50px rgba(15, 23, 42, 0.10)",
      }}
    >
      <div
        style={{
          width: `${config.inner}px`,
          height: `${config.inner}px`,
          borderRadius: "999px",
          background: "#ffffff",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ display: "grid", gap: "4px" }}>
          <div style={{ fontSize: `${config.valueSize}px`, fontWeight: 800, lineHeight: "1", color: "#0f172a" }}>{safeValue}</div>
          <div style={{ fontSize: `${config.subtitleSize}px`, color: "#64748b", fontWeight: 700 }}>{subtitle}</div>
          {iconLabel ? <div style={{ fontSize: `${config.iconSize}px`, color: accent, fontWeight: 800, letterSpacing: "0.08em" }}>{iconLabel}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function FriendlyStatusPill({ label, tone = "neutral", icon = "" }) {
  const palette = getTone(tone);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "7px 11px",
        borderRadius: "999px",
        background: palette.soft,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </span>
  );
}

export function ConfidenceSupportBadge({ label, tone = "info" }) {
  return <FriendlyStatusPill label={label} tone={tone} icon="Support" />;
}

export function WhyItMattersBlock({ whatFound, whyCare }) {
  if (!whatFound && !whyCare) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: "10px",
        padding: "16px 18px",
        borderRadius: "18px",
        background: "rgba(255,255,255,0.78)",
        border: "1px solid rgba(148, 163, 184, 0.16)",
      }}
    >
      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
        Why This Matters
      </div>
      {whatFound ? <div style={{ color: "#334155", lineHeight: "1.75" }}>{whatFound}</div> : null}
      {whyCare ? <div style={{ color: "#475569", lineHeight: "1.75" }}>{whyCare}</div> : null}
    </div>
  );
}

export function SuggestedActionsRow({ actions = [], fullWidth = false }) {
  if (!Array.isArray(actions) || actions.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
      {actions.filter(Boolean).map((action, index) => (
        <button
          key={`${action.label}-${index}`}
          type="button"
          onClick={action.onClick}
          style={{
            ...actionButtonStyle(action.kind === "primary" ? "primary" : "secondary"),
            width: fullWidth ? "100%" : "auto",
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function FriendlyMetricStrip({ items = [] }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "10px",
      }}
    >
      {items.map((item) => (
        <div
          key={`${item.label}-${item.value}`}
          style={{
            padding: "14px 16px",
            borderRadius: "16px",
            background: "rgba(255,255,255,0.82)",
            border: "1px solid rgba(148, 163, 184, 0.16)",
            display: "grid",
            gap: "8px",
          }}
        >
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
            {item.label}
          </div>
          <div style={{ fontSize: "20px", lineHeight: "1.2", fontWeight: 800, color: "#0f172a" }}>{item.value}</div>
          {item.helper ? <div style={{ color: "#475569", lineHeight: "1.65", fontSize: "14px" }}>{item.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function EvidenceDetailRenderer({ title, subtitle, children }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "14px",
        padding: "18px 18px 20px",
        borderRadius: "18px",
        background: "linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,0.98) 100%)",
        border: "1px solid rgba(148, 163, 184, 0.16)",
      }}
    >
      {(title || subtitle) ? (
        <div style={{ display: "grid", gap: "6px" }}>
          {title ? (
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
              {title}
            </div>
          ) : null}
          {subtitle ? <div style={{ color: "#475569", lineHeight: "1.7" }}>{subtitle}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function ExpandableEvidencePanel({
  title = "See Supporting Evidence",
  subtitle = "Open the deeper details only when you want them.",
  children,
  defaultOpen = false,
}) {
  if (!children) return null;

  return (
    <details
      open={defaultOpen}
      style={{
        borderRadius: "20px",
        border: "1px solid rgba(148, 163, 184, 0.16)",
        background: "rgba(255,255,255,0.8)",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "16px 18px",
          display: "grid",
          gap: "6px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{title}</div>
          <FriendlyStatusPill label="Expandable" tone="neutral" icon="Details" />
        </div>
        {subtitle ? <div style={{ color: "#475569", lineHeight: "1.65" }}>{subtitle}</div> : null}
      </summary>
      <div style={{ padding: "0 18px 18px" }}>{children}</div>
    </details>
  );
}

export function FriendlyInsightCard({
  eyebrow = "Simple Read",
  icon = "Guide",
  title,
  verdict,
  statusLabel,
  tone = "neutral",
  supportLabel,
  supportTone = "info",
  whatFound,
  whyCare,
  metrics = [],
  tags = [],
  actions = [],
  evidenceTitle,
  evidenceSubtitle,
  evidenceContent,
  defaultEvidenceOpen = false,
}) {
  const palette = getTone(tone);

  return (
    <div
      style={{
        display: "grid",
        gap: "18px",
        padding: "22px 22px 24px",
        borderRadius: "24px",
        background: palette.gradient,
        border: `1px solid ${palette.border}`,
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: "10px", minWidth: 0 }}>
            <div
              style={{
                width: "fit-content",
                padding: "7px 11px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.88)",
                border: `1px solid ${palette.border}`,
                fontSize: "11px",
                color: palette.text,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 800,
              }}
            >
              {eyebrow}
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: "24px" }} aria-hidden="true">
                {icon}
              </div>
              {title ? <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{title}</div> : null}
            </div>
            {verdict ? (
              <div style={{ fontSize: "28px", lineHeight: "1.08", letterSpacing: "-0.03em", fontWeight: 800, color: "#0f172a" }}>
                {verdict}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {statusLabel ? <FriendlyStatusPill label={statusLabel} tone={tone} icon={icon} /> : null}
            {supportLabel ? <ConfidenceSupportBadge label={supportLabel} tone={supportTone} /> : null}
          </div>
        </div>

        <WhyItMattersBlock whatFound={whatFound} whyCare={whyCare} />
        <SuggestedActionsRow actions={actions} />
      </div>

      <FriendlyMetricStrip items={metrics} />

      {tags.length > 0 ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {tags.map((tag) => (
            <FriendlyStatusPill key={tag} label={tag} tone="neutral" />
          ))}
        </div>
      ) : null}

      {evidenceContent ? (
        <ExpandableEvidencePanel title={evidenceTitle} subtitle={evidenceSubtitle} defaultOpen={defaultEvidenceOpen}>
          {evidenceContent}
        </ExpandableEvidencePanel>
      ) : null}
    </div>
  );
}

export function SurfaceSummaryRenderer({ summary, defaultEvidenceOpen = false }) {
  if (!summary) return null;

  return (
    <FriendlyInsightCard
      eyebrow={summary.eyebrow}
      icon={summary.icon}
      title={summary.title}
      verdict={summary.verdict}
      statusLabel={summary.statusLabel}
      tone={summary.tone}
      supportLabel={summary.supportLabel}
      supportTone={summary.supportTone}
      whatFound={summary.whatFound}
      whyCare={summary.whyCare}
      metrics={summary.metrics}
      tags={summary.tags}
      actions={summary.actions}
      evidenceTitle={summary.evidenceTitle}
      evidenceSubtitle={summary.evidenceSubtitle}
      evidenceContent={summary.evidenceContent}
      defaultEvidenceOpen={defaultEvidenceOpen}
    />
  );
}

export function FriendlyStatusHero({
  title,
  verdict,
  statusLabel,
  tone = "neutral",
  icon = "Guide",
  whatFound,
  whyCare,
  actions = [],
  metrics = [],
  evidenceContent,
  evidenceTitle = "See Why",
  evidenceSubtitle = "Open the supporting detail only when you want it.",
}) {
  return (
    <FriendlyInsightCard
      eyebrow="Start Here"
      icon={icon}
      title={title}
      verdict={verdict}
      statusLabel={statusLabel}
      tone={tone}
      whatFound={whatFound}
      whyCare={whyCare}
      actions={actions}
      metrics={metrics}
      evidenceTitle={evidenceTitle}
      evidenceSubtitle={evidenceSubtitle}
      evidenceContent={evidenceContent}
    />
  );
}

export function ActionSignalCard({
  label,
  value,
  detail,
  tone = "neutral",
  actionLabel,
  onAction,
}) {
  return (
    <FriendlyInsightCard
      eyebrow={label}
      icon=""
      verdict={value}
      tone={tone}
      whatFound={detail}
      actions={actionLabel && onAction ? [{ label: actionLabel, onClick: onAction, kind: tone === "alert" ? "primary" : "secondary" }] : []}
    />
  );
}

export function FriendlyActionTile({
  kicker,
  title,
  detail,
  metric,
  tone = "neutral",
  statusLabel,
  actionLabel = "Open",
  onAction,
}) {
  const palette = getTone(tone);
  const interactive = typeof onAction === "function";

  function handleKeyDown(event) {
    if (!interactive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onAction();
    }
  }

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onAction : undefined}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        display: "grid",
        gap: "18px",
        padding: "24px 24px 26px",
        borderRadius: "28px",
        background: `radial-gradient(circle at top right, ${palette.soft} 0%, rgba(255,255,255,0) 34%), ${palette.gradient}`,
        border: `1px solid ${palette.border}`,
        boxShadow: "0 22px 48px rgba(15, 23, 42, 0.08)",
        cursor: interactive ? "pointer" : "default",
        minHeight: "232px",
        alignContent: "space-between",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-28px",
          right: "-18px",
          width: "112px",
          height: "112px",
          borderRadius: "999px",
          background: palette.soft,
          opacity: 0.34,
          filter: "blur(10px)",
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "grid", gap: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
          {kicker ? (
            <div
              style={{
                width: "fit-content",
                padding: "7px 11px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.88)",
                border: `1px solid ${palette.border}`,
                color: palette.text,
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {kicker}
            </div>
          ) : null}
          {statusLabel ? <FriendlyStatusPill label={statusLabel} tone={tone} /> : null}
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontSize: "28px", lineHeight: "1.08", letterSpacing: "-0.03em", fontWeight: 800, color: "#0f172a" }}>{title}</div>
          <div style={{ color: "#475569", lineHeight: "1.75", fontSize: "15px" }}>{detail}</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "14px",
          alignItems: "flex-end",
          flexWrap: "wrap",
          paddingTop: "14px",
          borderTop: "1px solid rgba(148, 163, 184, 0.14)",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Quick Signal</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{metric}</div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: palette.text,
            fontWeight: 800,
            fontSize: "13px",
            padding: "10px 12px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.86)",
            border: `1px solid ${palette.border}`,
            boxShadow: "0 10px 22px rgba(148, 163, 184, 0.12)",
          }}
        >
          <span>{actionLabel}</span>
          <span aria-hidden="true">{"->"}</span>
        </div>
      </div>
    </div>
  );
}

export function GlanceListPanel({ eyebrow = "At A Glance", items = [] }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div
      style={{
        padding: "18px 18px 16px",
        borderRadius: "18px",
        background: "#f8fafc",
        border: "1px solid rgba(226, 232, 240, 0.92)",
        display: "grid",
        gap: "10px",
      }}
    >
      <div style={{ fontSize: "12px", color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
        {eyebrow}
      </div>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div style={{ color: "#64748b", fontSize: "14px" }}>{item.label}</div>
          <div style={{ color: "#0f172a", fontWeight: 800, textAlign: "right" }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function FriendlyPageHero({
  eyebrow,
  sectionTitle,
  headline,
  summary,
  transition,
  actions = [],
  score,
  scoreTone = "info",
  scoreSubtitle = "of 100",
  scoreIconLabel = "",
  asideHeadline,
  asideSummary,
  glanceEyebrow = "At A Glance",
  glanceItems = [],
}) {
  const asideTone = getReadinessPalette(scoreTone).text;

  return (
    <FriendlySurfaceCard
      style={{
        padding: "32px 30px",
        display: "grid",
        gap: "24px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "24px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          {eyebrow ? (
            <div
              style={{
                width: "fit-content",
                padding: "7px 12px",
                borderRadius: "999px",
                background: "rgba(219, 234, 254, 0.9)",
                color: "#1d4ed8",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          {sectionTitle ? <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{sectionTitle}</div> : null}
          {headline ? <div style={{ fontSize: "32px", fontWeight: 800, lineHeight: "1.05", letterSpacing: "-0.04em", color: "#0f172a" }}>{headline}</div> : null}
          {summary ? <div style={{ color: "#334155", lineHeight: "1.8", maxWidth: "42rem" }}>{summary}</div> : null}
          {transition ? <div style={{ color: "#64748b", lineHeight: "1.75", maxWidth: "44rem" }}>{transition}</div> : null}
          <SuggestedActionsRow actions={actions} />
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <ScoreRing value={score} size="lg" tone={scoreTone} subtitle={scoreSubtitle} iconLabel={scoreIconLabel} />
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          {(asideHeadline || asideSummary) ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {asideHeadline ? (
                <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: "1.05", letterSpacing: "-0.04em", color: asideTone }}>
                  {asideHeadline}
                </div>
              ) : null}
              {asideSummary ? <div style={{ color: "#475569", lineHeight: "1.75" }}>{asideSummary}</div> : null}
            </div>
          ) : null}
          <GlanceListPanel eyebrow={glanceEyebrow} items={glanceItems} />
        </div>
      </div>
    </FriendlySurfaceCard>
  );
}

export function WhatThisMeansCard(props) {
  return <ActionSignalCard label="What This Means" tone="info" {...props} />;
}

export function WhatChangedCard(props) {
  return <ActionSignalCard label="What Changed" tone="neutral" {...props} />;
}

export function NextStepCard(props) {
  return <ActionSignalCard label="What To Do Next" tone="warning" {...props} />;
}

export function RecentlyImprovedCard(props) {
  return <ActionSignalCard label="Recently Improved" tone="good" {...props} />;
}

export function ExpandForDetailsSection(props) {
  return <ExpandableEvidencePanel {...props} />;
}

export function CalmEmptyState({
  title,
  description,
  icon = "Docs",
  tone = "neutral",
  supportLabel = "",
  actionLabel = "",
  onAction,
  children,
}) {
  const palette = getTone(tone);
  const actions = actionLabel && onAction ? [{ label: actionLabel, onClick: onAction, kind: "secondary" }] : [];

  return (
    <div
      style={{
        padding: "clamp(18px, 3vw, 24px)",
        borderRadius: "20px",
        border: `1px solid ${palette.border}`,
        background: palette.gradient,
        minWidth: 0,
        overflowWrap: "anywhere",
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.04)",
        display: "grid",
        gap: "14px",
      }}
    >
      <div style={{ display: "grid", gap: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "24px" }} aria-hidden="true">
              {icon}
            </div>
            <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "clamp(1rem, 2.8vw, 1.15rem)" }}>{title}</div>
          </div>
          {supportLabel ? <ConfidenceSupportBadge label={supportLabel} tone={tone === "neutral" ? "info" : tone} /> : null}
        </div>
        <p style={{ margin: 0, color: "#475569", lineHeight: "1.7", maxWidth: "64ch" }}>{description}</p>
      </div>
      <SuggestedActionsRow actions={actions} />
      {children ? <div>{children}</div> : null}
    </div>
  );
}
