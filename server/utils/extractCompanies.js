import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import XLSX from "xlsx";

// Extract raw text from PDF
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

// Clean and deduplicate lines into company name objects
function linesToCompanies(lines) {
  const seen = new Set();
  const companies = [];
  for (const line of lines) {
    const name = line
      .replace(/^\d+[\.\)]\s*/, "") // remove leading numbers like "1." or "1)"
      .replace(/^[-•*]\s*/, "")      // remove bullet points
      .trim();
    if (name.length < 2) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    companies.push({ name, industry: null, location: null, website: null });
  }
  return companies;
}

// Main export: extract company names from any file type without using AI
export async function extractCompaniesFromFile(buffer, mimetype, originalname) {
  const lower = (originalname || "").toLowerCase();

  // Excel / CSV
  if (
    mimetype.includes("spreadsheet") ||
    mimetype === "text/csv" ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv")
  ) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const companies = [];
    const seen = new Set();

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      // Find which column most looks like company names
      // Try first column first, then scan headers for "name/company/employer"
      let colIndex = 0;
      if (rows.length > 0) {
        const header = rows[0].map((h) => String(h).toLowerCase());
        const nameCol = header.findIndex((h) => h.includes("name") || h.includes("company") || h.includes("employer") || h.includes("organisation") || h.includes("organization"));
        if (nameCol >= 0) colIndex = nameCol;
      }

      const startRow = rows.length > 0 && isNaN(rows[0][colIndex]) ? 1 : 0; // skip header row if present
      for (let i = startRow; i < rows.length; i++) {
        const val = String(rows[i][colIndex] || "").trim();
        if (val.length < 2) continue;
        if (seen.has(val.toLowerCase())) continue;
        seen.add(val.toLowerCase());
        companies.push({ name: val, industry: null, location: null, website: null });
      }
    });

    return companies;
  }

  // PDF
  if (mimetype === "application/pdf" || lower.endsWith(".pdf")) {
    const text = await extractPdfText(buffer);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 1);
    return linesToCompanies(lines);
  }

  // Word DOCX
  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    const lines = result.value.split(/\r?\n/).filter((l) => l.trim().length > 1);
    return linesToCompanies(lines);
  }

  // Plain text fallback
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 1);
  return linesToCompanies(lines);
}
