const DEEPSEEK_API_KEY = 'sk-bed03e933b43468db214b0de2e62cd9d'
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export async function streamDeepSeek(
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  onDone?: () => void
) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))

    for (const line of lines) {
      const data = line.slice(6)
      if (data === '[DONE]') {
        onDone?.()
        return
      }
      try {
        const json = JSON.parse(data)
        const text = json.choices?.[0]?.delta?.content
        if (text) onChunk(text)
      } catch {}
    }
  }
  onDone?.()
}

// 只优化简历的某一段，保留其余内容和格式
export async function polishResumeSection(
  sectionTitle: string,
  sectionContent: string,
  jobTarget?: string
): Promise<string> {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一位专业的简历优化顾问。你的任务是：
1. 只优化用户给你的这一段简历内容
2. 严格保留原有的 Markdown 格式结构（标题层级、缩进、列表符号等）
3. 不增加、不删除段落，不改变整体骨架
4. 只润色文字表达：让成果更数据化、动词更有力、逻辑更清晰
5. 只输出优化后的段落内容，不要加任何解释或说明`,
        },
        {
          role: 'user',
          content: `请优化我简历中「${sectionTitle}」这一段内容${jobTarget ? `（目标岗位：${jobTarget}）` : ''}：\n\n${sectionContent}`,
        },
      ],
      temperature: 0.5,
    }),
  })
  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? sectionContent
}

export async function chatDeepSeek(
  messages: { role: string; content: string }[]
): Promise<string> {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
    }),
  })
  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}
