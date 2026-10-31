import {
  AiStoreRecommendation,
  ChefSecretMode,
  CookingTimeOption,
  CuisineType,
  DifficultyLevel,
  FridgeMission,
  IngredientCategory,
  IngredientLifecycleEvent,
  MonthlyAiSummary,
  Recipe,
  StorageLocation,
  WasteCauseAnalysis,
} from '../types';
import { auth } from '../firebase';

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'UNKNOWN_ERROR', status = 500) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

async function buildAuthorizedHeaders(extraHeaders?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extraHeaders);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  try {
    await auth.authStateReady();
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.set('Authorization', `Bearer ${idToken}`);
      }
    }
  } catch {
    // Server will reject unauthenticated calls on protected endpoints with 401
  }
  return headers;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = await buildAuthorizedHeaders(options?.headers);
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiClientError(
      '네트워크 연결이 불안정하여 서버와 통신하지 못했습니다. 인터넷 상태를 확인한 뒤 다시 시도해주세요.',
      'NETWORK_ERROR',
      0
    );
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ApiClientError(
      '서버 응답 데이터를 읽는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      'PARSE_ERROR',
      response.status
    );
  }

  if (!response.ok) {
    const msg =
      typeof payload?.message === 'string'
        ? payload.message
        : 'AI 요청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
    const code = typeof payload?.code === 'string' ? payload.code : 'HTTP_ERROR';
    throw new ApiClientError(msg, code, response.status);
  }

  return payload as T;
}

export interface AiServiceStatus {
  configured: boolean;
  authorized: boolean;
  ownerOnly?: boolean;
}

export async function fetchAiStatus(): Promise<AiServiceStatus> {
  try {
    return await requestJson<AiServiceStatus>('/api/ai/status', { method: 'GET' });
  } catch {
    return { configured: false, authorized: false, ownerOnly: true };
  }
}

export interface RecognizeIngredientsResponse {
  items: Array<{
    name: string;
    estimatedQuantity: number;
    unit: string;
    category: IngredientCategory;
    recommendedStorage: StorageLocation;
    confidence: 'high' | 'medium' | 'low';
    note: string;
  }>;
  safetyNotice: string;
}

export async function recognizeIngredientsFromPhoto(
  imageBase64: string,
  mimeType: string
): Promise<RecognizeIngredientsResponse> {
  return requestJson<RecognizeIngredientsResponse>('/api/ai/recognize-ingredients', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mimeType }),
  });
}

export interface RecommendRecipesPayload {
  ingredients: Array<{
    name: string;
    quantity: number;
    unit: string;
    category: string;
    storage: string;
    expiryDate: string;
    daysRemaining: number | null;
  }>;
  mustUseIngredients: string[];
  cuisine: CuisineType;
  cookingTime: CookingTimeOption;
  difficulty: DifficultyLevel;
  minimizeExtraShopping: boolean;
  allergiesAndDislikes: string[];
  chefSecretMode?: ChefSecretMode;
}

export async function recommendRecipesViaAi(
  payload: RecommendRecipesPayload
): Promise<{ recipes: Recipe[] }> {
  return requestJson<{ recipes: Recipe[] }>('/api/ai/recommend-recipes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface MonthlySummaryPayload {
  targetMonth: string;
  currentMonthStats: {
    purchaseTotal: number;
    wasteTotal: number;
    savedAmount: number;
    cookedCount: number;
    purchaseCount: number;
    wasteCount: number;
    categoryBreakdown: Array<{ category: string; amount: number }>;
  };
  previousMonthStats: {
    purchaseTotal: number;
    wasteTotal: number;
    savedAmount: number;
    cookedCount: number;
  };
}

export async function generateMonthlyAiSummary(
  payload: MonthlySummaryPayload
): Promise<Omit<MonthlyAiSummary, 'month' | 'generatedAt'>> {
  return requestJson<Omit<MonthlyAiSummary, 'month' | 'generatedAt'>>('/api/ai/monthly-summary', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface RecommendStoresPayload {
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    category: string;
    estimatedPrice: number;
  }>;
  hasWowMembership: boolean;
  hasKurlyMembers: boolean;
}

export async function recommendOnlineStores(
  payload: RecommendStoresPayload
): Promise<AiStoreRecommendation> {
  return requestJson<AiStoreRecommendation>('/api/ai/recommend-stores', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface AnalyzeWasteCausesPayload {
  targetMonth: string;
  trackingSpanDays: number;
  lifecycleSummary: {
    registeredCount: number;
    consumedCount: number;
    wastedCount: number;
    consumptionRatePct: number;
    wasteRatePct: number;
    totalWastedKRW: number;
    avgDaysHeldBeforeWaste: number;
    topCauses: Array<{ causeTag: string; count: number; amountKRW: number }>;
  };
  events: IngredientLifecycleEvent[];
}

export async function analyzeWasteCausesViaAi(
  payload: AnalyzeWasteCausesPayload
): Promise<Omit<WasteCauseAnalysis, 'month'>> {
  return requestJson<Omit<WasteCauseAnalysis, 'month'>>('/api/ai/analyze-waste-causes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface GenerateAiMissionsPayload {
  ingredients: Array<{
    name: string;
    quantity: number;
    unit: string;
    category: string;
    storage: string;
    daysRemaining: number | null;
  }>;
  topWasteCauses: string[];
  rankTitle: string;
}

export async function generatePersonalizedMissionsViaAi(
  payload: GenerateAiMissionsPayload
): Promise<{ missions: FridgeMission[] }> {
  return requestJson<{ missions: FridgeMission[] }>('/api/ai/generate-missions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
