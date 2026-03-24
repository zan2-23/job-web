import { useEffect, useRef, useState } from 'react'

interface Node {
  text: string
  children: Node[]
  level: number
}

function parseMarkdownToTree(md: string): Node {
  const lines = md.split('\n').filter(l => l.trim())
  const root: Node = { text: '复盘报告', children: [], level: 0 }
  const stack: Node[] = [root]

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    const bullet = line.match(/^[-*] (.+)/)

    let node: Node | null = null
    let level = 0

    if (h1) { node = { text: h1[1], children: [], level: 1 }; level = 1 }
    else if (h2) { node = { text: h2[1], children: [], level: 2 }; level = 2 }
    else if (h3) { node = { text: h3[1], children: [], level: 3 }; level = 3 }
    else if (bullet) { node = { text: bullet[1].slice(0, 40), children: [], level: 4 }; level = 4 }

    if (node) {
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop()
      stack[stack.length - 1].children.push(node)
      stack.push(node)
    }
  }
  return root
}

interface DrawNode extends Node {
  x: number
  y: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const NODE_H = 28
const NODE_PAD = 16
const V_GAP = 10
const H_GAP = 60

function measureWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6 + NODE_PAD * 2
}

function layoutTree(node: Node, depth: number): { nodes: DrawNode[]; height: number; width: number } {
  const fontSize = depth === 0 ? 14 : depth === 1 ? 13 : depth === 2 ? 12 : 11
  const nodeW = Math.min(measureWidth(node.text, fontSize), 200)

  if (node.children.length === 0) {
    return {
      nodes: [{ ...node, x: 0, y: 0 }],
      height: NODE_H,
      width: nodeW,
    }
  }

  const childLayouts = node.children.map(c => layoutTree(c, depth + 1))
  const totalH = childLayouts.reduce((s, l) => s + l.height, 0) + V_GAP * (childLayouts.length - 1)
  const maxChildW = Math.max(...childLayouts.map(l => l.width))

  const nodes: DrawNode[] = [{ ...node, x: 0, y: totalH / 2 - NODE_H / 2 }]
  let curY = 0
  for (const layout of childLayouts) {
    layout.nodes.forEach(n => {
      nodes.push({ ...n, x: n.x + nodeW + H_GAP, y: n.y + curY })
    })
    curY += layout.height + V_GAP
  }

  return { nodes, height: Math.max(NODE_H, totalH), width: nodeW + H_GAP + maxChildW }
}

export default function MindMap({ content }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 40, y: 40 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tree = parseMarkdownToTree(content)
    const { nodes } = layoutTree(tree, 0)

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.scale(dpr, dpr)

    const W = canvas.offsetWidth
    const H = canvas.offsetHeight

    ctx.clearRect(0, 0, W, H)
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)

    // 连线
    for (const node of nodes) {
      for (const child of node.children) {
        const cn = nodes.find(n => n === child)
        if (!cn) continue
        const color = COLORS[node.level % COLORS.length]
        ctx.beginPath()
        ctx.strokeStyle = color + '60'
        ctx.lineWidth = 1.5
        const startX = node.x + Math.min(measureWidth(node.text, 13), 200)
        const startY = node.y + NODE_H / 2
        const endX = cn.x
        const endY = cn.y + NODE_H / 2
        ctx.moveTo(startX, startY)
        ctx.bezierCurveTo(startX + H_GAP / 2, startY, endX - H_GAP / 2, endY, endX, endY)
        ctx.stroke()
      }
    }

    // 节点
    for (const node of nodes) {
      const fontSize = node.level === 0 ? 14 : node.level === 1 ? 13 : node.level === 2 ? 12 : 11
      const nodeW = Math.min(measureWidth(node.text, fontSize), 200)
      const color = COLORS[node.level % COLORS.length]

      ctx.fillStyle = node.level === 0 ? color : color + '18'
      ctx.strokeStyle = color
      ctx.lineWidth = node.level === 0 ? 0 : 1
      roundRect(ctx, node.x, node.y, nodeW, NODE_H, 6)
      ctx.fill()
      if (node.level > 0) ctx.stroke()

      ctx.fillStyle = node.level === 0 ? '#fff' : '#1f2937'
      ctx.font = `${node.level <= 1 ? 'bold ' : ''}${fontSize}px sans-serif`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'

      const maxW = nodeW - NODE_PAD * 2
      let text = node.text
      if (ctx.measureText(text).width > maxW) {
        while (ctx.measureText(text + '…').width > maxW && text.length > 0) text = text.slice(0, -1)
        text += '…'
      }
      ctx.fillText(text, node.x + NODE_PAD, node.y + NODE_H / 2)
    }

    ctx.restore()
  }, [content, scale, offset])

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  return (
    <div className="relative w-full h-96 border border-gray-200 rounded-lg overflow-hidden bg-white select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={e => { dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }}
        onMouseMove={e => {
          if (!dragging.current) return
          setOffset(o => ({ x: o.x + e.clientX - lastPos.current.x, y: o.y + e.clientY - lastPos.current.y }))
          lastPos.current = { x: e.clientX, y: e.clientY }
        }}
        onMouseUp={() => { dragging.current = false }}
        onMouseLeave={() => { dragging.current = false }}
        onWheel={e => setScale(s => Math.max(0.3, Math.min(2, s - e.deltaY * 0.001)))}
      />
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="w-7 h-7 bg-white border border-gray-200 rounded text-gray-600 text-sm hover:bg-gray-50">+</button>
        <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} className="w-7 h-7 bg-white border border-gray-200 rounded text-gray-600 text-sm hover:bg-gray-50">−</button>
        <button onClick={() => { setScale(1); setOffset({ x: 40, y: 40 }) }} className="px-2 h-7 bg-white border border-gray-200 rounded text-gray-500 text-xs hover:bg-gray-50">重置</button>
      </div>
      <div className="absolute top-2 left-2 text-xs text-gray-400">拖拽移动 · 滚轮缩放</div>
    </div>
  )
}

interface Props {
  content: string
}
