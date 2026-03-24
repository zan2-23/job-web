import ReactMarkdown from 'react-markdown'

interface Props {
  content: string
  streaming?: boolean
}

export default function MarkdownRenderer({ content, streaming }: Props) {
  return (
    <div className={`markdown-body ${streaming ? 'streaming-cursor' : ''}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}
