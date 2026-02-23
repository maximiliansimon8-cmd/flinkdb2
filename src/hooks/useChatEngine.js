import { useState, useEffect, useRef, useCallback } from 'react';
import {
  buildChatContext,
  findDisplayContext,
  findTasksForDisplay,
  extractQueryTerms,
  buildAccountLinks,
} from '../utils/chatContext';
import { fetchAllTasks, createTask, fetchAllAcquisition, fetchAllInstallationen, fetchAllDeinstalls } from '../utils/airtableService';

/* ─── Constants ────────────────────────────────────────────────────── */

export const WELCOME_MESSAGE =
  'Hey! Ich bin **J.E.T.** — dein Jarvis-Enhanced Thinking Assistant. Ich denke analytisch mit und liefere dir Insights zu Netzwerk, Pipeline, Operations und Risiken. Frag mich was du wissen musst — oder starte mit einem **Briefing**.';

/* ─── Hook ─────────────────────────────────────────────────────────── */

export default function useChatEngine({ rawData, kpis, comparisonData, currentUser, isOpen }) {
  /* ── State ── */
  const [messages, setMessages] = useState([
    { role: 'assistant', content: WELCOME_MESSAGE },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState(null);
  const [pendingTask, setPendingTask] = useState(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [acquisition, setAcquisition] = useState([]);
  const [installationen, setInstallationen] = useState([]);
  const [deinstalls, setDeinstalls] = useState([]);
  const [memories, setMemories] = useState([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const [lastUsedModel, setLastUsedModel] = useState(null);
  const [lastError, setLastError] = useState(null); // { message, errorCode, canRetry, lastMessage }
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  /* ── Refs ── */
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const abortControllerRef = useRef(null);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  /* ── Textarea auto-resize ── */
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [inputValue, resizeTextarea]);

  /* ── Load tasks + acquisition + memories when chat opens ── */
  useEffect(() => {
    if (isOpen) {
      if (tasks.length === 0) fetchAllTasks().then(t => setTasks(t)).catch(() => {});
      if (acquisition.length === 0) fetchAllAcquisition().then(a => setAcquisition(a)).catch(() => {});
      if (installationen.length === 0) fetchAllInstallationen().then(i => setInstallationen(i)).catch(() => {});
      if (deinstalls.length === 0) fetchAllDeinstalls().then(d => setDeinstalls(d)).catch(() => {});
      if (!memoriesLoaded) {
        fetch('/api/chat-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'memory-load' }),
        })
          .then(r => r.json())
          .then(data => {
            setMemories(data.memories || []);
            setMemoriesLoaded(true);
          })
          .catch(() => setMemoriesLoaded(true));
      }
    }
  }, [isOpen]);

  /* ── Focus textarea when panel opens ── */
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  /* ── Send message ── */
  const handleSend = useCallback(async (text) => {
    if (!text.trim() || isStreaming) return;

    const userMsg = text.trim();
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsStreaming(true);

    // Build context payload (inject tasks into rawData for context builder)
    const enrichedRawData = { ...rawData, tasks, acquisition, installationen, deinstalls };
    const context = buildChatContext(enrichedRawData, kpis, comparisonData);
    const terms = extractQueryTerms(userMsg, enrichedRawData);
    let displayContext = null;
    let taskContext = null;
    let accountLinks = null;
    let acquisitionContext = null;
    if (terms.isSpecific) {
      const queries = [...terms.displayQueries, ...terms.cities, ...terms.locationQueries];
      // Deduplicate results by displayId
      const seenIds = new Set();
      displayContext = queries.flatMap(q => findDisplayContext(q, enrichedRawData, comparisonData))
        .filter(d => {
          if (seenIds.has(d.displayId)) return false;
          seenIds.add(d.displayId);
          return true;
        });
      if (displayContext.length === 0) displayContext = null;

      // Fallback: If no display found, search acquisition data for JET-IDs, location names, akquise-IDs
      if (!displayContext && acquisition.length > 0) {
        const allQueries = [...queries, ...terms.locationQueries];
        // Also extract potential JET-IDs or numeric IDs from message
        const numericIds = userMsg.match(/\b\d{5,8}\b/g) || [];
        const searchTermsAll = [...allQueries, ...numericIds];

        const acqMatches = [];
        for (const q of searchTermsAll) {
          const ql = q.toLowerCase().trim();
          if (ql.length < 2) continue;
          for (const a of acquisition) {
            if (acqMatches.some(m => m.id === a.id)) continue;
            const match =
              (a.jetId && a.jetId.toLowerCase().includes(ql)) ||
              (a.akquiseId && a.akquiseId.toLowerCase().includes(ql)) ||
              (a.locationName && a.locationName.toLowerCase().includes(ql)) ||
              (a.city && a.city.some(c => c.toLowerCase().includes(ql)));
            if (match) {
              acqMatches.push({
                id: a.id,
                jetId: a.jetId || null,
                akquiseId: a.akquiseId || null,
                locationName: a.locationName || null,
                city: (a.city || []).join(', '),
                leadStatus: a.leadStatus || null,
                acquisitionPartner: a.acquisitionPartner || null,
                submittedBy: a.submittedBy || null,
                acquisitionDate: a.acquisitionDate || null,
                vertragVorhanden: a.vertragVorhanden || null,
                approvalStatus: a.approvalStatus || null,
                installationsStatus: a.installationsStatus || null,
                readyForInstallation: a.readyForInstallation || false,
                akquiseStorno: a.akquiseStorno || false,
                postInstallStorno: a.postInstallStorno || false,
                postInstallStornoGrund: a.postInstallStornoGrund || null,
                dvacWeek: a.dvacWeek || null,
                hindernisse: a.hindernisse || null,
              });
            }
          }
        }
        if (acqMatches.length > 0) {
          acquisitionContext = acqMatches.slice(0, 10);
        }
      }

      // Build account links for first matched display
      if (displayContext && displayContext.length > 0) {
        accountLinks = buildAccountLinks(displayContext[0].displayId, enrichedRawData, comparisonData);
      }

      // Also find tasks for specific queries — try multiple search terms
      const taskQueries = [...queries];
      // Add location names from matched displays as extra search terms
      if (displayContext) {
        for (const dc of displayContext) {
          if (dc.locationName && !taskQueries.includes(dc.locationName.toLowerCase())) {
            taskQueries.push(dc.locationName);
          }
          if (dc.displayId && !taskQueries.includes(dc.displayId.toLowerCase())) {
            taskQueries.push(dc.displayId);
          }
        }
      }
      // Deduplicate task results by id
      const seenTaskIds = new Set();
      taskContext = taskQueries.flatMap(q => findTasksForDisplay(q, tasks))
        .filter(t => {
          if (seenTaskIds.has(t.id)) return false;
          seenTaskIds.add(t.id);
          return true;
        });
      if (taskContext.length === 0) taskContext = null;
    }

    // Prepare conversation history — SHORTENED to last 6 to reduce location confusion
    // Strip old context blocks from history to prevent model mixing up locations
    const history = messages.slice(-6).map(m => {
      let content = m.content;
      // Remove any old JSON context blocks that may confuse the model
      content = content.replace(/\[Kontext — JET Display Network\][\s\S]*?\[Benutzerfrage\]\n?/g, '');
      content = content.replace(/\[Spezifische Display-Daten\][\s\S]*?\[Benutzerfrage\]\n?/g, '');
      return { role: m.role, content: content.trim() };
    }).filter(m => m.content.length > 0);

    try {
      // Create abort controller for stream cancellation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Fetch with automatic retry on 429 (rate limit)
      const fetchChat = async (retries = 2) => {
        const response = await fetch('/api/chat-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMsg,
            context,
            displayContext,
            acquisitionContext: acquisitionContext || null,
            taskContext,
            accountLinks,
            memoryContext: memories,
            conversationHistory: history,
            mode: 'chat',
          }),
          signal: abortController.signal,
        });
        if (response.status === 429 && retries > 0) {
          await new Promise(r => setTimeout(r, 3000));
          return fetchChat(retries - 1);
        }
        return response;
      };
      const response = await fetchChat();

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errorCode = err.errorCode || 'UNKNOWN';
        const canRetry = !['AUTH_ERROR', 'NO_API_KEY'].includes(errorCode);
        const errorMsg = err.error || 'Fehler bei der Verarbeitung';
        setLastError({ message: errorMsg, errorCode, canRetry, lastMessage: userMsg });
        setConsecutiveErrors(prev => prev + 1);
        throw new Error(errorMsg);
      }

      // Clear error state on successful response
      setLastError(null);
      setConsecutiveErrors(0);

      // Add empty assistant message, then stream into it
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              // Capture model info event
              if (parsed.type === 'model_info') {
                setLastUsedModel(parsed.model || null);
                continue;
              }
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: fullText };
                  return updated;
                });
              }
            } catch {
              /* skip non-JSON lines */
            }
          }
        }
      }

      // Check for feedback marker
      const feedbackMatch = fullText.match(/\[FEEDBACK\](.*?)\[\/FEEDBACK\]/s);
      if (feedbackMatch) {
        try {
          const feedbackData = JSON.parse(feedbackMatch[1]);
          setPendingFeedback(feedbackData);
          const cleanText = fullText.replace(/\[FEEDBACK\].*?\[\/FEEDBACK\]/s, '').trim();
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: cleanText };
            return updated;
          });
        } catch {
          /* parsing error, keep original text */
        }
      }

      // Check for task creation marker
      const taskMatch = fullText.match(/\[TASK\](.*?)\[\/TASK\]/s);
      if (taskMatch) {
        try {
          const taskData = JSON.parse(taskMatch[1]);
          setPendingTask(taskData);
          const cleanText = fullText.replace(/\[TASK\].*?\[\/TASK\]/s, '').trim();
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: cleanText };
            return updated;
          });
        } catch {
          /* parsing error, keep original text */
        }
      }

      // Check for memory marker — agent wants to save a learning
      const memoryMatch = fullText.match(/\[MEMORY\](.*?)\[\/MEMORY\]/s);
      if (memoryMatch) {
        try {
          const memoryData = JSON.parse(memoryMatch[1]);
          // Fire-and-forget save to Supabase
          fetch('/api/chat-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'memory-save',
              memoryData: {
                category: memoryData.category || 'insight',
                content: memoryData.content,
                metadata: memoryData.metadata || {},
                relevanceScore: memoryData.relevanceScore || 5,
                createdBy: currentUser?.name || 'agent',
              },
            }),
          })
            .then(r => r.json())
            .then(saved => {
              if (saved.success) {
                // Add to local memory cache
                setMemories(prev => [...prev, {
                  id: saved.id,
                  category: memoryData.category || 'insight',
                  content: memoryData.content,
                  metadata: memoryData.metadata || {},
                  relevance: memoryData.relevanceScore || 5,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser?.name || 'agent',
                }]);
              }
            })
            .catch(() => {});
          // Strip marker from displayed text
          const cleanMemoryText = fullText.replace(/\[MEMORY\].*?\[\/MEMORY\]/s, '').trim();
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: cleanMemoryText };
            return updated;
          });
        } catch {
          /* parsing error, keep original text */
        }
      }
    } catch (error) {
      // Don't show error for intentional abort
      if (error.name === 'AbortError') {
        // Stream was cancelled by user — keep partial text, just stop streaming
      } else {
        // Build a user-friendly error message
        let displayMsg = error.message || 'Verbindungsfehler. Bitte versuche es erneut.';

        // If we have persistent failures, suggest checking the API key
        if (consecutiveErrors >= 2) {
          displayMsg += '\n\nKI-Service nicht erreichbar. Bitte pruefe den API-Key in den Netlify-Einstellungen.';
        }

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: displayMsg,
            isError: true,
          },
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, [isStreaming, rawData, kpis, comparisonData, messages, tasks, acquisition, memories, currentUser, consecutiveErrors]);

  /* ── Cancel streaming ── */
  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  /* ── Retry last failed message ── */
  const retryLastMessage = useCallback(() => {
    if (!lastError?.lastMessage) return;
    const msg = lastError.lastMessage;
    setLastError(null);
    // Remove the last error message from the conversation
    setMessages(prev => {
      const cleaned = [...prev];
      if (cleaned.length > 0 && cleaned[cleaned.length - 1].isError) {
        cleaned.pop();
      }
      return cleaned;
    });
    // Re-send (need slight delay so state updates propagate)
    setTimeout(() => handleSend(msg), 50);
  }, [lastError, handleSend]);

  /* ── Feedback handlers ── */
  const handleFeedbackConfirm = useCallback(async () => {
    if (!pendingFeedback || !currentUser) return;
    try {
      const res = await fetch('/api/chat-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'feedback',
          feedbackData: {
            ...pendingFeedback,
            userId: currentUser.id,
            userName: currentUser.name,
            userEmail: currentUser.email,
          },
        }),
      });
      if (res.ok) {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `\u2705 ${pendingFeedback.type === 'bug' ? 'Bug-Report' : 'Feature-Request'} "${pendingFeedback.title}" wurde aufgenommen!`,
          },
        ]);
      } else {
        throw new Error();
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '\u26A0\uFE0F Fehler beim Speichern. Bitte versuche es erneut.',
        },
      ]);
    }
    setPendingFeedback(null);
  }, [pendingFeedback, currentUser]);

  const handleFeedbackDiscard = useCallback(() => {
    setPendingFeedback(null);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: 'Feedback wurde verworfen.' },
    ]);
  }, []);

  /* ── Task creation handlers ── */
  const handleTaskConfirm = useCallback(async () => {
    if (!pendingTask) return;
    setIsCreatingTask(true);
    try {
      await createTask({
        title: pendingTask.title,
        description: pendingTask.description || '',
        partner: pendingTask.partner || '',
        status: pendingTask.status || 'New',
        priority: pendingTask.priority || 'Medium',
        dueDate: pendingTask.dueDate || null,
        displayId: pendingTask.displayId || null,
        jetId: pendingTask.jetId || null,
        locations: pendingTask.locations || null,
      });
      // Refresh tasks cache
      fetchAllTasks().then(t => setTasks(t)).catch(() => {});
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `\u2705 Task "${pendingTask.title}" wurde erfolgreich erstellt! Du findest ihn im Tasks-Tab.`,
        },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `\u26A0\uFE0F Fehler beim Erstellen: ${err.message || 'Unbekannter Fehler'}. Bitte versuche es im Tasks-Tab.`,
        },
      ]);
    }
    setPendingTask(null);
    setIsCreatingTask(false);
  }, [pendingTask]);

  const handleTaskDiscard = useCallback(() => {
    setPendingTask(null);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: 'Task wurde verworfen.' },
    ]);
  }, []);

  /* ── Keyboard handler ── */
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend(inputValue);
      }
    },
    [handleSend, inputValue]
  );

  /* ── Connection status ── */
  const isDataLoaded = rawData?.displays?.length > 0;

  /* ── Return ── */
  return {
    messages,
    setMessages,
    inputValue,
    setInputValue,
    isStreaming,
    pendingFeedback,
    setPendingFeedback,
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
    resizeTextarea,
    cancelStream,
    lastUsedModel,
    lastError,
    retryLastMessage,
    consecutiveErrors,
  };
}
