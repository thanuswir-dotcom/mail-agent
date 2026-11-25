import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm font-medium opacity-75">Loading MailPilot AI session...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}
