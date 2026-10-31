import { ExpiryStatus, Ingredient } from '../types';

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthString(): string {
  return getTodayDateString().slice(0, 7);
}

export function getPreviousMonthString(monthStr: string): string {
  const [yStr, mStr] = monthStr.split('-');
  let year = Number(yStr);
  let month = Number(mStr) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function addDaysToToday(offsetDays: number): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() + offsetDays);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatKoreanFullDate(date = new Date()): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

export function formatKoreanShortDate(dateStr?: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return '날짜 미입력';
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

export function formatMonthLabel(monthStr: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return monthStr;
  const [y, m] = monthStr.split('-').map(Number);
  return `${y}년 ${m}월`;
}

export function formatKRW(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${safe.toLocaleString('ko-KR')}원`;
}

export interface ExpiryEvaluation {
  status: ExpiryStatus;
  daysRemaining: number | null;
  statusLabel: string;
  dDayText: string;
  isExpired: boolean;
}

export function evaluateExpiry(expiryDate?: string): ExpiryEvaluation {
  if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    return {
      status: 'check_needed',
      daysRemaining: null,
      statusLabel: '날짜 확인 필요',
      dDayText: '기한 미입력',
      isExpired: false,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [y, m, d] = expiryDate.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);

  if (Number.isNaN(target.getTime())) {
    return {
      status: 'check_needed',
      daysRemaining: null,
      statusLabel: '날짜 확인 필요',
      dDayText: '확인 필요',
      isExpired: false,
    };
  }

  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      status: 'check_needed',
      daysRemaining: diffDays,
      statusLabel: '날짜 확인 필요',
      dDayText: `${Math.abs(diffDays)}일 경과`,
      isExpired: true,
    };
  }

  if (diffDays <= 3) {
    return {
      status: 'urgent',
      daysRemaining: diffDays,
      statusLabel: '임박',
      dDayText: diffDays === 0 ? '오늘 마감 (D-Day)' : `D-${diffDays}`,
      isExpired: false,
    };
  }

  return {
    status: 'safe',
    daysRemaining: diffDays,
    statusLabel: '여유',
    dDayText: `D-${diffDays}`,
    isExpired: false,
  };
}

export function sortIngredientsByPriority(items: Ingredient[]): Ingredient[] {
  return [...items].sort((a, b) => {
    const evalA = evaluateExpiry(a.expiryDate);
    const evalB = evaluateExpiry(b.expiryDate);

    // Priority order: urgent (0..3) -> check_needed (expired or missing) -> safe (4+)
    const rank = (e: ExpiryEvaluation): number => {
      if (e.status === 'urgent') return 0;
      if (e.status === 'check_needed') return 1;
      return 2;
    };

    const rankDiff = rank(evalA) - rank(evalB);
    if (rankDiff !== 0) return rankDiff;

    const daysA = evalA.daysRemaining ?? 9999;
    const daysB = evalB.daysRemaining ?? 9999;
    if (daysA !== daysB) return daysA - daysB;

    return a.name.localeCompare(b.name, 'ko-KR');
  });
}
