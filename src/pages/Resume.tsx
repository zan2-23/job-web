import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { streamDeepSeek } from '../lib/deepseek'
import MarkdownRenderer from '../components/MarkdownRenderer'

export default function ResumePage() {
  const [step, setStep] = useState<1 | 2>(1)
  const [experience, setExperience] = useState('')
  const [originalResume, setOriginalResume] = useState('')
  const [baseResume, setBaseResume] = useState('')
  const [jdContent, setJdContent] = useState('')
  const [finalResume, setFinalResume] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type === 'text/plain' || file.name.endsWith('.md')) {
      const text = await file.text()
      setter(prev => prev + '\n\n' + text)
    } else {
      alert('目前支持 TXT/MD 格式，PDF/Word 请复制粘贴文本')
    }
  }

  const generateBaseResume = async () => {
    if (!experience.trim()) return
    setBaseResume('')
    setFinalResume('')
    setStreaming(true)

    const messages = [
      {
        role: 'system',
        content: `你是一位专业的简历优化顾问，擅长用 STAR 法则提炼工作经历，写出有亮点、有数据的简历。
请根据用户提供的工作经历，生成一份完整的简历，Markdown 格式，包含：
- 个人简介（3-4句话，突出核心优势）
- 工作/实习经历（每段用 STAR 法则，量化成果）
- 项目经历（如有）
- 技能
注意：语言简洁有力，突出数据和结果，避免空话。`,
      },
      {
        role: 'user',
        content: `请根据以下内容生成简历：\n\n【工作经历描述】\n${experience}${originalResume ? `\n\n【原始简历参考】\n${originalResume}` : ''}`,
      },
    ]

    let full = ''
    try {
      await streamDeepSeek(messages, chunk => {
        full += chunk
        setBaseResume(full)
      }, async () => {
        setStreaming(false)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data } = await supabase.from('resumes').insert({
            user_id: user.id,
            base_content: experience,
            jd_content: '',
            generated_resume: full,
          }).select().single()
          if (data) setSavedId(data.id)
        }
      })
    } catch {
      setStreaming(false)
    }
  }

  const generateCustomResume = async () => {
    if (!jdContent.trim() || !baseResume) return
    setFinalResume('')
    setStreaming(true)

    const messages = [
      {
        role: 'system',
        content: `你是一位专业的简历顾问，擅长根据岗位 JD 定制简历，突出与岗位匹配的经历和技能。`,
      },
      {
        role: 'user',
        content: `请根据以下 JD，对我的简历进行定制优化，重点突出与岗位匹配的内容，调整措辞贴合岗位需求：\n\n【岗位 JD】\n${jdContent}\n\n【我的简历】\n${baseResume}`,
      },
    ]

    let full = ''
    try {
      await streamDeepSeek(messages, chunk => {
        full += chunk
        setFinalResume(full)
      }, async () => {
        setStreaming(false)
        const { data: { user } } = await supabase.auth.getUser()
        if (user && savedId) {
          await supabase.from('resumes').update({ jd_content: jdContent, generated_resume: full }).eq('id', savedId)
        }
      })
    } catch {
      setStreaming(false)
    }
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentResume = finalResume || baseResume

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">📝 写简历</h1>

      {/* 步骤指示 */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${step === 1 ? 'bg-blue-600 text-white' : 'bg-green-100 text-green-700'}`}>
          <span>{step > 1 ? '✓' : '1'}</span>
          <span>生成基础简历</span>
        </div>
        <div className="flex-1 h-0.5 bg-gray-200" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
          <span>2</span>
          <span>JD 定制简历</span>
        </div>
      </div>

      {/* 第一步 */}
      {!baseResume ? (
        <div className="space-y-4">
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">工作/实习经历描述 *</label>
            <textarea className="textarea" rows={7} value={experience} onChange={e => setExperience(e.target.value)} placeholder="详细描述你的工作内容、负责的项目、取得的成果..." />
          </div>
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">原始简历（可选）</label>
            <textarea className="textarea" rows={4} value={originalResume} onChange={e => setOriginalResume(e.target.value)} placeholder="粘贴你现有的简历内容，AI 会参考并优化..." />
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer hover:text-blue-600 mt-2">
              <span>📎 上传简历文件</span>
              <input type="file" accept=".txt,.md" className="hidden" onChange={e => handleFileUpload(e, setOriginalResume)} />
            </label>
          </div>
          <button onClick={generateBaseResume} disabled={streaming || !experience.trim()} className="btn-primary w-full py-3">
            {streaming ? '✨ 生成中...' : '生成基础简历'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 简历展示 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{finalResume ? '🎯 定制简历' : '📄 基础简历'}</h2>
              <div className="flex gap-2">
                <button onClick={() => handleCopy(currentResume)} className="text-sm text-blue-600 hover:underline">
                  {copied ? '✓ 已复制' : '复制 Markdown'}
                </button>
                <button onClick={() => { setBaseResume(''); setFinalResume(''); setStep(1) }} className="text-sm text-gray-400 hover:text-red-500">重新生成</button>
              </div>
            </div>
            <MarkdownRenderer content={currentResume} streaming={streaming} />
          </div>

          {/* 第二步：JD 定制 */}
          <div className="card">
            <h3 className="font-medium mb-3">🎯 根据 JD 定制简历</h3>
            <textarea className="textarea" rows={5} value={jdContent} onChange={e => setJdContent(e.target.value)} placeholder="粘贴目标岗位的职位描述 (JD)，AI 会针对性优化简历..." />
            <button onClick={generateCustomResume} disabled={streaming || !jdContent.trim()} className="btn-primary w-full py-3 mt-3">
              {streaming ? '✨ 定制中...' : '生成定制简历'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
