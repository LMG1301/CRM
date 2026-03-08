'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Bold, Italic, Link2, List } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalChange = useRef(false)

  // Sync external value changes (initial load, AI generation)
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value
      }
    }
    isInternalChange.current = false
  }, [value])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const execCommand = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    handleInput()
  }

  const handleBold = () => execCommand('bold')
  const handleItalic = () => execCommand('italic')
  const handleList = () => execCommand('insertUnorderedList')

  const handleLink = () => {
    const url = prompt('URL du lien :')
    if (url) execCommand('createLink', url)
  }

  return (
    <div className={`rounded-md border border-input bg-background ${className || ''}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-input px-1 py-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleBold} title="Gras">
          <Bold className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleItalic} title="Italique">
          <Italic className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleLink} title="Lien">
          <Link2 className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleList} title="Liste">
          <List className="size-3.5" />
        </Button>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder || 'Redigez votre email...'}
        className="min-h-[200px] px-3 py-2 text-sm outline-none prose prose-sm prose-invert max-w-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none"
      />
    </div>
  )
}
