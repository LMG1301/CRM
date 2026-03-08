/**
 * Document parser — converts PDF, DOCX, TXT, MD, CSV files to plain text
 */

/**
 * Extract text content from a file buffer based on its name/type
 */
export async function extractTextFromFile(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<string> {
  const ext = ('.' + fileName.split('.').pop()?.toLowerCase()) || ''

  // PDF
  if (ext === '.pdf' || mimeType?.includes('pdf')) {
    return extractPdf(buffer)
  }

  // DOCX
  if (ext === '.docx' || mimeType?.includes('wordprocessingml')) {
    return extractDocx(buffer)
  }

  // Plain text formats: .txt, .md, .csv, .json
  if (['.txt', '.md', '.csv', '.json'].includes(ext) || mimeType?.startsWith('text/')) {
    return new TextDecoder('utf-8').decode(buffer)
  }

  throw new Error(`Type de fichier non supporte: ${ext}`)
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v1.1.1 — simple function API: pdfParse(buffer) → { text, numpages, info }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const data = await pdfParse(buffer)
  return cleanExtractedText(data.text)
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return cleanExtractedText(result.value)
}

/**
 * Clean up extracted text:
 * - Normalize whitespace
 * - Remove excessive blank lines
 * - Trim
 */
function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')          // Normalize line endings
    .replace(/\n{4,}/g, '\n\n\n')    // Max 3 consecutive newlines
    .replace(/[ \t]+$/gm, '')         // Trim trailing whitespace per line
    .replace(/^[ \t]+/gm, (m) => m)   // Keep leading whitespace (indentation)
    .trim()
}
