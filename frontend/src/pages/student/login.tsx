import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../hooks/useAuth'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../hooks/useTheme'

export default function StudentLogin() {
  const router = useRouter()
  const { login, loading } = useAuth()
  const { resolvedTheme } = useTheme()
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const email = formData.email.trim().toLowerCase()
    if (!email.endsWith('@rvce.edu.in')) {
      setError('Only @rvce.edu.in email addresses are allowed')
      return
    }

    try {
      // Backend /login treats input containing "@" as email-based student login
      await login(email, formData.password, 'STUDENT')
      router.push('/student/dashboard')
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Login failed'
      setError(message)
    }
  }

  const busy = loading

  return (
    <>
      <Head>
        <title>Student Login - QPaper AI</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 transition-colors">
        <div className="max-w-md w-full space-y-8">
          <div className="flex justify-end">
            <ThemeToggle />
          </div>
          <div className="flex flex-col items-center">
            <Image
              src={resolvedTheme === 'dark' ? '/RVlogodark.png' : '/RVlogolight.png'}
              alt="RVCE Logo"
              width={100}
              height={100}
              className="h-auto mb-4"
              priority
            />
            <Image
              src="/logo.png"
              alt="QPaper AI Logo"
              width={250}
              height={75}
              className="h-auto mb-6"
              priority
            />
            <h2 className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">
              Student Login
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
              Sign in to access your question bank
            </p>
            <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">
              Only @rvce.edu.in email addresses are allowed
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="card">
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="input-field mt-1"
                    placeholder="yourname@rvce.edu.in"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      className="input-field pr-10"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <EyeIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div className="mt-6">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? 'Signing in...' : 'Sign In'}
                </button>
              </div>
            </div>
          </form>

          <div className="text-center">
            <button
              onClick={() => router.push('/')}
              className="text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 text-sm transition-colors"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
