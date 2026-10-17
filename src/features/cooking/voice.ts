// Comandi vocali con il riconoscimento vocale del browser (Chrome su Android, Safari, Edge).
// L'audio lo elabora il browser: Morso riceve solo il testo riconosciuto e non lo salva.

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { parseVoiceCommand, type VoiceCommand } from './logic';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: { 0: { transcript: string }; isFinal: boolean }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionClass(): (new () => Recognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceSupported = () => recognitionClass() !== null;

export type VoiceState = { listening: boolean; error: 'denied' | 'failed' | null; heard: string | null };

/** Ascolta finché "enabled" è vero e chiama onCommand per "avanti", "indietro", "timer", "stop". */
export function useVoiceCommands(enabled: boolean, onCommand: (cmd: VoiceCommand) => void): VoiceState {
  const [state, setState] = useState<VoiceState>({ listening: false, error: null, heard: null });
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    const Ctor = recognitionClass();
    if (!enabled || !Ctor) return;
    let stopped = false;
    let rec: Recognition | null = null;

    const begin = () => {
      if (stopped) return;
      rec = new Ctor();
      rec.lang = 'it-IT';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (!e.results[i].isFinal) continue;
          const text = e.results[i][0].transcript;
          const cmd = parseVoiceCommand(text);
          setState((s) => ({ ...s, heard: text.trim() }));
          if (cmd) handler.current(cmd);
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          stopped = true;
          setState({ listening: false, error: 'denied', heard: null });
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          setState((s) => ({ ...s, error: 'failed' }));
        }
      };
      // il browser smette di ascoltare dopo un po' di silenzio: si riparte da soli
      rec.onend = () => {
        if (!stopped) setTimeout(begin, 300);
      };
      try {
        rec.start();
        setState((s) => ({ ...s, listening: true, error: null }));
      } catch {
        setState({ listening: false, error: 'failed', heard: null });
      }
    };
    begin();
    return () => {
      stopped = true;
      try {
        rec?.stop();
      } catch {
        // già fermo
      }
      setState({ listening: false, error: null, heard: null });
    };
  }, [enabled]);

  return state;
}
