import { useState, useEffect } from 'react'
import { getKey, putKey, deleteKey } from '../api/keys'
import type { KeyValue } from '../types'
import DeleteDialog from './DeleteDialog'

interface Props {
  cluster: string
  keyPath: string | null
  onDeleted: () => void
  onSaved: () => void
}

export default function KeyEditor({ cluster, keyPath, onDeleted, onSaved }: Props) {
  const [kv, setKv] = useState<KeyValue | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [jsonFormatted, setJsonFormatted] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!keyPath) {
      setKv(null)
      setEditing(false)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    setEditing(false)
    setJsonFormatted(false)
    getKey(cluster, keyPath)
      .then((data) => {
        setKv(data)
      })
      .catch((err) => {
        setError(err.message)
        setKv(null)
      })
      .finally(() => setLoading(false))
  }, [keyPath])

  if (!keyPath) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Select a key from the tree to view its value
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>
      </div>
    )
  }

  if (!kv) return null

  function tryFormatJson(raw: string): string {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }

  const displayValue = jsonFormatted ? tryFormatJson(kv.value) : kv.value

  async function handleSave() {
    if (!keyPath) return
    setSaving(true)
    setSaveError('')
    try {
      await putKey(cluster, keyPath, editValue)
      setKv((prev) => (prev ? { ...prev, value: editValue } : null))
      setEditing(false)
      onSaved()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit() {
    setEditValue(kv?.value ?? '')
    setEditing(true)
    setSaveError('')
  }

  function handleCancel() {
    setEditing(false)
    setSaveError('')
  }

  async function handleDelete() {
    if (!keyPath) return
    setDeleting(true)
    try {
      await deleteKey(cluster, keyPath)
      setShowDelete(false)
      onDeleted()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed')
      setShowDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Key path header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Key</p>
          <p className="font-mono text-sm text-gray-800 break-all">{kv.key}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!editing && (
            <button
              onClick={handleEdit}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => setShowDelete(true)}
            className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Value section */}
      <div className="flex items-center gap-3 mb-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Value</p>
        {!editing && (
          <button
            onClick={() => setJsonFormatted((v) => !v)}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            {jsonFormatted ? 'Raw' : 'Format JSON'}
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {editing ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1 w-full font-mono text-sm p-3 border-2 border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none bg-white"
          />
        ) : (
          <pre className="flex-1 font-mono text-sm p-3 bg-gray-50 border border-gray-200 rounded-lg overflow-auto whitespace-pre-wrap break-all">
            {displayValue || <span className="text-gray-400 italic">(empty)</span>}
          </pre>
        )}
      </div>

      {/* Edit action buttons */}
      {editing && (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {saveError && (
            <span className="text-sm text-red-600">{saveError}</span>
          )}
        </div>
      )}

      {/* Metadata */}
      {!editing && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6 text-xs text-gray-400">
          <span>Version: {kv.version}</span>
          <span>Created rev: {kv.createRevision}</span>
          <span>Modified rev: {kv.modRevision}</span>
        </div>
      )}

      {/* Delete dialog */}
      {showDelete && (
        <DeleteDialog
          keyPath={kv.key}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          loading={deleting}
        />
      )}
    </div>
  )
}
