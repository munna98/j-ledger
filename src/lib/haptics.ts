/**
 * Lightweight, safe haptic feedback utility for mobile web / PWA.
 * Uses the Web Vibration API when available, failing silently when unsupported.
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'selection' | 'error' = 'light') {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (type) {
      case 'selection':
      case 'light':
        navigator.vibrate(8);
        break;
      case 'medium':
        navigator.vibrate(16);
        break;
      case 'heavy':
        navigator.vibrate(28);
        break;
      case 'error':
        navigator.vibrate([20, 50, 20]);
        break;
    }
  } catch {
    // Ignore any vibration errors (e.g. if blocked by user gesture policies)
  }
}
