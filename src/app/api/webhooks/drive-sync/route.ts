import { NextResponse } from 'next/server'

/**
 * Drive sync webhook — DÉSACTIVÉ.
 * Ce endpoint existe uniquement pour absorber les appels de l'ancien
 * Google Apps Script (drive-sync.gs) sans rien faire.
 * Il retourne 200 OK pour que l'Apps Script ne retry pas.
 *
 * ACTION REQUISE : Supprimer le trigger sur script.google.com,
 * puis supprimer ce fichier.
 */

export async function POST() {
  return NextResponse.json({ message: 'Drive sync disabled', synced: 0 })
}

export async function GET() {
  return NextResponse.json({ message: 'Drive sync disabled' })
}
