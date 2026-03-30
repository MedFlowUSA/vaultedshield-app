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
  return {
    isEmpty: normalized.pageCount === 0,
    isLowQuality: normalized.metadata.flags.includes("low_quality_document"),
    textLength: normalized.text.trim().length,
  };
}

export { LOW_QUALITY_TEXT_THRESHOLD };
