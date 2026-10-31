import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Loader2,
  PieChart,
  Plus,
  RefreshCw,
  SearchCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  ExpenseRecord,
  INGREDIENT_CATEGORIES,
  IngredientCategory,
  IngredientLifecycleEvent,
  LifecycleAction,
  MonthlyAiSummary,
  RecipeUsageRecord,
  WASTE_CAUSE_TAGS,
  WasteCauseAnalysis,
  WasteCauseTag,
  WasteRecord,
} from '../types';
import { analyzeWasteCausesViaAi, generateMonthlyAiSummary } from '../utils/api';
import {
  formatKRW,
  formatMonthLabel,
  getCurrentMonthString,
  getPreviousMonthString,
  getTodayDateString,
} from '../utils/dateUtils';
import { computeWasteRootCauseAnalytics } from '../utils/gameAndWasteUtils';

interface ReportPageProps {
  expenses: ExpenseRecord[];
  wastes: WasteRecord[];
  recipeUsages: RecipeUsageRecord[];
  monthlyAiSummaries: Record<string, MonthlyAiSummary>;
  lifecycleEvents: IngredientLifecycleEvent[];
  wasteAnalyses: Record<string, WasteCauseAnalysis>;
  monthlyBudget: number;
  hasSampleReportData: boolean;
  onAddExpense: (rec: Omit<ExpenseRecord, 'id'>) => void;
  onDeleteExpense: (id: string) => void;
  onAddWaste: (rec: Omit<WasteRecord, 'id'>, causeTag?: WasteCauseTag) => void;
  onDeleteWaste: (id: string) => void;
  onAddRecipeUsage: (rec: Omit<RecipeUsageRecord, 'id'>) => void;
  onDeleteRecipeUsage: (id: string) => void;
  onSaveMonthlyAiSummary: (summary: MonthlyAiSummary) => void;
  onSaveWasteAnalysis: (analysis: WasteCauseAnalysis) => void;
  onLoadSampleReportData: () => void;
  onLoadSampleLifecycleData: () => void;
  onRemoveSampleData: () => void;
}

const CATEGORY_COLORS: Record<IngredientCategory, string> = {
  채소: '#164E35',
  과일: '#237A53',
  육류: '#386650',
  해산물: '#2F7670',
  유제품: '#5B8C71',
  알류: '#7FA68F',
  곡류: '#A4C1AE',
  가공식품: '#D97706',
  기타: '#768B7E',
};

function shiftMonth(monthStr: string, delta: number): string {
  const [yStr, mStr] = monthStr.split('-');
  const d = new Date(Number(yStr), Number(mStr) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const ReportPage: React.FC<ReportPageProps> = ({
  expenses,
  wastes,
  recipeUsages,
  monthlyAiSummaries,
  lifecycleEvents,
  wasteAnalyses,
  monthlyBudget,
  hasSampleReportData,
  onAddExpense,
  onDeleteExpense,
  onAddWaste,
  onDeleteWaste,
  onAddRecipeUsage,
  onDeleteRecipeUsage,
  onSaveMonthlyAiSummary,
  onSaveWasteAnalysis,
  onLoadSampleReportData,
  onLoadSampleLifecycleData,
  onRemoveSampleData,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthString());
  const prevMonth = useMemo(() => getPreviousMonthString(selectedMonth), [selectedMonth]);

  const [reportMode, setReportMode] = useState<'monthly_overview' | 'waste_diagnosis'>(
    'monthly_overview'
  );
  const [activeLedgerTab, setActiveLedgerTab] = useState<'expense' | 'waste' | 'usage'>('expense');
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | LifecycleAction>('all');

  // Form states
  const [expName, setExpName] = useState('');
  const [expCategory, setExpCategory] = useState<IngredientCategory>('채소');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(getTodayDateString());

  const [wasteName, setWasteName] = useState('');
  const [wasteCategory, setWasteCategory] = useState<IngredientCategory>('채소');
  const [wasteCauseTag, setWasteCauseTag] = useState<WasteCauseTag>('소비기한 미확인·방치');
  const [wasteAmount, setWasteAmount] = useState('');
  const [wasteReason, setWasteReason] = useState('');

  const [usageTitle, setUsageTitle] = useState('');
  const [usageIngredients, setUsageIngredients] = useState('');
  const [usageSavedAmount, setUsageSavedAmount] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [wasteAiLoading, setWasteAiLoading] = useState(false);
  const [wasteAiError, setWasteAiError] = useState<string | null>(null);

  // Filter records by selectedMonth & prevMonth
  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.month === selectedMonth),
    [expenses, selectedMonth]
  );
  const monthWastes = useMemo(
    () => wastes.filter((w) => w.month === selectedMonth),
    [wastes, selectedMonth]
  );
  const monthUsages = useMemo(
    () => recipeUsages.filter((r) => r.month === selectedMonth),
    [recipeUsages, selectedMonth]
  );

  const prevExpenses = useMemo(
    () => expenses.filter((e) => e.month === prevMonth),
    [expenses, prevMonth]
  );
  const prevWastes = useMemo(
    () => wastes.filter((w) => w.month === prevMonth),
    [wastes, prevMonth]
  );
  const prevUsages = useMemo(
    () => recipeUsages.filter((r) => r.month === prevMonth),
    [recipeUsages, prevMonth]
  );

  const purchaseTotal = useMemo(
    () => monthExpenses.reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses]
  );
  const wasteTotal = useMemo(
    () => monthWastes.reduce((sum, w) => sum + w.wastedAmount, 0),
    [monthWastes]
  );
  const savedTotal = useMemo(
    () => monthUsages.reduce((sum, r) => sum + r.savedAmount, 0),
    [monthUsages]
  );

  const prevPurchaseTotal = useMemo(
    () => prevExpenses.reduce((sum, e) => sum + e.amount, 0),
    [prevExpenses]
  );
  const prevWasteTotal = useMemo(
    () => prevWastes.reduce((sum, w) => sum + w.wastedAmount, 0),
    [prevWastes]
  );
  const prevSavedTotal = useMemo(
    () => prevUsages.reduce((sum, r) => sum + r.savedAmount, 0),
    [prevUsages]
  );

  const budgetUsagePct = useMemo(() => {
    if (monthlyBudget <= 0) return 0;
    return Math.round((purchaseTotal / monthlyBudget) * 100);
  }, [purchaseTotal, monthlyBudget]);

  const hasAnyDataInMonth =
    monthExpenses.length > 0 || monthWastes.length > 0 || monthUsages.length > 0;
  const hasAnyDataAtAll =
    expenses.length > 0 ||
    wastes.length > 0 ||
    recipeUsages.length > 0 ||
    lifecycleEvents.length > 0;

  // 1-Month Root-Cause Waste Analytics
  const wasteAnalytics = useMemo(
    () => computeWasteRootCauseAnalytics(lifecycleEvents, wastes, expenses),
    [lifecycleEvents, wastes, expenses]
  );

  const filteredLifecycleEvents = useMemo(() => {
    if (lifecycleFilter === 'all') return lifecycleEvents;
    return lifecycleEvents.filter((ev) => ev.action === lifecycleFilter);
  }, [lifecycleEvents, lifecycleFilter]);

  const savedWasteAnalysis = wasteAnalyses[selectedMonth];

  // Category Breakdown + SVG Donut Segments
  const categoryBreakdown = useMemo(() => {
    const map = new Map<IngredientCategory, number>();
    for (const e of monthExpenses) {
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
    }
    return Array.from(map.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        ratio: purchaseTotal > 0 ? Math.round((amount / purchaseTotal) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses, purchaseTotal]);

  const donutSegments = useMemo(() => {
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    let cumulative = 0;

    return categoryBreakdown.map((item) => {
      const fraction = purchaseTotal > 0 ? item.amount / purchaseTotal : 0;
      const length = fraction * circumference;
      const offset = -cumulative;
      cumulative += length;
      return {
        ...item,
        radius,
        circumference,
        strokeDasharray: `${length} ${circumference}`,
        strokeDashoffset: offset,
        color: CATEGORY_COLORS[item.category],
      };
    });
  }, [categoryBreakdown, purchaseTotal]);

  // Deterministic, truthful Korean summary text based strictly on recorded values
  const factualSummaryText = useMemo(() => {
    if (!hasAnyDataInMonth) {
      return `${formatMonthLabel(
        selectedMonth
      )}에는 아직 기록된 식재료 구매·폐기·레시피 활용 내역이 없습니다. 아래에서 실제 내역을 입력하거나 예시 데이터를 불러오면 분석 리포트가 생성됩니다.`;
    }
    const parts: string[] = [];
    parts.push(
      `${formatMonthLabel(selectedMonth)} 총 식재료 지출은 ${formatKRW(purchaseTotal)}(${
        monthExpenses.length
      }건)입니다.`
    );
    if (prevPurchaseTotal > 0) {
      const diff = purchaseTotal - prevPurchaseTotal;
      if (diff < 0) {
        parts.push(`지난달 대비 식재료 지출이 ${formatKRW(Math.abs(diff))} 감소했습니다.`);
      } else if (diff > 0) {
        parts.push(`지난달 대비 식재료 지출이 ${formatKRW(diff)} 증가했습니다.`);
      }
    }
    if (monthUsages.length > 0) {
      parts.push(
        `보유 재료를 활용한 냉파 요리를 ${monthUsages.length}회 실천하여 총 ${formatKRW(
          savedTotal
        )}을 절약했습니다.`
      );
    }
    if (wasteTotal > 0) {
      parts.push(
        `식재료 폐기로 인한 손실이 ${formatKRW(
          wasteTotal
        )} 발생했으니 1개월 낭비 원인 진단 탭에서 구체적 개선안을 확인해보세요.`
      );
    } else {
      parts.push('이번 달에 기록된 식재료 폐기 손실은 0원입니다.');
    }
    return parts.join(' ');
  }, [
    hasAnyDataInMonth,
    selectedMonth,
    purchaseTotal,
    monthExpenses.length,
    prevPurchaseTotal,
    monthUsages.length,
    savedTotal,
    wasteTotal,
  ]);

  const savedAiSummary = monthlyAiSummaries[selectedMonth];

  const handleRequestAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await generateMonthlyAiSummary({
        targetMonth: formatMonthLabel(selectedMonth),
        currentMonthStats: {
          purchaseTotal,
          wasteTotal,
          savedAmount: savedTotal,
          cookedCount: monthUsages.length,
          purchaseCount: monthExpenses.length,
          wasteCount: monthWastes.length,
          categoryBreakdown: categoryBreakdown.map((c) => ({
            category: c.category,
            amount: c.amount,
          })),
        },
        previousMonthStats: {
          purchaseTotal: prevPurchaseTotal,
          wasteTotal: prevWasteTotal,
          savedAmount: prevSavedTotal,
          cookedCount: prevUsages.length,
        },
      });

      onSaveMonthlyAiSummary({
        month: selectedMonth,
        headline: result.headline,
        summaryParagraph: result.summaryParagraph,
        actionTips: result.actionTips,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'AI 월간 분석 생성 중 오류가 발생했습니다. 다시 시도해주세요.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleRequestWasteCauseAi = async () => {
    if (lifecycleEvents.length === 0 && wastes.length === 0) {
      setWasteAiError(
        '아직 누적된 등록·소비·폐기 기록이 없습니다. 식재료를 사용/폐기하거나 [1개월 누적 기록 예시 불러오기]로 시연 데이터를 먼저 준비해주세요.'
      );
      return;
    }

    setWasteAiLoading(true);
    setWasteAiError(null);
    try {
      const res = await analyzeWasteCausesViaAi({
        targetMonth: formatMonthLabel(selectedMonth),
        trackingSpanDays: wasteAnalytics.trackingSpanDays,
        lifecycleSummary: {
          registeredCount: wasteAnalytics.registeredCount,
          consumedCount: wasteAnalytics.consumedCount,
          wastedCount: wasteAnalytics.wastedCount,
          consumptionRatePct: wasteAnalytics.consumptionRatePct,
          wasteRatePct: wasteAnalytics.wasteRatePct,
          totalWastedKRW: wasteAnalytics.totalWastedKRW,
          avgDaysHeldBeforeWaste: wasteAnalytics.avgDaysHeldBeforeWaste,
          topCauses: wasteAnalytics.causeDistribution.map((c) => ({
            causeTag: c.causeTag,
            count: c.count,
            amountKRW: c.amountKRW,
          })),
        },
        events: lifecycleEvents.slice(0, 60),
      });

      onSaveWasteAnalysis({
        month: selectedMonth,
        ...res,
      });
    } catch (err) {
      setWasteAiError(
        err instanceof Error
          ? err.message
          : 'AI 낭비 원인 진단 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      setWasteAiLoading(false);
    }
  };

  const handleAddExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.round(Number(expAmount));
    if (!expName.trim()) {
      setFormError('구매 품목 또는 내역명을 입력해주세요.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('구매 금액을 0원보다 크게 입력해주세요.');
      return;
    }
    setFormError(null);
    const chosenDate = expDate || `${selectedMonth}-01`;
    onAddExpense({
      date: chosenDate,
      month: selectedMonth,
      itemName: expName.trim(),
      category: expCategory,
      amount: amt,
    });
    setExpName('');
    setExpAmount('');
  };

  const handleAddWasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.round(Number(wasteAmount));
    if (!wasteName.trim()) {
      setFormError('폐기한 식재료 이름을 입력해주세요.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('폐기 손실 금액을 0원보다 크게 입력해주세요.');
      return;
    }
    setFormError(null);
    const detailNote = wasteReason.trim();
    const formattedReason = detailNote ? `[${wasteCauseTag}] ${detailNote}` : `[${wasteCauseTag}]`;
    onAddWaste(
      {
        date: getTodayDateString(),
        month: selectedMonth,
        itemName: wasteName.trim(),
        category: wasteCategory,
        wastedAmount: amt,
        reason: formattedReason,
      },
      wasteCauseTag
    );
    setWasteName('');
    setWasteAmount('');
    setWasteReason('');
  };

  const handleAddUsageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Math.round(Number(usageSavedAmount));
    if (!usageTitle.trim()) {
      setFormError('조리한 레시피 또는 요리명을 입력해주세요.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('절약한 금액을 0원보다 크게 입력해주세요.');
      return;
    }
    setFormError(null);
    onAddRecipeUsage({
      date: getTodayDateString(),
      month: selectedMonth,
      recipeTitle: usageTitle.trim(),
      usedIngredients: usageIngredients
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      savedAmount: amt,
    });
    setUsageTitle('');
    setUsageIngredients('');
    setUsageSavedAmount('');
  };

  // Month-over-Month Bar Chart Calculations
  const maxChartVal = Math.max(
    10000,
    purchaseTotal,
    prevPurchaseTotal,
    wasteTotal,
    prevWasteTotal,
    savedTotal,
    prevSavedTotal
  );

  const comparisonGroups = [
    {
      label: '식재료 구매비',
      prev: prevPurchaseTotal,
      curr: purchaseTotal,
      currColor: '#164E35',
    },
    {
      label: '폐기 손실 비용',
      prev: prevWasteTotal,
      curr: wasteTotal,
      currColor: '#B91C1C',
    },
    {
      label: '냉파 절약 금액',
      prev: prevSavedTotal,
      curr: savedTotal,
      currColor: '#15803D',
    },
  ];

  const trackingProgressPct = Math.min(100, Math.round((wasteAnalytics.trackingSpanDays / 30) * 100));

  return (
    <div className="space-y-6">
      {/* Month Selector, Mode Switcher & Top Summary */}
      <section className="surface-card p-6 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#164E35]">
              투명한 가계부형 식비 분석 &amp; 1개월 낭비 원인 추적
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[#122118]">
              월간 식비 리포트 및 식재료 낭비 진단
            </h2>
            <p className="text-xs sm:text-sm text-[#526559] mt-1">
              실제 기록한 식재료 등록·소비·폐기 데이터를 바탕으로 식비 흐름과 구체적인 낭비 원인을 정밀 진단합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Segmented Mode Selector */}
            <div className="inline-flex items-center gap-1 p-1 bg-[#EEF4F0] rounded-2xl">
              <button
                type="button"
                onClick={() => setReportMode('monthly_overview')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 ${
                  reportMode === 'monthly_overview'
                    ? 'bg-white text-[#122118] shadow-xs'
                    : 'text-[#526559] hover:text-[#122118]'
                }`}
              >
                월간 식비·절약 현황
              </button>
              <button
                type="button"
                onClick={() => setReportMode('waste_diagnosis')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
                  reportMode === 'waste_diagnosis'
                    ? 'btn-primary-gradient text-white'
                    : 'text-[#164E35] hover:bg-white/60'
                }`}
              >
                1개월 낭비 원인 진단 ({wasteAnalytics.wastedCount}건)
              </button>
            </div>

            {/* Month Picker */}
            <div className="inline-flex items-center gap-2 bg-[#EEF4F0] p-1.5 rounded-2xl">
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftMonth(m, -1))}
                className="p-2 rounded-xl bg-white text-[#33473B] hover:text-[#164E35] shadow-2xs transition-colors"
                aria-label="이전 달"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-sm font-bold text-[#122118] font-num tabular-nums whitespace-nowrap">
                {formatMonthLabel(selectedMonth)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth((m) => shiftMonth(m, 1))}
                className="p-2 rounded-xl bg-white text-[#33473B] hover:text-[#164E35] shadow-2xs transition-colors"
                aria-label="다음 달"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Empty Data Honesty Banner + Optional Sample Report Loader */}
        {!hasAnyDataAtAll ? (
          <div className="mt-6 pt-5 border-t border-[#EBF1EC] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-[#122118]">
                아직 입력된 지출·소비·폐기 기록이 없습니다 (임의의 성과를 생성하지 않습니다)
              </div>
              <p className="text-xs text-[#526559] mt-1 leading-relaxed">
                식재료를 등록·소비·폐기하면 기록이 자동 누적됩니다. 바로 기능을 확인하려면 예시 데이터를 불러오세요.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onLoadSampleReportData}
                className="btn-secondary-sage inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Database className="h-3.5 w-3.5 text-[#164E35]" />
                <span>월간 식비 예시 불러오기</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onLoadSampleLifecycleData();
                  setReportMode('waste_diagnosis');
                }}
                className="btn-primary-gradient inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <SearchCheck className="h-3.5 w-3.5" />
                <span>1개월 낭비 누적 기록 예시 불러오기</span>
              </button>
            </div>
          </div>
        ) : (
          hasSampleReportData && (
            <div className="mt-5 pt-4 border-t border-[#EBF1EC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#526559]">
              <span>시연용 리포트 또는 1개월 누적 예시 내역이 포함되어 있습니다.</span>
              <button
                type="button"
                onClick={onRemoveSampleData}
                className="inline-flex items-center gap-1 font-semibold text-[#B45309] hover:underline whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>샘플 데이터 삭제</span>
              </button>
            </div>
          )
        )}
      </section>

      {reportMode === 'waste_diagnosis' ? (
        /* ======================================================================
           VIEW 2: 1-Month Ingredient Waste Root-Cause Diagnosis & AI Prescription
           ====================================================================== */
        <div className="space-y-6">
          {/* 30-Day Lifecycle Accumulation Tracker */}
          <section className="surface-card p-6 sm:p-7 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#EBF1EC]">
              <div>
                <div className="text-xs font-semibold text-[#164E35] font-num tabular-nums">
                  식재료 생애주기 추적 · 누적 {wasteAnalytics.trackingSpanDays}일 / 30일 기준
                </div>
                <h3 className="mt-1 text-lg sm:text-xl font-bold text-[#122118]">
                  1개월 식재료 소비·폐기 누적 추적 현황
                </h3>
                <p className="text-xs sm:text-sm text-[#526559] mt-0.5 leading-relaxed">
                  사용자가 식재료를 등록하고 소비 완료하거나 폐기할 때마다 보관 일수·보관 위치·폐기 원인이 자동으로 쌓이며, 1개월 데이터가 모이면 습관성 낭비 원인을 정밀 진단합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={onLoadSampleLifecycleData}
                className="btn-secondary-sage inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Database className="h-3.5 w-3.5 text-[#164E35]" />
                <span>1개월 누적 기록 예시 불러오기</span>
              </button>
            </div>

            {/* 30-Day Progress Bar */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-num tabular-nums">
                <span className="font-semibold text-[#22352A]">
                  {wasteAnalytics.isOneMonthReady ? (
                    <span className="inline-flex items-center gap-1.5 text-[#15803D]">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>1개월(30일) 분석 데이터 기준 충족 완료 — 정밀 원인 진단 활성화됨</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[#526559]">
                      <Clock className="h-4 w-4 text-[#164E35] shrink-0" />
                      <span>
                        한 달 완성까지 {wasteAnalytics.daysUntilOneMonth}일 남음 (현재 쌓인 기록으로도 사전 진단 가능)
                      </span>
                    </span>
                  )}
                </span>
                <span className="font-bold text-[#164E35]">{trackingProgressPct}% 달성</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#EEF3EF] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#164E35]"
                  style={{
                    width: `${
                      wasteAnalytics.isOneMonthReady
                        ? 100
                        : Math.max(wasteAnalytics.trackingSpanDays > 0 ? 6 : 0, trackingProgressPct)
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* 4 Quantitative Lifecycle Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className="rounded-2xl bg-[#F8FBF9] border border-[#E3ECE6] p-4">
                <div className="text-xs font-medium text-[#526559]">누적 등록 · 소비 · 폐기</div>
                <div className="mt-2 text-xl font-bold text-[#122118] font-num tabular-nums">
                  {wasteAnalytics.registeredCount} · {wasteAnalytics.consumedCount} ·{' '}
                  <span className={wasteAnalytics.wastedCount > 0 ? 'text-[#B91C1C]' : ''}>
                    {wasteAnalytics.wastedCount}건
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#64786B]">등록부터 최종 소진까지 자동 기록</div>
              </div>

              <div className="rounded-2xl bg-[#F8FBF9] border border-[#E3ECE6] p-4">
                <div className="text-xs font-medium text-[#526559]">기한 내 소진율 vs 폐기율</div>
                <div className="mt-2 text-xl font-bold font-num tabular-nums">
                  <span className="text-[#15803D]">{wasteAnalytics.consumptionRatePct}%</span>
                  <span className="mx-1.5 text-[#94A89B]">/</span>
                  <span className={wasteAnalytics.wasteRatePct > 0 ? 'text-[#B91C1C]' : 'text-[#122118]'}>
                    {wasteAnalytics.wasteRatePct}%
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#64786B]">소비 완료 대비 폐기 발생 비중</div>
              </div>

              <div className="rounded-2xl bg-[#F8FBF9] border border-[#E3ECE6] p-4">
                <div className="text-xs font-medium text-[#526559]">누적 폐기 손실 총액</div>
                <div
                  className={`mt-2 text-xl font-bold font-num tabular-nums ${
                    wasteAnalytics.totalWastedKRW > 0 ? 'text-[#B91C1C]' : 'text-[#122118]'
                  }`}
                >
                  {formatKRW(wasteAnalytics.totalWastedKRW)}
                </div>
                <div className="mt-1 text-[11px] text-[#64786B]">버려진 식재료 구매가 합산</div>
              </div>

              <div className="rounded-2xl bg-[#F8FBF9] border border-[#E3ECE6] p-4">
                <div className="text-xs font-medium text-[#526559]">폐기 전 평균 방치 기간</div>
                <div className="mt-2 text-xl font-bold text-[#122118] font-num tabular-nums">
                  {wasteAnalytics.avgDaysHeldBeforeWaste}일
                </div>
                <div className="mt-1 text-[11px] text-[#64786B]">구매일로부터 폐기까지 평균 경과일</div>
              </div>
            </div>
          </section>

          {/* Quantitative Root-Cause Distribution & Vulnerable Spots */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left: Cause Distribution Chart */}
            <div className="lg:col-span-6 surface-card p-6 sm:p-7 flex flex-col justify-between">
              <div>
                <div className="pb-4 border-b border-[#EBF1EC]">
                  <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                    구체적 식재료 낭비 원인 순위
                  </h3>
                  <p className="text-xs text-[#526559] mt-0.5">
                    폐기 시 기록된 사유와 방치 일수를 분석해 손실액 비중이 큰 원인을 찾습니다.
                  </p>
                </div>

                {wasteAnalytics.causeDistribution.length === 0 ? (
                  <div className="py-14 text-center space-y-2">
                    <p className="text-sm font-semibold text-[#122118]">
                      아직 기록된 식재료 폐기 내역이 없습니다
                    </p>
                    <p className="text-xs text-[#526559]">
                      유통기한 관리 탭에서 폐기 처리하거나 상단의 1개월 예시 데이터를 불러오면 원인별 손실 그래프가 표시됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {wasteAnalytics.causeDistribution.map((item, idx) => (
                      <div key={item.causeTag} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                          <span className="font-bold text-[#122118]">
                            0{idx + 1}. {item.causeTag}
                          </span>
                          <span className="font-num tabular-nums text-[#33473B]">
                            <strong className="text-[#B91C1C]">{formatKRW(item.amountKRW)}</strong>{' '}
                            · {item.count}건 ({item.sharePct}%)
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-[#EEF3EF] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(8, item.sharePct)}%`,
                              backgroundColor: idx === 0 ? '#B91C1C' : idx === 1 ? '#D97706' : '#164E35',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Vulnerable Categories/Storages & Immediate Solutions */}
            <div className="lg:col-span-6 surface-card p-6 sm:p-7 flex flex-col justify-between space-y-5">
              <div>
                <div className="pb-4 border-b border-[#EBF1EC]">
                  <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                    취약 지점 분석 및 맞춤 해결 가이드
                  </h3>
                  <p className="text-xs text-[#526559] mt-0.5">
                    가장 자주 버리는 품목군과 상위 원인에 대한 즉각적인 보관·장보기 해법입니다.
                  </p>
                </div>

                {wasteAnalytics.wastedCount === 0 ? (
                  <div className="py-12 text-center text-xs sm:text-sm text-[#526559]">
                    폐기 데이터가 누적되면 취약 카테고리·보관 장소와 해결책이 자동으로 도출됩니다.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl bg-[#FAFDFB] border border-[#E2ECE5] p-3.5">
                        <div className="text-[#64786B] font-medium">가장 취약한 카테고리</div>
                        <div className="mt-1 text-sm font-bold text-[#122118] tabular-nums">
                          {wasteAnalytics.vulnerableCategories[0]
                            ? `${wasteAnalytics.vulnerableCategories[0].category} (${formatKRW(
                                wasteAnalytics.vulnerableCategories[0].wastedKRW
                              )})`
                            : '-'}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#FAFDFB] border border-[#E2ECE5] p-3.5">
                        <div className="text-[#64786B] font-medium">주요 발생 보관 구역</div>
                        <div className="mt-1 text-sm font-bold text-[#122118] tabular-nums">
                          {wasteAnalytics.vulnerableStorages[0]
                            ? `${wasteAnalytics.vulnerableStorages[0].storage} 보관 (${wasteAnalytics.vulnerableStorages[0].wastedCount}건)`
                            : '-'}
                        </div>
                      </div>
                    </div>

                    {wasteAnalytics.repeatedWastedItems.length > 0 && (
                      <div className="text-xs text-[#33473B]">
                        <span className="font-bold text-[#122118]">주의 대상 품목 · </span>
                        <span>{wasteAnalytics.repeatedWastedItems.join(', ')}</span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-[#EBF1EC] space-y-3">
                      {wasteAnalytics.deterministicSolutions.map((sol) => (
                        <div key={sol.causeTag} className="text-xs leading-relaxed">
                          <div className="font-bold text-[#164E35]">
                            [{sol.causeTag} 해결] {sol.title}
                          </div>
                          <p className="text-[#4A5D51] mt-0.5">{sol.solution}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Gemini AI 1-Month Deep Root-Cause Diagnosis & Prescription */}
          <section className="surface-card p-6 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBF1EC]">
              <div>
                <div className="text-xs font-semibold text-[#164E35]">
                  Gemini AI 1개월 소비·폐기 패턴 정밀 분석
                </div>
                <h3 className="mt-1 text-base sm:text-lg font-bold text-[#122118]">
                  AI 식재료 낭비 원인 진단서 &amp; 맞춤 해결 처방전
                </h3>
                <p className="text-xs text-[#526559] mt-0.5">
                  누적된 등록·소비·폐기 로그를 심층 분석해 구체적 원인 패턴과 월간 예상 절감액까지 제안합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRequestWasteCauseAi}
                disabled={wasteAiLoading}
                className="btn-primary-gradient inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-55 whitespace-nowrap shrink-0"
              >
                {wasteAiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>1개월 기록 정밀 진단 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Gemini AI 낭비 원인 분석 &amp; 해결 제안 받기</span>
                  </>
                )}
              </button>
            </div>

            {wasteAiError && (
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#B91C1C]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{wasteAiError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRequestWasteCauseAi}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#FCA5A5] font-semibold whitespace-nowrap shrink-0"
                >
                  재시도
                </button>
              </div>
            )}

            {!savedWasteAnalysis && !wasteAiLoading && (
              <div className="py-8 text-center text-xs sm:text-sm text-[#526559]">
                우측 상단의 <strong>[Gemini AI 낭비 원인 분석 &amp; 해결 제안 받기]</strong> 버튼을 누르면 누적 기록을 바탕으로 한 맞춤형 원인 진단서와 실천 처방전이 생성됩니다.
              </div>
            )}

            {savedWasteAnalysis && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-[#F5FAF7] border border-[#CFE2D5] p-5 sm:p-6 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#526559] font-num tabular-nums">
                    <span className="font-semibold text-[#164E35]">
                      분석 이벤트 {savedWasteAnalysis.analyzedEventCount}건 반영
                    </span>
                    <span>생성일: {savedWasteAnalysis.generatedAt.slice(0, 10)}</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-bold text-[#122118]">
                    {savedWasteAnalysis.diagnosisHeadline}
                  </h4>
                  <p className="text-xs sm:text-sm text-[#22352A] leading-relaxed">
                    {savedWasteAnalysis.primaryCauseSummary}
                  </p>
                </div>

                {/* Detected Waste Patterns */}
                {savedWasteAnalysis.detectedPatterns.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-[#122118]">
                      포착된 주요 식재료 낭비 패턴
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {savedWasteAnalysis.detectedPatterns.map((pat, i) => (
                        <div
                          key={i}
                          className="rounded-2xl bg-white border border-[#E2ECE5] p-4 flex flex-col justify-between"
                        >
                          <div>
                            <div className="text-xs font-semibold text-[#B91C1C] font-num tabular-nums">
                              원인 패턴 0{i + 1} · 손실 영향 {formatKRW(pat.impactKRW)}
                            </div>
                            <div className="mt-1.5 text-sm font-bold text-[#122118]">
                              {pat.patternTitle}
                            </div>
                            <p className="mt-1.5 text-xs text-[#526559] leading-relaxed">
                              {pat.evidence}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tailored Actionable Solutions */}
                {savedWasteAnalysis.tailoredSolutions.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-[#122118]">
                      다음 달 낭비 제로를 위한 맞춤 해결 제안
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {savedWasteAnalysis.tailoredSolutions.map((sol, i) => (
                        <div
                          key={i}
                          className="rounded-2xl bg-[#F9FCFA] border border-[#CFE2D5] p-4 flex flex-col justify-between"
                        >
                          <div>
                            <div className="text-xs font-bold text-[#164E35] font-num tabular-nums">
                              해결 제안 0{i + 1} · 월 기대 절약 +{formatKRW(sol.expectedMonthlySavingKRW)}
                            </div>
                            <div className="mt-1.5 text-sm font-bold text-[#122118]">
                              {sol.title}
                            </div>
                            <p className="mt-1.5 text-xs text-[#3D5245] leading-relaxed">
                              {sol.actionStep}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-[#EEF5F0] px-4 py-3.5 text-xs sm:text-sm text-[#143D29]">
                  <strong className="font-bold">추천 장보기 황금 원칙 · </strong>
                  <span>{savedWasteAnalysis.recommendedBuyingRule}</span>
                </div>
              </div>
            )}
          </section>

          {/* Accumulated Lifecycle Event Log Table */}
          <section className="surface-card p-6 sm:p-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#EBF1EC]">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                  식재료 등록 · 소비 · 폐기 누적 기록 로그
                </h3>
                <p className="text-xs text-[#526559] mt-0.5">
                  내 냉장고와 유통기한 관리에서 수행한 모든 기록이 시간순으로 쌓입니다.
                </p>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#EEF4F0]">
                {(
                  [
                    { id: 'all', label: `전체 (${lifecycleEvents.length})` },
                    { id: 'registered', label: '등록' },
                    { id: 'consumed', label: '소비완료' },
                    { id: 'wasted', label: '폐기' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLifecycleFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      lifecycleFilter === tab.id
                        ? 'bg-white text-[#122118] shadow-2xs'
                        : 'text-[#526559] hover:text-[#122118]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredLifecycleEvents.length === 0 ? (
              <p className="py-10 text-center text-xs sm:text-sm text-[#64786B]">
                해당 구분의 누적 생애주기 기록이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-[#EEF3F0]">
                {filteredLifecycleEvents.slice(0, 30).map((ev) => (
                  <li
                    key={ev.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span
                          className={`font-bold ${
                            ev.action === 'wasted'
                              ? 'text-[#B91C1C]'
                              : ev.action === 'consumed'
                              ? 'text-[#15803D]'
                              : 'text-[#164E35]'
                          }`}
                        >
                          {ev.action === 'wasted'
                            ? '폐기'
                            : ev.action === 'consumed'
                            ? '소비완료'
                            : '입고등록'}
                        </span>
                        <span className="font-bold text-[#122118]">{ev.itemName}</span>
                        <span className="text-xs text-[#526559] font-num tabular-nums">
                          {ev.quantity}
                          {ev.unit} · {ev.category} · {ev.storage} · {ev.date}
                          {ev.daysHeld > 0 ? ` · 보관 ${ev.daysHeld}일` : ''}
                          {ev.isSample ? ' · 예시' : ''}
                        </span>
                      </div>
                      {(ev.causeTag || ev.note) && (
                        <div className="mt-0.5 text-xs text-[#526559]">
                          {ev.causeTag ? `원인: ${ev.causeTag}` : ''}
                          {ev.causeTag && ev.note ? ' · ' : ''}
                          {ev.note}
                        </div>
                      )}
                    </div>

                    {ev.amountKRW > 0 && (
                      <span
                        className={`font-num font-bold tabular-nums shrink-0 ${
                          ev.action === 'wasted' ? 'text-[#B91C1C]' : 'text-[#122118]'
                        }`}
                      >
                        {ev.action === 'wasted' ? `-${formatKRW(ev.amountKRW)}` : formatKRW(ev.amountKRW)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        /* ======================================================================
           VIEW 1: Standard Monthly Expense & Savings Report Overview
           ====================================================================== */
        <>
          {/* Quick Callout to 1-Month Waste Root-Cause Analyzer */}
          <section className="rounded-[18px] bg-[#F4F9F5] border border-[#CFE2D5] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-[#22352A]">
              <strong className="font-bold text-[#164E35]">
                내가 식재료를 버리는 진짜 이유가 궁금하신가요?
              </strong>{' '}
              <span className="text-[#526559]">
                등록·소비·폐기 누적 기록({lifecycleEvents.length}건)으로 과다구매·방치·보관 미흡 등 구체적인 낭비 원인과 해결책을 진단해보세요.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReportMode('waste_diagnosis')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#164E35] hover:underline whitespace-nowrap shrink-0"
            >
              <span>1개월 낭비 원인 진단 보기</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </section>

          {/* 3 Core Monthly KPI Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="surface-card p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-[#526559]">
                  <span>이번 달 식재료 구매 식비</span>
                  <span className="font-num tabular-nums text-[#164E35]">{budgetUsagePct}% 소진</span>
                </div>
                <div className="mt-2.5 text-[30px] font-bold text-[#122118] font-num tabular-nums leading-none">
                  {formatKRW(purchaseTotal)}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#EDF3EF] space-y-2">
                <div className="h-1.5 w-full rounded-full bg-[#EEF3EF] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, budgetUsagePct)}%`,
                      backgroundColor: budgetUsagePct > 100 ? '#DC2626' : '#164E35',
                    }}
                  />
                </div>
                <p className="text-xs text-[#64786B] font-num tabular-nums">
                  월 목표 예산 {formatKRW(monthlyBudget)} · 총 {monthExpenses.length}건
                </p>
              </div>
            </div>

            <div className="surface-card p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-[#526559]">이번 달 식재료 폐기 비용</div>
                <div
                  className={`mt-2.5 text-[30px] font-bold font-num tabular-nums leading-none ${
                    wasteTotal > 0 ? 'text-[#B91C1C]' : 'text-[#122118]'
                  }`}
                >
                  {formatKRW(wasteTotal)}
                </div>
              </div>
              <p className="mt-4 pt-3 border-t border-[#EDF3EF] text-xs text-[#64786B] tabular-nums">
                기록된 폐기 건수 {monthWastes.length}건 ·{' '}
                {wasteTotal === 0 ? '무폐기 달성 중' : '임박 재료 우선 소진 권장'}
              </p>
            </div>

            <div className="surface-card p-6 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-[#526559]">
                  이번 달 절약 금액 (실제 기록 기준)
                </div>
                <div className="mt-2.5 text-[30px] font-bold text-[#164E35] font-num tabular-nums leading-none">
                  {formatKRW(savedTotal)}
                </div>
              </div>
              <p className="mt-4 pt-3 border-t border-[#EDF3EF] text-xs text-[#64786B] tabular-nums">
                레시피 활용 {monthUsages.length}회 · 폐기 차감 순효과{' '}
                <strong className="font-num text-[#122118]">
                  {formatKRW(savedTotal - wasteTotal)}
                </strong>
              </p>
            </div>
          </section>

          {/* Monthly Summary & Gemini AI Report Insight */}
          <section className="surface-card p-6 sm:p-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EBF1EC]">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                  {formatMonthLabel(selectedMonth)} 식비 요약 및 AI 코칭
                </h3>
                <p className="text-xs text-[#526559] mt-0.5">
                  기록된 수치만을 바탕으로 이번 달 소비 흐름과 개선 포인트를 요약합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestAiSummary}
                disabled={aiLoading}
                className="btn-primary-gradient inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>AI 요약 분석 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Gemini AI 심층 리포트 생성</span>
                  </>
                )}
              </button>
            </div>

            {/* Always-available Factual Summary */}
            <div className="text-sm text-[#22352A] leading-relaxed">{factualSummaryText}</div>

            {aiError && (
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3.5 flex items-center justify-between gap-3 text-xs text-[#B91C1C]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{aiError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRequestAiSummary}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#FCA5A5] font-semibold whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>재시도</span>
                </button>
              </div>
            )}

            {savedAiSummary && (
              <div className="rounded-2xl bg-[#F5FAF7] border border-[#CFE2D5] p-5 sm:p-6 space-y-3">
                <div className="text-sm sm:text-base font-bold text-[#164E35]">
                  {savedAiSummary.headline}
                </div>
                <p className="text-xs sm:text-sm text-[#22352A] leading-relaxed">
                  {savedAiSummary.summaryParagraph}
                </p>
                {savedAiSummary.actionTips.length > 0 && (
                  <ul className="pt-3 border-t border-[#DCE8DF] space-y-2 text-xs text-[#33473B]">
                    {savedAiSummary.actionTips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="font-num font-bold text-[#164E35] shrink-0">
                          0{idx + 1}.
                        </span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* Charts Row: Month-over-Month Comparison + Category SVG Donut Ring */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* 1. Month-over-Month Comparison Graph */}
            <div className="surface-card p-6 sm:p-7 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#EBF1EC]">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                      지난달 대비 비교 그래프
                    </h3>
                    <p className="text-xs text-[#526559] mt-0.5 tabular-nums">
                      {formatMonthLabel(prevMonth)} vs {formatMonthLabel(selectedMonth)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#526559]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#CBD8CE]" />
                      지난달
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-xs bg-[#164E35]" />
                      이번 달
                    </span>
                  </div>
                </div>

                <div className="mt-6 space-y-6">
                  {comparisonGroups.map((group) => {
                    const prevPct = Math.round((group.prev / maxChartVal) * 100);
                    const currPct = Math.round((group.curr / maxChartVal) * 100);
                    const diff = group.curr - group.prev;

                    return (
                      <div key={group.label} className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                          <span className="font-bold text-[#122118]">{group.label}</span>
                          <span className="text-[#526559] font-num tabular-nums">
                            지난달 {formatKRW(group.prev)} → 이번 달{' '}
                            <strong className="text-[#122118]">{formatKRW(group.curr)}</strong>
                            {group.prev > 0 && diff !== 0 && (
                              <span
                                className={`ml-1.5 font-semibold ${
                                  diff > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
                                }`}
                              >
                                ({diff > 0 ? '+' : ''}
                                {formatKRW(diff)})
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="h-3 w-full rounded-full bg-[#EEF3EF] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#CBD8CE]"
                              style={{ width: `${Math.max(group.prev > 0 ? 4 : 0, prevPct)}%` }}
                            />
                          </div>
                          <div className="h-3.5 w-full rounded-full bg-[#EEF3EF] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(group.curr > 0 ? 4 : 0, currPct)}%`,
                                backgroundColor: group.currColor,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2. Category Expenditure Share with SVG Donut Ring Chart */}
            <div className="surface-card p-6 sm:p-7 flex flex-col justify-between">
              <div>
                <div className="pb-4 border-b border-[#EBF1EC]">
                  <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                    카테고리별 지출 비중
                  </h3>
                  <p className="text-xs text-[#526559] mt-0.5 tabular-nums">
                    {formatMonthLabel(selectedMonth)} 식재료 구매 카테고리 분포
                  </p>
                </div>

                {categoryBreakdown.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF5F0] text-[#164E35]">
                      <PieChart className="h-6 w-6" />
                    </div>
                    <p className="text-xs sm:text-sm text-[#526559]">
                      이번 달 식재료 구매 지출을 입력하면 카테고리별 도넛 차트와 비중이 표시됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
                    {/* Crisp SVG Donut Ring Chart */}
                    <div className="relative h-40 w-40 shrink-0 flex items-center justify-center">
                      <svg
                        viewBox="0 0 160 160"
                        className="h-40 w-40 -rotate-90"
                        role="img"
                        aria-label="카테고리별 지출 도넛 차트"
                      >
                        <circle
                          cx="80"
                          cy="80"
                          r="56"
                          fill="none"
                          stroke="#EEF3EF"
                          strokeWidth="18"
                        />
                        {donutSegments.map((seg) => (
                          <circle
                            key={seg.category}
                            cx="80"
                            cy="80"
                            r={seg.radius}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="18"
                            strokeDasharray={seg.strokeDasharray}
                            strokeDashoffset={seg.strokeDashoffset}
                          />
                        ))}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                        <span className="text-[11px] font-medium text-[#64786B]">총 지출</span>
                        <span className="mt-0.5 text-sm font-bold text-[#122118] font-num tabular-nums">
                          {formatKRW(purchaseTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Category Legend & Share Table */}
                    <ul className="w-full flex-1 divide-y divide-[#EEF3F0]">
                      {categoryBreakdown.map((item) => (
                        <li
                          key={item.category}
                          className="py-2.5 flex items-center justify-between text-xs sm:text-sm"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="inline-block h-3 w-3 rounded-xs shrink-0"
                              style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                            />
                            <span className="font-semibold text-[#122118]">{item.category}</span>
                          </div>
                          <div className="font-num tabular-nums text-[#33473B]">
                            <span className="font-bold">{formatKRW(item.amount)}</span>
                            <span className="text-[#64786B] ml-2 text-xs">({item.ratio}%)</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Ledger Entry & History Tabs (식비 지출 / 폐기 기록 / 레시피 활용) */}
          <section className="surface-card p-6 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#EBF1EC]">
              <h3 className="text-base sm:text-lg font-bold text-[#122118]">
                {formatMonthLabel(selectedMonth)} 상세 기록 입력 및 조회
              </h3>

              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#EEF4F0]">
                <button
                  type="button"
                  onClick={() => {
                    setActiveLedgerTab('expense');
                    setFormError(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
                    activeLedgerTab === 'expense'
                      ? 'bg-white text-[#122118] shadow-xs'
                      : 'text-[#526559] hover:text-[#122118]'
                  }`}
                >
                  구매 비용 ({monthExpenses.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLedgerTab('waste');
                    setFormError(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
                    activeLedgerTab === 'waste'
                      ? 'bg-white text-[#122118] shadow-xs'
                      : 'text-[#526559] hover:text-[#122118]'
                  }`}
                >
                  폐기 기록 ({monthWastes.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLedgerTab('usage');
                    setFormError(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 tabular-nums ${
                    activeLedgerTab === 'usage'
                      ? 'bg-white text-[#122118] shadow-xs'
                      : 'text-[#526559] hover:text-[#122118]'
                  }`}
                >
                  레시피 활용·절약 ({monthUsages.length})
                </button>
              </div>
            </div>

            {formError && (
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#B91C1C] font-medium">
                {formError}
              </div>
            )}

            {/* Tab 1: Purchase Expense */}
            {activeLedgerTab === 'expense' && (
              <div className="space-y-4">
                <form
                  onSubmit={handleAddExpenseSubmit}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3"
                >
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="sm:col-span-3 input-modern px-3 py-2.5 text-xs sm:text-sm font-num tabular-nums"
                  />
                  <input
                    type="text"
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    placeholder="구매 내역 (예: 마트 채소·두부 구매)"
                    className="sm:col-span-4 input-modern px-3.5 py-2.5 text-xs sm:text-sm"
                  />
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value as IngredientCategory)}
                    className="sm:col-span-2 input-modern px-3 py-2.5 text-xs sm:text-sm"
                  >
                    {INGREDIENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="금액(원)"
                    className="sm:col-span-2 input-modern px-3 py-2.5 text-xs sm:text-sm font-num tabular-nums"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-1 btn-primary-gradient inline-flex items-center justify-center min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                    aria-label="구매 내역 추가"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>

                {monthExpenses.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#64786B]">
                    기록된 식재료 구매 내역이 없습니다.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#EBF1EC]">
                    {monthExpenses.map((e) => (
                      <li
                        key={e.id}
                        className="py-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm hover:bg-[#FAFDFB] px-1 rounded-lg transition-colors"
                      >
                        <div>
                          <span className="font-bold text-[#122118]">{e.itemName}</span>
                          <span className="text-xs text-[#526559] ml-2 font-num tabular-nums">
                            {e.category} · {e.date}
                            {e.isSample ? ' · 예시' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-bold text-[#122118] font-num tabular-nums">
                            {formatKRW(e.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteExpense(e.id)}
                            className="p-1 rounded-lg text-[#64786B] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
                            aria-label="삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Tab 2: Waste Records (with Root-Cause Tag Selector!) */}
            {activeLedgerTab === 'waste' && (
              <div className="space-y-4">
                <form
                  onSubmit={handleAddWasteSubmit}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3"
                >
                  <input
                    type="text"
                    value={wasteName}
                    onChange={(e) => setWasteName(e.target.value)}
                    placeholder="폐기 식재료명"
                    className="sm:col-span-3 input-modern px-3.5 py-2.5 text-xs sm:text-sm"
                  />
                  <select
                    value={wasteCategory}
                    onChange={(e) => setWasteCategory(e.target.value as IngredientCategory)}
                    className="sm:col-span-2 input-modern px-3 py-2.5 text-xs sm:text-sm"
                  >
                    {INGREDIENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <select
                    value={wasteCauseTag}
                    onChange={(e) => setWasteCauseTag(e.target.value as WasteCauseTag)}
                    className="sm:col-span-3 input-modern px-3 py-2.5 text-xs sm:text-sm"
                  >
                    {WASTE_CAUSE_TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={wasteReason}
                    onChange={(e) => setWasteReason(e.target.value)}
                    placeholder="상세 메모 (선택)"
                    className="sm:col-span-2 input-modern px-3 py-2.5 text-xs sm:text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={wasteAmount}
                    onChange={(e) => setWasteAmount(e.target.value)}
                    placeholder="손실액"
                    className="sm:col-span-1 input-modern px-2.5 py-2.5 text-xs sm:text-sm font-num tabular-nums"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-1 inline-flex items-center justify-center min-h-[44px] px-3 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-semibold hover:bg-[#991B1B] transition-colors whitespace-nowrap shrink-0"
                    aria-label="폐기 내역 추가"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>

                {monthWastes.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#64786B]">
                    이번 달 기록된 식재료 폐기 내역이 없습니다.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#EBF1EC]">
                    {monthWastes.map((w) => (
                      <li
                        key={w.id}
                        className="py-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm hover:bg-[#FAFDFB] px-1 rounded-lg transition-colors"
                      >
                        <div>
                          <span className="font-bold text-[#122118]">{w.itemName}</span>
                          <span className="text-xs text-[#526559] ml-2">
                            {w.category} · {w.reason}
                            {w.isSample ? ' · 예시' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-bold text-[#B91C1C] font-num tabular-nums">
                            {formatKRW(w.wastedAmount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteWaste(w.id)}
                            className="p-1 rounded-lg text-[#64786B] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
                            aria-label="삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Tab 3: Recipe Usage & Savings */}
            {activeLedgerTab === 'usage' && (
              <div className="space-y-4">
                <form
                  onSubmit={handleAddUsageSubmit}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3"
                >
                  <input
                    type="text"
                    value={usageTitle}
                    onChange={(e) => setUsageTitle(e.target.value)}
                    placeholder="활용한 레시피·요리명"
                    className="sm:col-span-4 input-modern px-3.5 py-2.5 text-xs sm:text-sm"
                  />
                  <input
                    type="text"
                    value={usageIngredients}
                    onChange={(e) => setUsageIngredients(e.target.value)}
                    placeholder="사용 식재료 (쉼표 구분, 예: 두부, 애호박)"
                    className="sm:col-span-5 input-modern px-3.5 py-2.5 text-xs sm:text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={usageSavedAmount}
                    onChange={(e) => setUsageSavedAmount(e.target.value)}
                    placeholder="절약액(원)"
                    className="sm:col-span-2 input-modern px-3 py-2.5 text-xs sm:text-sm font-num tabular-nums"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-1 btn-primary-gradient inline-flex items-center justify-center min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                    aria-label="레시피 활용 내역 추가"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>

                {monthUsages.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#64786B]">
                    기록된 레시피 활용 내역이 없습니다. 레시피 상세창에서 조리 완료를 누르면 자동 추가됩니다.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#EBF1EC]">
                    {monthUsages.map((u) => (
                      <li
                        key={u.id}
                        className="py-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm hover:bg-[#FAFDFB] px-1 rounded-lg transition-colors"
                      >
                        <div>
                          <span className="font-bold text-[#122118]">{u.recipeTitle}</span>
                          <span className="text-xs text-[#526559] ml-2">
                            {u.usedIngredients.length > 0
                              ? `사용 재료: ${u.usedIngredients.join(', ')}`
                              : u.date}
                            {u.isSample ? ' · 예시' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-bold text-[#164E35] font-num tabular-nums">
                            +{formatKRW(u.savedAmount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteRecipeUsage(u.id)}
                            className="p-1 rounded-lg text-[#64786B] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
                            aria-label="삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
