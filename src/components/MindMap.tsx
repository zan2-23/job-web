import { useEffect, useRef } from 'react'

interface Props {
  content: string
}

declare global {
  interface Window {
    markmap: any
  }
}

export default function MindMap({ content }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const mmRef = useRef<any>(null)
  const scriptLoaded = useRef(false)

  const initMarkmap = () => {
    if (!svgRef.current || !window.markmap) return
    const { Transformer, Markmap } = window.markmap
    const transformer = new Transformer()
    const { root } = transformer.transform(content)
    if (!mmRef.current) {
      mmRef.current = Markmap.create(svgRef.current)
    }
    mmRef.current.setData(root)
    mmRef.current.fit()
  }

  useEffect(() => {
    if (window.markmap) {
      initMarkmap()
      return
    }
    if (scriptLoaded.current) return
    scriptLoaded.current = true

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/markmap-autoloader@0.16/dist/browser/index.js'
    script.onload = () => {
      // markmap-autoloader exposes window.markmap
      setTimeout(initMarkmap, 500)
    }
    document.head.appendChild(script)
  }, [content])

  return (
    <div className="w-full h-96 border border-gray-200 rounded-lg overflow-hidden bg-white">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  )
}
