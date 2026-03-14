'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Loader2, Trash2, MessageSquarePlus, Paperclip, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AIMessage } from './ai-message'
import { ModelSelector } from './model-selector'
import { ComposeEmailDialog } from '@/components/emails/compose-email-dialog'
import type { AIModelId } from '@/lib/ai-models'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  fromHistory?: boolean // true if loaded from DB
}

interface AIChatProps {
  prospectId?: string
  prospectEmail?: string
  prospectName?: string
  onSaveAsNote?: (content: string) => void
  quickActions?: Array<{ label: string; prompt: string; icon?: React.ReactNode }>
  onQuickActionIntercept?: (prompt: string) => boolean
  placeholder?: string
  className?: string
}

export function AIChat({
  prospectId,
  prospectEmail,
  prospectName,
  onSaveAsNote,
  quickActions,
  onQuickActionIntercept,
  placeholder = 'Demande a l\'IA...',
  className = '',
}: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedModel, setSelectedModel] = useState<AIModelId | undefined>(undefined)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [contextStartIndex, setContextStartIndex] = useState<number | null>(null)
  const [emailDialog, setEmailDialog] = useState<{
    open: boolean
    contentId: string | null
    bodyHtml?: string
    subject?: string
  }>({ open: false, contentId: null })
  const [attachedFile, setAttachedFile] = useState<{
    file: File
    name: string
    size: number
    base64: string
    mimeType: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Fichier trop volumineux (max 5 Mo)')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix to get raw base64
      const base64 = result.split(',')[1] || ''
      setAttachedFile({
        file,
        name: file.name,
        size: file.size,
        base64,
        mimeType: file.type,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [])

  // Load chat history from DB on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const params = new URLSearchParams({ limit: '50' })
        if (prospectId) params.set('prospectId', prospectId)
        const res = await fetch(`/api/ai/chat-history?${params}`, {
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          if (data.messages && data.messages.length > 0) {
            const loaded: Message[] = data.messages.map((m: { id: string; role: 'user' | 'assistant'; content: string }) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              fromHistory: true,
            }))
            setMessages(loaded)
          }
        } else {
          console.error('[ai-chat] Failed to load history:', res.status, await res.text().catch(() => ''))
        }
      } catch (err) {
        console.warn('[ai-chat] Error loading history:', err)
      } finally {
        setHistoryLoaded(true)
      }
    }
    loadHistory()
  }, [prospectId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Save a user+assistant pair to DB (with retry)
  const saveToHistory = useCallback(
    async (userContent: string, assistantContent: string): Promise<boolean> => {
      const payload = {
        prospectId: prospectId || null,
        userMessage: userContent,
        assistantMessage: assistantContent,
        model: selectedModel || null,
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch('/api/ai/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (res.ok) {
            return true
          }

          const errBody = await res.text().catch(() => '')
          console.error(`[ai-chat] Save failed (attempt ${attempt + 1}): ${res.status}`, errBody)
        } catch (err) {
          console.error(`[ai-chat] Save fetch error (attempt ${attempt + 1}):`, err)
        }

        // Wait 500ms before retry
        if (attempt === 0) await new Promise(r => setTimeout(r, 500))
      }

      return false
    },
    [prospectId, selectedModel],
  )

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if ((!userMessage.trim() && !attachedFile) || isStreaming) return

      // Capture file before clearing
      const currentFile = attachedFile

      const displayContent = currentFile
        ? `[Fichier: ${currentFile.name}]\n${userMessage.trim() || 'Analyse ce document.'}`
        : userMessage.trim()

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: displayContent,
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInput('')
      setAttachedFile(null)
      setIsStreaming(true)

      // Build conversation history for the API call
      // Only include messages from current conversation context (after "Nouvelle conversation" break)
      const allMsgsBeforeNew = [...messages, userMsg]
      const contextMessages = contextStartIndex !== null
        ? allMsgsBeforeNew.slice(contextStartIndex)
        : allMsgsBeforeNew
      const recentForApi = contextMessages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      let finalAssistantContent = ''

      try {
        abortRef.current = new AbortController()

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: recentForApi,
            prospectId,
            model: selectedModel,
            ...(currentFile && {
              file: {
                name: currentFile.name,
                base64: currentFile.base64,
                mimeType: currentFile.mimeType,
              },
            }),
          }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) {
          let errorMsg = 'Erreur inconnue'
          try {
            const error = await response.json()
            errorMsg = error.error || errorMsg
          } catch {
            errorMsg = `Erreur serveur (${response.status})`
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `⚠️ ${errorMsg}` }
                : m
            )
          )
          setIsStreaming(false)
          return
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process SSE events
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                if (parsed.text) {
                  finalAssistantContent += parsed.text
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: m.content + parsed.text }
                        : m
                    )
                  )
                }
                if (parsed.error) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: `Erreur : ${parsed.error}` }
                        : m
                    )
                  )
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }

        // Save the completed exchange to DB
        if (finalAssistantContent && !finalAssistantContent.startsWith('⚠️') && !finalAssistantContent.startsWith('Erreur')) {
          await saveToHistory(userMsg.content, finalAssistantContent)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // User cancelled
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content: `Erreur de connexion. Verifiez que la cle API est configuree.`,
                  }
                : m
            )
          )
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages, isStreaming, prospectId, selectedModel, saveToHistory, contextStartIndex, attachedFile]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const startNewConversation = useCallback(() => {
    if (messages.length === 0) return
    setContextStartIndex(messages.length)
    // Dim all existing messages (treated as history visually)
    setMessages(prev => prev.map(m => ({ ...m, fromHistory: true })))
  }, [messages.length])

  const clearChat = async () => {
    setMessages([])
    setContextStartIndex(null)
    if (abortRef.current) {
      abortRef.current.abort()
    }
    // Also clear from DB
    try {
      const params = new URLSearchParams()
      if (prospectId) params.set('prospectId', prospectId)
      const res = await fetch(`/api/ai/chat-history?${params}`, { method: 'DELETE' })
      if (!res.ok) {
        console.error('[ai-chat] Clear history failed:', res.status, await res.text().catch(() => ''))
      }
    } catch (err) {
      console.error('[ai-chat] Clear history error:', err)
    }
  }

  const handleContentAction = useCallback((contentId: string) => {
    setEmailDialog({ open: true, contentId })
  }, [])

  // Send any AI message content as email (convert markdown to HTML)
  const handleSendAsEmail = useCallback((content: string) => {
    // Extract subject from "**Objet :** ..." line if present
    let subject = ''
    const lines = content.split('\n')
    const bodyLines: string[] = []

    for (const line of lines) {
      const subjectMatch = line.match(/\*?\*?Objet\s*:?\*?\*?\s*:?\s*(.+)/i)
      if (subjectMatch && !subject) {
        subject = subjectMatch[1].replace(/\*\*/g, '').trim()
      } else {
        bodyLines.push(line)
      }
    }

    // Convert markdown-ish text to simple HTML
    const html = bodyLines
      .map(l => {
        if (l.trim() === '') return '<br>'
        // Bold
        let h = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic
        h = h.replace(/\*(.+?)\*/g, '<em>$1</em>')
        return `<p>${h}</p>`
      })
      .join('\n')

    setEmailDialog({ open: true, contentId: null, bodyHtml: html, subject })
  }, [])

  // Find where history ends and new conversation begins
  const historyBoundary = messages.findIndex((m) => !m.fromHistory)

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.length === 0 && historyLoaded && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-accent/20">
              <svg className="h-7 w-7 text-brand-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">
              Assistant IA Boost Inc.
            </h3>
            <p className="mb-6 max-w-xs text-xs text-muted-foreground">
              Je peux rediger des emails, suggerer des actions et t&apos;aider avec ta prospection.
            </p>

            {/* Quick actions */}
            {quickActions && quickActions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (onQuickActionIntercept?.(action.prompt)) return
                      sendMessage(action.prompt)
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand-accent/30 hover:bg-brand-accent/10 hover:text-foreground"
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id}>
            {/* Separator between history and new conversation */}
            {historyBoundary > 0 && i === historyBoundary && (
              <div className="my-4 flex items-center gap-2 text-[10px] text-muted-foreground">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span>Nouvelle conversation</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
            )}
            <AIMessage
              role={msg.role}
              content={msg.content}
              isStreaming={
                isStreaming &&
                msg.role === 'assistant' &&
                i === messages.length - 1
              }
              onSaveAsNote={
                msg.role === 'assistant' && onSaveAsNote
                  ? onSaveAsNote
                  : undefined
              }
              onContentAction={
                msg.role === 'assistant' && prospectId && prospectEmail
                  ? handleContentAction
                  : undefined
              }
              onSendAsEmail={
                msg.role === 'assistant' && prospectId && prospectEmail
                  ? handleSendAsEmail
                  : undefined
              }
              dimmed={msg.fromHistory}
            />
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="mb-2 flex items-center justify-between">
          <ModelSelector
            endpoint="chat"
            value={selectedModel}
            onChange={setSelectedModel}
            compact
          />
          {messages.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={startNewConversation}
                className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <MessageSquarePlus className="h-3 w-3" />
                Nouveau fil
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
                Effacer
              </Button>
            </div>
          )}
        </div>
        {/* Attached file preview */}
        {attachedFile && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
            <FileText className="h-4 w-4 shrink-0 text-brand-accent" />
            <span className="truncate text-xs text-foreground">{attachedFile.name}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {attachedFile.size < 1024 * 1024
                ? `${(attachedFile.size / 1024).toFixed(1)} Ko`
                : `${(attachedFile.size / (1024 * 1024)).toFixed(1)} Mo`}
            </span>
            <button
              onClick={() => setAttachedFile(null)}
              className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="h-[44px] w-[44px] shrink-0 text-muted-foreground hover:text-foreground"
            title="Joindre un fichier"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isStreaming}
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={(!input.trim() && !attachedFile) || isStreaming}
            className="h-[44px] w-[44px] shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>

      {/* Email compose dialog triggered by [CONTENT:id] or send-as-email */}
      {prospectId && prospectEmail && (
        <ComposeEmailDialog
          open={emailDialog.open}
          onOpenChange={(open) => setEmailDialog({ open, contentId: open ? emailDialog.contentId : null })}
          prospectId={prospectId}
          prospectEmail={prospectEmail}
          prospectName={prospectName}
          contentId={emailDialog.contentId}
          initialBodyHtml={emailDialog.bodyHtml}
          initialSubject={emailDialog.subject}
        />
      )}
    </div>
  )
}
