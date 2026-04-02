const LOW_QUALITY_TEXT_THRESHOLD = 80;

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureText(value) {
  return typeof value === "string" ? value : "";
}

export function buildInsuranceDocumentPacket(input = {}) {
  const source = input.source === "scan" ? "scan" : "upload";
  const pages = ensureArray(input.pages)
    .map((page) => (typeof page === "string" ? page : ensureText(page?.text)))
    .filter(Boolean);
  const text = ensureText(input.text) || pages.join("\n\n");
  const pageCount =
    Number.isFinite(Number(input.pageCount)) && Number(input.pageCount) > 0
      ? Number(input.pageCount)
      : pages.length;

  return {
    pages,
    text,
    pageCount,
    source,
    metadata: {
      file: input.file || null,
      fileName: input.fileName || input.file?.name || "",
      extractionMethod: input.extractionMethod || "",
      extractionWarnings: ensureArray(input.extractionWarnings).filter(Boolean),
      pageOcr: ensureArray(input.pageOcr),
      ocrConfidence:
        input.ocrConfidence === null || input.ocrConfidence === undefined
          ? null
          : Number(input.ocrConfidence),
      ...((input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata))
        ? input.metadata
        : {}),
    },
  };
}

export function normalizeExtractionInput(packet) {
  const safePacket = buildInsuranceDocumentPacket(packet);
  const normalized = {
    pages: ensureArray(safePacket.pages),
    text: ensureText(safePacket.text),
    pageCount:
      Number.isFinite(Number(safePacket.pageCount)) && Number(safePacket.pageCount) > 0
        ? Number(safePacket.pageCount)
        : ensureArray(safePacket.pages).length,
    source: safePacket.source,
    metadata: {
      ...safePacket.metadata,
      flags: ensureArray(safePacket.metadata?.flags),
    },
  };

  if (normalized.pageCount === 0) {
    normalized.metadata.flags.push("empty_packet");
  }

  if (normalized.text.trim().length < LOW_QUALITY_TEXT_THRESHOLD) {
    normalized.metadata.flags.push("low_quality_document");
  }

  return normalized;
}

export function classifyPacketQuality(packet) {
  const normalized = normalizeExtractionInput(packet);
  const warnings = ensureArray(normalized.metadata?.extractionWarnings).filter(Boolean);
  const pageOcr = ensureArray(normalized.metadata?.pageOcr);
  const ocrConfidence =
    normalized.metadata?.ocrConfidence === null || normalized.metadata?.ocrConfidence === undefined
      ? null
      : Number(normalized.metadata.ocrConfidence);
  const poorPages = pageOcr.filter((page) => page?.quality_level === "poor").length;
  const fairPages = pageOcr.filter((page) => page?.quality_level === "fair").length;
  const lowConfidenceScan = normalized.source === "scan" && ocrConfidence !== null && ocrConfidence < 70;
  const textLength = normalized.text.trim().length;
  const needsStrongerEvidence =
    normalized.pageCount <= 0 ||
    textLength < LOW_QUALITY_TEXT_THRESHOLD ||
    poorPages > 0 ||
    lowConfidenceScan;

  let level = "good";
  if (needsStrongerEvidence) {
    level = "poor";
  } else if (fairPages > 0 || warnings.length > 0 || (normalized.source === "scan" && ocrConfidence !== null && ocrConfidence < 82)) {
    level = "fair";
  }

  const reasons = [];
  if (normalized.pageCount === 0) reasons.push("No readable pages are in the packet yet.");
  if (textLength < LOW_QUALITY_TEXT_THRESHOLD) reasons.push("Very little readable text was recovered from the packet.");
  if (poorPages > 0) reasons.push(`${poorPages} scanned page${poorPages === 1 ? "" : "s"} look poor for OCR.`);
  if (lowConfidenceScan) reasons.push("OCR confidence is low for the current scan packet.");
  if (warnings.length > 0) reasons.push(`${warnings.length} extraction warning${warnings.length === 1 ? "" : "s"} were detected.`);

  const nextSteps = [];
  if (normalized.pageCount === 0 || textLength < LOW_QUALITY_TEXT_THRESHOLD) {
    nextSteps.push("Upload a cleaner PDF or rescan the core policy pages.");
  }
  if (poorPages > 0 || fairPages > 0 || lowConfidenceScan) {
    nextSteps.push("Retake dark, angled, or cropped scan pages in brighter light.");
  }
  if (warnings.length > 0) {
    nextSteps.push("Include the page with the policy summary, face amount, premium, or statement activity table.");
  }
  if (nextSteps.length === 0) {
    nextSteps.push("This packet looks usable for the insurance reader.");
  }

  return {
    isEmpty: normalized.pageCount === 0,
    isLowQuality: normalized.metadata.flags.includes("low_quality_document"),
    textLength,
    level,
    reasons,
    nextSteps,
    warningCount: warnings.length,
    poorPages,
    fairPages,
    ocrConfidence,
  };
}

export { LOW_QUALITY_TEXT_THRESHOLD };
