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
    text: result.text,
    pages: result.pages,
    sourceType: "pdf",
    ocrConfidence: null,
    extractionWarnings: result.metadata.retryUsed
      ? ["Used mobile-safe PDF compatibility retry while opening this file."]
      : [],
    extractionMethod: `pdf_text:${result.metadata.methodUsed}:${result.metadata.retryUsed ? "compatibility_retry" : "primary"}`,
    pageCount: result.pageCount,
  };
}

async function extractImageText(file, onProgress) {
  const preprocessedFile = await preprocessImageForOCR(file);
  const result = await extractTextFromImage(preprocessedFile, onProgress);

  return {
    text: result.text,
    pages: [result.text],
    sourceType: "image",
    ocrConfidence: result.confidence,
    extractionWarnings: result.warnings || [],
    extractionMethod: "tesseractjs",
    ocrLines: result.lines || [],
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
    text: "",
    pages: [],
    sourceType: "unsupported",
    ocrConfidence: null,
    extractionWarnings: ["Unsupported document type."],
    extractionMethod: "unsupported",
  };
}
