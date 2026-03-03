import { useState, useMemo } from 'react'
import { buildTree, type KeyNode } from '../types'

interface Props {
  keys: string[]
  selectedKey: string | null
  onSelect: (key: string) => void
  loading: boolean
}

export default function KeyTree({ keys, selectedKey, onSelect, loading }: Props) {
  const [filter, setFilter] = useState('')

  const displayKeys = useMemo(() => {
    if (!filter.trim()) return keys
    const q = filter.toLowerCase()
    return keys.filter((k) => k.toLowerCase().includes(q))
  }, [keys, filter])

  const tree = useMemo(() => buildTree(displayKeys), [displayKeys])

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        <input
          type="text"
          placeholder="Filter keys..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
            Loading keys...
          </div>
        ) : tree.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
            {filter ? 'No matching keys' : 'No keys found'}
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.fullPath + node.name}
              node={node}
              depth={0}
              selectedKey={selectedKey}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
        {keys.length} key{keys.length !== 1 ? 's' : ''}
        {filter && ` (${displayKeys.length} matching)`}
      </div>
    </div>
  )
}

interface NodeProps {
  node: KeyNode
  depth: number
  selectedKey: string | null
  onSelect: (key: string) => void
}

function TreeNode({ node, depth, selectedKey, onSelect }: NodeProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const isSelected = node.isLeaf && node.fullPath === selectedKey

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none group ${
          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v)
          if (node.isLeaf) onSelect(node.fullPath)
        }}
      >
        {/* Expand toggle */}
        <span className="w-4 flex-shrink-0 text-gray-400 text-xs">
          {hasChildren ? (expanded ? '▾' : '▸') : ''}
        </span>

        {/* Icon */}
        <span className="flex-shrink-0 text-sm">
          {hasChildren && !node.isLeaf ? (
            <span className="text-yellow-500">{expanded ? '📂' : '📁'}</span>
          ) : hasChildren && node.isLeaf ? (
            <span className="text-yellow-500">📄</span>
          ) : (
            <span className="text-gray-400">📄</span>
          )}
        </span>

        {/* Name */}
        <span
          className={`text-sm font-mono truncate ${
            isSelected
              ? 'text-blue-700 font-medium'
              : node.isLeaf
              ? 'text-gray-800'
              : 'text-gray-600'
          }`}
          title={node.fullPath}
        >
          {node.name}
        </span>
      </div>

      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <TreeNode
            key={child.fullPath + child.name}
            node={child}
            depth={depth + 1}
            selectedKey={selectedKey}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}
