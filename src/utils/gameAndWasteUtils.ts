import {
  ExpenseRecord,
  FridgeMission,
  FridgeRankId,
  Ingredient,
  IngredientCategory,
  IngredientLifecycleEvent,
  MissionGameState,
  StorageLocation,
  WasteCauseTag,
  WASTE_CAUSE_TAGS,
  WasteRecord,
} from '../types';
import { evaluateExpiry, getCurrentMonthString, getPreviousMonthString, getTodayDateString } from './dateUtils';

export interface FridgeRankDefinition {
  id: FridgeRankId;
  level: number;
  title: string; // 냉파 초보, 냉파 견습생, 냉파 고수, 냉파 마스터
  minPoints: number;
  nextPoints: number | null;
  bonusMultiplier: number; // 1.0, 1.1, 1.15, 1.25
  allClearBonusPoints: number; // 100, 110, 115, 125
  tagline: string;
  unlockedPerks: Array<{
    id: string;
    name: string;
    description: string;
    actionType: 'missions' | 'storage_guide' | 'onepan_recipe' | 'omakase_recipe';
  }>;
}

export const FRIDGE_RANKS: FridgeRankDefinition[] = [
  {
    id: 'novice',
    level: 1,
    title: '냉파 초보',
    minPoints: 0,
    nextPoints: 200,
    bonusMultiplier: 1.0,
    allClearBonusPoints: 100,
    tagline: '내 냉장고 속 식재료 현황을 파악하며 알뜰 소비 습관을 시작하는 단계',
    unlockedPerks: [
      {
        id: 'perk-novice-board',
        name: '상황 맞춤형 3종 냉파 미션 보드',
        description: '보유 재료와 임박 일수에 맞춘 일일 미션 세트를 수행하고 올클리어 점수(+100점)를 획득합니다.',
        actionType: 'missions',
      },
    ],
  },
  {
    id: 'apprentice',
    level: 2,
    title: '냉파 견습생',
    minPoints: 200,
    nextPoints: 500,
    bonusMultiplier: 1.1,
    allClearBonusPoints: 110,
    tagline: '임박 식재료를 제때 구출하고 소분·보관 요령을 익히는 실속 요리 단계',
    unlockedPerks: [
      {
        id: 'perk-apprentice-guide',
        name: '1인 가구 식재료 소분·냉동 보관 치트시트 해금',
        description: '대파·두부·우유·버섯·육류 등 자주 버리는 8대 식재료의 1인분 소분 및 수명 3배 연장 비법을 열람합니다.',
        actionType: 'storage_guide',
      },
      {
        id: 'perk-apprentice-bonus',
        name: '올클리어 완수 점수 +10% 보너스',
        description: '3개 미션 모두 완료 시 기본 100점 대신 +110점을 즉시 지급받습니다.',
        actionType: 'missions',
      },
    ],
  },
  {
    id: 'expert',
    level: 3,
    title: '냉파 고수',
    minPoints: 500,
    nextPoints: 900,
    bonusMultiplier: 1.15,
    allClearBonusPoints: 115,
    tagline: '자투리 식재료까지 남김없이 조합해 외식비를 크게 아끼는 숙련 셰프 단계',
    unlockedPerks: [
      {
        id: 'perk-expert-onepan',
        name: 'AI 레시피 [고수 전용 원팬·설거지 최소화 시크릿 모드] 해금',
        description: 'AI 레시피 추천 시 프라이팬·냄비 단 1개로 완성하는 원팬 조리 동선과 자투리 양념 활용 비법이 추가됩니다.',
        actionType: 'onepan_recipe',
      },
      {
        id: 'perk-expert-bonus',
        name: '올클리어 완수 점수 +15% 보너스',
        description: '라운드 올클리어 보상 점수가 +115점으로 상승합니다.',
        actionType: 'missions',
      },
    ],
  },
  {
    id: 'master',
    level: 4,
    title: '냉파 마스터',
    minPoints: 900,
    nextPoints: null,
    bonusMultiplier: 1.25,
    allClearBonusPoints: 125,
    tagline: '식재료 폐기 제로와 무지출 홈다이닝을 자유자재로 구현하는 최고 명예 등급',
    unlockedPerks: [
      {
        id: 'perk-master-omakase',
        name: 'AI 레시피 [마스터 전용 무지출 냉장고 오마카세 코스] 해금',
        description: '추가 장보기 없이 보유 식재료만으로 애피타이저·메인·국물/사이드 구성을 설계하는 마스터 전용 모드가 활성화됩니다.',
        actionType: 'omakase_recipe',
      },
      {
        id: 'perk-master-bonus',
        name: '올클리어 완수 점수 +25% 최고 보너스 & 마스터 명예 칭호',
        description: '라운드 올클리어 시 +125점 보너스와 함께 헤더·대시보드·리포트에 마스터 칭호가 표시됩니다.',
        actionType: 'missions',
      },
    ],
  },
];

export const PORTION_STORAGE_CHEATSHEET: Array<{
  item: string;
  category: IngredientCategory;
  usualShelfLife: string;
  extendedLife: string;
  method: string;
}> = [
  {
    item: '대파 (1단)',
    category: '채소',
    usualShelfLife: '냉장 5~7일',
    extendedLife: '냉동 최대 6주',
    method: '뿌리 제거 후 물기를 완전히 닦고 흰 대(국·볶음용)와 초록 잎(라면·고명용)을 분리해 어슷썰기 후 지퍼백에 납작하게 얼립니다.',
  },
  {
    item: '두부 (1모)',
    category: '가공식품',
    usualShelfLife: '개봉 후 2일',
    extendedLife: '냉장 5일 / 냉동 4주',
    method: '남은 반 모는 끓여서 식힌 깨끗한 수돗물(소금 한 꼬집)에 잠기게 담아 밀폐용기에 보관하고 이틀마다 물을 갈아줍니다. 얼리면 쫄깃한 포두부 식감이 됩니다.',
  },
  {
    item: '양파 (망 구매)',
    category: '채소',
    usualShelfLife: '실온 1~2주',
    extendedLife: '개별 래핑 냉장 4주',
    method: '껍질을 까고 물기 없이 랩으로 1개씩 단단히 감싸 채소칸에 넣으면 무르지 않고 한 달간 아삭함이 유지됩니다.',
  },
  {
    item: '애호박·버섯류',
    category: '채소',
    usualShelfLife: '냉장 4~5일',
    extendedLife: '냉동 4주',
    method: '반달썰기 또는 채썰기 후 키친타월로 수분을 제거해 1회 조리 분량(종이컵 1컵)씩 소분 냉동하고 해동 없이 바로 찌개·볶음에 넣습니다.',
  },
  {
    item: '우유 (900ml~1L)',
    category: '유제품',
    usualShelfLife: '개봉 후 3~5일',
    extendedLife: '요리 큐브 냉동 3주',
    method: '기한 내 다 마시기 어렵다면 얼음 트레이에 얼려 크림파스타, 카레, 프렌치토스트, 스크램블 에그 조리 시 2~3알씩 활용하세요.',
  },
  {
    item: '정육·다짐육',
    category: '육류',
    usualShelfLife: '냉장 2~3일',
    extendedLife: '냉동 4~6주',
    method: '구매 당일 100g~150g(1인분)씩 얇고 납작하게 펴서 랩으로 공기를 차단해 냉동하면 해동 시간이 5분 이내로 단축됩니다.',
  },
];

export function getRankByPoints(points: number): {
  currentRank: FridgeRankDefinition;
  nextRank: FridgeRankDefinition | null;
  progressPercent: number;
  pointsToNext: number;
} {
  const safePts = Math.max(0, Math.round(points));
  let current = FRIDGE_RANKS[0];
  for (const r of FRIDGE_RANKS) {
    if (safePts >= r.minPoints) {
      current = r;
    }
  }
  const idx = FRIDGE_RANKS.findIndex((r) => r.id === current.id);
  const next = idx < FRIDGE_RANKS.length - 1 ? FRIDGE_RANKS[idx + 1] : null;

  if (!next) {
    return {
      currentRank: current,
      nextRank: null,
      progressPercent: 100,
      pointsToNext: 0,
    };
  }

  const span = next.minPoints - current.minPoints;
  const gainedInTier = safePts - current.minPoints;
  const pct = Math.min(100, Math.max(0, Math.round((gainedInTier / span) * 100)));

  return {
    currentRank: current,
    nextRank: next,
    progressPercent: pct,
    pointsToNext: Math.max(0, next.minPoints - safePts),
  };
}

export function isPerkUnlocked(points: number, minRankId: FridgeRankId): boolean {
  const target = FRIDGE_RANKS.find((r) => r.id === minRankId);
  if (!target) return false;
  return points >= target.minPoints;
}

/**
 * Generates 3 personalized, situation-aware fridge missions based on the user's actual inventory & waste patterns
 */
export function buildPersonalizedMissionRound(
  ingredients: Ingredient[],
  wastes: WasteRecord[],
  roundNumber = 1
): FridgeMission[] {
  const stamp = Date.now();

  if (ingredients.length === 0) {
    return [
      {
        id: `msn-${stamp}-1`,
        kind: 'zero_waste_register',
        title: '냉장고 파먹기 첫걸음: 보유 식재료 2종 등록하기',
        description: '현재 냉장·냉동·실온에 보관 중인 식재료 2종 이상을 등록해 맞춤 관리를 시작하세요.',
        targetItemName: '',
        targetCategory: '',
        requiredCount: 2,
        currentCount: 0,
        points: 35,
        completed: false,
      },
      {
        id: `msn-${stamp}-2`,
        kind: 'expiry_audit',
        title: '소비기한 날짜까지 꼼꼼히 입력해 식재료 등록하기',
        description: '소비기한이 입력된 식재료를 1종 이상 추가해 자동 D-Day 알림을 활성화하세요.',
        targetItemName: '',
        targetCategory: '',
        requiredCount: 1,
        currentCount: 0,
        points: 35,
        completed: false,
      },
      {
        id: `msn-${stamp}-3`,
        kind: 'combo_cook',
        title: '냉장고 재료로 첫 집밥 조리 완료 기록하기',
        description: '식재료 등록 후 AI 추천 레시피 또는 보유 재료 요리를 1회 완료해 절약액을 기록하세요.',
        targetItemName: '',
        targetCategory: '',
        requiredCount: 1,
        currentCount: 0,
        points: 45,
        completed: false,
      },
    ];
  }

  // Sort ingredients by expiry urgency
  const evaluated = ingredients
    .map((ing) => ({ ing, ev: evaluateExpiry(ing.expiryDate) }))
    .sort((a, b) => {
      const da = a.ev.daysRemaining ?? 999;
      const db = b.ev.daysRemaining ?? 999;
      return da - db;
    });

  const urgentCandidate = evaluated.find(
    (x) => x.ev.status === 'urgent' && !x.ev.isExpired
  );
  const checkNeededCandidate = evaluated.find((x) => x.ev.status === 'check_needed');
  const firstItem = evaluated[0].ing;
  const secondItem = evaluated.length > 1 ? evaluated[1].ing : null;

  // Detect most wasted category if user has waste history
  const wasteCatCounts = new Map<IngredientCategory, number>();
  for (const w of wastes) {
    wasteCatCounts.set(w.category, (wasteCatCounts.get(w.category) || 0) + 1);
  }
  const topWasteCategory =
    Array.from(wasteCatCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const matchingWasteCatIng = topWasteCategory
    ? ingredients.find((i) => i.category === topWasteCategory)
    : null;

  const missions: FridgeMission[] = [];

  // Mission 1: Urgent Rescue or Priority Item Consumption
  if (urgentCandidate) {
    missions.push({
      id: `msn-${stamp}-r${roundNumber}-1`,
      kind: 'urgent_rescue',
      title: `긴급 구출! 임박 식재료 '${urgentCandidate.ing.name}' 알뜰 소진하기`,
      description: `소비기한(${urgentCandidate.ev.dDayText})이 다가온 '${urgentCandidate.ing.name}'을(를) 버리지 않고 요리에 활용해 소비 처리하세요.`,
      targetItemName: urgentCandidate.ing.name,
      targetCategory: urgentCandidate.ing.category,
      requiredCount: 1,
      currentCount: 0,
      points: 45,
      completed: false,
    });
  } else {
    missions.push({
      id: `msn-${stamp}-r${roundNumber}-1`,
      kind: 'urgent_rescue',
      title: `보유 식재료 '${firstItem.name}' 오늘 식단에 활용하기`,
      description: `냉장고 속 '${firstItem.name}'(${firstItem.quantity}${firstItem.unit})을(를) 사용해 신선할 때 소비 완료 체크하세요.`,
      targetItemName: firstItem.name,
      targetCategory: firstItem.category,
      requiredCount: 1,
      currentCount: 0,
      points: 40,
      completed: false,
    });
  }

  // Mission 2: Combo Fridge Cooking Mission
  if (secondItem && secondItem.name !== firstItem.name) {
    missions.push({
      id: `msn-${stamp}-r${roundNumber}-2`,
      kind: 'combo_cook',
      title: `무지출 콤보! '${firstItem.name} + ${secondItem.name}' 활용 한 끼 완성`,
      description: `추가 배달·외식 없이 냉장고 속 '${firstItem.name}' 또는 '${secondItem.name}'이(가) 들어간 요리를 완성하세요.`,
      targetItemName: secondItem.name,
      targetCategory: secondItem.category,
      requiredCount: 1,
      currentCount: 0,
      points: 50,
      completed: false,
    });
  } else {
    missions.push({
      id: `msn-${stamp}-r${roundNumber}-2`,
      kind: 'combo_cook',
      title: '배달 대신 집밥! 보유 재료로 1끼 직접 조리 완수하기',
      description: 'AI 추천 레시피 상세창의 조리 완료 기록 또는 미션 수행으로 외식비를 절약하세요.',
      targetItemName: firstItem.name,
      targetCategory: firstItem.category,
      requiredCount: 1,
      currentCount: 0,
      points: 45,
      completed: false,
    });
  }

  // Mission 3: Waste Habit Prevention or Expiry Audit Mission
  if (matchingWasteCatIng && topWasteCategory) {
    missions.push({
      id: `msn-${stamp}-r${roundNumber}-3`,
      kind: 'category_focus',
      title: `낭비 주의 카테고리 '${topWasteCategory}'(${matchingWasteCatIng.name}) 방어 미션`,
      description: `과거 폐기 이력이 있는 '${topWasteCategory}' 품목('${matchingWasteCatIng.name}')을 변질 전에 먼저 소진하세요.`,
      targetItemName: matchingWasteCatIng.name,
      targetCategory: topWasteCategory,
      requiredCount: 1,
      currentCount: 0,
      points: 40,
      completed: false,
    });
  } else if (checkNeededCandidate) {
    missions.push({
      id: `msn-${stamp}-r${roundNumber}-3`,
      kind: 'expiry_audit',
      title: `'${checkNeededCandidate.ing.name}' 보관 상태 및 소비기한 점검하기`,
      description: `날짜 확인이 필요한 '${checkNeededCandidate.ing.name}'의 상태를 확인하고 소비기한 수정 또는 정리를 완료하세요.`,
      targetItemName: checkNeededCandidate.ing.name,
      targetCategory: checkNeededCandidate.ing.category,
      requiredCount: 1,
      currentCount: 0,
      points: 35,
      completed: false,
    });
  } else {
    const thirdTarget = evaluated[Math.min(2, evaluated.length - 1)].ing;
    missions.push({
      id: `msn-${stamp}-r${roundNumber}-3`,
      kind: 'category_focus',
      title: `${thirdTarget.storage} 보관 중인 '${thirdTarget.name}' 알뜰 소비하기`,
      description: `${thirdTarget.storage} 칸에 보관 중인 '${thirdTarget.name}'을(를) 간식이나 반찬으로 1회 이상 소진하세요.`,
      targetItemName: thirdTarget.name,
      targetCategory: thirdTarget.category,
      requiredCount: 1,
      currentCount: 0,
      points: 35,
      completed: false,
    });
  }

  return missions;
}

export function getDefaultMissionGameState(
  ingredients: Ingredient[] = [],
  wastes: WasteRecord[] = []
): MissionGameState {
  return {
    totalPoints: 0,
    completedRounds: 0,
    completedMissionsCount: 0,
    roundNumber: 1,
    roundBonusClaimed: false,
    activeMissions: buildPersonalizedMissionRound(ingredients, wastes, 1),
    recentLogs: [],
  };
}

// ============================================================================
// Lifecycle Event Helpers & 30-Day Root-Cause Waste Analytics
// ============================================================================

export function calculateDaysBetween(startYmd: string, endYmd: string): number {
  const s = new Date(`${startYmd}T00:00:00`);
  const e = new Date(`${endYmd}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
}

export function inferCauseTagFromReason(reason: string): WasteCauseTag {
  const r = reason.trim();
  for (const tag of WASTE_CAUSE_TAGS) {
    if (r.includes(tag)) return tag;
  }
  if (r.includes('묶음') || r.includes('대용량') || r.includes('많이')) return '대용량·묶음 과다구매';
  if (r.includes('개봉') || r.includes('곰팡이') || r.includes('소분')) return '개봉 후 소분·밀폐 미흡';
  if (r.includes('실온') || r.includes('냉장') || r.includes('보관') || r.includes('시듦')) return '보관 방법 부적절';
  if (r.includes('충동') || r.includes('세일') || r.includes('특가')) return '계획 없는 충동구매';
  if (r.includes('경과') || r.includes('미확인') || r.includes('방치') || r.includes('잊')) {
    return '소비기한 미확인·방치';
  }
  return '소비기한 미확인·방치';
}

export interface WasteRootCauseAnalytics {
  trackingSpanDays: number;
  isOneMonthReady: boolean;
  daysUntilOneMonth: number;
  registeredCount: number;
  consumedCount: number;
  wastedCount: number;
  consumptionRatePct: number;
  wasteRatePct: number;
  totalWastedKRW: number;
  avgDaysHeldBeforeWaste: number;
  causeDistribution: Array<{
    causeTag: WasteCauseTag;
    count: number;
    amountKRW: number;
    sharePct: number;
  }>;
  vulnerableCategories: Array<{
    category: IngredientCategory;
    wastedCount: number;
    wastedKRW: number;
  }>;
  vulnerableStorages: Array<{
    storage: StorageLocation;
    wastedCount: number;
    wastedKRW: number;
  }>;
  repeatedWastedItems: string[];
  deterministicSolutions: Array<{
    causeTag: WasteCauseTag;
    title: string;
    solution: string;
  }>;
}

const CAUSE_SOLUTION_MAP: Record<
  WasteCauseTag,
  { title: string; solution: string }
> = {
  '대용량·묶음 과다구매': {
    title: '1인분 소포장 전환 및 구매 당일 즉시 냉동 소분',
    solution:
      '묶음 할인 채소(대파·양파·애호박)가 폐기로 이어지고 있습니다. 반모 두부·낱개 채소를 우선 선택하거나 구매 당일 1회 조리 분량씩 지퍼백에 소분 냉동하세요.',
  },
  '소비기한 미확인·방치': {
    title: '냉장고 앞줄 임박존(First-In First-Out) 배치',
    solution:
      '냉장실 안쪽에 가려져 소비기한을 넘기는 패턴입니다. D-3 이내 품목은 눈높이 앞줄 투명 용기에 모아두고 주 1회 냉파 미션으로 우선 소진하세요.',
  },
  '개봉 후 소분·밀폐 미흡': {
    title: '개봉 식재료 전용 밀폐·수분 차단 루틴 적용',
    solution:
      '두부·우유·쌈채소 등 개봉 후 공기와 접촉해 빠르게 변질되었습니다. 개봉 즉시 밀폐용기에 옮기고 개봉일을 메모해 3일 내 우선 조리하세요.',
  },
  '보관 방법 부적절': {
    title: '품목별 적정 온도(실온 vs 냉장 vs 냉동) 재분류',
    solution:
      '수분에 약한 채소나 저온 장해 품목의 보관 위치 점검이 필요합니다. 잎채소는 키친타월로 감싸 채소칸에, 오래 둘 식재료는 손질 후 냉동실로 이동하세요.',
  },
  '계획 없는 충동구매': {
    title: '레시피 기반 장보기 리스트 외 특가 품목 제한',
    solution:
      '활용할 메뉴를 정하지 않고 구매한 특가 식재료가 남고 있습니다. 장보기 전 부족한 재료만 리스트에 담아 구매하세요.',
  },
  '기타 사유': {
    title: '주간 식단 주기에 맞춘 소량 장보기',
    solution:
      '외식·배달 일정이 많은 주간에는 신선식품 장보기를 줄이고 냉동·실온 식재료 위주로 운영하세요.',
  },
};

export function computeWasteRootCauseAnalytics(
  lifecycleEvents: IngredientLifecycleEvent[],
  wastes: WasteRecord[],
  _expenses: ExpenseRecord[]
): WasteRootCauseAnalytics {
  const today = getTodayDateString();

  // Merge any manual WasteRecords that don't have a matching lifecycle wasted event
  const wastedLifecycleEvents = lifecycleEvents.filter((e) => e.action === 'wasted');
  const syntheticWasteEvents: IngredientLifecycleEvent[] = wastes
    .filter(
      (w) =>
        !wastedLifecycleEvents.some(
          (le) => le.itemName === w.itemName && le.date === w.date && le.amountKRW === w.wastedAmount
        )
    )
    .map((w) => ({
      id: `syn-${w.id}`,
      date: w.date,
      month: w.month,
      action: 'wasted' as const,
      itemName: w.itemName,
      category: w.category,
      storage: '냉장' as const,
      quantity: 1,
      unit: '건',
      amountKRW: w.wastedAmount,
      daysHeld: 6,
      daysFromExpiry: -2,
      causeTag: inferCauseTagFromReason(w.reason),
      note: w.reason,
      isSample: w.isSample,
    }));

  const allEvents = [...lifecycleEvents, ...syntheticWasteEvents];
  const allDates = allEvents.map((e) => e.date).filter(Boolean).sort();
  const earliestDate = allDates[0] || today;
  const trackingSpanDays =
    allEvents.length === 0 ? 0 : Math.max(1, calculateDaysBetween(earliestDate, today) + 1);
  const isOneMonthReady = trackingSpanDays >= 30 || allEvents.length >= 12;
  const daysUntilOneMonth = Math.max(0, 30 - trackingSpanDays);

  const registeredCount = allEvents.filter((e) => e.action === 'registered').length;
  const consumedCount = allEvents.filter((e) => e.action === 'consumed').length;
  const wastedEvents = allEvents.filter((e) => e.action === 'wasted');
  const wastedCount = wastedEvents.length;

  const outcomeTotal = consumedCount + wastedCount;
  const consumptionRatePct =
    outcomeTotal > 0 ? Math.round((consumedCount / outcomeTotal) * 100) : 0;
  const wasteRatePct =
    outcomeTotal > 0 ? Math.round((wastedCount / outcomeTotal) * 100) : 0;

  const totalWastedKRW = wastedEvents.reduce((sum, e) => sum + e.amountKRW, 0);
  const avgDaysHeldBeforeWaste =
    wastedEvents.length > 0
      ? Math.round(
          (wastedEvents.reduce((sum, e) => sum + (e.daysHeld || 0), 0) / wastedEvents.length) * 10
        ) / 10
      : 0;

  const causeMap = new Map<WasteCauseTag, { count: number; amountKRW: number }>();
  const catMap = new Map<IngredientCategory, { count: number; amountKRW: number }>();
  const storageMap = new Map<StorageLocation, { count: number; amountKRW: number }>();
  const itemFreq = new Map<string, number>();

  for (const ev of wastedEvents) {
    const tag = WASTE_CAUSE_TAGS.includes(ev.causeTag as WasteCauseTag)
      ? (ev.causeTag as WasteCauseTag)
      : inferCauseTagFromReason(ev.note || ev.causeTag);
    const prevCause = causeMap.get(tag) || { count: 0, amountKRW: 0 };
    causeMap.set(tag, {
      count: prevCause.count + 1,
      amountKRW: prevCause.amountKRW + ev.amountKRW,
    });

    const prevCat = catMap.get(ev.category) || { count: 0, amountKRW: 0 };
    catMap.set(ev.category, {
      count: prevCat.count + 1,
      amountKRW: prevCat.amountKRW + ev.amountKRW,
    });

    const prevSt = storageMap.get(ev.storage) || { count: 0, amountKRW: 0 };
    storageMap.set(ev.storage, {
      count: prevSt.count + 1,
      amountKRW: prevSt.amountKRW + ev.amountKRW,
    });

    itemFreq.set(ev.itemName, (itemFreq.get(ev.itemName) || 0) + 1);
  }

  const denomKRW = Math.max(1, totalWastedKRW);
  const causeDistribution = Array.from(causeMap.entries())
    .map(([causeTag, stat]) => ({
      causeTag,
      count: stat.count,
      amountKRW: stat.amountKRW,
      sharePct:
        totalWastedKRW > 0
          ? Math.round((stat.amountKRW / denomKRW) * 100)
          : Math.round((stat.count / Math.max(1, wastedCount)) * 100),
    }))
    .sort((a, b) => b.amountKRW - a.amountKRW || b.count - a.count);

  const vulnerableCategories = Array.from(catMap.entries())
    .map(([category, stat]) => ({
      category,
      wastedCount: stat.count,
      wastedKRW: stat.amountKRW,
    }))
    .sort((a, b) => b.wastedKRW - a.wastedKRW);

  const vulnerableStorages = Array.from(storageMap.entries())
    .map(([storage, stat]) => ({
      storage,
      wastedCount: stat.count,
      wastedKRW: stat.amountKRW,
    }))
    .sort((a, b) => b.wastedKRW - a.wastedKRW);

  const repeatedWastedItems = Array.from(itemFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, cnt]) => (cnt >= 2 ? `${name}(${cnt}회)` : name));

  const deterministicSolutions = causeDistribution.slice(0, 3).map((c) => ({
    causeTag: c.causeTag,
    title: CAUSE_SOLUTION_MAP[c.causeTag].title,
    solution: CAUSE_SOLUTION_MAP[c.causeTag].solution,
  }));

  return {
    trackingSpanDays,
    isOneMonthReady,
    daysUntilOneMonth,
    registeredCount,
    consumedCount,
    wastedCount,
    consumptionRatePct,
    wasteRatePct,
    totalWastedKRW,
    avgDaysHeldBeforeWaste,
    causeDistribution,
    vulnerableCategories,
    vulnerableStorages,
    repeatedWastedItems,
    deterministicSolutions,
  };
}

/**
 * Generates realistic 32-day 1-person household registration/consumption/waste history (marked isSample: true)
 * so the user can immediately experience the 1-Month Waste Cause Analyzer & AI Solution Prescription.
 */
export function createSampleOneMonthLifecycleEvents(): {
  lifecycleEvents: IngredientLifecycleEvent[];
  wastes: WasteRecord[];
} {
  const now = new Date();
  const daysAgo = (n: number): { date: string; month: string } => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, month: `${yyyy}-${mm}` };
  };

  const currMonth = getCurrentMonthString();
  const prevMonth = getPreviousMonthString(currMonth);
  const ts = Date.now();

  const lifecycleEvents: IngredientLifecycleEvent[] = [
    {
      id: `sample-lc-1-${ts}`,
      ...daysAgo(32),
      action: 'registered',
      itemName: '대파 (1단 묶음)',
      category: '채소',
      storage: '냉장',
      quantity: 1,
      unit: '단',
      amountKRW: 3200,
      daysHeld: 0,
      daysFromExpiry: 7,
      causeTag: '',
      note: '마트 대용량 1단 구매 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-2-${ts}`,
      ...daysAgo(24),
      action: 'wasted',
      itemName: '대파 (남은 절반)',
      category: '채소',
      storage: '냉장',
      quantity: 0.5,
      unit: '단',
      amountKRW: 1600,
      daysHeld: 8,
      daysFromExpiry: -2,
      causeTag: '대용량·묶음 과다구매',
      note: '1인 가구 소비량 대비 1단 양이 많아 냉장실 하단에서 무름 발생 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-3-${ts}`,
      ...daysAgo(28),
      action: 'registered',
      itemName: '찌개용 두부',
      category: '가공식품',
      storage: '냉장',
      quantity: 1,
      unit: '모',
      amountKRW: 2400,
      daysHeld: 0,
      daysFromExpiry: 5,
      causeTag: '',
      note: '장보기 입고 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-4-${ts}`,
      ...daysAgo(22),
      action: 'wasted',
      itemName: '개봉 후 남은 두부 반 모',
      category: '가공식품',
      storage: '냉장',
      quantity: 0.5,
      unit: '모',
      amountKRW: 1200,
      daysHeld: 6,
      daysFromExpiry: -3,
      causeTag: '개봉 후 소분·밀폐 미흡',
      note: '반 모 사용 후 포장 용기째 그대로 두어 시큼한 냄새 발생 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-5-${ts}`,
      ...daysAgo(20),
      action: 'consumed',
      itemName: '달걀',
      category: '알류',
      storage: '냉장',
      quantity: 6,
      unit: '개',
      amountKRW: 3200,
      daysHeld: 5,
      daysFromExpiry: 7,
      causeTag: '',
      note: '오믈렛·볶음밥으로 전량 소비 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-6-${ts}`,
      ...daysAgo(16),
      action: 'registered',
      itemName: '모둠 쌈채소',
      category: '채소',
      storage: '냉장',
      quantity: 1,
      unit: '봉',
      amountKRW: 3500,
      daysHeld: 0,
      daysFromExpiry: 4,
      causeTag: '',
      note: '고기 구이용 구매 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-7-${ts}`,
      ...daysAgo(10),
      action: 'wasted',
      itemName: '모둠 쌈채소 잔량',
      category: '채소',
      storage: '냉장',
      quantity: 0.6,
      unit: '봉',
      amountKRW: 2100,
      daysHeld: 6,
      daysFromExpiry: -2,
      causeTag: '보관 방법 부적절',
      note: '비닐봉지 그대로 물기 있는 채 보관하여 잎이 짓무름 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-8-${ts}`,
      ...daysAgo(12),
      action: 'consumed',
      itemName: '애호박',
      category: '채소',
      storage: '냉장',
      quantity: 1,
      unit: '개',
      amountKRW: 1900,
      daysHeld: 3,
      daysFromExpiry: 2,
      causeTag: '',
      note: '된장짜글이로 기한 내 소진 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-9-${ts}`,
      ...daysAgo(9),
      action: 'wasted',
      itemName: '흰우유 900ml 잔량',
      category: '유제품',
      storage: '냉장',
      quantity: 0.4,
      unit: '팩',
      amountKRW: 1300,
      daysHeld: 9,
      daysFromExpiry: -3,
      causeTag: '소비기한 미확인·방치',
      note: '냉장고 문짝 뒤쪽에 두어 소비기한 경과 미확인 폐기 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-10-${ts}`,
      ...daysAgo(6),
      action: 'consumed',
      itemName: '양파',
      category: '채소',
      storage: '실온',
      quantity: 2,
      unit: '개',
      amountKRW: 1800,
      daysHeld: 7,
      daysFromExpiry: 5,
      causeTag: '',
      note: '덮밥 소스로 전량 소비 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-11-${ts}`,
      ...daysAgo(4),
      action: 'wasted',
      itemName: '특가 팽이버섯 3봉 묶음',
      category: '채소',
      storage: '냉장',
      quantity: 2,
      unit: '봉',
      amountKRW: 1800,
      daysHeld: 7,
      daysFromExpiry: -2,
      causeTag: '대용량·묶음 과다구매',
      note: '마감 세일 묶음 구매 후 1봉만 쓰고 나머지 2봉 변색 폐기 (예시)',
      isSample: true,
    },
    {
      id: `sample-lc-12-${ts}`,
      ...daysAgo(2),
      action: 'consumed',
      itemName: '삼겹살 소포장',
      category: '육류',
      storage: '냉동',
      quantity: 200,
      unit: 'g',
      amountKRW: 5400,
      daysHeld: 8,
      daysFromExpiry: 14,
      causeTag: '',
      note: '1인분 냉동 소분 후 김치볶음에 완수 (예시)',
      isSample: true,
    },
  ];

  const wastes: WasteRecord[] = [
    {
      id: `sample-1m-w1-${ts}`,
      date: daysAgo(10).date,
      month: currMonth,
      itemName: '모둠 쌈채소 잔량',
      category: '채소',
      wastedAmount: 2100,
      reason: '[보관 방법 부적절] 비닐봉지 그대로 물기 있는 채 보관하여 시듦 (예시)',
      isSample: true,
    },
    {
      id: `sample-1m-w2-${ts}`,
      date: daysAgo(9).date,
      month: currMonth,
      itemName: '흰우유 900ml 잔량',
      category: '유제품',
      wastedAmount: 1300,
      reason: '[소비기한 미확인·방치] 개봉 후 소비기한 경과 미확인 (예시)',
      isSample: true,
    },
    {
      id: `sample-1m-w3-${ts}`,
      date: daysAgo(4).date,
      month: currMonth,
      itemName: '특가 팽이버섯 2봉',
      category: '채소',
      wastedAmount: 1800,
      reason: '[대용량·묶음 과다구매] 3봉 묶음 구매 후 미소진 변질 (예시)',
      isSample: true,
    },
    {
      id: `sample-1m-w4-${ts}`,
      date: `${prevMonth}-20`,
      month: prevMonth,
      itemName: '대파·두부 잔량',
      category: '채소',
      wastedAmount: 2800,
      reason: '[개봉 후 소분·밀폐 미흡] 소분 없이 냉장 보관 후 변질 (예시)',
      isSample: true,
    },
  ];

  return { lifecycleEvents, wastes };
}
