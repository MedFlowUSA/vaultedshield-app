import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_MOBILE_SAFE_PDF_SIZE_BYTES = 20 * 1024 * 1024;

function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
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

function buildDiagnostics(payload) {
  return import.meta.env.DEV ? payload : undefined;
}

function buildExtractionResult({
  success,
  file,
  text = "",
  pages = [],
  pageCount = 0,
  warnings = [],
  classifiedError = null,
  metadata = {},
  diagnostics,
}) {
  return {
    success,
    sourceType: "pdf",
    fileName: file?.name || "",
    text,
    pages: Array.isArray(pages) ? pages : [],
    pageCount: Number.isFinite(Number(pageCount)) ? Number(pageCount) : 0,
    warnings: Array.isArray(warnings) ? warnings.filter(Boolean) : [],
    classifiedError,
    diagnostics: buildDiagnostics(diagnostics),
    metadata: {
      fileName: file?.name || "",
      size: file?.size || 0,
      ...metadata,
    },
  };
}

function buildPdfExtractionError(kind, message, cause, meta = {}) {
  const nextError = new Error(message);
  nextError.extractionKind = kind;
  nextError.cause = cause instanceof Error ? cause : cause ? new Error(String(cause)) : null;
  Object.assign(nextError, meta);
  return nextError;
}

export function validatePdfFile(file) {
  if (!file) {
    throw buildPdfExtractionError("invalid_file", "Invalid or missing PDF file.");
  }

  if (!isPdfFile(file)) {
    throw buildPdfExtractionError("invalid_file", "The selected file is not a PDF.", null, {
      fileName: file?.name || null,
      fileType: file?.type || null,
    });
  }

  if (typeof file.size === "number" && file.size <= 0) {
    throw buildPdfExtractionError(
      "invalid_file",
      "The selected PDF appears to be empty. Please retry with a valid export or rescan.",
      null,
      {
        fileName: file?.name || null,
        fileSize: file?.size || null,
      }
    );
  }

  if (isLikelyMobileSafari() && typeof file.size === "number" && file.size > MAX_MOBILE_SAFE_PDF_SIZE_BYTES) {
    throw buildPdfExtractionError(
      "oversized_mobile_pdf",
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

async function readWithArrayBuffer(file) {
  if (typeof file?.arrayBuffer !== "function") {
    throw new Error("File.arrayBuffer is not available.");
  }
  return file.arrayBuffer();
}

async function readWithFileReader(file) {
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

async function readWithResponse(file) {
  return new Response(file).arrayBuffer();
}

export async function readFileWithFallback(file, preferredMethod = "arrayBuffer") {
  const methods = [preferredMethod, "fileReader", "response"].filter(
    (method, index, list) => list.indexOf(method) === index
  );
  let lastError = null;

  for (const method of methods) {
    try {
      let arrayBuffer;
      if (method === "arrayBuffer") {
        arrayBuffer = await readWithArrayBuffer(file);
      } else if (method === "fileReader") {
        arrayBuffer = await readWithFileReader(file);
      } else {
        arrayBuffer = await readWithResponse(file);
      }

      if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
        throw new Error("The selected file did not produce a readable PDF buffer.");
      }

      return {
        arrayBuffer,
        methodUsed: method,
      };
    } catch (error) {
      lastError = error;
      safeDevLog("[VaultedShield] safePdfExtraction read failure", {
        fileName: file?.name || null,
        fileSize: file?.size || null,
        fileType: file?.type || null,
        method,
        failureStage: "read",
        errorMessage: error?.message || String(error),
      });
    }
  }

  throw buildPdfExtractionError(
    "file_read_failed",
    "We could not read the selected PDF on this device. Try re-exporting the PDF or rescanning it if this file came from a portal.",
    lastError,
    { fileName: file?.name || null }
  );
}

export async function openPdfWithFallback(uint8Array) {
  const attempts = [
    {
      retryUsed: false,
      disableFontFace: false,
      useSystemFonts: false,
      mode: "primary",
    },
    {
      retryUsed: true,
      disableFontFace: true,
      useSystemFonts: true,
      mode: "compatibility_retry",
    },
  ];
  let lastError = null;

  for (const attempt of attempts) {
    let loadingTask = null;
    try {
      loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useWorkerFetch: false,
        isOffscreenCanvasSupported: false,
        isImageDecoderSupported: false,
        disableFontFace: attempt.disableFontFace,
        useSystemFonts: attempt.useSystemFonts,
        stopAtErrors: false,
      });
      const pdf = await loadingTask.promise;
      return {
        pdf,
        loadingTask,
        retryUsed: attempt.retryUsed,
        mode: attempt.mode,
      };
    } catch (error) {
      lastError = error;
      safeDevLog("[VaultedShield] safePdfExtraction open failure", {
        failureStage: "open",
        retryMode: attempt.mode,
        byteLength: uint8Array?.byteLength || 0,
        errorMessage: error?.message || String(error),
      });
      if (typeof loadingTask?.destroy === "function") {
        try {
          await loadingTask.destroy();
        } catch {
          // Ignore cleanup failures between open attempts.
        }
      }
    }
  }

  throw buildPdfExtractionError(
    "pdf_open_failed",
    "We could not open the selected PDF on this device. Try re-exporting the PDF or rescanning it if this file was created from a portal.",
    lastError
  );
}

export async function extractTextFromPdf(pdf) {
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
      throw buildPdfExtractionError(
        "page_extraction_failed",
        `The selected PDF could not be read from page ${pageNum}.`,
        error,
        { pageNumber: pageNum }
      );
    } finally {
      if (typeof page?.cleanup === "function") {
        try {
          page.cleanup();
        } catch {
          // Ignore page cleanup failures.
        }
      }
    }
  }

  return {
    text: pages.join("\n"),
    pages,
    pageCount: pages.length,
  };
}

export async function extractPdfTextSafe(file) {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const mobileSafari = isLikelyMobileSafari();
  const readAttempts = ["arrayBuffer", "fileReader"];
  let lastError = null;

  try {
    validatePdfFile(file);
  } catch (error) {
    error.extractionResult = buildExtractionResult({
      success: false,
      file,
      text: "",
      pages: [],
      pageCount: 0,
      warnings: [],
      classifiedError: {
        kind: error?.extractionKind || "invalid_file",
        message: error?.message || "Invalid or missing PDF file.",
      },
      metadata: {
        methodUsed: "pre_validation",
        retryUsed: false,
      },
      diagnostics: {
        userAgent,
        mobileSafari,
        fileName: file?.name || null,
        fileSize: file?.size || null,
        failureStage: error?.extractionKind || "invalid_file",
        errorMessage: error?.message || "Invalid or missing PDF file.",
      },
    });
    throw error;
  }

  for (const preferredMethod of readAttempts) {
    let loadingTask = null;
    let pdf = null;

    try {
      safeDevLog("[VaultedShield] safePdfExtraction start", {
        fileName: file?.name || null,
        fileSize: file?.size || null,
        fileType: file?.type || null,
        userAgent,
        mobileSafari,
        preferredMethod,
      });

      const readResult = await readFileWithFallback(file, preferredMethod);
      const bytes = new Uint8Array(readResult.arrayBuffer);

      safeDevLog("[VaultedShield] safePdfExtraction buffer ready", {
        fileName: file?.name || null,
        methodUsed: readResult.methodUsed,
        bufferLength: bytes.byteLength,
        failureStage: null,
      });

      const openResult = await openPdfWithFallback(bytes);
      loadingTask = openResult.loadingTask;
      pdf = openResult.pdf;

      const extractionResult = await extractTextFromPdf(pdf);
      const warnings = openResult.retryUsed
        ? ["Used mobile-safe PDF compatibility retry while opening this file."]
        : [];
      const diagnostics = {
        userAgent,
        mobileSafari,
        methodUsed: readResult.methodUsed,
        retryUsed: openResult.retryUsed,
        pageCount: extractionResult.pageCount,
        bufferLength: bytes.byteLength,
        failureStage: null,
      };

      safeDevLog("[VaultedShield] safePdfExtraction success", {
        fileName: file?.name || null,
        methodUsed: readResult.methodUsed,
        retryUsed: openResult.retryUsed,
        pageCount: extractionResult.pageCount,
        failureStage: null,
      });

      return buildExtractionResult({
        success: true,
        file,
        text: extractionResult.text,
        pages: extractionResult.pages,
        pageCount: extractionResult.pageCount,
        warnings,
        classifiedError: null,
        metadata: {
          methodUsed: readResult.methodUsed,
          retryUsed: openResult.retryUsed,
        },
        diagnostics,
      });
    } catch (error) {
      const classifiedError = {
        kind: error?.extractionKind || "unknown",
        message: error?.message || "PDF extraction failed.",
      };
      const diagnostics = {
        userAgent,
        mobileSafari,
        fileName: file?.name || null,
        fileSize: file?.size || null,
        preferredMethod,
        failureStage: error?.extractionKind || "unknown",
        errorMessage: error?.message || String(error),
      };
      lastError = error;
      error.extractionResult = buildExtractionResult({
        success: false,
        file,
        text: "",
        pages: [],
        pageCount: 0,
        warnings: [],
        classifiedError,
        metadata: {
          methodUsed: preferredMethod,
          retryUsed: false,
        },
        diagnostics,
      });
      safeDevLog("[VaultedShield] safePdfExtraction failure", {
        fileName: file?.name || null,
        preferredMethod,
        failureStage: error?.extractionKind || "unknown",
        errorMessage: error?.message || String(error),
      });
    } finally {
      if (typeof loadingTask?.destroy === "function") {
        try {
          await loadingTask.destroy();
        } catch {
          // Ignore cleanup failures after extraction.
        }
      } else if (typeof pdf?.destroy === "function") {
        try {
          await pdf.destroy();
        } catch {
          // Ignore cleanup failures after extraction.
        }
      }
    }
  }

  const fallbackError =
    lastError || buildPdfExtractionError("pdf_open_failed", "We could not open the selected PDF on this device.");
  if (!fallbackError.extractionResult) {
    fallbackError.extractionResult = buildExtractionResult({
      success: false,
      file,
      text: "",
      pages: [],
      pageCount: 0,
      warnings: [],
      classifiedError: {
        kind: fallbackError?.extractionKind || "pdf_open_failed",
        message: fallbackError?.message || "We could not open the selected PDF on this device.",
      },
      metadata: {
        methodUsed: "unknown",
        retryUsed: false,
      },
      diagnostics: {
        userAgent,
        mobileSafari,
        fileName: file?.name || null,
        fileSize: file?.size || null,
        failureStage: fallbackError?.extractionKind || "pdf_open_failed",
        errorMessage: fallbackError?.message || "We could not open the selected PDF on this device.",
      },
    });
  }
  throw fallbackError;
}
