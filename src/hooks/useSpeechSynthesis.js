import { useState, useEffect, useRef, useCallback } from 'react';
import { processForVoice } from '../utils/voiceResponseProcessor';

/**
 * useSpeechSynthesis — Text-to-Speech Hook (V2)
 *
 * Uses the Web Speech Synthesis API to speak text aloud.
 * Designed for the mobile JET Agent conversational experience.
 *
 * V2 additions:
 * - External speechRate / voiceName controls (from useVoiceSettings)
 * - Voice response processing (strips markdown, converts bullets, truncates)
 * - Available voices list for settings UI
 * - Haptic feedback on start/end
 * - onStart callback for conversation mode coordination
 *
 * Key iOS/Mobile workaround: speechSynthesis.speak() must be triggered
 * from a user gesture at least once before it works programmatically.
 * Call warmUp() on any user tap/click to unlock the API.
 */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

export default function useSpeechSynthesis({
  onEnd,
  onStart,
  speechRate = 1.0,
  voiceName = '',
} = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isWarmedUp, setIsWarmedUp] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const voiceRef = useRef(null);
  const onEndRef = useRef(onEnd);
  const onStartRef = useRef(onStart);
  const utteranceRef = useRef(null);
  const cancelledRef = useRef(false);
  const speechRateRef = useRef(speechRate);

  const isSupported = !!synth;

  // Keep refs up to date
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  useEffect(() => { speechRateRef.current = speechRate; }, [speechRate]);

  // Find best German voice, update when voiceName changes
  useEffect(() => {
    if (!synth) return;

    function pickVoice() {
      const voices = synth.getVoices();
      if (!voices.length) return;

      // Build available German voices list for settings UI
      const germanVoices = voices.filter(v => v.lang.startsWith('de'));
      setAvailableVoices(germanVoices.map(v => ({
        name: v.name,
        lang: v.lang,
        isDefault: v.default,
      })));

      const deDE = voices.filter(v => v.lang === 'de-DE');
      const deLang = voices.filter(v => v.lang.startsWith('de'));

      // If specific voice requested, try to find it
      if (voiceName) {
        const requested = voices.find(v => v.name === voiceName);
        if (requested) {
          voiceRef.current = requested;
          return;
        }
      }

      // Auto-pick: iOS prefers "Anna", others prefer neural/premium
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      let preferred;
      if (isIOS) {
        preferred = deDE.find(v => v.name.includes('Anna')) || deDE[0];
      } else {
        preferred =
          deDE.find(v => v.name.includes('Neural') || v.name.includes('Wavenet')) ||
          deDE.find(v => !v.name.includes('Google')) ||
          deDE[0];
      }

      voiceRef.current = preferred || deLang[0] || voices[0];
    }

    pickVoice();
    synth.addEventListener('voiceschanged', pickVoice);
    setTimeout(pickVoice, 500);
    return () => synth.removeEventListener('voiceschanged', pickVoice);
  }, [voiceName]);

  /**
   * warmUp — Must be called from a user gesture (click/tap) to unlock
   * speechSynthesis on iOS Safari.
   */
  const warmUp = useCallback(() => {
    if (!synth || isWarmedUp) return;

    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.lang = 'de-DE';
    utterance.volume = 0.01;
    utterance.rate = 10;

    utterance.onend = () => setIsWarmedUp(true);
    utterance.onerror = () => setIsWarmedUp(true);

    try {
      synth.speak(utterance);
      setIsWarmedUp(true);
    } catch {
      setIsWarmedUp(true);
    }
  }, [isWarmedUp]);

  /**
   * Trigger haptic feedback if available.
   */
  const haptic = useCallback((pattern) => {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      // Not available — silently ignore
    }
  }, []);

  const speak = useCallback(
    (text) => {
      if (!synth || !text || isMuted) {
        if (isMuted) onEndRef.current?.();
        return;
      }

      cancelledRef.current = false;
      synth.cancel();

      // Process the text for voice output
      const { spokenText } = processForVoice(text);
      if (!spokenText) {
        onEndRef.current?.();
        return;
      }

      // Split on sentence boundaries, then group into chunks (max 250 chars)
      const sentences = spokenText.match(/[^.!?\n]+[.!?\n]*/g) || [spokenText];
      const chunks = [];
      let current = '';
      for (const sentence of sentences) {
        if (current.length + sentence.length > 250 && current.length > 0) {
          chunks.push(current.trim());
          current = sentence;
        } else {
          current += sentence;
        }
      }
      if (current.trim()) chunks.push(current.trim());

      setIsSpeaking(true);
      haptic(50); // Single pulse: AI starts speaking
      onStartRef.current?.();

      let chunkIndex = 0;

      function speakNext() {
        if (cancelledRef.current || chunkIndex >= chunks.length) {
          setIsSpeaking(false);
          if (!cancelledRef.current) {
            haptic([30, 50, 30]); // Double pulse: AI done, ready to listen
            onEndRef.current?.();
          }
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
        utterance.lang = 'de-DE';
        utterance.rate = speechRateRef.current;
        utterance.pitch = 0.97; // Slightly lower for professional tone
        utterance.volume = 1.0;

        if (voiceRef.current) {
          utterance.voice = voiceRef.current;
        }

        utterance.onend = () => {
          chunkIndex++;
          setTimeout(speakNext, 50);
        };

        utterance.onerror = (e) => {
          if (e.error !== 'interrupted') {
            console.warn('TTS error:', e.error);
          }
          setIsSpeaking(false);
          if (!cancelledRef.current) onEndRef.current?.();
        };

        utteranceRef.current = utterance;

        try {
          synth.speak(utterance);
        } catch (err) {
          console.warn('TTS speak failed:', err);
          setIsSpeaking(false);
          onEndRef.current?.();
        }
      }

      speakNext();
    },
    [isMuted, haptic]
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (synth) synth.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next && synth) {
        cancelledRef.current = true;
        synth.cancel();
        setIsSpeaking(false);
      }
      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synth) synth.cancel();
    };
  }, []);

  // Chrome bug workaround: speech pauses after ~15s
  useEffect(() => {
    if (!isSpeaking || !synth) return;
    const interval = setInterval(() => {
      if (synth.speaking && !synth.paused) {
        synth.pause();
        synth.resume();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  return {
    isSpeaking,
    isMuted,
    isSupported,
    isWarmedUp,
    availableVoices,
    speak,
    cancel,
    toggleMute,
    warmUp,
  };
}
