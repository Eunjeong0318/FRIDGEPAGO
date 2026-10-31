import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { ExpiryStatus, Ingredient, PageId, WASTE_CAUSE_TAGS, WasteCauseTag } from '../types';
import {
  evaluateExpiry,
  formatKoreanShortDate,
  formatKRW,
  sortIngredientsByPriority,
} from '../utils/dateUtils';
import { getIngredientImage } from '../utils/visualAssets';
import { ResilientImage } from '../components/ResilientImage';

interface ExpiryPageProps {
  ingredients: Ingredient[];
  onConsumeIngredient: (
    ingredient: Ingredient,
    consumedQty: number,
    recordRescueSavingAmount?: number
  ) => void;
  onDiscardExpiredIngredient: (
    ingredient: Ingredient,
    wastedAmount: number,
    reason: string,
    causeTag: WasteCauseTag
  ) => void;
  onOpenEditModal: (ingredient: Ingredient) => void;
  onNavigate: (page: PageId) => void;
}

function getFreshnessBarProps(daysRemaining: number | null, isExpired: boolean): {
  widthPercent: number;
  barColor: string;
} {
  if (daysRemaining === null) {
    return { widthPercent: 25, barColor: '#DC2626' };
  }
  if (isExpired) {
    return { widthPercent: 100, barColor: '#DC2626' };
  }
  if (daysRemaining <= 3) {
    const pct = Math.max(16, Math.round(((daysRemaining + 1) / 4) * 42));
    return { widthPercent: pct, barColor: '#D97706' };
  }
  const pct = Math.min(100, Math.max(52, Math.round((daysRemaining / 14) * 100)));
  return { widthPercent: pct, barColor: '#16A34A' };
}

export const ExpiryPage: React.FC<ExpiryPageProps> = ({
  ingredients,
  onConsumeIngredient,
  onDiscardExpiredIngredient,
  onOpenEditModal,
  onNavigate,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | ExpiryStatus>('all');
  const [consumeTarget, setConsumeTarget] = useState<Ingredient | null>(null);
  const [consumeQtyInput, setConsumeQtyInput] = useState('1');
  const [logRescueSaving, setLogRescueSaving] = useState(false);
  const [rescueSavingInput, setRescueSavingInput] = useState('0');

  const [discardTarget, setDiscardTarget] = useState<Ingredient | null>(null);
  const [discardAmountInput, setDiscardAmountInput] = useState('0');
  const [discardCauseTag, setDiscardCauseTag] = useState<WasteCauseTag>('소비기한 미확인·방치');
  const [discardReason, setDiscardReason] = useState('소비기한 경과 및 상태 변질 우려');

  const prioritized = useMemo(() => sortIngredientsByPriority(ingredients), [ingredients]);

  const counts = useMemo(() => {
    let urgent = 0;
    let check_needed = 0;
    let safe = 0;
    for (const item of prioritized) {
      const ev = evaluateExpiry(item.expiryDate);
      if (ev.status === 'urgent') urgent++;
      else if (ev.status === 'check_needed') check_needed++;
      else safe++;
    }
    return { urgent, check_needed, safe };
  }, [prioritized]);

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return prioritized;
    return prioritized.filter((item) => evaluateExpiry(item.expiryDate).status === statusFilter);
  }, [prioritized, statusFilter]);

  const openConsumeDialog = (item: Ingredient) => {
    setConsumeTarget(item);
    setConsumeQtyInput(String(item.quantity));
    const ev = evaluateExpiry(item.expiryDate);
    const defaultRescue = item.purchasePrice ? item.purchasePrice : 2000;
    setLogRescueSaving(ev.status === 'urgent' && !ev.isExpired);
    setRescueSavingInput(String(defaultRescue));
  };

  const handleConfirmConsume = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumeTarget) return;
    const qty = Math.min(
      consumeTarget.quantity,
      Math.max(0.1, Number(consumeQtyInput) || consumeTarget.quantity)
    );
    const savedAmt = logRescueSaving ? Math.max(0, Math.round(Number(rescueSavingInput) || 0)) : 0;
    onConsumeIngredient(consumeTarget, qty, savedAmt > 0 ? savedAmt : undefined);
    setConsumeTarget(null);
  };

  const openDiscardDialog = (item: Ingredient) => {
    const ev = evaluateExpiry(item.expiryDate);
    setDiscardTarget(item);
    setDiscardAmountInput(String(item.purchasePrice ?? 2000));
    setDiscardCauseTag(ev.isExpired ? '소비기한 미확인·방치' : '개봉 후 소분·밀폐 미흡');
    setDiscardReason(ev.isExpired ? '소비기한 경과로 인한 폐기' : '보관 중 신선도 저하로 인한 폐기');
  };

  const handleConfirmDiscard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discardTarget) return;
    const amt = Math.max(0, Math.round(Number(discardAmountInput) || 0));
    const cleanReason = discardReason.trim() || '소비기한 경과';
    const formattedReason = cleanReason.includes(discardCauseTag)
      ? cleanReason
      : `[${discardCauseTag}] ${cleanReason}`;
    onDiscardExpiredIngredient(discardTarget, amt, formattedReason, discardCauseTag);
    setDiscardTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Food Safety & Storage Caution Notice */}
      <section className="rounded-[20px] bg-[#FFFBEB] border border-[#F3DCAC] p-5 sm:p-6 flex items-start gap-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#B45309]">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="text-xs sm:text-sm text-[#92400E] leading-relaxed">
          <div className="font-bold text-[#78350F]">보관 상태 및 식품 안전 주의 안내</div>
          <p className="mt-1">
            표시된 소비기한은 미개봉·적정 온도 보관 기준 참고 정보입니다.{' '}
            <strong>소비기한이 지난 식재료는 자동으로 안전하다고 판단하지 않으며</strong>, 개봉 후 시간이 지났거나 냄새·색·점성 변화가 있는 경우 절대 섭취하지 말고 폐기해주세요.
          </p>
        </div>
      </section>

      {/* Filter & Summary Header */}
      <section className="surface-card p-6 sm:p-7">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#164E35] tabular-nums">
              임박 {counts.urgent}종 · 날짜 확인 필요 {counts.check_needed}종 · 여유 {counts.safe}종
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#122118]">
              소비기한 우선순위 관리
            </h2>
            <p className="text-xs sm:text-sm text-[#526559] mt-1">
              남은 일수를 자동 계산해 소비가 시급한 순서대로 정렬합니다. 사용한 재료는 소비 완료 체크로 수량을 차감하세요.
            </p>
          </div>

          {counts.urgent > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('recipes')}
              className="btn-primary-gradient inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <ChefHat className="h-4 w-4" />
              <span>임박 재료 {counts.urgent}종으로 레시피 추천받기</span>
            </button>
          )}
        </div>

        {/* Status Segmented Tabs */}
        <div className="mt-6 pt-5 border-t border-[#EBF1EC] flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
              statusFilter === 'all'
                ? 'btn-primary-gradient text-white'
                : 'bg-[#F2F7F4] text-[#3D5245] hover:bg-[#E4EFE8]'
            }`}
          >
            전체 ({prioritized.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('urgent')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
              statusFilter === 'urgent'
                ? 'bg-[#B45309] text-white shadow-xs'
                : 'bg-[#FFFBEB] text-[#B45309] border border-[#F5DFB8] hover:bg-[#FEF3C7]'
            }`}
          >
            임박 · D-3 이내 ({counts.urgent})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('check_needed')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
              statusFilter === 'check_needed'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] hover:bg-[#FEE2E2]'
            }`}
          >
            날짜 확인 필요 · 경과/미입력 ({counts.check_needed})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('safe')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
              statusFilter === 'safe'
                ? 'bg-[#15803D] text-white shadow-xs'
                : 'bg-[#EEF6F1] text-[#15803D] border border-[#CDE3D4] hover:bg-[#E0EFE6]'
            }`}
          >
            여유 · D-4 이상 ({counts.safe})
          </button>
        </div>
      </section>

      {/* Expiry Priority List */}
      {filteredList.length === 0 ? (
        <section className="surface-card p-12 sm:p-16 text-center">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF5F0] text-[#164E35]">
            <Clock className="h-6 w-6" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[#122118]">
            해당 상태의 식재료가 없습니다
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-[#526559]">
            {ingredients.length === 0
              ? '내 냉장고 메뉴에서 식재료를 추가하면 남은 소비기한을 자동으로 추적합니다.'
              : '다른 상태 필터를 선택해 전체 목록을 확인해보세요.'}
          </p>
        </section>
      ) : (
        <section className="surface-card divide-y divide-[#EBF1EC] overflow-hidden">
          {filteredList.map((item) => {
            const ev = evaluateExpiry(item.expiryDate);
            const bar = getFreshnessBarProps(ev.daysRemaining, ev.isExpired);

            return (
              <div
                key={item.id}
                className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#F9FCFA] transition-colors"
              >
                <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                  <div className="h-16 w-16 rounded-2xl overflow-hidden shrink-0 border border-[#E2ECE5] bg-[#EEF4F0]">
                    <ResilientImage
                      src={getIngredientImage(item)}
                      alt={item.name}
                      fallbackLabel={item.name}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                        {item.name}
                      </h3>
                      <span className="text-sm sm:text-base font-bold text-[#164E35] font-num tabular-nums">
                        {item.quantity}
                        {item.unit}
                      </span>
                      <span className="text-xs text-[#526559]">
                        · {item.category} · {item.storage} 보관
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs tabular-nums">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          ev.status === 'urgent'
                            ? 'text-[#B45309]'
                            : ev.status === 'check_needed'
                            ? 'text-[#B91C1C]'
                            : 'text-[#15803D]'
                        }`}
                      >
                        {ev.status === 'urgent' && <Clock className="h-3.5 w-3.5" />}
                        {ev.status === 'check_needed' && <AlertTriangle className="h-3.5 w-3.5" />}
                        {ev.status === 'safe' && <CheckCircle2 className="h-3.5 w-3.5" />}
                        <span>
                          {ev.statusLabel} · {ev.dDayText}
                        </span>
                      </span>

                      <span className="text-[#526559] font-num">
                        소비기한: {formatKoreanShortDate(item.expiryDate)}
                      </span>

                      <div
                        className="hidden sm:block w-32 h-1.5 rounded-full bg-[#EEF3EF] overflow-hidden"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${bar.widthPercent}%`,
                            backgroundColor: bar.barColor,
                          }}
                        />
                      </div>
                    </div>

                    {ev.isExpired && (
                      <p className="mt-2 text-xs text-[#B91C1C] font-medium">
                        소비기한이 지난 품목입니다. 안전하다고 단정하지 마시고 변질 우려 시 즉시 폐기하세요.
                      </p>
                    )}

                    {!item.expiryDate && (
                      <button
                        type="button"
                        onClick={() => onOpenEditModal(item)}
                        className="mt-1.5 text-xs font-semibold text-[#164E35] hover:underline whitespace-nowrap"
                      >
                        포장지 확인 후 소비기한 입력하기
                      </button>
                    )}
                  </div>
                </div>

                {/* Actions: Consume Complete Check or Discard */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    type="button"
                    onClick={() => openConsumeDialog(item)}
                    className="btn-primary-gradient inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>소비 완료 체크</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openDiscardDialog(item)}
                    className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl border border-[#F3D2D2] text-[#B91C1C] text-xs font-semibold hover:bg-[#FEF2F2] transition-colors whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>폐기 기록</span>
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Consume Complete Modal (부분 차감 / 전량 소비 선택) */}
      {consumeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
              <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                {consumeTarget.name} 소비 완료 처리
              </h3>
              <button
                type="button"
                onClick={() => setConsumeTarget(null)}
                className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmConsume} className="mt-5 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-[#526559] mb-1.5">
                  <span className="font-semibold text-[#33473B]">
                    소비한 수량 ({consumeTarget.unit})
                  </span>
                  <span className="tabular-nums font-num">
                    현재 보유: {consumeTarget.quantity}
                    {consumeTarget.unit}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.1"
                    max={consumeTarget.quantity}
                    step="any"
                    value={consumeQtyInput}
                    onChange={(e) => setConsumeQtyInput(e.target.value)}
                    className="flex-1 input-modern px-3.5 py-2.5 text-sm font-num tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setConsumeQtyInput(String(consumeTarget.quantity))}
                    className="btn-secondary-sage px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    전량 소비
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-[#64786B] leading-relaxed">
                  전량({consumeTarget.quantity}
                  {consumeTarget.unit}) 입력 시 냉장고 목록에서 제거되며, 일부 입력 시 남은 수량만 유지됩니다.
                </p>
              </div>

              <div className="pt-3 border-t border-[#EBF1EC] space-y-2.5">
                <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#122118]">
                  <input
                    type="checkbox"
                    checked={logRescueSaving}
                    onChange={(e) => setLogRescueSaving(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#164E35]"
                  />
                  <span>폐기 전 알뜰 소비로 절약 리포트에 기록하기</span>
                </label>
                {logRescueSaving && (
                  <div>
                    <label className="block text-xs text-[#526559] mb-1">
                      절약 반영 금액 (원, 구매가 참고: {formatKRW(consumeTarget.purchasePrice ?? 0)})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={rescueSavingInput}
                      onChange={(e) => setRescueSavingInput(e.target.value)}
                      className="w-full input-modern px-3.5 py-2 text-xs font-num tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setConsumeTarget(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] text-xs font-medium text-[#33473B] hover:bg-[#F4F8F5] whitespace-nowrap"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-primary-gradient min-h-[42px] px-5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                >
                  소비 완료 반영
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discard & Waste Record Modal */}
      {discardTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
              <h3 className="text-base sm:text-lg font-bold text-[#B91C1C]">
                {discardTarget.name} 폐기 처리 및 손실 기록
              </h3>
              <button
                type="button"
                onClick={() => setDiscardTarget(null)}
                className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDiscard} className="mt-5 space-y-4">
              <p className="text-xs text-[#526559] leading-relaxed">
                해당 식재료를 냉장고 목록에서 제거하고 절약 리포트의 폐기 비용 내역에 기록합니다.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                  폐기 손실 금액 (원)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={discardAmountInput}
                  onChange={(e) => setDiscardAmountInput(e.target.value)}
                  className="w-full input-modern px-3.5 py-2.5 text-sm font-num tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                  폐기 원인 분류 (1개월 낭비 원인 진단에 반영)
                </label>
                <select
                  value={discardCauseTag}
                  onChange={(e) => setDiscardCauseTag(e.target.value as WasteCauseTag)}
                  className="w-full input-modern px-3.5 py-2.5 text-sm bg-white"
                >
                  {WASTE_CAUSE_TAGS.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                  상세 폐기 사유 메모
                </label>
                <input
                  type="text"
                  value={discardReason}
                  onChange={(e) => setDiscardReason(e.target.value)}
                  className="w-full input-modern px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setDiscardTarget(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] text-xs font-medium text-[#33473B] hover:bg-[#F4F8F5] whitespace-nowrap"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-semibold hover:bg-[#991B1B] transition-colors whitespace-nowrap"
                >
                  폐기 및 목록 제거
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
