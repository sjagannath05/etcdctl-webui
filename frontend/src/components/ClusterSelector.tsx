import type { ClusterInfo } from '../types'

const AUTH_COLORS: Record<ClusterInfo['authType'], string> = {
  mtls:     'text-green-400',
  tls:      'text-blue-400',
  password: 'text-yellow-400',
  none:     'text-red-400',
}

interface Props {
  clusters: ClusterInfo[]
  active: string
  onChange: (name: string) => void
}

export default function ClusterSelector({ clusters, active, onChange }: Props) {
  if (clusters.length === 0) {
    return (
      <span className="text-slate-400 text-sm italic">No clusters</span>
    )
  }

  const current = clusters.find((c) => c.name === active)

  return (
    <div className="relative flex items-center gap-2">
      <select
        value={active}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-slate-700 text-white text-sm font-mono px-3 py-1 pr-7 rounded-md border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        {clusters.map((cl) => (
          <option key={cl.name} value={cl.name}>
            {cl.name}
          </option>
        ))}
      </select>
      {/* dropdown chevron */}
      <span className="pointer-events-none absolute right-2 text-slate-400 text-xs">▾</span>

      {current && (
        <span className={`text-xs font-medium ${AUTH_COLORS[current.authType] ?? 'text-slate-400'}`}>
          {current.authType}
        </span>
      )}
    </div>
  )
}
