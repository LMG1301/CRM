/**
 * Webhook endpoint for Genspark Meeting Notes sync.
 * DISABLED — transcriptions are now pasted manually on prospect pages.
 * The Google Apps Script (genspark-sync.gs) can also be disabled.
 */

export async function POST() {
  return Response.json(
    { message: 'Meeting notes webhook disabled' },
    { status: 200 }
  )
}
