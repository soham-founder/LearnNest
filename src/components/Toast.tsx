import { useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export function Toast({ message, kind = 'info', onClose }: { message: string; kind?: ToastKind; onClose?: () => void }) {
  useEffect(() => {
    const id = setTimeout(() => onClose?.(), 2500);
    return () => clearTimeout(id);
  }, [onClose]);
  const color = kind === 'success' ? 'bg-emerald-700/80 border-emerald-500' : kind === 'error' ? 'bg-red-700/80 border-red-500' : 'bg-neutral-800 border-neutral-600';
  return (
    <div role="status" className={`pointer-events-auto fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg border text-sm text-white shadow-lg ${color}`}>
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);
  return {
    toast,
    show: (msg: string, kind: ToastKind = 'info') => setToast({ msg, kind }),
    clear: () => setToast(null),
  } as const;
}
