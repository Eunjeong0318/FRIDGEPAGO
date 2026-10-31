import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Clock,
  Database,
  PieChart,
  Plus,
  Refrigerator,
  SearchCheck,
  ShoppingCart,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  Ingredient,
  MissionGameState,
  PageId,
  Recipe,
  RecipeMissingIngredient,
  UserProfile,
} from '../types';
import {
  evaluateExpiry,
  formatKoreanFullDate,
  formatKRW,
  sortIngredientsByPriority,
} from '../utils/dateUtils';
import { getRankByPoints } from '../utils/gameAndWasteUtils';
import { getIngredientImage, getRecipeImage } from '../utils/visualAssets';
import { ResilientImage } from '../components/ResilientImage';
import heroKitchenImg from '../assets/images/fresh_veggies_counter_1793338593611.jpg';

interface DashboardPageProps {
  profile: UserProfile;
  ingredients: Ingredient[];
  displayRecipes: Recipe[];
  currentMonthSavedAmount: number;
  currentMonthCookedCount: number;
  missionGame: MissionGameState;
  lifecycleEventCount: number;
  hasSampleData: boolean;
  onNavigate: (page: PageId) => void;
  onOpenAddIngredient: () => void;
  onSelectRecipe: (recipe: Recipe) => void;
  onAddMissingToShopping: (items: RecipeMissingIngredient[], recipeTitle: string) => void;
  onLoadSampleData: () => void;
  onRemoveSampleData: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  profile,
  ingredients,
  displayRecipes,
  currentMonthSavedAmount,
  currentMonthCookedCount,
  missionGame,
  lifecycleEventCount,
  hasSampleData,
  onNavigate,
  onOpenAddIngredient,
  onSelectRecipe,
  onAddMissingToShopping,
  onLoadSampleData,
  onRemoveSampleData,
}) => {
  const rankInfo = React.useMemo(
    () => getRankByPoints(missionGame.totalPoints),
    [missionGame.totalPoints]
  );

  const completedInRound = React.useMemo(
    () => missionGame.activeMissions.filter((m) => m.completed).length,
    [missionGame.activeMissions]
  );

  const sortedByPriority = React.useMemo(
    () => sortIngredientsByPriority(ingredients),
    [ingredients]
  );

  const attentionNeededItems = React.useMemo(
    () =>
      sortedByPriority.filter((item) => {
        const ev = evaluateExpiry(item.expiryDate);
        return ev.status === 'urgent' || ev.status === 'check_needed';
      }),
    [sortedByPriority]
  );

  const previewIngredients = React.useMemo(() => ingredients.slice(0, 6), [ingredients]);

  const coldCount = ingredients.filter((i) => i.storage === '냉장').length;
  const frozenCount = ingredients.filter((i) => i.storage === '냉동').length;
  const roomCount = ingredients.filter((i) => i.storage === '실온').length;

  return (
    <div className="space-y-8">
      {/* Editorial 2-Column Split Hero */}
      <section className="surface-card overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-9 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-[#164E35] tabular-nums">
                {formatKoreanFullDate()} · {profile.householdLabel} · Lv.{rankInfo.currentRank.level}{' '}
                {rankInfo.currentRank.title} ({missionGame.totalPoints.toLocaleString()}점)
              </div>
              <h2 className="mt-3 text-2xl sm:text-[32px] font-bold text-[#122118] leading-[1.28] [text-wrap:balance]">
                반갑습니다, {profile.nickname}님.
                <br />
                <span className="text-[#164E35]">냉장고 속 재료가 최고의 셰프가 되는 순간.</span>
              </h2>
              <p className="mt-3 text-sm sm:text-[15px] text-[#526559] leading-relaxed max-w-xl">
                보유 식재료의 신선도와 소비기한을 한눈에 파악하고, 추가 장보기 부담을 줄인 오늘의 맞춤 한 끼를 시작해보세요.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('recipes')}
                  className="btn-primary-gradient inline-flex items-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
                >
                  <ChefHat className="h-4 w-4" />
                  <span>AI 레시피 추천하기</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAddIngredient}
                  className="btn-secondary-sage inline-flex items-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4 text-[#164E35]" />
                  <span>식재료 추가하기</span>
                </button>
              </div>
            </div>

            {/* Sample Data Helper Strip */}
            {ingredients.length === 0 ? (
              <div className="mt-7 pt-5 border-t border-[#E8F0EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs sm:text-sm text-[#526559]">
                  처음 오셨나요? 애호박·달걀·두부·대파·양파·우유 샘플 6종으로 모든 기능을 바로 체험해보세요.
                </div>
                <button
                  type="button"
                  onClick={onLoadSampleData}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 rounded-xl bg-[#EEF5F0] text-[#164E35] text-xs font-bold hover:bg-[#DCE8DF] transition-colors whitespace-nowrap shrink-0"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>샘플 데이터 불러오기</span>
                </button>
              </div>
            ) : (
              hasSampleData && (
                <div className="mt-7 pt-4 border-t border-[#E8F0EA] flex flex-wrap items-center justify-between gap-2 text-xs text-[#5A6E61]">
                  <span>
                    현재 시연용 샘플 데이터가 함께 표시되고 있습니다. 직접 입력한 데이터는 안전하게 분리됩니다.
                  </span>
                  <button
                    type="button"
                    onClick={onRemoveSampleData}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#B45309] hover:underline whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>샘플 데이터 삭제</span>
                  </button>
                </div>
              )
            )}
          </div>

          {/* Right Editorial Culinary Visual Panel */}
          <div className="lg:col-span-5 relative min-h-[220px] lg:min-h-full overflow-hidden bg-[#E9F1EC]">
            <ResilientImage
              src={heroKitchenImg}
              alt="신선한 주방 식재료 쇼케이스"
              fallbackLabel="냉파고 스마트 홈키친"
              className="h-full w-full lg:h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B2619]/80 via-[#0B2619]/20 to-transparent" />
            <div className="absolute bottom-5 left-6 right-6 text-white">
              <div className="text-xs font-medium text-white/80">실시간 홈키친 브리핑</div>
              <div className="mt-1 text-sm sm:text-base font-semibold leading-snug">
                {ingredients.length === 0
                  ? '냉장고 재료를 등록하면 소비 우선순위와 맞춤 요리가 준비됩니다.'
                  : attentionNeededItems.length > 0
                  ? `우선 활용이 필요한 식재료 ${attentionNeededItems.length}종이 대기 중입니다.`
                  : `보유 식재료 ${ingredients.length}종 모두 여유 있게 보관 중입니다.`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Core KPI Cards (Full-Width Strip Below Hero) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <button
          type="button"
          onClick={() => onNavigate('fridge')}
          className="surface-card-interactive text-left p-6 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#526559]">등록된 식재료 총 개수</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EDF5F0] text-[#164E35]">
              <Refrigerator className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-[32px] font-bold text-[#122118] font-num tabular-nums leading-none">
              {ingredients.length}
              <span className="ml-1.5 text-sm font-semibold text-[#526559]">종</span>
            </span>
            <span className="text-xs font-semibold text-[#164E35] inline-flex items-center gap-1">
              냉장고 관리 <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-[#EDF3EF] text-xs text-[#64786B] tabular-nums">
            냉장 {coldCount} · 냉동 {frozenCount} · 실온 {roomCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('expiry')}
          className="surface-card-interactive text-left p-6 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#526559]">소비기한 확인 필요 품목</span>
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                attentionNeededItems.length > 0
                  ? 'bg-[#FEF6E9] text-[#B45309]'
                  : 'bg-[#EDF5F0] text-[#164E35]'
              }`}
            >
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span
              className={`text-[32px] font-bold font-num tabular-nums leading-none ${
                attentionNeededItems.length > 0 ? 'text-[#B45309]' : 'text-[#122118]'
              }`}
            >
              {attentionNeededItems.length}
              <span className="ml-1.5 text-sm font-semibold text-[#526559]">종</span>
            </span>
            <span className="text-xs font-semibold text-[#164E35] inline-flex items-center gap-1">
              기한 점검 <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-[#EDF3EF] text-xs text-[#64786B]">
            {attentionNeededItems.length > 0
              ? 'D-3 이내 임박 또는 날짜 확인이 필요한 재료'
              : '현재 시급하게 소진할 식재료가 없습니다'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('report')}
          className="surface-card-interactive text-left p-6 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#526559]">이번 달 절약 예상 금액</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EDF5F0] text-[#164E35]">
              <PieChart className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-[32px] font-bold text-[#164E35] font-num tabular-nums leading-none">
              {formatKRW(currentMonthSavedAmount)}
            </span>
            <span className="text-xs font-semibold text-[#164E35] inline-flex items-center gap-1">
              리포트 <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-[#EDF3EF] text-xs text-[#64786B]">
            {currentMonthCookedCount > 0
              ? `이번 달 실제 기록된 냉파 요리·소비 ${currentMonthCookedCount}회 합산`
              : '레시피 조리 완료 기록 시 실제 절약액이 반영됩니다'}
          </div>
        </button>
      </section>

      {/* Mission Mini-Game & 1-Month Waste Diagnosis Quick Strip */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        <div className="surface-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-[#164E35] tabular-nums">
                냉파 미션 미니게임 · 라운드 {missionGame.roundNumber} ({completedInRound}/
                {missionGame.activeMissions.length} 완료)
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EDF5F0] text-[#164E35]">
                <Trophy className="h-4 w-4" />
              </span>
            </div>
            <h3 className="mt-2 text-lg font-bold text-[#122118] tabular-nums">
              현재 칭호: Lv.{rankInfo.currentRank.level} {rankInfo.currentRank.title} ·{' '}
              {missionGame.totalPoints.toLocaleString()}점
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-[#526559] leading-relaxed">
              {rankInfo.nextRank
                ? `보유 재료 맞춤 미션 3종을 모두 완수하면 올클리어 보너스(+${rankInfo.currentRank.allClearBonusPoints}점)를 받습니다. '${rankInfo.nextRank.title}' 승급까지 ${rankInfo.pointsToNext}점 남았습니다.`
                : '최고 등급 냉파 마스터 혜택을 모두 해금했습니다. 시크릿 오마카세 레시피를 활용해보세요.'}
            </p>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#EBF1EC] flex items-center justify-between gap-3">
            <span className="text-xs text-[#64786B] truncate">
              {missionGame.activeMissions.find((m) => !m.completed)?.title ||
                '이번 라운드 모든 미션 완료! 보너스를 수령하세요'}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('missions')}
              className="btn-secondary-sage inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <span>냉파 미션 열기</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="surface-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-[#164E35] tabular-nums">
                식재료 생애주기 추적 · 누적 기록 {lifecycleEventCount}건
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EDF5F0] text-[#164E35]">
                <SearchCheck className="h-4 w-4" />
              </span>
            </div>
            <h3 className="mt-2 text-lg font-bold text-[#122118]">
              1개월 식재료 낭비 구체적 원인 진단 &amp; 해결 처방
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-[#526559] leading-relaxed">
              식재료 등록·소비·폐기 기록이 쌓이면 과다구매, 소분 미흡, 소비기한 방치 등 구체적인 낭비 원인을 찾아 맞춤형 해결책을 제안합니다.
            </p>
          </div>
          <div className="mt-4 pt-3.5 border-t border-[#EBF1EC] flex items-center justify-between gap-3">
            <span className="text-xs text-[#64786B]">
              1개월 누적 예시 데이터로 즉시 AI 원인 분석 시연 가능
            </span>
            <button
              type="button"
              onClick={() => onNavigate('report')}
              className="btn-secondary-sage inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <span>낭비 원인 진단 보기</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Split Row: Priority Consumption & Fridge Preview */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* High-Priority Consumption List */}
        <div className="lg:col-span-5 surface-card p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#EBF1EC]">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#122118]">소비 우선순위 식재료</h3>
                <p className="text-xs text-[#526559] mt-0.5">
                  임박하거나 기한 확인이 필요한 순서로 자동 정렬됩니다
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('expiry')}
                className="text-xs font-semibold text-[#164E35] hover:underline whitespace-nowrap shrink-0"
              >
                전체 보기
              </button>
            </div>

            {sortedByPriority.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-[#526559]">등록된 식재료가 없습니다.</p>
                <p className="text-xs text-[#64786B] mt-1">
                  식재료를 추가하면 소비기한 우선순위가 자동 계산됩니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#EEF3F0] mt-2">
                {sortedByPriority.slice(0, 5).map((item) => {
                  const ev = evaluateExpiry(item.expiryDate);
                  return (
                    <li
                      key={item.id}
                      className="py-3.5 flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 border border-[#E2ECE5]">
                          <ResilientImage
                            src={getIngredientImage(item)}
                            alt={item.name}
                            fallbackLabel={item.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[#122118] truncate">{item.name}</div>
                          <div className="text-xs text-[#5A6E61] tabular-nums">
                            {item.quantity}
                            {item.unit} · {item.storage}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5 text-xs font-semibold tabular-nums">
                        {ev.status === 'urgent' && (
                          <>
                            <Clock className="h-3.5 w-3.5 text-[#B45309]" />
                            <span className="text-[#B45309]">
                              {ev.statusLabel} · {ev.dDayText}
                            </span>
                          </>
                        )}
                        {ev.status === 'check_needed' && (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5 text-[#B91C1C]" />
                            <span className="text-[#B91C1C]">
                              {ev.statusLabel} · {ev.dDayText}
                            </span>
                          </>
                        )}
                        {ev.status === 'safe' && (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#15803D]" />
                            <span className="text-[#15803D]">
                              {ev.statusLabel} · {ev.dDayText}
                            </span>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {attentionNeededItems.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[#EBF1EC]">
              <button
                type="button"
                onClick={() => onNavigate('recipes')}
                className="btn-secondary-sage w-full py-2.5 px-4 rounded-xl text-xs font-bold"
              >
                임박 재료 우선 활용 AI 레시피 받기
              </button>
            </div>
          )}
        </div>

        {/* Fridge Ingredient Preview */}
        <div className="lg:col-span-7 surface-card p-6 sm:p-7">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#EBF1EC]">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#122118]">내 냉장고 미리보기</h3>
              <p className="text-xs text-[#526559] mt-0.5">현재 보관 중인 식재료 현황입니다</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('fridge')}
              className="text-xs font-semibold text-[#164E35] hover:underline whitespace-nowrap shrink-0"
            >
              내 냉장고 열기
            </button>
          </div>

          {previewIngredients.length === 0 ? (
            <div className="py-14 text-center space-y-3.5">
              <p className="text-sm font-medium text-[#526559]">아직 보관 중인 식재료가 없습니다.</p>
              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={onOpenAddIngredient}
                  className="btn-primary-gradient px-4 py-2.5 rounded-xl text-xs font-semibold"
                >
                  식재료 직접 등록
                </button>
                <button
                  type="button"
                  onClick={onLoadSampleData}
                  className="btn-secondary-sage px-4 py-2.5 rounded-xl text-xs font-semibold"
                >
                  샘플 6종 불러오기
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {previewIngredients.map((item) => {
                const ev = evaluateExpiry(item.expiryDate);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate('fridge')}
                    className="group text-left rounded-2xl overflow-hidden border border-[#E3ECE6] hover:border-[#B5CEBD] bg-[#FAFDFB] transition-all duration-150 hover:-translate-y-0.5"
                  >
                    <div className="relative h-28 w-full overflow-hidden">
                      <ResilientImage
                        src={getIngredientImage(item)}
                        alt={item.name}
                        fallbackLabel={item.name}
                        className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                      <span className="absolute bottom-2 left-2.5 text-[11px] font-medium text-white/95">
                        {item.storage} · {item.category}
                      </span>
                    </div>
                    <div className="p-3.5">
                      <div className="flex items-baseline justify-between gap-1.5">
                        <span className="text-sm font-bold text-[#122118] truncate">
                          {item.name}
                        </span>
                        <span className="text-xs font-bold text-[#164E35] font-num tabular-nums shrink-0">
                          {item.quantity}
                          {item.unit}
                        </span>
                      </div>
                      <div
                        className={`mt-1 text-[11px] font-semibold tabular-nums ${
                          ev.status === 'urgent'
                            ? 'text-[#B45309]'
                            : ev.status === 'check_needed'
                            ? 'text-[#B91C1C]'
                            : 'text-[#15803D]'
                        }`}
                      >
                        {ev.statusLabel} · {ev.dDayText}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Today's 3 AI Recommended Menu Cards */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-[#122118]">오늘의 AI 추천 메뉴</h3>
            <p className="text-xs sm:text-sm text-[#526559] mt-0.5">
              보유 식재료와 소비기한을 기준으로 엄선한 오늘의 추천 요리 3선입니다
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('recipes')}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#164E35] hover:underline whitespace-nowrap shrink-0"
          >
            <span>맞춤 조건으로 AI 레시피 새로 생성</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {displayRecipes.length === 0 ? (
          <div className="surface-card p-12 text-center">
            <AlertCircle className="h-8 w-8 text-[#64786B] mx-auto mb-3" />
            <h4 className="text-base font-bold text-[#122118]">
              식재료를 등록하면 오늘의 추천 메뉴 3가지가 표시됩니다
            </h4>
            <p className="mt-1.5 text-xs sm:text-sm text-[#526559]">
              냉장고에 있는 재료를 등록하거나 샘플 데이터를 불러와 AI 셰프 추천을 시작해보세요.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onOpenAddIngredient}
                className="btn-primary-gradient min-h-[42px] px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold"
              >
                식재료 등록하기
              </button>
              <button
                type="button"
                onClick={onLoadSampleData}
                className="btn-secondary-sage min-h-[42px] px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold"
              >
                샘플 데이터 불러오기
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayRecipes.slice(0, 3).map((recipe) => (
              <article
                key={recipe.id}
                className="surface-card-interactive overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <div className="relative h-48 w-full overflow-hidden">
                    <ResilientImage
                      src={getRecipeImage(recipe)}
                      alt={recipe.title}
                      fallbackLabel={recipe.title}
                      className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 text-xs font-medium text-white/95 tabular-nums">
                      {recipe.cuisine} · 조리 {recipe.cookingTimeMinutes}분 · 난이도 {recipe.difficulty}
                    </div>
                  </div>
                  <div className="p-5 sm:p-6">
                    <h4 className="text-base sm:text-lg font-bold text-[#122118] line-clamp-1">
                      {recipe.title}
                    </h4>
                    <p className="mt-1.5 text-xs sm:text-sm text-[#526559] leading-relaxed line-clamp-2">
                      {recipe.description}
                    </p>

                    <div className="mt-4 pt-3.5 border-t border-[#EBF1EC] space-y-1.5 text-xs">
                      <div className="text-[#15803D] font-semibold truncate">
                        보유 재료 ({recipe.ownedIngredients.length}) ·{' '}
                        <span className="font-normal text-[#26382E]">
                          {recipe.ownedIngredients.length > 0
                            ? recipe.ownedIngredients.map((o) => o.name).join(', ')
                            : '없음'}
                        </span>
                      </div>
                      <div className="text-[#B45309] font-semibold truncate">
                        부족 재료 ({recipe.missingIngredients.length}) ·{' '}
                        <span className="font-normal text-[#526559]">
                          {recipe.missingIngredients.length > 0
                            ? recipe.missingIngredients.map((m) => m.name).join(', ')
                            : '추가 구매 필요 없음'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-5 sm:px-6 pb-5 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectRecipe(recipe)}
                    className="btn-primary-gradient flex-1 min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap"
                  >
                    레시피 상세보기
                  </button>
                  {recipe.missingIngredients.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onAddMissingToShopping(recipe.missingIngredients, recipe.title)
                      }
                      className="btn-secondary-sage min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                      title="부족한 재료를 장보기 리스트에 담기"
                    >
                      <ShoppingCart className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
