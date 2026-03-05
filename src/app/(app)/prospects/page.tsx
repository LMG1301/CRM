import { getProspects, getStages } from '@/lib/actions'
import { ProspectsTable } from '@/components/prospects/prospects-table'

export const metadata = {
  title: 'Prospects - Boost CRM',
}

export default async function ProspectsPage() {
  const [prospects, stages] = await Promise.all([getProspects(), getStages()])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <ProspectsTable prospects={prospects} stages={stages} />
    </div>
  )
}
