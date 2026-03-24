/**
 * 支持 PDF、Word (.docx)、TXT、MD 多文件解析
 * PDF 用 pdfjs-dist，Word 用 mammoth（CDN动态加载），TXT 直接读
 */

async function loadMammoth(): Promise<any> {
  if ((window as any).mammoth) return (window as any).mammoth
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js'
    script.onload = () => resolve((window as any).mammoth)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

async function parsePDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  const { getDocument, GlobalWorkerOptions, version } = pdfjsLib
  GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((item: any) => item.str).join(' ') + '\n'
  }
  return text.trim()
}

async function parseWord(file: File): Promise<string> {
  const mammoth = await loadMammoth()
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value.trim()
}

async function parseTxt(file: File): Promise<string> {
  return await file.text()
}

export async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const type = file.type

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return await parsePDF(file)
  } else if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return await parseWord(file)
  } else if (name.endsWith('.doc')) {
    throw new Error('.doc 格式较旧，请另存为 .docx 后再上传')
  } else {
    return await parseTxt(file)
  }
}

export async function parseFiles(files: FileList | File[]): Promise<string> {
  const fileArray = Array.from(files)
  const results: string[] = []

  for (const file of fileArray) {
    try {
      const text = await parseFile(file)
      results.push(`【${file.name}】\n${text}`)
    } catch (err: any) {
      results.push(`【${file.name}】解析失败：${err.message}`)
    }
  }

  return results.join('\n\n---\n\n')
}
