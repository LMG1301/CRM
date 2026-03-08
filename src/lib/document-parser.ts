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
  // pdfjs-dist (used by pdf-parse) requires DOMMatrix which is browser-only.
  // Provide a minimal polyfill for Node.js environments.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // @ts-expect-error - minimal polyfill sufficient for pdfjs text extraction
    globalThis.DOMMatrix = class DOMMatrix {
      m: Float64Array
      constructor(init?: number[]) {
        this.m = new Float64Array(init || [1, 0, 0, 1, 0, 0])
      }
      get a() { return this.m[0] }
      get b() { return this.m[1] }
      get c() { return this.m[2] }
      get d() { return this.m[3] }
      get e() { return this.m[4] }
      get f() { return this.m[5] }
      get is2D() { return true }
      get isIdentity() {
        return this.m[0] === 1 && this.m[1] === 0 && this.m[2] === 0 &&
               this.m[3] === 1 && this.m[4] === 0 && this.m[5] === 0
      }
      static fromFloat64Array(arr: Float64Array) {
        return new DOMMatrix(Array.from(arr) as number[])
      }
      static fromMatrix(other: Record<string, number> | null) {
        return new DOMMatrix(other ? [other.a || 1, other.b || 0, other.c || 0, other.d || 1, other.e || 0, other.f || 0] : undefined)
      }
    }
  }

  // Also polyfill Path2D if missing (pdfjs may reference it)
  if (typeof globalThis.Path2D === 'undefined') {
    // @ts-expect-error - minimal polyfill
    globalThis.Path2D = class Path2D {
      // no-op for text extraction
    }
  }

  // pdf-parse requires dynamic import to avoid issues with Next.js bundling
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
