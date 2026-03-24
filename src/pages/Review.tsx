import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { streamDeepSeek } from '../lib/deepseek'
import MarkdownRenderer from '../components/MarkdownRenderer'
import MindMap from '../components/MindMap'
import { parseFiles } from '../lib/fileParser'
import { Review } from '../types'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `你是一位专业的职场顾问，擅长帮助求职者深度梳理和复盘工作经历。

你的工作方式：
- 用户描述经历后，给出深度分析（核心成就、能力维度、可提炼方法论、差异化竞争点）
- 用 Markdown 格式输出，结构清晰
- 如果用户想补充或追问，继续深入分析
- 可以主动提问，帮用户挖掘更多价值点
- 语气专业但不刻板，像一个真正懂你的职场顾问`

export default function ReviewPage() {
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const saved = sessionStorage.getItem('review_messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [docTexts, setDocTexts] = useState<{ name: string; text: string }[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [showMindMap, setShowMindMap] = useState(false)
  const [history, setHistory] = useState<Review[]>([])
  const [selectedHistory, setSelectedHistory] = useState<Review | null>(null)
  const [tab, setTab] = useState<'chat' | 'history'>('chat')
  const [uploading, setUploading] = useState(false)
  const [savedToHistory, setSavedToHistory] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 消息变化时同步到 sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('review_messages', JSON.stringify(messages))
    } catch {}
  }, [messages])

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const loadHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('reviews').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setHistory(data || [])
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const newDocs: { name: string; text: string }[] = []
      for (const file of Array.from(files)) {
        const text = await parseFiles([file])
        newDocs.push({ name: file.name, text })
      }
      setDocTexts(prev => [...prev, ...newDocs])
    } catch (err: any) {
      alert('解析失败：' + err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeDoc = (i: number) => setDocTexts(prev => prev.filter((_, j) => j !== i))

  const handleSend = async () => {
    const text = input.trim()
    const hasDocs = docTexts.length > 0
    if (!text && !hasDocs) return
    if (streaming) return

    // 构建用户消息
    let userContent = text
    if (hasDocs) {
      const docPart = docTexts.map(d => `【文档：${d.name}】\n${d.text}`).join('\n\n')
      userContent = text ? `${text}\n\n${docPart}` : docPart
    }

    const displayMsg: ChatMsg = {
      role: 'user',
      content: text || `上传了 ${docTexts.length} 个文档：${docTexts.map(d => d.name).join('、')}`,
    }

    const newMessages = [...messages, displayMsg]
    setMessages(newMessages)
    setInput('')
    setDocTexts([])
    setStreaming(true)
    setStreamingContent('')

    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userContent },
    ]

    let full = ''
    try {
      await streamDeepSeek(
        apiMessages,
        chunk => {
          full += chunk
          setStreamingContent(full)
        },
        async () => {
          setStreaming(false)
          setStreamingContent('')
          const assistantMsg: ChatMsg = { role: 'assistant', content: full }
          const finalMessages = [...newMessages, assistantMsg]
          setMessages(finalMessages)

          // 保存/更新历史：把完整对话存为一条记录
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const fullConversation = finalMessages
              .map(m => `【${m.role === 'user' ? '我' : 'AI'}】\n${m.content}`)
              .join('\n\n---\n\n')
            const firstUserMsg = finalMessages.find(m => m.role === 'user')?.content || ''
            const savedId = sessionStorage.getItem('review_current_id')

            if (savedId) {
              await supabase.from('reviews').update({
                content: firstUserMsg.slice(0, 200),
                result: fullConversation,
              }).eq('id', savedId)
            } else {
              const { data } = await supabase.from('reviews').insert({
                user_id: user.id,
                content: firstUserMsg.slice(0, 200),
                result: fullConversation,
              }).select().single()
              if (data?.id) sessionStorage.setItem('review_current_id', data.id)
            }
            loadHistory()
          }
        }
      )
    } catch {
      setStreaming(false)
      setStreamingContent('')
      setMessages(prev => [...prev, { role: 'assistant', content: '出错了，请重试。' }])
    }
  }

  const clearChat = () => {
    setMessages([])
    setDocTexts([])
    setInput('')
    setShowMindMap(false)
    sessionStorage.removeItem('review_messages')
    sessionStorage.removeItem('review_current_id')
  }

  // 最后一条 AI 消息，用于思维导图
  const lastAIContent = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">📋 工作复盘</h1>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('chat')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'chat' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>对话复盘</button>
          <button onClick={() => setTab('history')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'history' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>历史 {history.length > 0 && `(${history.length})`}</button>
        </div>
      </div>

      {tab === 'chat' && (
        <div className="space-y-3">
          {/* 对话区 */}
          <div className="card p-0 overflow-hidden">
            {/* 顶部操作栏 */}
            {messages.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-400">{messages.length} 条消息</span>
                <div className="flex gap-3">
                  {lastAIContent && (
                    <button onClick={() => setShowMindMap(!showMindMap)} className="text-xs text-blue-600 hover:underline">
                      {showMindMap ? '查看对话' : '🗺️ 思维导图'}
                    </button>
                  )}
                  <button onClick={clearChat} className="text-xs text-gray-400 hover:text-red-500">清空对话</button>
                </div>
              </div>
            )}

            {/* 消息列表 / 思维导图 */}
            {showMindMap && lastAIContent ? (
              <div className="p-4">
                <MindMap content={lastAIContent} />
              </div>
            ) : (
              <div className="min-h-64 max-h-[500px] overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400">
                    <div className="text-4xl mb-3">💬</div>
                    <p className="text-sm font-medium text-gray-500">开始你的职场复盘</p>
                    <p className="text-xs mt-1">描述你的工作经历，或上传简历/工作文档<br />AI 帮你深度分析，可以持续追问</p>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs mr-2 mt-1 shrink-0">AI</div>
                      )}
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-sm'
                      }`}>
                        {msg.role === 'assistant'
                          ? <MarkdownRenderer content={msg.content} />
                          : <p className="whitespace-pre-wrap">{msg.content}</p>
                        }
                      </div>
                    </div>
                  ))
                )}

                {/* 流式输出 */}
                {streaming && (
                  <div className="flex justify-start">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs mr-2 mt-1 shrink-0">AI</div>
                    <div className="max-w-[85%] bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-800">
                      {streamingContent
                        ? <MarkdownRenderer content={streamingContent} streaming />
                        : <span className="text-gray-400 animate-pulse">思考中...</span>
                      }
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* 已上传文件 */}
          {docTexts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {docTexts.map((doc, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-sm">{doc.name.endsWith('.pdf') ? '📕' : '📘'}</span>
                  <span className="text-xs text-blue-700 font-medium">{doc.name}</span>
                  <button onClick={() => removeDoc(i)} className="text-blue-300 hover:text-red-400 ml-1">×</button>
                </div>
              ))}
            </div>
          )}

          {/* 输入区 */}
          <div className="card p-3">
            <textarea
              className="w-full text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none bg-transparent"
              rows={3}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={messages.length === 0
                ? "描述你的工作经历、项目成果、遇到的挑战...&#10;也可以直接上传简历或工作文档"
                : "继续追问，或补充更多细节..."
              }
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              disabled={streaming}
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              <label className={`flex items-center gap-1.5 text-xs cursor-pointer px-2.5 py-1.5 rounded-lg transition-all ${uploading ? 'text-gray-400' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}>
                <span>📎</span>
                <span>{uploading ? '解析中...' : '上传文档（PDF/Word/TXT）'}</span>
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" multiple className="hidden" disabled={uploading || streaming} onChange={handleFileUpload} />
              </label>
              <button
                onClick={handleSend}
                disabled={streaming || (!input.trim() && docTexts.length === 0)}
                className="btn-primary px-4 py-1.5 text-sm"
              >
                {streaming ? '生成中...' : '发送'}
              </button>
            </div>
          </div>

          <p className="text-xs text-center text-gray-400">Enter 发送 · Shift+Enter 换行</p>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center text-gray-400 py-12">还没有复盘记录</div>
          ) : selectedHistory ? (
            <div>
              <button onClick={() => setSelectedHistory(null)} className="text-sm text-blue-600 mb-4">← 返回列表</button>
              <div className="card">
                <MarkdownRenderer content={selectedHistory.result} />
              </div>
            </div>
          ) : (
            history.map(item => (
              <div key={item.id} className="card cursor-pointer hover:border-blue-200 transition-colors" onClick={() => setSelectedHistory(item)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{item.content.slice(0, 50) || '复盘记录'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.result.split('---').length - 1} 轮对话
                    </p>
                  </div>
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
