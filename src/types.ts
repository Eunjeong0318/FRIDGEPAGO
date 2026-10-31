export type PageId =
  | 'dashboard'
  | 'fridge'
  | 'recipes'
  | 'expiry'
  | 'missions'
  | 'shopping'
  | 'report';

export type IngredientCategory =
  | '채소'
  | '과일'
  | '육류'
  | '해산물'
  | '유제품'
  | '알류'
  | '곡류'
  | '가공식품'
  | '기타';

export const INGREDIENT_CATEGORIES: IngredientCategory[] = [
  '채소',
  '과일',
  '육류',
  '해산물',
  '유제품',
  '알류',
  '곡류',
  '가공식품',
  '기타',
];

export type StorageLocation = '냉장' | '냉동' | '실온';

export const STORAGE_LOCATIONS: StorageLocation[] = ['냉장', '냉동', '실온'];

export type ExpiryStatus = 'urgent' | 'safe' | 'check_needed';

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: string;
  storage: StorageLocation;
  purchaseDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD or ''
  purchasePrice?: number;
  customImageDataUrl?: string;
  memo?: string;
  isSample?: boolean;
  createdAt: string;
}

export interface RecognizedIngredientCandidate {
  id: string;
  selected: boolean;
  name: string;
  estimatedQuantity: number;
  unit: string;
  category: IngredientCategory;
  recommendedStorage: StorageLocation;
  expiryDate: string;
  purchasePrice?: number;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

export type CuisineType = '한식' | '양식' | '중식' | '일식' | '간편식' | '자유 선택';
export type CookingTimeOption = '10분' | '20분' | '30분' | '제한 없음';
export type DifficultyLevel = '쉬움' | '보통' | '어려움';
export type ChefSecretMode = 'none' | 'onepan' | 'omakase';

export interface RecipeOwnedIngredient {
  name: string;
  amount: string;
}

export interface RecipeMissingIngredient {
  name: string;
  amount: string;
  category: IngredientCategory;
  estimatedPrice: number;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  cookingTimeMinutes: number;
  difficulty: DifficultyLevel | string;
  requiredIngredients: string[];
  ownedIngredients: RecipeOwnedIngredient[];
  missingIngredients: RecipeMissingIngredient[];
  basicSeasonings: string[];
  steps: string[];
  recommendationReason: string;
  safetyAndAllergyNote: string;
  isStarterPreview?: boolean;
  createdAt: string;
}

export type OnlineMallId = 'coupang' | 'kurly' | 'oasis' | 'ssg' | 'naver';

export interface ShoppingItem {
  id: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: string;
  estimatedPrice: number;
  checked: boolean;
  preferredStore?: OnlineMallId;
  sourceRecipeTitle?: string;
  isSample?: boolean;
  createdAt: string;
}

export interface AiItemStoreGuide {
  itemName: string;
  bestStore: string;
  reason: string;
  searchKeyword: string;
  estimatedPriceRange: string;
}

export interface GroundingWebSource {
  title: string;
  uri: string;
}

export interface AiStoreRecommendation {
  primaryRecommendedMall: string;
  overallStrategy: string;
  bundleShippingTip: string;
  itemGuides: AiItemStoreGuide[];
  sources: GroundingWebSource[];
  priceDisclaimer: string;
  generatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  itemName: string;
  category: IngredientCategory;
  amount: number;
  memo?: string;
  isSample?: boolean;
}

export interface WasteRecord {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  itemName: string;
  category: IngredientCategory;
  wastedAmount: number;
  reason: string;
  isSample?: boolean;
}

export interface RecipeUsageRecord {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  recipeTitle: string;
  usedIngredients: string[];
  savedAmount: number;
  memo?: string;
  isSample?: boolean;
}

export interface MonthlyAiSummary {
  month: string;
  headline: string;
  summaryParagraph: string;
  actionTips: string[];
  generatedAt: string;
}

// ============================================================================
// 1-Month Ingredient Lifecycle & Root-Cause Waste Diagnosis Types
// ============================================================================

export type WasteCauseTag =
  | '대용량·묶음 과다구매'
  | '소비기한 미확인·방치'
  | '개봉 후 소분·밀폐 미흡'
  | '보관 방법 부적절'
  | '계획 없는 충동구매'
  | '기타 사유';

export const WASTE_CAUSE_TAGS: WasteCauseTag[] = [
  '대용량·묶음 과다구매',
  '소비기한 미확인·방치',
  '개봉 후 소분·밀폐 미흡',
  '보관 방법 부적절',
  '계획 없는 충동구매',
  '기타 사유',
];

export type LifecycleAction = 'registered' | 'consumed' | 'wasted';

export interface IngredientLifecycleEvent {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  action: LifecycleAction;
  itemName: string;
  category: IngredientCategory;
  storage: StorageLocation;
  quantity: number;
  unit: string;
  amountKRW: number;
  daysHeld: number;
  daysFromExpiry: number;
  causeTag: string; // WasteCauseTag when action === 'wasted', '' otherwise
  note: string;
  isSample?: boolean;
}

export interface WasteDetectedPattern {
  patternTitle: string;
  evidence: string;
  impactKRW: number;
}

export interface WasteTailoredSolution {
  title: string;
  actionStep: string;
  expectedMonthlySavingKRW: number;
}

export interface WasteCauseAnalysis {
  month: string; // YYYY-MM
  diagnosisHeadline: string;
  primaryCauseSummary: string;
  detectedPatterns: WasteDetectedPattern[];
  tailoredSolutions: WasteTailoredSolution[];
  recommendedBuyingRule: string;
  analyzedEventCount: number;
  generatedAt: string;
}

// ============================================================================
// Fridge Mission Mini-Game, Titles (칭호) & Perks (혜택) Types
// ============================================================================

export type FridgeRankId = 'novice' | 'apprentice' | 'expert' | 'master';

export type MissionKind =
  | 'urgent_rescue'
  | 'combo_cook'
  | 'category_focus'
  | 'expiry_audit'
  | 'zero_waste_register';

export interface FridgeMission {
  id: string;
  kind: MissionKind;
  title: string;
  description: string;
  targetItemName: string;
  targetCategory: string;
  requiredCount: number;
  currentCount: number;
  points: number;
  completed: boolean;
}

export interface MissionLogEntry {
  id: string;
  title: string;
  pointsEarned: number;
  completedAt: string;
}

export interface MissionGameState {
  totalPoints: number;
  completedRounds: number;
  completedMissionsCount: number;
  roundNumber: number;
  roundBonusClaimed: boolean;
  activeMissions: FridgeMission[];
  recentLogs: MissionLogEntry[];
}

export interface UserProfile {
  nickname: string;
  householdLabel: string;
  monthlyBudget: number;
  allergiesAndDislikes: string[];
}

export interface FridgePagoState {
  ingredients: Ingredient[];
  recommendedRecipes: Recipe[];
  shoppingList: ShoppingItem[];
  expenses: ExpenseRecord[];
  wastes: WasteRecord[];
  recipeUsages: RecipeUsageRecord[];
  monthlyAiSummaries: Record<string, MonthlyAiSummary>;
  storeRecommendation?: AiStoreRecommendation | null;
  lifecycleEvents: IngredientLifecycleEvent[];
  wasteAnalyses: Record<string, WasteCauseAnalysis>;
  missionGame: MissionGameState;
  profile: UserProfile;
}
