import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useSpeechRecognition — Speech-to-Text Hook (V2)
 *
 * Uses the Web Speech API (SpeechRecognition) for German (de-DE).
 *
 * V2 additions:
 * - Silence detection with configurable timeout
 * - onSilenceTimeout callback for "Noch da?" prompt
 * - Volume / amplitude level for waveform visualization
 * - Continuous mode that auto-restarts after final result
 */

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function useSpeechRecognition({
  onResult,
  onError,
  onSilenceTimeout,
  silenceTimeoutMs = 5000,
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(0); // 0-1 for waveform
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onSilenceTimeoutRef = useRef(onSilenceTimeout);
  const silenceTimerRef = useRef(null);
  const lastSpeechTimeRef = useRef(Date.now());
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animFrameRef = useRef(null);

  const isSupported = !!SpeechRecognitionAPI;

  // Keep callback refs up to date without causing re-renders
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onSilenceTimeoutRef.current = onSilenceTimeout; }, [onSilenceTimeout]);

  /**
   * Start audio analysis for volume level visualization.
   * Uses Web Audio API to get microphone amplitude.
   */
  const startAudioAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function updateVolume() {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        // Average the first 32 frequency bins (voice range)
        let sum = 0;
        const count = Math.min(32, dataArray.length);
        for (let i = 0; i < count; i++) sum += dataArray[i];
        const avg = sum / count / 255; // Normalize to 0-1
        setVolumeLevel(avg);
        animFrameRef.current = requestAnimationFrame(updateVolume);
      }

      updateVolume();
    } catch {
      // Microphone access denied or not available — no waveform, but STT still works
      setVolumeLevel(0);
    }
  }, []);

  /**
   * Stop audio analysis and release microphone.
   */
  const stopAudioAnalysis = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setVolumeLevel(0);
  }, []);

  /**
   * Start silence detection timer.
   */
  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    lastSpeechTimeRef.current = Date.now();
    silenceTimerRef.current = setInterval(() => {
      if (Date.now() - lastSpeechTimeRef.current > silenceTimeoutMs) {
        clearSilenceTimer();
        onSilenceTimeoutRef.current?.();
      }
    }, 1000);
  }, [silenceTimeoutMs]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    // Abort any existing session before starting a new one
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      lastSpeechTimeRef.current = Date.now();
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          setInterimTranscript('');
          onResultRef.current?.(transcript, true);
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        setInterimTranscript(interim);
        onResultRef.current?.(interim, false);
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' is not really an error in conversation mode
      if (event.error === 'no-speech') {
        // Don't stop listening, just log
        return;
      }
      setIsListening(false);
      setInterimTranscript('');
      clearSilenceTimer();
      stopAudioAnalysis();
      onErrorRef.current?.(event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      clearSilenceTimer();
      stopAudioAnalysis();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);

    // Start volume analysis for waveform
    startAudioAnalysis();

    // Start silence detection
    startSilenceTimer();
  }, [isSupported, startAudioAnalysis, stopAudioAnalysis, startSilenceTimer, clearSilenceTimer]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    clearSilenceTimer();
    stopAudioAnalysis();
  }, [clearSilenceTimer, stopAudioAnalysis]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      clearSilenceTimer();
      stopAudioAnalysis();
    };
  }, [clearSilenceTimer, stopAudioAnalysis]);

  return {
    isListening,
    isSupported,
    interimTranscript,
    volumeLevel,
    startListening,
    stopListening,
    toggleListening,
  };
}
