import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { login } from '../lib/api'
import { useAuth } from './useAuth'

export function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => login(username, password),
    onSuccess: (response) => {
      signIn(response)
      navigate('/admin', { replace: true })
    },
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <p className="kicker text-center">Global World Journal</p>
      <h1 className="headline mt-1 mb-8 text-center text-3xl text-ink">Newsroom Sign In</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">Username</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
          />
        </label>

        {mutation.isError ? (
          <p className="text-[0.85rem] text-accent">
            {mutation.error instanceof Error ? mutation.error.message : 'Sign in failed.'}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="label mt-2 bg-ink px-4 py-3 text-[0.75rem] text-paper transition-colors hover:bg-accent disabled:opacity-60"
        >
          {mutation.isPending ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
