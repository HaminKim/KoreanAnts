// app/api/chart/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=10y&interval=1d`,
      { cache: 'no-store' }
    );

    const data = await response.json();

    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      throw new Error('No data found');
    }

    const result = data.chart.result[0];
    const quotes = result.indicators.quote[0];
    const timestamps = result.timestamp;

    // 차트 라이브러리가 좋아하는 형태로 가공
    const formattedData = timestamps.map((time: number, index: number) => ({
      time:   new Date(time * 1000).toISOString().split('T')[0],
      value:  quotes.close[index],
      volume: quotes.volume?.[index] ?? null,
    })).filter((item: any) => item.value !== null);

    return NextResponse.json({ data: formattedData });
  } catch (error) {
    console.error('Failed to fetch stock data:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}