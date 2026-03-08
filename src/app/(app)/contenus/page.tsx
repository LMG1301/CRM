import { getContents } from '@/lib/actions'
import { ContentLibrary } from '@/components/contents/content-library'

export default async function ContenusPage() {
  const contents = await getContents()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bibliotheque de contenus</h1>
        <p className="text-sm text-muted-foreground">
          Gerez vos contenus LinkedIn, articles et case studies pour le nurturing prospects.
        </p>
      </div>
      <ContentLibrary initialContents={contents} />
    </div>
  )
}
