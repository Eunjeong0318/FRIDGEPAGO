import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChefHat,
  ShoppingCart,
  X,
} from 'lucide-react';
import { Ingredient, Recipe, RecipeMissingIngredient } from '../types';
import { formatKRW } from '../utils/dateUtils';
import { getRecipeImage } from '../utils/visualAssets';
import { ResilientImage } from './ResilientImage';

interface RecipeDetailModalProps {
  recipe: Recipe | null;
  fridgeIngredients: Ingredient[];
  onClose: () => void;
  onAddMissingToShopping: (items: RecipeMissingIngredient[], recipeTitle: string) => void;
  onRecordCookingComplete: (
    recipeTitle: string,
    usedNames: string[],
    savedAmount: number,
    deductFromFridge: boolean
  ) => void;
}

export const RecipeDetailModal: React.FC<RecipeDetailModalProps> = ({
  recipe,
  fridgeIngredients,
  onClose,
  onAddMissingToShopping,
  onRecordCookingComplete,
}) => {
  const [cookingPanelOpen, setCookingPanelOpen] = useState(false);
  const [deductStock, setDeductStock] = useState(true);

  // Suggest realistic saved cost strictly from actual recorded purchase prices of matched owned ingredients (if available)
  const suggestedSaving = React.useMemo(() => {
    if (!recipe) return 0;
    let sum = 0;
    for (const owned of recipe.ownedIngredients) {
      const matched = fridgeIngredients.find(
        (f) => f.name.includes(owned.name) || owned.name.includes(f.name)
      );
      if (matched?.purchasePrice) {
        sum += Math.round(matched.purchasePrice * 0.5);
      }
    }
    return sum > 0 ? sum : 4500;
  }, [recipe, fridgeIngredients]);

  const [savedAmountInput, setSavedAmountInput] = useState(String(suggestedSaving));

  React.useEffect(() => {
    setSavedAmountInput(String(suggestedSaving));
    setCookingPanelOpen(false);
  }, [suggestedSaving, recipe]);

  if (!recipe) return null;

  const handleConfirmCooked = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.max(0, Math.round(Number(savedAmountInput) || 0));
    onRecordCookingComplete(
      recipe.title,
      recipe.ownedIngredients.map((o) => o.name),
      amount,
      deductStock
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-detail-title"
    >
      <div className="w-full max-w-2xl rounded-[22px] bg-white border border-[#E2ECE5] shadow-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <div className="relative h-56 sm:h-64 w-full overflow-hidden bg-[#EEF4F0]">
          <ResilientImage
            src={getRecipeImage(recipe)}
            alt={recipe.title}
            fallbackLabel={recipe.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-xl bg-black/45 p-2 text-white hover:bg-black/65 backdrop-blur-xs transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute bottom-5 left-6 right-6 text-white">
            <div className="text-xs font-medium text-white/85 tabular-nums">
              {recipe.cuisine} · 조리 {recipe.cookingTimeMinutes}분 · 난이도 {recipe.difficulty}
            </div>
            <h2 id="recipe-detail-title" className="text-xl sm:text-2xl font-bold mt-1">
              {recipe.title}
            </h2>
          </div>
        </div>

        <div className="p-6 sm:p-7 space-y-6">
          <div>
            <p className="text-sm leading-relaxed text-[#33473B]">{recipe.description}</p>
            <p className="mt-2.5 text-xs text-[#164E35] font-semibold">
              셰프 추천 포인트 · {recipe.recommendationReason}
            </p>
          </div>

          {/* Ingredient Split: Owned vs Missing vs Basic Seasonings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-[#EBF1EC]">
            <div>
              <h3 className="text-sm font-bold text-[#122118] mb-2.5">
                보유 중인 식재료 ({recipe.ownedIngredients.length}종)
              </h3>
              {recipe.ownedIngredients.length === 0 ? (
                <p className="text-xs text-[#64786B]">일치하는 냉장고 보유 주재료가 없습니다.</p>
              ) : (
                <ul className="space-y-1.5 text-xs sm:text-sm text-[#122118]">
                  {recipe.ownedIngredients.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between py-1.5 border-b border-[#F1F6F2]"
                    >
                      <span className="font-semibold text-[#15803D]">{item.name}</span>
                      <span className="text-[#526559] font-num tabular-nums">{item.amount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-bold text-[#122118]">
                  부족한 재료 ({recipe.missingIngredients.length}종)
                </h3>
                {recipe.missingIngredients.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onAddMissingToShopping(recipe.missingIngredients, recipe.title)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#164E35] hover:underline whitespace-nowrap shrink-0"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span>장보기에 담기</span>
                  </button>
                )}
              </div>
              {recipe.missingIngredients.length === 0 ? (
                <p className="text-xs text-[#15803D] font-medium">
                  추가 구매할 식재료 없이 바로 조리할 수 있습니다.
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs sm:text-sm">
                  {recipe.missingIngredients.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between py-1.5 border-b border-[#F1F6F2]"
                    >
                      <span className="font-semibold text-[#B45309]">{item.name}</span>
                      <span className="text-[#526559] font-num tabular-nums">
                        {item.amount} · 약 {formatKRW(item.estimatedPrice)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {recipe.basicSeasonings.length > 0 && (
            <div className="pt-1">
              <h3 className="text-xs font-semibold text-[#526559] mb-1">
                기본 양념 및 물 (별도 구분)
              </h3>
              <p className="text-xs text-[#33473B] leading-relaxed">
                {recipe.basicSeasonings.join(' · ')}
              </p>
            </div>
          )}

          {/* Steps */}
          <div className="pt-5 border-t border-[#EBF1EC]">
            <h3 className="text-sm font-bold text-[#122118] mb-3.5">조리 순서</h3>
            <ol className="space-y-3.5">
              {recipe.steps.map((step, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 text-sm leading-relaxed text-[#22352A]"
                >
                  <span className="font-num tabular-nums text-xs font-bold text-[#164E35] mt-0.5 shrink-0">
                    0{index + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Food Safety & Allergy Notice */}
          <div className="rounded-xl bg-[#FFFBEB] border border-[#F3DCAC] p-3.5 flex items-start gap-2.5 text-xs text-[#92400E]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">식품 안전 및 알레르기 주의: </span>
              {recipe.safetyAndAllergyNote}
            </div>
          </div>

          {/* Record Cooking Completion Expandable Form */}
          {cookingPanelOpen && (
            <form
              onSubmit={handleConfirmCooked}
              className="rounded-2xl bg-[#F7FAF8] border border-[#D4E3D8] p-4 sm:p-5 space-y-3.5"
            >
              <div className="text-sm font-bold text-[#122118]">
                조리 완료 및 절약 리포트 기록
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                    이번 한 끼로 절약한 금액 (원)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={savedAmountInput}
                    onChange={(e) => setSavedAmountInput(e.target.value)}
                    className="w-full input-modern px-3.5 py-2 text-sm font-num tabular-nums"
                  />
                  <p className="mt-1 text-[11px] text-[#64786B]">
                    보유 식재료 구매가 기준 제안값이며 직접 수정할 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs text-[#33473B]">
                    <input
                      type="checkbox"
                      checked={deductStock}
                      onChange={(e) => setDeductStock(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#164E35]"
                    />
                    <span>사용한 보유 식재료 수량 1단위씩 자동 차감</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCookingPanelOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#526559] hover:bg-white"
                >
                  접기
                </button>
                <button
                  type="submit"
                  className="btn-primary-gradient inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>절약 리포트에 기록 저장</span>
                </button>
              </div>
            </form>
          )}

          {/* Action Footer */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
            {recipe.missingIngredients.length > 0 ? (
              <button
                type="button"
                onClick={() => onAddMissingToShopping(recipe.missingIngredients, recipe.title)}
                className="btn-secondary-sage inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0"
              >
                <ShoppingCart className="h-4 w-4 text-[#164E35]" />
                <span>부족한 재료 {recipe.missingIngredients.length}종 장보기 추가</span>
              </button>
            ) : (
              <span className="text-xs text-[#64786B]">부족한 재료 없음</span>
            )}

            <div className="flex items-center gap-2">
              {!cookingPanelOpen && (
                <button
                  type="button"
                  onClick={() => setCookingPanelOpen(true)}
                  className="btn-primary-gradient inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0"
                >
                  <ChefHat className="h-4 w-4" />
                  <span>조리 완료 기록</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] text-xs sm:text-sm font-medium text-[#33473B] hover:bg-[#F4F8F5] whitespace-nowrap shrink-0"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
