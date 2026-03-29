/**
 * 文件解析器 — 支持 PDF、Word (.docx)、TXT、MD
 * PDF: pdfjs-dist（本地包，不走CDN）
 * Word: mammoth（本地包，不走CDN）
 * TXT/MD: 原生 FileReader
 */

async function parsePDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  // 用本地 worker，不走 CDN
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const lineText = content.items
      .map((item: any) => item.str)
      .join(' ')
    pageTexts.push(lineText)
  }

  return pageTexts.join('\n').trim()
}

async function parseWord(file: File): Promise<string> {
  const mammoth = await import('mammoth')
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
      if (!text.trim()) {
        results.push(`【${file.name}】内容为空，请检查文件`)
      } else {
        results.push(`【${file.name}】\n${text}`)
      }
    } catch (err: any) {
      results.push(`【${file.name}】解析失败：${err.message}`)
    }
  }

  return results.join('\n\n---\n\n')
}
