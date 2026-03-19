'use client'

import { useState } from 'react'
import { searchProspect, generateQuickReply } from './actions'

export default function QuickReplyPage() {
  const [query, setQuery] = useState('')
  const [prospect, setProspect] = useState<Record<string, unknown> | null>(null)
  const [searchDone, setSearchDone] = useState(false)
  const [searching, setSearching] = useState(false)

  const [emailBody, setEmailBody] = useState('')
  const [instruction, setInstruction] = useState('')
  const [model, setModel] = useState('claude-haiku-4-5-20251001')
  const [reply, setReply] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    try {
      const result = await searchProspect(query)
      if (result.found) {
        setProspect(result.prospect as Record<string, unknown>)
      } else {
        setProspect(null)
      }
      setSearchDone(true)
    } catch {
      setError('Erreur de recherche')
    }
    setSearching(false)
  }

  async function handleGenerate(withInstruction: boolean) {
    setGenerating(true)
    setError('')
    setReply('')
    try {
      const result = await generateQuickReply(
        (prospect?.id as string) || null,
        (prospect?.email as string) || (prospect?.email_pro as string) || query,
        emailBody,
        withInstruction ? instruction : null,
        model
      )
      setReply(result.reply)
    } catch (e) {
      setError('Erreur de generation : ' + (e instanceof Error ? e.message : 'inconnue'))
    }
    setGenerating(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(reply)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="text-xl">&#9889;</span> Reponse rapide
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generez une reponse email avec le contexte CRM
          </p>
        </div>

        {/* Search */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Email ou nom du contact
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="email@entreprise.com ou nom..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {searching ? '...' : 'Chercher'}
            </button>
          </div>

          {/* Search result */}
          {searchDone && prospect && (
            <div className="mt-3 rounded-lg border border-border p-3">
              <div className="font-semibold">{prospect.prenom as string} {prospect.nom as string}</div>
              <div className="text-xs text-muted-foreground">{prospect.entreprise as string}</div>
              <span className="mt-1 inline-block rounded bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-400">
                {(prospect.pipeline_stage_label || prospect.pipeline_stage) as string}
              </span>
              {prospect.derniere_note ? (
                <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                  <span className="font-semibold text-muted-foreground">Note : </span>
                  {String(prospect.derniere_note).substring(0, 150)}
                </div>
              ) : null}
            </div>
          )}
          {searchDone && !prospect && (
            <div className="mt-3 text-center text-sm text-muted-foreground">
              Contact non trouve. La reponse sera generee sans contexte CRM.
            </div>
          )}
        </div>

        {/* Email body */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Coller l&apos;email recu
          </label>
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            placeholder="Collez le texte de l'email ici..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-blue-500 resize-vertical"
            style={{ minHeight: '150px' }}
          />
        </div>

        {/* Model + Generate */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Modele IA
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none"
              >
                <option value="claude-haiku-4-5-20251001">Haiku (rapide)</option>
                <option value="claude-sonnet-4-20250514">Sonnet (qualite)</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => handleGenerate(false)}
            disabled={generating || !emailBody.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 mb-3"
          >
            {generating ? '\u23F3 Generation en cours...' : '\uD83E\uDD16 Generer automatiquement'}
          </button>

          <label className="block text-xs font-medium text-muted-foreground mb-2">
            OU donner une instruction
          </label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ex: dis-lui qu'on est dispo mardi pour un call..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none mb-2"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (instruction.trim()) handleGenerate(true)
              }
            }}
          />
          <button
            onClick={() => handleGenerate(true)}
            disabled={generating || !instruction.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Rediger avec instruction
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Reply */}
        {reply && (
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Reponse generee
            </label>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-blue-500 resize-vertical"
              style={{ minHeight: '200px' }}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleCopy}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {copied ? 'Copie \u2713' : 'Copier'}
              </button>
              <button
                onClick={() => handleGenerate(!!instruction.trim())}
                disabled={generating}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Regenerer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
