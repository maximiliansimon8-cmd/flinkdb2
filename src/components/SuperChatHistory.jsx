import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MessageSquare, Clock, AlertCircle, Check, CheckCheck, Lock,
  ChevronDown, ChevronUp, Loader2, RefreshCw, ExternalLink,
  Phone, Info, X, Mail,
} from 'lucide-react';
import {
  fetchAllContacts,
  fetchAllConversations,
  fetchMessages,
  getContactPhone,
  getContactDisplayName,
} from '../utils/superchatService';

/* ── Helpers ── */

function normalizePhone(phone) {
  if (!phone) return '';
  // Remove all non-digit chars except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  // Normalize German numbers: 0xxx -> +49xxx
  if (cleaned.startsWith('0') && !cleaned.startsWith('00')) {
    cleaned = '+49' + cleaned.slice(1);
  }
  // 0049 -> +49
  if (cleaned.startsWith('0049')) {
    cleaned = '+49' + cleaned.slice(4);
  }
  // 49xxx (without +) -> +49xxx
  if (cleaned.startsWith('49') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

function phonesMatch(a, b) {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  // Exact match
  if (na === nb) return true;
  // One might have country code, the other not — compare last 10 digits
  const suffixA = na.replace(/^\+?\d{1,3}/, '');
  const suffixB = nb.replace(/^\+?\d{1,3}/, '');
  return suffixA.length >= 6 && suffixA === suffixB;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateDivider(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Heute';
  if (d.toDateString() === yesterday.toDateString()) return 'Gestern';

  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/* ── Status Icon ── */
function StatusIcon({ status }) {
  switch (status) {
    case 'sent':
      return <Check size={11} className="text-white/60" />;
    case 'delivered':
      return <CheckCheck size={11} className="text-white/60" />;
    case 'read':
    case 'seen':
      return <CheckCheck size={11} className="text-blue-200" />;
    case 'pending':
      return <Clock size={11} className="text-white/60" />;
    case 'failed':
      return <AlertCircle size={11} className="text-red-300" />;
    default:
      return null;
  }
}

/* ── Chat Bubble ── */
function ChatBubble({ message }) {
  const isOutbound = message.direction === 'out' || message.direction === 'outbound' || message.direction === 'Outbound';
  const body = message.body || message.text || message.message || '';
  const ts = message.created_at || message.timestamp || '';
  const status = message.status || '';

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className={`max-w-[80%] px-3 py-2 ${
          isOutbound
            ? 'bg-status-online text-white rounded-2xl rounded-br-sm'
            : 'bg-surface-primary text-text-primary border border-border-secondary rounded-2xl rounded-bl-sm shadow-sm'
        }`}
      >
        {message.subject && (
          <p className={`text-xs font-semibold mb-0.5 ${isOutbound ? 'text-white/90' : 'text-text-primary'}`}>
            {message.subject}
          </p>
        )}
        <p className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words ${isOutbound ? 'text-white' : 'text-text-primary'}`}>
          {body}
        </p>
        <div className={`flex items-center gap-1.5 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] ${isOutbound ? 'text-white/50' : 'text-text-muted'}`}>
            {formatTimestamp(ts)}
          </span>
          {isOutbound && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}

/* ── Date Divider ── */
function DateDivider({ timestamp }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 h-px bg-surface-tertiary" />
      <span className="text-[10px] text-text-muted font-medium px-2">
        {formatDateDivider(timestamp)}
      </span>
      <div className="flex-1 h-px bg-surface-tertiary" />
    </div>
  );
}

/* ── Skeleton Loader ── */
function ChatSkeleton() {
  return (
    <div className="space-y-3 p-3 animate-pulse">
      {/* Inbound */}
      <div className="flex justify-start">
        <div className="w-48 h-10 bg-surface-secondary rounded-2xl rounded-bl-sm" />
      </div>
      {/* Outbound */}
      <div className="flex justify-end">
        <div className="w-56 h-14 bg-status-online/10 rounded-2xl rounded-br-sm" />
      </div>
      {/* Inbound */}
      <div className="flex justify-start">
        <div className="w-40 h-8 bg-surface-secondary rounded-2xl rounded-bl-sm" />
      </div>
      {/* Outbound */}
      <div className="flex justify-end">
        <div className="w-44 h-10 bg-status-online/10 rounded-2xl rounded-br-sm" />
      </div>
    </div>
  );
}

/* ── Group messages by date ── */
function groupMessagesByDate(messages) {
  const groups = [];
  let currentDate = null;

  for (const msg of messages) {
    const ts = msg.created_at || msg.timestamp;
    if (!ts) continue;
    const msgDate = new Date(ts).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groups.push({ type: 'divider', date: ts, id: `divider-${msgDate}` });
    }
    groups.push({ type: 'message', data: msg });
  }

  return groups;
}


/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT: SuperChatHistory
   ════════════════════════════════════════════════════════════ */

export default function SuperChatHistory({
  contactPhone,
  contactName = '',
  collapsed: initialCollapsed = true,
  maxHeight = '400px',
  className = '',
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [contactId, setContactId] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [noContact, setNoContact] = useState(false);
  const messagesEndRef = useRef(null);

  // Reset when phone changes
  useEffect(() => {
    setMessages([]);
    setContactId(null);
    setConversationId(null);
    setHasLoaded(false);
    setError(null);
    setForbidden(false);
    setNoContact(false);
  }, [contactPhone]);

  const loadChatHistory = useCallback(async () => {
    if (!contactPhone) {
      setError('Keine Telefonnummer vorhanden');
      return;
    }

    setLoading(true);
    setError(null);
    setForbidden(false);
    setNoContact(false);

    try {
      // Step 1: Find the contact by phone number
      const contacts = await fetchAllContacts();
      const matchedContact = contacts.find(c => {
        const cPhone = getContactPhone(c);
        return phonesMatch(cPhone, contactPhone);
      });

      if (!matchedContact) {
        setNoContact(true);
        setHasLoaded(true);
        setLoading(false);
        return;
      }

      setContactId(matchedContact.id);

      // Step 2: Find conversations for this contact
      const conversations = await fetchAllConversations();
      const matchedConversation = conversations.find(conv => {
        // Superchat conversations have contacts array
        const convContacts = conv.contacts || [];
        return convContacts.some(cc => cc.id === matchedContact.id);
      });

      if (!matchedConversation) {
        setNoContact(true);
        setHasLoaded(true);
        setLoading(false);
        return;
      }

      setConversationId(matchedConversation.id);

      // Step 3: Fetch messages for this conversation
      const { messages: fetchedMessages, error: msgError } = await fetchMessages(matchedConversation.id, { limit: 50 });

      if (msgError === 'forbidden') {
        setForbidden(true);
      } else if (msgError) {
        setError(`Nachrichten konnten nicht geladen werden (${msgError})`);
      } else {
        // Sort chronologically
        const sorted = [...fetchedMessages].sort(
          (a, b) => new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp)
        );
        setMessages(sorted);
      }

      setHasLoaded(true);
    } catch (err) {
      console.error('[SuperChatHistory] Error loading chat history:', err);
      setError('Chat-Verlauf konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [contactPhone]);

  // Auto-load when expanded and not yet loaded
  useEffect(() => {
    if (!collapsed && !hasLoaded && contactPhone) {
      loadChatHistory();
    }
  }, [collapsed, hasLoaded, contactPhone, loadChatHistory]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && !collapsed) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, collapsed]);

  const groupedItems = useMemo(() => {
    return groupMessagesByDate(messages);
  }, [messages]);

  const messageCount = messages.length;

  // Don't render if no phone
  if (!contactPhone) return null;

  return (
    <div className={`bg-surface-primary border border-status-online/20/60 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {/* Header / Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-status-online/10/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-status-online/10 flex items-center justify-center">
            <MessageSquare size={15} className="text-status-online" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-text-primary">WhatsApp Verlauf</div>
            <div className="text-[10px] text-text-muted flex items-center gap-1.5">
              <Phone size={9} /> {contactPhone}
              {hasLoaded && !loading && messageCount > 0 && (
                <span className="text-status-online font-medium">| {messageCount} Nachricht{messageCount !== 1 ? 'en' : ''}</span>
              )}
              {hasLoaded && noContact && (
                <span className="text-text-muted">| Kein Chat gefunden</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin text-status-online" />}
          {hasLoaded && messageCount > 0 && !collapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); loadChatHistory(); }}
              className="p-1 hover:bg-status-online/10 rounded-lg transition-colors"
              title="Aktualisieren"
            >
              <RefreshCw size={12} className="text-status-online" />
            </button>
          )}
          {collapsed ? (
            <ChevronDown size={16} className="text-text-muted" />
          ) : (
            <ChevronUp size={16} className="text-text-muted" />
          )}
        </div>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="border-t border-green-100">
          {/* Loading state */}
          {loading && !hasLoaded && (
            <ChatSkeleton />
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="p-4 flex items-center gap-2 text-sm text-status-offline">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
              <button
                onClick={loadChatHistory}
                className="ml-auto text-xs text-status-offline hover:text-red-700 underline"
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {/* Forbidden (API not available) */}
          {forbidden && !loading && (
            <div className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-status-warning/10 border border-status-warning/20 flex items-center justify-center">
                <Lock size={18} className="text-status-warning" />
              </div>
              <p className="text-xs font-medium text-text-primary">
                Nachrichtenverlauf nicht verfuegbar
              </p>
              <p className="text-[10px] text-text-muted max-w-[250px]">
                Die SuperChat Messages API ist in eurem Plan nicht freigeschaltet.
              </p>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent-light border border-accent/20 rounded-lg mt-1">
                <Info size={10} className="text-accent shrink-0" />
                <span className="text-[10px] text-accent">
                  Tipp: Verlauf direkt in der SuperChat App einsehen.
                </span>
              </div>
            </div>
          )}

          {/* No contact found */}
          {noContact && !loading && !forbidden && (
            <div className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-surface-secondary border border-border-secondary flex items-center justify-center">
                <MessageSquare size={18} className="text-text-muted" />
              </div>
              <p className="text-xs font-medium text-text-secondary">
                Kein Chat-Verlauf gefunden
              </p>
              <p className="text-[10px] text-text-muted max-w-[250px]">
                Fuer {contactName || contactPhone} wurde noch keine WhatsApp-Konversation in SuperChat gefunden.
              </p>
            </div>
          )}

          {/* Messages */}
          {hasLoaded && !forbidden && !noContact && !error && messageCount > 0 && (
            <div
              className="overflow-y-auto px-3 py-2"
              style={{ maxHeight }}
            >
              {groupedItems.map((item) =>
                item.type === 'divider' ? (
                  <DateDivider key={item.id} timestamp={item.date} />
                ) : (
                  <ChatBubble key={item.data.id} message={item.data} />
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Loaded but empty */}
          {hasLoaded && !forbidden && !noContact && !error && messageCount === 0 && !loading && (
            <div className="p-4 flex flex-col items-center text-center gap-2">
              <MessageSquare size={20} className="text-text-muted" />
              <p className="text-xs text-text-muted">Konversation gefunden, aber keine Nachrichten vorhanden.</p>
            </div>
          )}

          {/* Loading more (when already loaded) */}
          {loading && hasLoaded && (
            <div className="flex items-center justify-center py-2 gap-2 text-xs text-status-online">
              <Loader2 size={12} className="animate-spin" />
              Aktualisiere...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
