import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import ReviewPage from './pages/Review'
import ResumePage from './pages/Resume'
import InterviewPage from './pages/Interview'
import ProfilePage from './pages/Profile'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400">加载中...</div>
    </div>
  )
  return user ? <>{children}</> : <Navigate to="/auth" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding" element={<PrivateRoute><Onboarding /></PrivateRoute>} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/review" replace />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/resume" element={<ResumePage />} />
          <Route path="/interview" element={<InterviewPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
