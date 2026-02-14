import { useState, useCallback, useEffect } from 'react';

/**
 * useVoiceSettings — Persistent voice configuration
 *
 * Stores speech rate, auto-conversation mode, and voice name
 * in localStorage so they survive across sessions.
 */

const STORAGE_KEY = 'jet-voice-settings';

const DEFAULTS = {
  speechRate: 1.0,      // 0.8 / 1.0 / 1.2 / 1.5
  autoConversation: true, // auto-listen after AI speaks
  voiceName: '',         // empty = auto-pick best German voice
};

const SPEED_OPTIONS = [
  { value: 0.8, label: '0.8x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.2, label: '1.2x' },
  { value: 1.5, label: '1.5x' },
];

function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULTS, ...JSON.parse(stored) };
    }
  } catch {
    // Corrupted or unavailable — use defaults
  }
  return { ...DEFAULTS };
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage not available — silently ignore
  }
}

export default function useVoiceSettings() {
  const [settings, setSettings] = useState(loadSettings);

  // Persist whenever settings change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setSpeechRate = useCallback((rate) => {
    setSettings(prev => ({ ...prev, speechRate: rate }));
  }, []);

  const setAutoConversation = useCallback((enabled) => {
    setSettings(prev => ({ ...prev, autoConversation: enabled }));
  }, []);

  const setVoiceName = useCallback((name) => {
    setSettings(prev => ({ ...prev, voiceName: name }));
  }, []);

  const cycleSpeechRate = useCallback(() => {
    setSettings(prev => {
      const currentIdx = SPEED_OPTIONS.findIndex(o => o.value === prev.speechRate);
      const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length;
      return { ...prev, speechRate: SPEED_OPTIONS[nextIdx].value };
    });
  }, []);

  return {
    ...settings,
    setSpeechRate,
    setAutoConversation,
    setVoiceName,
    cycleSpeechRate,
    SPEED_OPTIONS,
  };
}
