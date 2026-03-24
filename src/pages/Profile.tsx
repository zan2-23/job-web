import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Profile, Review, Resume } from '../types'
import MarkdownRenderer from '../components/MarkdownRenderer'

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [resumes, setResumes] = useState<Resume[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ nickname: '', age: '', job_type: '实习', target_position: '' })
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: p }, { data: r }, { data: rs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).single(),
      supabase.from('reviews').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('resumes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    if (p) {
      setProfile(p)
      setForm({ nickname: p.nickname, age: String(p.age), job_type: p.job_type, target_position: p.target_position })
    }
    setReviews(r || [])
    setResumes(rs || [])
  }

  const saveProfile = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').upsert({
      user_id: user.id,
      nickname: form.nickname,
      age: parseInt(form.age),
      job_type: form.job_type,
      target_position: form.target_position,
    })
    setSaving(false)
    setEditing(false)
    loadData()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  if (selectedReview) {
    return (
      <div>
        <button onClick={() => setSelectedReview(null)} className="text-sm text-blue-600 mb-4">← 返回</button>
        <div className="card">
          <h2 className="font-semibold mb-2">复盘报告</h2>
          <p className="text-xs text-gray-400 mb-4">{new Date(selectedReview.created_at).toLocaleString('zh-CN')}</p>
          <MarkdownRenderer content={selectedReview.result} />
        </div>
      </div>
    )
  }

  if (selectedResume) {
    return (
      <div>
        <button onClick={() => setSelectedResume(null)} className="text-sm text-blue-600 mb-4">← 返回</button>
        <div className="card">
          <h2 className="font-semibold mb-2">简历</h2>
          <p className="text-xs text-gray-400 mb-4">{new Date(selectedResume.created_at).toLocaleString('zh-CN')}</p>
          <MarkdownRenderer content={selectedResume.generated_resume} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">👤 我的</h1>

      {/* 个人信息 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">个人信息</h2>
          <button onClick={() => setEditing(!editing)} className="text-sm text-blue-600">{editing ? '取消' : '编辑'}</button>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div><label className="text-sm text-gray-600 mb-1 block">昵称</label><input className="input" value={form.nickname} onChange={e => setForm({...form, nickname: e.target.value})} /></div>
            <div><label className="text-sm text-gray-600 mb-1 block">年龄</label><input type="number" className="input" value={form.age} onChange={e => setForm({...form, age: e.target.value})} /></div>
            <div><label className="text-sm text-gray-600 mb-1 block">求职类型</label>
              <select className="input" value={form.job_type} onChange={e => setForm({...form, job_type: e.target.value})}>
                <option>实习</option><option>校招</option><option>社招</option>
              </select>
            </div>
            <div><label className="text-sm text-gray-600 mb-1 block">目标岗位</label><input className="input" value={form.target_position} onChange={e => setForm({...form, target_position: e.target.value})} /></div>
            <button onClick={saveProfile} disabled={saving} className="btn-primary w-full">{saving ? '保存中...' : '保存'}</button>
          </div>
        ) : profile ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">昵称</span><span className="font-medium">{profile.nickname}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">年龄</span><span>{profile.age}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">求职类型</span><span>{profile.job_type}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">目标岗位</span><span className="font-medium text-blue-600">{profile.target_position}</span></div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">暂无个人信息</p>
        )}
      </div>

      {/* 历史复盘 */}
      <div className="card">
        <h2 className="font-semibold mb-3">历史复盘 ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="text-gray-400 text-sm">还没有复盘记录</p>
        ) : (
          <div className="space-y-2">
            {reviews.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => setSelectedReview(r)}>
                <p className="text-sm text-gray-700 flex-1 truncate">{r.content.slice(0, 40)}...</p>
                <span className="text-xs text-gray-400 ml-3">{new Date(r.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 历史简历 */}
      <div className="card">
        <h2 className="font-semibold mb-3">历史简历 ({resumes.length})</h2>
        {resumes.length === 0 ? (
          <p className="text-gray-400 text-sm">还没有简历记录</p>
        ) : (
          <div className="space-y-2">
            {resumes.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => setSelectedResume(r)}>
                <p className="text-sm text-gray-700 flex-1 truncate">{r.generated_resume.slice(0, 40)}...</p>
                <span className="text-xs text-gray-400 ml-3">{new Date(r.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={handleLogout} className="w-full py-3 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium">退出登录</button>
    </div>
  )
}
