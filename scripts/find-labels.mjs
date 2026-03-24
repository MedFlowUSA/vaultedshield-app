import fs from "node:fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

async function extractPdfPages(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join("\n");
    pages.push(pageText);
  }

  return pages;
}

const filePath = process.argv[2];
const terms = process.argv.slice(3).map((term) => term.toLowerCase());

if (!filePath || terms.length === 0) {
  throw new Error("Usage: node scripts/find-labels.mjs <pdf> <term1> [term2...]");
}

const pages = await extractPdfPages(filePath);

pages.forEach((pageText, index) => {
  const lines = pageText.split("\n");
  const hits = [];

  lines.forEach((line, lineIndex) => {
    const lower = line.toLowerCase();
    if (terms.some((term) => lower.includes(term))) {
      hits.push(`${lineIndex + 1}: ${line}`);
    }
  });

  if (hits.length > 0) {
    console.log(`=== PAGE ${index + 1} ===`);
    console.log(hits.slice(0, 50).join("\n"));
  }
});
