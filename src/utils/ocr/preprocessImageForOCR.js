function loadImageFromFile(file) {
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

export async function preprocessImageForOCR(file) {
  const image = await loadImageFromFile(file);
  const scaleFactor = image.width < 1400 ? Math.min(2, 1400 / Math.max(image.width, 1)) : 1;
  const targetWidth = Math.max(1, Math.round(image.width * scaleFactor));
  const targetHeight = Math.max(1, Math.round(image.height * scaleFactor));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas preprocessing is unavailable in this browser.");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const grayscale =
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (grayscale - 128) * 1.2 + 128));
    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }

  context.putImageData(imageData, 0, 0);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
        return;
      }
      reject(new Error("Image preprocessing output could not be created."));
    }, "image/jpeg", 0.92);
  });

  return new File([blob], `ocr-${file.name || Date.now()}.jpg`, {
    type: "image/jpeg",
  });
}
