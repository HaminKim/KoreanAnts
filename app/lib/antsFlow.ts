// app/lib/antsFlow.ts

export type AntSignal = '매수 쏠림' | '매도 집중' | null;

export type FlowRowLike = {
  date: string;
  net: number;
};

export type AntSignalOptions = {
  ratioThreshold?: number;   // 쏠림/집중 판단 기준 (기본 0.7)
  minAbsSumUSD?: number;     // 너무 작은 노이즈 방지 (기본 1,000,000달러)
};

export function getAntSignal(
  rows: FlowRowLike[],
  n: number,
  opt: AntSignalOptions = {}
): AntSignal {
  const ratioThreshold = opt.ratioThreshold ?? 0.7;
  const minAbsSumUSD = opt.minAbsSumUSD ?? 1_000_000;

  if (!rows?.length || !Number.isFinite(n) || n <= 0) return null;

  // rows가 오래된→최신 순으로 정렬되어 있다는 가정
  const recent = rows.slice(-n);
  if (recent.length < Math.min(3, n)) return null;

  let buyDays = 0;
  let sellDays = 0;
  let sumNet = 0;

  for (const r of recent) {
    const v = Number(r.net ?? 0);
    sumNet += v;
    if (v > 0) buyDays += 1;
    else if (v < 0) sellDays += 1;
  }

  const ratioBuy = buyDays / recent.length;
  const ratioSell = sellDays / recent.length;

  // 노이즈 방지: 누적 규모가 너무 작으면 신호 안 냄
  if (Math.abs(sumNet) < minAbsSumUSD) return null;

  // ✅ 매수 쏠림 / 매도 집중
  if (ratioBuy >= ratioThreshold && sumNet > 0) return '매수 쏠림';
  if (ratioSell >= ratioThreshold && sumNet < 0) return '매도 집중';

  return null;
}

/** 최종 문구 생성 (신호 없으면 빈 문자열) */
export function buildAntSummary(n: number, signal: AntSignal) {
  if (!signal) return '';
  return `최근 ${n}거래일 기준 서학개미 ${signal}`;
}

/**
 * ✅ 달러 금액을 "만/억" 기준으로 표시 (만 단위 반올림)
 * - 10,000달러 미만: 9,532 달러
 * - 10,000달러 이상: 5,628만 달러
 * - 1억(=10,000만) 이상: 1억 2,196만 달러
 */
export function formatUSD_KR(amount?: number) {
  if (amount == null || Number.isNaN(amount)) return '-';

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  if (abs < 10_000) {
    return `${sign}${Math.round(abs).toLocaleString('ko-KR')} 달러`;
  }

  const manTotal = Math.round(abs / 10_000);
  const eok = Math.floor(manTotal / 10_000);
  const man = manTotal % 10_000;

  if (eok > 0) {
    if (man === 0) return `${sign}${eok}억 달러`;
    return `${sign}${eok}억 ${man.toLocaleString('ko-KR')}만 달러`;
  }

  return `${sign}${manTotal.toLocaleString('ko-KR')}만 달러`;
}
