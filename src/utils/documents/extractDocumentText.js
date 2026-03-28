import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { extractTextFromImage } from "../ocr/extractTextFromImage";
import { preprocessImageForOCR } from "../ocr/preprocessImageForOCR";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_MOBILE_SAFE_PDF_SIZE_BYTES = 20 * 1024 * 1024;

function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
}

function isImageFile(file) {
  return String(file?.type || "").startsWith("image/");
}

function isLikelyMobileSafari() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  return /iP(hone|ad|od)/i.test(userAgent) && /Safari/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS)/i.test(userAgent);
}

function safeDevLog(label, payload) {
  if (!import.meta.env.DEV || typeof console === "undefined") {
    return;
  }

  if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed(label);
    if (typeof console.log === "function") {
      console.log(payload);
    }
    if (typeof console.groupEnd === "function") {
      console.groupEnd();
    }
    return;
  }

  if (typeof console.log === "function") {
    console.log(label, payload);
  }
}

function buildExtractionError(kind, message, cause, meta = {}) {
  const nextError = new Error(message);
  nextError.extractionKind = kind;
  nextError.cause = cause instanceof Error ? cause : new Error(String(cause || message));
  Object.assign(nextError, meta);
  return nextError;
}

function validatePdfFile(file) {
  if (!file) {
    throw buildExtractionError("file_read_failure", "Invalid or missing PDF file.", null);
  }

  if (!isPdfFile(file)) {
    throw buildExtractionError("file_read_failure", "The selected file is not a PDF.", null, {
      fileName: file?.name || null,
      fileType: file?.type || null,
    });
  }

  if (typeof file.size === "number" && file.size <= 0) {
    throw buildExtractionError(
      "file_read_failure",
      "The selected PDF appears to be empty. Please retry with a valid export or rescan.",
      null,
      {
        fileName: file?.name || null,
        fileSize: file?.size || null,
      }
    );
  }

  if (isLikelyMobileSafari() && typeof file.size === "number" && file.size > MAX_MOBILE_SAFE_PDF_SIZE_BYTES) {
    throw buildExtractionError(
      "file_read_failure",
      "This PDF is too large for reliable mobile processing. Try re-exporting a smaller PDF or split the document before uploading.",
      null,
      {
        fileName: file?.name || null,
        fileSize: file?.size || null,
        maxMobileSize: MAX_MOBILE_SAFE_PDF_SIZE_BYTES,
      }
    );
  }
}

async function readFileWithArrayBuffer(file) {
  if (typeof file?.arrayBuffer !== "function") {
    throw new Error("File.arrayBuffer is not available.");
  }
  return file.arrayBuffer();
}

async function readFileWithFileReader(file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is not available."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("FileReader failed."));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
}

async function readFileWithResponse(file) {
  return new Response(file).arrayBuffer();
}

async function readPdfFileSafely(file, preferredMethod = "arrayBuffer") {
  const attempts = [preferredMethod, "fileReader", "response"].filter(
    (method, index, list) => list.indexOf(method) === index
  );
  let lastError = null;

  for (const method of attempts) {
    try {
      let arrayBuffer;
      if (method === "arrayBuffer") {
        arrayBuffer = await readFileWithArrayBuffer(file);
      } else if (method === "fileReader") {
        arrayBuffer = await readFileWithFileReader(file);
      } else {
        arrayBuffer = await readFileWithResponse(file);
      }

      if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
        throw new Error("The selected file did not produce a readable PDF buffer.");
      }

      return {
        arrayBuffer,
        readMethod: method,
      };
    } catch (error) {
      lastError = error;
      safeDevLog("[VaultedShield] pdf file read attempt failed", {
        fileName: file?.name || null,
        fileSize: file?.size || null,
        fileType: file?.type || null,
        readMethod: method,
        errorMessage: error?.message || String(error),
      });
    }
  }

  throw buildExtractionError(
    "file_read_failure",
    "We could not read the selected PDF on this device. Try re-exporting the PDF or rescanning it if this file came from a portal.",
    lastError,
    { fileName: file?.name || null }
  );
}

async function openPdfDocumentSafely(bytes, options = {}) {
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: Boolean(options.disableFontFace),
    useSystemFonts: Boolean(options.useSystemFonts),
    stopAtErrors: false,
  });

  return {
    pdf: await loadingTask.promise,
    loadingTask,
  };
}

async function extractPdfPagesSafely(pdf) {
  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    let page = null;
    try {
      page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      const pageText = Array.isArray(textContent?.items)
        ? textContent.items.map((item) => item?.str || "").join("\n")
        : "";
      pages.push(pageText);
    } catch (error) {
      throw buildExtractionError(
        "page_extraction_failure",
        `The baseline illustration could not be read from page ${pageNum} of the selected PDF.`,
        error,
        { pageNumber: pageNum }
      );
    } finally {
      if (typeof page?.cleanup === "function") {
        try {
          page.cleanup();
        } catch {
          // Ignore cleanup failures; they should not block extraction.
        }
      }
    }
  }

  return pages;
}

async function extractPdfText(file) {
  validatePdfFile(file);

  const mobileSafari = isLikelyMobileSafari();
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const attempts = [
    {
      readMethod: "arrayBuffer",
      disableFontFace: false,
      useSystemFonts: false,
      mode: "primary",
    },
    {
      readMethod: "fileReader",
      disableFontFace: true,
      useSystemFonts: true,
      mode: "compatibility_retry",
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    let loadingTask = null;
    let pdf = null;

    try {
      safeDevLog("[VaultedShield] pdf extraction attempt", {
        fileName: file?.name || null,
        fileSize: file?.size || null,
        fileType: file?.type || null,
        mobileSafari,
        userAgent,
        readMethod: attempt.readMethod,
        mode: attempt.mode,
      });

      const readResult = await readPdfFileSafely(file, attempt.readMethod);
      const bytes = new Uint8Array(readResult.arrayBuffer);

      safeDevLog("[VaultedShield] pdf extraction buffer ready", {
        fileName: file?.name || null,
        readMethod: readResult.readMethod,
        byteLength: bytes.byteLength,
      });

      const openResult = await openPdfDocumentSafely(bytes, attempt);
      loadingTask = openResult.loadingTask;
      pdf = openResult.pdf;

      safeDevLog("[VaultedShield] pdf open succeeded", {
        fileName: file?.name || null,
        readMethod: readResult.readMethod,
        mode: attempt.mode,
        pageCount: pdf?.numPages || 0,
      });

      const pages = await extractPdfPagesSafely(pdf);
      safeDevLog("[VaultedShield] first pdf page extraction status", {
        fileName: file?.name || null,
        firstPageSucceeded: pages.length > 0,
        firstPageLength: pages[0]?.length || 0,
      });

      return {
        text: pages.join("\n"),
        pages,
        sourceType: "pdf",
        ocrConfidence: null,
        extractionWarnings:
          attempt.mode === "compatibility_retry"
            ? ["Used mobile-safe PDF compatibility retry while opening this file."]
            : [],
        extractionMethod: `pdf_text:${readResult.readMethod}:${attempt.mode}`,
        pageCount: pages.length,
      };
    } catch (error) {
      lastError = error;
      safeDevLog("[VaultedShield] pdf extraction attempt failed", {
        fileName: file?.name || null,
        mode: attempt.mode,
        readMethod: attempt.readMethod,
        errorMessage: error?.message || String(error),
        extractionKind: error?.extractionKind || null,
        stack: error?.stack || null,
      });
    } finally {
      if (typeof loadingTask?.destroy === "function") {
        try {
          await loadingTask.destroy();
        } catch {
          // Ignore cleanup failures after extraction completes.
        }
      } else if (typeof pdf?.destroy === "function") {
        try {
          await pdf.destroy();
        } catch {
          // Ignore cleanup failures after extraction completes.
        }
      }
    }
  }

  if (lastError?.extractionKind === "file_read_failure" || lastError?.extractionKind === "page_extraction_failure") {
    throw lastError;
  }

  throw buildExtractionError(
    "pdf_open_failure",
    "We could not open the baseline PDF on this device. Try re-exporting the PDF or rescanning it if this file was created from a portal.",
    lastError,
    { fileName: file?.name || null }
  );
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
