// Dictation: say what the party wants to buy. On the phone this uses the system speech recognizer through Capacitor's
// speech-recognition plugin; in a browser it uses the Web Speech API where there is one. Nothing is recorded or kept by the app,
// the microphone is on only while the button is lit, and the keyboard's own dictation key keeps working either way.
import { isNative, nativePlugin } from './native.js?v=37879f67';

const webCtor = () => (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
export function voiceSupport() {
  if (isNative()) return nativePlugin('SpeechRecognition') ? 'native' : null;
  return webCtor() ? 'web' : null;
}
const lang = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

// start(): resolves to a stop() function. onText(text, final) fires as words arrive; onEnd() when listening stops;
// onError(kind) with 'denied', 'none' (heard nothing) or 'failed'.
export async function startListening({ onText, onEnd, onError: onErr }) {
  let errored = false;
  const onError = k => { if (errored) return; errored = true; onErr(k); };
  const kind = voiceSupport();
  if (kind === 'native') {
    const P = nativePlugin('SpeechRecognition');
    try {
      if (P.available && !(await P.available()).available) { onError('failed'); onEnd(); return () => {}; }
      const perm = P.requestPermissions ? await P.requestPermissions() : { speechRecognition: 'granted' };
      if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') { onError('denied'); onEnd(); return () => {}; }
      let ended = false;
      const done = () => { if (ended) return; ended = true; try { P.removeAllListeners && P.removeAllListeners(); } catch (e) { /* ignore */ } onEnd(); };
      if (P.addListener) {
        await P.addListener('partialResults', d => { const m = d && d.matches && d.matches[0]; if (m) onText(m, false); });
        await P.addListener('listeningState', d => { if (d && d.status === 'stopped') done(); });
      }
      const r = P.start({ language: lang(), maxResults: 1, partialResults: true, popup: false });
      Promise.resolve(r).then(res => { const m = res && res.matches && res.matches[0]; if (m) onText(m, true); done(); }).catch(() => { onError('failed'); done(); });
      return () => { try { P.stop(); } catch (e) { /* ignore */ } done(); };
    } catch (e) { onError('failed'); onEnd(); return () => {}; }
  }
  const C = webCtor();
  if (!C) { onError('failed'); onEnd(); return () => {}; }
  const rec = new C();
  rec.lang = lang(); rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let heard = false, over = false;
  const finish = () => { if (over) return; over = true; onEnd(); };
  rec.onresult = ev => {
    let text = '', final = false;
    for (let i = 0; i < ev.results.length; i++) { text += ev.results[i][0].transcript; if (ev.results[i].isFinal) final = true; }
    if (text.trim()) { heard = true; onText(text.trim(), final); }
  };
  rec.onerror = ev => { const k = ev && ev.error; onError(k === 'not-allowed' || k === 'service-not-allowed' ? 'denied' : k === 'no-speech' || k === 'aborted' ? 'none' : 'failed'); };
  rec.onend = () => { if (!heard) onError('none'); finish(); };
  try { rec.start(); } catch (e) { onError('failed'); finish(); }
  return () => { try { rec.stop(); } catch (e) { /* ignore */ } };
}
