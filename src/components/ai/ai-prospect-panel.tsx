'use client'

import { useState, useCallback } from 'react'
import { Bot, Mail, RotateCcw, Sparkles, ListChecks, Linkedin, FileText, Zap, CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AIChat } from './ai-chat'
import { QUICK_ACTIONS } from '@/lib/ai-prompts'
import type { Prospect } from '@/lib/types'
import { createActivity } from '@/lib/actions'
import { EnrollSequenceDialog } from '@/components/sequences/enroll-sequence-dialog'

interface AIProspectPanelProps {
  prospect: Prospect
  onEnrolled?: () => void
}

export function AIProspectPanel({ prospect, onEnrolled }: AIProspectPanelProps) {
  const [sequenceDialogOpen, setSequenceDialogOpen] = useState(false)

  const quickActions = [
    {
      label: 'Touch 1',
      prompt: QUICK_ACTIONS.touch1(prospect),
      icon: <Mail className="h-3 w-3" />,
    },
    {
      label: 'Relance',
      prompt: QUICK_ACTIONS.relance(prospect),
      icon: <RotateCcw className="h-3 w-3" />,
    },
    {
      label: 'Sequence',
      prompt: '__ACTION_SEQUENCE__',
      icon: <Zap className="h-3 w-3" />,
    },
    {
      label: 'Prochaine action',
      prompt: QUICK_ACTIONS.nextAction(),
      icon: <ListChecks className="h-3 w-3" />,
    },
    {
      label: 'Resume',
      prompt: QUICK_ACTIONS.summary(),
      icon: <Sparkles className="h-3 w-3" />,
    },
    {
      label: 'LinkedIn',
      prompt: QUICK_ACTIONS.linkedinMessage(prospect),
      icon: <Linkedin className="h-3 w-3" />,
    },
    {
      label: 'Contenu',
      prompt: QUICK_ACTIONS.contentSuggestion(prospect),
      icon: <FileText className="h-3 w-3" />,
    },
    {
      label: 'Creneau',
      prompt: QUICK_ACTIONS.proposeSlot(prospect),
      icon: <CalendarDays className="h-3 w-3" />,
    },
  ]

  const prospectEmail = prospect.email || prospect.email_pro || ''

  const handleSaveAsNote = useCallback(
    async (content: string) => {
      try {
        await createActivity({
          prospect_id: prospect.id,
          type: 'note',
          content: `[IA] ${content}`,
          metadata: { source: 'ai' },
        })
      } catch (error) {
        console.error('Erreur sauvegarde note IA:', error)
      }
    },
    [prospect.id]
  )

  const handleQuickActionIntercept = useCallback((prompt: string) => {
    if (prompt === '__ACTION_SEQUENCE__') {
      setSequenceDialogOpen(true)
      return true // intercepted, don't send to chat
    }
    return false
  }, [])

  return (
    <>
      <Card className="flex flex-col overflow-hidden" style={{ height: '600px' }}>
        <CardHeader className="shrink-0 pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4 text-brand-accent" />
            Assistant IA
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
          <AIChat
            prospectId={prospect.id}
            prospectEmail={prospectEmail}
            prospectName={`${prospect.prenom || ''} ${prospect.nom || ''}`.trim()}
            onSaveAsNote={handleSaveAsNote}
            quickActions={quickActions}
            onQuickActionIntercept={handleQuickActionIntercept}
            placeholder={`Demande a l'IA a propos de ${prospect.prenom || 'ce prospect'}...`}
            className="h-full"
          />
        </CardContent>
      </Card>

      <EnrollSequenceDialog
        open={sequenceDialogOpen}
        onOpenChange={setSequenceDialogOpen}
        prospectIds={[prospect.id]}
        onEnrolled={onEnrolled}
      />
    </>
  )
}
