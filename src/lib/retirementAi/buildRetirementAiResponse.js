function signalSentence(retirementSignals = null) {
  if (!retirementSignals) return "";
  const label = String(retirementSignals.signalLevel || "monitor").replace(/_/g, " ");
  return `Overall, this account currently reads as ${label}.`;
}

function firstReason(retirementSignals = null) {
  return retirementSignals?.reasons?.[0] || "The current account evidence is still mixed.";
}

export function buildRetirementAiResponse({
  intent = { intent: "general_summary" },
  retirementSignals = null,
  retirementRead = null,
  retirementActionFeed = [],
  positionSummary = null,
  latestSnapshot = null,
} = {}) {
  const topAction = retirementActionFeed[0] || null;
  const statementDate =
    latestSnapshot?.normalized_retirement?.statement_context?.statement_date ||
    latestSnapshot?.snapshot_date ||
    "not clearly visible";
  const answerParts = [];
  const evidence = [];

  switch (intent.intent) {
    case "review_first":
      answerParts.push(signalSentence(retirementSignals));
      answerParts.push(
        topAction
          ? `The clearest next review is ${topAction.title.toLowerCase()} because ${topAction.summary.charAt(0).toLowerCase()}${topAction.summary.slice(1)}`
          : firstReason(retirementSignals)
      );
      evidence.push(topAction?.summary, firstReason(retirementSignals));
      break;
    case "risk_summary":
      answerParts.push(signalSentence(retirementSignals));
      answerParts.push(firstReason(retirementSignals));
      if (retirementSignals?.flags.loanRisk) {
        answerParts.push("Loan-related pressure is visible in the current account read.");
      }
      if (retirementSignals?.flags.beneficiaryRisk) {
        answerParts.push("Beneficiary visibility is also incomplete or uncertain.");
      }
      evidence.push(...(retirementSignals?.reasons || []).slice(0, 3));
      break;
    case "concentration":
      answerParts.push(signalSentence(retirementSignals));
      answerParts.push(
        retirementSignals?.flags.concentrationRisk
          ? positionSummary?.concentrationNote || "A single holding appears to dominate the visible allocation mix."
          : "No strong concentration warning is visible in the currently parsed position set."
      );
      evidence.push(
        positionSummary?.topHolding
          ? `Top holding: ${positionSummary.topHolding.position_name || "Unnamed"}`
          : "Top holding is not yet clearly visible.",
        `Parsed positions: ${positionSummary?.count ?? 0}.`
      );
      break;
    case "loan_beneficiary":
      answerParts.push(signalSentence(retirementSignals));
      answerParts.push(
        retirementSignals?.flags.loanRisk
          ? "Loan-related signals are visible in the current account evidence."
          : "No strong loan warning is visible in the current account evidence."
      );
      answerParts.push(
        retirementSignals?.flags.beneficiaryRisk
          ? "Beneficiary information is missing or uncertain in the current read."
          : "Beneficiary visibility does not show a strong warning right now."
      );
      evidence.push(
        ...(retirementSignals?.reasons || []).filter((reason) => reason.includes("Loan") || reason.includes("Beneficiary")).slice(0, 2)
      );
      break;
    case "incomplete_data":
      answerParts.push(signalSentence(retirementSignals));
      answerParts.push(
        retirementSignals?.flags.incompleteData
          ? "The account still has incomplete balance, contribution, statement, or allocation support."
          : "The current evidence stack does not show a major incomplete-data warning."
      );
      answerParts.push(`Latest visible statement date: ${statementDate}.`);
      evidence.push(
        `Read confidence: ${Math.round((retirementRead?.confidence || 0) * 100)}%.`,
        firstReason(retirementSignals)
      );
      break;
    case "account_health":
      answerParts.push(signalSentence(retirementSignals));
      answerParts.push(retirementRead?.headline || firstReason(retirementSignals));
      answerParts.push(`Current read confidence is ${Math.round((retirementRead?.confidence || 0) * 100)}%.`);
      evidence.push(
        `Read status: ${retirementRead?.readinessStatus || "Needs Review"}.`,
        firstReason(retirementSignals)
      );
      break;
    default:
      answerParts.push(signalSentence(retirementSignals));
      answerParts.push(retirementRead?.headline || firstReason(retirementSignals));
      if (topAction) {
        answerParts.push(`The current review queue starts with ${topAction.title.toLowerCase()}.`);
        evidence.push(topAction.summary);
      }
      evidence.push(firstReason(retirementSignals));
      break;
  }

  const answer = answerParts
    .filter(Boolean)
    .join(" ")
    .replace(/\.\./g, ".")
    .trim();

  return {
    answer: /[.!?]$/.test(answer) ? answer : `${answer}.`,
    evidence: [...new Set(evidence.filter(Boolean))].slice(0, 5),
    confidence: retirementSignals?.confidence ?? retirementRead?.confidence ?? 0.5,
  };
}

export default buildRetirementAiResponse;
