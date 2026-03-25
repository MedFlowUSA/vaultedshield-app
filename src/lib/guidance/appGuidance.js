const GUIDE_QUESTION_STARTERS = [
  "How do I start using VaultedShield?",
  "Where do I upload policy documents?",
  "What is the difference between Upload Center and Life Policy Upload?",
  "What does Insurance Intelligence do?",
  "How should I use the dashboard?",
  "Where do I find reports and continuity outputs?",
];

const GUIDE_QUICK_STARTS = [
  {
    id: "first-day",
    title: "First-Day Setup",
    summary: "Get the app into a usable state for a household without trying to populate every module at once.",
    route: "/dashboard",
    ctaLabel: "Open Dashboard",
    steps: [
      "Start on Dashboard to see current household status, action priorities, and missing areas.",
      "Open Upload Center for generic household documents like wills, trusts, bank statements, or supporting PDFs.",
      "Open Insurance > Life Policy Upload when you want actual life-policy analysis rather than generic storage.",
      "Return to Insurance Intelligence after uploads to review saved policy cards, comparison rows, and focus areas.",
    ],
  },
  {
    id: "life-policy-review",
    title: "Life Policy Review Flow",
    summary: "Use this when you want actual policy intelligence, comparison, and statement-driven review.",
    route: "/insurance/life/upload",
    ctaLabel: "Open Life Upload",
    steps: [
      "Upload the initial policy illustration or baseline policy PDF first.",
      "Add annual statements separately after the baseline file so the app can build trend history and charge visibility.",
      "Open Insurance Intelligence to compare saved policies and identify weak continuity or charge-support areas.",
      "Open a specific policy detail page for deeper interpretation, annual review, and policy-level Q&A.",
    ],
  },
  {
    id: "continuity-review",
    title: "Household Continuity Review",
    summary: "Use this when the goal is household readiness rather than only insurance analysis.",
    route: "/reports",
    ctaLabel: "Open Reports",
    steps: [
      "Use Dashboard to identify the highest-priority household actions across modules.",
      "Use Vault and Upload Center to add missing documents that block continuity confidence.",
      "Use Portals, Contacts, and Emergency Mode to improve successor access, handoff readiness, and operational recovery.",
      "Use Reports once the household file is more complete and you want a printable review output.",
    ],
  },
];

const GUIDE_FEATURES = [
  {
    id: "dashboard",
    title: "Dashboard",
    route: "/dashboard",
    purpose: "Household command center for priorities, risk continuity, review queue, and cross-module signals.",
    bestFor: "Understanding what matters most right now across the household.",
  },
  {
    id: "upload-center",
    title: "Upload Center",
    route: "/upload-center",
    purpose: "Generic household document intake for the vault and cross-module records.",
    bestFor: "Uploading supporting records that are not part of the specialized life-policy parser flow.",
  },
  {
    id: "insurance-intelligence",
    title: "Insurance Intelligence",
    route: "/insurance",
    purpose: "Portfolio-level life-policy review, comparison, ranking, and focus-area analysis.",
    bestFor: "Reviewing multiple saved life policies and seeing which files are weak, incomplete, or high-cost.",
  },
  {
    id: "life-policy-upload",
    title: "Life Policy Upload",
    route: "/insurance/life/upload",
    purpose: "Specialized life-policy upload flow for baseline illustrations and annual statements.",
    bestFor: "Creating or updating the data that powers policy comparison and policy detail views.",
  },
  {
    id: "vault",
    title: "Vault",
    route: "/vault",
    purpose: "Generic stored-document surface for household records already saved into the platform.",
    bestFor: "Reviewing what has been uploaded and whether a document exists at all.",
  },
  {
    id: "reports",
    title: "Reports",
    route: "/reports",
    purpose: "Review-oriented reporting outputs that summarize what the platform has already resolved.",
    bestFor: "Sharing or printing summaries after the underlying records are loaded and reviewed.",
  },
];

const GUIDE_FAQS = [
  {
    id: "start",
    question: "How should a brand new user start?",
    answer:
      "Start with Dashboard to see what the household already has, then use Upload Center for general records and Life Policy Upload for actual insurance analysis. Do not try to fill every module on day one.",
    route: "/dashboard",
  },
  {
    id: "upload-difference",
    question: "What is the difference between Upload Center and Life Policy Upload?",
    answer:
      "Upload Center is generic document intake for the platform vault. Life Policy Upload is the specialized workflow for baseline illustrations and annual statements that feed Insurance Intelligence and policy detail analysis.",
    route: "/insurance/life/upload",
  },
  {
    id: "insurance-intelligence",
    question: "What does Insurance Intelligence actually do?",
    answer:
      "It turns saved life-policy records into a portfolio view: summary metrics, weak areas, comparison rows, policy ranking, and action-oriented review prompts.",
    route: "/insurance",
  },
  {
    id: "dashboard-purpose",
    question: "What is the dashboard for?",
    answer:
      "The dashboard is the household command center. It is where you look first to see priorities, cross-module issues, continuity signals, and what to do next.",
    route: "/dashboard",
  },
  {
    id: "reports",
    question: "When should I use Reports?",
    answer:
      "Use Reports after the household file is sufficiently populated. Reports are strongest when the underlying modules already have real records, not when the household is still empty.",
    route: "/reports",
  },
  {
    id: "plans",
    question: "What does upgrading unlock?",
    answer:
      "Upgrading unlocks deeper review workflows and additional modules. It does not change your household data ownership or mix your account with anyone else.",
    route: "/pricing",
  },
];

function normalizeQuestion(text = "") {
  return String(text || "").trim().toLowerCase();
}

function buildGuideResponse(answerText, route = "/guidance", related = [], followups = []) {
  return {
    answer_text: answerText,
    route,
    related_features: related,
    followup_prompts: followups,
  };
}

export function answerGuideQuestion(questionText = "") {
  const text = normalizeQuestion(questionText);

  if (!text) {
    return buildGuideResponse(
      "Ask how to start, where to upload, what a page is for, or how a specific workflow works.",
      "/guidance",
      ["Dashboard", "Upload Center", "Insurance Intelligence"],
      GUIDE_QUESTION_STARTERS.slice(0, 3)
    );
  }

  if (text.includes("start") || text.includes("new user") || text.includes("begin") || text.includes("first")) {
    return buildGuideResponse(
      "Start on Dashboard, then use Upload Center for generic records and Life Policy Upload for actual life-policy analysis. After that, use Insurance Intelligence and Reports to review what the uploads produced.",
      "/dashboard",
      ["Dashboard", "Upload Center", "Life Policy Upload"],
      [
        "Where do I upload policy documents?",
        "What is the difference between Upload Center and Life Policy Upload?",
        "What does Insurance Intelligence do?",
      ]
    );
  }

  if (text.includes("upload") || text.includes("document") || text.includes("policy file") || text.includes("statement")) {
    return buildGuideResponse(
      "Use Upload Center for generic household records. Use Life Policy Upload when the goal is policy analysis, illustration parsing, statement history, and saved policy intelligence.",
      "/insurance/life/upload",
      ["Upload Center", "Life Policy Upload", "Vault"],
      [
        "What is the difference between Upload Center and Life Policy Upload?",
        "What does Insurance Intelligence do?",
      ]
    );
  }

  if (text.includes("insurance") || text.includes("policy") || text.includes("coi") || text.includes("statement history")) {
    return buildGuideResponse(
      "Insurance Intelligence is the portfolio review layer. It shows saved policy cards, ranking, comparison, weak support areas, and where deeper policy review is needed.",
      "/insurance",
      ["Insurance Intelligence", "Life Policy Upload", "Policy Detail"],
      [
        "Where do I upload policy documents?",
        "How should I use the dashboard?",
      ]
    );
  }

  if (text.includes("dashboard") || text.includes("priority") || text.includes("what next")) {
    return buildGuideResponse(
      "Use Dashboard as the command center. It is the best place to see top actions, continuity gaps, household signals, and which module deserves attention next.",
      "/dashboard",
      ["Dashboard", "Reports", "Portals"],
      [
        "How do I start using VaultedShield?",
        "Where do I find reports and continuity outputs?",
      ]
    );
  }

  if (text.includes("report") || text.includes("print") || text.includes("share")) {
    return buildGuideResponse(
      "Use Reports after the household file has enough real records. Reports are best used as outputs of the review process, not as the starting point for incomplete data.",
      "/reports",
      ["Reports", "Dashboard", "Insurance Intelligence"],
      [
        "How should I use the dashboard?",
        "What does Insurance Intelligence do?",
      ]
    );
  }

  if (text.includes("portal") || text.includes("emergency") || text.includes("access") || text.includes("handoff")) {
    return buildGuideResponse(
      "Use Portals, Contacts, and Emergency Mode when the goal is continuity and successor readiness. Those pages are about access recovery, family handoff, and operational resilience.",
      "/portals",
      ["Portals", "Contacts", "Emergency Mode"],
      [
        "How should a brand new user start?",
        "Where do I find reports and continuity outputs?",
      ]
    );
  }

  if (text.includes("upgrade") || text.includes("plan") || text.includes("pricing")) {
    return buildGuideResponse(
      "Use Pricing when you want to move into deeper workflows or unlock more modules. Upgrading changes access level, not the ownership of your household data.",
      "/pricing",
      ["Pricing", "Dashboard"],
      [
        "How do I start using VaultedShield?",
        "What does Insurance Intelligence do?",
      ]
    );
  }

  return buildGuideResponse(
    "VaultedShield is organized around a simple pattern: Dashboard for priorities, Upload Center for generic records, Life Policy Upload for insurance analysis, Intelligence pages for review, and Reports for outputs.",
    "/guidance",
    ["Dashboard", "Upload Center", "Insurance Intelligence", "Reports"],
    GUIDE_QUESTION_STARTERS.slice(0, 4)
  );
}

export {
  GUIDE_FAQS,
  GUIDE_FEATURES,
  GUIDE_QUICK_STARTS,
  GUIDE_QUESTION_STARTERS,
};
