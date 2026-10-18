import { MetadataRoute } from 'next'
import { readFileSync } from 'fs'
import path from 'path'

const BASE = 'https://www.reant.kr'

function macroIds(): string[] {
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'macro', 'catalog.json')
    const cat = JSON.parse(readFileSync(p, 'utf-8')) as { indicators: { id: string; status: string }[] }
    return cat.indicators.filter(i => i.status !== 'pending').map(i => i.id)
  } catch {
    return []
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const pages: { path: string; freq: 'daily' | 'weekly'; priority: number }[] = [
    { path: '', freq: 'daily', priority: 1 },
    { path: '/explore', freq: 'weekly', priority: 0.8 },
    { path: '/macro', freq: 'daily', priority: 0.9 },
    { path: '/macro/workspace', freq: 'weekly', priority: 0.7 },
    { path: '/ants', freq: 'daily', priority: 0.9 },
    { path: '/watchlist', freq: 'daily', priority: 0.9 },
    { path: '/sectors', freq: 'daily', priority: 0.8 },
    { path: '/flow', freq: 'daily', priority: 0.7 },
  ]
  return [
    ...pages.map(p => ({ url: BASE + p.path, lastModified: now, changeFrequency: p.freq, priority: p.priority })),
    ...macroIds().map(id => ({ url: `${BASE}/macro/${id}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ]
}
