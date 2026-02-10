import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Mail,
  Phone,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  User,
  MapPin,
  Building2,
  FileText,
  ExternalLink,
  Lock,
  Info,
} from 'lucide-react';
import { getContactPhone, getContactEmail, getContactAttribute } from '../utils/superchatService';

/* ──────────────────────── Helpers ──────────────────────── */

function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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

function getChannelLabel(type) {
  const map = {
    whats_app: 'WhatsApp',
    mail: 'Email',
    sms: 'SMS',
    telegram: 'Telegram',
    instagram: 'Instagram',
    facebook: 'Facebook',
  };
  return map[type] || type || '?';
}

function getChannelIcon(type) {
  switch (type) {
    case 'whats_app':
      return <MessageSquare size={12} className="text-green-500" />;
    case 'mail':
      return <Mail size={12} className="text-blue-500" />;
    case 'sms':
      return <Phone size={12} className="text-orange-500" />;
    default:
      return <MessageSquare size={12} className="text-slate-400" />;
  }
}

function getChannelBadgeClass(type) {
  switch (type) {
    case 'whats_app':
      return 'bg-green-100 text-green-700';
    case 'mail':
      return 'bg-blue-100 text-blue-700';
    case 'sms':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function StatusIcon({ status }) {
  switch (status) {
    case 'sent':
      return <Check size={12} className="text-white/70" />;
    case 'delivered':
      return <CheckCheck size={12} className="text-white/70" />;
    case 'read':
    case 'seen':
      return <CheckCheck size={12} className="text-blue-200" />;
    case 'pending':
      return <Clock size={12} className="text-white/70" />;
    case 'failed':
      return <AlertCircle size={12} className="text-red-300" />;
    default:
      return null;
  }
}

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

/* ──────────────────────── Channel Badge ──────────────────────── */

function ChannelBadge({ type }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getChannelBadgeClass(type)}`}
    >
      {getChannelIcon(type)}
      {getChannelLabel(type)}
    </span>
  );
}

/* ──────────────────────── Date Divider ──────────────────────── */

function DateDivider({ timestamp }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 h-px bg-slate-200/60" />
      <span className="text-xs text-slate-400 font-medium">
        {formatDateDivider(timestamp)}
      </span>
      <div className="flex-1 h-px bg-slate-200/60" />
    </div>
  );
}

/* ──────────────────────── Chat Bubble ──────────────────────── */

function ChatBubble({ message }) {
  // Superchat: direction can be "in" (inbound) or "out" (outbound)
  // Or it might use from/to structure
  const isOutbound = message.direction === 'out' || message.direction === 'outbound' || message.direction === 'Outbound';

  const body = message.body || message.text || message.message || '';
  const ts = message.created_at || message.timestamp || '';
  const status = message.status || '';

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 ${
          isOutbound
            ? 'bg-blue-500 text-white rounded-2xl rounded-br-md'
            : 'bg-white/80 backdrop-blur-sm text-slate-900 border border-slate-200/60 rounded-2xl rounded-bl-md'
        }`}
      >
        {/* Subject line for emails */}
        {message.subject && (
          <p
            className={`text-sm font-semibold mb-1 ${
              isOutbound ? 'text-white' : 'text-slate-900'
            }`}
          >
            {message.subject}
          </p>
        )}

        {/* Message body */}
        <p className={`text-sm whitespace-pre-wrap ${isOutbound ? 'text-white' : 'text-slate-700'}`}>
          {body}
        </p>

        {/* Footer: timestamp, status */}
        <div
          className={`flex items-center gap-2 mt-1.5 ${
            isOutbound ? 'justify-end' : 'justify-start'
          }`}
        >
          <span
            className={`text-xs ${isOutbound ? 'text-white/60' : 'text-slate-400'}`}
          >
            {formatTimestamp(ts)}
          </span>
          {isOutbound && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── Input Area ──────────────────────── */

function MessageInput({ conversation, onSendMessage, channels, templates }) {
  const channelType = conversation?.channel?.type || 'whats_app';
  const channelId = conversation?.channel?.id || '';
  const contactId = conversation?.contacts?.[0]?.id || '';
  const timeWindow = conversation?.time_window;
  const isWindowClosed = timeWindow?.state === 'closed';

  const [text, setText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 96) + 'px';
    }
  }, [text]);

  // Filter templates for WhatsApp only
  const whatsappTemplates = useMemo(() => {
    if (channelType !== 'whats_app') return [];
    return templates || [];
  }, [templates, channelType]);

  const canSend = text.trim().length > 0 || selectedTemplate;

  function handleSend() {
    if (!canSend) return;
    onSendMessage({
      channelId,
      channelType,
      contactId,
      body: text.trim(),
      templateId: selectedTemplate || undefined,
    });
    setText('');
    setSelectedTemplate('');
    setShowTemplates(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-slate-200/60 bg-white/40 backdrop-blur-xl p-4">
      {/* 24h window warning */}
      {channelType === 'whats_app' && isWindowClosed && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50/80 border border-amber-200/40 rounded-xl">
          <Clock size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            24h-Fenster geschlossen – nur genehmigte Templates können gesendet werden.
          </p>
          {whatsappTemplates.length > 0 && (
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="ml-auto text-xs text-amber-600 hover:text-amber-800 underline flex-shrink-0"
            >
              {showTemplates ? 'Ausblenden' : 'Templates anzeigen'}
            </button>
          )}
        </div>
      )}

      {/* Template selector */}
      {showTemplates && whatsappTemplates.length > 0 && (
        <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-slate-200/60 bg-white/60">
          {whatsappTemplates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => {
                setSelectedTemplate(tpl.id);
                setText(tpl.body || tpl.name || '');
                setShowTemplates(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50/60 transition-colors border-b border-slate-100/80 last:border-b-0 ${
                selectedTemplate === tpl.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
              }`}
            >
              <span className="font-medium">{tpl.name || tpl.id}</span>
              {tpl.body && (
                <p className="text-slate-400 mt-0.5 truncate">{tpl.body}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Channel info + template button */}
      <div className="flex items-center gap-2 mb-3">
        <ChannelBadge type={channelType} />
        {channelType === 'whats_app' && whatsappTemplates.length > 0 && !isWindowClosed && (
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <FileText size={11} />
            Templates ({whatsappTemplates.length})
          </button>
        )}
        {selectedTemplate && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
            <FileText size={10} />
            Template ausgewählt
            <button
              onClick={() => { setSelectedTemplate(''); setText(''); }}
              className="ml-1 text-blue-400 hover:text-blue-600"
            >
              ✕
            </button>
          </span>
        )}
      </div>

      {/* Message textarea and send button */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isWindowClosed ? 'Template auswählen...' : 'Nachricht schreiben...'}
          rows={1}
          disabled={isWindowClosed && !selectedTemplate}
          className="flex-1 px-3 py-2 text-sm bg-white/60 border border-slate-200/60 rounded-xl text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ maxHeight: '96px' }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
            canSend
              ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
          }`}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────── Right Sidebar (Standort-zentriert) ──────────────────────── */

function LocationSidebar({ contactName, contact, location, conversation }) {
  const channelType = conversation?.channel?.type || '';
  const timeWindow = conversation?.time_window;
  const status = conversation?.status || '';

  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-200/60 bg-white/30 backdrop-blur-xl overflow-y-auto hidden lg:block">
      <div className="p-5 space-y-4">
        {/* Kontakt-Info */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <User size={18} className="text-blue-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 truncate">
                {contactName}
              </h3>
              <p className="text-xs text-slate-400">Superchat Kontakt</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {getContactPhone(contact) && (
              <div className="flex items-center gap-2.5">
                <Phone size={13} className="text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-700 truncate">{getContactPhone(contact)}</span>
              </div>
            )}
            {getContactEmail(contact) && (
              <div className="flex items-center gap-2.5">
                <Mail size={13} className="text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-700 truncate">{getContactEmail(contact)}</span>
              </div>
            )}
            {/* Custom attributes from Superchat (JET ID, Display ID, City etc.) */}
            {contact?.custom_attributes?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100/80 space-y-1.5">
                {contact.custom_attributes.map((attr) => (
                  <div key={attr.id} className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{attr.name}</span>
                    <span className="text-[10px] text-slate-600 font-medium truncate max-w-[140px]">{attr.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conversation status */}
          <div className="mt-3 pt-3 border-t border-slate-100/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Status</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                status === 'open' ? 'bg-amber-100 text-amber-700' : status === 'done' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {status === 'open' ? 'Offen' : status === 'done' ? 'Erledigt' : status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Kanal</span>
              <ChannelBadge type={channelType} />
            </div>
            {timeWindow && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">24h-Fenster</span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  timeWindow.state === 'open' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}>
                  <Clock size={10} />
                  {timeWindow.state === 'open' ? 'Offen' : 'Geschlossen'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ═══════ Standort-Details (Airtable Stammdaten) ═══════ */}
        {location ? (
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <MapPin size={18} className="text-emerald-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">
                  {location.name}
                </h3>
                <p className="text-xs text-slate-400">Standort-Details</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Adresse */}
              {(location.street || location.city) && (
                <div className="flex items-start gap-2.5">
                  <Building2 size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-slate-700">
                    {location.street && <span>{location.street} {location.streetNumber}</span>}
                    {location.city && <><br />{location.postalCode} {location.city}</>}
                  </div>
                </div>
              )}

              {/* Ansprechpartner */}
              {location.contactPerson && (
                <div className="flex items-start gap-2.5">
                  <User size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Ansprechpartner</p>
                    <p className="text-xs text-slate-700 font-medium">{location.contactPerson}</p>
                  </div>
                </div>
              )}

              {/* Contact Email */}
              {(location.contactEmail || location.locationEmail) && (
                <div className="flex items-start gap-2.5">
                  <Mail size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">E-Mail</p>
                    <p className="text-xs text-slate-700 truncate">{location.contactEmail || location.locationEmail}</p>
                  </div>
                </div>
              )}

              {/* Contact Phone */}
              {(location.contactPhone || location.locationPhone) && (
                <div className="flex items-start gap-2.5">
                  <Phone size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Telefon</p>
                    <p className="text-xs text-slate-700">{location.contactPhone || location.locationPhone}</p>
                  </div>
                </div>
              )}

              {/* Legal Entity */}
              {location.legalEntity && (
                <div className="flex items-start gap-2.5">
                  <Building2 size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Rechtliche Einheit</p>
                    <p className="text-xs text-slate-700">{location.legalEntity}</p>
                  </div>
                </div>
              )}

              {/* Lead Status */}
              {location.leadStatus && location.leadStatus.length > 0 && (
                <div className="flex items-start gap-2.5">
                  <FileText size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Akquise-Status</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {location.leadStatus.map((s, i) => (
                        <span key={i} className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded-md">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Display IDs */}
            {location.displayIds && location.displayIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100/80">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">
                  Display IDs
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {location.displayIds.map((id, i) => (
                    <span
                      key={i}
                      className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono rounded-lg"
                    >
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* JET IDs */}
            {location.jetIds && location.jetIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100/80">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">
                  JET IDs
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {location.jetIds.map((id, i) => (
                    <span
                      key={i}
                      className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-mono rounded-lg"
                    >
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <MapPin size={18} className="text-slate-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-slate-500">
                  Kein Standort verknüpft
                </h3>
                <p className="text-xs text-slate-400">
                  Kontakt ist keinem Standort zugeordnet
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────── Main Component ──────────────────────── */

export default function ConversationView({
  conversation = null,
  messages = [],
  contact = null,
  location = null,
  contactName = '',
  channels = [],
  templates = [],
  onSendMessage,
  onBack,
  loading = false,
  messagesError = null,
}) {
  const messagesEndRef = useRef(null);
  const channelType = conversation?.channel?.type || '';

  const sortedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) => new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp)
    );
  }, [messages]);

  const groupedItems = useMemo(() => {
    return groupMessagesByDate(sortedMessages);
  }, [sortedMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex h-full animate-fade-in">
      {/* ═══════ Left: Chat Area ═══════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200/60 bg-white/40 backdrop-blur-xl">
          <button
            onClick={onBack}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900 truncate">
              {contactName}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ChannelBadge type={channelType} />
              {location && (
                <span className="text-xs text-slate-400 truncate">
                  📍 {location.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Clock size={24} className="text-slate-300 mx-auto mb-2 animate-pulse" />
                <p className="text-sm text-slate-400">Nachrichten werden geladen...</p>
              </div>
            </div>
          ) : messagesError === 'forbidden' ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center mx-auto mb-4">
                  <Lock size={24} className="text-amber-500" />
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-1.5">
                  Nachrichtenverlauf nicht verfügbar
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Euer Superchat-Workspace hat keinen API-Zugriff auf den Nachrichtenverlauf.
                  Nachrichten können weiterhin gesendet werden.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50/60 border border-blue-200/40 rounded-xl">
                  <Info size={13} className="text-blue-500 flex-shrink-0" />
                  <p className="text-[11px] text-blue-600">
                    Tipp: Den Verlauf könnt ihr direkt in der Superchat-App einsehen.
                  </p>
                </div>
              </div>
            </div>
          ) : groupedItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <MessageSquare size={32} className="text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-400">
                  Keine Nachrichten
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Starten Sie die Konversation mit einer Nachricht.
                </p>
              </div>
            </div>
          ) : (
            <>
              {groupedItems.map((item) =>
                item.type === 'divider' ? (
                  <DateDivider key={item.id} timestamp={item.date} />
                ) : (
                  <ChatBubble key={item.data.id} message={item.data} />
                )
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <MessageInput
          conversation={conversation}
          onSendMessage={onSendMessage}
          channels={channels}
          templates={templates}
        />
      </div>

      {/* ═══════ Right: Sidebar (Standort-zentriert) ═══════ */}
      <LocationSidebar
        contactName={contactName}
        contact={contact}
        location={location}
        conversation={conversation}
      />
    </div>
  );
}
