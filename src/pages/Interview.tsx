import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { streamDeepSeek } from '../lib/deepseek'
import MarkdownRenderer from '../components/MarkdownRenderer'
import { parseFiles } from '../lib/fileParser'
import { Review } from '../types'

interface ChatMessage {
  role: 'interviewer' | 'user' | 'feedback'
  content: string
}

export default function InterviewPage() {
  const [jd, setJd] = useState('')
  const [reviews, setReviews] = useState<Review[]>([])
  const [selectedReview, setSelectedReview] = useState('')
  const [result, setResult] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [tab, setTab] = useState<'prep' | 'mock'>('prep')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [mockStreaming, setMockStreaming] = useState(false)
  const [jdUploading, setJdUploading] = useState(false)
  const [jdFiles, setJdFiles] = useState<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const jdFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadReviews()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const loadReviews = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('reviews').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setReviews(data || [])
  }

  const generatePrep = async () => {
    if (!jd.trim()) return
    setResult('')
    setStreaming(true)

    const reviewContext = selectedReview
      ? reviews.find(r => r.id === selectedReview)?.result || ''
      : ''

    const messages = [
      {
        role: 'system',
        content: `你是一位资深面试教练，专门帮助求职者准备面试。请根据 JD 和候选人背景，生成完整的面试准备材料，Markdown 格式：

## 一、自我介绍逐字稿（2分钟）
（完整的、可以直接背诵的版本）

## 二、高频面试题及参考答案（10道）
（根据 JD 预测最可能被问到的问题，结合候选人经历给出答案框架）

## 三、模拟追问题
（5道深度追问，考察真实理解深度）`,
      },
      {
        role: 'user',
        content: `目标岗位 JD：\n${jd}${reviewContext ? `\n\n我的工作经历复盘：\n${reviewContext}` : ''}`,
      },
    ]

    let full = ''
    try {
      await streamDeepSeek(messages, chunk => {
        full += chunk
        setResult(full)
      }, async () => {
        setStreaming(false)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('interview_preps').insert({
            user_id: user.id,
            jd_content: jd,
            intro_script: '',
            questions: full,
          })
        }
      })
    } catch {
      setStreaming(false)
    }
  }

  const startMockInterview = async () => {
    if (!jd.trim()) { alert('请先填写岗位 JD'); return }
    setChatMessages([])
    setMockStreaming(true)

    const reviewContext = selectedReview
      ? reviews.find(r => r.id === selectedReview)?.result || ''
      : ''

    const systemPrompt = `你是一位严格但公平的面试官，正在面试候选人。
岗位 JD：${jd}
${reviewContext ? `候选人背景：${reviewContext.slice(0, 500)}` : ''}

规则：
- 每次只问一个问题
- 根据候选人回答追问或转向下一个问题
- 候选人回答后，先给出简短点评（1-2句），再问下一个问题
- 总共进行 5-8 轮问答
- 全程扮演面试官，不要跳出角色`

    let question = ''
    try {
      await streamDeepSeek(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请开始面试，先做自我介绍，然后问我第一个问题。' },
        ],
        chunk => { question += chunk },
        () => {
          setMockStreaming(false)
          setChatMessages([{ role: 'interviewer', content: question }])
        }
      )
    } catch {
      setMockStreaming(false)
    }
  }

  const handleUserReply = async () => {
    if (!userInput.trim() || mockStreaming) return
    const userMsg = userInput.trim()
    setUserInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setMockStreaming(true)

    const reviewContext = selectedReview
      ? reviews.find(r => r.id === selectedReview)?.result || ''
      : ''

    const history = [
      ...chatMessages.map(m => ({
        role: m.role === 'interviewer' || m.role === 'feedback' ? 'assistant' : 'user',
        content: m.content,
      })),
      { role: 'user', content: userMsg },
    ]

    let response = ''
    try {
      await streamDeepSeek(
        [
          {
            role: 'system',
            content: `你是面试官，继续进行面试。岗位 JD：${jd}。${reviewContext ? `候选人背景：${reviewContext.slice(0, 300)}` : ''}
先用1-2句点评候选人的回答（优点+改进点），然后继续问下一个问题。格式：【点评】xxx \n\n【面试官】xxx`,
          },
          ...history,
        ],
        chunk => { response += chunk },
        () => {
          setMockStreaming(false)
          setChatMessages(prev => [...prev, { role: 'feedback', content: response }])
        }
      )
    } catch {
      setMockStreaming(false)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">🎯 面试准备</h1>

      {/* JD 输入 */}
      <div className="card mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">目标岗位 JD *</label>
        <textarea className="textarea" rows={4} value={jd} onChange={e => setJd(e.target.value)} placeholder="粘贴岗位职责描述..." />
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer hover:text-blue-600 mt-2">
          <span>{jdUploading ? '⏳ 解析中...' : '📎 上传 JD 文件（PDF/Word/TXT，可多选）'}</span>
          <input
            ref={jdFileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            multiple
            className="hidden"
            disabled={jdUploading}
            onChange={async (e) => {
              const files = e.target.files
              if (!files || files.length === 0) return
              setJdUploading(true)
              try {
                const text = await parseFiles(files)
                setJd(prev => prev ? prev + '\n\n' + text : text)
                setJdFiles(prev => [...prev, ...Array.from(files).map(f => f.name)])
              } catch (err: any) {
                alert('文件解析失败：' + err.message)
              } finally {
                setJdUploading(false)
                if (jdFileRef.current) jdFileRef.current.value = ''
              }
            }}
          />
        </label>
        {jdFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {jdFiles.map((name, i) => (
              <span key={i} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">📄 {name}</span>
            ))}
          </div>
        )}

        {reviews.length > 0 && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">关联复盘记录（可选）</label>
            <select className="input" value={selectedReview} onChange={e => setSelectedReview(e.target.value)}>
              <option value="">不关联</option>
              {reviews.map(r => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleDateString('zh-CN')} · {r.content.slice(0, 30)}...
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tab 切换 */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
        <button onClick={() => setTab('prep')} className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${tab === 'prep' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>📚 面试准备材料</button>
        <button onClick={() => setTab('mock')} className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${tab === 'mock' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>🎤 模拟面试</button>
      </div>

      {tab === 'prep' && (
        <div className="space-y-4">
          <button onClick={generatePrep} disabled={streaming || !jd.trim()} className="btn-primary w-full py-3">
            {streaming ? '✨ 生成中...' : '生成面试准备材料'}
          </button>
          {result && (
            <div className="card">
              <MarkdownRenderer content={result} streaming={streaming} />
            </div>
          )}
        </div>
      )}

      {tab === 'mock' && (
        <div className="space-y-4">
          {chatMessages.length === 0 ? (
            <button onClick={startMockInterview} disabled={mockStreaming || !jd.trim()} className="btn-primary w-full py-3">
              {mockStreaming ? '面试官入场中...' : '🎤 开始模拟面试'}
            </button>
          ) : (
            <>
              <div className="space-y-3 max-h-96 overflow-y-auto p-1">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : msg.role === 'feedback'
                        ? 'bg-amber-50 border border-amber-200 text-gray-800'
                        : 'bg-white border border-gray-200 text-gray-800'
                    }`}>
                      {msg.role !== 'user' && (
                        <div className="text-xs font-medium mb-1 opacity-60">
                          {msg.role === 'feedback' ? '💬 面试官点评' : '👔 面试官'}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {mockStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">
                      <span className="streaming-cursor">思考中</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2">
                <textarea
                  className="textarea flex-1"
                  rows={2}
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  placeholder="输入你的回答..."
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserReply() }}}
                />
                <button onClick={handleUserReply} disabled={mockStreaming || !userInput.trim()} className="btn-primary px-4">
                  发送
                </button>
              </div>
              <button onClick={() => setChatMessages([])} className="text-sm text-gray-400 hover:text-red-500 w-full text-center">重新开始面试</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
