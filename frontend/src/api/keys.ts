import type { KeyValue, ClusterInfo, ExportData } from '../types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const body = await res.text()
    let message = body
    try {
      message = JSON.parse(body).error ?? body
    } catch {
      // use raw body
    }
    throw new Error(message || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function listClusters(): Promise<ClusterInfo[]> {
  const data = await request<{ clusters: ClusterInfo[] }>('/api/clusters')
  return data.clusters ?? []
}

export async function listKeys(cluster: string, prefix = ''): Promise<string[]> {
  const params = new URLSearchParams({ cluster })
  if (prefix) params.set('prefix', prefix)
  const data = await request<{ keys: string[] }>(`/api/keys?${params}`)
  return data.keys ?? []
}

export async function getKey(cluster: string, key: string): Promise<KeyValue> {
  const params = new URLSearchParams({ cluster, key })
  return request<KeyValue>(`/api/key?${params}`)
}

export async function putKey(cluster: string, key: string, value: string): Promise<void> {
  const params = new URLSearchParams({ cluster, key })
  await request(`/api/key?${params}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
}

export async function deleteKey(cluster: string, key: string): Promise<void> {
  const params = new URLSearchParams({ cluster, key })
  await request(`/api/key?${params}`, { method: 'DELETE' })
}

export async function exportKeys(cluster: string, prefix = ''): Promise<ExportData> {
  const params = new URLSearchParams({ cluster })
  if (prefix) params.set('prefix', prefix)
  return request<ExportData>(`/api/export?${params}`)
}

export async function importKeys(
  cluster: string,
  keys: { key: string; value: string }[],
): Promise<{ imported: number; errors: string[] }> {
  const params = new URLSearchParams({ cluster })
  return request(`/api/import?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
}
