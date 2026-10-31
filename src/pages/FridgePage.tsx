import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Database,
  Edit3,
  Plus,
  Refrigerator,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  Ingredient,
  INGREDIENT_CATEGORIES,
  IngredientCategory,
  STORAGE_LOCATIONS,
  StorageLocation,
} from '../types';
import {
  evaluateExpiry,
  formatKoreanShortDate,
  formatKRW,
  sortIngredientsByPriority,
} from '../utils/dateUtils';
import { getIngredientImage } from '../utils/visualAssets';
import { ResilientImage } from '../components/ResilientImage';

interface FridgePageProps {
  ingredients: Ingredient[];
  hasSampleData: boolean;
  onOpenAddModal: () => void;
  onOpenEditModal: (item: Ingredient) => void;
  onOpenPhotoModal: () => void;
  onRequestDelete: (item: Ingredient) => void;
  onLoadSampleData: () => void;
  onRemoveSampleData: () => void;
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

export const FridgePage: React.FC<FridgePageProps> = ({
  ingredients,
  hasSampleData,
  onOpenAddModal,
  onOpenEditModal,
  onOpenPhotoModal,
  onRequestDelete,
  onLoadSampleData,
  onRemoveSampleData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory | '전체'>('전체');
  const [selectedStorage, setSelectedStorage] = useState<StorageLocation | '전체'>('전체');

  const filteredIngredients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = ingredients.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      if (selectedCategory !== '전체' && item.category !== selectedCategory) return false;
      if (selectedStorage !== '전체' && item.storage !== selectedStorage) return false;
      return true;
    });
    return sortIngredientsByPriority(filtered);
  }, [ingredients, searchQuery, selectedCategory, selectedStorage]);

  const storageSummary = useMemo(() => {
    return {
      냉장: ingredients.filter((i) => i.storage === '냉장').length,
      냉동: ingredients.filter((i) => i.storage === '냉동').length,
      실온: ingredients.filter((i) => i.storage === '실온').length,
    };
  }, [ingredients]);

  return (
    <div className="space-y-6">
      {/* Top Action & Filter Studio */}
      <section className="surface-card p-6 sm:p-7">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#164E35] tabular-nums">
              총 {ingredients.length}종 보관 중 · 냉장 {storageSummary.냉장} · 냉동{' '}
              {storageSummary.냉동} · 실온 {storageSummary.실온}
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#122118]">
              내 냉장고 식재료 관리
            </h2>
            <p className="text-xs sm:text-sm text-[#526559] mt-1">
              직접 입력하거나 식재료 사진을 업로드해 Gemini AI로 간편하게 검수 등록하세요.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenPhotoModal}
              className="btn-secondary-sage inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <Camera className="h-4 w-4 text-[#164E35]" />
              <span>사진으로 자동 인식</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddModal}
              className="btn-primary-gradient inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>식재료 직접 등록</span>
            </button>
          </div>
        </div>

        {/* Search & Storage Filter Row */}
        <div className="mt-6 pt-5 border-t border-[#EBF1EC] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-[#64786B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="식재료 이름 검색 (예: 애호박, 두부, 우유)"
              className="w-full input-modern pl-10 pr-9 py-2.5 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[#64786B] hover:text-[#122118] hover:bg-[#EEF4F0]"
                aria-label="검색어 지우기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Storage Segmented Filter */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#EEF4F0]">
              {(['전체', ...STORAGE_LOCATIONS] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setSelectedStorage(loc)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                    selectedStorage === loc
                      ? 'bg-white text-[#122118] shadow-xs'
                      : 'text-[#526559] hover:text-[#122118]'
                  }`}
                >
                  {loc === '전체' ? '보관 전체' : loc}
                </button>
              ))}
            </div>

            {hasSampleData && (
              <button
                type="button"
                onClick={onRemoveSampleData}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#B45309] bg-[#FFFBEB] border border-[#F5DFB8] hover:bg-[#FEF3C7] transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>샘플 데이터 삭제</span>
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['전체', ...INGREDIENT_CATEGORIES] as const).map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                  active
                    ? 'btn-primary-gradient text-white'
                    : 'bg-[#F3F8F5] text-[#456250] hover:bg-[#E6F0EA] hover:text-[#122118]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* Ingredient Card Grid */}
      {ingredients.length === 0 ? (
        <section className="surface-card p-12 sm:p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF5F0] text-[#164E35]">
            <Refrigerator className="h-7 w-7" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[#122118]">
            아직 등록된 식재료가 없습니다
          </h3>
          <p className="mt-1.5 text-xs sm:text-sm text-[#526559] max-w-md mx-auto leading-relaxed">
            냉장고에 있는 재료를 등록하거나 사진을 찍어 업로드해보세요. 처음이라면 샘플 식재료 6종을 불러와 바로 테스트할 수 있습니다.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenAddModal}
              className="btn-primary-gradient inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>첫 식재료 등록하기</span>
            </button>
            <button
              type="button"
              onClick={onLoadSampleData}
              className="btn-secondary-sage inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <Database className="h-4 w-4 text-[#164E35]" />
              <span>샘플 데이터 불러오기</span>
            </button>
          </div>
        </section>
      ) : filteredIngredients.length === 0 ? (
        <section className="surface-card p-12 text-center">
          <p className="text-sm sm:text-base font-bold text-[#122118]">
            검색어 또는 필터 조건에 일치하는 식재료가 없습니다.
          </p>
          <p className="mt-1 text-xs text-[#526559]">
            다른 카테고리를 선택하거나 필터를 초기화해 전체 보관 목록을 확인하세요.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('전체');
              setSelectedStorage('전체');
            }}
            className="btn-secondary-sage mt-4 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
          >
            필터 초기화
          </button>
        </section>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIngredients.map((item) => {
            const ev = evaluateExpiry(item.expiryDate);
            const bar = getFreshnessBarProps(ev.daysRemaining, ev.isExpired);

            return (
              <article
                key={item.id}
                className="surface-card-interactive overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <div className="relative h-44 w-full overflow-hidden bg-[#EEF4F0]">
                    <ResilientImage
                      src={getIngredientImage(item)}
                      alt={item.name}
                      fallbackLabel={item.name}
                      className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs font-medium text-white/95">
                      <span>
                        {item.storage} 보관 · {item.category}
                      </span>
                      {item.isSample && (
                        <span className="text-[#FDE68A] font-semibold">샘플 데이터</span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-lg font-bold text-[#122118] truncate">{item.name}</h3>
                      <span className="text-lg font-bold text-[#164E35] font-num tabular-nums shrink-0">
                        {item.quantity}
                        {item.unit}
                      </span>
                    </div>

                    {/* Visual Freshness Gauge + Explicit Semantic Status */}
                    <div className="mt-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#64786B]">소비기한 상태</span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                            ev.status === 'urgent'
                              ? 'text-[#B45309]'
                              : ev.status === 'check_needed'
                              ? 'text-[#B91C1C]'
                              : 'text-[#15803D]'
                          }`}
                        >
                          {ev.status === 'urgent' && <Clock className="h-3.5 w-3.5" />}
                          {ev.status === 'check_needed' && (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          )}
                          {ev.status === 'safe' && <CheckCircle2 className="h-3.5 w-3.5" />}
                          <span>
                            {ev.statusLabel} ({ev.dDayText})
                          </span>
                        </span>
                      </div>

                      <div
                        className="h-1.5 w-full rounded-full bg-[#EEF3EF] overflow-hidden"
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

                    <div className="mt-4 pt-3.5 border-t border-[#EBF1EC] space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[#526559] tabular-nums">
                        <span>구매일 · 소비기한</span>
                        <span className="font-num">
                          {formatKoreanShortDate(item.purchaseDate)} ~{' '}
                          {formatKoreanShortDate(item.expiryDate)}
                        </span>
                      </div>

                      {item.purchasePrice !== undefined && (
                        <div className="flex items-center justify-between text-[#526559] tabular-nums">
                          <span>기록 구매가</span>
                          <span className="font-num font-semibold text-[#122118]">
                            {formatKRW(item.purchasePrice)}
                          </span>
                        </div>
                      )}

                      {item.memo && (
                        <p className="text-[#64786B] truncate pt-0.5">메모: {item.memo}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-5 sm:px-6 pb-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenEditModal(item)}
                    className="btn-secondary-sage inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>수정</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestDelete(item)}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[#F3D2D2] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>삭제</span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
};
