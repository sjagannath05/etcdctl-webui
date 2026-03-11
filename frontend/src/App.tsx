import { useState, useEffect, useCallback, useRef } from 'react'
import { listClusters, listKeys, exportKeys, importKeys, type KeysPage } from './api/keys'
import type { ClusterInfo } from './types'
import KeyTree from './components/KeyTree'
import KeyEditor from './components/KeyEditor'
import NewKeyForm from './components/NewKeyForm'
import ClusterSelector from './components/ClusterSelector'

export default function App() {
  const [clusters, setClusters] = useState<ClusterInfo[]>([])
  const [activeCluster, setActiveCluster] = useState('')
  const [keys, setKeys] = useState<string[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [keysError, setKeysError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showNewKey, setShowNewKey] = useState(false)

  // Import/export state
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState('')
  const [exportLoading, setExportLoading] = useState(false)

  // Load cluster list once on mount
  useEffect(() => {
    listClusters()
      .then((list) => {
        setClusters(list)
        if (list.length > 0) setActiveCluster(list[0].name)
      })
      .catch(() => setKeysError('Failed to load cluster list'))
  }, [])

  const loadKeys = useCallback(async (cluster = activeCluster, cursor = '', append = false) => {
    if (!cluster) return
    setKeysLoading(true)
    setKeysError('')
    try {
      const page: KeysPage = await listKeys(cluster, '', cursor)
      setKeys(prev => append ? [...prev, ...page.keys] : page.keys)
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : 'Failed to load keys')
    } finally {
      setKeysLoading(false)
    }
  }, [activeCluster])

  const loadMore = useCallback(() => {
    if (hasMore && nextCursor && !keysLoading) {
      loadKeys(activeCluster, nextCursor, true)
    }
  }, [hasMore, nextCursor, keysLoading, activeCluster, loadKeys])

  // Reload keys whenever the active cluster changes
  useEffect(() => {
    if (activeCluster) {
      setSelectedKey(null)
      loadKeys(activeCluster)
    }
  }, [activeCluster]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClusterChange(name: string) {
    setActiveCluster(name)
  }

  function handleDeleted() {
    setSelectedKey(null)
    loadKeys()
  }

  function handleNewKeyCreated(key: string) {
    setShowNewKey(false)
    loadKeys().then(() => setSelectedKey(key))
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExportLoading(true)
    try {
      const data = await exportKeys(activeCluster)
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeCluster}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so same file can be re-selected

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      // Accept both the full export format { keys: [...] } and a bare array
      const kvList: { key: string; value: string }[] = Array.isArray(parsed)
        ? parsed
        : parsed.keys ?? []

      setImportStatus('Importing...')
      const result = await importKeys(activeCluster, kvList)
      setImportStatus(
        result.errors.length === 0
          ? `✓ Imported ${result.imported} keys`
          : `Imported ${result.imported}, ${result.errors.length} error(s)`,
      )
      loadKeys()
      setTimeout(() => setImportStatus(''), 4000)
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : 'Import failed')
      setTimeout(() => setImportStatus(''), 5000)
    }
  }

  const activeClusterInfo = clusters.find((c) => c.name === activeCluster)
  const isReadOnly = activeClusterInfo?.readonly ?? false

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-slate-800 text-white px-5 py-3 flex items-center gap-3 shadow-lg flex-shrink-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg">🗄️</span>
          <h1 className="text-base font-bold tracking-tight">etcd Web UI</h1>
        </div>

        <ClusterSelector
          clusters={clusters}
          active={activeCluster}
          onChange={handleClusterChange}
        />

        <div className="flex-1" />

        {/* Import status toast */}
        {importStatus && (
          <span className="text-xs text-slate-300 bg-slate-700 px-2 py-1 rounded">
            {importStatus}
          </span>
        )}

        {!isReadOnly && (
          <button
            onClick={() => setShowNewKey(true)}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
          >
            + New Key
          </button>
        )}

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={exportLoading || !activeCluster}
          title="Export all keys to JSON"
          className="px-3 py-1.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors disabled:opacity-50"
        >
          {exportLoading ? '…' : '↓ Export'}
        </button>

        {/* Import */}
        {!isReadOnly && (
          <>
            <button
              onClick={() => importInputRef.current?.click()}
              title="Import keys from JSON file"
              className="px-3 py-1.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors"
            >
              ↑ Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </>
        )}

        <button
          onClick={() => loadKeys()}
          disabled={keysLoading}
          title="Refresh keys"
          className="px-3 py-1.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors disabled:opacity-50"
        >
          ↻
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-hidden">
          {keysError ? (
            <div className="p-4 text-sm text-red-600 bg-red-50 m-3 rounded">{keysError}</div>
          ) : (
            <KeyTree
              keys={keys}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              loading={keysLoading}
              hasMore={hasMore}
              onLoadMore={loadMore}
            />
          )}
        </div>

        {/* Main panel */}
        <div className="flex-1 overflow-auto p-6">
          <KeyEditor
            cluster={activeCluster}
            keyPath={selectedKey}
            onDeleted={handleDeleted}
            onSaved={() => loadKeys()}
            readOnly={isReadOnly}
          />
        </div>
      </div>

      {/* Status bar */}
      <footer className="bg-slate-700 text-slate-300 text-xs px-4 py-1.5 flex items-center gap-3 flex-shrink-0">
        <span className="text-slate-400">Endpoints:</span>
        {activeClusterInfo ? (
          activeClusterInfo.endpoints.map((ep) => (
            <span key={ep} className="font-mono bg-slate-800 px-1.5 py-0.5 rounded">
              {ep}
            </span>
          ))
        ) : (
          <span className="text-slate-500">—</span>
        )}
        {isReadOnly && (
          <span className="ml-auto text-amber-400 font-medium">🔒 Read-Only</span>
        )}
        <span className={isReadOnly ? "text-slate-500" : "ml-auto text-slate-500"}>{keys.length}{hasMore ? '+' : ''} keys</span>
      </footer>

      {/* New key modal */}
      {showNewKey && (
        <NewKeyForm
          cluster={activeCluster}
          onCreated={handleNewKeyCreated}
          onClose={() => setShowNewKey(false)}
        />
      )}
    </div>
  )
}
