import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { extractTextFromImage } from "../ocr/extractTextFromImage";
import { preprocessImageForOCR } from "../ocr/preprocessImageForOCR";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
}

function isImageFile(file) {
  return String(file?.type || "").startsWith("image/");
}

async function extractPdfText(file) {
  const arrayBuffer =
    typeof file?.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    pages.push(textContent.items.map((item) => item.str).join("\n"));
  }

  return {
    text: pages.join("\n"),
    pages,
    sourceType: "pdf",
    ocrConfidence: null,
    extractionWarnings: [],
    extractionMethod: "pdf_text",
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
    return extractPdfText(file);
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
