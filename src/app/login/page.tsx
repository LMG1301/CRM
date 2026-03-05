'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket, Lock, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Mot de passe incorrect')
      }
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-blue-600/20 text-blue-400 mb-4">
            <Rocket className="size-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">Boost CRM</h1>
          <p className="text-sm text-slate-400 mt-1">Connectez-vous pour accéder au CRM</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-3 pl-10 pr-4 text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              'Connexion'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
