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
