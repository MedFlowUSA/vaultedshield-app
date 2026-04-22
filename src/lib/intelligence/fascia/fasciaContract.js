const STATUS_TONES = Object.freeze({
  Strong: "good",
  Stable: "info",
  "Needs Review": "warning",
  Incomplete: "warning",
  Partial: "warning",
  "At Risk": "alert",
  "Not Enough Data": "neutral",
});

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function serializeActionTarget(action = null) {
  if (!action) return "";
  if (action.route) return `route:${action.route}`;
  if (action.target) {
    try {
      return `target:${JSON.stringify(action.target)}`;
    } catch {
      return "target:[unserializable]";
    }
  }
  return "";
}

export function buildFasciaStatusTone(status = "Not Enough Data") {
  return STATUS_TONES[status] || "neutral";
}

export function buildFasciaSource({
  sourceMode = "",
  sourceLabel = "",
  sourceTone,
  status = "Not Enough Data",
} = {}) {
  return {
    sourceMode,
    sourceLabel,
    sourceTone: sourceTone || (status === "Not Enough Data" ? "neutral" : "info"),
  };
}

export function normalizeFasciaAction(action = null) {
  if (!action?.label) return null;

  if (action.kind || action.route || action.target) {
    return {
      ...action,
      kind: action.kind || (action.route ? "navigate" : "target"),
    };
  }

  return null;
}

export function buildFasciaExplanation({
  summary = "",
  drivers = [],
  dataSources = [],
  whyStatusAssigned = "",
  limitations = [],
  recommendedAction = null,
  sourceMode = "",
} = {}) {
  return {
    summary,
    drivers: unique(drivers).slice(0, 3),
    dataSources: unique(dataSources).slice(0, 5),
    whyStatusAssigned,
    limitations: unique(limitations).slice(0, 4),
    recommendedAction: normalizeFasciaAction(recommendedAction)
      ? {
          ...recommendedAction,
          action: normalizeFasciaAction(recommendedAction.action || recommendedAction),
        }
      : recommendedAction?.label
        ? {
            ...recommendedAction,
            action: normalizeFasciaAction(recommendedAction.action || null),
          }
        : null,
    sourceMode,
  };
}

export function buildFasciaExplanationToggleAction(label = "Why this status?") {
  return normalizeFasciaAction({
    label,
    kind: "toggle_explanation",
  });
}

export function finalizeFascia({
  title,
  status = "Not Enough Data",
  sourceMode = "",
  sourceLabel = "",
  sourceTone,
  meaning = "",
  drivers = [],
  primaryAction = null,
  secondaryAction = null,
  tertiaryAction = null,
  completenessNote = "",
  explanation = null,
} = {}) {
  const normalizedPrimaryAction = normalizeFasciaAction(primaryAction);
  const normalizedSecondaryAction = normalizeFasciaAction(secondaryAction);
  const normalizedTertiaryAction = normalizeFasciaAction(tertiaryAction);
  const normalizedDrivers = unique(drivers).slice(0, 3);
  const primaryKey = normalizedPrimaryAction
    ? `${normalizedPrimaryAction.label}::${normalizedPrimaryAction.kind}::${serializeActionTarget(normalizedPrimaryAction)}`
    : "";
  const secondaryKey = normalizedSecondaryAction
    ? `${normalizedSecondaryAction.label}::${normalizedSecondaryAction.kind}::${serializeActionTarget(normalizedSecondaryAction)}`
    : "";

  return {
    title,
    status,
    statusTone: buildFasciaStatusTone(status),
    ...buildFasciaSource({
      sourceMode,
      sourceLabel,
      sourceTone,
      status,
    }),
    meaning,
    drivers: normalizedDrivers,
    primaryAction: normalizedPrimaryAction,
    secondaryAction: primaryKey && primaryKey === secondaryKey ? null : normalizedSecondaryAction,
    tertiaryAction: normalizedTertiaryAction,
    completenessNote,
    explanation: explanation ? buildFasciaExplanation(explanation) : null,
  };
}
