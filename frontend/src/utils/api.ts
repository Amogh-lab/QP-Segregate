import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Create axios instance with default config
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Don't set Content-Type for FormData - let axios/browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Add response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only handle 401 errors, but don't automatically redirect
    // Let the components handle the redirect logic
    if (error.response?.status === 401) {
      // Token expired or invalid - remove token but don't redirect here
      // Components will handle redirect based on context
      const token = localStorage.getItem('token')
      if (token) {
        localStorage.removeItem('token')
      }
    }
    return Promise.reject(error)
  }
)

// Helper function for fetch with proper base URL
export async function apiFetch(url: string, options: RequestInit = {}) {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`
  const token = localStorage.getItem('token')
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  
  const response = await fetch(fullUrl, {
    ...options,
    headers,
  })
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  
  return response.json()
}

