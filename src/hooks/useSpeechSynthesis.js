import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useSpeechSynthesis — Text-to-Speech Hook
 *
 * Uses the Web Speech Synthesis API to speak text aloud.
 * Designed for the mobile JET Agent conversational experience.
 *
 * Key iOS/Mobile workaround: speechSynthesis.speak() must be triggered
 * from a user gesture at least once before it works programmatically.
 * Call warmUp() on any user tap/click to unlock the API.
 */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    // Remove emoji sequences at line starts (common in agent responses)
    .replace(/^[⚡💚📈🚨📋🔍✅❌⚠️🎯📊💡🔧📌]+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function useSpeechSynthesis({ onEnd } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isWarmedUp, setIsWarmedUp] = useState(false);
  const voiceRef = useRef(null);
  const onEndRef = useRef(onEnd);
  const utteranceRef = useRef(null);
  const cancelledRef = useRef(false);

  const isSupported = !!synth;

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  // Find best German voice
  useEffect(() => {
    if (!synth) return;

    function pickVoice() {
      const voices = synth.getVoices();
      if (!voices.length) return;

      const deDE = voices.filter((v) => v.lang === 'de-DE');
      const deLang = voices.filter((v) => v.lang.startsWith('de'));

      // On iOS, prefer "Anna" (built-in German). On Android/Chrome, prefer non-Google.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      let preferred;
      if (isIOS) {
        preferred = deDE.find((v) => v.name.includes('Anna')) || deDE[0];
      } else {
        // Prefer premium/neural voices, then any de-DE
        preferred =
          deDE.find((v) => v.name.includes('Neural') || v.name.includes('Wavenet')) ||
          deDE.find((v) => !v.name.includes('Google')) ||
          deDE[0];
      }

      voiceRef.current = preferred || deLang[0] || voices[0];
    }

    pickVoice();
    synth.addEventListener('voiceschanged', pickVoice);
    // Some browsers need a manual trigger too
    setTimeout(pickVoice, 500);
    return () => synth.removeEventListener('voiceschanged', pickVoice);
  }, []);

  /**
   * warmUp — Must be called from a user gesture (click/tap) to unlock
   * speechSynthesis on iOS Safari. Call this on the first mic button tap.
   */
  const warmUp = useCallback(() => {
    if (!synth || isWarmedUp) return;

    // Speak an empty/silent utterance to unlock the API
    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.lang = 'de-DE';
    utterance.volume = 0.01; // Nearly silent
    utterance.rate = 10; // Speak fast to be imperceptible

    utterance.onend = () => setIsWarmedUp(true);
    utterance.onerror = () => setIsWarmedUp(true); // Still mark as tried

    try {
      synth.speak(utterance);
      setIsWarmedUp(true);
    } catch {
      setIsWarmedUp(true);
    }
  }, [isWarmedUp]);

  const speak = useCallback(
    (text) => {
      if (!synth || !text || isMuted) {
        // If muted, still fire onEnd so conversation loop continues
        if (isMuted) onEndRef.current?.();
        return;
      }

      // Cancel anything currently speaking
      cancelledRef.current = false;
      synth.cancel();

      const cleaned = stripMarkdown(text);
      if (!cleaned) {
        onEndRef.current?.();
        return;
      }

      // Split on sentence boundaries, then group into chunks
      const sentences = cleaned.match(/[^.!?\n]+[.!?\n]*/g) || [cleaned];
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
      let chunkIndex = 0;

      function speakNext() {
        // Check if cancelled between chunks
        if (cancelledRef.current || chunkIndex >= chunks.length) {
          setIsSpeaking(false);
          if (!cancelledRef.current) onEndRef.current?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
        utterance.lang = 'de-DE';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (voiceRef.current) {
          utterance.voice = voiceRef.current;
        }

        utterance.onend = () => {
          chunkIndex++;
          // Small gap between chunks for natural pacing
          setTimeout(speakNext, 50);
        };

        utterance.onerror = (e) => {
          // 'interrupted' is normal when cancel() is called
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
    [isMuted]
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
    speak,
    cancel,
    toggleMute,
    warmUp,
  };
}
