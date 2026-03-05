import { getStages, getProspects } from '@/lib/actions'
import { KanbanBoard } from '@/components/pipeline/kanban-board'

export const metadata = {
  title: 'Pipeline | Boost CRM',
  description: 'Visualisez et gerez votre pipeline commercial',
}

export default async function PipelinePage() {
  const [stages, prospects] = await Promise.all([
    getStages(),
    getProspects(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-full px-4 py-8 sm:px-6 lg:px-8">
        <KanbanBoard stages={stages} prospects={prospects} />
      </div>
    </div>
  )
}
