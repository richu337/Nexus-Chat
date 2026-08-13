import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { signInWithGoogle, signInWithCustomTokenId } from '@/firebase/auth'
import { functions } from '@/firebase/config'
import { validateEmail, validatePassword } from '@/utils/validators'
import { useToast } from '@/hooks/useToast'

type Step = 'form' | 'otp' | 'done'

export default function Signup() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  // Form step
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // OTP step
  const [step, setStep] = useState<Step>('form')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpError, setOtpError] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // ── Step 1: Send OTP ───────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nameErr = !name.trim() ? 'Name is required.' : undefined
    const emailErr = validateEmail(email)
    const passErr = validatePassword(password)
    const confirmErr = confirm !== password ? 'Passwords do not match.' : undefined
    setErrors({ name: nameErr, email: emailErr ?? undefined, password: passErr ?? undefined, confirm: confirmErr })
    if (nameErr || emailErr || passErr || confirmErr) return

    setSubmitting(true)
    try {
      const sendOtpFn = httpsCallable(functions, 'sendOtp')
      await sendOtpFn({ email: email.trim(), name: name.trim() })
      setStep('otp')
      startResendTimer()
      showToast('Verification code sent to your email.', 'success')
    } catch (err) {
      const msg = (err as { message?: string }).message ?? ''
      if (msg.includes('already exists')) {
        setErrors({ email: 'An account with this email already exists.' })
      } else if (msg.includes('Too many')) {
        setErrors({ email: 'Too many requests. Please wait a few minutes.' })
      } else {
        showToast('Failed to send verification code. Try again.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step 2: Verify OTP ─────────────────────────────────────────────────
  async function handleVerifyOtp() {
    const otpString = otp.join('')
    if (otpString.length !== 6) {
      setOtpError('Please enter the complete 6-digit code.')
      return
    }

    setOtpLoading(true)
    setOtpError('')
    try {
      const verifyOtpFn = httpsCallable(functions, 'verifyOtp')
      const result = await verifyOtpFn({
        email: email.trim(),
        otp: otpString,
        password,
        name: name.trim(),
        username: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20),
      })

      const { customToken } = result.data as { customToken: string; uid: string }
      await signInWithCustomTokenId(customToken)
      setStep('done')
      setTimeout(() => navigate('/setup', { replace: true }), 1200)
    } catch (err) {
      const msg = (err as { message?: string }).message ?? ''
      if (msg.includes('Incorrect')) {
        setOtpError('Incorrect code. Please try again.')
      } else if (msg.includes('expired')) {
        setOtpError('This code has expired. Please request a new one.')
        setStep('form')
      } else if (msg.includes('No verification')) {
        setOtpError('No code found. Please request a new one.')
        setStep('form')
      } else if (msg.includes('username')) {
        setOtpError('This username is already taken. Please choose another.')
      } else if (msg.includes('EMAIL_EXISTS')) {
        setOtpError('An account with this email already exists.')
        setStep('form')
      } else {
        setOtpError('Verification failed. Please try again.')
      }
    } finally {
      setOtpLoading(false)
    }
  }

  // ── Resend timer ───────────────────────────────────────────────────────
  function startResendTimer() {
    setResendTimer(60)
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function handleResendOtp() {
    if (resendTimer > 0) return
    try {
      const sendOtpFn = httpsCallable(functions, 'sendOtp')
      await sendOtpFn({ email: email.trim(), name: name.trim() })
      startResendTimer()
      showToast('New verification code sent.', 'success')
    } catch {
      showToast('Failed to resend code.', 'error')
    }
  }

  // ── OTP input handler ──────────────────────────────────────────────────
  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value) && value !== '') return
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    setOtpError('')

    // Auto-advance
    if (value && index < 5) {
      const next = document.getElementById(`otp-${index + 1}`)
      next?.focus()
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5) {
      const full = newOtp.join('')
      if (full.length === 6) {
        setTimeout(() => {
          setOtp(newOtp)
          void handleVerifyOtp()
        }, 100)
      }
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`)
      prev?.focus()
    }
    if (e.key === 'Enter') {
      void handleVerifyOtp()
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) {
      const newOtp = pasted.split('').concat(Array(6).fill('')).slice(0, 6)
      setOtp(newOtp)
      const focusIndex = Math.min(pasted.length, 5)
      const next = document.getElementById(`otp-${focusIndex}`)
      next?.focus()
      if (pasted.length === 6) {
        setTimeout(() => void handleVerifyOtp(), 100)
      }
    }
    e.preventDefault()
  }

  // ── Google sign-in (bypasses OTP — Google already verifies email) ──────
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

  // ── Render: OTP step ───────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <AuthLayout>
        <button
          onClick={() => setStep('form')}
          className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
          <Mail className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-center text-2xl font-semibold text-slate-900 dark:text-white">Verify your email</h2>
        <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
          We sent a 6-digit code to<br />
          <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>
        </p>

        <div className="mt-6 flex justify-center gap-2">
          {otp.map((digit, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(i, e.target.value)}
              onKeyDown={(e) => handleOtpKeyDown(i, e)}
              onPaste={handleOtpPaste}
              className="h-12 w-11 rounded-xl border border-slate-200 bg-slate-50 text-center text-lg font-semibold text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {otpError && (
          <p className="mt-3 text-center text-sm text-rose-600 dark:text-rose-400">{otpError}</p>
        )}

        <Button
          onClick={() => void handleVerifyOtp()}
          size="lg"
          className="mt-6 w-full"
          loading={otpLoading}
        >
          Verify
        </Button>

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Didn't receive the code?{' '}
          {resendTimer > 0 ? (
            <span className="text-slate-400">Resend in {resendTimer}s</span>
          ) : (
            <button onClick={() => void handleResendOtp()} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              Resend
            </button>
          )}
        </p>
      </AuthLayout>
    )
  }

  // ── Render: Done step ──────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center py-8">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          <h2 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-white">Account created!</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Redirecting to profile setup…</p>
        </div>
      </AuthLayout>
    )
  }

  // ── Render: Form step ──────────────────────────────────────────────────
  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Create your account</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Join Nexus Chat and start messaging
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <Input
          id="signup-name"
          type="text"
          label="Full name"
          autoComplete="name"
          placeholder="Your display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
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
          Send verification code
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
