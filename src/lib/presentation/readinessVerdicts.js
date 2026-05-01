const LABEL_MAP = {
  strong: "Strong",
  excellent: "Strong",
  healthy: "Strong",
  ready: "Strong",
  stable: "Stable",
  good: "Stable",
  moderate: "Watch",
  usable: "Watch",
  partial: "Watch",
  building: "Watch",
  developing: "Watch",
  watch: "Watch",
  starter: "Watch",
  "needs review": "Needs Review",
  "needs attention": "Needs Review",
  "at risk": "Needs Review",
  weak: "Needs Review",
  alert: "Needs Review",
};

const TONE_MAP = {
  Strong: "good",
  Stable: "good",
  Watch: "warning",
  "Needs Review": "alert",
};

const ACCENT_MAP = {
  Strong: "#16a34a",
  Stable: "#2563eb",
  Watch: "#b45309",
  "Needs Review": "#b91c1c",
};

const PALETTE_MAP = {
  good: {
    accent: "#22c55e",
    soft: "rgba(34, 197, 94, 0.14)",
    text: "#166534",
  },
  warning: {
    accent: "#f59e0b",
    soft: "rgba(245, 158, 11, 0.14)",
    text: "#92400e",
  },
  alert: {
    accent: "#ef4444",
    soft: "rgba(239, 68, 68, 0.14)",
    text: "#991b1b",
  },
  info: {
    accent: "#3b82f6",
    soft: "rgba(59, 130, 246, 0.14)",
    text: "#1d4ed8",
  },
  neutral: {
    accent: "#94a3b8",
    soft: "rgba(148, 163, 184, 0.14)",
    text: "#475569",
  },
};

const FASCIA_STATUS_LABELS = {
  simpleRead: "Simple Read",
  needsReview: "Needs Review",
  calm: "Calm Right Now",
  recentlyImproved: "Recently Improved",
  building: "Building",
  missingInformation: "Missing Information",
  wellSupported: "Well Supported",
  guidedAction: "Guided Action",
  guidedFocus: "Guided Focus",
};

export function normalizeReadinessVerdictLabel(label, fallback = "Watch") {
  const normalized = String(label || "").trim().toLowerCase();
  return LABEL_MAP[normalized] || fallback;
}

export function getReadinessLabelFromScore(score = 0, thresholds = {}) {
  const {
    strong = 82,
    stable = 64,
    watch = 50,
  } = thresholds;

  if (score >= strong) return "Strong";
  if (score >= stable) return "Stable";
  if (score >= watch) return "Watch";
  return "Needs Review";
}

export function getReadinessVerdictTone(label, fallback = "info") {
  return TONE_MAP[normalizeReadinessVerdictLabel(label, null)] || fallback;
}

export function getReadinessVerdictAccent(label, fallback = "#475569") {
  return ACCENT_MAP[normalizeReadinessVerdictLabel(label, null)] || fallback;
}

export function getReadinessVerdictHeadline(label, headlines = {}) {
  const normalized = normalizeReadinessVerdictLabel(label);
  const {
    strong = "Looks strong",
    stable = "Good progress!",
    watch = "Worth watching",
    needsReview = "Needs attention",
  } = headlines;

  if (normalized === "Strong") return strong;
  if (normalized === "Stable") return stable;
  if (normalized === "Watch") return watch;
  return needsReview;
}

export function getReadinessToneFromScore(score = 0, thresholds = {}) {
  const {
    strong = 82,
    stable = 64,
    watch = 50,
  } = thresholds;

  if (score >= strong) return "good";
  if (score >= stable) return "info";
  if (score >= watch) return "warning";
  return "alert";
}

export function getReadinessPalette(tone = "info") {
  return PALETTE_MAP[tone] || PALETTE_MAP.info;
}

export function scoreFromReadinessStatus(status = "", fallback = 46) {
  const normalized = normalizeReadinessVerdictLabel(status, null);
  if (normalized === "Strong") return 88;
  if (normalized === "Stable") return 72;
  if (normalized === "Watch") return 56;
  if (normalized === "Needs Review") return 42;
  return fallback;
}

export function getFriendlyRingStatus(score, { count = 1, allowExcellent = true, emptyLabel = "Missing Items" } = {}) {
  if ((count || 0) === 0) return emptyLabel;
  if (allowExcellent && score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 50) return "Needs Review";
  return "Needs Attention";
}

export function getStatusPresentation(status = "", fallbackTone = "neutral") {
  const normalized = String(status || "").trim().toLowerCase();

  if (["excellent", "strong", "healthy", "ready", "current", "live", "well supported", "recently improved"].includes(normalized)) {
    const palette = getReadinessPalette("good");
    return { color: palette.text, background: palette.soft, tone: "good" };
  }

  if (["good", "stable", "active", "available", "calm right now"].includes(normalized)) {
    const palette = getReadinessPalette("info");
    return { color: palette.text, background: palette.soft, tone: "info" };
  }

  if (["moderate", "watch", "building", "usable", "partial", "missing information", "missing items", "guided action", "guided focus", "simple read", "monitor"].includes(normalized)) {
    const palette = getReadinessPalette("warning");
    return { color: palette.text, background: palette.soft, tone: "warning" };
  }

  if (["needs review", "needs attention", "at risk", "weak"].includes(normalized)) {
    const palette = getReadinessPalette("alert");
    return { color: palette.text, background: palette.soft, tone: "alert" };
  }

  const palette = getReadinessPalette(fallbackTone);
  return { color: palette.text, background: palette.soft, tone: fallbackTone };
}

export function getFasciaStatusLabel(kind, options = {}) {
  const {
    active = false,
    improved = false,
    missing = false,
  } = options;

  if (kind === "simpleRead") return FASCIA_STATUS_LABELS.simpleRead;
  if (kind === "attention") return active ? FASCIA_STATUS_LABELS.needsReview : FASCIA_STATUS_LABELS.calm;
  if (kind === "progress") return improved ? FASCIA_STATUS_LABELS.recentlyImproved : FASCIA_STATUS_LABELS.building;
  if (kind === "evidence") return missing ? FASCIA_STATUS_LABELS.missingInformation : FASCIA_STATUS_LABELS.wellSupported;
  if (kind === "nextStep") return FASCIA_STATUS_LABELS.guidedAction;
  if (kind === "focus") return FASCIA_STATUS_LABELS.guidedFocus;

  return FASCIA_STATUS_LABELS.simpleRead;
}

export function buildReadinessVerdict({ label, summary = "", headlines = {}, fallback = "Watch" } = {}) {
  const normalizedLabel = normalizeReadinessVerdictLabel(label, fallback);
  return {
    label: normalizedLabel,
    summary,
    tone: getReadinessVerdictTone(normalizedLabel),
    accent: getReadinessVerdictAccent(normalizedLabel),
    headline: getReadinessVerdictHeadline(normalizedLabel, headlines),
  };
}
