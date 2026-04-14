export const PROPERTY_QUESTION_TYPES = {
  stack_completeness: "stack_completeness",
  valuation_read: "valuation_read",
  linked_context: "linked_context",
  protections: "protections",
  liabilities: "liabilities",
  documents: "documents",
  portals: "portals",
  missing_data: "missing_data",
  general: "general",
};

const CLASSIFICATION_RULES = [
  {
    type: PROPERTY_QUESTION_TYPES.portals,
    keywords: ["portal", "portals", "county access", "tax portal", "login"],
  },
  {
    type: PROPERTY_QUESTION_TYPES.documents,
    keywords: ["document", "documents", "deed", "assessment", "paperwork", "file"],
  },
  {
    type: PROPERTY_QUESTION_TYPES.protections,
    keywords: ["protection", "homeowners", "coverage", "insured"],
  },
  {
    type: PROPERTY_QUESTION_TYPES.liabilities,
    keywords: ["mortgage", "debt", "liability", "loan", "financing"],
  },
  {
    type: PROPERTY_QUESTION_TYPES.stack_completeness,
    keywords: ["stack", "complete", "completeness", "connected", "record strength"],
  },
  {
    type: PROPERTY_QUESTION_TYPES.linked_context,
    keywords: ["linked", "context", "relationship", "household", "operating graph"],
  },
  {
    type: PROPERTY_QUESTION_TYPES.missing_data,
    keywords: ["missing", "incomplete", "thin", "unknown", "what is missing", "what's missing"],
  },
  {
    type: PROPERTY_QUESTION_TYPES.valuation_read,
    keywords: ["valuation", "value", "appraisal", "estimate", "comps", "market"],
  },
];

export function classifyPropertyQuestionType(question = "") {
  const normalized = String(question || "").trim().toLowerCase();
  if (!normalized) return PROPERTY_QUESTION_TYPES.general;

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.type;
    }
  }

  return PROPERTY_QUESTION_TYPES.general;
}

export default classifyPropertyQuestionType;
