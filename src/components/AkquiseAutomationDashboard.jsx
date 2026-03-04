import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Zap, Send, Users, MessageSquare, CheckCircle2,
  XCircle, Clock, AlertTriangle, Loader2, RefreshCw,
  Play, Pause, Plus, ChevronRight, Phone, MapPin,
  BarChart3, ArrowRight, Bot, Eye, Search,
  Filter, Building2,
} from 'lucide-react';
import { supabase } from '../utils/authService';

/* ─── Status Config ─── */
const STATUS_CONFIG = {
  pending:          { label: 'Ausstehend',     color: '#64748b', bg: '#64748b12', icon: Clock },
  template_sent:    { label: 'Template gesendet', color: '#007AFF', bg: '#007AFF12', icon: Send },
  in_conversation:  { label: 'Im Gespräch',    color: '#AF52DE', bg: '#AF52DE12', icon: MessageSquare },
  interested:       { label: 'Interessiert',    color: '#FF9500', bg: '#FF950012', icon: Zap },
  qualified:        { label: 'Qualifiziert',    color: '#34C759', bg: '#34C75912', icon: CheckCircle2 },
  convinced:        { label: 'Überzeugt',       color: '#059669', bg: '#05966912', icon: CheckCircle2 },
  signed:           { label: 'Unterschrieben',  color: '#34C759', bg: '#34C75912', icon: CheckCircle2 },
  declined:         { label: 'Abgelehnt',       color: '#FF3B30', bg: '#FF3B3012', icon: XCircle },
  disqualified:     { label: 'Disqualifiziert', color: '#f97316', bg: '#f9731612', icon: AlertTriangle },
  unresponsive:     { label: 'Keine Antwort',   color: '#94a3b8', bg: '#94a3b812', icon: Clock },
  error:            { label: 'Fehler',          color: '#FF3B30', bg: '#FF3B3012', icon: AlertTriangle },
};

const getStatusConfig = (status) => STATUS_CONFIG[status] || { label: status, color: '#64748b', bg: '#64748b12', icon: Clock };

/* ─── API Service ─── */
async function akquiseApi(action, data = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/akquise/outreach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify({ action, ...data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || `API Error ${res.status}`);
  return json;
}

/* ─── Stat Card ─── */
function StatCard({ label, value, icon: Icon, color = '#007AFF', sub }) {
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span className="text-xs text-text-muted font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary font-mono">{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ status }) {
  const cfg = getStatusConfig(status);
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

/* ─── Conversation Row ─── */
function ConversationRow({ conv, onSelect }) {
  return (
    <button
      onClick={() => onSelect(conv)}
      className="w-full text-left px-4 py-3 hover:bg-surface-secondary/80 transition-colors border-b border-border-secondary/60 flex items-center gap-3"
    >
      <div className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center text-xs font-bold text-text-muted shrink-0">
        {(conv.contact_name || '?')[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">{conv.location_name || 'Unbekannt'}</span>
          <StatusBadge status={conv.status} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-muted">
          <span className="flex items-center gap-0.5"><Phone size={9} />{conv.contact_phone}</span>
          {conv.city && <span className="flex items-center gap-0.5"><MapPin size={9} />{conv.city}</span>}
          <span>{new Date(conv.updated_at).toLocaleDateString('de-DE')}</span>
        </div>
      </div>
      <ChevronRight size={14} className="text-text-muted shrink-0" />
    </button>
  );
}

/* ─── Conversation Detail Panel ─── */
function ConversationDetail({ conv, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    akquiseApi('get_conversation', { conversationId: conv.id })
      .then(data => {
        setMessages(data.messages || []);
      })
      .catch(err => console.error('Load messages failed:', err))
      .finally(() => setLoading(false));
  }, [conv.id]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-secondary bg-surface-primary">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-text-muted hover:text-text-secondary text-sm">← Zurück</button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">{conv.location_name || 'Unbekannt'}</span>
              <StatusBadge status={conv.status} />
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {conv.contact_name} · {conv.contact_phone} · {conv.city}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-text-muted py-12">Keine Nachrichten</div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                msg.direction === 'outbound'
                  ? 'bg-accent text-white rounded-br-md'
                  : 'bg-surface-secondary text-text-primary rounded-bl-md'
              }`}>
                <div className="text-[10px] opacity-60 mb-0.5 font-medium">
                  {msg.sender === 'ai' ? '🤖 KI-Bot' : msg.sender === 'bot' ? '📤 Template' : msg.sender === 'prospect' ? '👤 Standort' : msg.sender}
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
                <div className="text-[9px] opacity-50 mt-1 text-right">
                  {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Footer */}
      {conv.error_message && (
        <div className="px-4 py-2 bg-status-offline/10 border-t border-status-offline/20/40 text-xs text-status-offline">
          <AlertTriangle size={10} className="inline mr-1" />
          {conv.error_message}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════ */

export default function AkquiseAutomationDashboard() {
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedConv, setSelectedConv] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: '', templateId: '', description: '' });
  const [toast, setToast] = useState(null);

  // Available "New Lead" leads from acquisition table
  const [newLeads, setNewLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [statsData, campaignsData, convsData] = await Promise.all([
        akquiseApi('get_stats'),
        akquiseApi('get_campaigns'),
        akquiseApi('get_conversations', { limit: 100 }),
      ]);
      setStats(statsData);
      setCampaigns(campaignsData);
      setConversations(convsData);
    } catch (err) {
      console.error('Load akquise data failed:', err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Load new leads from acquisition
  const loadNewLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const { data, error } = await supabase
        .from('acquisition')
        .select('airtable_id, location_name, city, contact_person, contact_phone, jet_id')
        .eq('lead_status', 'New Lead')
        .not('contact_phone', 'is', null)
        .order('location_name')
        .limit(500);
      if (error) throw error;

      // Filter out leads that already have conversations
      const existingIds = new Set(conversations.map(c => c.akquise_airtable_id));
      setNewLeads((data || []).filter(l => !existingIds.has(l.airtable_id)));
    } catch (err) {
      console.error('Load new leads failed:', err);
    } finally {
      setLeadsLoading(false);
    }
  }, [conversations]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (!loading) loadNewLeads(); }, [loading, loadNewLeads]);

  // Send single template
  const sendSingle = useCallback(async (lead) => {
    if (!campaigns.length) {
      showToast('Bitte erst eine Kampagne erstellen', 'error');
      return;
    }
    setSending(true);
    try {
      const result = await akquiseApi('send_single', {
        akquiseAirtableId: lead.airtable_id,
        campaignId: campaigns[0]?.id,
        templateId: campaigns[0]?.template_id,
      });
      if (result.success || result.whatsappSent) {
        showToast(`Template an ${lead.location_name || lead.contact_person} gesendet${result.testMode ? ' (TEST)' : ''}`);
        loadData();
      } else {
        showToast(result.error || 'Senden fehlgeschlagen', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }, [campaigns, showToast, loadData]);

  // Create campaign
  const createCampaign = useCallback(async () => {
    if (!newCampaign.name || !newCampaign.templateId) {
      showToast('Name und Template-ID sind erforderlich', 'error');
      return;
    }
    try {
      await akquiseApi('create_campaign', {
        name: newCampaign.name,
        description: newCampaign.description,
        templateId: newCampaign.templateId,
        targetFilter: { lead_statuses: ['New Lead'] },
      });
      showToast('Kampagne erstellt');
      setShowNewCampaign(false);
      setNewCampaign({ name: '', templateId: '', description: '' });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [newCampaign, showToast, loadData]);

  // Filtered conversations
  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (statusFilter) list = list.filter(c => c.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        (c.location_name || '').toLowerCase().includes(q) ||
        (c.contact_name || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.contact_phone || '').includes(q)
      );
    }
    return list;
  }, [conversations, statusFilter, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="ml-2 text-sm text-text-muted">Lade Akquise-Automation...</span>
      </div>
    );
  }

  // Detail view
  if (selectedConv) {
    return (
      <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden" style={{ minHeight: 500 }}>
        <ConversationDetail conv={selectedConv} onBack={() => setSelectedConv(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'error' ? 'bg-status-offline text-white' : 'bg-emerald-500 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">KI-Akquise Automation</h2>
            <p className="text-xs text-text-muted">WhatsApp-Outreach für neue Standorte</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2 rounded-lg hover:bg-surface-secondary text-text-muted hover:text-text-secondary transition-colors">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowNewCampaign(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent transition-colors"
          >
            <Plus size={12} />
            Neue Kampagne
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Konversationen" value={stats.totalConversations} icon={MessageSquare} color="#007AFF" />
          <StatCard label="Heute gesendet" value={stats.sentToday} icon={Send} color="#AF52DE" sub={`Limit: ${stats.maxDailySends || 50}/Tag`} />
          <StatCard label="Aktive Kampagnen" value={stats.activeCampaigns} icon={Play} color="#34C759" />
          <StatCard
            label="Conversion"
            value={`${stats.statusBreakdown?.signed || 0}`}
            icon={CheckCircle2}
            color="#059669"
            sub={`${stats.statusBreakdown?.qualified || 0} qualifiziert`}
          />
        </div>
      )}

      {/* Status Funnel */}
      {stats?.statusBreakdown && Object.keys(stats.statusBreakdown).length > 0 && (
        <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Status-Funnel</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.statusBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const cfg = getStatusConfig(status);
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      statusFilter === status ? 'ring-2 ring-offset-1' : ''
                    }`}
                    style={{ background: cfg.bg, color: cfg.color, ringColor: cfg.color }}
                  >
                    <cfg.icon size={10} />
                    {cfg.label}: {count}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: New Leads (eligible for outreach) */}
        <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-secondary/60">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <Building2 size={14} className="text-accent" />
                Neue Leads ({newLeads.length})
              </h3>
              {leadsLoading && <Loader2 size={12} className="animate-spin text-text-muted" />}
            </div>
            <p className="text-[10px] text-text-muted mt-0.5">Lead Status = New Lead, mit Telefonnummer</p>
          </div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100/60">
            {newLeads.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-muted">
                {leadsLoading ? 'Lade...' : 'Keine neuen Leads verfügbar'}
              </div>
            ) : (
              newLeads.slice(0, 50).map(lead => (
                <div key={lead.airtable_id} className="px-4 py-2.5 flex items-center gap-2 hover:bg-surface-secondary/80 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{lead.location_name || 'Unbekannt'}</div>
                    <div className="text-[10px] text-text-muted flex items-center gap-2">
                      <span>{lead.contact_person || '–'}</span>
                      {lead.city && <span className="flex items-center gap-0.5"><MapPin size={8} />{lead.city}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => sendSingle(lead)}
                    disabled={sending || !campaigns.length}
                    className="flex items-center gap-1 px-2 py-1 bg-accent-light text-accent rounded-lg text-[10px] font-medium hover:bg-accent-light transition-colors disabled:opacity-40"
                  >
                    {sending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                    Senden
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Conversations */}
        <div className="lg:col-span-2 bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-secondary/60">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <MessageSquare size={14} className="text-brand-purple" />
                Konversationen ({filteredConversations.length})
              </h3>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Suche..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-6 pr-2 py-1 text-xs border border-border-secondary rounded-lg w-36 focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
            </div>
          </div>
          <div className="max-h-[500px] overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                {statusFilter ? 'Keine Konversationen mit diesem Status' : 'Noch keine Konversationen. Sende ein Template an einen Lead!'}
              </div>
            ) : (
              filteredConversations.map(conv => (
                <ConversationRow key={conv.id} conv={conv} onSelect={setSelectedConv} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Campaigns */}
      {campaigns.length > 0 && (
        <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Kampagnen</h3>
          <div className="space-y-2">
            {campaigns.map(camp => (
              <div key={camp.id} className="flex items-center gap-3 p-3 bg-surface-secondary/60 rounded-xl">
                <div className={`w-2 h-2 rounded-full ${camp.status === 'active' ? 'bg-status-online' : camp.status === 'draft' ? 'bg-amber-400' : 'bg-surface-tertiary'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary">{camp.name}</div>
                  <div className="text-[10px] text-text-muted">
                    {camp.sent_count || 0} gesendet · {camp.response_count || 0} Antworten · {camp.conversion_count || 0} Conversions
                  </div>
                </div>
                <div className="text-[10px] text-text-muted shrink-0">
                  Template: {camp.template_id?.slice(0, 15)}...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowNewCampaign(false)}>
          <div className="bg-surface-primary rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary mb-4">Neue Kampagne erstellen</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">Kampagnenname</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={e => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="z.B. Berlin Q1 2026"
                  className="w-full px-3 py-2 border border-border-secondary rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">WhatsApp Template ID</label>
                <input
                  type="text"
                  value={newCampaign.templateId}
                  onChange={e => setNewCampaign(prev => ({ ...prev, templateId: e.target.value }))}
                  placeholder="tn_..."
                  className="w-full px-3 py-2 border border-border-secondary rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <p className="text-[10px] text-text-muted mt-1">SuperChat Template-ID (muss von Meta genehmigt sein)</p>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">Beschreibung (optional)</label>
                <textarea
                  value={newCampaign.description}
                  onChange={e => setNewCampaign(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Beschreibung der Kampagne..."
                  rows={2}
                  className="w-full px-3 py-2 border border-border-secondary rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNewCampaign(false)} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary">Abbrechen</button>
              <button
                onClick={createCampaign}
                disabled={!newCampaign.name || !newCampaign.templateId}
                className="px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent disabled:opacity-40 transition-colors"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
