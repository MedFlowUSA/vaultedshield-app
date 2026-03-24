import {
  getRetirementDocumentClass,
  getRetirementProvider,
  getRetirementType,
  listRetirementDocumentClasses,
  listRetirementProviders,
  listRetirementTypes,
} from "../../domain/retirement";

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function confidenceFromScore(score) {
  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function scoreDocumentClass(text, fileName, manualDocumentClassKey) {
  const normalizedText = normalizeText(text);
  const normalizedFileName = normalizeText(fileName);
  const scores = listRetirementDocumentClasses().map((documentClass) => {
    let score = 0;
    const evidence = [];

    if (manualDocumentClassKey && documentClass.document_class_key === manualDocumentClassKey) {
      score += 6;
      evidence.push(`manual_document_class:${manualDocumentClassKey}`);
    }

    if (normalizedFileName.includes(documentClass.document_class_key.replace(/_/g, " "))) {
      score += 2;
      evidence.push(`filename:${documentClass.document_class_key}`);
    }

    if (normalizedFileName.includes(documentClass.display_name.toLowerCase())) {
      score += 2;
      evidence.push(`filename:${documentClass.display_name}`);
    }

    documentClass.expected_fields.forEach((field) => {
      const label = field.replace(/_/g, " ");
      if (normalizedText.includes(label)) {
        score += 1;
        evidence.push(`field:${label}`);
      }
    });

    return {
      document_class_key: documentClass.document_class_key,
      score,
      evidence,
    };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0] || { document_class_key: manualDocumentClassKey || null, score: 0, evidence: [] };
}

function scoreProvider(text, fileName, manualProviderKey) {
  const normalizedText = normalizeText(text);
  const normalizedFileName = normalizeText(fileName);
  const scores = listRetirementProviders().map((provider) => {
    let score = 0;
    const evidence = [];

    if (manualProviderKey && provider.institution_key === manualProviderKey) {
      score += 6;
      evidence.push(`manual_provider:${manualProviderKey}`);
    }

    if (normalizedText.includes(provider.display_name.toLowerCase())) {
      score += 3;
      evidence.push(`provider_name:${provider.display_name}`);
    }

    provider.known_statement_patterns.forEach((pattern) => {
      if (normalizedText.includes(pattern.toLowerCase()) || normalizedFileName.includes(pattern.toLowerCase())) {
        score += 2;
        evidence.push(`statement_pattern:${pattern}`);
      }
    });

    provider.known_document_labels.forEach((label) => {
      if (normalizedText.includes(label.toLowerCase())) {
        score += 1;
        evidence.push(`document_label:${label}`);
      }
    });

    return {
      provider_key: provider.institution_key,
      score,
      evidence,
    };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0] || { provider_key: manualProviderKey || null, score: 0, evidence: [] };
}

function scoreRetirementType(text, manualRetirementTypeKey) {
  const normalizedText = normalizeText(text);
  const scores = listRetirementTypes().map((retirementType) => {
    let score = 0;
    const evidence = [];

    if (manualRetirementTypeKey && retirementType.retirement_type_key === manualRetirementTypeKey) {
      score += 4;
      evidence.push(`manual_retirement_type:${manualRetirementTypeKey}`);
    }

    if (normalizedText.includes(retirementType.display_name.toLowerCase())) {
      score += 3;
      evidence.push(`type_name:${retirementType.display_name}`);
    }

    retirementType.common_document_labels.forEach((label) => {
      if (normalizedText.includes(label.toLowerCase())) {
        score += 1;
        evidence.push(`type_label:${label}`);
      }
    });

    return {
      retirement_type_key: retirementType.retirement_type_key,
      score,
      evidence,
    };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0] || { retirement_type_key: manualRetirementTypeKey || null, score: 0, evidence: [] };
}

function inferBias(documentClassKey, retirementTypeKey) {
  const retirementType = retirementTypeKey ? getRetirementType(retirementTypeKey) : null;

  if (retirementType) {
    return {
      account_based: Boolean(retirementType.account_based),
      benefit_based: Boolean(retirementType.benefit_based),
    };
  }

  if (documentClassKey === "pension_estimate") {
    return { account_based: false, benefit_based: true };
  }

  return { account_based: true, benefit_based: false };
}

export function classifyRetirementDocument({
  text,
  fileName,
  manualDocumentClassKey,
  manualProviderKey,
  manualRetirementTypeKey,
}) {
  const documentClass = scoreDocumentClass(text, fileName, manualDocumentClassKey);
  const provider = scoreProvider(text, fileName, manualProviderKey);
  const retirementType = scoreRetirementType(text, manualRetirementTypeKey);
  const bias = inferBias(documentClass.document_class_key, retirementType.retirement_type_key);
  const combinedScore = documentClass.score + provider.score + retirementType.score;

  return {
    document_class_key:
      documentClass.score > 0
        ? documentClass.document_class_key
        : manualDocumentClassKey || null,
    provider_key:
      provider.score > 0
        ? provider.provider_key
        : manualProviderKey || null,
    retirement_type_key:
      retirementType.score > 0
        ? retirementType.retirement_type_key
        : manualRetirementTypeKey || null,
    account_based_bias: bias.account_based,
    benefit_based_bias: bias.benefit_based,
    confidence: confidenceFromScore(combinedScore),
    evidence: [
      ...documentClass.evidence,
      ...provider.evidence,
      ...retirementType.evidence,
    ],
    provider_profile: provider.provider_key ? getRetirementProvider(provider.provider_key) : null,
    document_class_profile: documentClass.document_class_key
      ? getRetirementDocumentClass(documentClass.document_class_key)
      : null,
    retirement_type_profile: retirementType.retirement_type_key
      ? getRetirementType(retirementType.retirement_type_key)
      : null,
  };
}
