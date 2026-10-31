import {
  ExpenseRecord,
  FridgeMission,
  FridgePagoState,
  Ingredient,
  INGREDIENT_CATEGORIES,
  IngredientLifecycleEvent,
  MissionGameState,
  MissionLogEntry,
  MonthlyAiSummary,
  Recipe,
  RecipeUsageRecord,
  ShoppingItem,
  STORAGE_LOCATIONS,
  UserProfile,
  WasteCauseAnalysis,
  WasteRecord,
} from '../types';
import { addDaysToToday, getCurrentMonthString, getPreviousMonthString, getTodayDateString } from './dateUtils';
import { buildPersonalizedMissionRound, getDefaultMissionGameState } from './gameAndWasteUtils';

const STORAGE_KEY = 'fridgepago_app_state_v1';

export const DEFAULT_PROFILE: UserProfile = {
  nickname: '자취셰프',
  householdLabel: '1인 가구 스마트 홈키친',
  monthlyBudget: 250000,
  allergiesAndDislikes: [],
};

export function getDefaultState(): FridgePagoState {
  return {
    ingredients: [],
    recommendedRecipes: [],
    shoppingList: [],
    expenses: [],
    wastes: [],
    recipeUsages: [],
    monthlyAiSummaries: {},
    storeRecommendation: null,
    lifecycleEvents: [],
    wasteAnalyses: {},
    missionGame: getDefaultMissionGameState([], []),
    profile: { ...DEFAULT_PROFILE },
  };
}

function sanitizeIngredients(raw: unknown): Ingredient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `ing-${Date.now()}-${idx}`,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : '식재료',
      category: INGREDIENT_CATEGORIES.includes(item.category as never)
        ? (item.category as Ingredient['category'])
        : '기타',
      quantity:
        typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
          ? item.quantity
          : 1,
      unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : '개',
      storage: STORAGE_LOCATIONS.includes(item.storage as never)
        ? (item.storage as Ingredient['storage'])
        : '냉장',
      purchaseDate:
        typeof item.purchaseDate === 'string' ? item.purchaseDate : getTodayDateString(),
      expiryDate: typeof item.expiryDate === 'string' ? item.expiryDate : '',
      purchasePrice:
        typeof item.purchasePrice === 'number' && Number.isFinite(item.purchasePrice)
          ? item.purchasePrice
          : undefined,
      customImageDataUrl:
        typeof item.customImageDataUrl === 'string' ? item.customImageDataUrl : undefined,
      memo: typeof item.memo === 'string' ? item.memo : undefined,
      isSample: Boolean(item.isSample),
      createdAt:
        typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    }));
}

function sanitizeLifecycleEvents(raw: unknown): IngredientLifecycleEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `lc-${Date.now()}-${idx}`,
      date: typeof item.date === 'string' ? item.date : getTodayDateString(),
      month: typeof item.month === 'string' ? item.month : getCurrentMonthString(),
      action:
        item.action === 'registered' || item.action === 'consumed' || item.action === 'wasted'
          ? item.action
          : 'registered',
      itemName:
        typeof item.itemName === 'string' && item.itemName.trim()
          ? item.itemName.trim()
          : '식재료',
      category: INGREDIENT_CATEGORIES.includes(item.category as never)
        ? (item.category as Ingredient['category'])
        : '기타',
      storage: STORAGE_LOCATIONS.includes(item.storage as never)
        ? (item.storage as Ingredient['storage'])
        : '냉장',
      quantity:
        typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
          ? item.quantity
          : 1,
      unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : '개',
      amountKRW:
        typeof item.amountKRW === 'number' && Number.isFinite(item.amountKRW) && item.amountKRW >= 0
          ? Math.round(item.amountKRW)
          : 0,
      daysHeld:
        typeof item.daysHeld === 'number' && Number.isFinite(item.daysHeld) && item.daysHeld >= 0
          ? Math.round(item.daysHeld)
          : 0,
      daysFromExpiry:
        typeof item.daysFromExpiry === 'number' && Number.isFinite(item.daysFromExpiry)
          ? Math.round(item.daysFromExpiry)
          : 0,
      causeTag: typeof item.causeTag === 'string' ? item.causeTag : '',
      note: typeof item.note === 'string' ? item.note : '',
      isSample: Boolean(item.isSample),
    }));
}

function sanitizeMissionGame(
  raw: unknown,
  ingredients: Ingredient[],
  wastes: WasteRecord[]
): MissionGameState {
  if (!raw || typeof raw !== 'object') {
    return getDefaultMissionGameState(ingredients, wastes);
  }
  const obj = raw as Partial<MissionGameState>;
  const activeMissions = Array.isArray(obj.activeMissions)
    ? (obj.activeMissions as FridgeMission[]).filter(
        (m) => Boolean(m && typeof m.id === 'string' && typeof m.title === 'string')
      )
    : [];
  const recentLogs = Array.isArray(obj.recentLogs)
    ? (obj.recentLogs as MissionLogEntry[]).filter(
        (l) => Boolean(l && typeof l.id === 'string' && typeof l.title === 'string')
      )
    : [];
  const roundNum =
    typeof obj.roundNumber === 'number' && Number.isFinite(obj.roundNumber) && obj.roundNumber >= 1
      ? Math.round(obj.roundNumber)
      : 1;

  return {
    totalPoints:
      typeof obj.totalPoints === 'number' && Number.isFinite(obj.totalPoints) && obj.totalPoints >= 0
        ? Math.round(obj.totalPoints)
        : 0,
    completedRounds:
      typeof obj.completedRounds === 'number' &&
      Number.isFinite(obj.completedRounds) &&
      obj.completedRounds >= 0
        ? Math.round(obj.completedRounds)
        : 0,
    completedMissionsCount:
      typeof obj.completedMissionsCount === 'number' &&
      Number.isFinite(obj.completedMissionsCount) &&
      obj.completedMissionsCount >= 0
        ? Math.round(obj.completedMissionsCount)
        : 0,
    roundNumber: roundNum,
    roundBonusClaimed: Boolean(obj.roundBonusClaimed),
    activeMissions:
      activeMissions.length > 0
        ? activeMissions
        : buildPersonalizedMissionRound(ingredients, wastes, roundNum),
    recentLogs: recentLogs.slice(0, 20),
  };
}

export function loadAppState(): FridgePagoState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultState();
    }
    const parsed = JSON.parse(raw) as Partial<FridgePagoState>;
    if (!parsed || typeof parsed !== 'object') {
      return getDefaultState();
    }

    const sanitizedIngredients = sanitizeIngredients(parsed.ingredients);
    const sanitizedWastes = Array.isArray(parsed.wastes)
      ? (parsed.wastes as WasteRecord[]).filter((w) => w && typeof w.wastedAmount === 'number')
      : [];

    return {
      ingredients: sanitizedIngredients,
      recommendedRecipes: Array.isArray(parsed.recommendedRecipes) ? parsed.recommendedRecipes : [],
      shoppingList: Array.isArray(parsed.shoppingList)
        ? (parsed.shoppingList as ShoppingItem[]).filter((s) => s && typeof s.name === 'string')
        : [],
      expenses: Array.isArray(parsed.expenses)
        ? (parsed.expenses as ExpenseRecord[]).filter((e) => e && typeof e.amount === 'number')
        : [],
      wastes: sanitizedWastes,
      recipeUsages: Array.isArray(parsed.recipeUsages)
        ? (parsed.recipeUsages as RecipeUsageRecord[]).filter(
            (r) => r && typeof r.savedAmount === 'number'
          )
        : [],
      monthlyAiSummaries:
        parsed.monthlyAiSummaries && typeof parsed.monthlyAiSummaries === 'object'
          ? (parsed.monthlyAiSummaries as Record<string, MonthlyAiSummary>)
          : {},
      storeRecommendation:
        parsed.storeRecommendation && typeof parsed.storeRecommendation === 'object'
          ? parsed.storeRecommendation
          : null,
      lifecycleEvents: sanitizeLifecycleEvents(parsed.lifecycleEvents),
      wasteAnalyses:
        parsed.wasteAnalyses && typeof parsed.wasteAnalyses === 'object'
          ? (parsed.wasteAnalyses as Record<string, WasteCauseAnalysis>)
          : {},
      missionGame: sanitizeMissionGame(
        parsed.missionGame,
        sanitizedIngredients,
        sanitizedWastes
      ),
      profile: {
        nickname:
          typeof parsed.profile?.nickname === 'string' && parsed.profile.nickname.trim()
            ? parsed.profile.nickname.trim()
            : DEFAULT_PROFILE.nickname,
        householdLabel:
          typeof parsed.profile?.householdLabel === 'string'
            ? parsed.profile.householdLabel
            : DEFAULT_PROFILE.householdLabel,
        monthlyBudget:
          typeof parsed.profile?.monthlyBudget === 'number' && parsed.profile.monthlyBudget > 0
            ? parsed.profile.monthlyBudget
            : DEFAULT_PROFILE.monthlyBudget,
        allergiesAndDislikes: Array.isArray(parsed.profile?.allergiesAndDislikes)
          ? parsed.profile.allergiesAndDislikes.filter((t): t is string => typeof t === 'string')
          : [],
      },
    };
  } catch {
    // Graceful recovery when LocalStorage is corrupted or inaccessible
    return getDefaultState();
  }
}

export function saveAppState(state: FridgePagoState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors silently without crashing UI
  }
}

// Required Sample Ingredients: 애호박 1개, 달걀 4개, 두부 1모, 대파 1단, 양파 2개, 우유 1개
export function createSampleIngredients(): Ingredient[] {
  const today = getTodayDateString();
  const nowIso = new Date().toISOString();

  return [
    {
      id: `sample-zucchini-${Date.now()}`,
      name: '애호박',
      category: '채소',
      quantity: 1,
      unit: '개',
      storage: '냉장',
      purchaseDate: today,
      expiryDate: addDaysToToday(2),
      purchasePrice: 1900,
      memo: '찌개·볶음용',
      isSample: true,
      createdAt: nowIso,
    },
    {
      id: `sample-egg-${Date.now() + 1}`,
      name: '달걀',
      category: '알류',
      quantity: 4,
      unit: '개',
      storage: '냉장',
      purchaseDate: today,
      expiryDate: addDaysToToday(6),
      purchasePrice: 2400,
      memo: '특란',
      isSample: true,
      createdAt: nowIso,
    },
    {
      id: `sample-tofu-${Date.now() + 2}`,
      name: '두부',
      category: '가공식품',
      quantity: 1,
      unit: '모',
      storage: '냉장',
      purchaseDate: today,
      expiryDate: addDaysToToday(1),
      purchasePrice: 2200,
      memo: '찌개·부침 겸용',
      isSample: true,
      createdAt: nowIso,
    },
    {
      id: `sample-scallion-${Date.now() + 3}`,
      name: '대파',
      category: '채소',
      quantity: 1,
      unit: '단',
      storage: '냉장',
      purchaseDate: today,
      expiryDate: addDaysToToday(3),
      purchasePrice: 2800,
      memo: '손질 전',
      isSample: true,
      createdAt: nowIso,
    },
    {
      id: `sample-onion-${Date.now() + 4}`,
      name: '양파',
      category: '채소',
      quantity: 2,
      unit: '개',
      storage: '실온',
      purchaseDate: today,
      expiryDate: addDaysToToday(10),
      purchasePrice: 1800,
      memo: '서늘한 곳 보관',
      isSample: true,
      createdAt: nowIso,
    },
    {
      id: `sample-milk-${Date.now() + 5}`,
      name: '우유',
      category: '유제품',
      quantity: 1,
      unit: '개',
      storage: '냉장',
      purchaseDate: today,
      expiryDate: addDaysToToday(2),
      purchasePrice: 2900,
      memo: '흰우유 900ml',
      isSample: true,
      createdAt: nowIso,
    },
  ];
}

export function createSampleReportData(): {
  expenses: ExpenseRecord[];
  wastes: WasteRecord[];
  recipeUsages: RecipeUsageRecord[];
} {
  const currentMonth = getCurrentMonthString();
  const prevMonth = getPreviousMonthString(currentMonth);
  const today = getTodayDateString();

  return {
    expenses: [
      {
        id: `sample-exp-1-${Date.now()}`,
        date: today,
        month: currentMonth,
        itemName: '애호박·두부·대파·양파 장보기',
        category: '채소',
        amount: 8700,
        memo: '동네 마트 소분 구매 (예시 데이터)',
        isSample: true,
      },
      {
        id: `sample-exp-2-${Date.now()}`,
        date: today,
        month: currentMonth,
        itemName: '달걀·우유 구매',
        category: '유제품',
        amount: 5300,
        memo: '기본 단백질·유제품 보충 (예시 데이터)',
        isSample: true,
      },
      {
        id: `sample-exp-prev-1-${Date.now()}`,
        date: `${prevMonth}-12`,
        month: prevMonth,
        itemName: '지난달 마트 정기 장보기',
        category: '채소',
        amount: 19500,
        memo: '예시 지난달 지출',
        isSample: true,
      },
      {
        id: `sample-exp-prev-2-${Date.now()}`,
        date: `${prevMonth}-21`,
        month: prevMonth,
        itemName: '지난달 정육·가공식품 구매',
        category: '육류',
        amount: 16000,
        memo: '예시 지난달 지출',
        isSample: true,
      },
    ],
    wastes: [
      {
        id: `sample-waste-1-${Date.now()}`,
        date: today,
        month: currentMonth,
        itemName: '남은 쌈채소 소량',
        category: '채소',
        wastedAmount: 1500,
        reason: '소비기한 경과로 인한 시듦 (예시 데이터)',
        isSample: true,
      },
      {
        id: `sample-waste-prev-${Date.now()}`,
        date: `${prevMonth}-26`,
        month: prevMonth,
        itemName: '개봉 후 남은 우유·두부',
        category: '유제품',
        wastedAmount: 4800,
        reason: '지난달 소비기한 미확인 폐기 (예시 데이터)',
        isSample: true,
      },
    ],
    recipeUsages: [
      {
        id: `sample-usage-1-${Date.now()}`,
        date: today,
        month: currentMonth,
        recipeTitle: '두부 애호박 새우젓(간장) 조림',
        usedIngredients: ['두부', '애호박', '대파', '양파'],
        savedAmount: 8500,
        memo: '임박 두부·애호박 소진으로 배달비 포함 외식비 절약 (예시 데이터)',
        isSample: true,
      },
      {
        id: `sample-usage-prev-${Date.now()}`,
        date: `${prevMonth}-18`,
        month: prevMonth,
        recipeTitle: '대파 달걀 볶음밥',
        usedIngredients: ['달걀', '대파'],
        savedAmount: 6000,
        memo: '예시 지난달 냉파 요리 기록',
        isSample: true,
      },
    ],
  };
}

/**
 * Generates truthful, live-matched starter recipe previews strictly from currently owned ingredients
 * when Gemini AI recipes have not been requested yet, ensuring Dashboard always shows accurate owned vs missing items.
 */
export function buildOwnedMatchedPreviewRecipes(
  ingredients: Ingredient[],
  allergies: string[] = []
): Recipe[] {
  if (ingredients.length === 0) return [];

  const normAllergies = allergies.map((a) => a.trim().toLowerCase()).filter(Boolean);
  const hasAllergy = (candidates: string[]) =>
    candidates.some((c) => normAllergies.some((al) => c.toLowerCase().includes(al)));

  const findOwned = (keyword: string) =>
    ingredients.find((i) => i.name.includes(keyword) || keyword.includes(i.name));

  const templates = [
    {
      id: 'preview-recipe-1',
      title: '집간장 두부 애호박 짜글이 조림',
      description: '소비기한이 짧은 두부와 애호박, 대파·양파를 한 냄비에 자작하게 끓여내는 1인 가구 밥도둑 메뉴입니다.',
      cuisine: '한식',
      cookingTimeMinutes: 15,
      difficulty: '쉬움',
      targetItems: [
        { name: '두부', amount: '1모', category: '가공식품' as const, price: 2200 },
        { name: '애호박', amount: '1/2개', category: '채소' as const, price: 1900 },
        { name: '양파', amount: '1/2개', category: '채소' as const, price: 1000 },
        { name: '대파', amount: '1/3단', category: '채소' as const, price: 1500 },
      ],
      basicSeasonings: ['물 150ml', '진간장 2큰술', '고춧가루 1큰술', '다진마늘 0.5큰술', '참기름 약간'],
      steps: [
        '두부와 애호박은 한 입 두께로 도톰하게 썰고, 양파와 대파도 먹기 좋게 썹니다.',
        '냄비 바닥에 양파와 애호박을 깔고 그 위에 두부를 올린 뒤 물과 양념장을 부어 중불에서 끓입니다.',
        '국물이 자작하게 졸아들면 대파와 참기름을 두르고 2분간 더 끓여 완성합니다.',
      ],
      recommendationReason: '냉장 보관 중 소비기한이 빠르게 다가오는 두부와 채소류를 남김없이 한 번에 활용할 수 있습니다.',
      safetyAndAllergyNote: '개봉한 두부는 조리 전 시큼한 냄새가 나지 않는지 확인하고 중심부까지 충분히 가열해 드세요. (대두 포함)',
    },
    {
      id: 'preview-recipe-2',
      title: '폭신한 우유 대파 프렌치 스크램블 오믈렛',
      description: '달걀에 우유를 더해 부드러운 식감을 살리고, 구운 대파와 양파의 단맛을 곁들인 10분 원팬 간편식입니다.',
      cuisine: '간편식',
      cookingTimeMinutes: 10,
      difficulty: '쉬움',
      targetItems: [
        { name: '달걀', amount: '2~3개', category: '알류' as const, price: 1800 },
        { name: '우유', amount: '3큰술', category: '유제품' as const, price: 1500 },
        { name: '대파', amount: '약간', category: '채소' as const, price: 1200 },
        { name: '양파', amount: '1/4개', category: '채소' as const, price: 900 },
      ],
      basicSeasonings: ['식용유 또는 버터 1큰술', '소금 두 꼬집', '후추 약간'],
      steps: [
        '볼에 달걀과 우유, 소금을 넣고 고루 풀어 달걀물을 준비합니다.',
        '중약불로 달군 팬에 기름을 두르고 송송 썬 대파와 채 썬 양파를 노릇하게 볶아 단맛을 냅니다.',
        '달걀물을 부어 가장자리부터 부드럽게 저어가며 반숙 상태에서 불을 끄고 잔열로 완성합니다.',
      ],
      recommendationReason: '개봉 후 빨리 마셔야 하는 우유와 달걀을 함께 소진할 수 있는 초간단 고단백 한 끼입니다.',
      safetyAndAllergyNote: '우유와 달걀은 소비기한 및 껍질 파손 여부를 확인 후 조리하세요. (난류·우유 포함)',
    },
    {
      id: 'preview-recipe-3',
      title: '애호박 양파 달걀 덮밥',
      description: '채 썬 애호박과 양파를 짭조름한 간장 소스에 볶아 포슬포슬한 달걀로 덮어내는 든든한 1인 덮밥입니다.',
      cuisine: '한식',
      cookingTimeMinutes: 15,
      difficulty: '쉬움',
      targetItems: [
        { name: '애호박', amount: '1/2개', category: '채소' as const, price: 1900 },
        { name: '양파', amount: '1/2개', category: '채소' as const, price: 1000 },
        { name: '달걀', amount: '2개', category: '알류' as const, price: 1200 },
        { name: '대파', amount: '약간', category: '채소' as const, price: 1200 },
      ],
      basicSeasonings: ['진간장 1.5큰술', '설탕 0.5큰술', '물 3큰술', '식용유 1큰술', '참기름 약간'],
      steps: [
        '애호박과 양파는 가늘게 채 썰고, 대파는 송송 썰어 준비합니다.',
        '팬에 식용유를 두르고 대파 향을 낸 뒤 애호박과 양파를 넣고 숨이 죽을 때까지 볶습니다.',
        '간장·설탕·물을 넣어 간을 맞춘 후 풀어둔 달걀을 둘러 반숙으로 익혀 따뜻한 밥 위에 올립니다.',
      ],
      recommendationReason: '자취방 필수 채소인 애호박·양파·달걀만으로 추가 장보기 없이 15분 만에 완성할 수 있습니다.',
      safetyAndAllergyNote: '달걀은 조리 직전에 깨뜨려 사용하고, 남은 채소는 밀폐하여 냉장 보관하세요.',
    },
  ];

  const filtered = templates.filter(
    (tpl) => !hasAllergy([tpl.title, ...tpl.targetItems.map((t) => t.name)])
  );

  return filtered.map((tpl) => {
    const ownedIngredients = tpl.targetItems
      .filter((t) => Boolean(findOwned(t.name)))
      .map((t) => ({ name: t.name, amount: t.amount }));

    const missingIngredients = tpl.targetItems
      .filter((t) => !findOwned(t.name))
      .map((t) => ({
        name: t.name,
        amount: t.amount,
        category: t.category,
        estimatedPrice: t.price,
      }));

    // If user owns other ingredients not in standard template and ownedIngredients is empty, include top urgent fridge item note
    return {
      id: tpl.id,
      title: tpl.title,
      description: tpl.description,
      cuisine: tpl.cuisine,
      cookingTimeMinutes: tpl.cookingTimeMinutes,
      difficulty: tpl.difficulty,
      requiredIngredients: tpl.targetItems.map((t) => `${t.name} ${t.amount}`),
      ownedIngredients,
      missingIngredients,
      basicSeasonings: tpl.basicSeasonings,
      steps: tpl.steps,
      recommendationReason: tpl.recommendationReason,
      safetyAndAllergyNote: tpl.safetyAndAllergyNote,
      isStarterPreview: true,
      createdAt: new Date().toISOString(),
    };
  });
}
