import type { AppProps } from 'next/app'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Toaster } from 'react-hot-toast'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from '../hooks/useAuth'
import { ThemeProvider } from '../hooks/useTheme'
import '../styles/globals.css'

const queryClient = new QueryClient()

// Google OAuth Client ID - should be in environment variable
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

export default function App({ Component, pageProps }: AppProps) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Component {...pageProps} />
            <Toaster position="top-right" />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  )
}
// Disable automatic static optimization globally
// Required because pages use next/router which needs browser context
App.getInitialProps = async () => ({ pageProps: {} })
