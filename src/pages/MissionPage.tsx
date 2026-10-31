import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChefHat,
  Database,
  Gift,
  Loader2,
  Lock,
  RefreshCw,
  Refrigerator,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import {
  ChefSecretMode,
  FridgeMission,
  Ingredient,
  IngredientCategory,
  IngredientLifecycleEvent,
  MissionGameState,
  PageId,
  WasteRecord,
} from '../types';
import { generatePersonalizedMissionsViaAi } from '../utils/api';
import { evaluateExpiry, formatKRW } from '../utils/dateUtils';
import {
  computeWasteRootCauseAnalytics,
  FRIDGE_RANKS,
  getRankByPoints,
  PORTION_STORAGE_CHEATSHEET,
} from '../utils/gameAndWasteUtils';

interface MissionPageProps {
  ingredients: Ingredient[];
  wastes: WasteRecord[];
  lifecycleEvents: IngredientLifecycleEvent[];
  missionGame: MissionGameState;
  onCompleteMissionWithAction: (
    mission: FridgeMission,
    options?: {
      consumeIngredientId?: string;
      consumeQty?: number;
      logSavingKRW?: number;
    }
  ) => void;
  onClaimRoundAllClearBonus: () => void;
  onStartNextMissionRound: (customMissions?: FridgeMission[]) => void;
  onRefreshCurrentRoundMissions: (customMissions?: FridgeMission[]) => void;
  onNavigateWithSecretMode: (mode: ChefSecretMode) => void;
  onNavigate: (page: PageId) => void;
  onLoadSampleData: () => void;
}

const MISSION_KIND_LABELS: Record<FridgeMission['kind'], string> = {
  urgent_rescue: '임박 구출 미션',
  combo_cook: '무지출 집밥 미션',
  category_focus: '낭비 방어 미션',
  expiry_audit: '기한 점검 미션',
  zero_waste_register: '냉장고 정리 미션',
};

export const MissionPage: React.FC<MissionPageProps> = ({
  ingredients,
  wastes,
  lifecycleEvents,
  missionGame,
  onCompleteMissionWithAction,
  onClaimRoundAllClearBonus,
  onStartNextMissionRound,
  onRefreshCurrentRoundMissions,
  onNavigateWithSecretMode,
  onNavigate,
  onLoadSampleData,
}) => {
  const { currentRank, nextRank, progressPercent, pointsToNext } = useMemo(
    () => getRankByPoints(missionGame.totalPoints),
    [missionGame.totalPoints]
  );

  const wasteSummary = useMemo(
    () => computeWasteRootCauseAnalytics(lifecycleEvents, wastes, []),
    [lifecycleEvents, wastes]
  );

  const completedInRoundCount = useMemo(
    () => missionGame.activeMissions.filter((m) => m.completed).length,
    [missionGame.activeMissions]
  );

  const allMissionsCompleted =
    missionGame.activeMissions.length > 0 &&
    completedInRoundCount === missionGame.activeMissions.length;

  // Interactive Mission Execution Modal State
  const [executingMission, setExecutingMission] = useState<FridgeMission | null>(null);
  const [selectedIngId, setSelectedIngId] = useState<string>('');
  const [deductStock, setDeductStock] = useState<boolean>(true);
  const [consumeQtyInput, setConsumeQtyInput] = useState<string>('1');
  const [recordSaving, setRecordSaving] = useState<boolean>(true);
  const [savingKRWInput, setSavingKRWInput] = useState<string>('3000');

  // Apprentice Storage Cheatsheet Modal State
  const [cheatsheetOpen, setCheatsheetOpen] = useState<boolean>(false);
  const [cheatsheetCategory, setCheatsheetCategory] = useState<'전체' | IngredientCategory>('전체');

  // Gemini AI Personalized Mission Generation State
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const openMissionModal = (mission: FridgeMission) => {
    setExecutingMission(mission);

    // Pre-match fridge ingredient by targetItemName or targetCategory
    const normTarget = mission.targetItemName.trim().toLowerCase();
    const matched =
      (normTarget
        ? ingredients.find(
            (i) =>
              i.name.toLowerCase().includes(normTarget) ||
              normTarget.includes(i.name.toLowerCase())
          )
        : undefined) ||
      (mission.targetCategory
        ? ingredients.find((i) => i.category === mission.targetCategory)
        : undefined) ||
      ingredients[0];

    if (matched) {
      setSelectedIngId(matched.id);
      setDeductStock(
        mission.kind === 'urgent_rescue' ||
          mission.kind === 'combo_cook' ||
          mission.kind === 'category_focus'
      );
      setConsumeQtyInput(String(Math.min(1, matched.quantity)));
      setSavingKRWInput(String(matched.purchasePrice || 3000));
    } else {
      setSelectedIngId('');
      setDeductStock(false);
      setConsumeQtyInput('1');
      setSavingKRWInput('3000');
    }

    setRecordSaving(mission.kind === 'urgent_rescue' || mission.kind === 'combo_cook');
  };

  const selectedIngredientObj = useMemo(
    () => ingredients.find((i) => i.id === selectedIngId) || null,
    [ingredients, selectedIngId]
  );

  const handleConfirmMissionComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!executingMission) return;

    const qty = selectedIngredientObj
      ? Math.min(
          selectedIngredientObj.quantity,
          Math.max(0.1, Number(consumeQtyInput) || 1)
        )
      : 1;
    const savingAmt = recordSaving ? Math.max(0, Math.round(Number(savingKRWInput) || 0)) : 0;

    onCompleteMissionWithAction(executingMission, {
      consumeIngredientId: deductStock && selectedIngredientObj ? selectedIngredientObj.id : undefined,
      consumeQty: deductStock && selectedIngredientObj ? qty : undefined,
      logSavingKRW: savingAmt > 0 ? savingAmt : undefined,
    });
    setExecutingMission(null);
  };

  const handleGenerateAiMissions = async () => {
    if (ingredients.length === 0) {
      setAiError('냉장고에 식재료를 1종 이상 등록한 뒤 AI 맞춤 미션을 생성해보세요.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await generatePersonalizedMissionsViaAi({
        ingredients: ingredients.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          storage: item.storage,
          daysRemaining: evaluateExpiry(item.expiryDate).daysRemaining,
        })),
        topWasteCauses: wasteSummary.causeDistribution.slice(0, 2).map((c) => c.causeTag),
        rankTitle: currentRank.title,
      });

      if (missionGame.roundBonusClaimed) {
        onStartNextMissionRound(res.missions);
      } else {
        onRefreshCurrentRoundMissions(res.missions);
      }
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'AI 맞춤 미션 생성 중 일시적인 오류가 발생했습니다. 다시 시도해주세요.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const filteredCheatsheet = useMemo(() => {
    if (cheatsheetCategory === '전체') return PORTION_STORAGE_CHEATSHEET;
    return PORTION_STORAGE_CHEATSHEET.filter((c) => c.category === cheatsheetCategory);
  }, [cheatsheetCategory]);

  return (
    <div className="space-y-7">
      {/* Top Rank, Title & Progression Hero */}
      <section className="surface-card overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Left Botanical Rank Showcase */}
          <div className="lg:col-span-7 p-6 sm:p-8 bg-gradient-to-br from-[#0D3321] via-[#164E35] to-[#236B4A] text-white flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#C7EDD4]">
                <span className="font-semibold">
                  냉파 등급 시스템 · Lv.{currentRank.level} 칭호 보유 중
                </span>
                <span className="font-num tabular-nums">
                  라운드 올클리어 보너스 +{currentRank.allClearBonusPoints}점 적용
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-white/15 border border-white/25 text-[#FDE68A]">
                    <Trophy className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      {currentRank.title}
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-white/85 leading-relaxed">
                      {currentRank.tagline}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-xs text-[#C7EDD4]">누적 냉파 점수</div>
                  <div className="mt-0.5 text-3xl sm:text-4xl font-bold font-num tabular-nums text-white leading-none">
                    {missionGame.totalPoints.toLocaleString('ko-KR')}
                    <span className="ml-1 text-sm font-semibold text-[#C7EDD4]">점</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Level Progress Bar */}
            <div className="mt-7 pt-5 border-t border-white/15 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-num tabular-nums">
                <span className="text-white/90 font-medium">
                  {nextRank
                    ? `다음 칭호 '${nextRank.title}' (Lv.${nextRank.level}) 승급 진행률`
                    : '최고 명예 등급 달성 완료'}
                </span>
                <span className="font-bold text-[#FDE68A]">
                  {nextRank
                    ? `${pointsToNext.toLocaleString('ko-KR')}점 남음 (${progressPercent}%)`
                    : 'MAX LEVEL'}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-black/25 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#86EFAC] to-[#FDE68A] transition-opacity duration-200"
                  style={{ width: `${Math.max(4, progressPercent)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right Game Stats & Quick Benefit Access */}
          <div className="lg:col-span-5 p-6 sm:p-8 bg-white flex flex-col justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#122118]">
                미션 수행 현황 및 활성 혜택
              </h2>
              <p className="mt-1 text-xs text-[#526559] leading-relaxed">
                식재료 등록·소비 완료·레시피 조리를 실천하거나 아래 미션 보드에서 직접 인증하면 점수가 적립됩니다.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-3 py-4 border-y border-[#EBF1EC] text-center">
                <div>
                  <div className="text-[11px] font-medium text-[#64786B]">현재 라운드</div>
                  <div className="mt-1 text-xl font-bold text-[#122118] font-num tabular-nums">
                    #{missionGame.roundNumber}
                  </div>
                </div>
                <div className="border-x border-[#EBF1EC]">
                  <div className="text-[11px] font-medium text-[#64786B]">올클리어 횟수</div>
                  <div className="mt-1 text-xl font-bold text-[#164E35] font-num tabular-nums">
                    {missionGame.completedRounds}회
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-[#64786B]">완료한 미션</div>
                  <div className="mt-1 text-xl font-bold text-[#122118] font-num tabular-nums">
                    {missionGame.completedMissionsCount}개
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              {missionGame.totalPoints >= 200 ? (
                <button
                  type="button"
                  onClick={() => setCheatsheetOpen(true)}
                  className="btn-secondary-sage w-full inline-flex items-center justify-between min-h-[42px] px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[#164E35]" />
                    <span>[견습생 혜택] 1인 가구 소분·냉동 치트시트 열람</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#164E35]" />
                </button>
              ) : (
                <div className="flex items-center justify-between text-xs text-[#526559] pt-1">
                  <span>200점 달성 시 소분·냉동 보관 치트시트가 해금됩니다</span>
                  <span className="font-num font-bold text-[#164E35] tabular-nums">
                    {missionGame.totalPoints}/200점
                  </span>
                </div>
              )}

              {ingredients.length === 0 && (
                <button
                  type="button"
                  onClick={onLoadSampleData}
                  className="w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#EEF5F0] text-[#164E35] text-xs font-bold hover:bg-[#DCE8DF] transition-colors whitespace-nowrap"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>샘플 식재료 6종 불러와 맞춤 미션 체험하기</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Active Round 3-Mission Quest Board */}
      <section className="surface-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#EBF1EC]">
          <div>
            <div className="text-xs font-semibold text-[#164E35] font-num tabular-nums">
              ROUND #{missionGame.roundNumber} · 완료 {completedInRoundCount} /{' '}
              {missionGame.activeMissions.length}
            </div>
            <h3 className="mt-1 text-lg sm:text-xl font-bold text-[#122118]">
              내 냉장고 상황 맞춤형 냉파 미션 보드
            </h3>
            <p className="text-xs sm:text-sm text-[#526559] mt-0.5">
              현재 보유 식재료의 남은 소비기한과 과거 폐기 패턴을 반영한 3가지 미션입니다. 모두 완수하면 올클리어 보너스 점수를 받습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onRefreshCurrentRoundMissions()}
              disabled={aiLoading}
              className="btn-secondary-sage inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#164E35]" />
              <span>보유 재료 기준 재구성</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateAiMissions}
              disabled={aiLoading}
              className="btn-primary-gradient inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-55 whitespace-nowrap shrink-0"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>AI 미션 설계 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Gemini AI 맞춤 미션 받기</span>
                </>
              )}
            </button>
          </div>
        </div>

        {aiError && (
          <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#B91C1C]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{aiError}</span>
            </div>
            {ingredients.length > 0 && (
              <button
                type="button"
                onClick={handleGenerateAiMissions}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#FCA5A5] font-semibold whitespace-nowrap shrink-0"
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        {/* Round All-Clear Bonus Celebration Banner */}
        {allMissionsCompleted && !missionGame.roundBonusClaimed && (
          <div className="rounded-2xl bg-[#F2FAF5] border border-[#B7DEC5] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#164E35] text-[#FDE68A]">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-bold text-[#122118]">
                  축하합니다! 라운드 #{missionGame.roundNumber}의 모든 미션을 달성했습니다
                </div>
                <p className="text-xs sm:text-sm text-[#3D5245] mt-0.5 tabular-nums">
                  현재 등급({currentRank.title}) 혜택으로 올클리어 완수 보너스{' '}
                  <strong className="text-[#164E35] font-num">
                    +{currentRank.allClearBonusPoints}점
                  </strong>
                  을 즉시 획득할 수 있습니다.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClaimRoundAllClearBonus}
              className="btn-primary-gradient inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0"
            >
              <Trophy className="h-4 w-4" />
              <span>올클리어 보상 +{currentRank.allClearBonusPoints}점 받기</span>
            </button>
          </div>
        )}

        {allMissionsCompleted && missionGame.roundBonusClaimed && (
          <div className="rounded-2xl bg-[#F5F9F6] border border-[#D4E4DA] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm sm:text-base font-bold text-[#164E35]">
                라운드 #{missionGame.roundNumber} 올클리어 보너스 수령 완료!
              </div>
              <p className="text-xs sm:text-sm text-[#526559] mt-0.5">
                남은 냉장고 재료에 맞춰 새로운 라운드 미션 3종에 바로 도전해보세요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onStartNextMissionRound()}
              className="btn-primary-gradient inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0"
            >
              <span>다음 라운드 (#{missionGame.roundNumber + 1}) 시작하기</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 3 Mission Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {missionGame.activeMissions.map((mission, index) => {
            const pct = Math.min(
              100,
              Math.round((mission.currentCount / Math.max(1, mission.requiredCount)) * 100)
            );
            const liveMatchedItem = mission.targetItemName
              ? ingredients.find(
                  (i) =>
                    i.name.includes(mission.targetItemName) ||
                    mission.targetItemName.includes(i.name)
                )
              : undefined;

            return (
              <article
                key={mission.id}
                className={`rounded-[18px] border p-6 flex flex-col justify-between transition-colors ${
                  mission.completed
                    ? 'bg-[#F6FBF8] border-[#C5DFCF]'
                    : 'bg-white border-[#E2ECE5] hover:border-[#B8D1C0]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#526559]">
                      0{index + 1}. {MISSION_KIND_LABELS[mission.kind] || '냉파 미션'}
                    </span>
                    <span className="font-num font-bold text-[#164E35] tabular-nums">
                      +{mission.points}점
                    </span>
                  </div>

                  <h4 className="mt-2.5 text-base font-bold text-[#122118] leading-snug">
                    {mission.title}
                  </h4>
                  <p className="mt-2 text-xs sm:text-sm text-[#526559] leading-relaxed">
                    {mission.description}
                  </p>

                  {/* Target Metadata Line (Unboxed Zero-Pill Text) */}
                  <div className="mt-4 pt-3.5 border-t border-[#EBF1EC] space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[#526559] tabular-nums">
                      <span>
                        {mission.targetItemName
                          ? `목표 식재료: ${mission.targetItemName}`
                          : mission.targetCategory
                          ? `목표 분류: ${mission.targetCategory}`
                          : '내 냉장고 연동 미션'}
                        {liveMatchedItem
                          ? ` · 보유 ${liveMatchedItem.quantity}${liveMatchedItem.unit}`
                          : ''}
                      </span>
                      <span className="font-num font-bold text-[#122118]">
                        {mission.currentCount}/{mission.requiredCount}
                      </span>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-[#E9F0EC] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#164E35]"
                        style={{ width: `${mission.completed ? 100 : pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Action Footer */}
                <div className="mt-5 pt-2 flex items-center gap-2">
                  {mission.completed ? (
                    <div className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#E6F4EC] text-[#14532D] text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>미션 달성 완료 (+{mission.points}점 획득)</span>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openMissionModal(mission)}
                        className="btn-primary-gradient flex-1 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>미션 수행·인증</span>
                      </button>

                      {mission.kind === 'combo_cook' ? (
                        <button
                          type="button"
                          onClick={() => onNavigate('recipes')}
                          className="btn-secondary-sage min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                          title="AI 레시피 추천으로 이동"
                        >
                          <ChefHat className="h-4 w-4 text-[#164E35]" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate(mission.kind === 'expiry_audit' ? 'expiry' : 'fridge')
                          }
                          className="btn-secondary-sage min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                          title="식재료 관리 화면으로 이동"
                        >
                          <Refrigerator className="h-4 w-4 text-[#164E35]" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Rank Titles & Tier Perks Roadmap */}
      <section className="surface-card p-6 sm:p-8 space-y-6">
        <div className="pb-4 border-b border-[#EBF1EC] flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-[#164E35]">점수 누적 승급 시스템</div>
            <h3 className="mt-1 text-lg sm:text-xl font-bold text-[#122118]">
              냉파 등급별 칭호 및 전용 혜택 안내
            </h3>
            <p className="text-xs sm:text-sm text-[#526559] mt-0.5">
              미션 완수로 점수가 쌓이면 상위 칭호가 자동 부여되며 식비 절약을 돕는 전용 기능이 해금됩니다.
            </p>
          </div>
          <div className="text-xs text-[#526559] font-num tabular-nums">
            현재 보유 점수: <strong className="text-[#122118]">{missionGame.totalPoints}점</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FRIDGE_RANKS.map((tier) => {
            const unlocked = missionGame.totalPoints >= tier.minPoints;
            const isCurrent = currentRank.id === tier.id;

            return (
              <div
                key={tier.id}
                className={`rounded-[18px] border p-6 flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-[#F5FAF7] border-[#164E35]'
                    : unlocked
                    ? 'bg-white border-[#CFE2D5]'
                    : 'bg-[#FAFBF9] border-[#E5ECE7]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          unlocked
                            ? 'bg-[#164E35] text-white'
                            : 'bg-[#E8EEEA] text-[#6A7F72]'
                        }`}
                      >
                        {unlocked ? (
                          <Award className="h-4 w-4" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                      </span>
                      <div>
                        <div className="text-base font-bold text-[#122118]">
                          Lv.{tier.level} {tier.title}
                        </div>
                        <div className="text-xs text-[#526559] font-num tabular-nums">
                          승급 기준: {tier.minPoints.toLocaleString('ko-KR')}점 이상 · 올클리어 +
                          {tier.allClearBonusPoints}점
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-bold whitespace-nowrap shrink-0 ${
                        isCurrent
                          ? 'text-[#164E35]'
                          : unlocked
                          ? 'text-[#15803D]'
                          : 'text-[#768B7E]'
                      }`}
                    >
                      {isCurrent
                        ? '현재 칭호'
                        : unlocked
                        ? '해금 완료'
                        : `${tier.minPoints - missionGame.totalPoints}점 더 필요`}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-[#526559] leading-relaxed">{tier.tagline}</p>

                  <ul className="mt-4 pt-3.5 border-t border-[#E6EFE9] space-y-2.5">
                    {tier.unlockedPerks.map((perk) => (
                      <li key={perk.id} className="text-xs leading-relaxed">
                        <div className="font-bold text-[#122118]">· {perk.name}</div>
                        <div className="text-[#526559] pl-2.5 mt-0.5">{perk.description}</div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Interactive Perk Action Button when Unlocked */}
                <div className="mt-5 pt-3 border-t border-[#EBF1EC]">
                  {tier.id === 'novice' && (
                    <span className="text-xs font-semibold text-[#164E35]">
                      기본 활성화 혜택 · 상단 미션 보드 이용 가능
                    </span>
                  )}

                  {tier.id === 'apprentice' &&
                    (unlocked ? (
                      <button
                        type="button"
                        onClick={() => setCheatsheetOpen(true)}
                        className="btn-secondary-sage w-full min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <BookOpen className="h-3.5 w-3.5 text-[#164E35]" />
                        <span>1인 가구 소분·냉동 보관 치트시트 열기</span>
                      </button>
                    ) : (
                      <span className="text-xs text-[#64786B] tabular-nums">
                        200점 달성 시 소분·냉동 보관 치트시트가 열립니다
                      </span>
                    ))}

                  {tier.id === 'expert' &&
                    (unlocked ? (
                      <button
                        type="button"
                        onClick={() => onNavigateWithSecretMode('onepan')}
                        className="btn-primary-gradient w-full min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <ChefHat className="h-3.5 w-3.5" />
                        <span>고수 전용 · 원팬 설거지 최소화 AI 레시피 쓰기</span>
                      </button>
                    ) : (
                      <span className="text-xs text-[#64786B] tabular-nums">
                        500점 달성 시 AI 레시피 [원팬 설거지 최소화 모드]가 해금됩니다
                      </span>
                    ))}

                  {tier.id === 'master' &&
                    (unlocked ? (
                      <button
                        type="button"
                        onClick={() => onNavigateWithSecretMode('omakase')}
                        className="btn-primary-gradient w-full min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>마스터 전용 · 무지출 냉장고 오마카세 코스 열기</span>
                      </button>
                    ) : (
                      <span className="text-xs text-[#64786B] tabular-nums">
                        900점 달성 시 AI 레시피 [무지출 냉장고 오마카세 코스]가 해금됩니다
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent Mission Completion History */}
      <section className="surface-card p-6 sm:p-7 space-y-4">
        <div className="pb-3 border-b border-[#EBF1EC] flex items-center justify-between">
          <h3 className="text-base font-bold text-[#122118]">최근 미션 점수 획득 내역</h3>
          <span className="text-xs text-[#64786B] font-num tabular-nums">
            최근 {missionGame.recentLogs.length}건
          </span>
        </div>

        {missionGame.recentLogs.length === 0 ? (
          <p className="py-8 text-center text-xs sm:text-sm text-[#64786B]">
            아직 완료한 미션 기록이 없습니다. 위 미션 카드에서 첫 미션을 수행하고 점수를 쌓아보세요!
          </p>
        ) : (
          <ul className="divide-y divide-[#EEF3F0]">
            {missionGame.recentLogs.slice(0, 10).map((log) => (
              <li
                key={log.id}
                className="py-3 flex items-center justify-between gap-3 text-xs sm:text-sm"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-[#122118]">{log.title}</span>
                  <span className="ml-2 text-xs text-[#64786B] font-num tabular-nums">
                    {log.completedAt.slice(0, 10)}
                  </span>
                </div>
                <span className="font-num font-bold text-[#164E35] tabular-nums shrink-0">
                  +{log.pointsEarned}점
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Interactive Mission Completion Modal */}
      {executingMission && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
              <div>
                <div className="text-xs font-semibold text-[#164E35] font-num tabular-nums">
                  미션 완료 보상 +{executingMission.points}점
                </div>
                <h3 className="mt-0.5 text-base sm:text-lg font-bold text-[#122118]">
                  미션 수행 및 실천 인증
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExecutingMission(null)}
                className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmMissionComplete} className="mt-5 space-y-4">
              <div className="rounded-xl bg-[#F5FAF7] border border-[#D7E6DC] p-3.5">
                <div className="text-xs sm:text-sm font-bold text-[#122118]">
                  {executingMission.title}
                </div>
                <p className="mt-1 text-xs text-[#526559] leading-relaxed">
                  {executingMission.description}
                </p>
              </div>

              {ingredients.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                      이번 미션에 활용한 내 냉장고 식재료 선택
                    </label>
                    <select
                      value={selectedIngId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedIngId(nextId);
                        const found = ingredients.find((i) => i.id === nextId);
                        if (found) {
                          setConsumeQtyInput(String(Math.min(1, found.quantity)));
                          setSavingKRWInput(String(found.purchasePrice || 3000));
                        }
                      }}
                      className="w-full input-modern px-3.5 py-2.5 text-xs sm:text-sm"
                    >
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.quantity}
                          {ing.unit} · {ing.storage})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedIngredientObj && (
                    <div className="space-y-2 pt-1">
                      <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#122118]">
                        <input
                          type="checkbox"
                          checked={deductStock}
                          onChange={(e) => setDeductStock(e.target.checked)}
                          className="h-4 w-4 rounded accent-[#164E35]"
                        />
                        <span>실제 내 냉장고 재고 수량도 함께 차감하기 (소비 이력 자동 누적)</span>
                      </label>

                      {deductStock && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0.1"
                            max={selectedIngredientObj.quantity}
                            step="any"
                            value={consumeQtyInput}
                            onChange={(e) => setConsumeQtyInput(e.target.value)}
                            className="flex-1 input-modern px-3.5 py-2 text-xs font-num tabular-nums"
                          />
                          <span className="text-xs text-[#526559] font-num">
                            {selectedIngredientObj.unit} (보유 {selectedIngredientObj.quantity}
                            {selectedIngredientObj.unit})
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-[#FFFBEB] border border-[#F3DCAC] p-3.5 text-xs text-[#92400E] space-y-2">
                  <p>
                    현재 냉장고에 등록된 식재료가 없습니다. 식재료를 먼저 등록하면 실제 재고 차감과 함께 미션을 수행할 수 있습니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExecutingMission(null);
                        onNavigate('fridge');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#E6C78B] font-semibold text-[#78350F] whitespace-nowrap"
                    >
                      식재료 등록하러 가기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onLoadSampleData();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#164E35] font-semibold text-white whitespace-nowrap"
                    >
                      샘플 6종 즉시 불러오기
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-[#EBF1EC] space-y-2">
                <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#122118]">
                  <input
                    type="checkbox"
                    checked={recordSaving}
                    onChange={(e) => setRecordSaving(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#164E35]"
                  />
                  <span>절약 리포트에 이번 미션 절약 금액 함께 기록하기</span>
                </label>

                {recordSaving && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={savingKRWInput}
                      onChange={(e) => setSavingKRWInput(e.target.value)}
                      className="flex-1 input-modern px-3.5 py-2 text-xs font-num tabular-nums"
                    />
                    <span className="text-xs text-[#526559] font-num whitespace-nowrap">
                      원 절약 ({formatKRW(Number(savingKRWInput) || 0)})
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setExecutingMission(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] text-xs font-medium text-[#33473B] hover:bg-[#F4F8F5] whitespace-nowrap"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-primary-gradient min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
                >
                  미션 완료 및 +{executingMission.points}점 받기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apprentice Unlocked Perk Modal: 1-Person Portion & Freezer Cheatsheet */}
      {cheatsheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
              <div>
                <div className="text-xs font-semibold text-[#164E35]">
                  냉파 견습생(Lv.2) 이상 전용 해금 혜택
                </div>
                <h3 className="mt-0.5 text-lg font-bold text-[#122118]">
                  1인 가구 단골 폐기 식재료 소분·냉동 보관 치트시트
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCheatsheetOpen(false)}
                className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {(['전체', '채소', '가공식품', '유제품', '육류'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCheatsheetCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    cheatsheetCategory === cat
                      ? 'btn-primary-gradient text-white'
                      : 'bg-[#F2F7F4] text-[#3D5245] hover:bg-[#E4EFE8]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="mt-5 divide-y divide-[#EBF1EC]">
              {filteredCheatsheet.map((guide) => (
                <div key={guide.item} className="py-4 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm sm:text-base font-bold text-[#122118]">
                      {guide.item}
                    </span>
                    <span className="text-xs font-num tabular-nums text-[#164E35] font-semibold">
                      기본 {guide.usualShelfLife} → 소분 시 {guide.extendedLife}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#4A5D51] leading-relaxed">
                    {guide.method}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-[#EBF1EC] flex justify-end">
              <button
                type="button"
                onClick={() => setCheatsheetOpen(false)}
                className="btn-primary-gradient min-h-[42px] px-5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
              >
                확인 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
