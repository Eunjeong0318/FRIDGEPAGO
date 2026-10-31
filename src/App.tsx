import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  ChefSecretMode,
  ExpenseRecord,
  FridgeMission,
  FridgePagoState,
  Ingredient,
  IngredientLifecycleEvent,
  MissionGameState,
  MonthlyAiSummary,
  PageId,
  Recipe,
  RecipeMissingIngredient,
  RecipeUsageRecord,
  ShoppingItem,
  UserProfile,
  WASTE_CAUSE_TAGS,
  WasteCauseAnalysis,
  WasteCauseTag,
  WasteRecord,
} from './types';
import {
  buildOwnedMatchedPreviewRecipes,
  createSampleIngredients,
  createSampleReportData,
  getDefaultState,
  loadAppState,
  saveAppState,
} from './utils/storage';
import {
  evaluateExpiry,
  getCurrentMonthString,
  getTodayDateString,
} from './utils/dateUtils';
import {
  buildPersonalizedMissionRound,
  calculateDaysBetween,
  createSampleOneMonthLifecycleEvents,
  getRankByPoints,
  inferCauseTagFromReason,
} from './utils/gameAndWasteUtils';
import { fetchAiStatus } from './utils/api';
import {
  auth,
  extractQuotaMessage,
  isAuthorizedOwnerUser,
  signInWithGooglePopup,
  signOutFromFirebase,
} from './firebase';
import {
  bootstrapUserCloudWorkspace,
  reconcileStateToFirestore,
  sanitizeDocId,
  subscribeToCloudWorkspace,
} from './services/cloudSync';
import { CloudSyncStatus, Layout } from './components/Layout';
import { ConfirmDialog } from './components/ConfirmDialog';
import {
  DuplicateConflict,
  DuplicateResolutionModal,
  IngredientDraft,
  IngredientFormModal,
  PhotoRecognitionModal,
} from './components/IngredientModals';
import { RecipeDetailModal } from './components/RecipeDetailModal';
import { DashboardPage } from './pages/DashboardPage';
import { FridgePage } from './pages/FridgePage';
import { RecipePage } from './pages/RecipePage';
import { ExpiryPage } from './pages/ExpiryPage';
import { MissionPage } from './pages/MissionPage';
import { ShoppingPage } from './pages/ShoppingPage';
import { ReportPage } from './pages/ReportPage';

interface AppErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAF8] p-6">
          <div className="max-w-md w-full rounded-2xl bg-white border border-[#E3EBE4] p-8 text-center shadow-sm">
            <h1 className="text-lg font-bold text-[#14241B]">
              화면을 불러오는 중 일시적인 오류가 발생했습니다
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-[#526358]">
              저장된 데이터는 안전하게 보호되고 있습니다. 아래 버튼을 눌러 화면을 복구해주세요.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
              }}
              className="mt-5 px-5 py-2.5 rounded-xl bg-[#164E35] text-white text-sm font-semibold hover:bg-[#113D29]"
            >
              화면 다시 불러오기
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface PendingConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
}

function parseMissingAmount(amountStr: string): { quantity: number; unit: string } {
  const trimmed = amountStr.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    return {
      quantity: Math.max(0.1, Number(match[1]) || 1),
      unit: match[2]?.trim() || '개',
    };
  }
  return { quantity: 1, unit: trimmed || '개' };
}

function itemNameMatchesTarget(itemName: string, targetName: string): boolean {
  const a = itemName.replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
  const b = targetName.replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function buildRegisteredLifecycleEvent(item: Ingredient): IngredientLifecycleEvent {
  const today = getTodayDateString();
  const month = getCurrentMonthString();
  const ev = evaluateExpiry(item.expiryDate);
  return {
    id: `lc-reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: today,
    month,
    action: 'registered',
    itemName: item.name.slice(0, 80),
    category: item.category,
    storage: item.storage,
    quantity: Math.max(0.01, item.quantity),
    unit: (item.unit || '개').slice(0, 20),
    amountKRW: Math.max(0, Math.round(item.purchasePrice || 0)),
    daysHeld: calculateDaysBetween(item.purchaseDate || today, today),
    daysFromExpiry: ev.daysRemaining ?? 7,
    causeTag: '',
    note: item.expiryDate ? `소비기한 ${item.expiryDate} 기준 입고` : '식재료 신규 등록',
    isSample: item.isSample,
  };
}

function advanceMissionProgress(
  game: MissionGameState,
  trigger: 'register' | 'consume' | 'cook' | 'expiry_edit',
  context: {
    itemNames?: string[];
    category?: string;
    hasExpiryDate?: boolean;
    incrementBy?: number;
  }
): { nextGame: MissionGameState; newlyCompletedTitles: string[]; pointsGained: number } {
  let pointsGained = 0;
  let completedDelta = 0;
  const newlyCompletedTitles: string[] = [];
  const addedLogs: MissionGameState['recentLogs'] = [];
  const step = Math.max(1, context.incrementBy ?? 1);
  const names = context.itemNames ?? [];

  const nextActive = game.activeMissions.map((m) => {
    if (m.completed) return m;

    let matched = false;
    if (trigger === 'register') {
      if (m.kind === 'zero_waste_register') matched = true;
      if (m.kind === 'expiry_audit' && context.hasExpiryDate && !m.targetItemName) matched = true;
    } else if (trigger === 'expiry_edit') {
      if (
        m.kind === 'expiry_audit' &&
        context.hasExpiryDate &&
        (!m.targetItemName || names.some((n) => itemNameMatchesTarget(n, m.targetItemName)))
      ) {
        matched = true;
      }
    } else if (trigger === 'consume') {
      if (m.kind === 'urgent_rescue') {
        matched =
          !m.targetItemName || names.some((n) => itemNameMatchesTarget(n, m.targetItemName));
      } else if (m.kind === 'category_focus') {
        matched = m.targetItemName
          ? names.some((n) => itemNameMatchesTarget(n, m.targetItemName))
          : Boolean(context.category && m.targetCategory === context.category);
      }
    } else if (trigger === 'cook') {
      if (m.kind === 'combo_cook') {
        matched =
          !m.targetItemName ||
          names.length === 0 ||
          names.some((n) => itemNameMatchesTarget(n, m.targetItemName));
        if (!matched && names.length > 0) {
          // Cooking any home-cooked meal with fridge items counts for general combo_cook if target item wasn't in fridge
          matched = true;
        }
      } else if (m.kind === 'urgent_rescue' || m.kind === 'category_focus') {
        if (m.targetItemName && names.some((n) => itemNameMatchesTarget(n, m.targetItemName))) {
          matched = true;
        }
      }
    }

    if (!matched) return m;

    const nextCount = Math.min(m.requiredCount, m.currentCount + step);
    const nowDone = nextCount >= m.requiredCount;

    if (nowDone) {
      pointsGained += m.points;
      completedDelta += 1;
      newlyCompletedTitles.push(m.title);
      addedLogs.push({
        id: `mlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: m.title,
        pointsEarned: m.points,
        completedAt: new Date().toISOString(),
      });
    }

    return {
      ...m,
      currentCount: nextCount,
      completed: nowDone,
    };
  });

  if (pointsGained === 0 && nextActive.every((m, idx) => m === game.activeMissions[idx])) {
    return { nextGame: game, newlyCompletedTitles: [], pointsGained: 0 };
  }

  return {
    nextGame: {
      ...game,
      totalPoints: game.totalPoints + pointsGained,
      completedMissionsCount: game.completedMissionsCount + completedDelta,
      activeMissions: nextActive,
      recentLogs: [...addedLogs, ...game.recentLogs].slice(0, 30),
    },
    newlyCompletedTitles,
    pointsGained,
  };
}

function FridgePagoContainer() {
  const [state, setState] = useState<FridgePagoState>(() => loadAppState());
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [pendingSecretMode, setPendingSecretMode] = useState<ChefSecretMode>('none');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiAuthorized, setAiAuthorized] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cloud Auth & Real-Time Firestore Sync State
  const [cloudAuthReady, setCloudAuthReady] = useState(false);
  const [cloudUser, setCloudUser] = useState<FirebaseUser | null>(null);
  const [cloudBootstrappedUid, setCloudBootstrappedUid] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('local');
  const [cloudErrorMessage, setCloudErrorMessage] = useState<string | null>(null);

  // Refs for race-free cloud baseline & serialized mutation queue
  const latestStateRef = useRef<FridgePagoState>(state);
  latestStateRef.current = state;
  const cloudBaselineRef = useRef<FridgePagoState | null>(null);
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());
  const inFlightWritesRef = useRef<number>(0);

  // Ingredient Modals
  const [ingredientFormOpen, setIngredientFormOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  // Duplicate Resolution Queue
  const [pendingDraftQueue, setPendingDraftQueue] = useState<IngredientDraft[]>([]);
  const [activeConflict, setActiveConflict] = useState<DuplicateConflict | null>(null);

  // Recipe Detail Modal
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  // Confirm Dialog
  const [confirmDialog, setConfirmDialog] = useState<PendingConfirmAction | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Keep localStorage cache synced as fast offline mirror
  useEffect(() => {
    saveAppState(state);
  }, [state]);

  // Check Gemini API configuration & owner authorization status whenever auth user changes
  useEffect(() => {
    let active = true;
    fetchAiStatus().then((res) => {
      if (!active) return;
      setAiConfigured(res.configured);
      setAiAuthorized(Boolean(res.authorized));
    });
    return () => {
      active = false;
    };
  }, [cloudUser]);

  // Track Firebase Auth state & bootstrap Firestore workspace (exclusively for verified app owner)
  useEffect(() => {
    let activeUnsubSnapshot: (() => void) | null = null;
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (activeUnsubSnapshot) {
        activeUnsubSnapshot();
        activeUnsubSnapshot = null;
      }

      setCloudAuthReady(true);

      if (!user) {
        setCloudUser(null);
        setAiAuthorized(false);
        setCloudBootstrappedUid(null);
        cloudBaselineRef.current = null;
        setCloudSyncStatus('local');
        return;
      }

      if (!user.emailVerified) {
        setCloudUser(null);
        setAiAuthorized(false);
        setCloudBootstrappedUid(null);
        cloudBaselineRef.current = null;
        setCloudSyncStatus('error');
        setCloudErrorMessage(
          '이메일 인증이 완료된 소유자 Google 계정만 클라우드 서버 및 AI 기능을 사용할 수 있습니다.'
        );
        try {
          await signOutFromFirebase();
        } catch {
          // Ignore sign-out cleanup error
        }
        return;
      }

      if (!isAuthorizedOwnerUser(user)) {
        setCloudUser(null);
        setAiAuthorized(false);
        setCloudBootstrappedUid(null);
        cloudBaselineRef.current = null;
        setCloudSyncStatus('error');
        setCloudErrorMessage(
          '접근 제한됨: 등록된 앱 소유자 Google 계정만 클라우드 서버 및 AI 기능을 사용할 수 있습니다.'
        );
        try {
          await signOutFromFirebase();
        } catch {
          // Ignore sign-out cleanup error
        }
        return;
      }

      setCloudUser(user);
      setCloudErrorMessage(null);
      setCloudSyncStatus('connecting');

      try {
        const { migratedFromLocal, initialCloudState } = await bootstrapUserCloudWorkspace(
          user.uid,
          latestStateRef.current,
          user.displayName
        );
        if (cancelled) return;

        cloudBaselineRef.current = initialCloudState;
        setState(initialCloudState);
        setCloudBootstrappedUid(user.uid);
        setCloudSyncStatus('synced');

        if (migratedFromLocal) {
          showToast('기존에 입력한 데이터를 클라우드 서버에 안전하게 저장했습니다.');
        } else {
          showToast('클라우드 서버 저장소와 실시간 동기화되었습니다.');
        }

        const getLocalCustomImages = () => {
          const map = new Map<string, string>();
          for (const ing of latestStateRef.current.ingredients) {
            if (ing.customImageDataUrl) {
              map.set(sanitizeDocId(ing.id, 'ing'), ing.customImageDataUrl);
            }
          }
          return map;
        };

        activeUnsubSnapshot = subscribeToCloudWorkspace(
          user.uid,
          getLocalCustomImages,
          (sliceUpdater) => {
            setState((prev) => {
              const updated = sliceUpdater(prev);
              // Update baseline when no local write is in flight so incoming server snapshots don't echo back
              if (inFlightWritesRef.current === 0) {
                cloudBaselineRef.current = updated;
              }
              return updated;
            });
          },
          (err) => {
            const quotaMsg = extractQuotaMessage(err);
            setCloudSyncStatus('error');
            setCloudErrorMessage(
              quotaMsg || '서버 실시간 동기화 중 권한 또는 네트워크 오류가 발생했습니다.'
            );
          }
        );
      } catch (err) {
        if (cancelled) return;
        const quotaMsg = extractQuotaMessage(err);
        setCloudSyncStatus('error');
        setCloudErrorMessage(
          quotaMsg || '클라우드 데이터베이스 초기 연결 중 오류가 발생했습니다.'
        );
      }
    });

    return () => {
      cancelled = true;
      if (activeUnsubSnapshot) {
        activeUnsubSnapshot();
      }
      unsubAuth();
    };
  }, [showToast]);

  // Reconcile state mutations to Firestore whenever state changes while signed in
  useEffect(() => {
    if (!cloudBootstrappedUid || !cloudBaselineRef.current) return;
    const prevBaseline = cloudBaselineRef.current;
    if (prevBaseline === state) return;

    const uid = cloudBootstrappedUid;
    const nextSnapshot = state;
    cloudBaselineRef.current = nextSnapshot;

    inFlightWritesRef.current += 1;
    setCloudSyncStatus('syncing');

    syncChainRef.current = syncChainRef.current
      .catch(() => {
        // Recover chain if a previous write failed
      })
      .then(async () => {
        try {
          await reconcileStateToFirestore(uid, prevBaseline, nextSnapshot);
          setCloudErrorMessage(null);
        } catch (err) {
          const quotaMsg = extractQuotaMessage(err);
          setCloudSyncStatus('error');
          setCloudErrorMessage(
            quotaMsg || '일부 변경사항을 클라우드 서버에 저장하는 중 오류가 발생했습니다.'
          );
          throw err;
        } finally {
          inFlightWritesRef.current = Math.max(0, inFlightWritesRef.current - 1);
          if (inFlightWritesRef.current === 0) {
            setCloudSyncStatus((curr) => (curr === 'error' ? 'error' : 'synced'));
          }
        }
      });
  }, [state, cloudBootstrappedUid]);

  const handleSignInCloud = async () => {
    setCloudErrorMessage(null);
    setCloudSyncStatus('connecting');
    try {
      await signInWithGooglePopup();
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setCloudSyncStatus(cloudUser ? 'synced' : 'local');
        return;
      }
      if (code === 'auth/popup-blocked') {
        setCloudSyncStatus('error');
        setCloudErrorMessage(
          '브라우저 팝업 차단을 해제한 뒤 다시 Google 로그인 버튼을 눌러주세요.'
        );
        return;
      }
      setCloudSyncStatus('error');
      setCloudErrorMessage('Google 로그인 중 일시적인 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  const handleSignOutCloud = async () => {
    try {
      await signOutFromFirebase();
      showToast('클라우드 서버 연결을 해제했습니다. 현재 기기 로컬 모드로 전환됩니다.');
    } catch {
      showToast('로그아웃 처리 중 오류가 발생했습니다.');
    }
  };

  // Process Duplicate Queue
  useEffect(() => {
    if (activeConflict || pendingDraftQueue.length === 0) return;

    const [nextDraft, ...restQueue] = pendingDraftQueue;
    const normIncoming = nextDraft.name.trim().toLowerCase();
    const existingMatch = state.ingredients.find(
      (i) => i.name.trim().toLowerCase() === normIncoming
    );

    if (existingMatch) {
      setActiveConflict({ existing: existingMatch, incoming: nextDraft });
      setPendingDraftQueue(restQueue);
    } else {
      const created: Ingredient = {
        ...nextDraft,
        id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
      };
      const regEvent = buildRegisteredLifecycleEvent(created);
      setState((prev) => {
        const { nextGame } = advanceMissionProgress(prev.missionGame, 'register', {
          itemNames: [created.name],
          category: created.category,
          hasExpiryDate: Boolean(created.expiryDate),
          incrementBy: 1,
        });
        return {
          ...prev,
          ingredients: [created, ...prev.ingredients],
          lifecycleEvents: [regEvent, ...prev.lifecycleEvents].slice(0, 200),
          missionGame: nextGame,
        };
      });
      setPendingDraftQueue(restQueue);
    }
  }, [activeConflict, pendingDraftQueue, state.ingredients]);

  const handleMergeDuplicate = () => {
    if (!activeConflict) return;
    const { existing, incoming } = activeConflict;
    const syntheticMergedItem: Ingredient = {
      ...existing,
      quantity: incoming.quantity,
      purchasePrice: incoming.purchasePrice,
      purchaseDate: incoming.purchaseDate || existing.purchaseDate,
      expiryDate: incoming.expiryDate || existing.expiryDate,
    };
    const regEvent = buildRegisteredLifecycleEvent(syntheticMergedItem);

    setState((prev) => {
      const { nextGame } = advanceMissionProgress(prev.missionGame, 'register', {
        itemNames: [existing.name],
        category: existing.category,
        hasExpiryDate: Boolean(incoming.expiryDate || existing.expiryDate),
        incrementBy: 1,
      });
      return {
        ...prev,
        ingredients: prev.ingredients.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                quantity: Math.round((item.quantity + incoming.quantity) * 100) / 100,
                purchasePrice:
                  item.purchasePrice !== undefined || incoming.purchasePrice !== undefined
                    ? (item.purchasePrice || 0) + (incoming.purchasePrice || 0)
                    : undefined,
              }
            : item
        ),
        lifecycleEvents: [regEvent, ...prev.lifecycleEvents].slice(0, 200),
        missionGame: nextGame,
      };
    });
    showToast(`${existing.name} 수량을 합산했습니다.`);
    setActiveConflict(null);
  };

  const handleRegisterDuplicateSeparately = () => {
    if (!activeConflict) return;
    const { incoming } = activeConflict;
    const created: Ingredient = {
      ...incoming,
      id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    const regEvent = buildRegisteredLifecycleEvent(created);
    setState((prev) => {
      const { nextGame } = advanceMissionProgress(prev.missionGame, 'register', {
        itemNames: [created.name],
        category: created.category,
        hasExpiryDate: Boolean(created.expiryDate),
        incrementBy: 1,
      });
      return {
        ...prev,
        ingredients: [created, ...prev.ingredients],
        lifecycleEvents: [regEvent, ...prev.lifecycleEvents].slice(0, 200),
        missionGame: nextGame,
      };
    });
    showToast(`${incoming.name} 항목을 별도로 등록했습니다.`);
    setActiveConflict(null);
  };

  // Ingredient CRUD
  const handleSaveIngredientForm = (draft: IngredientDraft, editingId?: string) => {
    if (editingId) {
      setState((prev) => {
        const { nextGame } = advanceMissionProgress(prev.missionGame, 'expiry_edit', {
          itemNames: [draft.name],
          category: draft.category,
          hasExpiryDate: Boolean(draft.expiryDate),
          incrementBy: 1,
        });
        return {
          ...prev,
          ingredients: prev.ingredients.map((item) =>
            item.id === editingId ? { ...item, ...draft } : item
          ),
          missionGame: nextGame,
        };
      });
      setIngredientFormOpen(false);
      setEditingIngredient(null);
      showToast(`${draft.name} 정보를 수정했습니다.`);
      return;
    }

    setIngredientFormOpen(false);
    setEditingIngredient(null);
    setPendingDraftQueue((prev) => [...prev, draft]);
    showToast(`${draft.name} 등록을 처리합니다.`);
  };

  const handleApprovePhotoCandidates = (drafts: IngredientDraft[]) => {
    if (drafts.length === 0) return;
    setPendingDraftQueue((prev) => [...prev, ...drafts]);
    showToast(`검수한 식재료 ${drafts.length}건 등록을 진행합니다.`);
  };

  const handleRequestDeleteIngredient = (item: Ingredient) => {
    setConfirmDialog({
      title: '식재료 삭제 확인',
      description: `'${item.name} (${item.quantity}${item.unit})'을(를) 내 냉장고 목록에서 삭제하시겠습니까?`,
      confirmLabel: '삭제하기',
      variant: 'danger',
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          ingredients: prev.ingredients.filter((i) => i.id !== item.id),
        }));
        setConfirmDialog(null);
        showToast(`${item.name} 항목을 삭제했습니다.`);
      },
    });
  };

  // Sample Data & Reset Handlers
  const hasSampleIngredients = useMemo(
    () => state.ingredients.some((i) => i.isSample),
    [state.ingredients]
  );
  const hasSampleReportData = useMemo(
    () =>
      state.expenses.some((e) => e.isSample) ||
      state.wastes.some((w) => w.isSample) ||
      state.recipeUsages.some((r) => r.isSample) ||
      state.lifecycleEvents.some((le) => le.isSample),
    [state.expenses, state.wastes, state.recipeUsages, state.lifecycleEvents]
  );
  const hasAnySampleData = hasSampleIngredients || hasSampleReportData;

  const handleLoadSampleData = () => {
    const samples = createSampleIngredients();
    setState((prev) => {
      const existingNames = new Set(prev.ingredients.map((i) => i.name.trim()));
      const newOnes = samples.filter((s) => !existingNames.has(s.name.trim()));
      if (newOnes.length === 0) {
        return prev;
      }
      const nextIngredients = [...newOnes, ...prev.ingredients];
      const sampleRegEvents = newOnes.map((item) => buildRegisteredLifecycleEvent(item));
      const shouldRefreshEmptyBoard =
        prev.ingredients.length === 0 &&
        prev.missionGame.completedMissionsCount === 0 &&
        prev.missionGame.totalPoints === 0;
      return {
        ...prev,
        ingredients: nextIngredients,
        lifecycleEvents: [...sampleRegEvents, ...prev.lifecycleEvents].slice(0, 200),
        missionGame: shouldRefreshEmptyBoard
          ? {
              ...prev.missionGame,
              activeMissions: buildPersonalizedMissionRound(
                nextIngredients,
                prev.wastes,
                prev.missionGame.roundNumber
              ),
            }
          : prev.missionGame,
      };
    });
    showToast('샘플 식재료(애호박, 달걀, 두부, 대파, 양파, 우유)를 불러왔습니다.');
  };

  const handleLoadSampleReportData = () => {
    const sampleReport = createSampleReportData();
    const sampleOneMonth = createSampleOneMonthLifecycleEvents();
    setState((prev) => ({
      ...prev,
      expenses: [...sampleReport.expenses, ...prev.expenses.filter((e) => !e.isSample)],
      wastes: [...sampleReport.wastes, ...prev.wastes.filter((w) => !w.isSample)],
      recipeUsages: [
        ...sampleReport.recipeUsages,
        ...prev.recipeUsages.filter((r) => !r.isSample),
      ],
      lifecycleEvents: [
        ...sampleOneMonth.lifecycleEvents,
        ...prev.lifecycleEvents.filter((le) => !le.isSample),
      ].slice(0, 200),
    }));
    showToast('리포트 시연용 예시 내역과 1개월 생애주기 기록을 불러왔습니다.');
  };

  const handleLoadSampleLifecycleData = () => {
    const sampleOneMonth = createSampleOneMonthLifecycleEvents();
    setState((prev) => ({
      ...prev,
      lifecycleEvents: [
        ...sampleOneMonth.lifecycleEvents,
        ...prev.lifecycleEvents.filter((le) => !le.isSample),
      ].slice(0, 200),
      wastes:
        prev.wastes.length > 0
          ? prev.wastes
          : [...sampleOneMonth.wastes, ...prev.wastes.filter((w) => !w.isSample)],
    }));
    showToast('1개월 누적 식재료 등록·소비·폐기 예시 기록(12건)을 불러왔습니다.');
  };

  const handleRequestRemoveSampleData = () => {
    setConfirmDialog({
      title: '샘플 데이터 삭제',
      description:
        '시연용으로 불러온 샘플 식재료 및 리포트·생애주기 예시 내역만 삭제합니다. 직접 등록한 데이터는 그대로 유지됩니다.',
      confirmLabel: '샘플만 삭제',
      variant: 'primary',
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          ingredients: prev.ingredients.filter((i) => !i.isSample),
          expenses: prev.expenses.filter((e) => !e.isSample),
          wastes: prev.wastes.filter((w) => !w.isSample),
          recipeUsages: prev.recipeUsages.filter((r) => !r.isSample),
          lifecycleEvents: prev.lifecycleEvents.filter((le) => !le.isSample),
          shoppingList: prev.shoppingList.filter((s) => !s.isSample),
        }));
        setConfirmDialog(null);
        showToast('샘플 데이터를 모두 삭제했습니다.');
      },
    });
  };

  const handleRequestResetAllData = () => {
    setConfirmDialog({
      title: '전체 데이터 초기화',
      description:
        '냉장고 식재료, 추천 레시피, 장보기 리스트, 미션 점수, 절약 리포트 기록을 모두 초기화합니다. 이 작업은 되돌릴 수 없습니다.',
      confirmLabel: '전체 초기화',
      variant: 'danger',
      onConfirm: () => {
        const fresh = getDefaultState();
        setState((prev) => ({
          ...fresh,
          profile: cloudBootstrappedUid ? prev.profile : fresh.profile,
        }));
        setConfirmDialog(null);
        showToast('모든 데이터가 초기 상태로 재설정되었습니다.');
      },
    });
  };

  // Expiry & Consumption Handlers
  const handleConsumeIngredient = (
    target: Ingredient,
    consumedQty: number,
    recordRescueSavingAmount?: number
  ) => {
    const remaining = Math.round((target.quantity - consumedQty) * 100) / 100;
    const today = getTodayDateString();
    const currentMonth = getCurrentMonthString();
    const ev = evaluateExpiry(target.expiryDate);
    const ratio = target.quantity > 0 ? Math.min(1, consumedQty / target.quantity) : 1;
    const estimatedConsumedKRW =
      recordRescueSavingAmount && recordRescueSavingAmount > 0
        ? recordRescueSavingAmount
        : Math.round((target.purchasePrice ?? 2000) * ratio);

    const consumedEvent: IngredientLifecycleEvent = {
      id: `lc-con-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: today,
      month: currentMonth,
      action: 'consumed',
      itemName: target.name.slice(0, 80),
      category: target.category,
      storage: target.storage,
      quantity: Math.max(0.01, consumedQty),
      unit: (target.unit || '개').slice(0, 20),
      amountKRW: Math.max(0, estimatedConsumedKRW),
      daysHeld: calculateDaysBetween(target.purchaseDate || today, today),
      daysFromExpiry: ev.daysRemaining ?? 0,
      causeTag: '',
      note: remaining <= 0 ? '소비기한 내 전량 소비 완료' : `${consumedQty}${target.unit} 부분 소비`,
      isSample: target.isSample,
    };

    let autoPointsEarned = 0;

    setState((prev) => {
      const nextIngredients =
        remaining <= 0
          ? prev.ingredients.filter((i) => i.id !== target.id)
          : prev.ingredients.map((i) =>
              i.id === target.id ? { ...i, quantity: remaining } : i
            );

      const nextUsages =
        recordRescueSavingAmount && recordRescueSavingAmount > 0
          ? [
              {
                id: `usage-rescue-${Date.now()}`,
                date: today,
                month: currentMonth,
                recipeTitle: `${target.name} 소비기한 내 알뜰 소진`,
                usedIngredients: [target.name],
                savedAmount: recordRescueSavingAmount,
              },
              ...prev.recipeUsages,
            ]
          : prev.recipeUsages;

      const { nextGame, pointsGained } = advanceMissionProgress(prev.missionGame, 'consume', {
        itemNames: [target.name],
        category: target.category,
        incrementBy: 1,
      });
      autoPointsEarned = pointsGained;

      return {
        ...prev,
        ingredients: nextIngredients,
        recipeUsages: nextUsages,
        lifecycleEvents: [consumedEvent, ...prev.lifecycleEvents].slice(0, 200),
        missionGame: nextGame,
      };
    });

    const missionSuffix = autoPointsEarned > 0 ? ` · 냉파 미션 자동 달성(+${autoPointsEarned}점)` : '';
    showToast(
      (remaining <= 0
        ? `${target.name} 전량 소비 완료되어 목록에서 제거했습니다`
        : `${target.name} ${consumedQty}${target.unit} 차감했습니다`) + `${missionSuffix}`
    );
  };

  const handleDiscardExpiredIngredient = (
    target: Ingredient,
    wastedAmount: number,
    reason: string,
    causeTag: WasteCauseTag
  ) => {
    const today = getTodayDateString();
    const currentMonth = getCurrentMonthString();
    const ev = evaluateExpiry(target.expiryDate);
    const validCauseTag: WasteCauseTag = WASTE_CAUSE_TAGS.includes(causeTag)
      ? causeTag
      : inferCauseTagFromReason(reason);

    const wastedEvent: IngredientLifecycleEvent = {
      id: `lc-wst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: today,
      month: currentMonth,
      action: 'wasted',
      itemName: target.name.slice(0, 80),
      category: target.category,
      storage: target.storage,
      quantity: Math.max(0.01, target.quantity),
      unit: (target.unit || '개').slice(0, 20),
      amountKRW: Math.max(0, Math.round(wastedAmount)),
      daysHeld: calculateDaysBetween(target.purchaseDate || today, today),
      daysFromExpiry: ev.daysRemaining ?? -1,
      causeTag: validCauseTag,
      note: reason.slice(0, 300),
    };

    setState((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((i) => i.id !== target.id),
      wastes: [
        {
          id: `waste-${Date.now()}`,
          date: today,
          month: currentMonth,
          itemName: target.name,
          category: target.category,
          wastedAmount,
          reason,
        },
        ...prev.wastes,
      ],
      lifecycleEvents: [wastedEvent, ...prev.lifecycleEvents].slice(0, 200),
    }));

    showToast(`${target.name} 폐기 처리 및 원인(${validCauseTag}) 기록을 완료했습니다.`);
  };

  // Recipe & Shopping List Handlers
  const displayRecipes = useMemo(() => {
    if (state.recommendedRecipes.length > 0) {
      return state.recommendedRecipes;
    }
    return buildOwnedMatchedPreviewRecipes(
      state.ingredients,
      state.profile.allergiesAndDislikes
    );
  }, [state.recommendedRecipes, state.ingredients, state.profile.allergiesAndDislikes]);

  const handleAddMissingToShopping = (
    items: RecipeMissingIngredient[],
    recipeTitle: string
  ) => {
    if (items.length === 0) return;

    setState((prev) => {
      const updatedList = [...prev.shoppingList];
      let addedCount = 0;

      for (const m of items) {
        const cleanName = m.name.trim();
        const existingIdx = updatedList.findIndex(
          (s) => !s.checked && s.name.trim().toLowerCase() === cleanName.toLowerCase()
        );
        const parsedQty = parseMissingAmount(m.amount);

        if (existingIdx >= 0) {
          updatedList[existingIdx] = {
            ...updatedList[existingIdx],
            quantity:
              Math.round((updatedList[existingIdx].quantity + parsedQty.quantity) * 100) / 100,
          };
        } else {
          updatedList.unshift({
            id: `shop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: cleanName,
            category: m.category || '기타',
            quantity: parsedQty.quantity,
            unit: parsedQty.unit,
            estimatedPrice: m.estimatedPrice || 2500,
            checked: false,
            sourceRecipeTitle: recipeTitle,
            createdAt: new Date().toISOString(),
          });
        }
        addedCount++;
      }

      if (addedCount > 0) {
        showToast(`'${recipeTitle}'의 부족한 재료 ${addedCount}종을 장보기 리스트에 담았습니다.`);
      }
      return { ...prev, shoppingList: updatedList };
    });
  };

  const handleRecordCookingComplete = (
    recipeTitle: string,
    usedNames: string[],
    savedAmount: number,
    deductFromFridge: boolean
  ) => {
    const today = getTodayDateString();
    const currentMonth = getCurrentMonthString();
    let autoPointsEarned = 0;

    setState((prev) => {
      let nextIngredients = prev.ingredients;
      const cookConsumedEvents: IngredientLifecycleEvent[] = [];

      if (deductFromFridge && usedNames.length > 0) {
        nextIngredients = prev.ingredients
          .map((ing) => {
            const isUsed = usedNames.some(
              (u) => ing.name.includes(u) || u.includes(ing.name)
            );
            if (!isUsed) return ing;
            const consumedUnitQty = Math.min(ing.quantity, 1);
            const ev = evaluateExpiry(ing.expiryDate);
            const ratio = ing.quantity > 0 ? Math.min(1, consumedUnitQty / ing.quantity) : 1;
            cookConsumedEvents.push({
              id: `lc-cook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              date: today,
              month: currentMonth,
              action: 'consumed',
              itemName: ing.name.slice(0, 80),
              category: ing.category,
              storage: ing.storage,
              quantity: Math.max(0.01, consumedUnitQty),
              unit: (ing.unit || '개').slice(0, 20),
              amountKRW: Math.round((ing.purchasePrice ?? 1800) * ratio),
              daysHeld: calculateDaysBetween(ing.purchaseDate || today, today),
              daysFromExpiry: ev.daysRemaining ?? 0,
              causeTag: '',
              note: `'${recipeTitle}' 조리에 활용`,
              isSample: ing.isSample,
            });
            const nextQty = Math.round((ing.quantity - 1) * 100) / 100;
            return { ...ing, quantity: nextQty };
          })
          .filter((ing) => ing.quantity > 0);
      }

      const usageRecord: RecipeUsageRecord = {
        id: `usage-${Date.now()}`,
        date: today,
        month: currentMonth,
        recipeTitle,
        usedIngredients: usedNames,
        savedAmount,
      };

      const { nextGame, pointsGained } = advanceMissionProgress(prev.missionGame, 'cook', {
        itemNames: usedNames,
        incrementBy: 1,
      });
      autoPointsEarned = pointsGained;

      return {
        ...prev,
        ingredients: nextIngredients,
        recipeUsages: [usageRecord, ...prev.recipeUsages],
        lifecycleEvents: [...cookConsumedEvents, ...prev.lifecycleEvents].slice(0, 200),
        missionGame: nextGame,
      };
    });

    const bonusNotice = autoPointsEarned > 0 ? ` · 미션 달성(+${autoPointsEarned}점)` : '';
    showToast(`'${recipeTitle}' 조리 완료 및 절약 내역이 기록되었습니다${bonusNotice}.`);
  };

  // Shopping List Operations
  const handleAddShoppingItem = (
    item: Omit<ShoppingItem, 'id' | 'createdAt' | 'checked'>
  ) => {
    const created: ShoppingItem = {
      ...item,
      id: `shop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      checked: false,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      shoppingList: [created, ...prev.shoppingList],
    }));
    showToast(`${item.name} 항목을 장보기 리스트에 추가했습니다.`);
  };

  const handleToggleShoppingChecked = (id: string) => {
    setState((prev) => ({
      ...prev,
      shoppingList: prev.shoppingList.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      ),
    }));
  };

  const handleUpdateShoppingItem = (id: string, patch: Partial<ShoppingItem>) => {
    setState((prev) => ({
      ...prev,
      shoppingList: prev.shoppingList.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  };

  const handleRequestDeleteShoppingItem = (item: ShoppingItem) => {
    setConfirmDialog({
      title: '장보기 항목 삭제',
      description: `'${item.name}' 항목을 장보기 리스트에서 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      variant: 'danger',
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          shoppingList: prev.shoppingList.filter((s) => s.id !== item.id),
        }));
        setConfirmDialog(null);
      },
    });
  };

  const handleRequestClearShoppingList = () => {
    setConfirmDialog({
      title: '장보기 리스트 초기화',
      description: '현재 장보기 리스트의 모든 항목을 비우시겠습니까?',
      confirmLabel: '목록 비우기',
      variant: 'danger',
      onConfirm: () => {
        setState((prev) => ({ ...prev, shoppingList: [] }));
        setConfirmDialog(null);
        showToast('장보기 리스트를 초기화했습니다.');
      },
    });
  };

  const handleTransferCheckedToFridge = (
    checkedIds: string[],
    drafts: IngredientDraft[],
    logExpenseTotal: boolean
  ) => {
    const today = getTodayDateString();
    const currentMonth = getCurrentMonthString();

    setState((prev) => {
      const checkedItems = prev.shoppingList.filter((s) => checkedIds.includes(s.id));
      const totalSpent = checkedItems.reduce((sum, s) => sum + (s.estimatedPrice || 0), 0);

      const nextExpenses: ExpenseRecord[] =
        logExpenseTotal && totalSpent > 0
          ? [
              {
                id: `exp-shop-${Date.now()}`,
                date: today,
                month: currentMonth,
                itemName:
                  checkedItems.length === 1
                    ? `${checkedItems[0].name} 장보기 구매`
                    : `${checkedItems[0].name} 외 ${checkedItems.length - 1}건 장보기`,
                category: checkedItems[0]?.category || '기타',
                amount: totalSpent,
              },
              ...prev.expenses,
            ]
          : prev.expenses;

      return {
        ...prev,
        shoppingList: prev.shoppingList.filter((s) => !checkedIds.includes(s.id)),
        expenses: nextExpenses,
      };
    });

    setPendingDraftQueue((prev) => [...prev, ...drafts]);
    showToast(`구매 완료한 ${drafts.length}종 식재료 입고를 진행합니다.`);
  };

  // Report Ledger Handlers (with Delete Confirmation)
  const handleAddExpense = (rec: Omit<ExpenseRecord, 'id'>) => {
    setState((prev) => ({
      ...prev,
      expenses: [{ ...rec, id: `exp-${Date.now()}` }, ...prev.expenses],
    }));
    showToast('식재료 구매 지출을 기록했습니다.');
  };

  const handleRequestDeleteExpense = (id: string) => {
    setConfirmDialog({
      title: '구매 지출 기록 삭제',
      description: '선택한 식비 지출 내역을 리포트에서 삭제하시겠습니까?',
      confirmLabel: '삭제',
      variant: 'danger',
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          expenses: prev.expenses.filter((e) => e.id !== id),
        }));
        setConfirmDialog(null);
      },
    });
  };

  const handleAddWaste = (rec: Omit<WasteRecord, 'id'>, causeTag?: WasteCauseTag) => {
    const validCause =
      causeTag && WASTE_CAUSE_TAGS.includes(causeTag)
        ? causeTag
        : inferCauseTagFromReason(rec.reason);

    const wastedEvent: IngredientLifecycleEvent = {
      id: `lc-manwst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: rec.date,
      month: rec.month,
      action: 'wasted',
      itemName: rec.itemName.slice(0, 80),
      category: rec.category,
      storage: '냉장',
      quantity: 1,
      unit: '건',
      amountKRW: Math.max(0, Math.round(rec.wastedAmount)),
      daysHeld: 6,
      daysFromExpiry: -2,
      causeTag: validCause,
      note: rec.reason.slice(0, 300),
      isSample: rec.isSample,
    };

    setState((prev) => ({
      ...prev,
      wastes: [{ ...rec, id: `waste-${Date.now()}` }, ...prev.wastes],
      lifecycleEvents: [wastedEvent, ...prev.lifecycleEvents].slice(0, 200),
    }));
    showToast(`식재료 폐기 내역과 원인(${validCause})을 기록했습니다.`);
  };

  const handleRequestDeleteWaste = (id: string) => {
    setConfirmDialog({
      title: '폐기 기록 삭제',
      description: '선택한 폐기 손실 기록을 리포트에서 삭제하시겠습니까?',
      confirmLabel: '삭제',
      variant: 'danger',
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          wastes: prev.wastes.filter((w) => w.id !== id),
        }));
        setConfirmDialog(null);
      },
    });
  };

  const handleAddRecipeUsage = (rec: Omit<RecipeUsageRecord, 'id'>) => {
    setState((prev) => ({
      ...prev,
      recipeUsages: [{ ...rec, id: `usage-${Date.now()}` }, ...prev.recipeUsages],
    }));
    showToast('레시피 활용 절약 내역을 기록했습니다.');
  };

  const handleRequestDeleteRecipeUsage = (id: string) => {
    setConfirmDialog({
      title: '레시피 활용 기록 삭제',
      description: '선택한 절약 기록을 리포트에서 삭제하시겠습니까?',
      confirmLabel: '삭제',
      variant: 'danger',
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          recipeUsages: prev.recipeUsages.filter((r) => r.id !== id),
        }));
        setConfirmDialog(null);
      },
    });
  };

  const handleSaveMonthlyAiSummary = (summary: MonthlyAiSummary) => {
    setState((prev) => ({
      ...prev,
      monthlyAiSummaries: {
        ...prev.monthlyAiSummaries,
        [summary.month]: summary,
      },
    }));
  };

  const handleSaveWasteAnalysis = (analysis: WasteCauseAnalysis) => {
    setState((prev) => ({
      ...prev,
      wasteAnalyses: {
        ...prev.wasteAnalyses,
        [analysis.month]: analysis,
      },
    }));
    showToast('1개월 식재료 낭비 원인 AI 진단 및 해결 처방을 저장했습니다.');
  };

  // Mission Mini-Game Handlers
  const handleCompleteMissionWithAction = (
    mission: FridgeMission,
    options?: {
      consumeIngredientId?: string;
      consumeQty?: number;
      logSavingKRW?: number;
    }
  ) => {
    const today = getTodayDateString();
    const currentMonth = getCurrentMonthString();
    let leveledUpTitle: string | null = null;

    setState((prev) => {
      const targetMission = prev.missionGame.activeMissions.find((m) => m.id === mission.id);
      if (!targetMission || targetMission.completed) return prev;

      const prevRank = getRankByPoints(prev.missionGame.totalPoints).currentRank;
      const nextPoints = prev.missionGame.totalPoints + targetMission.points;
      const nextRank = getRankByPoints(nextPoints).currentRank;
      if (nextRank.id !== prevRank.id) {
        leveledUpTitle = nextRank.title;
      }

      let nextIngredients = prev.ingredients;
      let nextLifecycle = prev.lifecycleEvents;
      const usedIngNames: string[] = [];

      if (options?.consumeIngredientId && options.consumeQty && options.consumeQty > 0) {
        const matchedIng = prev.ingredients.find((i) => i.id === options.consumeIngredientId);
        if (matchedIng) {
          usedIngNames.push(matchedIng.name);
          const deductQty = Math.min(matchedIng.quantity, options.consumeQty);
          const remaining = Math.round((matchedIng.quantity - deductQty) * 100) / 100;
          nextIngredients =
            remaining <= 0
              ? prev.ingredients.filter((i) => i.id !== matchedIng.id)
              : prev.ingredients.map((i) =>
                  i.id === matchedIng.id ? { ...i, quantity: remaining } : i
                );

          const ev = evaluateExpiry(matchedIng.expiryDate);
          const ratio = matchedIng.quantity > 0 ? Math.min(1, deductQty / matchedIng.quantity) : 1;
          const lcEvent: IngredientLifecycleEvent = {
            id: `lc-msn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            date: today,
            month: currentMonth,
            action: 'consumed',
            itemName: matchedIng.name.slice(0, 80),
            category: matchedIng.category,
            storage: matchedIng.storage,
            quantity: Math.max(0.01, deductQty),
            unit: (matchedIng.unit || '개').slice(0, 20),
            amountKRW:
              options.logSavingKRW && options.logSavingKRW > 0
                ? options.logSavingKRW
                : Math.round((matchedIng.purchasePrice ?? 2000) * ratio),
            daysHeld: calculateDaysBetween(matchedIng.purchaseDate || today, today),
            daysFromExpiry: ev.daysRemaining ?? 0,
            causeTag: '',
            note: `냉파 미션 완료: ${targetMission.title.slice(0, 80)}`,
            isSample: matchedIng.isSample,
          };
          nextLifecycle = [lcEvent, ...prev.lifecycleEvents].slice(0, 200);
        }
      }

      const nextUsages =
        options?.logSavingKRW && options.logSavingKRW > 0
          ? [
              {
                id: `usage-msn-${Date.now()}`,
                date: today,
                month: currentMonth,
                recipeTitle: `[냉파 미션] ${targetMission.title.slice(0, 90)}`,
                usedIngredients:
                  usedIngNames.length > 0
                    ? usedIngNames
                    : targetMission.targetItemName
                    ? [targetMission.targetItemName]
                    : ['냉장고 보유 식재료'],
                savedAmount: Math.round(options.logSavingKRW),
              },
              ...prev.recipeUsages,
            ]
          : prev.recipeUsages;

      const updatedActive = prev.missionGame.activeMissions.map((m) =>
        m.id === targetMission.id
          ? { ...m, currentCount: m.requiredCount, completed: true }
          : m
      );

      return {
        ...prev,
        ingredients: nextIngredients,
        recipeUsages: nextUsages,
        lifecycleEvents: nextLifecycle,
        missionGame: {
          ...prev.missionGame,
          totalPoints: nextPoints,
          completedMissionsCount: prev.missionGame.completedMissionsCount + 1,
          activeMissions: updatedActive,
          recentLogs: [
            {
              id: `mlog-${Date.now()}`,
              title: targetMission.title,
              pointsEarned: targetMission.points,
              completedAt: new Date().toISOString(),
            },
            ...prev.missionGame.recentLogs,
          ].slice(0, 30),
        },
      };
    });

    if (leveledUpTitle) {
      showToast(`미션 완료! 축하합니다, '${leveledUpTitle}' 칭호로 승급했습니다!`);
    } else {
      showToast(`미션을 완료하고 +${mission.points}점을 획득했습니다!`);
    }
  };

  const handleClaimRoundAllClearBonus = () => {
    let earnedBonus = 0;
    let leveledUpTitle: string | null = null;

    setState((prev) => {
      const allDone =
        prev.missionGame.activeMissions.length > 0 &&
        prev.missionGame.activeMissions.every((m) => m.completed);
      if (!allDone || prev.missionGame.roundBonusClaimed) return prev;

      const prevRank = getRankByPoints(prev.missionGame.totalPoints).currentRank;
      earnedBonus = prevRank.allClearBonusPoints;
      const nextPoints = prev.missionGame.totalPoints + earnedBonus;
      const nextRank = getRankByPoints(nextPoints).currentRank;
      if (nextRank.id !== prevRank.id) {
        leveledUpTitle = nextRank.title;
      }

      return {
        ...prev,
        missionGame: {
          ...prev.missionGame,
          totalPoints: nextPoints,
          completedRounds: prev.missionGame.completedRounds + 1,
          roundBonusClaimed: true,
          recentLogs: [
            {
              id: `mlog-bonus-${Date.now()}`,
              title: `라운드 ${prev.missionGame.roundNumber} 올클리어 완수 보너스 (${prevRank.title})`,
              pointsEarned: earnedBonus,
              completedAt: new Date().toISOString(),
            },
            ...prev.missionGame.recentLogs,
          ].slice(0, 30),
        },
      };
    });

    if (earnedBonus > 0) {
      if (leveledUpTitle) {
        showToast(
          `올클리어 보너스 +${earnedBonus}점 획득! '${leveledUpTitle}' 등급 혜택이 해금되었습니다!`
        );
      } else {
        showToast(`라운드 올클리어 보너스 +${earnedBonus}점을 획득했습니다!`);
      }
    }
  };

  const handleStartNextMissionRound = (customMissions?: FridgeMission[]) => {
    setState((prev) => {
      const nextRound = prev.missionGame.roundNumber + 1;
      const nextMissions =
        customMissions && customMissions.length > 0
          ? customMissions
          : buildPersonalizedMissionRound(prev.ingredients, prev.wastes, nextRound);

      return {
        ...prev,
        missionGame: {
          ...prev.missionGame,
          roundNumber: nextRound,
          roundBonusClaimed: false,
          activeMissions: nextMissions,
        },
      };
    });
    showToast('새로운 냉파 미션 라운드가 시작되었습니다!');
  };

  const handleRefreshCurrentRoundMissions = (customMissions?: FridgeMission[]) => {
    setState((prev) => {
      const nextMissions =
        customMissions && customMissions.length > 0
          ? customMissions
          : buildPersonalizedMissionRound(
              prev.ingredients,
              prev.wastes,
              prev.missionGame.roundNumber
            );
      return {
        ...prev,
        missionGame: {
          ...prev.missionGame,
          roundBonusClaimed: false,
          activeMissions: nextMissions,
        },
      };
    });
    showToast('현재 냉장고 재료 상황에 맞춰 미션 보드를 재구성했습니다.');
  };

  const handleNavigateWithSecretMode = (mode: ChefSecretMode) => {
    setPendingSecretMode(mode);
    setActivePage('recipes');
  };

  const handleUpdateProfile = (nextProfile: UserProfile) => {
    setState((prev) => ({ ...prev, profile: nextProfile }));
    showToast('사용자 프로필 및 맞춤 설정을 저장했습니다.');
  };

  // Derived Header & Dashboard Counts
  const urgentOrCheckCount = useMemo(
    () =>
      state.ingredients.filter((i) => {
        const ev = evaluateExpiry(i.expiryDate);
        return ev.status === 'urgent' || ev.status === 'check_needed';
      }).length,
    [state.ingredients]
  );

  const unpurchasedShoppingCount = useMemo(
    () => state.shoppingList.filter((s) => !s.checked).length,
    [state.shoppingList]
  );

  const currentMonth = getCurrentMonthString();
  const currentMonthUsages = useMemo(
    () => state.recipeUsages.filter((u) => u.month === currentMonth),
    [state.recipeUsages, currentMonth]
  );
  const currentMonthSavedAmount = useMemo(
    () => currentMonthUsages.reduce((sum, u) => sum + u.savedAmount, 0),
    [currentMonthUsages]
  );

  const currentRankInfo = useMemo(
    () => getRankByPoints(state.missionGame.totalPoints),
    [state.missionGame.totalPoints]
  );

  const incompleteMissionCount = useMemo(
    () => state.missionGame.activeMissions.filter((m) => !m.completed).length,
    [state.missionGame.activeMissions]
  );

  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      ingredientCount={state.ingredients.length}
      urgentOrCheckCount={urgentOrCheckCount}
      incompleteMissionCount={incompleteMissionCount}
      unpurchasedShoppingCount={unpurchasedShoppingCount}
      rankTitle={currentRankInfo.currentRank.title}
      rankLevel={currentRankInfo.currentRank.level}
      totalPoints={state.missionGame.totalPoints}
      hasSampleData={hasAnySampleData}
      aiConfigured={aiConfigured}
      aiAuthorized={aiAuthorized}
      profile={state.profile}
      cloudAuthReady={cloudAuthReady}
      cloudUserEmail={cloudUser?.email ?? null}
      cloudSyncStatus={cloudSyncStatus}
      cloudErrorMessage={cloudErrorMessage}
      onSignInCloud={handleSignInCloud}
      onSignOutCloud={handleSignOutCloud}
      onUpdateProfile={handleUpdateProfile}
      onLoadSampleData={handleLoadSampleData}
      onRemoveSampleData={handleRequestRemoveSampleData}
      onResetAllData={handleRequestResetAllData}
      toastMessage={toastMessage}
      onDismissToast={() => setToastMessage(null)}
    >
      {activePage === 'dashboard' && (
        <DashboardPage
          profile={state.profile}
          ingredients={state.ingredients}
          displayRecipes={displayRecipes}
          currentMonthSavedAmount={currentMonthSavedAmount}
          currentMonthCookedCount={currentMonthUsages.length}
          missionGame={state.missionGame}
          lifecycleEventCount={state.lifecycleEvents.length}
          hasSampleData={hasAnySampleData}
          onNavigate={setActivePage}
          onOpenAddIngredient={() => {
            setEditingIngredient(null);
            setIngredientFormOpen(true);
          }}
          onSelectRecipe={setSelectedRecipe}
          onAddMissingToShopping={handleAddMissingToShopping}
          onLoadSampleData={handleLoadSampleData}
          onRemoveSampleData={handleRequestRemoveSampleData}
        />
      )}

      {activePage === 'fridge' && (
        <FridgePage
          ingredients={state.ingredients}
          hasSampleData={hasAnySampleData}
          onOpenAddModal={() => {
            setEditingIngredient(null);
            setIngredientFormOpen(true);
          }}
          onOpenEditModal={(item) => {
            setEditingIngredient(item);
            setIngredientFormOpen(true);
          }}
          onOpenPhotoModal={() => setPhotoModalOpen(true)}
          onRequestDelete={handleRequestDeleteIngredient}
          onLoadSampleData={handleLoadSampleData}
          onRemoveSampleData={handleRequestRemoveSampleData}
        />
      )}

      {activePage === 'recipes' && (
        <RecipePage
          ingredients={state.ingredients}
          recipes={displayRecipes}
          allergiesAndDislikes={state.profile.allergiesAndDislikes}
          totalPoints={state.missionGame.totalPoints}
          initialSecretMode={pendingSecretMode}
          onClearInitialSecretMode={() => setPendingSecretMode('none')}
          onUpdateAllergies={(next) =>
            setState((prev) => ({
              ...prev,
              profile: { ...prev.profile, allergiesAndDislikes: next },
            }))
          }
          onSaveGeneratedRecipes={(recipes) => {
            setState((prev) => ({ ...prev, recommendedRecipes: recipes }));
            showToast('보유 재료 기반 AI 맞춤 레시피 3선을 생성했습니다.');
          }}
          onSelectRecipe={setSelectedRecipe}
          onAddMissingToShopping={handleAddMissingToShopping}
          onNavigate={setActivePage}
          onLoadSampleData={handleLoadSampleData}
        />
      )}

      {activePage === 'expiry' && (
        <ExpiryPage
          ingredients={state.ingredients}
          onConsumeIngredient={handleConsumeIngredient}
          onDiscardExpiredIngredient={handleDiscardExpiredIngredient}
          onOpenEditModal={(item) => {
            setEditingIngredient(item);
            setIngredientFormOpen(true);
          }}
          onNavigate={setActivePage}
        />
      )}

      {activePage === 'missions' && (
        <MissionPage
          ingredients={state.ingredients}
          wastes={state.wastes}
          lifecycleEvents={state.lifecycleEvents}
          missionGame={state.missionGame}
          onCompleteMissionWithAction={handleCompleteMissionWithAction}
          onClaimRoundAllClearBonus={handleClaimRoundAllClearBonus}
          onStartNextMissionRound={handleStartNextMissionRound}
          onRefreshCurrentRoundMissions={handleRefreshCurrentRoundMissions}
          onNavigateWithSecretMode={handleNavigateWithSecretMode}
          onNavigate={setActivePage}
          onLoadSampleData={handleLoadSampleData}
        />
      )}

      {activePage === 'shopping' && (
        <ShoppingPage
          shoppingList={state.shoppingList}
          availableRecipes={displayRecipes}
          storeRecommendation={state.storeRecommendation ?? null}
          onSaveStoreRecommendation={(rec) =>
            setState((prev) => ({ ...prev, storeRecommendation: rec }))
          }
          onAddShoppingItem={handleAddShoppingItem}
          onToggleChecked={handleToggleShoppingChecked}
          onUpdateShoppingItem={handleUpdateShoppingItem}
          onRequestDeleteShoppingItem={handleRequestDeleteShoppingItem}
          onRequestClearShoppingList={handleRequestClearShoppingList}
          onImportMissingFromRecipe={handleAddMissingToShopping}
          onTransferCheckedToFridge={handleTransferCheckedToFridge}
        />
      )}

      {activePage === 'report' && (
        <ReportPage
          expenses={state.expenses}
          wastes={state.wastes}
          recipeUsages={state.recipeUsages}
          monthlyAiSummaries={state.monthlyAiSummaries}
          lifecycleEvents={state.lifecycleEvents}
          wasteAnalyses={state.wasteAnalyses}
          monthlyBudget={state.profile.monthlyBudget}
          hasSampleReportData={hasSampleReportData}
          onAddExpense={handleAddExpense}
          onDeleteExpense={handleRequestDeleteExpense}
          onAddWaste={handleAddWaste}
          onDeleteWaste={handleRequestDeleteWaste}
          onAddRecipeUsage={handleAddRecipeUsage}
          onDeleteRecipeUsage={handleRequestDeleteRecipeUsage}
          onSaveMonthlyAiSummary={handleSaveMonthlyAiSummary}
          onSaveWasteAnalysis={handleSaveWasteAnalysis}
          onLoadSampleReportData={handleLoadSampleReportData}
          onLoadSampleLifecycleData={handleLoadSampleLifecycleData}
          onRemoveSampleData={handleRequestRemoveSampleData}
        />
      )}

      {/* Shared Modals */}
      <IngredientFormModal
        open={ingredientFormOpen}
        editingItem={editingIngredient}
        onClose={() => {
          setIngredientFormOpen(false);
          setEditingIngredient(null);
        }}
        onSubmit={handleSaveIngredientForm}
      />

      <PhotoRecognitionModal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        onApproveCandidates={handleApprovePhotoCandidates}
      />

      <DuplicateResolutionModal
        conflict={activeConflict}
        remainingQueueCount={pendingDraftQueue.length}
        onMergeQuantity={handleMergeDuplicate}
        onRegisterSeparately={handleRegisterDuplicateSeparately}
        onCancel={() => setActiveConflict(null)}
      />

      <RecipeDetailModal
        recipe={selectedRecipe}
        fridgeIngredients={state.ingredients}
        onClose={() => setSelectedRecipe(null)}
        onAddMissingToShopping={handleAddMissingToShopping}
        onRecordCookingComplete={handleRecordCookingComplete}
      />

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ''}
        description={confirmDialog?.description ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        variant={confirmDialog?.variant}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </Layout>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <FridgePagoContainer />
    </AppErrorBoundary>
  );
}
