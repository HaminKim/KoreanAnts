import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'watchlist_kr.json')
    const data = readFileSync(filePath, 'utf-8')
    return new NextResponse(data, {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'watchlist_kr.json not found' }, { status: 404 })
  }
}
