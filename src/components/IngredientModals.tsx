import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import {
  Ingredient,
  INGREDIENT_CATEGORIES,
  IngredientCategory,
  RecognizedIngredientCandidate,
  STORAGE_LOCATIONS,
  StorageLocation,
} from '../types';
import { recognizeIngredientsFromPhoto } from '../utils/api';
import { addDaysToToday, formatKoreanShortDate, getTodayDateString } from '../utils/dateUtils';

export type IngredientDraft = Omit<Ingredient, 'id' | 'createdAt'>;

interface IngredientFormModalProps {
  open: boolean;
  editingItem: Ingredient | null;
  onClose: () => void;
  onSubmit: (draft: IngredientDraft, editingId?: string) => void;
}

const COMMON_UNITS = ['개', '모', '단', '팩', '봉', 'g', 'ml', '병', '캔'];

export const IngredientFormModal: React.FC<IngredientFormModalProps> = ({
  open,
  editingItem,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(editingItem?.name ?? '');
  const [category, setCategory] = useState<IngredientCategory>(editingItem?.category ?? '채소');
  const [quantity, setQuantity] = useState(String(editingItem?.quantity ?? 1));
  const [unit, setUnit] = useState(editingItem?.unit ?? '개');
  const [storage, setStorage] = useState<StorageLocation>(editingItem?.storage ?? '냉장');
  const [purchaseDate, setPurchaseDate] = useState(
    editingItem?.purchaseDate ?? getTodayDateString()
  );
  const [expiryDate, setExpiryDate] = useState(editingItem?.expiryDate ?? addDaysToToday(5));
  const [purchasePrice, setPurchasePrice] = useState(
    editingItem?.purchasePrice !== undefined ? String(editingItem.purchasePrice) : ''
  );
  const [memo, setMemo] = useState(editingItem?.memo ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(editingItem?.name ?? '');
      setCategory(editingItem?.category ?? '채소');
      setQuantity(String(editingItem?.quantity ?? 1));
      setUnit(editingItem?.unit ?? '개');
      setStorage(editingItem?.storage ?? '냉장');
      setPurchaseDate(editingItem?.purchaseDate ?? getTodayDateString());
      setExpiryDate(editingItem?.expiryDate ?? addDaysToToday(5));
      setPurchasePrice(
        editingItem?.purchasePrice !== undefined ? String(editingItem.purchasePrice) : ''
      );
      setMemo(editingItem?.memo ?? '');
      setErrorMsg(null);
    }
  }, [open, editingItem]);

  if (!open) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const numQty = Number(quantity);

    if (!cleanName) {
      setErrorMsg('식재료명을 입력해주세요.');
      return;
    }
    if (!Number.isFinite(numQty) || numQty <= 0) {
      setErrorMsg('수량은 0보다 큰 숫자로 입력해주세요.');
      return;
    }
    if (!unit.trim()) {
      setErrorMsg('단위를 입력해주세요 (예: 개, 모, 단, g).');
      return;
    }
    if (!purchaseDate) {
      setErrorMsg('구매일을 선택해주세요.');
      return;
    }

    const parsedPrice =
      purchasePrice.trim() !== '' && Number(purchasePrice) >= 0
        ? Math.round(Number(purchasePrice))
        : undefined;

    onSubmit(
      {
        name: cleanName,
        category,
        quantity: Math.round(numQty * 100) / 100,
        unit: unit.trim(),
        storage,
        purchaseDate,
        expiryDate,
        purchasePrice: parsedPrice,
        memo: memo.trim() || undefined,
        customImageDataUrl: editingItem?.customImageDataUrl,
        isSample: editingItem?.isSample ?? false,
      },
      editingItem?.id
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ingredient-form-title"
    >
      <div className="w-full max-w-lg rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-[#EBF1EC]">
          <div>
            <h2 id="ingredient-form-title" className="text-lg font-bold text-[#122118]">
              {editingItem ? '식재료 정보 수정' : '새 식재료 직접 등록'}
            </h2>
            <p className="text-xs text-[#526559] mt-0.5">
              보관 장소와 소비기한을 기록하면 대시보드 우선순위에 즉시 반영됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="mt-5 space-y-4">
          {errorMsg && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs font-medium text-[#B91C1C]">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                식재료명 <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 애호박, 두부, 달걀"
                className="w-full input-modern px-3.5 py-2.5 text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                카테고리 <span className="text-[#B91C1C]">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as IngredientCategory)}
                className="w-full input-modern px-3.5 py-2.5 text-sm"
              >
                {INGREDIENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                수량 <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                type="number"
                min="0.1"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full input-modern px-3.5 py-2.5 text-sm font-num tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                단위 <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                type="text"
                list="unit-options"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="개, 모, 단, g"
                className="w-full input-modern px-3.5 py-2.5 text-sm"
              />
              <datalist id="unit-options">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                보관 장소 <span className="text-[#B91C1C]">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#EEF4F0]">
                {STORAGE_LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setStorage(loc)}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap ${
                      storage === loc
                        ? 'btn-primary-gradient text-white'
                        : 'text-[#456250] hover:text-[#122118]'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                구매일 <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full input-modern px-3.5 py-2.5 text-sm font-num tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                소비기한 <span className="text-xs font-normal text-[#64786B]">(미확인 시 비워두기 가능)</span>
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full input-modern px-3.5 py-2.5 text-sm font-num tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                구매 가격 (원, 선택)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="예: 2500"
                className="w-full input-modern px-3.5 py-2.5 text-sm font-num tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#33473B] mb-1.5">
                보관 메모 (선택)
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 개봉함, 반 모 남음"
                className="w-full input-modern px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] text-sm font-medium text-[#33473B] hover:bg-[#F4F8F5] whitespace-nowrap"
            >
              취소
            </button>
            <button
              type="submit"
              className="btn-primary-gradient min-h-[42px] px-5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"
            >
              {editingItem ? '수정 완료' : '식재료 등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Duplicate Ingredient Resolution Modal (수량 합산 vs 별도 등록 선택)
export interface DuplicateConflict {
  existing: Ingredient;
  incoming: IngredientDraft;
}

interface DuplicateResolutionModalProps {
  conflict: DuplicateConflict | null;
  remainingQueueCount: number;
  onMergeQuantity: () => void;
  onRegisterSeparately: () => void;
  onCancel: () => void;
}

export const DuplicateResolutionModal: React.FC<DuplicateResolutionModalProps> = ({
  conflict,
  remainingQueueCount,
  onMergeQuantity,
  onRegisterSeparately,
  onCancel,
}) => {
  if (!conflict) return null;
  const { existing, incoming } = conflict;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#122118]">
              동일한 이름의 식재료가 이미 있습니다
            </h3>
            <p className="mt-1 text-xs text-[#526559] leading-relaxed">
              기존 재고에 수량을 합산하거나 소비기한이 다른 경우 별도 항목으로 등록할 수 있습니다.
              {remainingQueueCount > 0 && ` (남은 대기 항목 ${remainingQueueCount}개)`}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
            aria-label="취소"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-[#F7FAF8] border border-[#E2ECE5] p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#526559]">현재 보유 중</span>
            <span className="font-semibold text-[#122118] font-num tabular-nums">
              {existing.name} · {existing.quantity}
              {existing.unit} ({existing.storage} · 기한 {formatKoreanShortDate(existing.expiryDate)})
            </span>
          </div>
          <div className="border-t border-[#E6EEE8]" />
          <div className="flex items-center justify-between">
            <span className="text-[#526559]">새로 추가할 항목</span>
            <span className="font-semibold text-[#164E35] font-num tabular-nums">
              {incoming.name} · +{incoming.quantity}
              {incoming.unit} ({incoming.storage} · 기한 {formatKoreanShortDate(incoming.expiryDate)})
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onMergeQuantity}
            className="btn-primary-gradient w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold tabular-nums"
          >
            기존 식재료에 수량 합산하기 ({existing.quantity + incoming.quantity}
            {existing.unit})
          </button>
          <button
            type="button"
            onClick={onRegisterSeparately}
            className="btn-secondary-sage w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold"
          >
            소비기한·보관 구분을 위해 별도로 등록하기
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full min-h-[38px] px-4 py-2 rounded-xl text-xs font-medium text-[#64786B] hover:text-[#122118]"
          >
            이번 항목 건너뛰기
          </button>
        </div>
      </div>
    </div>
  );
};

// AI Photo Upload & Recognition Review Modal
interface PhotoRecognitionModalProps {
  open: boolean;
  onClose: () => void;
  onApproveCandidates: (drafts: IngredientDraft[]) => void;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function compressAndConvertImage(
  file: File
): Promise<{ base64: string; mimeType: string; previewDataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('손상된 이미지 파일입니다.'));
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const commaIdx = dataUrl.indexOf(',');
          resolve({
            base64: dataUrl.slice(commaIdx + 1),
            mimeType: file.type,
            previewDataUrl: dataUrl,
          });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outMime = 'image/jpeg';
        const compressedUrl = canvas.toDataURL(outMime, 0.85);
        const commaIdx = compressedUrl.indexOf(',');
        resolve({
          base64: compressedUrl.slice(commaIdx + 1),
          mimeType: outMime,
          previewDataUrl: compressedUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const PhotoRecognitionModal: React.FC<PhotoRecognitionModalProps> = ({
  open,
  onClose,
  onApproveCandidates,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecognizedIngredientCandidate[]>([]);

  React.useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      setImagePayload(null);
      setLoading(false);
      setErrorMsg(null);
      setSafetyNotice(null);
      setCandidates([]);
    }
  }, [open]);

  if (!open) return null;

  const runRecognition = async (base64: string, mimeType: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await recognizeIngredientsFromPhoto(base64, mimeType);
      setSafetyNotice(result.safetyNotice);
      if (result.items.length === 0) {
        setCandidates([]);
        setErrorMsg(
          '사진에서 뚜렷한 식재료를 찾지 못했습니다. 조명이 밝은 곳에서 식재료가 잘 보이게 촬영하거나 아래에서 직접 항목을 추가해주세요.'
        );
      } else {
        setCandidates(
          result.items.map((item, idx) => ({
            id: `cand-${Date.now()}-${idx}`,
            selected: item.confidence !== 'low',
            name: item.name,
            estimatedQuantity: item.estimatedQuantity,
            unit: item.unit,
            category: item.category,
            recommendedStorage: item.recommendedStorage,
            expiryDate: '', // Never auto-assume expiry date from photo alone!
            confidence: item.confidence,
            note: item.note,
          }))
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : '사진 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setErrorMsg('지원하지 않는 파일 형식입니다. JPG, PNG, WEBP 이미지 파일을 선택해주세요.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMsg('이미지 파일 용량이 8MB를 초과합니다. 더 작은 용량의 사진을 업로드해주세요.');
      return;
    }

    setErrorMsg(null);
    try {
      const prepared = await compressAndConvertImage(file);
      setPreviewUrl(prepared.previewDataUrl);
      setImagePayload({ base64: prepared.base64, mimeType: prepared.mimeType });
      await runRecognition(prepared.base64, prepared.mimeType);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '이미지를 준비하는 중 오류가 발생했습니다.');
    }
  };

  const updateCandidate = (
    id: string,
    patch: Partial<RecognizedIngredientCandidate>
  ) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addBlankCandidateRow = () => {
    setCandidates((prev) => [
      ...prev,
      {
        id: `cand-manual-${Date.now()}`,
        selected: true,
        name: '',
        estimatedQuantity: 1,
        unit: '개',
        category: '채소',
        recommendedStorage: '냉장',
        expiryDate: '',
        confidence: 'high',
        note: '사용자 직접 추가 항목',
      },
    ]);
  };

  const handleApprove = () => {
    const selected = candidates.filter((c) => c.selected && c.name.trim().length > 0);
    if (selected.length === 0) {
      setErrorMsg('등록할 식재료를 최소 1개 이상 선택하고 이름을 확인해주세요.');
      return;
    }

    const today = getTodayDateString();
    const drafts: IngredientDraft[] = selected.map((c) => ({
      name: c.name.trim(),
      category: c.category,
      quantity: Math.max(0.1, Number(c.estimatedQuantity) || 1),
      unit: c.unit.trim() || '개',
      storage: c.recommendedStorage,
      purchaseDate: today,
      expiryDate: c.expiryDate,
      memo: c.confidence === 'low' ? '사진 인식(낮은 정확도 검수 완료)' : undefined,
      isSample: false,
    }));

    onApproveCandidates(drafts);
    onClose();
  };

  const confidenceLabel = (conf: 'high' | 'medium' | 'low') => {
    if (conf === 'high') return { text: '인식 정확도 높음', color: 'text-[#15803D]' };
    if (conf === 'medium') return { text: '인식 정확도 보통', color: 'text-[#4A6B57]' };
    return { text: '불확실 · 직접 확인 필요', color: 'text-[#B45309] font-semibold' };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-modal-title"
    >
      <div className="w-full max-w-3xl rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#EBF1EC]">
          <div>
            <h2 id="photo-modal-title" className="text-lg font-bold text-[#122118]">
              사진으로 식재료 자동 인식 (Gemini AI)
            </h2>
            <p className="text-xs text-[#526559] mt-1">
              AI가 인식한 결과는 자동 등록되지 않으며, 수량·보관장소·소비기한을 확인 및 수정한 뒤 등록합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2]"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Upload Zone */}
        <div className="mt-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          {!previewUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-[#C7D8CC] bg-[#F7FAF8] hover:bg-[#EEF5F0] px-6 py-11 flex flex-col items-center justify-center text-center transition-colors"
            >
              <div className="btn-primary-gradient flex h-12 w-12 items-center justify-center rounded-2xl mb-3">
                <Camera className="h-6 w-6" />
              </div>
              <span className="text-sm font-bold text-[#122118]">
                냉장고 내부 또는 장본 식재료 사진 업로드
              </span>
              <span className="mt-1 text-xs text-[#526559]">
                JPG, PNG, WEBP 형식 지원 · 최대 8MB
              </span>
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl bg-[#F7FAF8] border border-[#E2ECE5] p-4">
              <div className="flex items-center gap-4">
                <img
                  src={previewUrl}
                  alt="업로드된 식재료 미리보기"
                  referrerPolicy="no-referrer"
                  className="h-20 w-28 rounded-xl object-cover border border-[#DCE8DF]"
                />
                <div className="text-xs text-[#526559] space-y-1">
                  <div className="font-bold text-sm text-[#122118]">업로드된 사진</div>
                  <p>인식된 품목을 아래에서 검수하고 실제 소비기한을 입력해주세요.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D5E2D8] bg-white text-xs font-medium text-[#33473B] hover:bg-[#F1F6F2] whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>다른 사진 선택</span>
                </button>
                {imagePayload && (
                  <button
                    type="button"
                    onClick={() => runRecognition(imagePayload.base64, imagePayload.mimeType)}
                    disabled={loading}
                    className="btn-secondary-sage inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>다시 분석</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="mt-6 rounded-2xl border border-[#E2ECE5] bg-[#F7FAF8] p-8 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-7 w-7 text-[#164E35] animate-spin mb-3" />
            <p className="text-sm font-bold text-[#122118]">
              Gemini AI가 사진 속 식재료와 추정 수량을 분석하고 있습니다...
            </p>
            <p className="text-xs text-[#526559] mt-1">잠시만 기다려주세요 (약 3~6초 소요)</p>
          </div>
        )}

        {/* Error & Retry */}
        {errorMsg && !loading && (
          <div className="mt-5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-[#B91C1C]">{errorMsg}</div>
            {imagePayload && (
              <button
                type="button"
                onClick={() => runRecognition(imagePayload.base64, imagePayload.mimeType)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#FCA5A5] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2] whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>재시도</span>
              </button>
            )}
          </div>
        )}

        {/* Safety Notice */}
        {(safetyNotice || candidates.length > 0) && !loading && (
          <div className="mt-5 rounded-xl bg-[#FFFBEB] border border-[#F3DCAC] p-3.5 flex items-start gap-2.5 text-xs text-[#92400E]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">식품 안전 및 소비기한 안내: </span>
              {safetyNotice ||
                '사진만으로는 소비기한이나 신선도를 확정할 수 없습니다. 포장지의 소비기한과 실제 상태를 직접 확인해 입력해주세요.'}
            </div>
          </div>
        )}

        {/* Editable Candidate Rows */}
        {candidates.length > 0 && !loading && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#122118] tabular-nums">
                인식된 식재료 검수 ({candidates.filter((c) => c.selected).length}/{candidates.length}개 선택됨)
              </h3>
              <button
                type="button"
                onClick={addBlankCandidateRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#164E35] hover:underline whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>누락된 식재료 행 추가</span>
              </button>
            </div>

            <div className="divide-y divide-[#E8EFE9] border border-[#E2ECE5] rounded-2xl overflow-hidden">
              {candidates.map((cand) => {
                const confInfo = confidenceLabel(cand.confidence);
                return (
                  <div
                    key={cand.id}
                    className={`p-4 transition-colors ${
                      cand.selected ? 'bg-white' : 'bg-[#F8FAF8] opacity-65'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cand.selected}
                          onChange={(e) =>
                            updateCandidate(cand.id, { selected: e.target.checked })
                          }
                          className="h-4 w-4 rounded accent-[#164E35]"
                        />
                        <span className="text-xs font-medium text-[#526559]">등록 포함</span>
                      </label>
                      <div className="text-xs">
                        <span className={confInfo.color}>{confInfo.text}</span>
                        {cand.note && (
                          <span className="text-[#64786B]"> · {cand.note}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                      <div className="col-span-2 sm:col-span-2">
                        <label className="block text-[11px] text-[#64786B] mb-1">식재료명</label>
                        <input
                          type="text"
                          value={cand.name}
                          onChange={(e) => updateCandidate(cand.id, { name: e.target.value })}
                          className="w-full input-modern px-2.5 py-1.5 text-xs font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#64786B] mb-1">수량 / 단위</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={cand.estimatedQuantity}
                            onChange={(e) =>
                              updateCandidate(cand.id, {
                                estimatedQuantity: Number(e.target.value),
                              })
                            }
                            className="w-14 input-modern px-2 py-1.5 text-xs font-num tabular-nums"
                          />
                          <input
                            type="text"
                            value={cand.unit}
                            onChange={(e) => updateCandidate(cand.id, { unit: e.target.value })}
                            className="w-full input-modern px-2 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#64786B] mb-1">카테고리</label>
                        <select
                          value={cand.category}
                          onChange={(e) =>
                            updateCandidate(cand.id, {
                              category: e.target.value as IngredientCategory,
                            })
                          }
                          className="w-full input-modern px-2 py-1.5 text-xs"
                        >
                          {INGREDIENT_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#64786B] mb-1">보관 장소</label>
                        <select
                          value={cand.recommendedStorage}
                          onChange={(e) =>
                            updateCandidate(cand.id, {
                              recommendedStorage: e.target.value as StorageLocation,
                            })
                          }
                          className="w-full input-modern px-2 py-1.5 text-xs"
                        >
                          {STORAGE_LOCATIONS.map((loc) => (
                            <option key={loc} value={loc}>
                              {loc}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#64786B] mb-1">
                          소비기한 직접 입력
                        </label>
                        <input
                          type="date"
                          value={cand.expiryDate}
                          onChange={(e) =>
                            updateCandidate(cand.id, { expiryDate: e.target.value })
                          }
                          className="w-full input-modern px-2 py-1.5 text-xs font-num tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[#EBF1EC] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] text-sm font-medium text-[#33473B] hover:bg-[#F4F8F5] whitespace-nowrap"
          >
            취소
          </button>
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={loading}
              className="btn-primary-gradient inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"
            >
              <Check className="h-4 w-4" />
              <span>검수 완료 · 선택한 식재료 등록</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
