import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import XLSX from "xlsx";

async function extractPdfText(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const doc = await loadingTask.promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text.trim();
}

// Extracts plain text from PDF or DOCX buffer (used for CVs)
export async function extractTextFromFile(buffer, mimetype, originalname) {
  const lower = (originalname || "").toLowerCase();

  if (mimetype === "application/pdf" || lower.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (lower.endsWith(".doc")) {
    throw new Error("Old .doc format isn't supported — please save as .docx or PDF and re-upload.");
  }

  return buffer.toString("utf-8").trim();
}

// Extracts a raw text "dump" from any employer list file (xlsx/csv/pdf/docx/image)
// For images, returns a marker so the caller uses Claude's vision (base64) path instead.
export async function extractEmployerListContent(buffer, mimetype, originalname) {
  const lower = (originalname || "").toLowerCase();

  if (
    mimetype.includes("spreadsheet") ||
    mimetype === "text/csv" ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv")
  ) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    let combined = "";
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      combined += `\n--- Sheet: ${sheetName} ---\n${csv}`;
    });
    return { type: "text", content: combined.trim() };
  }

  if (mimetype === "application/pdf" || lower.endsWith(".pdf")) {
    const text = await extractPdfText(buffer);
    return { type: "text", content: text };
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { type: "text", content: result.value.trim() };
  }

  if (mimetype.startsWith("image/")) {
    return { type: "image", content: buffer.toString("base64"), mimetype };
  }

  return { type: "text", content: buffer.toString("utf-8").trim() };
}
