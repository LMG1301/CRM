'use client'

import { useCallback } from 'react'
import { Bot, Mail, RotateCcw, Sparkles, ListChecks, Linkedin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AIChat } from './ai-chat'
import { QUICK_ACTIONS } from '@/lib/ai-prompts'
import type { Prospect } from '@/lib/types'
import { createActivity } from '@/lib/actions'

interface AIProspectPanelProps {
  prospect: Prospect
}

export function AIProspectPanel({ prospect }: AIProspectPanelProps) {
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
  ]

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

  return (
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
          onSaveAsNote={handleSaveAsNote}
          quickActions={quickActions}
          placeholder={`Demande a l'IA a propos de ${prospect.prenom || 'ce prospect'}...`}
          className="h-full"
        />
      </CardContent>
    </Card>
  )
}
