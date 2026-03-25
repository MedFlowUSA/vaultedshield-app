export async function extractTextFromImage(file, onProgress) {
  const { createWorker } = await import("tesseract.js");
  const warnings = [];
  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      if (typeof onProgress === "function") {
        onProgress(message);
      }
    },
  });

  try {
    const result = await worker.recognize(file);
    const text = result?.data?.text || "";
    const confidence = result?.data?.confidence ?? null;
    const lines = result?.data?.lines || [];

    if (!text.trim()) {
      warnings.push("OCR returned empty text.");
    }

    if (confidence !== null && confidence < 65) {
      warnings.push("OCR confidence is low.");
    }

    return {
      text,
      confidence,
      lines,
      warnings,
    };
  } finally {
    await worker.terminate();
  }
}
