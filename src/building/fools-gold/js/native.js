// The thin bridge to the phone: a tap you can feel, and the system share sheet.
// In the App Store build these use Capacitor's Haptics and Share plugins; in a browser they fall back to
// navigator.vibrate and navigator.share, and to nothing (or a copy) when neither exists. Nothing here may throw.
const cap = () => (typeof window !== 'undefined' && window.Capacitor) || null;
export const isNative = () => { try { const c = cap(); return !!(c && c.isNativePlatform && c.isNativePlatform()); } catch (e) { return false; } };
export const nativePlugin = name => {
  try { const c = cap(); if (!c || !isNative()) return null; return (c.Plugins && c.Plugins[name]) || (c.registerPlugin ? c.registerPlugin(name) : null); } catch (e) { return null; }
};
let on = true;
export const setHaptics = v => { on = v !== false; };

// kinds: 'tap' a light touch, 'select' a detent, 'success' something was added, 'warn' something is off
export function haptic(kind = 'tap') {
  if (!on) return;
  try {
    const H = nativePlugin('Haptics');
    if (H) {
      if (kind === 'success' || kind === 'warn') H.notification({ type: kind === 'success' ? 'SUCCESS' : 'WARNING' });
      else if (kind === 'select') H.selectionChanged();
      else H.impact({ style: 'LIGHT' });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(kind === 'success' ? [12, 40, 12] : kind === 'warn' ? [30, 40, 30] : kind === 'select' ? 4 : 10);
  } catch (e) { /* a missing buzz is never an error */ }
}

export const canShare = () => !!(nativePlugin('Share') || (typeof navigator !== 'undefined' && navigator.share));

// returns 'shared', 'cancelled' or 'unsupported' (the caller can then copy instead)
export async function shareText(title, text) {
  const S = nativePlugin('Share');
  try { if (S) { await S.share({ title, text, dialogTitle: title }); return 'shared'; } } catch (e) { if (/cancel/i.test(String((e && e.message) || e))) return 'cancelled'; }
  try { if (typeof navigator !== 'undefined' && navigator.share) { await navigator.share({ title, text }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  return 'unsupported';
}
