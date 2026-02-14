import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Settings,
  X,
  Phone,
  PhoneOff,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useSpeechSynthesis from '../hooks/useSpeechSynthesis';
import useVoiceSettings from '../hooks/useVoiceSettings';
import { parseVoiceCommand, processForVoice } from '../utils/voiceResponseProcessor';

/* ─── Quick Action Definitions ─────────────────────────────────────── */

const QUICK_ACTIONS = [
  { label: '\u{26A1} Briefing', message: 'Gib mir ein Briefing: Netzwerk-Status, kritische Themen, Akquise-Pipeline und offene Risks \u2014 alles was ich jetzt wissen muss.' },
  { label: '\u{1F49A} Health Check', message: 'Analysiere die aktuelle Health Rate: Trend, Haupttreiber für Ausfälle, welche Städte performen schlecht, und was wir dagegen tun sollten.' },
  { label: '\u{1F4C8} Pipeline', message: 'Akquise-Pipeline Review: Wie viele neue Standorte letzte 7 und 30 Tage, Conversion-Rate, Bottlenecks, und Storno-Rate.' },
  { label: '\u{1F6A8} Risiken', message: 'Zeig mir alle aktuellen Risiken: Langzeit-Offlines, überfällige Tasks, kritische Standorte und was wir priorisieren sollten.' },
  { label: '\u{2795} Task', message: 'Ich möchte einen neuen Task anlegen.' },
];

/* ─── Voice Quick Prompts ──────────────────────────────────────────── */

const VOICE_PROMPTS = [
  { label: 'Was steht heute an?', message: 'Was steht heute an? Gib mir einen kurzen Überblick.' },
  { label: 'Status Berlin', message: 'Wie ist der aktuelle Status in Berlin?' },
  { label: 'Offene Tasks', message: 'Welche offenen Tasks gibt es?' },
  { label: 'Health Rate Trend', message: 'Wie entwickelt sich die Health Rate?' },
  { label: 'Letzte Installationen', message: 'Was waren die letzten Installationen?' },
  { label: 'Hardware-Probleme', message: 'Gibt es aktuelle Hardware-Probleme?' },
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

/* ─── Voice Waveform Visualization ─────────────────────────────────── */

function VoiceWaveform({ volumeLevel, color = 'blue', barCount = 5 }) {
  const bars = useMemo(() => {
    const result = [];
    for (let i = 0; i < barCount; i++) {
      // Create a natural-looking distribution: center bars taller
      const centerWeight = 1 - Math.abs(i - (barCount - 1) / 2) / ((barCount - 1) / 2);
      const height = Math.max(8, (volumeLevel * 40 + 8) * (0.4 + centerWeight * 0.6));
      result.push(height);
    }
    return result;
  }, [volumeLevel, barCount]);

  const barColor = color === 'blue' ? 'bg-blue-400' : 'bg-emerald-400';

  return (
    <div className="flex items-center justify-center gap-1 h-12">
      {bars.map((h, i) => (
        <div
          key={i}
          className={`w-1 rounded-full ${barColor} transition-all duration-100 ease-out`}
          style={{
            height: `${h}px`,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
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
        <span className="text-blue-400 shrink-0 text-lg">{'\u{1F4CB}'}</span>
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

/* ─── Voice Settings Panel ─────────────────────────────────────────── */

function VoiceSettingsPanel({ settings, onClose }) {
  const {
    speechRate,
    autoConversation,
    voiceName,
    setSpeechRate,
    setAutoConversation,
    setVoiceName,
    SPEED_OPTIONS,
  } = settings;

  // Get available voices from TTS
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    function loadVoices() {
      const all = synth.getVoices();
      setVoices(all.filter(v => v.lang.startsWith('de')));
    }
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => synth.removeEventListener('voiceschanged', loadVoices);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-slate-800 rounded-t-2xl border-t border-slate-700/60 p-6 space-y-5 animate-slide-up-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">Sprach-Einstellungen</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Speech Speed */}
        <div>
          <label className="text-sm text-slate-400 mb-2 block">Sprechgeschwindigkeit</label>
          <div className="flex gap-2">
            {SPEED_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSpeechRate(opt.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  speechRate === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto Conversation */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Auto-Gesprächsmodus</p>
            <p className="text-xs text-slate-500">Nach AI-Antwort automatisch zuhören</p>
          </div>
          <button
            onClick={() => setAutoConversation(!autoConversation)}
            className={`w-12 h-7 rounded-full transition-colors cursor-pointer relative ${
              autoConversation ? 'bg-blue-600' : 'bg-slate-600'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                autoConversation ? 'translate-x-5.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Voice Selection */}
        {voices.length > 1 && (
          <div>
            <label className="text-sm text-slate-400 mb-2 block">Stimme</label>
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-xl bg-slate-900/50 p-2">
              <button
                onClick={() => setVoiceName('')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                  !voiceName ? 'bg-blue-600/20 text-blue-300' : 'text-slate-400 hover:bg-slate-700/50'
                }`}
              >
                Automatisch (beste Stimme)
              </button>
              {voices.map(v => (
                <button
                  key={v.name}
                  onClick={() => setVoiceName(v.name)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                    voiceName === v.name ? 'bg-blue-600/20 text-blue-300' : 'text-slate-400 hover:bg-slate-700/50'
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Conversation Mode Overlay ────────────────────────────────────── */

function ConversationOverlay({
  conversationState, // 'listening' | 'thinking' | 'speaking' | 'idle' | 'silencePrompt'
  interimText,
  volumeLevel,
  lastAIResponse,
  onEndConversation,
  onResume,
  isStreaming,
}) {
  const stateConfig = {
    listening: {
      label: 'Ich höre zu...',
      color: 'emerald',
      bgClass: 'bg-slate-900/95',
    },
    thinking: {
      label: 'Denke nach...',
      color: 'amber',
      bgClass: 'bg-slate-900/97',
    },
    speaking: {
      label: 'Spreche...',
      color: 'blue',
      bgClass: 'bg-slate-900/93',
    },
    idle: {
      label: 'Bereit',
      color: 'slate',
      bgClass: 'bg-slate-900/95',
    },
    silencePrompt: {
      label: 'Noch da?',
      color: 'amber',
      bgClass: 'bg-slate-900/95',
    },
  };

  const config = stateConfig[conversationState] || stateConfig.idle;

  const statusColorMap = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    slate: 'text-slate-400',
  };

  const ringColorMap = {
    emerald: 'ring-emerald-500/40',
    amber: 'ring-amber-500/40',
    blue: 'ring-blue-500/40',
    slate: 'ring-slate-500/40',
  };

  const pulseColorMap = {
    emerald: 'animate-conversation-pulse-green',
    amber: 'animate-conversation-pulse-amber',
    blue: 'animate-conversation-pulse-blue',
    slate: '',
  };

  return (
    <div className={`fixed inset-0 z-[55] ${config.bgClass} flex flex-col items-center justify-center transition-colors duration-500`}>
      {/* Top bar: end conversation button */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-4 safe-top">
        <button
          onClick={onEndConversation}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 active:bg-red-500/40 transition-colors cursor-pointer"
        >
          <PhoneOff size={16} />
          <span className="text-sm font-medium">Gespräch beenden</span>
        </button>
      </div>

      {/* Center: Large mic button with ring */}
      <div className="flex flex-col items-center gap-6">
        {/* Animated ring around mic */}
        <div className={`relative w-24 h-24 flex items-center justify-center`}>
          {/* Outer pulsing ring */}
          <div
            className={`absolute inset-0 rounded-full ring-4 ${ringColorMap[config.color]} ${pulseColorMap[config.color]}`}
            style={{
              transform: `scale(${1 + volumeLevel * 0.3})`,
              transition: 'transform 100ms ease-out',
            }}
          />
          {/* Inner button */}
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center z-10 transition-colors duration-300 ${
              conversationState === 'listening'
                ? 'bg-emerald-500'
                : conversationState === 'speaking'
                ? 'bg-blue-500'
                : conversationState === 'thinking'
                ? 'bg-amber-500'
                : 'bg-slate-600'
            }`}
          >
            {conversationState === 'thinking' ? (
              <Loader2 size={32} className="text-white animate-spin" />
            ) : conversationState === 'speaking' ? (
              <Volume2 size={32} className="text-white" />
            ) : (
              <Mic size={32} className="text-white" />
            )}
          </div>
        </div>

        {/* Waveform */}
        {(conversationState === 'listening' || conversationState === 'speaking') && (
          <VoiceWaveform
            volumeLevel={conversationState === 'listening' ? volumeLevel : 0.3 + Math.random() * 0.3}
            color={conversationState === 'listening' ? 'green' : 'blue'}
            barCount={7}
          />
        )}

        {/* Status text */}
        <p className={`text-lg font-medium ${statusColorMap[config.color]} transition-colors duration-300`}>
          {config.label}
        </p>

        {/* Interim transcript while user speaks */}
        {conversationState === 'listening' && interimText && (
          <div className="max-w-[80%] px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <p className="text-sm text-slate-300 italic text-center">{interimText}</p>
          </div>
        )}

        {/* Last AI response text (shown while speaking) — markdown stripped */}
        {conversationState === 'speaking' && lastAIResponse && (
          <div className="max-w-[85%] max-h-32 overflow-y-auto px-4 py-3 rounded-xl bg-slate-800/40 border border-slate-700/30">
            <p className="text-sm text-slate-400 leading-relaxed line-clamp-4">
              {processForVoice(lastAIResponse, { maxWords: 60 }).spokenText}
            </p>
          </div>
        )}

        {/* Silence prompt */}
        {conversationState === 'silencePrompt' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-slate-400">Sag etwas oder tippe um fortzufahren</p>
            <button
              onClick={onResume}
              className="px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 active:bg-blue-700 transition-colors cursor-pointer"
            >
              Weiter zuhören
            </button>
          </div>
        )}
      </div>

      {/* Bottom: streaming indicator */}
      {isStreaming && conversationState === 'thinking' && (
        <div className="absolute bottom-24 safe-bottom">
          <BouncingDots />
        </div>
      )}
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
    lastUsedModel,
    lastError,
    retryLastMessage,
  } = engine;

  const autoSendTimerRef = useRef(null);
  const [interimText, setInterimText] = useState('');
  const [conversationMode, setConversationMode] = useState(false);
  const [conversationState, setConversationState] = useState('idle'); // 'listening' | 'thinking' | 'speaking' | 'idle' | 'silencePrompt'
  const [showSettings, setShowSettings] = useState(false);
  const [lastAIResponse, setLastAIResponse] = useState('');
  const prevStreamingRef = useRef(false);

  /* ── Voice Settings ── */
  const voiceSettings = useVoiceSettings();
  const { speechRate, autoConversation, voiceName } = voiceSettings;

  /* ── Text-to-Speech ── */
  const {
    isSpeaking,
    isMuted,
    isSupported: ttsSupported,
    availableVoices,
    speak,
    cancel: cancelSpeech,
    toggleMute,
    warmUp: warmUpTTS,
  } = useSpeechSynthesis({
    speechRate,
    voiceName,
    onStart: useCallback(() => {
      if (conversationMode) {
        setConversationState('speaking');
      }
    }, [conversationMode]),
    onEnd: useCallback(() => {
      if (conversationMode && autoConversation) {
        // After agent finishes speaking, auto-listen
        setTimeout(() => {
          setConversationState('listening');
          startListeningRef.current?.();
        }, 400);
      } else if (conversationMode) {
        setConversationState('idle');
      }
    }, [conversationMode, autoConversation]),
  });

  /* ── Speech Recognition ── */
  const {
    isListening,
    isSupported: sttSupported,
    toggleListening,
    stopListening,
    startListening,
    volumeLevel,
  } = useSpeechRecognition({
    onResult: useCallback(
      (transcript, isFinal) => {
        if (isFinal) {
          setInterimText('');

          // Check for voice commands first
          const command = parseVoiceCommand(transcript);
          if (command.isCommand) {
            if (command.action === 'stop') {
              // Exit conversation mode
              setConversationMode(false);
              setConversationState('idle');
              stopListeningRef.current?.();
              return;
            }
            // For other commands, send as regular message (AI handles context)
          }

          setInputValue(transcript);

          // In conversation mode, send immediately
          if (conversationMode) {
            setConversationState('thinking');
            handleSend(transcript);
            return;
          }

          // In regular mode, auto-send after 800ms delay
          if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
          autoSendTimerRef.current = setTimeout(() => {
            handleSend(transcript);
            autoSendTimerRef.current = null;
          }, 800);
        } else {
          setInterimText(transcript);
        }
      },
      [setInputValue, handleSend, conversationMode]
    ),
    onError: useCallback(() => {
      setInterimText('');
      if (conversationMode) {
        setConversationState('idle');
      }
    }, [conversationMode]),
    onSilenceTimeout: useCallback(() => {
      if (conversationMode) {
        setConversationState('silencePrompt');
      }
    }, [conversationMode]),
    silenceTimeoutMs: 8000,
  });

  // Refs for stable references in callbacks
  const startListeningRef = useRef(startListening);
  const stopListeningRef = useRef(stopListening);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);

  const isSupported = sttSupported;

  /* ── Auto-speak when agent finishes streaming ── */
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    if (wasStreaming && !isStreaming && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant' && lastMsg.content && !isMuted) {
        setLastAIResponse(lastMsg.content);
        speak(lastMsg.content);
      } else if (conversationMode) {
        // No content to speak, go back to listening
        setConversationState('idle');
      }
    }
  }, [isStreaming, messages, speak, isMuted, conversationMode]);

  /* ── Track conversation state based on streaming ── */
  useEffect(() => {
    if (conversationMode && isStreaming) {
      setConversationState('thinking');
    }
  }, [conversationMode, isStreaming]);

  /* ── Update conversation state when listening changes ── */
  useEffect(() => {
    if (conversationMode && isListening) {
      setConversationState('listening');
    }
  }, [conversationMode, isListening]);

  /* ── Enter Conversation Mode ── */
  const enterConversationMode = useCallback(() => {
    warmUpTTS();
    setConversationMode(true);
    setConversationState('listening');
    if (isSpeaking) cancelSpeech();
    startListening();
  }, [warmUpTTS, startListening, isSpeaking, cancelSpeech]);

  /* ── Exit Conversation Mode ── */
  const exitConversationMode = useCallback(() => {
    setConversationMode(false);
    setConversationState('idle');
    stopListening();
    cancelSpeech();
  }, [stopListening, cancelSpeech]);

  /* ── Resume from silence prompt ── */
  const resumeListening = useCallback(() => {
    setConversationState('listening');
    startListening();
  }, [startListening]);

  /* ── Mic button handler (non-conversation mode) ── */
  const handleMicToggle = useCallback(() => {
    warmUpTTS();

    if (isListening) {
      stopListening();
    } else {
      if (isSpeaking) cancelSpeech();
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
      onClick={warmUpTTS}
    >

      {/* ── Conversation Mode Overlay ── */}
      {conversationMode && (
        <ConversationOverlay
          conversationState={conversationState}
          interimText={interimText}
          volumeLevel={volumeLevel}
          lastAIResponse={lastAIResponse}
          onEndConversation={exitConversationMode}
          onResume={resumeListening}
          isStreaming={isStreaming}
        />
      )}

      {/* ── Voice Settings Panel ── */}
      {showSettings && (
        <VoiceSettingsPanel
          settings={{ ...voiceSettings, availableVoices }}
          onClose={() => setShowSettings(false)}
        />
      )}

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
          {isSpeaking && !conversationMode && (
            <div className="flex items-center gap-0.5 mr-1" title="Spricht...">
              <span className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" />
              <span className="w-1 h-4 bg-blue-400 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-1 h-2.5 bg-blue-400 rounded-full animate-pulse [animation-delay:300ms]" />
            </div>
          )}

          {/* Settings gear */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            aria-label="Sprach-Einstellungen"
          >
            <Settings size={18} />
          </button>

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

      {/* ── Quick Actions (text mode) ── */}
      {!conversationMode && (
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
      )}

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
                  : msg.isError
                  ? 'bg-red-900/30 text-red-200 border border-red-700/40 rounded-2xl rounded-bl-sm max-w-[90%]'
                  : 'bg-slate-800/80 text-slate-200 border border-slate-700/40 rounded-2xl rounded-bl-sm max-w-[90%]'}
              `}
            >
              {msg.role === 'assistant' && msg.content === '' && isStreaming ? (
                <BouncingDots />
              ) : msg.role === 'assistant' && msg.isError ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                    <div className="space-y-1">{renderMarkdown(msg.content)}</div>
                  </div>
                  {lastError?.canRetry && (
                    <button
                      onClick={retryLastMessage}
                      disabled={isStreaming}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 active:bg-amber-500/30 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw size={14} />
                      Erneut versuchen
                    </button>
                  )}
                </div>
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

      {/* ── Model info footer ── */}
      {lastUsedModel && !conversationMode && (
        <div className="px-4 py-1 text-[10px] text-slate-600 text-center border-t border-slate-800/30">
          Modell: {lastUsedModel}
        </div>
      )}

      {/* ── Voice Quick Prompts (shown when idle, not in conversation mode) ── */}
      {!conversationMode && !isStreaming && !isListening && messages.length <= 2 && (
        <div className="px-4 pb-2 shrink-0">
          <p className="text-xs text-slate-500 mb-2">Schnellaktionen per Sprache:</p>
          <div className="flex flex-wrap gap-2">
            {VOICE_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                onClick={() => handleSend(prompt.message)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50 hover:text-slate-200 active:bg-slate-700 transition-colors cursor-pointer"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input Area ── */}
      <div className="border-t border-slate-700/50 px-4 py-3 shrink-0 safe-bottom">
        <div className="flex items-end gap-2">
          {/* Conversation mode button */}
          {isSupported && !conversationMode && (
            <button
              onClick={enterConversationMode}
              disabled={isStreaming}
              className="
                w-12 h-12 shrink-0 rounded-full
                flex items-center justify-center
                bg-gradient-to-br from-emerald-500 to-emerald-600
                text-white
                hover:from-emerald-400 hover:to-emerald-500
                active:from-emerald-600 active:to-emerald-700
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all cursor-pointer
              "
              aria-label="Gesprächsmodus starten"
              title="Gesprächsmodus"
            >
              <Phone size={20} />
            </button>
          )}

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

          {/* Mic button (regular mode) */}
          {isSupported && !conversationMode && (
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
                  : isSpeaking
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

        {/* Speed indicator */}
        {speechRate !== 1.0 && (
          <div className="mt-1.5 flex justify-center">
            <button
              onClick={voiceSettings.cycleSpeechRate}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              Geschwindigkeit: {speechRate}x
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
