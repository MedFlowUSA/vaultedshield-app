function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    image.src = objectUrl;
  });
}

export async function analyzeScanQuality(file) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const contextWidth = Math.max(1, Math.min(image.width, 600));
  const contextHeight = Math.max(1, Math.round((image.height / Math.max(image.width, 1)) * contextWidth));
  canvas.width = contextWidth;
  canvas.height = contextHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return {
      score: 70,
      level: "fair",
      warnings: ["Quality analysis is limited in this browser."],
      suggestions: [],
    };
  }

  context.drawImage(image, 0, 0, contextWidth, contextHeight);
  const { data } = context.getImageData(0, 0, contextWidth, contextHeight);

  let brightnessTotal = 0;
  let contrastTotal = 0;
  let edgeTotal = 0;
  const sampleCount = contextWidth * contextHeight;

  for (let index = 0; index < data.length; index += 4) {
    const brightness = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    brightnessTotal += brightness;
  }

  const averageBrightness = brightnessTotal / Math.max(sampleCount, 1);

  for (let y = 1; y < contextHeight; y += 1) {
    for (let x = 1; x < contextWidth; x += 1) {
      const index = (y * contextWidth + x) * 4;
      const current = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const leftIndex = index - 4;
      const topIndex = index - contextWidth * 4;
      const left = data[leftIndex] * 0.299 + data[leftIndex + 1] * 0.587 + data[leftIndex + 2] * 0.114;
      const top = data[topIndex] * 0.299 + data[topIndex + 1] * 0.587 + data[topIndex + 2] * 0.114;

      contrastTotal += Math.abs(current - averageBrightness);
      edgeTotal += Math.abs(current - left) + Math.abs(current - top);
    }
  }

  const normalizedContrast = contrastTotal / Math.max(sampleCount, 1);
  const normalizedEdge = edgeTotal / Math.max(sampleCount, 1);
  const aspectRatio = image.width / Math.max(image.height, 1);

  const warnings = [];
  const suggestions = [];
  let score = 100;

  if (image.width < 1200 || image.height < 1600) {
    score -= 18;
    warnings.push("Image is low resolution.");
    suggestions.push("Move closer to the document.");
  }

  if (averageBrightness < 85) {
    score -= 20;
    warnings.push("Scan appears too dark.");
    suggestions.push("Retake in brighter light.");
  } else if (averageBrightness > 220) {
    score -= 16;
    warnings.push("Scan appears too bright or washed out.");
    suggestions.push("Reduce glare and avoid direct overhead light.");
  }

  if (normalizedContrast < 32) {
    score -= 18;
    warnings.push("Text contrast looks weak.");
    suggestions.push("Lay the page flatter before scanning.");
  }

  if (normalizedEdge < 18) {
    score -= 18;
    warnings.push("Text may be hard to read.");
    suggestions.push("Hold the camera steadier and refocus before taking the photo.");
  }

  if (aspectRatio > 1.3 || aspectRatio < 0.45) {
    score -= 10;
    warnings.push("Page framing looks unusual.");
    suggestions.push("Center the full page in the frame.");
  }

  const boundedScore = Math.max(5, Math.min(100, Math.round(score)));
  const level = boundedScore >= 80 ? "good" : boundedScore >= 60 ? "fair" : "poor";

  return {
    score: boundedScore,
    level,
    warnings,
    suggestions: [...new Set(suggestions)],
  };
}
