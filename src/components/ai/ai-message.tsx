'use client'

import { useState } from 'react'
import { Bot, User, Copy, Check, Save, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AIMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  onSaveAsNote?: (content: string) => void
  onContentAction?: (contentId: string) => void
  onSendAsEmail?: (content: string) => void
}

export function AIMessage({ role, content, isStreaming, onSaveAsNote, onContentAction, onSendAsEmail }: AIMessageProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'flex gap-3',
        role === 'user' ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          role === 'assistant'
            ? 'bg-brand-accent/20 text-brand-accent'
            : 'bg-white/10 text-white/60'
        )}
      >
        {role === 'assistant' ? (
          <Bot className="h-4 w-4" />
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>

      {/* Message */}
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-4 py-3',
          role === 'assistant'
            ? 'bg-white/[0.06] text-foreground'
            : 'bg-brand-accent/20 text-foreground'
        )}
      >
        <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_pre]:bg-white/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-brand-accent">
          {content.split('\n').map((line, i) => {
            // Detect [CONTENT:id] and render as button
            const contentMatch = line.match(/\[CONTENT:([a-zA-Z0-9-]+)\]/)
            const renderLine = (text: string) => renderInlineMarkdown(text.replace(/\[CONTENT:[a-zA-Z0-9-]+\]/g, ''))

            if (line.startsWith('# ')) {
              return <h1 key={i} className="font-bold">{renderLine(line.slice(2))}</h1>
            }
            if (line.startsWith('## ')) {
              return <h2 key={i} className="font-semibold">{renderLine(line.slice(3))}</h2>
            }
            if (line.startsWith('### ')) {
              return <h3 key={i} className="font-medium">{renderLine(line.slice(4))}</h3>
            }
            if (line.startsWith('- ') || line.startsWith('* ')) {
              return (
                <div key={i}>
                  <div className="flex gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <span>{renderLine(line.slice(2))}</span>
                  </div>
                  {contentMatch && onContentAction && !isStreaming && (
                    <button
                      onClick={() => onContentAction(contentMatch[1])}
                      className="ml-5 mt-1 flex items-center gap-1.5 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-[11px] text-brand-accent transition-colors hover:bg-brand-accent/20"
                    >
                      <Mail className="h-3 w-3" />
                      Envoyer par email
                    </button>
                  )}
                </div>
              )
            }
            if (line.startsWith('**Objet') || line.startsWith('Objet')) {
              return (
                <p key={i} className="font-semibold text-brand-accent">
                  {renderLine(line)}
                </p>
              )
            }
            if (line.trim() === '') {
              return <div key={i} className="h-2" />
            }
            return (
              <div key={i}>
                <p className="text-sm leading-relaxed">
                  {renderLine(line)}
                </p>
                {contentMatch && onContentAction && !isStreaming && (
                  <button
                    onClick={() => onContentAction(contentMatch[1])}
                    className="mt-1 flex items-center gap-1.5 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-[11px] text-brand-accent transition-colors hover:bg-brand-accent/20"
                  >
                    <Mail className="h-3 w-3" />
                    Envoyer par email
                  </button>
                )}
              </div>
            )
          })}
          {isStreaming && (
            <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand-accent/60" />
          )}
        </div>

        {/* Actions (only for assistant messages, not while streaming) */}
        {role === 'assistant' && !isStreaming && content.length > 0 && (
          <div className="mt-3 flex items-center gap-1 border-t border-white/[0.06] pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? 'Copie' : 'Copier'}
            </Button>
            {onSendAsEmail && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onSendAsEmail(content)}
              >
                <Mail className="h-3 w-3" />
                Envoyer
              </Button>
            )}
            {onSaveAsNote && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onSaveAsNote(content)}
              >
                <Save className="h-3 w-3" />
                Sauvegarder
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Simple inline markdown renderer (bold, italic, code)
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    // Code: `text`
    const codeMatch = remaining.match(/`(.+?)`/)

    const firstMatch = [boldMatch, codeMatch]
      .filter(Boolean)
      .sort((a, b) => (a!.index ?? 0) - (b!.index ?? 0))[0]

    if (!firstMatch || firstMatch.index === undefined) {
      parts.push(remaining)
      break
    }

    if (firstMatch.index > 0) {
      parts.push(remaining.slice(0, firstMatch.index))
    }

    if (firstMatch === boldMatch) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {firstMatch[1]}
        </strong>
      )
    } else if (firstMatch === codeMatch) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-white/5 px-1 py-0.5 text-xs text-brand-accent"
        >
          {firstMatch[1]}
        </code>
      )
    }

    remaining = remaining.slice(firstMatch.index + firstMatch[0].length)
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts
}
