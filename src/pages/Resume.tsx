import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { streamDeepSeek } from '../lib/deepseek'
import MarkdownRenderer from '../components/MarkdownRenderer'
import { parseFiles } from '../lib/fileParser'

export default function ResumePage() {
  const [step, setStep] = useState<1 | 2>(() => {
    try { return (parseInt(sessionStorage.getItem('resume_step') || '1') as 1 | 2) } catch { return 1 }
  })
  const [experience, setExperience] = useState(() => {
    try { return sessionStorage.getItem('resume_experience') || '' } catch { return '' }
  })
  const [expDocs, setExpDocs] = useState<{ name: string; text: string }[]>([])
  const [resumeDocs, setResumeDocs] = useState<{ name: string; text: string }[]>([])
  const [baseResume, setBaseResume] = useState(() => {
    try { return sessionStorage.getItem('resume_base') || '' } catch { return '' }
  })
  const [jdContent, setJdContent] = useState(() => {
    try { return sessionStorage.getItem('resume_jd') || '' } catch { return '' }
  })
  const [finalResume, setFinalResume] = useState(() => {
    try { return sessionStorage.getItem('resume_final') || '' } catch { return '' }
  })
  const [streaming, setStreaming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(() => {
    try { return sessionStorage.getItem('resume_saved_id') } catch { return null }
  })
  const [uploading, setUploading] = useState<string | null>(null)
  const expFileRef = useRef<HTMLInputElement>(null)
  const resumeFileRef = useRef<HTMLInputElement>(null)

  // 持久化
  useEffect(() => { try { sessionStorage.setItem('resume_step', String(step)) } catch {} }, [step])
  useEffect(() => { try { sessionStorage.setItem('resume_experience', experience) } catch {} }, [experience])
  useEffect(() => { try { sessionStorage.setItem('resume_base', baseResume) } catch {} }, [baseResume])
  useEffect(() => { try { sessionStorage.setItem('resume_jd', jdContent) } catch {} }, [jdContent])
  useEffect(() => { try { sessionStorage.setItem('resume_final', finalResume) } catch {} }, [finalResume])
  useEffect(() => { try { if (savedId) sessionStorage.setItem('resume_saved_id', savedId) } catch {} }, [savedId])

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    docsSetter: (fn: (prev: { name: string; text: string }[]) => { name: string; text: string }[]) => void,
    inputRef: React.RefObject<HTMLInputElement>,
    uploadingKey: string
  ) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(uploadingKey)
    try {
      const newDocs: { name: string; text: string }[] = []
      for (const file of Array.from(files)) {
        const text = await parseFiles([file])
        newDocs.push({ name: file.name, text })
      }
      docsSetter(prev => [...prev, ...newDocs])
    } catch (err: any) {
      alert('文件解析失败：' + err.message)
    } finally {
      setUploading(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const generateBaseResume = async () => {
    const expFull = [
      experience.trim(),
      ...expDocs.map(d => `【来自文档：${d.name}】\n${d.text}`)
    ].filter(Boolean).join('\n\n')
    if (!expFull) return
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
        content: `请根据以下内容生成简历：\n\n【工作经历描述】\n${expFull}${resumeDocs.length > 0 ? `\n\n【原始简历参考】\n${resumeDocs.map(d => d.text).join('\n\n')}` : ''}`,
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
            <label className="block text-sm font-medium text-gray-700 mb-2">工作/实习经历描述</label>
            <textarea className="textarea" rows={5} value={experience} onChange={e => setExperience(e.target.value)} placeholder="直接输入经历描述，或上传文档，或两者结合..." />
            <div className="flex items-center justify-between mt-2">
              <label className={`flex items-center gap-1.5 text-sm cursor-pointer px-3 py-1.5 rounded-lg border transition-all ${uploading === 'exp' ? 'text-gray-400 border-gray-200' : 'text-blue-600 border-blue-200 hover:bg-blue-50'}`}>
                <span>{uploading === 'exp' ? '⏳ 解析中...' : '+ 上传经历文档'}</span>
                <input ref={expFileRef} type="file" accept=".pdf,.docx,.txt,.md" multiple className="hidden" disabled={!!uploading}
                  onChange={e => handleFileUpload(e, setExpDocs, expFileRef, 'exp')} />
              </label>
            </div>
            {expDocs.length > 0 && (
              <div className="mt-2 space-y-1">
                {expDocs.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{doc.name.endsWith('.pdf') ? '📕' : '📘'}</span>
                      <span className="text-sm text-gray-700">{doc.name}</span>
                      <span className="text-xs text-gray-400">{doc.text.length} 字符</span>
                    </div>
                    <button onClick={() => setExpDocs(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 text-lg">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">原始简历（可选）</label>
            <p className="text-xs text-gray-400 mb-2">上传现有简历，AI 会参考格式和内容进行优化</p>
            <label className={`flex items-center gap-1.5 text-sm cursor-pointer px-3 py-1.5 rounded-lg border transition-all w-fit ${uploading === 'resume' ? 'text-gray-400 border-gray-200' : 'text-blue-600 border-blue-200 hover:bg-blue-50'}`}>
              <span>{uploading === 'resume' ? '⏳ 解析中...' : '+ 上传简历文件'}</span>
              <input ref={resumeFileRef} type="file" accept=".pdf,.docx,.txt,.md" multiple className="hidden" disabled={!!uploading}
                onChange={e => handleFileUpload(e, setResumeDocs, resumeFileRef, 'resume')} />
            </label>
            {resumeDocs.length > 0 && (
              <div className="mt-2 space-y-1">
                {resumeDocs.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{doc.name.endsWith('.pdf') ? '📕' : '📘'}</span>
                      <span className="text-sm text-gray-700">{doc.name}</span>
                      <span className="text-xs text-gray-400">{doc.text.length} 字符</span>
                    </div>
                    <button onClick={() => setResumeDocs(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 text-lg">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={generateBaseResume} disabled={streaming || (!experience.trim() && expDocs.length === 0)} className="btn-primary w-full py-3">
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
                <button onClick={() => {
  setBaseResume(''); setFinalResume(''); setStep(1); setExperience(''); setJdContent(''); setSavedId(null)
  ;['resume_step','resume_experience','resume_base','resume_jd','resume_final','resume_saved_id'].forEach(k => sessionStorage.removeItem(k))
}} className="text-sm text-gray-400 hover:text-red-500">重新生成</button>
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
