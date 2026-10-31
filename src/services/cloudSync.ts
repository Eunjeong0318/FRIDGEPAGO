import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AiStoreRecommendation,
  ExpenseRecord,
  FridgeMission,
  FridgePagoState,
  INGREDIENT_CATEGORIES,
  Ingredient,
  IngredientCategory,
  IngredientLifecycleEvent,
  MissionGameState,
  MissionKind,
  MissionLogEntry,
  MonthlyAiSummary,
  OnlineMallId,
  Recipe,
  RecipeUsageRecord,
  ShoppingItem,
  STORAGE_LOCATIONS,
  StorageLocation,
  UserProfile,
  WasteCauseAnalysis,
  WasteRecord,
} from '../types';
import { getCurrentMonthString, getTodayDateString } from '../utils/dateUtils';
import { buildPersonalizedMissionRound, getDefaultMissionGameState } from '../utils/gameAndWasteUtils';
import { DEFAULT_PROFILE } from '../utils/storage';
import { db, handleFirestoreError, OperationType } from '../firebase';

/**
 * Exact validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
 */
export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const VALID_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const VALID_MONTH_REGEX = /^\d{4}-\d{2}$/;

export const SCHEMA_LIMITS = {
  idMax: 128,
  storeRecIdMax: 64,
  nicknameMax: 40,
  householdLabelMax: 80,
  allergiesMaxItems: 30,
  allergyItemMax: 50,
  ingredientNameMax: 80,
  unitMax: 20,
  memoMax: 300,
  isoMax: 40,
  recipeTitleMax: 120,
  recipeDescMax: 600,
  cuisineMax: 30,
  difficultyMax: 20,
  recipeListMax: 40,
  seasoningsMax: 30,
  stepsMax: 25,
  stepTextMax: 500,
  reasonMax: 500,
  amountTextMax: 40,
  wasteReasonMax: 300,
  usedIngredientsMax: 30,
  summaryHeadlineMax: 200,
  summaryParagraphMax: 1500,
  actionTipsMax: 10,
  actionTipTextMax: 300,
  mallNameMax: 80,
  strategyMax: 1000,
  shippingTipMax: 600,
  itemGuidesMax: 40,
  sourcesMax: 20,
  disclaimerMax: 400,
  maxMoney: 100_000_000,
  maxQuantity: 100_000,
} as const;

const ALLOWED_STORES: ReadonlyArray<string> = ['', 'coupang', 'kurly', 'oasis', 'ssg', 'naver'];

export function sanitizeDocId(raw: string | undefined, prefix = 'doc'): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, SCHEMA_LIMITS.idMax);
  if (cleaned.length >= 1 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const str = typeof val === 'string' ? val.trim() : '';
  const effective = str || fallback;
  return effective.slice(0, maxLen);
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function sanitizeCategory(val: unknown): IngredientCategory {
  if (typeof val === 'string' && INGREDIENT_CATEGORIES.includes(val as IngredientCategory)) {
    return val as IngredientCategory;
  }
  return '기타';
}

function sanitizeStorage(val: unknown): StorageLocation {
  if (typeof val === 'string' && STORAGE_LOCATIONS.includes(val as StorageLocation)) {
    return val as StorageLocation;
  }
  return '냉장';
}

function sanitizeDateString(val: unknown): string {
  if (typeof val === 'string' && VALID_DATE_REGEX.test(val.trim())) {
    return val.trim();
  }
  return getTodayDateString();
}

function sanitizeOptionalDateString(val: unknown): string {
  if (typeof val === 'string' && VALID_DATE_REGEX.test(val.trim())) {
    return val.trim();
  }
  return '';
}

function sanitizeMonthString(val: unknown): string {
  if (typeof val === 'string' && VALID_MONTH_REGEX.test(val.trim())) {
    return val.trim();
  }
  return getCurrentMonthString();
}

function sanitizeIso(val: unknown): string {
  if (typeof val === 'string' && val.trim().length >= 1) {
    return val.trim().slice(0, SCHEMA_LIMITS.isoMax);
  }
  return new Date().toISOString().slice(0, SCHEMA_LIMITS.isoMax);
}

// ============================================================================
// Payload Builders (Guaranteed 1:1 Compliance with firestore.rules)
// ============================================================================

function toProfileBase(uid: string, profile: UserProfile) {
  const allergies = (profile.allergiesAndDislikes || [])
    .map((a) => clampString(a, SCHEMA_LIMITS.allergyItemMax))
    .filter((a) => a.length >= 1)
    .slice(0, SCHEMA_LIMITS.allergiesMaxItems);

  return {
    userId: uid,
    nickname: clampString(profile.nickname, SCHEMA_LIMITS.nicknameMax, DEFAULT_PROFILE.nickname),
    householdLabel: clampString(
      profile.householdLabel,
      SCHEMA_LIMITS.householdLabelMax,
      DEFAULT_PROFILE.householdLabel
    ),
    monthlyBudget: Math.round(
      clampNumber(profile.monthlyBudget, 0, SCHEMA_LIMITS.maxMoney, DEFAULT_PROFILE.monthlyBudget)
    ),
    allergiesAndDislikes: allergies,
  };
}

function toIngredientBase(uid: string, item: Ingredient) {
  const docId = sanitizeDocId(item.id, 'ing');
  const hasPrice =
    typeof item.purchasePrice === 'number' &&
    Number.isFinite(item.purchasePrice) &&
    item.purchasePrice >= 0;

  return {
    id: docId,
    userId: uid,
    name: clampString(item.name, SCHEMA_LIMITS.ingredientNameMax, '식재료'),
    category: sanitizeCategory(item.category),
    quantity: clampNumber(item.quantity, 0.01, SCHEMA_LIMITS.maxQuantity, 1),
    unit: clampString(item.unit, SCHEMA_LIMITS.unitMax, '개'),
    storage: sanitizeStorage(item.storage),
    purchaseDate: sanitizeDateString(item.purchaseDate),
    expiryDate: sanitizeOptionalDateString(item.expiryDate),
    hasPurchasePrice: hasPrice,
    purchasePrice: hasPrice
      ? Math.round(clampNumber(item.purchasePrice, 0, SCHEMA_LIMITS.maxMoney, 0))
      : 0,
    memo: clampString(item.memo, SCHEMA_LIMITS.memoMax, ''),
    isSample: Boolean(item.isSample),
    clientCreatedAt: sanitizeIso(item.createdAt),
  };
}

function toRecipeBase(uid: string, recipe: Recipe) {
  const docId = sanitizeDocId(recipe.id, 'rec');
  return {
    id: docId,
    userId: uid,
    title: clampString(recipe.title, SCHEMA_LIMITS.recipeTitleMax, '추천 레시피'),
    description: clampString(recipe.description, SCHEMA_LIMITS.recipeDescMax, '맞춤 레시피입니다.'),
    cuisine: clampString(recipe.cuisine, SCHEMA_LIMITS.cuisineMax, '한식'),
    cookingTimeMinutes: Math.round(clampNumber(recipe.cookingTimeMinutes, 1, 600, 15)),
    difficulty: clampString(recipe.difficulty, SCHEMA_LIMITS.difficultyMax, '쉬움'),
    requiredIngredients: (recipe.requiredIngredients || [])
      .map((s) => clampString(s, 100))
      .filter(Boolean)
      .slice(0, SCHEMA_LIMITS.recipeListMax),
    ownedIngredients: (recipe.ownedIngredients || [])
      .map((o) => ({
        name: clampString(o.name, SCHEMA_LIMITS.ingredientNameMax, '재료'),
        amount: clampString(o.amount, SCHEMA_LIMITS.amountTextMax, '적당량'),
      }))
      .slice(0, SCHEMA_LIMITS.recipeListMax),
    missingIngredients: (recipe.missingIngredients || [])
      .map((m) => ({
        name: clampString(m.name, SCHEMA_LIMITS.ingredientNameMax, '재료'),
        amount: clampString(m.amount, SCHEMA_LIMITS.amountTextMax, '1개'),
        category: sanitizeCategory(m.category),
        estimatedPrice: Math.round(clampNumber(m.estimatedPrice, 0, 10_000_000, 2000)),
      }))
      .slice(0, SCHEMA_LIMITS.recipeListMax),
    basicSeasonings: (recipe.basicSeasonings || [])
      .map((b) => clampString(b, 80))
      .filter(Boolean)
      .slice(0, SCHEMA_LIMITS.seasoningsMax),
    steps: (recipe.steps || [])
      .map((st) => clampString(st, SCHEMA_LIMITS.stepTextMax))
      .filter(Boolean)
      .slice(0, SCHEMA_LIMITS.stepsMax),
    recommendationReason: clampString(recipe.recommendationReason, SCHEMA_LIMITS.reasonMax, ''),
    safetyAndAllergyNote: clampString(recipe.safetyAndAllergyNote, SCHEMA_LIMITS.reasonMax, ''),
    isStarterPreview: Boolean(recipe.isStarterPreview),
    clientCreatedAt: sanitizeIso(recipe.createdAt),
  };
}

function toShoppingBase(uid: string, item: ShoppingItem) {
  const docId = sanitizeDocId(item.id, 'shop');
  const pref =
    typeof item.preferredStore === 'string' && ALLOWED_STORES.includes(item.preferredStore)
      ? item.preferredStore
      : '';
  return {
    id: docId,
    userId: uid,
    name: clampString(item.name, SCHEMA_LIMITS.ingredientNameMax, '장보기 품목'),
    category: sanitizeCategory(item.category),
    quantity: clampNumber(item.quantity, 0.01, SCHEMA_LIMITS.maxQuantity, 1),
    unit: clampString(item.unit, SCHEMA_LIMITS.unitMax, '개'),
    estimatedPrice: Math.round(clampNumber(item.estimatedPrice, 0, SCHEMA_LIMITS.maxMoney, 0)),
    checked: Boolean(item.checked),
    preferredStore: pref,
    sourceRecipeTitle: clampString(item.sourceRecipeTitle, SCHEMA_LIMITS.recipeTitleMax, ''),
    isSample: Boolean(item.isSample),
    clientCreatedAt: sanitizeIso(item.createdAt),
  };
}

function toExpenseBase(uid: string, exp: ExpenseRecord) {
  return {
    id: sanitizeDocId(exp.id, 'exp'),
    userId: uid,
    date: sanitizeDateString(exp.date),
    month: sanitizeMonthString(exp.month),
    itemName: clampString(exp.itemName, SCHEMA_LIMITS.recipeTitleMax, '식재료 구매'),
    category: sanitizeCategory(exp.category),
    amount: Math.round(clampNumber(exp.amount, 0, SCHEMA_LIMITS.maxMoney, 0)),
    memo: clampString(exp.memo, SCHEMA_LIMITS.memoMax, ''),
    isSample: Boolean(exp.isSample),
  };
}

function toWasteBase(uid: string, waste: WasteRecord) {
  return {
    id: sanitizeDocId(waste.id, 'waste'),
    userId: uid,
    date: sanitizeDateString(waste.date),
    month: sanitizeMonthString(waste.month),
    itemName: clampString(waste.itemName, SCHEMA_LIMITS.recipeTitleMax, '폐기 식재료'),
    category: sanitizeCategory(waste.category),
    wastedAmount: Math.round(clampNumber(waste.wastedAmount, 0, SCHEMA_LIMITS.maxMoney, 0)),
    reason: clampString(waste.reason, SCHEMA_LIMITS.wasteReasonMax, '소비기한 경과'),
    isSample: Boolean(waste.isSample),
  };
}

function toRecipeUsageBase(uid: string, usage: RecipeUsageRecord) {
  return {
    id: sanitizeDocId(usage.id, 'usage'),
    userId: uid,
    date: sanitizeDateString(usage.date),
    month: sanitizeMonthString(usage.month),
    recipeTitle: clampString(usage.recipeTitle, SCHEMA_LIMITS.recipeTitleMax, '냉파 요리'),
    usedIngredients: (usage.usedIngredients || [])
      .map((u) => clampString(u, 80))
      .filter(Boolean)
      .slice(0, SCHEMA_LIMITS.usedIngredientsMax),
    savedAmount: Math.round(clampNumber(usage.savedAmount, 0, SCHEMA_LIMITS.maxMoney, 0)),
    memo: clampString(usage.memo, SCHEMA_LIMITS.memoMax, ''),
    isSample: Boolean(usage.isSample),
  };
}

function toMonthlySummaryBase(uid: string, summary: MonthlyAiSummary) {
  const monthKey = sanitizeMonthString(summary.month);
  return {
    month: monthKey,
    userId: uid,
    headline: clampString(summary.headline, SCHEMA_LIMITS.summaryHeadlineMax, '월간 식비 요약'),
    summaryParagraph: clampString(
      summary.summaryParagraph,
      SCHEMA_LIMITS.summaryParagraphMax,
      '식비 및 절약 리포트 요약입니다.'
    ),
    actionTips: (summary.actionTips || [])
      .map((t) => clampString(t, SCHEMA_LIMITS.actionTipTextMax))
      .filter(Boolean)
      .slice(0, SCHEMA_LIMITS.actionTipsMax),
    generatedAt: sanitizeIso(summary.generatedAt),
  };
}

function toStoreRecBase(uid: string, rec: AiStoreRecommendation) {
  return {
    id: 'latest',
    userId: uid,
    primaryRecommendedMall: clampString(
      rec.primaryRecommendedMall,
      SCHEMA_LIMITS.mallNameMax,
      '쿠팡 로켓프레시'
    ),
    overallStrategy: clampString(
      rec.overallStrategy,
      SCHEMA_LIMITS.strategyMax,
      '품목별 최적 구매 전략입니다.'
    ),
    bundleShippingTip: clampString(rec.bundleShippingTip, SCHEMA_LIMITS.shippingTipMax, ''),
    itemGuides: (rec.itemGuides || [])
      .map((g) => ({
        itemName: clampString(g.itemName, 80, '품목'),
        bestStore: clampString(g.bestStore, 60, '온라인몰'),
        reason: clampString(g.reason, 300, '가격 및 배송 유리'),
        searchKeyword: clampString(g.searchKeyword, 100, g.itemName || '식재료'),
        estimatedPriceRange: clampString(g.estimatedPriceRange, 80, '변동'),
      }))
      .slice(0, SCHEMA_LIMITS.itemGuidesMax),
    sources: (rec.sources || [])
      .map((s) => ({
        title: clampString(s.title, 200, '참고 출처'),
        uri: clampString(s.uri, 1000, 'https://shopping.naver.com'),
      }))
      .slice(0, SCHEMA_LIMITS.sourcesMax),
    priceDisclaimer: clampString(rec.priceDisclaimer, SCHEMA_LIMITS.disclaimerMax, ''),
    generatedAt: sanitizeIso(rec.generatedAt),
  };
}

function toLifecycleEventBase(uid: string, ev: IngredientLifecycleEvent) {
  const action =
    ev.action === 'registered' || ev.action === 'consumed' || ev.action === 'wasted'
      ? ev.action
      : 'registered';
  return {
    id: sanitizeDocId(ev.id, 'lc'),
    userId: uid,
    date: sanitizeDateString(ev.date),
    month: sanitizeMonthString(ev.month),
    action,
    itemName: clampString(ev.itemName, SCHEMA_LIMITS.ingredientNameMax, '식재료'),
    category: sanitizeCategory(ev.category),
    storage: sanitizeStorage(ev.storage),
    quantity: clampNumber(ev.quantity, 0.01, SCHEMA_LIMITS.maxQuantity, 1),
    unit: clampString(ev.unit, SCHEMA_LIMITS.unitMax, '개'),
    amountKRW: Math.round(clampNumber(ev.amountKRW, 0, SCHEMA_LIMITS.maxMoney, 0)),
    daysHeld: Math.round(clampNumber(ev.daysHeld, 0, 3650, 0)),
    daysFromExpiry: Math.round(clampNumber(ev.daysFromExpiry, -3650, 3650, 0)),
    causeTag: clampString(ev.causeTag, 40, ''),
    note: clampString(ev.note, SCHEMA_LIMITS.memoMax, ''),
    isSample: Boolean(ev.isSample),
  };
}

function toWasteAnalysisBase(uid: string, analysis: WasteCauseAnalysis) {
  const monthKey = sanitizeMonthString(analysis.month);
  return {
    month: monthKey,
    userId: uid,
    diagnosisHeadline: clampString(
      analysis.diagnosisHeadline,
      200,
      '1개월 식재료 낭비 원인 진단 리포트'
    ),
    primaryCauseSummary: clampString(
      analysis.primaryCauseSummary,
      1200,
      '누적 식재료 소비·폐기 기록을 바탕으로 분석한 핵심 원인 요약입니다.'
    ),
    detectedPatterns: (analysis.detectedPatterns || [])
      .slice(0, 10)
      .map((p) => ({
        patternTitle: clampString(p.patternTitle, 120, '주요 낭비 패턴'),
        evidence: clampString(p.evidence, 400, '기록된 소비·폐기 이력 근거'),
        impactKRW: Math.round(clampNumber(p.impactKRW, 0, SCHEMA_LIMITS.maxMoney, 0)),
      })),
    tailoredSolutions: (analysis.tailoredSolutions || [])
      .slice(0, 10)
      .map((s) => ({
        title: clampString(s.title, 120, '실천 해결 방안'),
        actionStep: clampString(s.actionStep, 400, '1인분 소분 및 우선 소비 루틴 실천'),
        expectedMonthlySavingKRW: Math.round(
          clampNumber(s.expectedMonthlySavingKRW, 0, SCHEMA_LIMITS.maxMoney, 0)
        ),
      })),
    recommendedBuyingRule: clampString(
      analysis.recommendedBuyingRule,
      300,
      '1주일 이내 소진 가능한 소포장 위주로 장보기를 진행하세요.'
    ),
    analyzedEventCount: Math.round(clampNumber(analysis.analyzedEventCount, 0, 100000, 0)),
    generatedAt: sanitizeIso(analysis.generatedAt),
  };
}

function toMissionGameBase(uid: string, game: MissionGameState) {
  return {
    id: 'main',
    userId: uid,
    totalPoints: Math.round(clampNumber(game.totalPoints, 0, 10_000_000, 0)),
    completedRounds: Math.round(clampNumber(game.completedRounds, 0, 100_000, 0)),
    completedMissionsCount: Math.round(clampNumber(game.completedMissionsCount, 0, 1_000_000, 0)),
    roundNumber: Math.round(clampNumber(game.roundNumber, 1, 100_000, 1)),
    roundBonusClaimed: Boolean(game.roundBonusClaimed),
    activeMissions: (game.activeMissions || []).slice(0, 10).map((m, idx) => ({
      id: sanitizeDocId(m.id, `msn-${idx}`).slice(0, 64),
      kind: clampString(m.kind, 30, 'urgent_rescue'),
      title: clampString(m.title, 120, '냉장고 파먹기 미션'),
      description: clampString(m.description, 300, '보유 식재료를 활용해 미션을 수행하세요.'),
      targetItemName: clampString(m.targetItemName, 80, ''),
      targetCategory: clampString(m.targetCategory, 20, ''),
      requiredCount: Math.round(clampNumber(m.requiredCount, 1, 100, 1)),
      currentCount: Math.round(clampNumber(m.currentCount, 0, 100, 0)),
      points: Math.round(clampNumber(m.points, 5, 500, 35)),
      completed: Boolean(m.completed),
    })),
    recentLogs: (game.recentLogs || []).slice(0, 20).map((l, idx) => ({
      id: sanitizeDocId(l.id, `mlog-${idx}`).slice(0, 64),
      title: clampString(l.title, 140, '미션 달성'),
      pointsEarned: Math.round(clampNumber(l.pointsEarned, 1, 1000, 35)),
      completedAt: sanitizeIso(l.completedAt),
    })),
  };
}

// ============================================================================
// Deserializers (Firestore Doc -> Frontend State Shape)
// ============================================================================

function fromFirestoreIngredient(
  data: Record<string, unknown>,
  localCustomImages: Map<string, string>
): Ingredient {
  const id = String(data.id || '');
  const hasPrice = Boolean(data.hasPurchasePrice);
  return {
    id,
    name: String(data.name || '식재료'),
    category: sanitizeCategory(data.category),
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    unit: String(data.unit || '개'),
    storage: sanitizeStorage(data.storage),
    purchaseDate: sanitizeDateString(data.purchaseDate),
    expiryDate: sanitizeOptionalDateString(data.expiryDate),
    purchasePrice: hasPrice && typeof data.purchasePrice === 'number' ? data.purchasePrice : undefined,
    customImageDataUrl: localCustomImages.get(id),
    memo: data.memo ? String(data.memo) : undefined,
    isSample: Boolean(data.isSample),
    createdAt: String(data.clientCreatedAt || new Date().toISOString()),
  };
}

function fromFirestoreRecipe(data: Record<string, unknown>): Recipe {
  return {
    id: String(data.id || ''),
    title: String(data.title || ''),
    description: String(data.description || ''),
    cuisine: String(data.cuisine || '한식'),
    cookingTimeMinutes: typeof data.cookingTimeMinutes === 'number' ? data.cookingTimeMinutes : 15,
    difficulty: String(data.difficulty || '쉬움'),
    requiredIngredients: Array.isArray(data.requiredIngredients)
      ? (data.requiredIngredients as string[])
      : [],
    ownedIngredients: Array.isArray(data.ownedIngredients)
      ? (data.ownedIngredients as Recipe['ownedIngredients'])
      : [],
    missingIngredients: Array.isArray(data.missingIngredients)
      ? (data.missingIngredients as Recipe['missingIngredients'])
      : [],
    basicSeasonings: Array.isArray(data.basicSeasonings) ? (data.basicSeasonings as string[]) : [],
    steps: Array.isArray(data.steps) ? (data.steps as string[]) : [],
    recommendationReason: String(data.recommendationReason || ''),
    safetyAndAllergyNote: String(data.safetyAndAllergyNote || ''),
    isStarterPreview: Boolean(data.isStarterPreview),
    createdAt: String(data.clientCreatedAt || new Date().toISOString()),
  };
}

function fromFirestoreShopping(data: Record<string, unknown>): ShoppingItem {
  const pref = String(data.preferredStore || '');
  return {
    id: String(data.id || ''),
    name: String(data.name || ''),
    category: sanitizeCategory(data.category),
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    unit: String(data.unit || '개'),
    estimatedPrice: typeof data.estimatedPrice === 'number' ? data.estimatedPrice : 0,
    checked: Boolean(data.checked),
    preferredStore: pref ? (pref as OnlineMallId) : undefined,
    sourceRecipeTitle: data.sourceRecipeTitle ? String(data.sourceRecipeTitle) : undefined,
    isSample: Boolean(data.isSample),
    createdAt: String(data.clientCreatedAt || new Date().toISOString()),
  };
}

function fromFirestoreExpense(data: Record<string, unknown>): ExpenseRecord {
  return {
    id: String(data.id || ''),
    date: sanitizeDateString(data.date),
    month: sanitizeMonthString(data.month),
    itemName: String(data.itemName || ''),
    category: sanitizeCategory(data.category),
    amount: typeof data.amount === 'number' ? data.amount : 0,
    memo: data.memo ? String(data.memo) : undefined,
    isSample: Boolean(data.isSample),
  };
}

function fromFirestoreWaste(data: Record<string, unknown>): WasteRecord {
  return {
    id: String(data.id || ''),
    date: sanitizeDateString(data.date),
    month: sanitizeMonthString(data.month),
    itemName: String(data.itemName || ''),
    category: sanitizeCategory(data.category),
    wastedAmount: typeof data.wastedAmount === 'number' ? data.wastedAmount : 0,
    reason: String(data.reason || ''),
    isSample: Boolean(data.isSample),
  };
}

function fromFirestoreUsage(data: Record<string, unknown>): RecipeUsageRecord {
  return {
    id: String(data.id || ''),
    date: sanitizeDateString(data.date),
    month: sanitizeMonthString(data.month),
    recipeTitle: String(data.recipeTitle || ''),
    usedIngredients: Array.isArray(data.usedIngredients) ? (data.usedIngredients as string[]) : [],
    savedAmount: typeof data.savedAmount === 'number' ? data.savedAmount : 0,
    memo: data.memo ? String(data.memo) : undefined,
    isSample: Boolean(data.isSample),
  };
}

function fromFirestoreSummary(data: Record<string, unknown>): MonthlyAiSummary {
  return {
    month: sanitizeMonthString(data.month),
    headline: String(data.headline || ''),
    summaryParagraph: String(data.summaryParagraph || ''),
    actionTips: Array.isArray(data.actionTips) ? (data.actionTips as string[]) : [],
    generatedAt: String(data.generatedAt || new Date().toISOString()),
  };
}

function fromFirestoreStoreRec(data: Record<string, unknown>): AiStoreRecommendation {
  return {
    primaryRecommendedMall: String(data.primaryRecommendedMall || ''),
    overallStrategy: String(data.overallStrategy || ''),
    bundleShippingTip: String(data.bundleShippingTip || ''),
    itemGuides: Array.isArray(data.itemGuides)
      ? (data.itemGuides as AiStoreRecommendation['itemGuides'])
      : [],
    sources: Array.isArray(data.sources) ? (data.sources as AiStoreRecommendation['sources']) : [],
    priceDisclaimer: String(data.priceDisclaimer || ''),
    generatedAt: String(data.generatedAt || new Date().toISOString()),
  };
}

function fromFirestoreLifecycleEvent(data: Record<string, unknown>): IngredientLifecycleEvent {
  const act = data.action;
  return {
    id: String(data.id || ''),
    date: sanitizeDateString(data.date),
    month: sanitizeMonthString(data.month),
    action:
      act === 'registered' || act === 'consumed' || act === 'wasted' ? act : 'registered',
    itemName: String(data.itemName || '식재료'),
    category: sanitizeCategory(data.category),
    storage: sanitizeStorage(data.storage),
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    unit: String(data.unit || '개'),
    amountKRW: typeof data.amountKRW === 'number' ? data.amountKRW : 0,
    daysHeld: typeof data.daysHeld === 'number' ? data.daysHeld : 0,
    daysFromExpiry: typeof data.daysFromExpiry === 'number' ? data.daysFromExpiry : 0,
    causeTag: String(data.causeTag || ''),
    note: String(data.note || ''),
    isSample: Boolean(data.isSample),
  };
}

function fromFirestoreWasteAnalysis(data: Record<string, unknown>): WasteCauseAnalysis {
  return {
    month: sanitizeMonthString(data.month),
    diagnosisHeadline: String(data.diagnosisHeadline || ''),
    primaryCauseSummary: String(data.primaryCauseSummary || ''),
    detectedPatterns: Array.isArray(data.detectedPatterns)
      ? (data.detectedPatterns as WasteCauseAnalysis['detectedPatterns'])
      : [],
    tailoredSolutions: Array.isArray(data.tailoredSolutions)
      ? (data.tailoredSolutions as WasteCauseAnalysis['tailoredSolutions'])
      : [],
    recommendedBuyingRule: String(data.recommendedBuyingRule || ''),
    analyzedEventCount: typeof data.analyzedEventCount === 'number' ? data.analyzedEventCount : 0,
    generatedAt: String(data.generatedAt || new Date().toISOString()),
  };
}

function fromFirestoreMissionGame(
  data: Record<string, unknown>,
  fallbackIngredients: Ingredient[] = [],
  fallbackWastes: WasteRecord[] = []
): MissionGameState {
  const roundNum =
    typeof data.roundNumber === 'number' && data.roundNumber >= 1 ? data.roundNumber : 1;
  const missionsRaw = Array.isArray(data.activeMissions) ? data.activeMissions : [];
  const parsedMissions: FridgeMission[] = missionsRaw.map((m: Record<string, unknown>, i) => ({
    id: String(m.id || `msn-${i}`),
    kind: (typeof m.kind === 'string' ? m.kind : 'urgent_rescue') as MissionKind,
    title: String(m.title || '냉파 미션'),
    description: String(m.description || ''),
    targetItemName: String(m.targetItemName || ''),
    targetCategory: String(m.targetCategory || ''),
    requiredCount: typeof m.requiredCount === 'number' ? m.requiredCount : 1,
    currentCount: typeof m.currentCount === 'number' ? m.currentCount : 0,
    points: typeof m.points === 'number' ? m.points : 35,
    completed: Boolean(m.completed),
  }));

  const logsRaw = Array.isArray(data.recentLogs) ? data.recentLogs : [];
  const parsedLogs: MissionLogEntry[] = logsRaw.map((l: Record<string, unknown>, i) => ({
    id: String(l.id || `mlog-${i}`),
    title: String(l.title || ''),
    pointsEarned: typeof l.pointsEarned === 'number' ? l.pointsEarned : 35,
    completedAt: String(l.completedAt || new Date().toISOString()),
  }));

  return {
    totalPoints: typeof data.totalPoints === 'number' ? data.totalPoints : 0,
    completedRounds: typeof data.completedRounds === 'number' ? data.completedRounds : 0,
    completedMissionsCount:
      typeof data.completedMissionsCount === 'number' ? data.completedMissionsCount : 0,
    roundNumber: roundNum,
    roundBonusClaimed: Boolean(data.roundBonusClaimed),
    activeMissions:
      parsedMissions.length > 0
        ? parsedMissions
        : buildPersonalizedMissionRound(fallbackIngredients, fallbackWastes, roundNum),
    recentLogs: parsedLogs,
  };
}

// ============================================================================
// Bootstrap & Initial Local-to-Cloud Migration
// ============================================================================

export function hasAnyLocalContent(state: FridgePagoState): boolean {
  return (
    state.ingredients.length > 0 ||
    state.recommendedRecipes.length > 0 ||
    state.shoppingList.length > 0 ||
    state.expenses.length > 0 ||
    state.wastes.length > 0 ||
    state.recipeUsages.length > 0 ||
    Object.keys(state.monthlyAiSummaries).length > 0 ||
    Boolean(state.storeRecommendation) ||
    state.lifecycleEvents.length > 0 ||
    Object.keys(state.wasteAnalyses).length > 0 ||
    state.missionGame.totalPoints > 0 ||
    state.missionGame.completedMissionsCount > 0
  );
}

export async function uploadFullStateToFirestore(
  uid: string,
  state: FridgePagoState
): Promise<void> {
  // Ensure Master Gate parent profile exists first
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);
  let profileExists = false;
  try {
    const snap = await getDoc(userRef);
    profileExists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const profileData = toProfileBase(uid, state.profile);
  try {
    if (!profileExists) {
      await setDoc(userRef, {
        ...profileData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        nickname: profileData.nickname,
        householdLabel: profileData.householdLabel,
        monthlyBudget: profileData.monthlyBudget,
        allergiesAndDislikes: profileData.allergiesAndDislikes,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      profileExists ? OperationType.UPDATE : OperationType.CREATE,
      userPath
    );
  }

  // Upload subcollection documents in safe chunks (<= 400 ops per writeBatch)
  type PendingWrite = { path: string; payload: Record<string, unknown> };
  const writes: PendingWrite[] = [];

  for (const ing of state.ingredients) {
    const base = toIngredientBase(uid, ing);
    writes.push({
      path: `users/${uid}/ingredients/${base.id}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const rec of state.recommendedRecipes) {
    if (rec.isStarterPreview) continue;
    const base = toRecipeBase(uid, rec);
    writes.push({
      path: `users/${uid}/recipes/${base.id}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const shop of state.shoppingList) {
    const base = toShoppingBase(uid, shop);
    writes.push({
      path: `users/${uid}/shoppingItems/${base.id}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const exp of state.expenses) {
    const base = toExpenseBase(uid, exp);
    writes.push({
      path: `users/${uid}/expenses/${base.id}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const waste of state.wastes) {
    const base = toWasteBase(uid, waste);
    writes.push({
      path: `users/${uid}/wastes/${base.id}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const usage of state.recipeUsages) {
    const base = toRecipeUsageBase(uid, usage);
    writes.push({
      path: `users/${uid}/recipeUsages/${base.id}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const summary of Object.values(state.monthlyAiSummaries)) {
    const base = toMonthlySummaryBase(uid, summary);
    writes.push({
      path: `users/${uid}/monthlySummaries/${base.month}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  if (state.storeRecommendation) {
    const base = toStoreRecBase(uid, state.storeRecommendation);
    writes.push({
      path: `users/${uid}/storeRecommendations/latest`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const ev of state.lifecycleEvents) {
    const base = toLifecycleEventBase(uid, ev);
    writes.push({
      path: `users/${uid}/lifecycleEvents/${base.id}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const analysis of Object.values(state.wasteAnalyses)) {
    const base = toWasteAnalysisBase(uid, analysis);
    writes.push({
      path: `users/${uid}/wasteAnalyses/${base.month}`,
      payload: { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  const gameBase = toMissionGameBase(uid, state.missionGame);
  writes.push({
    path: `users/${uid}/gameProgress/main`,
    payload: { ...gameBase, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
  });

  for (let i = 0; i < writes.length; i += 350) {
    const slice = writes.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const op of slice) {
      batch.set(doc(db, op.path), op.payload);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, slice[0]?.path ?? userPath);
    }
  }
}

export async function bootstrapUserCloudWorkspace(
  uid: string,
  localState: FridgePagoState,
  displayName?: string | null
): Promise<{ migratedFromLocal: boolean; initialCloudState: FridgePagoState }> {
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  // First-time cloud user: create parent /users/{uid} and migrate any existing browser data
  if (!userSnap.exists()) {
    const seededProfile: UserProfile = {
      ...localState.profile,
      nickname:
        localState.profile.nickname === DEFAULT_PROFILE.nickname && displayName?.trim()
          ? displayName.trim().slice(0, SCHEMA_LIMITS.nicknameMax)
          : localState.profile.nickname,
    };
    const stateToMigrate: FridgePagoState = {
      ...localState,
      profile: seededProfile,
    };
    await uploadFullStateToFirestore(uid, stateToMigrate);
    return {
      migratedFromLocal: hasAnyLocalContent(localState),
      initialCloudState: stateToMigrate,
    };
  }

  // Existing cloud user: load initial snapshot from server
  const localCustomImages = new Map<string, string>();
  for (const item of localState.ingredients) {
    if (item.customImageDataUrl) {
      localCustomImages.set(sanitizeDocId(item.id, 'ing'), item.customImageDataUrl);
    }
  }

  const profileRaw = userSnap.data() as Record<string, unknown>;
  const loadedProfile: UserProfile = {
    nickname: clampString(profileRaw.nickname, SCHEMA_LIMITS.nicknameMax, DEFAULT_PROFILE.nickname),
    householdLabel: clampString(
      profileRaw.householdLabel,
      SCHEMA_LIMITS.householdLabelMax,
      DEFAULT_PROFILE.householdLabel
    ),
    monthlyBudget:
      typeof profileRaw.monthlyBudget === 'number'
        ? profileRaw.monthlyBudget
        : DEFAULT_PROFILE.monthlyBudget,
    allergiesAndDislikes: Array.isArray(profileRaw.allergiesAndDislikes)
      ? (profileRaw.allergiesAndDislikes as string[])
      : [],
  };

  const fetchOwnedSubcollection = async (subName: string) => {
    const subPath = `users/${uid}/${subName}`;
    try {
      const q = query(collection(db, 'users', uid, subName), where('userId', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as Record<string, unknown>);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, subPath);
    }
  };

  const [
    ingDocs,
    recDocs,
    shopDocs,
    expDocs,
    wasteDocs,
    usageDocs,
    summaryDocs,
    storeRecDocs,
    lifecycleDocs,
    wasteAnalysisDocs,
    gameProgressDocs,
  ] = await Promise.all([
    fetchOwnedSubcollection('ingredients'),
    fetchOwnedSubcollection('recipes'),
    fetchOwnedSubcollection('shoppingItems'),
    fetchOwnedSubcollection('expenses'),
    fetchOwnedSubcollection('wastes'),
    fetchOwnedSubcollection('recipeUsages'),
    fetchOwnedSubcollection('monthlySummaries'),
    fetchOwnedSubcollection('storeRecommendations'),
    fetchOwnedSubcollection('lifecycleEvents'),
    fetchOwnedSubcollection('wasteAnalyses'),
    fetchOwnedSubcollection('gameProgress'),
  ]);

  const summariesMap: Record<string, MonthlyAiSummary> = {};
  for (const s of summaryDocs) {
    const parsed = fromFirestoreSummary(s);
    summariesMap[parsed.month] = parsed;
  }

  const wasteAnalysesMap: Record<string, WasteCauseAnalysis> = {};
  for (const wa of wasteAnalysisDocs) {
    const parsed = fromFirestoreWasteAnalysis(wa);
    wasteAnalysesMap[parsed.month] = parsed;
  }

  const loadedIngredients = ingDocs
    .map((d) => fromFirestoreIngredient(d, localCustomImages))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const loadedWastes = wasteDocs
    .map((d) => fromFirestoreWaste(d))
    .sort((a, b) => b.date.localeCompare(a.date));

  const mainGameDoc = gameProgressDocs.find((g) => g.id === 'main') || gameProgressDocs[0];

  const cloudState: FridgePagoState = {
    profile: loadedProfile,
    ingredients: loadedIngredients,
    recommendedRecipes: recDocs
      .map((d) => fromFirestoreRecipe(d))
      .sort((a, b) => a.id.localeCompare(b.id)),
    shoppingList: shopDocs
      .map((d) => fromFirestoreShopping(d))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    expenses: expDocs
      .map((d) => fromFirestoreExpense(d))
      .sort((a, b) => b.date.localeCompare(a.date)),
    wastes: loadedWastes,
    recipeUsages: usageDocs
      .map((d) => fromFirestoreUsage(d))
      .sort((a, b) => b.date.localeCompare(a.date)),
    monthlyAiSummaries: summariesMap,
    storeRecommendation: storeRecDocs[0] ? fromFirestoreStoreRec(storeRecDocs[0]) : null,
    lifecycleEvents: lifecycleDocs
      .map((d) => fromFirestoreLifecycleEvent(d))
      .sort((a, b) => b.date.localeCompare(a.date)),
    wasteAnalyses: wasteAnalysesMap,
    missionGame: mainGameDoc
      ? fromFirestoreMissionGame(mainGameDoc, loadedIngredients, loadedWastes)
      : getDefaultMissionGameState(loadedIngredients, loadedWastes),
  };

  // If existing cloud account has 0 items everywhere, but browser has local items, auto-upload them
  if (!hasAnyLocalContent(cloudState) && hasAnyLocalContent(localState)) {
    const merged: FridgePagoState = {
      ...localState,
      profile: loadedProfile,
    };
    await uploadFullStateToFirestore(uid, merged);
    return {
      migratedFromLocal: true,
      initialCloudState: merged,
    };
  }

  return {
    migratedFromLocal: false,
    initialCloudState: cloudState,
  };
}

// ============================================================================
// Real-Time Listeners (onSnapshot)
// ============================================================================

export function subscribeToCloudWorkspace(
  uid: string,
  getLocalCustomImages: () => Map<string, string>,
  onSliceUpdate: (updater: (prev: FridgePagoState) => FridgePagoState) => void,
  onSyncError: (err: unknown) => void
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  const profilePath = `users/${uid}`;
  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const nextProfile: UserProfile = {
          nickname: clampString(data.nickname, SCHEMA_LIMITS.nicknameMax, DEFAULT_PROFILE.nickname),
          householdLabel: clampString(
            data.householdLabel,
            SCHEMA_LIMITS.householdLabelMax,
            DEFAULT_PROFILE.householdLabel
          ),
          monthlyBudget:
            typeof data.monthlyBudget === 'number'
              ? data.monthlyBudget
              : DEFAULT_PROFILE.monthlyBudget,
          allergiesAndDislikes: Array.isArray(data.allergiesAndDislikes)
            ? (data.allergiesAndDislikes as string[])
            : [],
        };
        onSliceUpdate((prev) => ({ ...prev, profile: nextProfile }));
      },
      (err) => {
        onSyncError(err);
        handleFirestoreError(err, OperationType.GET, profilePath);
      }
    )
  );

  const watchSubcollection = (
    subName: string,
    applyDocs: (docs: Array<Record<string, unknown>>) => void
  ) => {
    const path = `users/${uid}/${subName}`;
    const q = query(collection(db, 'users', uid, subName), where('userId', '==', uid));
    unsubs.push(
      onSnapshot(
        q,
        (snap) => {
          applyDocs(snap.docs.map((d) => d.data() as Record<string, unknown>));
        },
        (err) => {
          onSyncError(err);
          handleFirestoreError(err, OperationType.LIST, path);
        }
      )
    );
  };

  watchSubcollection('ingredients', (docs) => {
    const imgMap = getLocalCustomImages();
    const list = docs
      .map((d) => fromFirestoreIngredient(d, imgMap))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    onSliceUpdate((prev) => ({ ...prev, ingredients: list }));
  });

  watchSubcollection('recipes', (docs) => {
    const list = docs
      .map((d) => fromFirestoreRecipe(d))
      .sort((a, b) => a.id.localeCompare(b.id));
    onSliceUpdate((prev) => ({ ...prev, recommendedRecipes: list }));
  });

  watchSubcollection('shoppingItems', (docs) => {
    const list = docs
      .map((d) => fromFirestoreShopping(d))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    onSliceUpdate((prev) => ({ ...prev, shoppingList: list }));
  });

  watchSubcollection('expenses', (docs) => {
    const list = docs
      .map((d) => fromFirestoreExpense(d))
      .sort((a, b) => b.date.localeCompare(a.date));
    onSliceUpdate((prev) => ({ ...prev, expenses: list }));
  });

  watchSubcollection('wastes', (docs) => {
    const list = docs
      .map((d) => fromFirestoreWaste(d))
      .sort((a, b) => b.date.localeCompare(a.date));
    onSliceUpdate((prev) => ({ ...prev, wastes: list }));
  });

  watchSubcollection('recipeUsages', (docs) => {
    const list = docs
      .map((d) => fromFirestoreUsage(d))
      .sort((a, b) => b.date.localeCompare(a.date));
    onSliceUpdate((prev) => ({ ...prev, recipeUsages: list }));
  });

  watchSubcollection('monthlySummaries', (docs) => {
    const map: Record<string, MonthlyAiSummary> = {};
    for (const d of docs) {
      const parsed = fromFirestoreSummary(d);
      map[parsed.month] = parsed;
    }
    onSliceUpdate((prev) => ({ ...prev, monthlyAiSummaries: map }));
  });

  watchSubcollection('storeRecommendations', (docs) => {
    const latest = docs[0] ? fromFirestoreStoreRec(docs[0]) : null;
    onSliceUpdate((prev) => ({ ...prev, storeRecommendation: latest }));
  });

  watchSubcollection('lifecycleEvents', (docs) => {
    const list = docs
      .map((d) => fromFirestoreLifecycleEvent(d))
      .sort((a, b) => b.date.localeCompare(a.date));
    onSliceUpdate((prev) => ({ ...prev, lifecycleEvents: list }));
  });

  watchSubcollection('wasteAnalyses', (docs) => {
    const map: Record<string, WasteCauseAnalysis> = {};
    for (const d of docs) {
      const parsed = fromFirestoreWasteAnalysis(d);
      map[parsed.month] = parsed;
    }
    onSliceUpdate((prev) => ({ ...prev, wasteAnalyses: map }));
  });

  watchSubcollection('gameProgress', (docs) => {
    const mainDoc = docs.find((d) => d.id === 'main') || docs[0];
    if (!mainDoc) return;
    onSliceUpdate((prev) => ({
      ...prev,
      missionGame: fromFirestoreMissionGame(mainDoc, prev.ingredients, prev.wastes),
    }));
  });

  return () => {
    for (const u of unsubs) {
      u();
    }
  };
}

// ============================================================================
// Deterministic State-Diff Reconciler (Client State -> Firestore Mutations)
// ============================================================================

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function reconcileStateToFirestore(
  uid: string,
  prev: FridgePagoState,
  next: FridgePagoState
): Promise<void> {
  // 1. Profile
  const prevProfile = toProfileBase(uid, prev.profile);
  const nextProfile = toProfileBase(uid, next.profile);
  if (!jsonEqual(prevProfile, nextProfile)) {
    const userPath = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), {
        nickname: nextProfile.nickname,
        householdLabel: nextProfile.householdLabel,
        monthlyBudget: nextProfile.monthlyBudget,
        allergiesAndDislikes: nextProfile.allergiesAndDislikes,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }
  }

  // 2. Ingredients
  const prevIngMap = new Map(
    prev.ingredients.map((i) => {
      const b = toIngredientBase(uid, i);
      return [b.id, b] as const;
    })
  );
  const nextIngMap = new Map(
    next.ingredients.map((i) => {
      const b = toIngredientBase(uid, i);
      return [b.id, b] as const;
    })
  );

  for (const [id, nextItem] of nextIngMap) {
    const path = `users/${uid}/ingredients/${id}`;
    const prevItem = prevIngMap.get(id);
    if (!prevItem) {
      try {
        await setDoc(doc(db, 'users', uid, 'ingredients', id), {
          ...nextItem,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    } else if (!jsonEqual(prevItem, nextItem)) {
      try {
        await updateDoc(doc(db, 'users', uid, 'ingredients', id), {
          name: nextItem.name,
          category: nextItem.category,
          quantity: nextItem.quantity,
          unit: nextItem.unit,
          storage: nextItem.storage,
          purchaseDate: nextItem.purchaseDate,
          expiryDate: nextItem.expiryDate,
          hasPurchasePrice: nextItem.hasPurchasePrice,
          purchasePrice: nextItem.purchasePrice,
          memo: nextItem.memo,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const [id] of prevIngMap) {
    if (!nextIngMap.has(id)) {
      const path = `users/${uid}/ingredients/${id}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'ingredients', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 3. Recommended Recipes (non-starter-preview only)
  const prevRecMap = new Map(
    prev.recommendedRecipes
      .filter((r) => !r.isStarterPreview)
      .map((r) => {
        const b = toRecipeBase(uid, r);
        return [b.id, b] as const;
      })
  );
  const nextRecMap = new Map(
    next.recommendedRecipes
      .filter((r) => !r.isStarterPreview)
      .map((r) => {
        const b = toRecipeBase(uid, r);
        return [b.id, b] as const;
      })
  );

  for (const [id, nextRec] of nextRecMap) {
    const path = `users/${uid}/recipes/${id}`;
    const prevRec = prevRecMap.get(id);
    if (!prevRec) {
      try {
        await setDoc(doc(db, 'users', uid, 'recipes', id), {
          ...nextRec,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    } else if (!jsonEqual(prevRec, nextRec)) {
      try {
        await updateDoc(doc(db, 'users', uid, 'recipes', id), {
          title: nextRec.title,
          description: nextRec.description,
          cuisine: nextRec.cuisine,
          cookingTimeMinutes: nextRec.cookingTimeMinutes,
          difficulty: nextRec.difficulty,
          requiredIngredients: nextRec.requiredIngredients,
          ownedIngredients: nextRec.ownedIngredients,
          missingIngredients: nextRec.missingIngredients,
          basicSeasonings: nextRec.basicSeasonings,
          steps: nextRec.steps,
          recommendationReason: nextRec.recommendationReason,
          safetyAndAllergyNote: nextRec.safetyAndAllergyNote,
          isStarterPreview: nextRec.isStarterPreview,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const [id] of prevRecMap) {
    if (!nextRecMap.has(id)) {
      const path = `users/${uid}/recipes/${id}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'recipes', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 4. Shopping List
  const prevShopMap = new Map(
    prev.shoppingList.map((s) => {
      const b = toShoppingBase(uid, s);
      return [b.id, b] as const;
    })
  );
  const nextShopMap = new Map(
    next.shoppingList.map((s) => {
      const b = toShoppingBase(uid, s);
      return [b.id, b] as const;
    })
  );

  for (const [id, nextShop] of nextShopMap) {
    const path = `users/${uid}/shoppingItems/${id}`;
    const prevShop = prevShopMap.get(id);
    if (!prevShop) {
      try {
        await setDoc(doc(db, 'users', uid, 'shoppingItems', id), {
          ...nextShop,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    } else if (!jsonEqual(prevShop, nextShop)) {
      const onlyCheckedChanged =
        prevShop.checked !== nextShop.checked &&
        prevShop.name === nextShop.name &&
        prevShop.category === nextShop.category &&
        prevShop.quantity === nextShop.quantity &&
        prevShop.unit === nextShop.unit &&
        prevShop.estimatedPrice === nextShop.estimatedPrice &&
        prevShop.preferredStore === nextShop.preferredStore &&
        prevShop.sourceRecipeTitle === nextShop.sourceRecipeTitle;

      try {
        if (onlyCheckedChanged) {
          await updateDoc(doc(db, 'users', uid, 'shoppingItems', id), {
            checked: nextShop.checked,
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(doc(db, 'users', uid, 'shoppingItems', id), {
            name: nextShop.name,
            category: nextShop.category,
            quantity: nextShop.quantity,
            unit: nextShop.unit,
            estimatedPrice: nextShop.estimatedPrice,
            checked: nextShop.checked,
            preferredStore: nextShop.preferredStore,
            sourceRecipeTitle: nextShop.sourceRecipeTitle,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const [id] of prevShopMap) {
    if (!nextShopMap.has(id)) {
      const path = `users/${uid}/shoppingItems/${id}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'shoppingItems', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 5. Expenses
  const prevExpMap = new Map(
    prev.expenses.map((e) => {
      const b = toExpenseBase(uid, e);
      return [b.id, b] as const;
    })
  );
  const nextExpMap = new Map(
    next.expenses.map((e) => {
      const b = toExpenseBase(uid, e);
      return [b.id, b] as const;
    })
  );

  for (const [id, nextExp] of nextExpMap) {
    const path = `users/${uid}/expenses/${id}`;
    const prevExp = prevExpMap.get(id);
    if (!prevExp) {
      try {
        await setDoc(doc(db, 'users', uid, 'expenses', id), {
          ...nextExp,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    } else if (!jsonEqual(prevExp, nextExp)) {
      try {
        await updateDoc(doc(db, 'users', uid, 'expenses', id), {
          date: nextExp.date,
          month: nextExp.month,
          itemName: nextExp.itemName,
          category: nextExp.category,
          amount: nextExp.amount,
          memo: nextExp.memo,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const [id] of prevExpMap) {
    if (!nextExpMap.has(id)) {
      const path = `users/${uid}/expenses/${id}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'expenses', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 6. Wastes
  const prevWasteMap = new Map(
    prev.wastes.map((w) => {
      const b = toWasteBase(uid, w);
      return [b.id, b] as const;
    })
  );
  const nextWasteMap = new Map(
    next.wastes.map((w) => {
      const b = toWasteBase(uid, w);
      return [b.id, b] as const;
    })
  );

  for (const [id, nextWaste] of nextWasteMap) {
    const path = `users/${uid}/wastes/${id}`;
    const prevWaste = prevWasteMap.get(id);
    if (!prevWaste) {
      try {
        await setDoc(doc(db, 'users', uid, 'wastes', id), {
          ...nextWaste,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    } else if (!jsonEqual(prevWaste, nextWaste)) {
      try {
        await updateDoc(doc(db, 'users', uid, 'wastes', id), {
          date: nextWaste.date,
          month: nextWaste.month,
          itemName: nextWaste.itemName,
          category: nextWaste.category,
          wastedAmount: nextWaste.wastedAmount,
          reason: nextWaste.reason,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const [id] of prevWasteMap) {
    if (!nextWasteMap.has(id)) {
      const path = `users/${uid}/wastes/${id}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'wastes', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 7. Recipe Usages
  const prevUsageMap = new Map(
    prev.recipeUsages.map((u) => {
      const b = toRecipeUsageBase(uid, u);
      return [b.id, b] as const;
    })
  );
  const nextUsageMap = new Map(
    next.recipeUsages.map((u) => {
      const b = toRecipeUsageBase(uid, u);
      return [b.id, b] as const;
    })
  );

  for (const [id, nextUsage] of nextUsageMap) {
    const path = `users/${uid}/recipeUsages/${id}`;
    const prevUsage = prevUsageMap.get(id);
    if (!prevUsage) {
      try {
        await setDoc(doc(db, 'users', uid, 'recipeUsages', id), {
          ...nextUsage,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    } else if (!jsonEqual(prevUsage, nextUsage)) {
      try {
        await updateDoc(doc(db, 'users', uid, 'recipeUsages', id), {
          date: nextUsage.date,
          month: nextUsage.month,
          recipeTitle: nextUsage.recipeTitle,
          usedIngredients: nextUsage.usedIngredients,
          savedAmount: nextUsage.savedAmount,
          memo: nextUsage.memo,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const [id] of prevUsageMap) {
    if (!nextUsageMap.has(id)) {
      const path = `users/${uid}/recipeUsages/${id}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'recipeUsages', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 8. Monthly AI Summaries
  const prevSummaries = prev.monthlyAiSummaries || {};
  const nextSummaries = next.monthlyAiSummaries || {};

  for (const [monthKey, sumVal] of Object.entries(nextSummaries)) {
    const nextSum = toMonthlySummaryBase(uid, sumVal);
    const prevSumVal = prevSummaries[monthKey];
    const prevSum = prevSumVal ? toMonthlySummaryBase(uid, prevSumVal) : null;
    const path = `users/${uid}/monthlySummaries/${nextSum.month}`;
    const ref = doc(db, 'users', uid, 'monthlySummaries', nextSum.month);

    if (!prevSum) {
      let existsOnServer = false;
      try {
        const snap = await getDoc(ref);
        existsOnServer = snap.exists();
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }

      try {
        if (!existsOnServer) {
          await setDoc(ref, {
            ...nextSum,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, {
            headline: nextSum.headline,
            summaryParagraph: nextSum.summaryParagraph,
            actionTips: nextSum.actionTips,
            generatedAt: nextSum.generatedAt,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(
          error,
          existsOnServer ? OperationType.UPDATE : OperationType.CREATE,
          path
        );
      }
    } else if (!jsonEqual(prevSum, nextSum)) {
      try {
        await updateDoc(ref, {
          headline: nextSum.headline,
          summaryParagraph: nextSum.summaryParagraph,
          actionTips: nextSum.actionTips,
          generatedAt: nextSum.generatedAt,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const monthKey of Object.keys(prevSummaries)) {
    if (!nextSummaries[monthKey]) {
      const cleanMonth = sanitizeMonthString(monthKey);
      const path = `users/${uid}/monthlySummaries/${cleanMonth}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'monthlySummaries', cleanMonth));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 9. Store Recommendation ('latest')
  const prevRecDoc = prev.storeRecommendation ? toStoreRecBase(uid, prev.storeRecommendation) : null;
  const nextRecDoc = next.storeRecommendation ? toStoreRecBase(uid, next.storeRecommendation) : null;
  const storePath = `users/${uid}/storeRecommendations/latest`;
  const storeRef = doc(db, 'users', uid, 'storeRecommendations', 'latest');

  if (nextRecDoc && !prevRecDoc) {
    let existsOnServer = false;
    try {
      const snap = await getDoc(storeRef);
      existsOnServer = snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, storePath);
    }

    try {
      if (!existsOnServer) {
        await setDoc(storeRef, {
          ...nextRecDoc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(storeRef, {
          primaryRecommendedMall: nextRecDoc.primaryRecommendedMall,
          overallStrategy: nextRecDoc.overallStrategy,
          bundleShippingTip: nextRecDoc.bundleShippingTip,
          itemGuides: nextRecDoc.itemGuides,
          sources: nextRecDoc.sources,
          priceDisclaimer: nextRecDoc.priceDisclaimer,
          generatedAt: nextRecDoc.generatedAt,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        existsOnServer ? OperationType.UPDATE : OperationType.CREATE,
        storePath
      );
    }
  } else if (nextRecDoc && prevRecDoc && !jsonEqual(prevRecDoc, nextRecDoc)) {
    try {
      await updateDoc(storeRef, {
        primaryRecommendedMall: nextRecDoc.primaryRecommendedMall,
        overallStrategy: nextRecDoc.overallStrategy,
        bundleShippingTip: nextRecDoc.bundleShippingTip,
        itemGuides: nextRecDoc.itemGuides,
        sources: nextRecDoc.sources,
        priceDisclaimer: nextRecDoc.priceDisclaimer,
        generatedAt: nextRecDoc.generatedAt,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, storePath);
    }
  } else if (!nextRecDoc && prevRecDoc) {
    try {
      await deleteDoc(storeRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, storePath);
    }
  }

  // 10. Lifecycle Events
  const prevLcMap = new Map(
    (prev.lifecycleEvents || []).map((ev) => {
      const b = toLifecycleEventBase(uid, ev);
      return [b.id, b] as const;
    })
  );
  const nextLcMap = new Map(
    (next.lifecycleEvents || []).map((ev) => {
      const b = toLifecycleEventBase(uid, ev);
      return [b.id, b] as const;
    })
  );

  for (const [id, nextLc] of nextLcMap) {
    const path = `users/${uid}/lifecycleEvents/${id}`;
    const prevLc = prevLcMap.get(id);
    if (!prevLc) {
      try {
        await setDoc(doc(db, 'users', uid, 'lifecycleEvents', id), {
          ...nextLc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    } else if (!jsonEqual(prevLc, nextLc)) {
      try {
        await updateDoc(doc(db, 'users', uid, 'lifecycleEvents', id), {
          causeTag: nextLc.causeTag,
          note: nextLc.note,
          amountKRW: nextLc.amountKRW,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const [id] of prevLcMap) {
    if (!nextLcMap.has(id)) {
      const path = `users/${uid}/lifecycleEvents/${id}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'lifecycleEvents', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 11. Waste Cause Analyses
  const prevWaMap = prev.wasteAnalyses || {};
  const nextWaMap = next.wasteAnalyses || {};

  for (const [monthKey, waVal] of Object.entries(nextWaMap)) {
    const nextWa = toWasteAnalysisBase(uid, waVal);
    const prevWaVal = prevWaMap[monthKey];
    const prevWa = prevWaVal ? toWasteAnalysisBase(uid, prevWaVal) : null;
    const path = `users/${uid}/wasteAnalyses/${nextWa.month}`;
    const ref = doc(db, 'users', uid, 'wasteAnalyses', nextWa.month);

    if (!prevWa) {
      let existsOnServer = false;
      try {
        const snap = await getDoc(ref);
        existsOnServer = snap.exists();
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }

      try {
        if (!existsOnServer) {
          await setDoc(ref, {
            ...nextWa,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, {
            diagnosisHeadline: nextWa.diagnosisHeadline,
            primaryCauseSummary: nextWa.primaryCauseSummary,
            detectedPatterns: nextWa.detectedPatterns,
            tailoredSolutions: nextWa.tailoredSolutions,
            recommendedBuyingRule: nextWa.recommendedBuyingRule,
            analyzedEventCount: nextWa.analyzedEventCount,
            generatedAt: nextWa.generatedAt,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(
          error,
          existsOnServer ? OperationType.UPDATE : OperationType.CREATE,
          path
        );
      }
    } else if (!jsonEqual(prevWa, nextWa)) {
      try {
        await updateDoc(ref, {
          diagnosisHeadline: nextWa.diagnosisHeadline,
          primaryCauseSummary: nextWa.primaryCauseSummary,
          detectedPatterns: nextWa.detectedPatterns,
          tailoredSolutions: nextWa.tailoredSolutions,
          recommendedBuyingRule: nextWa.recommendedBuyingRule,
          analyzedEventCount: nextWa.analyzedEventCount,
          generatedAt: nextWa.generatedAt,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  for (const monthKey of Object.keys(prevWaMap)) {
    if (!nextWaMap[monthKey]) {
      const cleanMonth = sanitizeMonthString(monthKey);
      const path = `users/${uid}/wasteAnalyses/${cleanMonth}`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'wasteAnalyses', cleanMonth));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  }

  // 12. Mission Mini-Game Progress ('main')
  const prevGame = toMissionGameBase(uid, prev.missionGame);
  const nextGame = toMissionGameBase(uid, next.missionGame);
  if (!jsonEqual(prevGame, nextGame)) {
    const gamePath = `users/${uid}/gameProgress/main`;
    const gameRef = doc(db, 'users', uid, 'gameProgress', 'main');
    let existsOnServer = false;
    try {
      const snap = await getDoc(gameRef);
      existsOnServer = snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, gamePath);
    }

    try {
      if (!existsOnServer) {
        await setDoc(gameRef, {
          ...nextGame,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(gameRef, {
          totalPoints: nextGame.totalPoints,
          completedRounds: nextGame.completedRounds,
          completedMissionsCount: nextGame.completedMissionsCount,
          roundNumber: nextGame.roundNumber,
          roundBonusClaimed: nextGame.roundBonusClaimed,
          activeMissions: nextGame.activeMissions,
          recentLogs: nextGame.recentLogs,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        existsOnServer ? OperationType.UPDATE : OperationType.CREATE,
        gamePath
      );
    }
  }
}
