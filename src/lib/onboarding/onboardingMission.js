function getStageLabel(progressPercent = 0) {
  if (progressPercent >= 85) return "Core setup in place";
  if (progressPercent >= 50) return "Household picture taking shape";
  if (progressPercent > 0) return "First signals forming";
  return "Foundation not started";
}

function buildUnlockedPreview(blankState = {}) {
  const setupCounts = blankState.setupCounts || {};
  const preview = [];

  if ((setupCounts.assets || 0) === 0) {
    preview.push("Add one real asset and VaultedShield can start building a household map instead of a blank shell.");
  } else {
    preview.push("Existing assets can begin linking into housing, insurance, banking, or retirement continuity views.");
  }

  if ((setupCounts.documents || 0) === 0) {
    preview.push("Upload one statement or legal document to start evidence-backed review instead of setup-only guidance.");
  } else {
    preview.push("Saved documents can start supporting stronger continuity, report quality, and detail-page insight.");
  }

  if ((setupCounts.policies || 0) === 0) {
    preview.push("Your first policy unlocks deeper insurance intelligence and a more useful household score.");
  } else {
    preview.push("Insurance visibility is active, so the next gains come from better statements, links, and supporting records.");
  }

  return preview.slice(0, 3);
}

export function buildHouseholdOnboardingMission({
  blankState = {},
  checklist = [],
  progressPercent = 0,
} = {}) {
  const nextStep = checklist.find((item) => !item.complete) || null;
  const completedCount = checklist.filter((item) => item.complete).length;
  const totalCount = checklist.length;
  const stageLabel = getStageLabel(progressPercent);
  const preview = buildUnlockedPreview(blankState);

  const headline = nextStep
    ? `Next best move: ${nextStep.label}`
    : "Core household setup is in place";

  const explanation = nextStep
    ? nextStep.hint || "Finish the next setup step to unlock a more useful household read."
    : "VaultedShield has enough foundation data to shift from setup into ongoing household review.";
  const unlockPreview = preview.length > 0
    ? preview.join(" ")
    : "Add a few core household records and VaultedShield will start replacing setup guidance with stronger live review signals.";

  const urgency = nextStep
    ? progressPercent === 0
      ? "Start here"
      : progressPercent < 50
        ? "Keep building"
        : "Finish the foundation"
    : "Ready for review";

  return {
    stageLabel,
    urgency,
    headline,
    explanation,
    completionSummary: `${completedCount} of ${totalCount} core setup steps complete`,
    nextStep: nextStep
      ? {
          label: nextStep.label,
          route: nextStep.route,
          hint: nextStep.hint,
        }
      : null,
    preview,
    unlockPreview,
  };
}
