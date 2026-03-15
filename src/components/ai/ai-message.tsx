'use client'

import { useState, useMemo } from 'react'
import { Bot, User, Copy, Check, Save, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface AIMessageProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  onSaveAsNote?: (content: string) => void
  onContentAction?: (contentId: string) => void
  onSendAsEmail?: (content: string) => void
  dimmed?: boolean // history messages rendered slightly muted
}

export function AIMessage({ role, content, isStreaming, onSaveAsNote, onContentAction, onSendAsEmail, dimmed }: AIMessageProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Force plain text on manual selection + Ctrl+C (avoid white-on-white in Gmail)
  const handleManualCopy = (e: React.ClipboardEvent) => {
    const selection = window.getSelection()?.toString()
    if (selection) {
      e.preventDefault()
      e.clipboardData.setData('text/plain', selection)
    }
  }

  // Strip [CONTENT:id] markers and extract IDs
  const contentIds = useMemo(() => {
    const matches = content.matchAll(/\[CONTENT:([a-zA-Z0-9-]+)\]/g)
    return [...matches].map(m => m[1])
  }, [content])

  const cleanContent = useMemo(
    () => content.replace(/\[CONTENT:[a-zA-Z0-9-]+\]/g, ''),
    [content]
  )

  const markdownComponents: Components = useMemo(() => ({
    table: (props) => (
      <table
        className="w-full border-collapse my-2 text-[13px]"
        {...props}
      />
    ),
    thead: (props) => (
      <thead {...props} />
    ),
    th: (props) => (
      <th
        className="border-b border-white/15 px-2.5 py-1.5 text-left font-semibold text-foreground"
        {...props}
      />
    ),
    td: (props) => (
      <td
        className="border-b border-white/[0.08] px-2.5 py-1.5 text-muted-foreground"
        {...props}
      />
    ),
    h1: (props) => (
      <h1 className="text-lg font-semibold mt-4 mb-2" {...props} />
    ),
    h2: (props) => (
      <h2 className="text-base font-semibold mt-3.5 mb-1.5" {...props} />
    ),
    h3: (props) => (
      <h3 className="text-sm font-semibold mt-3 mb-1" {...props} />
    ),
    ul: (props) => (
      <ul className="pl-5 my-1" {...props} />
    ),
    ol: (props) => (
      <ol className="pl-5 my-1 list-decimal" {...props} />
    ),
    li: (props) => (
      <li className="my-0.5" {...props} />
    ),
    strong: (props) => (
      <strong className="font-semibold text-foreground" {...props} />
    ),
    a: (props) => (
      <a className="text-brand-accent underline" target="_blank" rel="noopener noreferrer" {...props} />
    ),
    code: ({ className, children, ...props }) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return (
          <code className={cn(className, 'text-brand-accent')} {...props}>
            {children}
          </code>
        )
      }
      return (
        <code className="rounded bg-white/5 px-1 py-0.5 text-xs text-brand-accent" {...props}>
          {children}
        </code>
      )
    },
    p: ({ children, ...props }) => {
      // Check if this paragraph contains an "Objet" line
      const text = typeof children === 'string' ? children : ''
      if (text.startsWith('Objet')) {
        return <p className="font-semibold text-brand-accent" {...props}>{children}</p>
      }
      return <p className="text-sm leading-relaxed my-1" {...props}>{children}</p>
    },
  }), [])

  return (
    <div
      className={cn(
        'flex gap-3',
        role === 'user' ? 'flex-row-reverse' : 'flex-row',
        dimmed && 'opacity-60'
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
        <div
          className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_pre]:bg-white/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-brand-accent [&_table]:my-2"
          onCopy={handleManualCopy}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {cleanContent}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand-accent/60" />
          )}
        </div>

        {/* [CONTENT:id] action buttons */}
        {contentIds.length > 0 && onContentAction && !isStreaming && (
          <div className="mt-2">
            {contentIds.map(id => (
              <button
                key={id}
                onClick={() => onContentAction(id)}
                className="mt-1 flex items-center gap-1.5 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3 py-1 text-[11px] text-brand-accent transition-colors hover:bg-brand-accent/20"
              >
                <Mail className="h-3 w-3" />
                Envoyer par email
              </button>
            ))}
          </div>
        )}

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
