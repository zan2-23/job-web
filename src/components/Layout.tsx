import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const navItems = [
  { to: '/review', label: '复盘', icon: '📋' },
  { to: '/resume', label: '写简历', icon: '📝' },
  { to: '/interview', label: '面试准备', icon: '🎯' },
  { to: '/profile', label: '我的', icon: '👤' },
]

export default function Layout() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 桌面顶部导航 */}
      <header className="hidden md:flex items-center justify-between bg-white border-b border-gray-100 px-6 py-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎯</span>
          <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">求职助手</span>
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500 transition-colors">退出</button>
      </header>

      {/* 移动端顶部 */}
      <header className="md:hidden flex items-center justify-between bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span>🎯</span>
          <span className="font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">求职助手</span>
        </div>
      </header>

      {/* 页面内容 */}
      <main className="flex-1 pb-20 md:pb-0">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>

      {/* 移动端底部导航 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-10">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl mb-0.5">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
