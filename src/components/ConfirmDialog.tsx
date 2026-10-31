import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1E15]/50 backdrop-blur-[3px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-[22px] bg-white border border-[#E2ECE5] p-6 sm:p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                variant === 'danger'
                  ? 'bg-[#FEF2F2] text-[#B91C1C]'
                  : 'bg-[#EEF5F0] text-[#164E35]'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-base sm:text-lg font-bold text-[#122118]">
                {title}
              </h3>
              <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#526559]">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-1.5 text-[#526559] hover:bg-[#F1F6F2] hover:text-[#122118] transition-colors"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-[#D5E2D8] bg-white text-sm font-medium text-[#33473B] hover:bg-[#F4F8F5] transition-colors whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[42px] px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 ${
              variant === 'danger'
                ? 'bg-[#B91C1C] hover:bg-[#991B1B]'
                : 'btn-primary-gradient'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
