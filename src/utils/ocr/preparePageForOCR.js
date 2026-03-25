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

export async function preparePageForOCR(file, crop = null) {
  if (!crop) {
    return file;
  }

  const image = await loadImage(file);
  const x = Math.max(0, Math.round(crop.x || 0));
  const y = Math.max(0, Math.round(crop.y || 0));
  const width = Math.max(1, Math.round(crop.width || image.width));
  const height = Math.max(1, Math.round(crop.height || image.height));
  const boundedWidth = Math.min(width, image.width - x);
  const boundedHeight = Math.min(height, image.height - y);

  const canvas = document.createElement("canvas");
  canvas.width = boundedWidth;
  canvas.height = boundedHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas crop preparation is unavailable in this browser.");
  }

  context.drawImage(image, x, y, boundedWidth, boundedHeight, 0, 0, boundedWidth, boundedHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
        return;
      }
      reject(new Error("Prepared OCR page could not be created."));
    }, "image/jpeg", 0.94);
  });

  return new File([blob], `prepared-${file.name || Date.now()}.jpg`, {
    type: "image/jpeg",
  });
}
