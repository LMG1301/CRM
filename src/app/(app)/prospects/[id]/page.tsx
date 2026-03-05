import { notFound } from 'next/navigation'
import { getProspect, getActivities, getStages } from '@/lib/actions'
import { ProspectDetail } from '@/components/prospects/prospect-detail'

interface ProspectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProspectPage({ params }: ProspectPageProps) {
  const { id } = await params

  const [prospect, activities, stages] = await Promise.all([
    getProspect(id),
    getActivities(id),
    getStages(),
  ])

  if (!prospect) {
    notFound()
  }

  return (
    <ProspectDetail
      prospect={prospect}
      activities={activities}
      stages={stages}
    />
  )
}
