// Avvisi dei timer sul sito: suono, vibrazione e notifica (se il permesso c'è).
// Sull'app nativa (non usata oggi) queste funzioni non fanno nulla.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
let audio: AudioContext | null = null;
let registration: Promise<ServiceWorkerRegistration | null> | null = null;

function basePath(): string {
  return (Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/+$/, '');
}

/**
 * Da chiamare dopo un tocco (avvio di un timer): il browser permette suono e notifiche
 * solo se partono da un gesto dell'utente.
 */
export function prepareAlerts() {
  if (!isWeb) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audio && Ctx) audio = new Ctx();
    if (audio?.state === 'suspended') audio.resume().catch(() => {});
  } catch {
    audio = null;
  }
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    if (!registration && 'serviceWorker' in navigator) {
      const base = basePath();
      registration = navigator.serviceWorker
        .register(`${base}/sw.js`, { scope: `${base}/` })
        .then(() => navigator.serviceWorker.ready)
        .catch(() => null);
    }
  } catch {
    // notifiche non disponibili: restano suono e vibrazione
  }
}

/** Tre bip brevi (si ripete finché il timer suona). */
export function beep() {
  if (!isWeb || !audio) return;
  try {
    const now = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.4, now + i * 0.3 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.3 + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + i * 0.3);
      osc.stop(now + i * 0.3 + 0.22);
    }
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    // niente audio: pazienza, resta l'avviso a schermo
  }
}

/** Notifica di sistema (visibile anche se sei in un'altra app o scheda). */
export async function notify(title: string, body: string, tag: string) {
  if (!isWeb || !('Notification' in window) || Notification.permission !== 'granted') return;
  const options = { body, tag, requireInteraction: true, data: { url: window.location.href } };
  try {
    const reg = await registration;
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
    // alcuni browser non le permettono: resta l'avviso a schermo
  }
}
