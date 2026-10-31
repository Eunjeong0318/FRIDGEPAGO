import React, { useState } from 'react';
import {
  Calendar,
  Check,
  ChefHat,
  Clock,
  Cloud,
  Database,
  LayoutDashboard,
  Loader2,
  LogOut,
  PieChart,
  Refrigerator,
  RotateCcw,
  ShoppingCart,
  Trash2,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { PageId, UserProfile } from '../types';
import { formatKoreanFullDate } from '../utils/dateUtils';

export type CloudSyncStatus = 'local' | 'connecting' | 'synced' | 'syncing' | 'error';

interface LayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  ingredientCount: number;
  urgentOrCheckCount: number;
  incompleteMissionCount: number;
  unpurchasedShoppingCount: number;
  rankTitle: string;
  rankLevel: number;
  totalPoints: number;
  hasSampleData: boolean;
  aiConfigured: boolean | null;
  aiAuthorized: boolean;
  profile: UserProfile;
  cloudAuthReady: boolean;
  cloudUserEmail: string | null;
  cloudSyncStatus: CloudSyncStatus;
  cloudErrorMessage: string | null;
  onSignInCloud: () => void;
  onSignOutCloud: () => void;
  onUpdateProfile: (profile: UserProfile) => void;
  onLoadSampleData: () => void;
  onRemoveSampleData: () => void;
  onResetAllData: () => void;
  toastMessage: string | null;
  onDismissToast: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: PageId;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: '대시보드', mobileLabel: '홈', icon: LayoutDashboard },
  { id: 'fridge', label: '내 냉장고', mobileLabel: '냉장고', icon: Refrigerator },
  { id: 'recipes', label: 'AI 레시피 추천', mobileLabel: '레시피', icon: ChefHat },
  { id: 'expiry', label: '유통기한 관리', mobileLabel: '기한', icon: Clock },
  { id: 'missions', label: '냉파 미션', mobileLabel: '미션', icon: Trophy },
  { id: 'shopping', label: '장보기 리스트', mobileLabel: '장보기', icon: ShoppingCart },
  { id: 'report', label: '절약 리포트', mobileLabel: '리포트', icon: PieChart },
];

export const PAGE_TITLES: Record<PageId, string> = {
  dashboard: '대시보드',
  fridge: '내 냉장고',
  recipes: 'AI 레시피 추천',
  expiry: '유통기한 관리',
  missions: '냉파 미션 미니게임',
  shopping: '장보기 리스트',
  report: '절약 리포트',
};

export const Layout: React.FC<LayoutProps> = ({
  activePage,
  onNavigate,
  ingredientCount,
  urgentOrCheckCount,
  incompleteMissionCount,
  unpurchasedShoppingCount,
  rankTitle,
  rankLevel,
  totalPoints,
  hasSampleData,
  aiConfigured,
  aiAuthorized,
  profile,
  cloudAuthReady,
  cloudUserEmail,
  cloudSyncStatus,
  cloudErrorMessage,
  onSignInCloud,
  onSignOutCloud,
  onUpdateProfile,
  onLoadSampleData,
  onRemoveSampleData,
  onResetAllData,
  toastMessage,
  onDismissToast,
  children,
}) => {
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [nickname, setNickname] = useState(profile.nickname);
  const [householdLabel, setHouseholdLabel] = useState(profile.householdLabel);
  const [monthlyBudget, setMonthlyBudget] = useState(String(profile.monthlyBudget));
  const [allergyInput, setAllergyInput] = useState('');
  const [allergies, setAllergies] = useState<string[]>(profile.allergiesAndDislikes);

  const openProfileSettings = () => {
    setNickname(profile.nickname);
    setHouseholdLabel(profile.householdLabel);
    setMonthlyBudget(String(profile.monthlyBudget));
    setAllergies(profile.allergiesAndDislikes);
    setAllergyInput('');
    setProfileModalOpen(true);
  };

  const handleAddAllergy = () => {
    const trimmed = allergyInput.trim().slice(0, 50);
    if (!trimmed) return;
    if (!allergies.includes(trimmed) && allergies.length < 30) {
      setAllergies([...allergies, trimmed]);
    }
    setAllergyInput('');
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      nickname: nickname.trim().slice(0, 40) || '자취셰프',
      householdLabel: householdLabel.trim().slice(0, 80) || '1인 가구 스마트 홈키친',
      monthlyBudget: Math.max(0, Number(monthlyBudget) || 250000),
      allergiesAndDislikes: allergies.slice(0, 30),
    });
    setProfileModalOpen(false);
  };

  const getCountForNav = (id: PageId): number | null => {
    if (id === 'fridge' && ingredientCount > 0) return ingredientCount;
    if (id === 'expiry' && urgentOrCheckCount > 0) return urgentOrCheckCount;
    if (id === 'missions' && incompleteMissionCount > 0) return incompleteMissionCount;
    if (id === 'shopping' && unpurchasedShoppingCount > 0) return unpurchasedShoppingCount;
    return null;
  };

  const isBusySyncing = cloudSyncStatus === 'connecting' || cloudSyncStatus === 'syncing';

  return (
    <div className="min-h-screen flex text-[#122118]">
      {/* PC Left Sidebar */}
      <aside className="hidden lg:flex lg:w-[272px] lg:flex-col lg:fixed lg:inset-y-0 bg-white/95 backdrop-blur-md border-r border-[#DFE9E2] z-30">
        {/* Rich Botanical Gradient Brand Header */}
        <div className="relative overflow-hidden px-6 py-7 bg-gradient-to-br from-[#0B2E1E] via-[#154D34] to-[#246C4B] text-white border-b border-[#0B2E1E]/20">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute right-3 bottom-2 opacity-12"
            aria-hidden="true"
          >
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <path
                d="M60 12C36 12 18 28 16 56C44 54 60 36 60 12Z"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <path d="M16 56L46 26" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="relative flex items-center gap-3.5 text-left group focus:outline-none"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs border border-white/25 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] group-hover:bg-white/22 transition-colors">
              <Refrigerator className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[21px] font-bold tracking-tight text-white whitespace-nowrap leading-none">
                냉파고
              </div>
              <div className="mt-1 text-[11px] font-semibold tracking-wider text-[#BFE9CE] whitespace-nowrap">
                FRIDGEPAGO
              </div>
            </div>
          </button>
          <p className="relative mt-3.5 text-xs leading-relaxed text-white/85">
            냉장고 속 재료가 최고의 요리가 되는 순간
          </p>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-5 space-y-1.5 overflow-y-auto" aria-label="주요 메뉴">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            const count = getCountForNav(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                  isActive
                    ? 'btn-primary-gradient text-white'
                    : 'text-[#3D5245] hover:bg-[#F1F6F3] hover:text-[#122118]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 ${
                      isActive ? 'text-white' : 'text-[#5D7566]'
                    }`}
                  />
                  <span>{item.label}</span>
                </span>
                {count !== null && (
                  <span
                    className={`text-xs font-num tabular-nums ${
                      isActive
                        ? 'text-white/95'
                        : item.id === 'expiry'
                        ? 'text-[#B45309] font-bold'
                        : 'text-[#64786B]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Cloud Persistence & Data Management Utility Surface */}
        <div className="p-4 space-y-3">
          <div className="rounded-2xl bg-[#F2F8F4] border border-[#D7E6DC] p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#164E35]">
                클라우드 서버 저장소
              </span>
              <span className="text-[11px] text-[#526358]">
                {!cloudAuthReady
                  ? '확인 중'
                  : cloudUserEmail
                  ? isBusySyncing
                    ? '동기화 중'
                    : '실시간 연동됨'
                  : '미연결'}
              </span>
            </div>

            {cloudUserEmail ? (
              <div className="space-y-2">
                <p className="text-xs text-[#2C4235] truncate" title={cloudUserEmail}>
                  {cloudUserEmail}
                </p>
                <button
                  type="button"
                  onClick={onSignOutCloud}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#3D5245] bg-white border border-[#D5E2D8] hover:bg-[#F6FAF7] transition-colors whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                  <span>서버 연결 해제</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed text-[#526358]">
                  Google 로그인 시 식재료·레시피·장보기·리포트가 서버에 영구 저장됩니다.
                </p>
                <button
                  type="button"
                  disabled={!cloudAuthReady || isBusySyncing}
                  onClick={onSignInCloud}
                  className="w-full btn-primary-gradient flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
                >
                  {isBusySyncing ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>Google로 서버 저장 시작</span>
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#F6FAF7] border border-[#E3ECE6] p-3.5 space-y-1.5">
            <div className="px-1.5 pb-1 text-[11px] font-semibold text-[#64786B]">
              데이터 유틸리티
            </div>
            <button
              type="button"
              onClick={onLoadSampleData}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#154B33] bg-white border border-[#D7E6DC] hover:bg-[#EDF5F0] transition-colors whitespace-nowrap"
            >
              <Database className="h-3.5 w-3.5 shrink-0 text-[#164E35]" />
              <span>샘플 데이터 불러오기</span>
            </button>
            {hasSampleData && (
              <button
                type="button"
                onClick={onRemoveSampleData}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#B45309] bg-[#FFFBEB] border border-[#F5DFB8] hover:bg-[#FEF3C7] transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>샘플 데이터만 삭제</span>
              </button>
            )}
            <button
              type="button"
              onClick={onResetAllData}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-[#5A6E61] hover:bg-white hover:text-[#B91C1C] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span>전체 데이터 초기화</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-[272px] min-w-0">
        {/* Common Header: Rich Botanical Gradient Bar */}
        <header className="sticky top-0 z-20 relative overflow-hidden flex items-center justify-between gap-4 px-4 sm:px-8 h-16 bg-gradient-to-r from-[#0E3623] via-[#164E35] to-[#236A49] text-white border-b border-white/10 shadow-[0_4px_20px_-4px_rgba(14,54,35,0.22)]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.14),transparent_50%)]"
            aria-hidden="true"
          />

          <div className="relative flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="lg:hidden flex items-center gap-2.5 shrink-0"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 border border-white/25 text-white">
                <Refrigerator className="h-4 w-4" />
              </div>
              <span className="font-bold text-base tracking-tight text-white whitespace-nowrap">
                냉파고{' '}
                <span className="text-[11px] font-semibold text-[#C7EDD4]">FRIDGEPAGO</span>
              </span>
            </button>
            <span className="lg:hidden text-white/35" aria-hidden="true">
              /
            </span>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
              {PAGE_TITLES[activePage]}
            </h1>
          </div>

          <div className="relative flex items-center gap-2.5 sm:gap-4 shrink-0">
            <span className="hidden xl:inline-flex items-center gap-1.5 text-xs sm:text-sm text-white/85 whitespace-nowrap tabular-nums">
              <Calendar className="h-3.5 w-3.5 text-[#BFE9CE]" />
              <span>{formatKoreanFullDate()}</span>
            </span>

            {cloudUserEmail ? (
              <button
                type="button"
                onClick={openProfileSettings}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/25 bg-white/14 hover:bg-white/22 transition-colors text-xs font-semibold text-white whitespace-nowrap shrink-0"
                title={`클라우드 서버 저장 중 (${cloudUserEmail})`}
              >
                {isBusySyncing ? (
                  <Loader2 className="h-3.5 w-3.5 text-[#BFE9CE] animate-spin shrink-0" />
                ) : (
                  <Check className="h-3.5 w-3.5 text-[#BFE9CE] shrink-0" />
                )}
                <span>{isBusySyncing ? '서버 동기화 중' : '서버 저장됨'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!cloudAuthReady || isBusySyncing}
                onClick={onSignInCloud}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white text-[#14462F] hover:bg-[#EFF8F2] transition-colors text-xs font-bold shadow-xs disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {isBusySyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <Cloud className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>서버 저장 연결</span>
              </button>
            )}

            <button
              type="button"
              onClick={openProfileSettings}
              className="flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-xl border border-white/22 bg-white/12 hover:bg-white/20 backdrop-blur-xs transition-colors whitespace-nowrap shrink-0"
              title="프로필, 칭호 및 알레르기·예산 설정"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#164E35] shadow-2xs">
                <User className="h-3.5 w-3.5" />
              </span>
              <span className="hidden sm:inline text-xs sm:text-sm font-semibold text-white max-w-[170px] truncate">
                {profile.nickname} · {rankTitle}
              </span>
            </button>
          </div>
        </header>

        {/* Cloud Error Notice if any */}
        {cloudErrorMessage && (
          <div className="bg-[#FEF2F2] border-b border-[#FECACA] px-4 sm:px-8 py-2.5 text-xs sm:text-sm text-[#991B1B] flex flex-wrap items-center justify-between gap-2">
            <span>{cloudErrorMessage}</span>
          </div>
        )}

        {/* AI Key Connection Notice if not configured */}
        {aiConfigured === false && (
          <div className="bg-[#FFFBEB] border-b border-[#F5DFB8] px-4 sm:px-8 py-2.5 text-xs sm:text-sm text-[#92400E] flex flex-wrap items-center justify-between gap-2">
            <span>
              현재 Gemini AI 연결이 설정되어 있지 않습니다. AI 사진 인식·레시피 생성 기능을 사용하려면 Settings &gt; Secrets 패널에서 API 키 연결을 확인해주세요. 직접 입력 및 관리 기능은 모두 정상 작동합니다.
            </span>
          </div>
        )}

        {/* Owner-Only AI Protection Notice when configured but not signed in as owner */}
        {aiConfigured === true && cloudAuthReady && !aiAuthorized && (
          <div className="bg-[#F2F8F4] border-b border-[#D5E5DA] px-4 sm:px-8 py-2.5 text-xs sm:text-sm text-[#15462F] flex flex-wrap items-center justify-between gap-3">
            <span>
              소유자 전용 AI 보호 잠금이 활성화되어 있습니다. 등록된 소유자 Google 계정으로 로그인한 경우에만 AI 사진 인식·맞춤 레시피·심층 분석 기능이 호출됩니다.
            </span>
            <button
              type="button"
              disabled={isBusySyncing}
              onClick={onSignInCloud}
              className="btn-primary-gradient px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              소유자 계정 로그인
            </button>
          </div>
        )}

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="fixed bottom-20 lg:bottom-7 right-4 sm:right-8 z-40 max-w-md rounded-2xl bg-[#11261B]/95 backdrop-blur-md border border-white/10 text-white px-4 py-3.5 shadow-[0_12px_32px_rgba(14,38,26,0.28)] flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{toastMessage}</span>
            <button
              type="button"
              onClick={onDismissToast}
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="알림 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <main className="flex-1 w-full max-w-[1260px] mx-auto px-4 sm:px-8 py-7 pb-24 lg:pb-14">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (<=15% viewport height) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-white/95 backdrop-blur-md border-t border-[#DFE9E2] grid grid-cols-7 px-0.5 shadow-[0_-4px_20px_rgba(16,42,29,0.05)]"
        aria-label="모바일 하단 메뉴"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`relative flex flex-col items-center justify-center min-h-[44px] gap-1 transition-colors whitespace-nowrap ${
                isActive ? 'text-[#164E35] font-bold' : 'text-[#6A7F72]'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-2 h-[2.5px] rounded-b-full bg-[#164E35]" />
              )}
              <Icon className="h-[17px] w-[17px] shrink-0" />
              <span className="text-[10px] sm:text-[11px] leading-tight whitespace-nowrap truncate max-w-full">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* User Profile, Cloud Storage & Allergy Preferences Modal */}
      {profileModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
        >
          <div className="w-full max-w-lg rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
              <div>
                <h2 id="profile-modal-title" className="text-lg font-bold text-[#122118]">
                  프로필 및 클라우드 서버 설정
                </h2>
                <p className="text-xs text-[#526358] mt-0.5">
                  서버 계정 연동과 월 목표 식비, 알레르기·기피 식재료를 관리합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="rounded-xl p-1.5 text-[#526358] hover:bg-[#F1F6F2]"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cloud Account Sync Section */}
            <div className="mt-5 rounded-2xl bg-[#F4F9F5] border border-[#D8E7DD] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#143D29]">
                    클라우드 백엔드 데이터베이스 (Firestore)
                  </div>
                  <p className="mt-0.5 text-xs text-[#526358] truncate">
                    {cloudUserEmail
                      ? `연결된 계정: ${cloudUserEmail}`
                      : '현재 브라우저 로컬 저장 중 · 로그인 시 서버에 자동 영구 저장됩니다.'}
                  </p>
                </div>

                {cloudUserEmail ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSignOutCloud();
                      setProfileModalOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#CBDCD1] bg-white text-xs font-semibold text-[#33473B] hover:bg-[#EEF5F0] whitespace-nowrap shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5 shrink-0" />
                    <span>로그아웃</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!cloudAuthReady || isBusySyncing}
                    onClick={onSignInCloud}
                    className="btn-primary-gradient flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <Cloud className="h-3.5 w-3.5 shrink-0" />
                    <span>Google 로그인</span>
                  </button>
                )}
              </div>
            </div>

            {/* Current Fridge Rank & Perks Summary */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 py-3 px-4 rounded-2xl bg-[#FAFDFB] border border-[#E2ECE5]">
              <div className="text-xs text-[#33473B] tabular-nums">
                <span className="font-bold text-[#164E35]">
                  Lv.{rankLevel} {rankTitle}
                </span>
                <span> · 누적 미션 점수 {totalPoints.toLocaleString()}점</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  onNavigate('missions');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#164E35] hover:underline whitespace-nowrap shrink-0"
              >
                <Trophy className="h-3.5 w-3.5" />
                <span>칭호 및 혜택 보기</span>
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                    닉네임
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={40}
                    className="w-full input-modern px-3.5 py-2.5 text-sm"
                    placeholder="예: 자취셰프"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                    월 목표 식비 예산 (원)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100000000}
                    step={10000}
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(e.target.value)}
                    className="w-full input-modern px-3.5 py-2.5 text-sm font-num tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                  알레르기 및 기피 식재료 (AI 추천에서 자동 제외)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={allergyInput}
                    maxLength={50}
                    onChange={(e) => setAllergyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddAllergy();
                      }
                    }}
                    placeholder="예: 땅콩, 새우, 오이, 고수"
                    className="flex-1 input-modern px-3.5 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddAllergy}
                    className="btn-secondary-sage px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
                  >
                    추가
                  </button>
                </div>
                {allergies.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {allergies.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAllergies(allergies.filter((a) => a !== item))}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F4F8F5] border border-[#D5E2D8] text-xs font-medium text-[#33473B] hover:border-[#B91C1C] hover:text-[#B91C1C] transition-colors"
                      >
                        <span>{item}</span>
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile Quick Data Actions */}
              <div className="pt-3 border-t border-[#EBF1EC] lg:hidden space-y-2">
                <div className="text-xs font-semibold text-[#526358]">데이터 관리</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileModalOpen(false);
                      onLoadSampleData();
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#EEF5F0] text-[#164E35]"
                  >
                    샘플 데이터 불러오기
                  </button>
                  {hasSampleData && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileModalOpen(false);
                        onRemoveSampleData();
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#FEF7EC] text-[#B45309]"
                    >
                      샘플 데이터 삭제
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileModalOpen(false);
                      onResetAllData();
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#FEF2F2] text-[#B91C1C]"
                  >
                    전체 초기화
                  </button>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] text-sm font-medium text-[#33473B] hover:bg-[#F4F8F5] whitespace-nowrap"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-primary-gradient min-h-[42px] px-5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"
                >
                  설정 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
