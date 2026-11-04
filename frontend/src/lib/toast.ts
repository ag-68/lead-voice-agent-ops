type ToastListener = (message: string) => void;

const listeners = new Set<ToastListener>();

export const PREVIEW_ONLY_TOAST =
  "Preview only, Admin can unlock and perform a demo";

export function showToast(message: string) {
  listeners.forEach((listener) => listener(message));
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
