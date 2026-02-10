import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Mail,
  Phone,
  Clock,
  Send,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  ChevronRight,
  AlertCircle,
  Users,
  Inbox,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchAllStammdaten,
} from '../utils/airtableService';
import {
  fetchConversationsPage,
  fetchContactsPage,
  fetchAllTemplates,
  fetchChannels,
  fetchAllMessages,
  sendMessage,
  getContactDisplayName,
  getContactPhone,
  getContactEmail,
  getContactAttribute,
} from '../utils/superchatService';
import ConversationView from './ConversationView';
import ComposeMessage from './ComposeMessage';

/* ──────────────────────── KPI Card ──────────────────────── */

function KPICard({ label, value, icon: Icon, color, loading }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="font-mono font-bold text-2xl flex items-baseline gap-2" style={{ color }}>
        {value}
        {loading && (
          <Loader2 size={14} className="animate-spin text-slate-300" />
        )}
      </div>
    </div>
  );
}

/* ──────────────────────── Channel Badge ──────────────────────── */

function ChannelBadge({ channel }) {
  const config = {
    whats_app: { bg: 'bg-green-100 text-green-700', icon: MessageSquare, label: 'WhatsApp' },
    WhatsApp: { bg: 'bg-green-100 text-green-700', icon: MessageSquare, label: 'WhatsApp' },
    mail: { bg: 'bg-blue-100 text-blue-700', icon: Mail, label: 'Email' },
    Email: { bg: 'bg-blue-100 text-blue-700', icon: Mail, label: 'Email' },
    sms: { bg: 'bg-orange-100 text-orange-700', icon: Phone, label: 'SMS' },
    SMS: { bg: 'bg-orange-100 text-orange-700', icon: Phone, label: 'SMS' },
    telegram: { bg: 'bg-sky-100 text-sky-700', icon: MessageSquare, label: 'Telegram' },
    instagram: { bg: 'bg-pink-100 text-pink-700', icon: MessageSquare, label: 'Instagram' },
    facebook: { bg: 'bg-indigo-100 text-indigo-700', icon: MessageSquare, label: 'Facebook' },
  };
  const c = config[channel] || { bg: 'bg-slate-100 text-slate-600', icon: MessageSquare, label: channel || '?' };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg}`}>
      <Icon size={10} />
      {c.label}
    </span>
  );
}

/* ──────────────────────── Status Badge ──────────────────────── */

function StatusBadge({ status }) {
  const config = {
    open: { bg: 'bg-amber-100 text-amber-700', label: 'Offen' },
    snoozed: { bg: 'bg-purple-100 text-purple-700', label: 'Zurückgestellt' },
    done: { bg: 'bg-green-100 text-green-700', label: 'Erledigt' },
  };
  const c = config[status] || { bg: 'bg-slate-100 text-slate-600', label: status || '?' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg}`}>
      {c.label}
    </span>
  );
}

/* ──────────────────────── Time Window Badge ──────────────────────── */

function TimeWindowBadge({ timeWindow }) {
  if (!timeWindow) return null;
  const isOpen = timeWindow.state === 'open';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
        isOpen ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
      }`}
      title={isOpen ? `Offen bis ${new Date(timeWindow.open_until).toLocaleString('de-DE')}` : '24h-Fenster geschlossen – nur Templates'}
    >
      <Clock size={10} />
      {isOpen ? '24h offen' : '24h geschlossen'}
    </span>
  );
}

/* ──────────────────────── Inbox Row ──────────────────────── */

function InboxRow({ conversation, contactName, locationName, onClick }) {
  const channelType = conversation.channel?.type || '';
  const status = conversation.status || '';
  const timeWindow = conversation.time_window;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/40 transition-colors text-left group"
    >
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        channelType === 'whats_app'
          ? 'bg-gradient-to-br from-green-100 to-green-50'
          : status === 'open'
          ? 'bg-gradient-to-br from-amber-100 to-amber-50'
          : 'bg-gradient-to-br from-blue-100 to-blue-50'
      }`}>
        {channelType === 'whats_app' ? (
          <MessageSquare size={18} className="text-green-500" />
        ) : channelType === 'mail' ? (
          <Mail size={18} className="text-blue-500" />
        ) : (
          <MessageSquare size={18} className={status === 'open' ? 'text-amber-500' : 'text-blue-500'} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <h4 className="text-sm font-semibold text-slate-900 truncate">
            {contactName || 'Unbekannt'}
          </h4>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 mb-1">
          {locationName && (
            <span className="text-xs text-slate-500 truncate max-w-[200px]">
              📍 {locationName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ChannelBadge channel={channelType} />
          <TimeWindowBadge timeWindow={timeWindow} />
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight
        size={16}
        className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0"
      />
    </button>
  );
}

/* ──────────────────────── Main Component ──────────────────────── */

export default function CommunicationDashboard() {
  // Data
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [channels, setChannels] = useState([]);
  const [locations, setLocations] = useState([]);

  // Loading states – progressive
  const [initialLoading, setInitialLoading] = useState(true);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Conversation detail state
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  // Abort ref for background loading
  const abortRef = useRef(false);

  /* ─── Build contact lookup map ─── */
  const contactMap = useMemo(() => {
    const map = new Map();
    for (const c of contacts) {
      map.set(c.id, c);
    }
    return map;
  }, [contacts]);

  /* ─── Load data progressively ─── */
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      setError(null);
      abortRef.current = false;

      if (isRefresh) setRefreshing(true);

      console.log('[CommunicationDashboard] Starting progressive load...');

      // Step 1: Load first page of conversations + contacts + channels/templates/locations in parallel
      // This is FAST – only 5 API calls
      const [convPage1, contactPage1, templateList, channelList, locationList] = await Promise.all([
        fetchConversationsPage({ limit: 100 }),
        fetchContactsPage({ limit: 100 }),
        fetchAllTemplates(),
        fetchChannels(),
        fetchAllStammdaten(),
      ]);

      // Show first page immediately
      setConversations(convPage1.results);
      setContacts(contactPage1.results);
      setTemplates(templateList);
      setChannels(channelList);
      setLocations(locationList);
      setInitialLoading(false);
      setRefreshing(false);

      console.log(`[CommunicationDashboard] First page: ${convPage1.results.length} conversations, ${contactPage1.results.length} contacts`);

      // Step 2: Load remaining pages in background
      if (convPage1.nextCursor || contactPage1.nextCursor) {
        setBackgroundLoading(true);

        // Load remaining conversations
        let allConvos = [...convPage1.results];
        let convCursor = convPage1.nextCursor;
        while (convCursor && !abortRef.current) {
          const page = await fetchConversationsPage({ limit: 100, after: convCursor });
          allConvos = allConvos.concat(page.results);
          convCursor = page.nextCursor;
          // Update state progressively
          setConversations([...allConvos]);
        }

        // Load remaining contacts
        let allContacts = [...contactPage1.results];
        let contactCursor = contactPage1.nextCursor;
        while (contactCursor && !abortRef.current) {
          const page = await fetchContactsPage({ limit: 100, after: contactCursor });
          allContacts = allContacts.concat(page.results);
          contactCursor = page.nextCursor;
          setContacts([...allContacts]);
        }

        setBackgroundLoading(false);
        console.log(`[CommunicationDashboard] Full load: ${allConvos.length} conversations, ${allContacts.length} contacts`);
      }
    } catch (err) {
      console.error('CommunicationDashboard load error:', err);
      setError('Fehler beim Laden der Superchat-Daten');
      setInitialLoading(false);
      setRefreshing(false);
      setBackgroundLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => { abortRef.current = true; };
  }, [loadData]);

  const handleRefresh = () => {
    abortRef.current = true;
    loadData(true);
  };

  /* ─── Get contact name for a conversation ─── */
  const getContactName = useCallback(
    (conversation) => {
      const contactRef = conversation.contacts?.[0];
      if (!contactRef) return 'Unbekannt';
      const contact = contactMap.get(contactRef.id);
      if (!contact) return contactRef.id?.substring(0, 8) || 'Unbekannt';
      return getContactDisplayName(contact);
    },
    [contactMap]
  );

  /* ─── Try to match a conversation to a location ─── */
  const getLocationForConversation = useCallback(
    (conversation) => {
      const contactRef = conversation.contacts?.[0];
      if (!contactRef) return null;
      const contact = contactMap.get(contactRef.id);
      if (!contact) return null;

      // Extract phone/email from handles
      const phone = getContactPhone(contact);
      const email = getContactEmail(contact);
      // Also check custom attribute JET ID / Display ID for matching
      const jetId = getContactAttribute(contact, 'JET ID');
      const displayId = getContactAttribute(contact, 'Display ID');

      for (const loc of locations) {
        // Match by phone
        if (phone && (loc.contactPhone === phone || loc.locationPhone === phone)) return loc;
        // Match by email
        if (email && (loc.contactEmail === email || loc.locationEmail === email)) return loc;
        // Match by JET ID
        if (jetId && loc.jetIds?.includes(jetId)) return loc;
        // Match by Display ID (partial match – Superchat might have "DO-GER-... | Name")
        if (displayId && loc.displayIds?.some(did => displayId.includes(did))) return loc;
      }
      return null;
    },
    [contactMap, locations]
  );

  /* ─── Filter conversations ─── */
  const filteredConversations = useMemo(() => {
    let result = conversations;

    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (channelFilter !== 'all') {
      result = result.filter((c) => c.channel?.type === channelFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = getContactName(c).toLowerCase();
        const loc = getLocationForConversation(c);
        const locName = loc?.name?.toLowerCase() || '';
        return name.includes(q) || locName.includes(q);
      });
    }

    return result;
  }, [conversations, statusFilter, channelFilter, search, getContactName, getLocationForConversation]);

  /* ─── KPIs ─── */
  const kpis = useMemo(() => {
    const total = conversations.length;
    const open = conversations.filter((c) => c.status === 'open').length;
    const whatsapp = conversations.filter((c) => c.channel?.type === 'whats_app').length;
    const email = conversations.filter((c) => c.channel?.type === 'mail').length;
    return { total, open, whatsapp, email };
  }, [conversations]);

  /* ─── Open conversation detail ─── */
  const handleOpenConversation = async (conversation) => {
    setSelectedConversation(conversation);
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const result = await fetchAllMessages(conversation.id);
      setConversationMessages(result.messages || []);
      if (result.error === 'forbidden') {
        setMessagesError('forbidden');
      } else if (result.error) {
        setMessagesError(result.error);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      setConversationMessages([]);
      setMessagesError(err.message);
    } finally {
      setMessagesLoading(false);
    }
  };

  /* ─── Send message handler ─── */
  const handleSendMessage = async (msgData) => {
    setSendLoading(true);
    try {
      const result = await sendMessage({
        channelId: msgData.channelId,
        channelType: msgData.channelType,
        contactId: msgData.contactId,
        body: msgData.body,
        subject: msgData.subject,
        templateId: msgData.templateId,
        senderName: 'Team',
        recipientName: msgData.recipientName,
        locationIds: msgData.locationIds || [],
        logToAirtable: true,
      });

      if (result.success) {
        setShowCompose(false);
        if (selectedConversation) {
          const msgResult = await fetchAllMessages(selectedConversation.id);
          setConversationMessages(msgResult.messages || []);
        }
      } else {
        alert(`Nachricht konnte nicht gesendet werden: ${result.error}`);
      }
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    } finally {
      setSendLoading(false);
    }
  };

  /* ─── Conversation detail view ─── */
  if (selectedConversation) {
    const contactRef = selectedConversation.contacts?.[0];
    const contact = contactRef ? contactMap.get(contactRef.id) : null;
    const location = getLocationForConversation(selectedConversation);
    const contactName = getContactName(selectedConversation);

    return (
      <div className="animate-fade-in" style={{ height: 'calc(100vh - 160px)' }}>
        <ConversationView
          conversation={selectedConversation}
          messages={conversationMessages}
          contact={contact}
          location={location}
          contactName={contactName}
          channels={channels}
          templates={templates}
          onSendMessage={handleSendMessage}
          onBack={() => {
            setSelectedConversation(null);
            setConversationMessages([]);
            setMessagesError(null);
          }}
          loading={messagesLoading}
          messagesError={messagesError}
        />
      </div>
    );
  }

  /* ─── Main inbox view ─── */
  return (
    <div className="space-y-5 animate-fade-in">
      {/* ═══════ Header ═══════ */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare size={20} className="text-[#3b82f6]" />
            Kommunikation
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Superchat Inbox – WhatsApp, Email &amp; mehr
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl text-xs font-medium text-slate-600 hover:bg-white/80 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Aktualisieren
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-medium shadow-sm transition-all"
          >
            <Plus size={14} />
            Neue Nachricht
          </button>
        </div>
      </div>

      {/* ═══════ KPI Cards ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Konversationen"
          value={kpis.total}
          icon={Inbox}
          color="#3b82f6"
          loading={backgroundLoading}
        />
        <KPICard
          label="Offen"
          value={kpis.open}
          icon={Clock}
          color="#f59e0b"
          loading={backgroundLoading}
        />
        <KPICard
          label="WhatsApp"
          value={kpis.whatsapp}
          icon={MessageSquare}
          color="#22c55e"
          loading={backgroundLoading}
        />
        <KPICard
          label="Email"
          value={kpis.email}
          icon={Mail}
          color="#8b5cf6"
          loading={backgroundLoading}
        />
      </div>

      {/* ═══════ Background loading indicator ═══════ */}
      {backgroundLoading && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50/60 backdrop-blur-xl border border-blue-200/40 rounded-xl">
          <Loader2 size={14} className="animate-spin text-blue-500" />
          <span className="text-xs text-blue-600">
            Weitere Konversationen werden im Hintergrund geladen... ({conversations.length} bisher)
          </span>
        </div>
      )}

      {/* ═══════ Filters ═══════ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kontakt oder Standort suchen..."
            className="w-full pl-9 pr-3 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          {[
            { id: 'all', label: 'Alle' },
            { id: 'open', label: 'Offen' },
            { id: 'done', label: 'Erledigt' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                statusFilter === f.id
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-white/60 backdrop-blur-xl border border-slate-200/60 text-slate-500 hover:bg-white/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Channel filter */}
        <div className="flex items-center gap-1.5">
          {[
            { id: 'all', label: 'Alle Kanäle' },
            { id: 'whats_app', label: 'WhatsApp' },
            { id: 'mail', label: 'Email' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setChannelFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                channelFilter === f.id
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'bg-white/60 backdrop-blur-xl border border-slate-200/60 text-slate-500 hover:bg-white/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════ Inbox List ═══════ */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03] overflow-hidden">
        {initialLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-blue-500 animate-spin" />
            <span className="ml-3 text-sm text-slate-400">
              Superchat-Daten werden geladen...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle size={20} className="text-red-400 mb-2" />
            <span className="text-sm text-red-500 mb-3">{error}</span>
            <button
              onClick={handleRefresh}
              className="text-xs text-blue-500 hover:text-blue-600 underline"
            >
              Erneut versuchen
            </button>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-slate-100/80 flex items-center justify-center mb-4">
              <MessageSquare size={28} className="text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">
              {search || statusFilter !== 'all' || channelFilter !== 'all'
                ? 'Keine Ergebnisse gefunden'
                : 'Keine Konversationen'}
            </p>
            <p className="text-xs text-slate-400">
              {search || statusFilter !== 'all' || channelFilter !== 'all'
                ? 'Versuchen Sie andere Filter'
                : 'Starten Sie die erste Konversation über Superchat'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100/80">
            {filteredConversations.map((conv) => {
              const location = getLocationForConversation(conv);
              return (
                <InboxRow
                  key={conv.id}
                  conversation={conv}
                  contactName={getContactName(conv)}
                  locationName={location?.name}
                  onClick={() => handleOpenConversation(conv)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════ Total count ═══════ */}
      {!initialLoading && !error && (
        <div className="text-center text-xs text-slate-400">
          {filteredConversations.length} von {conversations.length} Konversationen angezeigt
          {backgroundLoading && ' (wird noch geladen...)'}
        </div>
      )}

      {/* ═══════ Compose Modal ═══════ */}
      <ComposeMessage
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
        onSend={handleSendMessage}
        loading={sendLoading}
        locations={locations}
        contacts={contacts}
        channels={channels}
        templates={templates}
      />
    </div>
  );
}
