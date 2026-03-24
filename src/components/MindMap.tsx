import { useEffect, useRef, useState } from 'react'

interface Props {
  content: string
}

let scriptLoading = false
let scriptLoaded = false
const callbacks: (() => void)[] = []

function loadMarkmapAutoloader(): Promise<void> {
  return new Promise((resolve) => {
    if (scriptLoaded) { resolve(); return }
    callbacks.push(resolve)
    if (scriptLoading) return
    scriptLoading = true

    // 加载 d3
    const d3Script = document.createElement('script')
    d3Script.src = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'
    d3Script.onload = () => {
      // 再加载 markmap-autoloader
      const mmScript = document.createElement('script')
      mmScript.src = 'https://cdn.jsdelivr.net/npm/markmap-autoloader@0.16/dist/browser/index.js'
      mmScript.onload = () => {
        scriptLoaded = true
        callbacks.forEach(cb => cb())
        callbacks.length = 0
      }
      document.head.appendChild(mmScript)
    }
    document.head.appendChild(d3Script)
  })
}

export default function MindMap({ content }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const mmRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const render = async () => {
      setLoading(true)
      setError('')
      try {
        await loadMarkmapAutoloader()
        if (cancelled || !svgRef.current) return

        const w = window as any
        // markmap-autoloader 把所有东西都挂在 window.markmap 下
        const mm = w.markmap
        if (!mm?.Transformer || !mm?.Markmap) {
          // 等一下再试
          await new Promise(r => setTimeout(r, 800))
          if (cancelled) return
        }

        const { Transformer, Markmap } = w.markmap || {}
        if (!Transformer || !Markmap) throw new Error('markmap 未就绪')

        const transformer = new Transformer()
        const { root } = transformer.transform(content)

        if (mmRef.current) {
          mmRef.current.destroy?.()
          mmRef.current = null
        }

        // 清空 svg
        while (svgRef.current!.firstChild) {
          svgRef.current!.removeChild(svgRef.current!.firstChild)
        }

        mmRef.current = Markmap.create(svgRef.current!, { duration: 300 })
        await mmRef.current.setData(root)
        mmRef.current.fit()
        setLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [content])

  return (
    <div className="relative w-full h-96 border border-gray-200 rounded-lg overflow-hidden bg-white">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="text-gray-400 text-sm animate-pulse">🗺️ 生成思维导图...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-10">
          <div className="text-center text-red-500 text-sm px-4">
            <p>思维导图加载失败</p>
            <p className="text-xs mt-1 text-red-400">{error}</p>
            <button
              onClick={() => { setError(''); setLoading(true) }}
              className="mt-2 text-xs text-blue-500 underline"
            >重试</button>
          </div>
        </div>
      )}
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  )
}
