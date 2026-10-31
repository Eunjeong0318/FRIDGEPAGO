import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChefHat,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trophy,
  X,
} from 'lucide-react';
import {
  ChefSecretMode,
  CookingTimeOption,
  CuisineType,
  DifficultyLevel,
  Ingredient,
  PageId,
  Recipe,
  RecipeMissingIngredient,
} from '../types';
import { recommendRecipesViaAi } from '../utils/api';
import { evaluateExpiry, sortIngredientsByPriority } from '../utils/dateUtils';
import { getRankByPoints } from '../utils/gameAndWasteUtils';
import { getRecipeImage } from '../utils/visualAssets';
import { ResilientImage } from '../components/ResilientImage';

interface RecipePageProps {
  ingredients: Ingredient[];
  recipes: Recipe[];
  allergiesAndDislikes: string[];
  totalPoints: number;
  initialSecretMode?: ChefSecretMode;
  onClearInitialSecretMode?: () => void;
  onUpdateAllergies: (next: string[]) => void;
  onSaveGeneratedRecipes: (recipes: Recipe[]) => void;
  onSelectRecipe: (recipe: Recipe) => void;
  onAddMissingToShopping: (items: RecipeMissingIngredient[], recipeTitle: string) => void;
  onNavigate: (page: PageId) => void;
  onLoadSampleData: () => void;
}

const CUISINES: CuisineType[] = ['자유 선택', '한식', '양식', '중식', '일식', '간편식'];
const TIMES: CookingTimeOption[] = ['제한 없음', '10분', '20분', '30분'];
const DIFFICULTIES: DifficultyLevel[] = ['쉬움', '보통', '어려움'];

function matchesLiveInventory(candidateName: string, fridgeItems: Ingredient[]): boolean {
  const normCand = candidateName.replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
  if (!normCand) return false;
  return fridgeItems.some((item) => {
    const normItem = item.name.replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
    return normCand === normItem || normCand.includes(normItem) || normItem.includes(normCand);
  });
}

export const RecipePage: React.FC<RecipePageProps> = ({
  ingredients,
  recipes,
  allergiesAndDislikes,
  totalPoints,
  initialSecretMode,
  onClearInitialSecretMode,
  onUpdateAllergies,
  onSaveGeneratedRecipes,
  onSelectRecipe,
  onAddMissingToShopping,
  onNavigate,
  onLoadSampleData,
}) => {
  const sortedIngredients = useMemo(
    () => sortIngredientsByPriority(ingredients),
    [ingredients]
  );

  const rankInfo = useMemo(() => getRankByPoints(totalPoints), [totalPoints]);
  const isOnepanUnlocked = totalPoints >= 500;
  const isOmakaseUnlocked = totalPoints >= 900;

  const [mustUseNames, setMustUseNames] = useState<string[]>([]);
  const [cuisine, setCuisine] = useState<CuisineType>('자유 선택');
  const [cookingTime, setCookingTime] = useState<CookingTimeOption>('20분');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('쉬움');
  const [minimizeExtraShopping, setMinimizeExtraShopping] = useState<boolean>(true);
  const [chefSecretMode, setChefSecretMode] = useState<ChefSecretMode>(
    initialSecretMode || 'none'
  );
  const [allergyInput, setAllergyInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialSecretMode && initialSecretMode !== 'none') {
      if (initialSecretMode === 'omakase' && isOmakaseUnlocked) {
        setChefSecretMode('omakase');
      } else if (initialSecretMode === 'onepan' && isOnepanUnlocked) {
        setChefSecretMode('onepan');
      }
      onClearInitialSecretMode?.();
    }
  }, [initialSecretMode, isOmakaseUnlocked, isOnepanUnlocked, onClearInitialSecretMode]);

  // Re-verify recipe owned vs missing against current live fridge inventory so unowned items are NEVER shown as owned
  const liveVerifiedRecipes = useMemo(() => {
    return recipes.map((r) => {
      const stillOwned = r.ownedIngredients.filter((o) =>
        matchesLiveInventory(o.name, ingredients)
      );
      const newlyMissing = r.ownedIngredients
        .filter((o) => !matchesLiveInventory(o.name, ingredients))
        .map((o) => ({
          name: o.name,
          amount: o.amount,
          category: '기타' as const,
          estimatedPrice: 2500,
        }));
      const remainingMissing = r.missingIngredients.filter(
        (m) => !matchesLiveInventory(m.name, ingredients)
      );
      const newlyOwnedFromMissing = r.missingIngredients
        .filter((m) => matchesLiveInventory(m.name, ingredients))
        .map((m) => ({ name: m.name, amount: m.amount }));

      return {
        ...r,
        ownedIngredients: [...stillOwned, ...newlyOwnedFromMissing],
        missingIngredients: [...remainingMissing, ...newlyMissing],
      };
    });
  }, [recipes, ingredients]);

  const toggleMustUse = (name: string) => {
    setMustUseNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const handleAddAllergy = () => {
    const clean = allergyInput.trim();
    if (!clean) return;
    if (!allergiesAndDislikes.includes(clean)) {
      onUpdateAllergies([...allergiesAndDislikes, clean]);
    }
    setAllergyInput('');
  };

  const handleRemoveAllergy = (target: string) => {
    onUpdateAllergies(allergiesAndDislikes.filter((a) => a !== target));
  };

  const handleGenerateRecipes = async () => {
    if (ingredients.length === 0) {
      setErrorMsg('냉장고에 등록된 식재료가 없습니다. 식재료를 먼저 추가해주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const effectiveSecretMode: ChefSecretMode =
        chefSecretMode === 'omakase' && isOmakaseUnlocked
          ? 'omakase'
          : chefSecretMode === 'onepan' && isOnepanUnlocked
          ? 'onepan'
          : 'none';

      const payload = {
        ingredients: sortedIngredients.map((item) => {
          const ev = evaluateExpiry(item.expiryDate);
          return {
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            storage: item.storage,
            expiryDate: item.expiryDate,
            daysRemaining: ev.daysRemaining,
          };
        }),
        mustUseIngredients: mustUseNames.filter((n) =>
          ingredients.some((i) => i.name === n)
        ),
        cuisine,
        cookingTime,
        difficulty,
        minimizeExtraShopping,
        allergiesAndDislikes,
        chefSecretMode: effectiveSecretMode,
      };

      const res = await recommendRecipesViaAi(payload);
      onSaveGeneratedRecipes(res.recipes);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'AI 레시피 생성 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-7">
      {/* AI Chef Configuration Studio */}
      <section className="surface-card p-6 sm:p-8 space-y-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#EBF1EC]">
          <div>
            <div className="text-xs font-semibold text-[#164E35]">
              Gemini AI 맞춤 홈키친 셰프
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#122118]">
              보유 재료 기반 맞춤 레시피 추천
            </h2>
            <p className="text-xs sm:text-sm text-[#526559] mt-1">
              냉장고 속 재료와 소비기한 임박 품목을 우선 반영해 바로 조리할 수 있는 메뉴 3가지를 설계합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerateRecipes}
            disabled={loading || ingredients.length === 0}
            className="btn-primary-gradient inline-flex items-center justify-center gap-2 min-h-[46px] px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 셰프가 레시피 작성 중...</span>
              </>
            ) : (
              <>
                <ChefHat className="h-4 w-4" />
                <span>AI 레시피 3선 추천받기</span>
              </>
            )}
          </button>
        </div>

        {/* 01. Owned Ingredients & Must-Use Selection */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-[#122118]">
                01. 우선 활용할 보유 식재료 선택 ({ingredients.length}종)
              </h3>
              <p className="text-xs text-[#64786B] mt-0.5">
                반드시 요리에 포함하고 싶은 재료를 클릭해 선택하세요 (미선택 시 AI가 임박 재료를 자동 배합합니다)
              </p>
            </div>
            {mustUseNames.length > 0 && (
              <button
                type="button"
                onClick={() => setMustUseNames([])}
                className="text-xs font-semibold text-[#164E35] hover:underline whitespace-nowrap shrink-0"
              >
                선택 초기화 ({mustUseNames.length}개 선택됨)
              </button>
            )}
          </div>

          {ingredients.length === 0 ? (
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#EEF3EF]">
              <div className="text-xs sm:text-sm text-[#526559]">
                현재 냉장고에 등록된 식재료가 없습니다. 식재료를 등록하거나 샘플 데이터를 불러오세요.
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('fridge')}
                  className="btn-primary-gradient px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                >
                  식재료 등록하러 가기
                </button>
                <button
                  type="button"
                  onClick={onLoadSampleData}
                  className="btn-secondary-sage px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                >
                  샘플 6종 불러오기
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sortedIngredients.map((item) => {
                const selected = mustUseNames.includes(item.name);
                const ev = evaluateExpiry(item.expiryDate);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleMustUse(item.name)}
                    className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl text-xs transition-all duration-150 whitespace-nowrap shrink-0 ${
                      selected
                        ? 'btn-primary-gradient font-semibold'
                        : 'bg-[#FAFDFB] border border-[#D4E2D8] text-[#22352A] font-medium hover:border-[#164E35] hover:bg-[#F2F7F4]'
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className="tabular-nums">
                      {item.name} ({item.quantity}
                      {item.unit})
                    </span>
                    {ev.status === 'urgent' && (
                      <span
                        className={`font-semibold ${
                          selected ? 'text-[#FDE68A]' : 'text-[#B45309]'
                        }`}
                      >
                        · 임박
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 02. Cuisine, Time, Difficulty Options */}
        <div className="pt-6 border-t border-[#EBF1EC]">
          <h3 className="text-sm font-bold text-[#122118] mb-4">
            02. 희망 요리 스타일 및 난이도 설정
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-xs font-semibold text-[#526559] mb-2">음식 종류</div>
              <div className="flex flex-wrap gap-1.5">
                {CUISINES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCuisine(c)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                      cuisine === c
                        ? 'btn-primary-gradient text-white'
                        : 'bg-[#F2F7F4] text-[#456250] hover:bg-[#E5EFE9] hover:text-[#122118]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#526559] mb-2">희망 조리 시간</div>
              <div className="flex flex-wrap gap-1.5">
                {TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCookingTime(t)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
                      cookingTime === t
                        ? 'btn-primary-gradient text-white'
                        : 'bg-[#F2F7F4] text-[#456250] hover:bg-[#E5EFE9] hover:text-[#122118]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#526559] mb-2">조리 난이도</div>
              <div className="flex flex-wrap gap-1.5">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                      difficulty === d
                        ? 'btn-primary-gradient text-white'
                        : 'bg-[#F2F7F4] text-[#456250] hover:bg-[#E5EFE9] hover:text-[#122118]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 03. Minimize Shopping & Allergy Exclusion */}
        <div className="pt-6 border-t border-[#EBF1EC] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <div className="text-sm font-bold text-[#122118] mb-2">
              03. 장보기 절약 옵션
            </div>
            <label className="inline-flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={minimizeExtraShopping}
                onChange={(e) => setMinimizeExtraShopping(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-[#164E35] shrink-0"
              />
              <div>
                <div className="text-xs sm:text-sm font-semibold text-[#122118]">
                  추가 구매 재료 최소화 모드
                </div>
                <p className="text-xs text-[#526559] mt-0.5 leading-relaxed">
                  현재 냉장고에 있는 식재료와 기본 양념 위주로 조리 가능한 메뉴를 우선 추천합니다.
                </p>
              </div>
            </label>
          </div>

          <div className="lg:col-span-7">
            <label className="block text-sm font-bold text-[#122118] mb-2">
              알레르기 및 기피 식재료 제외{' '}
              <span className="text-xs font-normal text-[#64786B]">
                (AI 추천에서 엄격히 제외됩니다)
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={allergyInput}
                onChange={(e) => setAllergyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAllergy();
                  }
                }}
                placeholder="제외할 재료 입력 후 Enter (예: 새우, 땅콩, 오이)"
                className="flex-1 input-modern px-3.5 py-2.5 text-xs sm:text-sm"
              />
              <button
                type="button"
                onClick={handleAddAllergy}
                className="btn-secondary-sage inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>제외 추가</span>
              </button>
            </div>
            {allergiesAndDislikes.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {allergiesAndDislikes.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleRemoveAllergy(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2] transition-colors whitespace-nowrap"
                  >
                    <span>제외: {item}</span>
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 04. Rank Perk Chef Secret Modes */}
        <div className="pt-6 border-t border-[#EBF1EC] space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#122118]">
                04. 냉파 등급 전용 셰프 시크릿 모드
              </h3>
              <p className="text-xs text-[#64786B] mt-0.5 tabular-nums">
                현재 내 칭호: Lv.{rankInfo.currentRank.level} {rankInfo.currentRank.title} ({totalPoints}점) · 냉파 미션 완료 시 상위 시크릿 모드가 해금됩니다
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('missions')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#164E35] hover:underline whitespace-nowrap shrink-0"
            >
              <Trophy className="h-3.5 w-3.5" />
              <span>냉파 미션으로 점수 모으기</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <button
              type="button"
              onClick={() => setChefSecretMode('none')}
              className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
                chefSecretMode === 'none'
                  ? 'border-[#164E35] bg-[#F1F8F4]'
                  : 'border-[#DCE8E0] bg-white hover:border-[#B6CDBE]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#164E35]">기본 해금 · Lv.1+</span>
                {chefSecretMode === 'none' && <Check className="h-4 w-4 text-[#164E35]" />}
              </div>
              <div className="mt-1.5 text-sm font-bold text-[#122118]">
                표준 냉장고 맞춤 추천
              </div>
              <p className="mt-1 text-xs text-[#526559] leading-relaxed">
                소비기한 임박 재료와 희망 조리 시간·난이도를 균형 있게 반영합니다.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isOnepanUnlocked) {
                  setChefSecretMode('onepan');
                } else {
                  onNavigate('missions');
                }
              }}
              className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
                chefSecretMode === 'onepan' && isOnepanUnlocked
                  ? 'border-[#164E35] bg-[#F1F8F4]'
                  : isOnepanUnlocked
                  ? 'border-[#DCE8E0] bg-white hover:border-[#B6CDBE]'
                  : 'border-[#E5ECE7] bg-[#F8FAF8] hover:border-[#C5D6CA]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 tabular-nums">
                <span
                  className={`text-xs font-bold ${
                    isOnepanUnlocked ? 'text-[#164E35]' : 'text-[#64786B]'
                  }`}
                >
                  냉파 고수 혜택 · 500점+
                </span>
                {isOnepanUnlocked ? (
                  chefSecretMode === 'onepan' && <Check className="h-4 w-4 text-[#164E35]" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-[#64786B]" />
                )}
              </div>
              <div className="mt-1.5 text-sm font-bold text-[#122118]">
                원팬·설거지 최소화 시크릿 모드
              </div>
              <p className="mt-1 text-xs text-[#526559] leading-relaxed">
                {isOnepanUnlocked
                  ? '프라이팬·냄비 단 1개만 사용하는 조리 동선과 자투리 양념 활용 비법을 설계합니다.'
                  : `미션 점수 ${Math.max(0, 500 - totalPoints)}점 추가 획득 시 해금됩니다 (클릭하여 미션 이동)`}
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isOmakaseUnlocked) {
                  setChefSecretMode('omakase');
                } else {
                  onNavigate('missions');
                }
              }}
              className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
                chefSecretMode === 'omakase' && isOmakaseUnlocked
                  ? 'border-[#164E35] bg-[#F1F8F4]'
                  : isOmakaseUnlocked
                  ? 'border-[#DCE8E0] bg-white hover:border-[#B6CDBE]'
                  : 'border-[#E5ECE7] bg-[#F8FAF8] hover:border-[#C5D6CA]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 tabular-nums">
                <span
                  className={`text-xs font-bold ${
                    isOmakaseUnlocked ? 'text-[#164E35]' : 'text-[#64786B]'
                  }`}
                >
                  냉파 마스터 혜택 · 900점+
                </span>
                {isOmakaseUnlocked ? (
                  chefSecretMode === 'omakase' && <Check className="h-4 w-4 text-[#164E35]" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-[#64786B]" />
                )}
              </div>
              <div className="mt-1.5 text-sm font-bold text-[#122118]">
                무지출 냉장고 오마카세 코스
              </div>
              <p className="mt-1 text-xs text-[#526559] leading-relaxed">
                {isOmakaseUnlocked
                  ? '추가 장보기 없이 보유 식재료만으로 애피타이저·메인·사이드 구성을 완성합니다.'
                  : `미션 점수 ${Math.max(0, 900 - totalPoints)}점 추가 획득 시 해금됩니다 (클릭하여 미션 이동)`}
              </p>
            </button>
          </div>
        </div>
      </section>

      {/* Error Banner with Retry Button */}
      {errorMsg && (
        <section className="rounded-[20px] bg-[#FEF2F2] border border-[#FECACA] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs sm:text-sm text-[#B91C1C]">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>{errorMsg}</div>
          </div>
          <button
            type="button"
            onClick={handleGenerateRecipes}
            disabled={loading}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-white border border-[#FCA5A5] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2] whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>다시 시도</span>
          </button>
        </section>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="surface-card overflow-hidden animate-pulse"
            >
              <div className="h-52 bg-[#E9F1EC]" />
              <div className="p-6 space-y-3.5">
                <div className="h-3 w-1/2 bg-[#E9F1EC] rounded" />
                <div className="h-5 w-3/4 bg-[#DCE8DF] rounded" />
                <div className="h-3 w-full bg-[#E9F1EC] rounded" />
                <div className="h-3 w-5/6 bg-[#E9F1EC] rounded" />
                <div className="pt-4 h-10 w-full bg-[#E9F1EC] rounded-xl" />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Recommended 3 Recipe Cards */}
      {!loading && liveVerifiedRecipes.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-[#122118]">
                추천 레시피 결과 ({liveVerifiedRecipes.length}선)
              </h3>
              <p className="text-xs text-[#526559] mt-0.5">
                실제 냉장고 보유 목록과 실시간 대조되어 부족 재료가 명확히 분리됩니다
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {liveVerifiedRecipes.map((recipe) => (
              <article
                key={recipe.id}
                className="surface-card-interactive overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <div className="relative h-52 w-full overflow-hidden bg-[#EEF4F0]">
                    <ResilientImage
                      src={getRecipeImage(recipe)}
                      alt={recipe.title}
                      fallbackLabel={recipe.title}
                      className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <div className="absolute bottom-3.5 left-5 right-5 text-xs font-medium text-white/95 tabular-nums">
                      {recipe.cuisine} · 조리 {recipe.cookingTimeMinutes}분 · 난이도{' '}
                      {recipe.difficulty}
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <h4 className="text-lg sm:text-xl font-bold text-[#122118]">
                        {recipe.title}
                      </h4>
                      <p className="mt-1.5 text-xs sm:text-sm text-[#4A5D51] leading-relaxed">
                        {recipe.description}
                      </p>
                    </div>

                    <div className="pt-3.5 border-t border-[#EBF1EC] space-y-2 text-xs leading-relaxed">
                      <div>
                        <span className="font-semibold text-[#15803D]">
                          보유 재료 ({recipe.ownedIngredients.length}종) ·{' '}
                        </span>
                        <span className="text-[#22352A]">
                          {recipe.ownedIngredients.length > 0
                            ? recipe.ownedIngredients
                                .map((o) => `${o.name}(${o.amount})`)
                                .join(', ')
                            : '일치하는 보유 주재료 없음'}
                        </span>
                      </div>

                      <div>
                        <span className="font-semibold text-[#B45309]">
                          부족한 재료 ({recipe.missingIngredients.length}종) ·{' '}
                        </span>
                        <span className="text-[#4A5D51]">
                          {recipe.missingIngredients.length > 0
                            ? recipe.missingIngredients
                                .map((m) => `${m.name}(${m.amount})`)
                                .join(', ')
                            : '없음 (추가 구매 불필요)'}
                        </span>
                      </div>

                      {recipe.basicSeasonings.length > 0 && (
                        <div className="text-[#64786B]">
                          <span className="font-medium">기본 양념/물 · </span>
                          {recipe.basicSeasonings.join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-[#EBF1EC] text-xs text-[#3D5245] leading-relaxed">
                      <span className="font-bold text-[#164E35]">셰프 추천 포인트 · </span>
                      {recipe.recommendationReason}
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectRecipe(recipe)}
                    className="btn-primary-gradient w-full min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap"
                  >
                    조리 순서 및 상세보기
                  </button>

                  {recipe.missingIngredients.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onAddMissingToShopping(recipe.missingIngredients, recipe.title)
                      }
                      className="btn-secondary-sage w-full inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                    >
                      <ShoppingCart className="h-3.5 w-3.5 text-[#164E35]" />
                      <span>부족 재료 {recipe.missingIngredients.length}종 장보기 리스트에 추가</span>
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
