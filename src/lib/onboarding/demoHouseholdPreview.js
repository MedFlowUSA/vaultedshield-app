export function buildDemoHouseholdPreview() {
  return {
    householdLabel: "Sample household preview",
    score: {
      overall: 78,
      status: "Moderate strength",
      dimensions: [
        { label: "Protection", value: 84 },
        { label: "Property", value: 80 },
        { label: "Documentation", value: 63 },
        { label: "Continuity", value: 71 },
      ],
    },
    priorities: [
      {
        label: "Add the latest annual statement for one life policy",
        impact: "Important",
        reason: "Without a current statement, the household read stays weaker and policy drift is harder to verify.",
        nextAction: "Upload a statement packet in the life policy workflow.",
      },
      {
        label: "Link one homeowner policy to the primary property",
        impact: "Important",
        reason: "Housing continuity is much stronger when property, mortgage, and homeowners records are connected.",
        nextAction: "Open Property or Homeowners and complete the link.",
      },
      {
        label: "Add one emergency contact with recovery context",
        impact: "Review",
        reason: "Continuity tools are more useful once a trusted handoff contact is recorded.",
        nextAction: "Open Contacts and add a family or successor contact.",
      },
    ],
    modules: [
      { label: "Insurance Intelligence", status: "Strong", note: "Policy visibility is active and review-ready." },
      { label: "Housing Continuity", status: "Moderate", note: "Property and mortgage are visible, but one link is still missing." },
      { label: "Vault + Uploads", status: "Moderate", note: "A few documents are stored, but statement freshness still matters." },
      { label: "Emergency Access", status: "Building", note: "Portal recovery and handoff records are only partially connected." },
    ],
  };
}

function classifyDemoQuestion(questionText = "") {
  const text = String(questionText || "").toLowerCase();

  if (/(score|improve my score|hurt|hurting)/.test(text)) return "score";
  if (/(first|priority|review first|what should i do next)/.test(text)) return "priority";
  if (/(document|upload|statement)/.test(text)) return "documents";
  if (/(portal|access|emergency)/.test(text)) return "continuity";
  return "summary";
}

export function answerDemoHouseholdQuestion(questionText = "", preview = buildDemoHouseholdPreview()) {
  const intent = classifyDemoQuestion(questionText);
  const topPriority = preview.priorities[0];
  const weakestDimension = [...preview.score.dimensions].sort((a, b) => a.value - b.value)[0];

  let answerText = `${topPriority.label} is the clearest first move in this sample household because it improves household clarity without requiring a full setup sprint.`;
  let evidencePoints = [
    `Sample score: ${preview.score.overall} (${preview.score.status})`,
    `Top priority: ${topPriority.label}`,
    `Weakest dimension: ${weakestDimension.label} (${weakestDimension.value})`,
  ];

  if (intent === "score") {
    answerText = `${weakestDimension.label} is the biggest drag on this sample household score. Improving ${topPriority.label.toLowerCase()} would be the fastest way to lift the score because it strengthens both readiness and evidence quality.`;
  } else if (intent === "documents") {
    const documentPriority = preview.priorities.find((item) => /statement|document|upload/i.test(item.label) || /statement|document|upload/i.test(item.nextAction)) || topPriority;
    answerText = `${documentPriority.label} is the clearest document-related move in this sample household. The point is to turn thin evidence into a stronger, reviewable record.`;
    evidencePoints = [
      `Best document move: ${documentPriority.label}`,
      `Why it matters: ${documentPriority.reason}`,
      `Next action: ${documentPriority.nextAction}`,
    ];
  } else if (intent === "continuity") {
    const continuityModule = preview.modules.find((item) => /Emergency Access/i.test(item.label)) || preview.modules[preview.modules.length - 1];
    answerText = `${continuityModule.label} is still building in this sample household, which means access recovery and handoff readiness are not fully dependable yet.`;
    evidencePoints = [
      `Module: ${continuityModule.label}`,
      `Status: ${continuityModule.status}`,
      continuityModule.note,
    ];
  } else if (intent === "summary") {
    answerText = `This sample household is in decent shape overall, but it still has a few practical gaps. ${topPriority.label} is first, and ${weakestDimension.label.toLowerCase()} is the dimension that needs the most support.`;
  }

  return {
    intent,
    answer_text: answerText,
    evidence_points: evidencePoints.slice(0, 3),
    followup_prompts: [
      "What would improve my score fastest?",
      "What should I do first?",
      "Why do documents matter here?",
      "How does emergency access fit in?",
    ],
  };
}
