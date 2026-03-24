import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Onboarding() {
  const [form, setForm] = useState({
    nickname: '',
    age: '',
    job_type: '实习' as '实习' | '校招' | '社招',
    target_position: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('未登录')

      const { error } = await supabase.from('profiles').upsert({
        user_id: user.id,
        nickname: form.nickname,
        age: parseInt(form.age),
        job_type: form.job_type,
        target_position: form.target_position,
      })
      if (error) throw error
      navigate('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <h2 className="text-xl font-bold mb-2">完善个人信息</h2>
        <p className="text-gray-500 text-sm mb-6">帮助 AI 更好地了解你</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">昵称</label>
            <input className="input" value={form.nickname} onChange={e => setForm({...form, nickname: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
            <input type="number" className="input" value={form.age} onChange={e => setForm({...form, age: e.target.value})} min={16} max={60} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">求职类型</label>
            <select className="input" value={form.job_type} onChange={e => setForm({...form, job_type: e.target.value as any})}>
              <option>实习</option>
              <option>校招</option>
              <option>社招</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">目标岗位</label>
            <input className="input" value={form.target_position} onChange={e => setForm({...form, target_position: e.target.value})} placeholder="如：产品运营、数据分析" required />
          </div>

          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}

          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? '保存中...' : '开始使用 →'}
          </button>
        </form>
      </div>
    </div>
  )
}
