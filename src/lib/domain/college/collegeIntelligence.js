function roundConfidence(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function analyzeCollegePlanReadiness(score = {}) {
  const currentSavings = Number(score?.inputs?.currentSavings || 0);
  const monthlyContribution = Number(score?.inputs?.monthlyContribution || 0);
  const targetSavings = Number(score?.inputs?.targetSavings || 0);
  const yearsUntilCollege = Number(score?.inputs?.yearsUntilCollege || 0);
  const readinessScore = Number(score?.readinessScore || 0);
  const validationMessages = Array.isArray(score?.validationMessages) ? score.validationMessages : [];

  const notes = [];
  const flags = [];
  let confidence = 0.35;

  if (targetSavings > 0) confidence += 0.15;
  if (currentSavings > 0) confidence += 0.15;
  if (monthlyContribution > 0) confidence += 0.15;
  if (yearsUntilCollege > 0) confidence += 0.1;
  if (!validationMessages.length) confidence += 0.1;

  let timelineStatus = "limited";
  if (yearsUntilCollege >= 8) {
    timelineStatus = "long";
  } else if (yearsUntilCollege >= 4) {
    timelineStatus = "moderate";
  } else if (yearsUntilCollege > 0) {
    timelineStatus = "short";
  }

  if (currentSavings === 0) {
    flags.push("starting_savings_limited");
    notes.push("Current college savings are still at or near zero in this plan.");
  }
  if (monthlyContribution === 0) {
    flags.push("contribution_pace_missing");
    notes.push("Monthly contribution pace is currently zero, so growth depends entirely on existing savings.");
  } else if (monthlyContribution < 250) {
    flags.push("contribution_pace_light");
    notes.push("Monthly contribution pace is relatively light for a long-term college target.");
  }
  if (yearsUntilCollege <= 4) {
    flags.push("timeline_short");
    notes.push("College is relatively close, so the plan has less time to recover from a savings gap.");
  } else if (yearsUntilCollege >= 10) {
    notes.push("The plan still has a longer runway, which gives contributions more time to compound.");
  }
  if (readinessScore >= 90) {
    notes.push("Current savings pace appears close to the stated college target.");
  } else if (readinessScore < 70) {
    notes.push("The current savings pace may not fully reach the stated college target without changes.");
  }
  if (validationMessages.length > 0) {
    notes.push(`${pluralize(validationMessages.length, "planning guardrail")} are affecting this estimate.`);
  }

  let planStatus = "Needs Review";
  if (readinessScore >= 90 && currentSavings > 0 && monthlyContribution > 0) {
    planStatus = "Better Supported";
  } else if (readinessScore >= 60 && targetSavings > 0) {
    planStatus = "Usable";
  }

  const headline =
    planStatus === "Better Supported"
      ? "This college plan currently looks more supported by its savings pace, timeline, and goal structure."
      : planStatus === "Usable"
        ? "This college plan is usable, but contribution pace, timeline, or starting savings still leave room for improvement."
        : "This college plan still needs a stronger savings pace or more time before it can be treated as well supported.";

  return {
    planStatus,
    confidence: roundConfidence(confidence),
    timelineStatus,
    notes: [...new Set(notes)].slice(0, 5),
    flags: [...new Set(flags)],
    metrics: {
      currentSavingsVisible: currentSavings > 0,
      contributionVisible: monthlyContribution > 0,
      targetVisible: targetSavings > 0,
      yearsUntilCollege,
      readinessScore,
    },
    headline,
  };
}

export function summarizeCollegeHousehold(plans = []) {
  const safePlans = Array.isArray(plans) ? plans : [];

  if (!safePlans.length) {
    return {
      status: "Needs Setup",
      confidence: 0.1,
      headline: "No college plans are visible yet, so education funding readiness is still not in view for the household.",
      notes: ["Add at least one child plan to start building education-funding visibility for the household."],
      metrics: {
        totalPlans: 0,
        onTrackCount: 0,
        behindCount: 0,
      },
    };
  }

  const onTrackCount = safePlans.filter((plan) => plan.readinessStatus === "On Track").length;
  const behindCount = safePlans.filter((plan) => ["Behind", "Needs Attention"].includes(plan.readinessStatus)).length;
  const slightlyBehindCount = safePlans.filter((plan) => plan.readinessStatus === "Slightly Behind").length;

  const notes = [];
  if (behindCount > 0) {
    notes.push(`${pluralize(behindCount, "child plan")} currently show a more meaningful college funding gap.`);
  }
  if (slightlyBehindCount > 0) {
    notes.push(`${pluralize(slightlyBehindCount, "child plan")} are close, but still slightly behind target.`);
  }
  if (onTrackCount > 0) {
    notes.push(`${pluralize(onTrackCount, "child plan")} are currently on track from the saved assumptions.`);
  }

  const headline =
    behindCount > 0
      ? "Household college planning is active, but one or more child plans still show a visible funding gap."
      : onTrackCount === safePlans.length
        ? "Household college planning currently looks well supported from the saved child plans."
        : "Household college planning is usable, with some plans still needing contribution or timeline review.";

  return {
    status: behindCount > 0 ? "Needs Review" : onTrackCount === safePlans.length ? "Better Supported" : "Monitor",
    confidence: roundConfidence(0.45 + safePlans.length * 0.1),
    headline,
    notes: notes.slice(0, 4),
    metrics: {
      totalPlans: safePlans.length,
      onTrackCount,
      behindCount,
    },
  };
}
