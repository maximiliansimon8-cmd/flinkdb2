import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Send,
  Mic,
  MicOff,
  Sparkles,
  Loader2,
  Bug,
  Lightbulb,
  Volume2,
  VolumeX,
  Square,
} from 'lucide-react';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useSpeechSynthesis from '../hooks/useSpeechSynthesis';

/* ─── Quick Action Definitions ─────────────────────────────────────── */

const QUICK_ACTIONS = [
  { label: '\u{26A1} Briefing', message: 'Gib mir ein Briefing: Netzwerk-Status, kritische Themen, Akquise-Pipeline und offene Risks — alles was ich jetzt wissen muss.' },
  { label: '\u{1F49A} Health Check', message: 'Analysiere die aktuelle Health Rate: Trend, Haupttreiber für Ausfälle, welche Städte performen schlecht, und was wir dagegen tun sollten.' },
  { label: '\u{1F4C8} Pipeline', message: 'Akquise-Pipeline Review: Wie viele neue Standorte letzte 7 und 30 Tage, Conversion-Rate, Bottlenecks, und Storno-Rate.' },
  { label: '\u{1F6A8} Risiken', message: 'Zeig mir alle aktuellen Risiken: Langzeit-Offlines, überfällige Tasks, kritische Standorte und was wir priorisieren sollten.' },
  { label: '\u{2795} Task', message: 'Ich möchte einen neuen Task anlegen.' },
];

/* ─── Simple Markdown Renderer ─────────────────────────────────────── */

function renderMarkdown(text) {
  if (!text) return [];

  const lines = text.split('\n');
  const elements = [];
  let listItems = [];
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="ml-4 space-y-1 my-1">
          {listItems.map((item, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span className="text-slate-500 mt-0.5 select-none">&#8226;</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  function inlineFormat(str) {
    const parts = [];
    let remaining = str;
    let partKey = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/`([^`]+)`/);

      let firstMatch = null;
      let firstIndex = remaining.length;
      let matchType = null;

      if (boldMatch && boldMatch.index < firstIndex) {
        firstMatch = boldMatch;
        firstIndex = boldMatch.index;
        matchType = 'bold';
      }
      if (codeMatch && codeMatch.index < firstIndex) {
        firstMatch = codeMatch;
        firstIndex = codeMatch.index;
        matchType = 'code';
      }

      if (!firstMatch) {
        if (remaining) parts.push(<span key={partKey++}>{remaining}</span>);
        break;
      }

      if (firstIndex > 0) {
        parts.push(<span key={partKey++}>{remaining.slice(0, firstIndex)}</span>);
      }

      if (matchType === 'bold') {
        parts.push(
          <strong key={partKey++} className="font-semibold text-slate-100">
            {firstMatch[1]}
          </strong>
        );
      } else if (matchType === 'code') {
        parts.push(
          <code
            key={partKey++}
            className="bg-slate-700/60 text-blue-300 px-1.5 py-0.5 rounded text-[13px] font-mono"
          >
            {firstMatch[1]}
          </code>
        );
      }

      remaining = remaining.slice(firstIndex + firstMatch[0].length);
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    flushList();

    if (trimmed === '') {
      elements.push(<div key={`br-${i}`} className="h-2" />);
    } else {
      elements.push(
        <p key={`p-${i}`} className="leading-relaxed">
          {inlineFormat(trimmed)}
        </p>
      );
    }
  }
  flushList();

  return elements;
}

/* ─── Bouncing Dots ────────────────────────────────────────────────── */

function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

/* ─── Feedback Card ────────────────────────────────────────────────── */

function FeedbackCard({ feedback, onConfirm, onDiscard }) {
  const isBug = feedback.type === 'bug';

  return (
    <div className="mx-1 my-2 rounded-xl border border-slate-700/60 bg-slate-800/90 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
        {isBug ? (
          <Bug size={18} className="text-red-400 shrink-0" />
        ) : (
          <Lightbulb size={18} className="text-amber-400 shrink-0" />
        )}
        <span className="text-base font-medium text-slate-200">
          {isBug ? 'Bug-Report' : 'Feature-Request'}
        </span>
      </div>
      <div className="px-4 py-3 space-y-1">
        <p className="text-base font-medium text-slate-100">{feedback.title}</p>
        {feedback.description && (
          <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">
            {feedback.description}
          </p>
        )}
      </div>
      <div className="flex border-t border-slate-700/40">
        <button
          onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-base font-medium text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/20 transition-colors cursor-pointer"
        >
          <span>&#10003;</span> Aufnehmen
        </button>
        <div className="w-px bg-slate-700/40" />
        <button
          onClick={onDiscard}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-base font-medium text-slate-400 hover:bg-slate-700/30 active:bg-slate-700/50 transition-colors cursor-pointer"
        >
          <span>&#10007;</span> Verwerfen
        </button>
      </div>
    </div>
  );
}

/* ─── Task Confirmation Card ──────────────────────────────────────── */

function TaskCard({ task, onConfirm, onDiscard, isCreating }) {
  return (
    <div className="mx-1 my-2 rounded-xl border border-slate-700/60 bg-slate-800/90 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
        <span className="text-blue-400 shrink-0 text-lg">📋</span>
        <span className="text-base font-medium text-slate-200">Neuer Task</span>
        {task.priority && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-auto ${
            task.priority === 'High' || task.priority === 'Urgent'
              ? 'bg-red-500/20 text-red-300'
              : task.priority === 'Medium'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-slate-600/40 text-slate-400'
          }`}>
            {task.priority}
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-base font-medium text-slate-100">{task.title}</p>
        {task.description && (
          <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">
            {task.description}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-1">
          {task.partner && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-300">
              Partner: {task.partner}
            </span>
          )}
          {task.status && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-300">
              Status: {task.status}
            </span>
          )}
          {task.dueDate && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-300">
              Fällig: {task.dueDate}
            </span>
          )}
        </div>
      </div>
      <div className="flex border-t border-slate-700/40">
        <button
          onClick={onConfirm}
          disabled={isCreating}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-base font-medium text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-50"
        >
          {isCreating ? (
            <><Loader2 size={16} className="animate-spin" /> Erstelle...</>
          ) : (
            <><span>&#10003;</span> Task erstellen</>
          )}
        </button>
        <div className="w-px bg-slate-700/40" />
        <button
          onClick={onDiscard}
          disabled={isCreating}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-base font-medium text-slate-400 hover:bg-slate-700/30 active:bg-slate-700/50 transition-colors cursor-pointer disabled:opacity-50"
        >
          <span>&#10007;</span> Verwerfen
        </button>
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────────── */

export default function MobileAgentView({ onClose, engine }) {
  const {
    messages,
    handleSend,
    inputValue,
    setInputValue,
    isStreaming,
    pendingFeedback,
    pendingTask,
    handleFeedbackConfirm,
    handleFeedbackDiscard,
    handleTaskConfirm,
    handleTaskDiscard,
    isCreatingTask,
    messagesEndRef,
    messagesContainerRef,
    textareaRef,
    handleKeyDown,
    resizeTextarea,
    isDataLoaded,
    cancelStream,
  } = engine;

  const autoSendTimerRef = useRef(null);
  const [interimText, setInterimText] = useState('');
  const [voiceMode, setVoiceMode] = useState(false); // true = continuous conversation mode
  const prevStreamingRef = useRef(false);
  const prevMessagesLenRef = useRef(messages.length);

  /* ── Text-to-Speech ── */
  const {
    isSpeaking,
    isMuted,
    isSupported: ttsSupported,
    speak,
    cancel: cancelSpeech,
    toggleMute,
    warmUp: warmUpTTS,
  } = useSpeechSynthesis({
    onEnd: useCallback(() => {
      // After agent finishes speaking, auto-listen if in voice mode
      if (voiceMode) {
        // Small delay so the mic doesn't pick up residual audio
        setTimeout(() => {
          startListeningRef.current?.();
        }, 400);
      }
    }, [voiceMode]),
  });

  /* ── Speech Recognition ── */
  const { isListening, isSupported: sttSupported, toggleListening, stopListening, startListening } =
    useSpeechRecognition({
      onResult: useCallback(
        (transcript, isFinal) => {
          if (isFinal) {
            setInterimText('');
            setInputValue(transcript);

            // Auto-send after 800ms delay
            if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
            autoSendTimerRef.current = setTimeout(() => {
              handleSend(transcript);
              autoSendTimerRef.current = null;
            }, 800);
          } else {
            setInterimText(transcript);
          }
        },
        [setInputValue, handleSend]
      ),
      onError: useCallback(() => {
        setInterimText('');
      }, []),
    });

  // Ref for startListening to avoid stale closure in TTS onEnd
  const startListeningRef = useRef(startListening);
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const isSupported = sttSupported; // backwards compat for mic button

  /* ── Auto-speak when agent finishes streaming ── */
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    // Detect: streaming just ended (was true, now false) and there's a new message
    if (wasStreaming && !isStreaming && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant' && lastMsg.content && !isMuted) {
        speak(lastMsg.content);
      }
    }
  }, [isStreaming, messages, speak, isMuted]);

  /* ── Mic button handler — also activates voice mode ── */
  const handleMicToggle = useCallback(() => {
    // Warm up TTS on first user gesture (required for iOS Safari)
    warmUpTTS();

    if (isListening) {
      stopListening();
      setVoiceMode(false);
    } else {
      // Cancel TTS if agent is speaking, then start listening
      if (isSpeaking) cancelSpeech();
      setVoiceMode(true);
      toggleListening();
    }
  }, [isListening, stopListening, toggleListening, isSpeaking, cancelSpeech, warmUpTTS]);

  /* ── Cancel auto-send if user taps textarea ── */
  const handleTextareaFocus = useCallback(() => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
  }, []);

  /* ── Body scroll lock ── */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ── Auto-scroll on new messages ── */
  useEffect(() => {
    if (messagesEndRef?.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, messagesEndRef]);

  /* ── Textarea auto-resize ── */
  useEffect(() => {
    resizeTextarea?.();
  }, [inputValue, resizeTextarea]);

  /* ── Cleanup auto-send timer ── */
  useEffect(() => {
    return () => {
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
    };
  }, []);

  /* ── Stop listening & speaking when unmounting ── */
  useEffect(() => {
    return () => {
      stopListening();
      cancelSpeech();
    };
  }, [stopListening, cancelSpeech]);

  /* ── Determine textarea placeholder ── */
  const placeholder = interimText
    ? interimText
    : isListening
    ? 'Ich höre zu...'
    : 'Nachricht eingeben...';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900 text-slate-100 flex flex-col animate-slide-up-full safe-top safe-bottom"
      onClick={warmUpTTS} /* Warm up TTS on any tap — needed for iOS */
    >

      {/* ── Header ── */}
      <div className="flex items-center justify-between h-14 px-4 bg-slate-800/80 border-b border-slate-700/50 shrink-0">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-slate-100 active:bg-slate-700/50 transition-colors cursor-pointer"
          aria-label="Zurück"
        >
          <ArrowLeft size={22} />
        </button>

        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-blue-400" />
          <span className="text-base font-semibold text-slate-100">J.E.T.</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Speaking indicator */}
          {isSpeaking && (
            <div className="flex items-center gap-0.5 mr-1" title="Spricht...">
              <span className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" />
              <span className="w-1 h-4 bg-blue-400 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-1 h-2.5 bg-blue-400 rounded-full animate-pulse [animation-delay:300ms]" />
            </div>
          )}

          {/* Mute/unmute button */}
          {ttsSupported && (
            <button
              onClick={toggleMute}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                isMuted
                  ? 'text-slate-500 hover:text-slate-300'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
              aria-label={isMuted ? 'Sprache aktivieren' : 'Sprache stumm schalten'}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          )}

          {/* Data status dot */}
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isDataLoaded ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
            }`}
            title={isDataLoaded ? 'Daten geladen' : 'Daten werden geladen...'}
          />
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-slate-800/50 shrink-0 scrollbar-none snap-x snap-mandatory">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => handleSend(action.message)}
            disabled={isStreaming}
            className="
              whitespace-nowrap text-xs px-4 py-2 rounded-full snap-start
              bg-slate-800/70 text-slate-300
              border border-slate-700/40
              hover:bg-slate-700/70 hover:text-slate-100 hover:border-slate-600/50
              active:bg-slate-700/90
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors cursor-pointer shrink-0
            "
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* ── Messages Area ── */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth"
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                px-4 py-3 text-base leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm max-w-[90%] ml-auto'
                  : 'bg-slate-800/80 text-slate-200 border border-slate-700/40 rounded-2xl rounded-bl-sm max-w-[90%]'}
              `}
            >
              {msg.role === 'assistant' && msg.content === '' && isStreaming ? (
                <BouncingDots />
              ) : msg.role === 'assistant' ? (
                <div className="space-y-1">{renderMarkdown(msg.content)}</div>
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {/* Pending feedback card */}
        {pendingFeedback && (
          <FeedbackCard
            feedback={pendingFeedback}
            onConfirm={handleFeedbackConfirm}
            onDiscard={handleFeedbackDiscard}
          />
        )}

        {/* Pending task card */}
        {pendingTask && (
          <TaskCard
            task={pendingTask}
            onConfirm={handleTaskConfirm}
            onDiscard={handleTaskDiscard}
            isCreating={isCreatingTask}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="border-t border-slate-700/50 px-4 py-3 shrink-0 safe-bottom">
        <div className="flex items-end gap-2">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleTextareaFocus}
            placeholder={placeholder}
            disabled={isStreaming}
            rows={1}
            className={`
              flex-1 resize-none bg-slate-800/60 text-slate-100
              border border-slate-700/50 rounded-xl px-4 py-3
              text-base placeholder:text-slate-500
              focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
              ${interimText && !inputValue ? 'placeholder:text-slate-300 placeholder:italic' : ''}
            `}
            style={{ maxHeight: '120px' }}
          />

          {/* Mic button — hidden if speech not supported */}
          {isSupported && (
            <button
              onClick={handleMicToggle}
              disabled={isStreaming}
              className={`
                w-12 h-12 shrink-0 rounded-full
                flex items-center justify-center
                transition-all cursor-pointer
                disabled:opacity-40 disabled:cursor-not-allowed
                ${isListening
                  ? 'bg-red-500 text-white animate-voice-pulse'
                  : voiceMode && isSpeaking
                  ? 'bg-blue-500/60 text-white ring-2 ring-blue-400/40'
                  : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white hover:from-blue-400 hover:to-blue-500 active:from-blue-600 active:to-blue-700'}
              `}
              aria-label={isListening ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={cancelStream}
              className="
                w-12 h-12 shrink-0 rounded-xl
                bg-red-600 text-white
                flex items-center justify-center
                hover:bg-red-500 active:bg-red-700
                transition-colors cursor-pointer
              "
              aria-label="Antwort abbrechen"
            >
              <Square size={18} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => handleSend(inputValue)}
              disabled={!inputValue.trim()}
              className="
                w-12 h-12 shrink-0 rounded-xl
                bg-blue-600 text-white
                flex items-center justify-center
                hover:bg-blue-500 active:bg-blue-700
                disabled:bg-slate-700 disabled:text-slate-500
                disabled:cursor-not-allowed
                transition-colors cursor-pointer
              "
              aria-label="Nachricht senden"
            >
              <Send size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
