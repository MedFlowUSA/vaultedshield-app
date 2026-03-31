import { extractTextFromImage } from "../ocr/extractTextFromImage";
import { preprocessImageForOCR } from "../ocr/preprocessImageForOCR";
import { extractPdfTextSafe } from "../pdf/safePdfExtraction";

function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
}

function isImageFile(file) {
  return String(file?.type || "").startsWith("image/");
}

async function extractPdfText(file) {
  const result = await extractPdfTextSafe(file);
  return {
    success: result.success,
    text: result.text,
    pages: result.pages,
    sourceType: "pdf",
    ocrConfidence: null,
    extractionWarnings: result.warnings || [],
    extractionMethod: `pdf_text:${result.metadata.methodUsed}:${result.metadata.retryUsed ? "compatibility_retry" : "primary"}`,
    pageCount: result.pageCount,
    warnings: result.warnings || [],
    classifiedError: result.classifiedError || null,
    diagnostics: result.diagnostics,
  };
}

async function extractImageText(file, onProgress) {
  const preprocessedFile = await preprocessImageForOCR(file);
  const result = await extractTextFromImage(preprocessedFile, onProgress);

  return {
    success: true,
    text: result.text,
    pages: [result.text],
    sourceType: "image",
    ocrConfidence: result.confidence,
    extractionWarnings: result.warnings || [],
    extractionMethod: "tesseractjs",
    ocrLines: result.lines || [],
    pageCount: result.text ? 1 : 0,
    warnings: result.warnings || [],
    classifiedError: null,
    diagnostics: undefined,
  };
}

export async function extractDocumentText(file, options = {}) {
  if (!file) {
    throw new Error("A document file is required.");
  }

  if (isPdfFile(file)) {
    return extractPdfText(file, options);
  }

  if (isImageFile(file)) {
    return extractImageText(file, options.onProgress);
  }

  return {
    success: false,
    text: "",
    pages: [],
    sourceType: "unsupported",
    ocrConfidence: null,
    extractionWarnings: ["Unsupported document type."],
    extractionMethod: "unsupported",
    pageCount: 0,
    warnings: ["Unsupported document type."],
    classifiedError: { kind: "unsupported_file", message: "Unsupported document type." },
    diagnostics: undefined,
  };
}
