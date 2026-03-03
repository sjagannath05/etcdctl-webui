interface Props {
  keyPath: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export default function DeleteDialog({ keyPath, onConfirm, onCancel, loading }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Key</h3>
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete:
        </p>
        <code className="block bg-gray-100 text-red-700 text-sm font-mono px-3 py-2 rounded mb-6 break-all">
          {keyPath}
        </code>
        <p className="text-sm text-gray-500 mb-6">This action cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
