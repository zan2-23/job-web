import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { streamDeepSeek } from '../lib/deepseek'
import MarkdownRenderer from '../components/MarkdownRenderer'
import MindMap from '../components/MindMap'
import { Review } from '../types'

export default function ReviewPage() {
  const [content, setContent] = useState('')
  const [result, setResult] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showMindMap, setShowMindMap] = useState(false)
  const [history, setHistory] = useState<Review[]>([])
  const [selectedHistory, setSelectedHistory] = useState<Review | null>(null)
  const [tab, setTab] = useState<'new' | 'history'>('new')

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('reviews').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setHistory(data || [])
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type === 'text/plain') {
      const text = await file.text()
      setContent(prev => prev + '\n\n【上传文档内容】\n' + text)
    } else {
      alert('目前支持 TXT 格式文件，PDF/Word 请复制粘贴文本内容')
    }
  }

  const handleReview = async () => {
    if (!content.trim()) return
    setResult('')
    setStreaming(true)
    setShowMindMap(false)

    const messages = [
      {
        role: 'system',
        content: `你是一位专业的职场顾问，擅长帮助求职者梳理和复盘工作经历。
请对用户提供的工作经历进行深度复盘，输出结构化的 Markdown 报告，包含：
1. 核心成就与亮点（量化数据）
2. 能力维度分析（技术/产品/数据/协作等）
3. 可提炼的方法论
4. 求职时的差异化竞争点
5. 待提升的能力方向
语言专业、有洞察力，帮助用户看清自己的价值。`,
      },
      { role: 'user', content: `请帮我复盘以下工作经历：\n\n${content}` },
    ]

    let fullResult = ''
    try {
      await streamDeepSeek(
        messages,
        (chunk) => {
          fullResult += chunk
          setResult(fullResult)
        },
        async () => {
          setStreaming(false)
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await supabase.from('reviews').insert({ user_id: user.id, content, result: fullResult })
            loadHistory()
          }
        }
      )
    } catch (err) {
      setStreaming(false)
      setResult('生成失败，请检查网络或稍后重试。')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">📋 工作复盘</h1>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('new')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'new' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>新建复盘</button>
          <button onClick={() => setTab('history')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'history' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>历史记录 {history.length > 0 && `(${history.length})`}</button>
        </div>
      </div>

      {tab === 'new' && (
        <div className="space-y-4">
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">工作经历描述</label>
            <textarea
              className="textarea"
              rows={8}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="描述你的工作内容、负责的项目、取得的成果、遇到的挑战和解决方案...&#10;&#10;越详细越好，AI 会帮你挖掘价值点。"
            />
            <div className="flex items-center justify-between mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer hover:text-blue-600">
                <span>📎 上传文档</span>
                <input type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} />
              </label>
              <span className="text-xs text-gray-400">{content.length} 字</span>
            </div>
          </div>

          <button
            onClick={handleReview}
            disabled={streaming || !content.trim()}
            className="btn-primary w-full py-3 text-base"
          >
            {streaming ? '✨ AI 复盘中...' : '开始复盘'}
          </button>

          {result && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">复盘报告</h2>
                <button
                  onClick={() => setShowMindMap(!showMindMap)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {showMindMap ? '查看文档' : '🗺️ 思维导图'}
                </button>
              </div>
              {showMindMap ? (
                <MindMap content={result} />
              ) : (
                <MarkdownRenderer content={result} streaming={streaming} />
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center text-gray-400 py-12">还没有复盘记录</div>
          ) : selectedHistory ? (
            <div>
              <button onClick={() => setSelectedHistory(null)} className="text-sm text-blue-600 mb-4 flex items-center gap-1">← 返回列表</button>
              <div className="card">
                <h3 className="font-semibold mb-3">原始内容</h3>
                <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{selectedHistory.content}</p>
                <h3 className="font-semibold mb-3">复盘报告</h3>
                <MarkdownRenderer content={selectedHistory.result} />
              </div>
            </div>
          ) : (
            history.map(item => (
              <div key={item.id} className="card cursor-pointer hover:border-blue-200 transition-colors" onClick={() => setSelectedHistory(item)}>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-700 line-clamp-2">{item.content.slice(0, 80)}...</p>
                  <span className="text-xs text-gray-400 ml-4 shrink-0">{new Date(item.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
