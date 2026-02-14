import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Loader2,
  Bug,
  Lightbulb,
  Square,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';
import useChatEngine from '../hooks/useChatEngine';
import MobileAgentView from './MobileAgentView';

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
    // Split on bold and code patterns, return mixed text/elements
    const parts = [];
    let remaining = str;
    let partKey = 0;

    while (remaining.length > 0) {
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Inline code: `text`
      const codeMatch = remaining.match(/`([^`]+)`/);

      // Find which comes first
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

      // Text before match
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

    // List items
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

/* ─── Quick Action Definitions ─────────────────────────────────────── */

const QUICK_ACTIONS = [
  { label: '\u{26A1} Briefing', message: 'Gib mir ein Briefing: Netzwerk-Status, kritische Themen, Akquise-Pipeline und offene Risks — alles was ich jetzt wissen muss.' },
  { label: '\u{1F49A} Health Check', message: 'Analysiere die aktuelle Health Rate: Trend, Haupttreiber für Ausfälle, welche Städte performen schlecht, und was wir dagegen tun sollten.' },
  { label: '\u{1F4C8} Pipeline', message: 'Akquise-Pipeline Review: Wie viele neue Standorte letzte 7 und 30 Tage, Conversion-Rate, Bottlenecks, und Storno-Rate.' },
  { label: '\u{1F6A8} Risiken', message: 'Zeig mir alle aktuellen Risiken: Langzeit-Offlines, überfällige Tasks, kritische Standorte und was wir priorisieren sollten.' },
  { label: '\u{2795} Task anlegen', message: 'Ich möchte einen neuen Task anlegen.' },
  { label: '\u{1F4A1} Feature Idee', message: 'Ich habe einen Feature-Wunsch' },
  { label: '\u{1F41B} Bug melden', message: 'Ich möchte einen Bug melden' },
];

/* ─── Bouncing Dots ────────────────────────────────────────────────── */

function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

/* ─── Feedback Card ────────────────────────────────────────────────── */

function FeedbackCard({ feedback, onConfirm, onDiscard }) {
  const isBug = feedback.type === 'bug';

  return (
    <div className="mx-1 my-2 rounded-xl border border-slate-700/60 bg-slate-800/90 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/40">
        {isBug ? (
          <Bug size={16} className="text-red-400 shrink-0" />
        ) : (
          <Lightbulb size={16} className="text-amber-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-slate-200">
          {isBug ? 'Bug-Report' : 'Feature-Request'}
        </span>
      </div>
      <div className="px-4 py-3 space-y-1">
        <p className="text-sm font-medium text-slate-100">{feedback.title}</p>
        {feedback.description && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
            {feedback.description}
          </p>
        )}
      </div>
      <div className="flex border-t border-slate-700/40">
        <button
          onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
        >
          <span>&#10003;</span> Aufnehmen
        </button>
        <div className="w-px bg-slate-700/40" />
        <button
          onClick={onDiscard}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-700/30 transition-colors cursor-pointer"
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
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/40">
        <span className="text-blue-400 shrink-0 text-base">📋</span>
        <span className="text-sm font-medium text-slate-200">Neuer Task</span>
        {task.priority && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ml-auto ${
            task.priority === 'High' || task.priority === 'Urgent'
              ? 'bg-red-500/20 text-red-300'
              : task.priority === 'Medium'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-slate-600/40 text-slate-500'
          }`}>
            {task.priority}
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-sm font-medium text-slate-100">{task.title}</p>
        {task.description && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
            {task.description}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-1">
          {task.partner && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-500">
              Partner: {task.partner}
            </span>
          )}
          {task.status && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-500">
              Status: {task.status}
            </span>
          )}
          {task.dueDate && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-500">
              Fällig: {task.dueDate}
            </span>
          )}
        </div>
      </div>
      <div className="flex border-t border-slate-700/40">
        <button
          onClick={onConfirm}
          disabled={isCreating}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          {isCreating ? (
            <><Loader2 size={14} className="animate-spin" /> Erstelle...</>
          ) : (
            <><span>&#10003;</span> Task erstellen</>
          )}
        </button>
        <div className="w-px bg-slate-700/40" />
        <button
          onClick={onDiscard}
          disabled={isCreating}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-700/30 transition-colors cursor-pointer disabled:opacity-50"
        >
          <span>&#10007;</span> Verwerfen
        </button>
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────────── */

export default function ChatAssistant({ rawData, kpis, comparisonData, currentUser, forceOpen, onClose }) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  // Support external open/close (for mobile bottom nav J.E.T. tab)
  useEffect(() => {
    if (forceOpen != null) {
      setIsOpen(forceOpen);
    }
  }, [forceOpen]);

  // Shared chat engine — all logic lives in the hook
  const engine = useChatEngine({ rawData, kpis, comparisonData, currentUser, isOpen });

  const {
    messages,
    inputValue,
    setInputValue,
    isStreaming,
    pendingFeedback,
    pendingTask,
    isCreatingTask,
    isDataLoaded,
    messagesEndRef,
    textareaRef,
    messagesContainerRef,
    handleSend,
    handleKeyDown,
    handleFeedbackConfirm,
    handleFeedbackDiscard,
    handleTaskConfirm,
    handleTaskDiscard,
    cancelStream,
    lastUsedModel,
    lastError,
    retryLastMessage,
  } = engine;

  /* ── Focus textarea when desktop panel opens ── */
  useEffect(() => {
    if (isOpen && !isMobile && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, isMobile, textareaRef]);

  return (
    <>
      {/* ── Floating Toggle Button (hidden on mobile when using bottom nav) ── */}
      {!(isMobile && forceOpen != null) && (
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className={`
            fixed bottom-6 right-6 z-40
            ${isMobile ? 'w-16 h-16' : 'w-14 h-14'}
            bg-gradient-to-br from-blue-500 to-blue-600
            text-white rounded-full shadow-lg
            flex items-center justify-center
            hover:scale-105 hover:shadow-xl
            active:scale-95
            transition-all duration-200 ease-out
            cursor-pointer
            ${isOpen ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100'}
          `}
          aria-label="J.E.T. oeffnen"
        >
          <MessageSquare size={isMobile ? 28 : 24} />
        </button>
      )}

      {/* ── Mobile: Fullscreen Agent View ── */}
      {isMobile && isOpen && (
        <MobileAgentView
          onClose={() => { setIsOpen(false); onClose?.(); }}
          engine={engine}
        />
      )}

      {/* ── Desktop: Floating Chat Panel ── */}
      {!isMobile && (
        <div
          className={`
            fixed bottom-6 right-6 z-50
            w-[420px] max-h-[80vh] h-[640px]
            bg-slate-900/95 backdrop-blur-xl
            border border-slate-700/60 rounded-2xl
            shadow-2xl flex flex-col
            transition-all duration-300 ease-out
            ${isOpen
              ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
              : 'opacity-0 translate-y-4 scale-95 pointer-events-none'}
          `}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between h-14 px-4 bg-slate-800/80 border-b border-slate-700/50 rounded-t-2xl shrink-0">
            <div className="flex items-center gap-2.5">
              <Sparkles size={18} className="text-blue-400" />
              <span className="text-sm font-semibold text-slate-100">J.E.T.</span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isDataLoaded ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                title={isDataLoaded ? 'Daten geladen' : 'Daten werden geladen...'}
              />
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-colors cursor-pointer"
              aria-label="Chat schließen"
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Quick Actions ── */}
          <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-slate-800/50 shrink-0 scrollbar-none">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleSend(action.message)}
                disabled={isStreaming}
                className="
                  whitespace-nowrap text-xs px-3 py-1.5 rounded-full
                  bg-slate-800/70 text-slate-500
                  border border-slate-700/40
                  hover:bg-slate-700/70 hover:text-slate-100 hover:border-slate-600/50
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
                    px-4 py-3 text-sm leading-relaxed
                    ${msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm max-w-[85%] ml-auto'
                      : msg.isError
                      ? 'bg-red-900/30 text-red-200 border border-red-700/40 rounded-2xl rounded-bl-sm max-w-[85%]'
                      : 'bg-slate-800/80 text-slate-200 border border-slate-700/40 rounded-2xl rounded-bl-sm max-w-[85%]'}
                  `}
                >
                  {msg.role === 'assistant' && msg.content === '' && isStreaming ? (
                    <BouncingDots />
                  ) : msg.role === 'assistant' && msg.isError ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                        <div className="space-y-1">{renderMarkdown(msg.content)}</div>
                      </div>
                      {lastError?.canRetry && (
                        <button
                          onClick={retryLastMessage}
                          disabled={isStreaming}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw size={12} />
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
          {lastUsedModel && (
            <div className="px-4 py-1 text-[10px] text-slate-600 text-center border-t border-slate-800/30">
              Modell: {lastUsedModel}
            </div>
          )}

          {/* ── Input Area ── */}
          <div className="border-t border-slate-700/50 px-4 py-3 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nachricht eingeben..."
                disabled={isStreaming}
                rows={1}
                className="
                  flex-1 resize-none bg-slate-800/60 text-slate-100
                  border border-slate-700/50 rounded-xl px-3.5 py-2.5
                  text-sm placeholder:text-slate-500
                  focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors
                "
                style={{ maxHeight: '120px' }}
              />
              {isStreaming ? (
                <button
                  onClick={cancelStream}
                  className="
                    w-10 h-10 shrink-0 rounded-xl
                    bg-red-600 text-white
                    flex items-center justify-center
                    hover:bg-red-500
                    transition-colors cursor-pointer
                  "
                  aria-label="Antwort abbrechen"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend(inputValue)}
                  disabled={!inputValue.trim()}
                  className="
                    w-10 h-10 shrink-0 rounded-xl
                    bg-blue-600 text-white
                    flex items-center justify-center
                    hover:bg-blue-500
                    disabled:bg-slate-700 disabled:text-slate-500
                    disabled:cursor-not-allowed
                    transition-colors cursor-pointer
                  "
                  aria-label="Nachricht senden"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
