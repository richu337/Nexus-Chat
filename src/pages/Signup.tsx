import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import {
  signUpWithEmail,
  signInWithGoogle,
  mapAuthError,
  authErrorMessage,
} from '@/firebase/auth'
import { validateEmail, validatePassword } from '@/utils/validators'
import { useToast } from '@/hooks/useToast'

export default function Signup() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const emailErr = validateEmail(email)
    const passErr = validatePassword(password)
    const confirmErr = confirm !== password ? 'Passwords do not match.' : undefined
    setErrors({ email: emailErr ?? undefined, password: passErr ?? undefined, confirm: confirmErr })
    if (emailErr || passErr || confirmErr) return

    setSubmitting(true)
    try {
      await signUpWithEmail(email.trim(), password)
      navigate('/setup', { replace: true })
    } catch (err) {
      const code = mapAuthError((err as { code?: string }).code ?? 'unknown')
      setErrors({
        email: ['email-already-in-use', 'invalid-email', 'user-disabled', 'operation-not-allowed'].includes(
          code,
        )
          ? authErrorMessage(code)
          : undefined,
        password: ['weak-password', 'too-many-requests', 'network-request-failed'].includes(code)
          ? authErrorMessage(code)
          : undefined,
      })
      if (code === 'network-request-failed') {
        showToast('Network error. Check your connection and try again.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      navigate('/setup', { replace: true })
    } catch {
      showToast('Google sign-in failed. Please try again.', 'error')
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Create your account</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Join Nexus Chat and start messaging
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <Input
          id="signup-email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Input
          id="signup-password"
          type="password"
          label="Password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Input
          id="signup-confirm"
          type="password"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Create account
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">or</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={handleGoogle}
        loading={googleLoading}
      >
        {!googleLoading && (
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0012 1 11 11 0 002.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        Continue with Google
      </Button>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          Login
        </Link>
      </p>
    </AuthLayout>
  )
}
