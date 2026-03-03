export interface KeyNode {
  name: string
  fullPath: string
  isLeaf: boolean
  children: KeyNode[]
}

export interface KeyValue {
  key: string
  value: string
  version: number
  createRevision: number
  modRevision: number
}

export interface ClusterInfo {
  name: string
  endpoints: string[]
  authType: 'mtls' | 'tls' | 'password' | 'none'
}

export interface ExportData {
  cluster: string
  prefix: string
  count: number
  exportedAt: string
  keys: { key: string; value: string }[]
}

export function buildTree(keys: string[]): KeyNode[] {
  interface TrieNode {
    children: Map<string, TrieNode>
    isLeaf: boolean
    fullPath: string
    name: string
  }

  const root = new Map<string, TrieNode>()

  for (const key of keys) {
    const parts = key.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const pathParts = parts.slice(0, i + 1)
      const fullPath = key.startsWith('/') ? '/' + pathParts.join('/') : pathParts.join('/')

      if (!current.has(part)) {
        current.set(part, {
          children: new Map(),
          isLeaf: isLast,
          fullPath: isLast ? key : fullPath,
          name: part,
        })
      } else if (isLast) {
        const node = current.get(part)!
        node.isLeaf = true
        node.fullPath = key
      }
      current = current.get(part)!.children
    }
  }

  function trieToNodes(map: Map<string, TrieNode>): KeyNode[] {
    return Array.from(map.values())
      .sort((a, b) => {
        const aIsDir = a.children.size > 0 && !a.isLeaf
        const bIsDir = b.children.size > 0 && !b.isLeaf
        if (aIsDir && !bIsDir) return -1
        if (!aIsDir && bIsDir) return 1
        return a.name.localeCompare(b.name)
      })
      .map((node) => ({
        name: node.name,
        fullPath: node.fullPath,
        isLeaf: node.isLeaf,
        children: trieToNodes(node.children),
      }))
  }

  return trieToNodes(root)
}
