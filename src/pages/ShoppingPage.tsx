import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import {
  AiStoreRecommendation,
  INGREDIENT_CATEGORIES,
  IngredientCategory,
  OnlineMallId,
  Recipe,
  RecipeMissingIngredient,
  ShoppingItem,
  STORAGE_LOCATIONS,
  StorageLocation,
} from '../types';
import { recommendOnlineStores } from '../utils/api';
import { addDaysToToday, formatKRW, getTodayDateString } from '../utils/dateUtils';
import {
  getItemStoreRecommendations,
  MALL_ORDER,
  ONLINE_MALLS,
  resolveMallSearchUrlByName,
  simulateBasketAcrossMalls,
} from '../utils/storeRecommender';
import { IngredientDraft } from '../components/IngredientModals';

interface ShoppingPageProps {
  shoppingList: ShoppingItem[];
  availableRecipes: Recipe[];
  storeRecommendation: AiStoreRecommendation | null;
  onSaveStoreRecommendation: (rec: AiStoreRecommendation | null) => void;
  onAddShoppingItem: (item: Omit<ShoppingItem, 'id' | 'createdAt' | 'checked'>) => void;
  onToggleChecked: (id: string) => void;
  onUpdateShoppingItem: (id: string, patch: Partial<ShoppingItem>) => void;
  onRequestDeleteShoppingItem: (item: ShoppingItem) => void;
  onRequestClearShoppingList: () => void;
  onImportMissingFromRecipe: (items: RecipeMissingIngredient[], recipeTitle: string) => void;
  onTransferCheckedToFridge: (
    checkedIds: string[],
    drafts: IngredientDraft[],
    logExpenseTotal: boolean
  ) => void;
}

export const ShoppingPage: React.FC<ShoppingPageProps> = ({
  shoppingList,
  availableRecipes,
  storeRecommendation,
  onSaveStoreRecommendation,
  onAddShoppingItem,
  onToggleChecked,
  onUpdateShoppingItem,
  onRequestDeleteShoppingItem,
  onRequestClearShoppingList,
  onImportMissingFromRecipe,
  onTransferCheckedToFridge,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<IngredientCategory>('채소');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('개');
  const [estimatedPrice, setEstimatedPrice] = useState('2500');
  const [formError, setFormError] = useState<string | null>(null);

  const [recipeImportModalOpen, setRecipeImportModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [defaultStorage, setDefaultStorage] = useState<StorageLocation>('냉장');
  const [defaultExpiryDate, setDefaultExpiryDate] = useState(addDaysToToday(6));
  const [logExpenseOnTransfer, setLogExpenseOnTransfer] = useState(true);

  // Online Lowest-Price Store System States
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [hasWowMembership, setHasWowMembership] = useState<boolean>(true);
  const [hasKurlyMembers, setHasKurlyMembers] = useState<boolean>(false);
  const [selectedBundleMallId, setSelectedBundleMallId] = useState<OnlineMallId>('coupang');
  const [quickSearchQuery, setQuickSearchQuery] = useState('');

  const [aiStoreLoading, setAiStoreLoading] = useState(false);
  const [aiStoreError, setAiStoreError] = useState<string | null>(null);

  const unpurchasedItems = useMemo(
    () => shoppingList.filter((item) => !item.checked),
    [shoppingList]
  );
  const purchasedItems = useMemo(
    () => shoppingList.filter((item) => item.checked),
    [shoppingList]
  );

  const unpurchasedTotal = useMemo(
    () => unpurchasedItems.reduce((sum, item) => sum + (item.estimatedPrice || 0), 0),
    [unpurchasedItems]
  );
  const purchasedTotal = useMemo(
    () => purchasedItems.reduce((sum, item) => sum + (item.estimatedPrice || 0), 0),
    [purchasedItems]
  );

  const completionPct = useMemo(() => {
    if (shoppingList.length === 0) return 0;
    return Math.round((purchasedItems.length / shoppingList.length) * 100);
  }, [purchasedItems.length, shoppingList.length]);

  const recipesWithMissing = useMemo(
    () => availableRecipes.filter((r) => r.missingIngredients.length > 0),
    [availableRecipes]
  );

  const mallSimulations = useMemo(
    () =>
      simulateBasketAcrossMalls(unpurchasedItems, {
        hasWowMembership,
        hasKurlyMembers,
      }),
    [unpurchasedItems, hasWowMembership, hasKurlyMembers]
  );

  React.useEffect(() => {
    if (mallSimulations.length > 0) {
      setSelectedBundleMallId(mallSimulations[0].mall.id);
    }
  }, [mallSimulations]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const numQty = Number(quantity);
    const numPrice = Math.max(0, Math.round(Number(estimatedPrice) || 0));

    if (!cleanName) {
      setFormError('구매할 식재료 이름을 입력해주세요.');
      return;
    }
    if (!Number.isFinite(numQty) || numQty <= 0) {
      setFormError('구매 수량을 0보다 크게 입력해주세요.');
      return;
    }

    setFormError(null);
    onAddShoppingItem({
      name: cleanName,
      category,
      quantity: Math.round(numQty * 100) / 100,
      unit: unit.trim() || '개',
      estimatedPrice: numPrice,
    });
    setName('');
    setQuantity('1');
    setEstimatedPrice('2500');
  };

  const handleRequestAiStoreAnalysis = async () => {
    if (unpurchasedItems.length === 0) {
      setAiStoreError('분석할 미구매 장보기 항목이 없습니다. 식재료를 먼저 추가해주세요.');
      return;
    }
    setAiStoreLoading(true);
    setAiStoreError(null);
    try {
      const result = await recommendOnlineStores({
        items: unpurchasedItems.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          category: it.category,
          estimatedPrice: it.estimatedPrice,
        })),
        hasWowMembership,
        hasKurlyMembers,
      });
      onSaveStoreRecommendation(result);
    } catch (err) {
      setAiStoreError(
        err instanceof Error
          ? err.message
          : '온라인 최저가 구매처 분석 중 오류가 발생했습니다. 다시 시도해주세요.'
      );
    } finally {
      setAiStoreLoading(false);
    }
  };

  const handleConfirmStockTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (purchasedItems.length === 0) return;

    const today = getTodayDateString();
    const drafts: IngredientDraft[] = purchasedItems.map((item) => ({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      storage: defaultStorage,
      purchaseDate: today,
      expiryDate: defaultExpiryDate,
      purchasePrice: item.estimatedPrice > 0 ? item.estimatedPrice : undefined,
      memo: item.preferredStore
        ? `${ONLINE_MALLS[item.preferredStore].shortName} 구매 입고`
        : item.sourceRecipeTitle
        ? `${item.sourceRecipeTitle} 준비 재료`
        : '장보기 입고',
      isSample: false,
    }));

    onTransferCheckedToFridge(
      purchasedItems.map((p) => p.id),
      drafts,
      logExpenseOnTransfer
    );
    setStockModalOpen(false);
  };

  const activeSearchTerm = quickSearchQuery.trim() || '국내산 애호박';

  return (
    <div className="space-y-6">
      {/* Add Item & Recipe Import Header */}
      <section className="surface-card p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#EBF1EC]">
          <div>
            <div className="text-xs font-semibold text-[#164E35]">
              스마트 장바구니 · 5대 온라인몰 최저가 내비게이션
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#122118]">
              장보기 리스트 & 온라인 최저가 구매처
            </h2>
            <p className="text-xs sm:text-sm text-[#526559] mt-1">
              필요한 식재료와 예산을 관리하고 쿠팡·마켓컬리·오아시스마켓·SSG닷컴·네이버쇼핑 최저가를 바로 비교하세요.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRecipeImportModalOpen(true)}
              className="btn-secondary-sage inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <ChefHat className="h-4 w-4 text-[#164E35]" />
              <span>레시피 부족 재료 가져오기</span>
            </button>

            {shoppingList.length > 0 && (
              <button
                type="button"
                onClick={onRequestClearShoppingList}
                className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl border border-[#D5E2D8] text-xs font-medium text-[#526559] hover:text-[#B91C1C] hover:border-[#F3D2D2] hover:bg-[#FEF2F2] transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>목록 초기화</span>
              </button>
            )}
          </div>
        </div>

        {/* Direct Add Form */}
        <form onSubmit={handleAddSubmit} className="mt-5 space-y-3">
          {formError && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#B91C1C] font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-12 gap-3">
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">품목명</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 애호박, 두부, 무항생제 달걀"
                className="w-full input-modern px-3.5 py-2.5 text-sm"
              />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">카테고리</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as IngredientCategory)}
                className="w-full input-modern px-3 py-2.5 text-sm"
              >
                {INGREDIENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                수량 / 단위
              </label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-16 input-modern px-2.5 py-2.5 text-sm font-num tabular-nums"
                />
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="개"
                  className="w-full input-modern px-2.5 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="col-span-2 sm:col-span-2">
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                예상 가격 (원)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
                className="w-full input-modern px-3 py-2.5 text-sm font-num tabular-nums"
              />
            </div>

            <div className="col-span-2 sm:col-span-2 flex items-end">
              <button
                type="submit"
                className="btn-primary-gradient w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>목록 추가</span>
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Budget & Progress Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="surface-card p-6 flex flex-col justify-between">
          <div className="text-xs font-semibold text-[#526559] tabular-nums">
            미구매 예정 금액 ({unpurchasedItems.length}건)
          </div>
          <div className="mt-2.5 text-[28px] font-bold text-[#122118] font-num tabular-nums leading-none">
            {formatKRW(unpurchasedTotal)}
          </div>
          <div className="mt-3 pt-3 border-t border-[#EDF3EF] text-xs text-[#64786B]">
            체크박스를 누르면 구매 완료로 이동합니다
          </div>
        </div>

        <div className="surface-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-[#526559] tabular-nums">
            <span>구매 완료 금액 ({purchasedItems.length}건)</span>
            <span className="text-[#164E35]">{completionPct}% 완료</span>
          </div>
          <div className="mt-2.5 text-[28px] font-bold text-[#164E35] font-num tabular-nums leading-none">
            {formatKRW(purchasedTotal)}
          </div>
          <div className="mt-3 pt-3 border-t border-[#EDF3EF]">
            <div className="h-1.5 w-full rounded-full bg-[#EEF3EF] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#164E35]"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="surface-card p-6 flex flex-col justify-between">
          <div className="text-xs font-semibold text-[#526559] tabular-nums">
            총 장보기 예산 합계 ({shoppingList.length}건)
          </div>
          <div className="mt-2.5 text-[28px] font-bold text-[#122118] font-num tabular-nums leading-none">
            {formatKRW(unpurchasedTotal + purchasedTotal)}
          </div>
          <div className="mt-3 pt-3 border-t border-[#EDF3EF] text-xs text-[#64786B]">
            구매 완료 항목은 냉장고로 즉시 입고 가능
          </div>
        </div>
      </section>

      {/* Shopping Items Split: Unpurchased (with Per-Item Store Finder) & Purchased */}
      {shoppingList.length === 0 ? (
        <section className="surface-card p-12 sm:p-16 text-center space-y-3.5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF5F0] text-[#164E35]">
            <ShoppingCart className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#122118]">
              장보기 리스트가 비어 있습니다
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-[#526559] max-w-md mx-auto leading-relaxed">
              위 입력창에서 필요한 식재료를 추가하거나 추천 레시피의 부족한 재료를 불러오면 몰별 최저가 추천이 활성화됩니다.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Unpurchased Section with Per-Item Lowest-Price Mall Comparison */}
          <section className="surface-card p-6 sm:p-7">
            <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                  미구매 항목 ({unpurchasedItems.length})
                </h3>
                <p className="text-xs text-[#526559] mt-0.5">
                  품목별 추천 구매처 바로가기 또는 5대 몰 비교를 열어 최저가를 확인하세요
                </p>
              </div>
              <span className="text-xs font-bold text-[#164E35] font-num tabular-nums shrink-0">
                합계 {formatKRW(unpurchasedTotal)}
              </span>
            </div>

            {unpurchasedItems.length === 0 ? (
              <p className="py-10 text-center text-xs sm:text-sm text-[#64786B]">
                모든 항목을 구매 완료했습니다. 오른쪽에서 냉장고 재고로 등록해보세요.
              </p>
            ) : (
              <ul className="divide-y divide-[#EBF1EC] mt-1">
                {unpurchasedItems.map((item) => {
                  const storeOptions = getItemStoreRecommendations(item);
                  const chosenOption =
                    (item.preferredStore
                      ? storeOptions.find((o) => o.mall.id === item.preferredStore)
                      : undefined) || storeOptions[0];
                  const isExpanded = expandedItemId === item.id;

                  return (
                    <li key={item.id} className="py-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex items-start gap-3 cursor-pointer min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => onToggleChecked(item.id)}
                            className="mt-1 h-4 w-4 rounded accent-[#164E35] shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#122118] truncate">
                              {item.name}
                            </div>
                            <div className="text-xs text-[#526559] tabular-nums">
                              {item.category} · {item.quantity}
                              {item.unit}
                              {item.sourceRecipeTitle ? ` · ${item.sourceRecipeTitle}` : ''}
                            </div>
                          </div>
                        </label>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={item.estimatedPrice}
                            onChange={(e) =>
                              onUpdateShoppingItem(item.id, {
                                estimatedPrice: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            aria-label={`${item.name} 예상 가격`}
                            className="w-24 input-modern px-2.5 py-1.5 text-right text-xs font-num tabular-nums"
                          />
                          <span className="text-xs text-[#526559]">원</span>
                          <button
                            type="button"
                            onClick={() => onRequestDeleteShoppingItem(item)}
                            className="p-1.5 rounded-xl text-[#64786B] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
                            aria-label={`${item.name} 삭제`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Inline Recommended Store Action Row */}
                      <div className="pl-7 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="text-[#33473B]">
                          <span className="text-[#64786B]">추천 구매처 · </span>
                          <span className="font-semibold text-[#164E35]">
                            {chosenOption.mall.name}
                          </span>
                          <span className="text-[#64786B]"> · {chosenOption.mall.deliveryType}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={chosenOption.searchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EEF6F1] text-[#164E35] font-semibold hover:bg-[#DFEDE4] transition-colors whitespace-nowrap shrink-0"
                          >
                            <span>{chosenOption.mall.shortName} 최저가 검색</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedItemId((prev) => (prev === item.id ? null : item.id))
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#D5E2D8] text-[#33473B] font-medium hover:bg-[#F5F9F6] transition-colors whitespace-nowrap shrink-0"
                          >
                            <span>5대몰 비교</span>
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expandable 5-Mall Comparison Drawer */}
                      {isExpanded && (
                        <div className="ml-7 mt-2.5 rounded-2xl bg-[#F7FAF8] border border-[#E2ECE5] divide-y divide-[#E7EFE9] overflow-hidden">
                          {storeOptions.map((opt) => {
                            const isSelected =
                              (item.preferredStore || storeOptions[0].mall.id) === opt.mall.id;
                            return (
                              <div
                                key={opt.mall.id}
                                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                    <span className="font-bold text-[#122118]">
                                      {opt.mall.name}
                                    </span>
                                    {opt.isTopPick && (
                                      <span className="text-[#164E35] font-semibold">
                                        · 카테고리 추천 1위
                                      </span>
                                    )}
                                    <span className="text-[#64786B] font-num tabular-nums">
                                      · 참고 예상가 약 {formatKRW(opt.estimatedUnitPrice)}
                                    </span>
                                  </div>
                                  <p className="text-[#526559] mt-0.5">{opt.reason}</p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateShoppingItem(item.id, {
                                        preferredStore: opt.mall.id,
                                        estimatedPrice: opt.estimatedUnitPrice,
                                      })
                                    }
                                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                      isSelected
                                        ? 'btn-primary-gradient text-white'
                                        : 'bg-white border border-[#D5E2D8] text-[#33473B] hover:border-[#164E35]'
                                    }`}
                                  >
                                    {isSelected ? '선택됨' : '선택·가격반영'}
                                  </button>
                                  <a
                                    href={opt.searchUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#C7D8CC] text-[#164E35] font-semibold hover:bg-[#EEF5F0] transition-colors whitespace-nowrap shrink-0"
                                  >
                                    <span>바로가기</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Purchased Section + Transfer to Fridge */}
          <section className="surface-card p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#EBF1EC]">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                  구매 완료 항목 ({purchasedItems.length})
                </h3>
                <p className="text-xs text-[#526559] mt-0.5 font-num tabular-nums">
                  구매 금액 합계 {formatKRW(purchasedTotal)}
                </p>
              </div>

              {purchasedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStockModalOpen(true)}
                  className="btn-primary-gradient inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <PackagePlus className="h-4 w-4" />
                  <span>냉장고 재고로 등록</span>
                </button>
              )}
            </div>

            {purchasedItems.length === 0 ? (
              <p className="py-10 text-center text-xs sm:text-sm text-[#64786B]">
                구매 완료 체크박스를 선택하면 이곳으로 이동하며 냉장고 재고로 한 번에 등록할 수 있습니다.
              </p>
            ) : (
              <ul className="divide-y divide-[#EBF1EC] mt-1">
                {purchasedItems.map((item) => (
                  <li key={item.id} className="py-3.5 flex items-center justify-between gap-3">
                    <label className="flex items-start gap-3 cursor-pointer min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => onToggleChecked(item.id)}
                        className="mt-1 h-4 w-4 rounded accent-[#164E35] shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium line-through text-[#64786B] truncate">
                          {item.name}
                        </div>
                        <div className="text-xs text-[#64786B] font-num tabular-nums">
                          {item.category} · {item.quantity}
                          {item.unit} · {formatKRW(item.estimatedPrice)}
                          {item.preferredStore
                            ? ` · ${ONLINE_MALLS[item.preferredStore].shortName}`
                            : ''}
                        </div>
                      </div>
                    </label>

                    <button
                      type="button"
                      onClick={() => onRequestDeleteShoppingItem(item)}
                      className="p-1.5 rounded-xl text-[#64786B] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
                      aria-label={`${item.name} 삭제`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Online Lowest-Price Store & Bundle Shipping Recommendation Center */}
      <section className="surface-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#EBF1EC]">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF5F0] text-[#164E35]">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-[#122118]">
                온라인 최저가 구매처 추천 및 묶음배송 비교
              </h3>
              <p className="text-xs sm:text-sm text-[#526559] mt-0.5 leading-relaxed">
                쿠팡 로켓프레시, 마켓컬리, 오아시스마켓, SSG닷컴, 네이버쇼핑의 배송비 기준과 PB 특가를 반영해 가장 알뜰한 구매처를 안내합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestAiStoreAnalysis}
            disabled={aiStoreLoading || unpurchasedItems.length === 0}
            className="btn-primary-gradient inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {aiStoreLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI가 최저가 구매처 검색 분석 중...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>AI 실시간 최저가·묶음구매 분석</span>
              </>
            )}
          </button>
        </div>

        {/* Membership Toggle & Quick Direct Mall Search Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-6 flex flex-wrap items-center gap-4 text-xs sm:text-sm">
            <span className="font-semibold text-[#33473B]">내 멤버십 조건 반영:</span>
            <label className="inline-flex items-center gap-2 cursor-pointer text-[#122118]">
              <input
                type="checkbox"
                checked={hasWowMembership}
                onChange={(e) => setHasWowMembership(e.target.checked)}
                className="h-4 w-4 rounded accent-[#164E35]"
              />
              <span>쿠팡 와우회원 (1.5만원 무료배송)</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-[#122118]">
              <input
                type="checkbox"
                checked={hasKurlyMembers}
                onChange={(e) => setHasKurlyMembers(e.target.checked)}
                className="h-4 w-4 rounded accent-[#164E35]"
              />
              <span>컬리멤버스 (2만원 무료배송)</span>
            </label>
          </div>

          {/* Instant 5-Mall Lowest-Price Search Bar */}
          <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 text-[#64786B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={quickSearchQuery}
                onChange={(e) => setQuickSearchQuery(e.target.value)}
                placeholder="품목 즉시 최저가 검색 (예: 곰곰 두부, 특란)"
                className="w-full input-modern pl-8 pr-3 py-2 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {MALL_ORDER.map((mId) => {
                const mall = ONLINE_MALLS[mId];
                return (
                  <a
                    key={mId}
                    href={mall.buildSearchUrl(activeSearchTerm)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#D4E3D8] bg-[#FAFDFB] hover:bg-[#EEF6F1] text-[11px] font-semibold text-[#164E35] transition-colors whitespace-nowrap shrink-0"
                    title={`${mall.name}에서 '${activeSearchTerm}' 최저가 검색`}
                  >
                    <span>{mall.shortName}</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        {/* Basket-Wide Mall Shipping & Price Simulation Table */}
        {mallSimulations.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-[#EBF1EC]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-2">
              <h4 className="text-sm font-bold text-[#122118]">
                미구매 장바구니({unpurchasedItems.length}종) 한 곳에서 묶음 구매 시 예상 실결제액 비교
              </h4>
              <span className="text-xs text-[#64786B]">
                상품 추정가 + 무료배송 기준 배송비 합산 시뮬레이션
              </span>
            </div>

            <div className="border border-[#E2ECE5] rounded-2xl divide-y divide-[#EBF1EC] overflow-hidden">
              {mallSimulations.map((sim) => {
                const isSelectedMall = selectedBundleMallId === sim.mall.id;
                return (
                  <div
                    key={sim.mall.id}
                    className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                      sim.isLowestGrandTotal
                        ? 'bg-gradient-to-r from-[#EEF7F1] to-[#FAFDFB]'
                        : 'bg-white hover:bg-[#FAFDFB]'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm sm:text-base font-bold text-[#122118]">
                          {sim.mall.name}
                        </span>
                        <span className="text-xs text-[#526559]">· {sim.mall.deliveryType}</span>
                        {sim.isLowestGrandTotal && (
                          <span className="text-xs font-bold text-[#164E35]">
                            · 묶음 실결제 최저 추천
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#526559]">{sim.mall.pbBrandTip}</p>
                      {sim.belowMinimumOrderNote && (
                        <p className="text-xs text-[#B45309] font-medium">
                          참고: {sim.belowMinimumOrderNote} (기본 식재료 합포장 권장)
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between md:justify-end gap-4 shrink-0">
                      <div className="text-right font-num tabular-nums">
                        <div className="text-xs text-[#526559]">
                          상품 약 {formatKRW(sim.estimatedItemsSubtotal)} + 배송비{' '}
                          {sim.shippingFee === 0 ? (
                            <span className="text-[#15803D] font-semibold">무료</span>
                          ) : (
                            <span className="text-[#B45309]">
                              {formatKRW(sim.shippingFee)} (무료까지{' '}
                              {formatKRW(sim.shortfallForFreeShipping)})
                            </span>
                          )}
                        </div>
                        <div className="text-base font-bold text-[#122118] mt-0.5">
                          예상 실결제 {formatKRW(sim.estimatedGrandTotal)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedBundleMallId(sim.mall.id)}
                        className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                          isSelectedMall
                            ? 'btn-primary-gradient text-white'
                            : 'border border-[#D5E2D8] bg-white text-[#33473B] hover:border-[#164E35]'
                        }`}
                      >
                        {isSelectedMall ? '품목 링크 열림' : '이 몰로 품목 검색'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Cart Builder Links for Selected Bundle Mall */}
            <div className="rounded-2xl bg-[#F7FAF8] border border-[#E2ECE5] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-xs sm:text-sm font-bold text-[#122118]">
                  {ONLINE_MALLS[selectedBundleMallId].name}에서 미구매 품목 원클릭 담기 (낮은가격순 검색)
                </span>
                <span className="text-[11px] text-[#64786B]">
                  새 탭에서 해당 쇼핑몰 최저가 검색창이 열립니다
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {unpurchasedItems.map((it) => (
                  <a
                    key={it.id}
                    href={ONLINE_MALLS[selectedBundleMallId].buildSearchUrl(it.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#C7D8CC] text-xs font-semibold text-[#164E35] hover:bg-[#EEF6F1] transition-colors whitespace-nowrap shrink-0"
                  >
                    <span className="tabular-nums">
                      {it.name} ({it.quantity}
                      {it.unit}) 검색
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI Store Recommendation Error */}
        {aiStoreError && !aiStoreLoading && (
          <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-[#B91C1C]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{aiStoreError}</span>
            </div>
            <button
              type="button"
              onClick={handleRequestAiStoreAnalysis}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#FCA5A5] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2] whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>다시 시도</span>
            </button>
          </div>
        )}

        {/* AI Store Recommendation Loading */}
        {aiStoreLoading && (
          <div className="rounded-2xl bg-[#F7FAF8] border border-[#E2ECE5] p-6 space-y-3 animate-pulse">
            <div className="h-4 w-1/3 bg-[#DCE8DF] rounded" />
            <div className="h-3 w-5/6 bg-[#EBF1EC] rounded" />
            <div className="h-3 w-2/3 bg-[#EBF1EC] rounded" />
          </div>
        )}

        {/* AI Store Recommendation Result (Gemini + Google Search Grounding) */}
        {!aiStoreLoading && storeRecommendation && (
          <div className="rounded-2xl bg-[#F5FAF7] border border-[#CBE0D2] p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-4 border-b border-[#DCE8DF]">
              <div>
                <div className="text-xs font-semibold text-[#164E35]">
                  Gemini AI + 웹 검색 기반 최적 구매처 분석 결과
                </div>
                <h4 className="text-base sm:text-lg font-bold text-[#122118] mt-1">
                  추천 주력 구매처: {storeRecommendation.primaryRecommendedMall}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onSaveStoreRecommendation(null)}
                className="self-end sm:self-start text-xs font-medium text-[#64786B] hover:text-[#122118] whitespace-nowrap"
              >
                결과 닫기
              </button>
            </div>

            <div className="space-y-2 text-xs sm:text-sm text-[#22352A] leading-relaxed">
              <p>{storeRecommendation.overallStrategy}</p>
              <p className="text-xs font-semibold text-[#164E35]">
                배송비 절약 팁 · {storeRecommendation.bundleShippingTip}
              </p>
            </div>

            {storeRecommendation.itemGuides.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#DCE8DF] divide-y divide-[#EBF1EC] overflow-hidden">
                {storeRecommendation.itemGuides.map((guide, idx) => {
                  const directUrl = resolveMallSearchUrlByName(
                    guide.bestStore,
                    guide.searchKeyword || guide.itemName
                  );
                  return (
                    <div
                      key={`${guide.itemName}-${idx}`}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                          <span className="font-bold text-[#122118]">{guide.itemName}</span>
                          <span className="text-xs font-semibold text-[#164E35]">
                            · 추천: {guide.bestStore}
                          </span>
                          <span className="text-xs text-[#526559] font-num tabular-nums">
                            · 예상 시세 {guide.estimatedPriceRange}
                          </span>
                        </div>
                        <p className="text-xs text-[#526559]">{guide.reason}</p>
                        <div className="text-[11px] text-[#64786B]">
                          최저가 추천 검색어:{' '}
                          <strong className="text-[#33473B]">{guide.searchKeyword}</strong>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <a
                          href={directUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary-gradient inline-flex items-center gap-1 min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                        >
                          <span>추천몰 최저가 보기</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={ONLINE_MALLS.coupang.buildSearchUrl(
                            guide.searchKeyword || guide.itemName
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#D5E2D8] bg-white text-xs font-medium text-[#33473B] hover:bg-[#F5F9F6] whitespace-nowrap shrink-0"
                        >
                          <span>쿠팡</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={ONLINE_MALLS.kurly.buildSearchUrl(
                            guide.searchKeyword || guide.itemName
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#D5E2D8] bg-white text-xs font-medium text-[#33473B] hover:bg-[#F5F9F6] whitespace-nowrap shrink-0"
                        >
                          <span>컬리</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Google Search Grounding Sources */}
            {storeRecommendation.sources.length > 0 && (
              <div className="pt-2 space-y-1.5">
                <div className="text-[11px] font-semibold text-[#526559]">
                  웹 검색 참고 출처 (Google Search)
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {storeRecommendation.sources.map((src, idx) => (
                    <a
                      key={idx}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#164E35] hover:underline truncate max-w-[260px]"
                    >
                      <span className="truncate">{src.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#64786B]">{storeRecommendation.priceDisclaimer}</p>
          </div>
        )}
      </section>

      {/* Import Missing Ingredients from Recipe Modal */}
      {recipeImportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
              <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                추천 레시피에서 부족한 재료 가져오기
              </h3>
              <button
                type="button"
                onClick={() => setRecipeImportModalOpen(false)}
                className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {recipesWithMissing.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm font-semibold text-[#122118]">
                  현재 부족한 재료가 있는 추천 레시피가 없습니다
                </p>
                <p className="text-xs text-[#526559]">
                  보유 재료만으로 모든 추천 메뉴 조리가 가능하거나, AI 레시피 추천 페이지에서 새 레시피를 받아보세요.
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-[#EBF1EC] border border-[#E2ECE5] rounded-2xl overflow-hidden">
                {recipesWithMissing.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-[#FAFDFB]"
                  >
                    <div>
                      <div className="text-sm font-bold text-[#122118]">{r.title}</div>
                      <div className="text-xs text-[#B45309] mt-1">
                        부족 재료: {r.missingIngredients.map((m) => `${m.name}(${m.amount})`).join(', ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onImportMissingFromRecipe(r.missingIngredients, r.title);
                        setRecipeImportModalOpen(false);
                      }}
                      className="btn-primary-gradient inline-flex items-center gap-1 min-h-[38px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{r.missingIngredients.length}종 담기</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Transfer Purchased Items to Fridge Modal */}
      {stockModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
              <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                구매 완료 {purchasedItems.length}종 냉장고 입고
              </h3>
              <button
                type="button"
                onClick={() => setStockModalOpen(false)}
                className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmStockTransfer} className="mt-5 space-y-4">
              <div className="text-xs text-[#526559] leading-relaxed">
                입고 대상: {purchasedItems.map((p) => `${p.name} ${p.quantity}${p.unit}`).join(', ')}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                  기본 보관 장소
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#EEF4F0]">
                  {STORAGE_LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setDefaultStorage(loc)}
                      className={`py-2 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                        defaultStorage === loc
                          ? 'btn-primary-gradient text-white'
                          : 'text-[#456250] hover:text-[#122118]'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                  기본 소비기한 설정 (입고 후 개별 수정 가능)
                </label>
                <input
                  type="date"
                  value={defaultExpiryDate}
                  onChange={(e) => setDefaultExpiryDate(e.target.value)}
                  className="w-full input-modern px-3.5 py-2.5 text-sm font-num tabular-nums"
                />
              </div>

              <div className="pt-3 border-t border-[#EBF1EC]">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={logExpenseOnTransfer}
                    onChange={(e) => setLogExpenseOnTransfer(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded accent-[#164E35]"
                  />
                  <div className="text-xs">
                    <div className="font-semibold text-[#122118] tabular-nums">
                      절약 리포트에 이번 달 식비 지출({formatKRW(purchasedTotal)}) 함께 기록
                    </div>
                    <p className="text-[#64786B] mt-0.5">
                      체크 시 구매 금액이 이번 달 식재료 구매 내역에 자동 반영됩니다.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setStockModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] text-xs font-medium text-[#33473B] hover:bg-[#F4F8F5] whitespace-nowrap"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-primary-gradient min-h-[42px] px-5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                >
                  냉장고에 등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
