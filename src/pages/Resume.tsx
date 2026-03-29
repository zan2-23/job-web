import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { streamDeepSeek, polishResumeSection } from '../lib/deepseek'
import MarkdownRenderer from '../components/MarkdownRenderer'
import { parseFiles } from '../lib/fileParser'

type ResumeStyle = 'ability' | 'project'

// ── 解析 Markdown 为段落列表 ──
function parseResumeIntoSections(markdown: string): { title: string; content: string; startLine: number; endLine: number }[] {
  const lines = markdown.split('\n')
  const sections: { title: string; content: string; startLine: number; endLine: number }[] = []
  let currentTitle = ''
  let currentStart = 0
  let currentLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isHeading = /^#{1,3}\s/.test(line)

    if (isHeading) {
      // 保存上一段
      if (currentTitle && currentLines.length > 0) {
        sections.push({
          title: currentTitle,
          content: currentLines.join('\n').trim(),
          startLine: currentStart,
          endLine: i - 1,
        })
      }
      currentTitle = line.replace(/^#+\s*/, '').trim()
      currentStart = i
      currentLines = [line]
    } else {
      currentLines.push(line)
    }
  }

  // 最后一段
  if (currentTitle && currentLines.length > 0) {
    sections.push({
      title: currentTitle,
      content: currentLines.join('\n').trim(),
      startLine: currentStart,
      endLine: lines.length - 1,
    })
  }

  return sections
}

// ── 把某段内容替换回完整 Markdown ──
function replaceSection(
  fullMarkdown: string,
  section: { startLine: number; endLine: number },
  newContent: string
): string {
  const lines = fullMarkdown.split('\n')
  const before = lines.slice(0, section.startLine)
  const after = lines.slice(section.endLine + 1)
  return [...before, newContent, ...after].join('\n')
}

// ── 下载为 .txt 文件 ──
function downloadAsTxt(content: string, filename: string) {
  // 把 Markdown 转为更干净的纯文本
  const plain = content
    .replace(/^#{1,6}\s+/gm, '')          // 去掉标题 #
    .replace(/\*\*(.+?)\*\*/g, '$1')       // 去掉粗体 **
    .replace(/\*(.+?)\*/g, '$1')           // 去掉斜体 *
    .replace(/^[-*]\s+/gm, '• ')           // 列表符号统一
    .replace(/^\d+\.\s+/gm, match => match) // 有序列表保留
  const blob = new Blob([plain], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── 下载为 Markdown 文件 ──
function downloadAsMd(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResumePage() {
  const [step, setStep] = useState<1 | 2>(() => {
    try { return (parseInt(sessionStorage.getItem('resume_step') || '1') as 1 | 2) } catch { return 1 }
  })
  const [experience, setExperience] = useState(() => {
    try { return sessionStorage.getItem('resume_experience') || '' } catch { return '' }
  })
  const [resumeStyle, setResumeStyle] = useState<ResumeStyle>(() => {
    try { return (sessionStorage.getItem('resume_style') as ResumeStyle) || 'ability' } catch { return 'ability' }
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

  // 分段优化状态
  const [sections, setSections] = useState<{ title: string; content: string; startLine: number; endLine: number }[]>([])
  const [polishingSection, setPolishingSection] = useState<string | null>(null) // 正在优化的段落 title
  const [sectionMode, setSectionMode] = useState(false) // 是否展开分段面板

  const expFileRef = useRef<HTMLInputElement>(null)
  const resumeFileRef = useRef<HTMLInputElement>(null)

  // 持久化
  useEffect(() => { try { sessionStorage.setItem('resume_step', String(step)) } catch {} }, [step])
  useEffect(() => { try { sessionStorage.setItem('resume_experience', experience) } catch {} }, [experience])
  useEffect(() => { try { sessionStorage.setItem('resume_style', resumeStyle) } catch {} }, [resumeStyle])
  useEffect(() => { try { sessionStorage.setItem('resume_base', baseResume) } catch {} }, [baseResume])
  useEffect(() => { try { sessionStorage.setItem('resume_jd', jdContent) } catch {} }, [jdContent])
  useEffect(() => { try { sessionStorage.setItem('resume_final', finalResume) } catch {} }, [finalResume])
  useEffect(() => { try { if (savedId) sessionStorage.setItem('resume_saved_id', savedId) } catch {} }, [savedId])

  // 当 resume 内容变化时，自动解析段落
  const currentResume = finalResume || baseResume
  useEffect(() => {
    if (currentResume) {
      setSections(parseResumeIntoSections(currentResume))
    }
  }, [currentResume])

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

  const resetAll = () => {
    setBaseResume(''); setFinalResume(''); setStep(1); setExperience('')
    setJdContent(''); setSavedId(null); setSections([]); setSectionMode(false)
    ;['resume_step','resume_experience','resume_base','resume_jd','resume_final','resume_saved_id'].forEach(k => sessionStorage.removeItem(k))
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

    const stylePrompt = resumeStyle === 'ability'
      ? `请按【能力维度】组织简历，结构如下：
- 个人简介（3-4句，突出核心能力标签）
- 核心能力（数据分析/用户运营/项目管理等能力维度，每个维度下列举具体案例和数据）
- 工作/实习经历（简要列出，重点在能力展示）
- 技能`
      : `请按【项目经历】组织简历，结构如下：
- 个人简介（3-4句，突出项目背景和成果）
- 核心项目（每个项目独立呈现，包含背景、你的角色、行动、成果，用数据量化）
- 工作/实习经历（公司/时间/职位）
- 技能`

    const messages = [
      {
        role: 'system',
        content: `你是一位专业的简历优化顾问，擅长用 STAR 法则提炼工作经历，写出有亮点、有数据的简历。
${stylePrompt}
注意：语言简洁有力，突出数据和结果，避免空话。输出 Markdown 格式。`,
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
        setStep(2)
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
        content: `你是一位专业的简历顾问，擅长根据岗位 JD 定制简历，突出与岗位匹配的经历和技能。
重要原则：保持原有 Markdown 格式结构不变，只调整措辞和重点，不增删段落。`,
      },
      {
        role: 'user',
        content: `请根据以下 JD，对我的简历进行定制优化，重点突出与岗位匹配的内容，调整措辞贴合岗位需求。保持原有的格式结构：\n\n【岗位 JD】\n${jdContent}\n\n【我的简历】\n${baseResume}`,
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

  // ── 单段优化 ──
  const handlePolishSection = async (section: { title: string; content: string; startLine: number; endLine: number }) => {
    setPolishingSection(section.title)
    try {
      const polished = await polishResumeSection(section.title, section.content)
      const updated = replaceSection(currentResume, section, polished)
      if (finalResume) {
        setFinalResume(updated)
      } else {
        setBaseResume(updated)
      }
    } catch (e: any) {
      alert('优化失败：' + e.message)
    } finally {
      setPolishingSection(null)
    }
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = (format: 'txt' | 'md') => {
    const filename = `简历_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}`
    if (format === 'txt') {
      downloadAsTxt(currentResume, `${filename}.txt`)
    } else {
      downloadAsMd(currentResume, `${filename}.md`)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">📝 写简历</h1>

      {/* 步骤指示 */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${!baseResume ? 'bg-blue-600 text-white' : 'bg-green-100 text-green-700'}`}>
          <span>{baseResume ? '✓' : '1'}</span>
          <span>生成基础简历</span>
        </div>
        <div className="flex-1 h-0.5 bg-gray-200" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${baseResume ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
          <span>2</span>
          <span>JD 定制 & 精调</span>
        </div>
      </div>

      {!baseResume ? (
        <div className="space-y-4">
          {/* 简历风格选择 */}
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-3">简历生成偏好</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setResumeStyle('ability')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${resumeStyle === 'ability' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="text-xl mb-1">💡</div>
                <div className="font-medium text-sm text-gray-800">按能力维度</div>
                <div className="text-xs text-gray-500 mt-1">突出数据分析、用户运营等能力标签，适合综合型岗位</div>
              </button>
              <button
                onClick={() => setResumeStyle('project')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${resumeStyle === 'project' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="text-xl mb-1">🚀</div>
                <div className="font-medium text-sm text-gray-800">按项目经历</div>
                <div className="text-xs text-gray-500 mt-1">以项目为核心展示成果，适合有明确项目积累的候选人</div>
              </button>
            </div>
          </div>

          {/* 经历输入 */}
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

          {/* 原始简历 */}
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-1">原始简历（可选）</label>
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
            {streaming ? '✨ 生成中...' : `生成简历（${resumeStyle === 'ability' ? '按能力维度' : '按项目经历'}）`}
          </button>
        </div>
      ) : (
        <div className="space-y-4">

          {/* 简历预览卡 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{finalResume ? '🎯 定制简历' : '📄 基础简历'}</h2>
              <div className="flex gap-2 items-center flex-wrap justify-end">
                <button onClick={() => handleCopy(currentResume)} className="text-sm text-blue-600 hover:underline">
                  {copied ? '✓ 已复制' : '复制 MD'}
                </button>
                {/* 下载按钮组 */}
                <div className="flex gap-1">
                  <button
                    onClick={() => handleDownload('txt')}
                    className="text-sm px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-all"
                  >
                    ⬇ 下载 TXT
                  </button>
                  <button
                    onClick={() => handleDownload('md')}
                    className="text-sm px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-all"
                  >
                    ⬇ 下载 MD
                  </button>
                </div>
                <button onClick={resetAll} className="text-sm text-gray-400 hover:text-red-500">重新生成</button>
              </div>
            </div>
            <MarkdownRenderer content={currentResume} streaming={streaming} />
          </div>

          {/* 分段精调面板 */}
          {!streaming && sections.length > 0 && (
            <div className="card border-2 border-dashed border-blue-200">
              <button
                className="w-full flex items-center justify-between text-sm font-medium text-blue-700"
                onClick={() => setSectionMode(!sectionMode)}
              >
                <span>✏️ 分段精调 — 选择某一段单独优化，不影响其他内容</span>
                <span className="text-gray-400 text-xs">{sectionMode ? '收起 ▲' : '展开 ▼'}</span>
              </button>

              {sectionMode && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-gray-400 mb-3">点击某段右侧的「✨ 优化」按钮，AI 只会改这一段，格式和其他内容保持不变</p>
                  {sections.map((section, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{section.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{section.content.slice(0, 60).replace(/\n/g, ' ')}…</div>
                      </div>
                      <button
                        onClick={() => handlePolishSection(section)}
                        disabled={!!polishingSection}
                        className={`ml-3 flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                          polishingSection === section.title
                            ? 'bg-blue-100 text-blue-400 cursor-not-allowed'
                            : polishingSection
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {polishingSection === section.title ? '优化中…' : '✨ 优化'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* JD 定制 */}
          <div className="card">
            <h3 className="font-medium mb-1">🎯 根据 JD 定制简历</h3>
            <p className="text-xs text-gray-400 mb-3">粘贴目标岗位 JD，AI 会针对性调整措辞和重点，保持格式结构不变</p>
            <textarea className="textarea" rows={5} value={jdContent} onChange={e => setJdContent(e.target.value)} placeholder="粘贴岗位职责描述..." />
            <button onClick={generateCustomResume} disabled={streaming || !jdContent.trim()} className="btn-primary w-full py-3 mt-3">
              {streaming ? '✨ 定制中...' : '生成定制简历'}
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
