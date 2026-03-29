/**
 * 文件解析器 — 支持 PDF、Word (.docx)、TXT、MD
 * PDF: pdfjs-dist via CDN（动态加载 script，不打包进 bundle）
 * Word: mammoth（本地包）
 * TXT/MD: 原生 File.text()
 */

const PDFJS_VERSION = '4.0.379'
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`

async function loadPdfjsLib(): Promise<any> {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${PDFJS_CDN}/build/pdf.min.mjs`
    script.type = 'module'
    script.onload = () => {
      const lib = (window as any).pdfjsLib
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.mjs`
        resolve(lib)
      } else {
        reject(new Error('pdfjs-dist 加载失败'))
      }
    }
    script.onerror = () => reject(new Error('pdfjs-dist CDN 加载失败，请检查网络'))
    document.head.appendChild(script)
  })
}

async function parsePDF(file: File): Promise<string> {
  // 用 fetch + ArrayBuffer 方式，不依赖 ESM import
  const arrayBuffer = await file.arrayBuffer()

  // 动态加载 pdfjs via CDN
  const pdfjsLib = await new Promise<any>((resolve, reject) => {
    if ((window as any).pdfjsLib) return resolve((window as any).pdfjsLib)

    // 用 importmap-safe 的方式：直接用 fetch + eval 不可行
    // 改用 Worker + Blob 方式直接解析
    // 最简单可靠：用 fetch CDN JS
    const s = document.createElement('script')
    s.src = `${PDFJS_CDN}/legacy/build/pdf.min.js`
    s.onload = () => {
      const lib = (window as any).pdfjsLib
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/legacy/build/pdf.worker.min.js`
        resolve(lib)
      } else {
        reject(new Error('pdfjsLib not found after script load'))
      }
    }
    s.onerror = () => reject(new Error('pdfjs CDN 加载失败'))
    document.head.appendChild(s)
  })

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pageTexts.push(content.items.map((item: any) => item.str).join(' '))
  }

  return pageTexts.join('\n').trim()
}

async function parseWord(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value.trim()
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
    return await file.text()
  }
}

export async function parseFiles(files: FileList | File[]): Promise<string> {
  const fileArray = Array.from(files)
  const results: string[] = []

  for (const file of fileArray) {
    try {
      const text = await parseFile(file)
      results.push(text.trim() ? `【${file.name}】\n${text}` : `【${file.name}】内容为空`)
    } catch (err: any) {
      results.push(`【${file.name}】解析失败：${err.message}`)
    }
  }

  return results.join('\n\n---\n\n')
}
