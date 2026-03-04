import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Send,
  MessageSquare,
  Mail,
  Clock,
  Loader2,
  Search,
  MapPin,
  User,
  FileText,
  ChevronDown,
} from "lucide-react";

export default function ComposeMessage({
  isOpen,
  onClose,
  onSend,
  loading = false,
  // Data from CommunicationDashboard
  locations = [],
  contacts = [],
  channels = [],
  templates = [],
  // Pre-selected values (when composing from a conversation)
  defaultContact = null,
  defaultLocation = null,
  defaultChannelType = null,
}) {
  const [channelType, setChannelType] = useState("whats_app");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  // Contact selection
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactPicker, setShowContactPicker] = useState(false);

  // Location selection
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationSearch, setLocationSearch] = useState("");
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Channel selection from Superchat channels list
  const selectedChannel = useMemo(() => {
    return channels.find((ch) => ch.type === channelType) || null;
  }, [channels, channelType]);

  const resetForm = useCallback(() => {
    setChannelType(defaultChannelType || "whats_app");
    setSubject("");
    setMessage("");
    setSelectedTemplate("");
    setShowTemplates(false);
    setSelectedContact(defaultContact || null);
    setContactSearch("");
    setShowContactPicker(false);
    setSelectedLocation(defaultLocation || null);
    setLocationSearch("");
    setShowLocationPicker(false);
  }, [defaultContact, defaultLocation, defaultChannelType]);

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ─── Filtered contacts ───
  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 20);
    const q = contactSearch.toLowerCase();
    return contacts
      .filter((c) => {
        const name = (c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()).toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || email.includes(q);
      })
      .slice(0, 20);
  }, [contacts, contactSearch]);

  // ─── Filtered locations ───
  const filteredLocations = useMemo(() => {
    if (!locationSearch.trim()) return locations.slice(0, 20);
    const q = locationSearch.toLowerCase();
    return locations
      .filter((l) => {
        return (
          l.name?.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q) ||
          l.contactPerson?.toLowerCase().includes(q) ||
          l.jetIds?.some((id) => id.toLowerCase().includes(q))
        );
      })
      .slice(0, 20);
  }, [locations, locationSearch]);

  // ─── WhatsApp templates ───
  const whatsappTemplates = useMemo(() => {
    if (channelType !== "whats_app") return [];
    return templates || [];
  }, [templates, channelType]);

  // ─── Contact display name ───
  function getContactDisplayName(contact) {
    if (!contact) return "";
    return contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.phone || contact.email || "Unbekannt";
  }

  // ─── Can send? ───
  const canSend =
    (message.trim().length > 0 || selectedTemplate) &&
    selectedContact &&
    selectedChannel &&
    !loading;

  const handleSend = () => {
    if (!canSend) return;
    onSend({
      channelId: selectedChannel.id,
      channelType,
      contactId: selectedContact.id,
      body: message.trim(),
      subject: channelType === "mail" ? subject.trim() : undefined,
      templateId: selectedTemplate || undefined,
      recipientName: getContactDisplayName(selectedContact),
      locationIds: selectedLocation ? [selectedLocation.id] : [],
    });
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface-primary2xl border border-border-secondary rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* ═══════ Header ═══════ */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary/40 sticky top-0 bg-surface-primary2xl rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Neue Nachricht
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Via Superchat senden
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-secondary/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ═══════ Body ═══════ */}
        <div className="px-6 py-5 space-y-5">
          {/* ─── Channel Selector ─── */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChannelType("whats_app")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                channelType === "whats_app"
                  ? "bg-status-online text-white shadow-sm"
                  : "bg-surface-secondary/60 text-text-muted hover:bg-surface-tertiary/60"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setChannelType("mail")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                channelType === "mail"
                  ? "bg-accent text-white shadow-sm"
                  : "bg-surface-secondary/60 text-text-muted hover:bg-surface-tertiary/60"
              }`}
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
          </div>

          {/* No channel warning */}
          {!selectedChannel && channels.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-status-warning/10/60 border border-status-warning/20/40 rounded-xl">
              <Clock className="w-4 h-4 text-status-warning flex-shrink-0" />
              <p className="text-xs text-amber-700">
                Kein {channelType === "whats_app" ? "WhatsApp" : "Email"}-Kanal in Superchat gefunden.
              </p>
            </div>
          )}

          {/* ─── Kontakt-Auswahl ─── */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              <User className="w-3 h-3 inline mr-1" />
              Empfänger (Superchat Kontakt)
            </label>
            {selectedContact ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-primary border border-border-secondary rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {getContactDisplayName(selectedContact)}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {selectedContact.phone || selectedContact.email || ''}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedContact(null);
                    setShowContactPicker(true);
                  }}
                  className="text-xs text-accent hover:text-accent flex-shrink-0"
                >
                  Ändern
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={contactSearch}
                    onChange={(e) => {
                      setContactSearch(e.target.value);
                      setShowContactPicker(true);
                    }}
                    onFocus={() => setShowContactPicker(true)}
                    placeholder="Kontakt suchen (Name, Telefon, Email)..."
                    className="w-full pl-9 pr-3 py-2.5 bg-surface-primary border border-border-secondary rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-blue-400 transition-all"
                  />
                </div>
                {showContactPicker && (
                  <div className="absolute z-20 w-full mt-1 bg-surface-primary border border-border-secondary rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-text-muted">
                        Keine Kontakte gefunden
                      </div>
                    ) : (
                      filteredContacts.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedContact(c);
                            setShowContactPicker(false);
                            setContactSearch("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-accent-light/60 transition-colors flex items-center gap-2 border-b border-border-secondary/60 last:border-b-0"
                        >
                          <div className="w-7 h-7 rounded-lg bg-surface-secondary flex items-center justify-center flex-shrink-0">
                            <User size={12} className="text-text-muted" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-text-primary truncate">
                              {getContactDisplayName(c)}
                            </p>
                            <p className="text-[10px] text-text-muted truncate">
                              {c.phone || c.email || ''}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Standort-Verknüpfung ─── */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              <MapPin className="w-3 h-3 inline mr-1" />
              Standort verknüpfen (optional)
            </label>
            {selectedLocation ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-primary border border-border-secondary rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <MapPin size={14} className="text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {selectedLocation.name}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {selectedLocation.city}
                    {selectedLocation.contactPerson ? ` · ${selectedLocation.contactPerson}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedLocation(null);
                    setShowLocationPicker(true);
                  }}
                  className="text-xs text-accent hover:text-accent flex-shrink-0"
                >
                  Ändern
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={locationSearch}
                    onChange={(e) => {
                      setLocationSearch(e.target.value);
                      setShowLocationPicker(true);
                    }}
                    onFocus={() => setShowLocationPicker(true)}
                    placeholder="Standort suchen (Name, Stadt, JET ID)..."
                    className="w-full pl-9 pr-3 py-2.5 bg-surface-primary border border-border-secondary rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-blue-400 transition-all"
                  />
                </div>
                {showLocationPicker && (
                  <div className="absolute z-20 w-full mt-1 bg-surface-primary border border-border-secondary rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredLocations.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-text-muted">
                        Keine Standorte gefunden
                      </div>
                    ) : (
                      filteredLocations.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => {
                            setSelectedLocation(l);
                            setShowLocationPicker(false);
                            setLocationSearch("");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-emerald-50/60 transition-colors flex items-center gap-2 border-b border-border-secondary/60 last:border-b-0"
                        >
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <MapPin size={12} className="text-emerald-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-text-primary truncate">
                              {l.name}
                            </p>
                            <p className="text-[10px] text-text-muted truncate">
                              {l.city}{l.contactPerson ? ` · ${l.contactPerson}` : ''}
                            </p>
                          </div>
                          {l.jetIds?.[0] && (
                            <span className="text-[10px] font-mono text-text-muted flex-shrink-0">
                              {l.jetIds[0]}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Subject (Email only) ─── */}
          {channelType === "mail" && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Betreff
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Betreff eingeben..."
                className="w-full px-3 py-2.5 bg-surface-primary border border-border-secondary rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-blue-400 transition-all"
              />
            </div>
          )}

          {/* ─── WhatsApp Template Selector ─── */}
          {channelType === "whats_app" && whatsappTemplates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                <FileText className="w-3 h-3 inline mr-1" />
                WhatsApp Template (optional)
              </label>
              <button
                type="button"
                onClick={() => setShowTemplates(!showTemplates)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-surface-primary border border-border-secondary rounded-xl text-sm text-left transition-all hover:bg-surface-secondary"
              >
                <span className={selectedTemplate ? "text-text-primary" : "text-text-muted"}>
                  {selectedTemplate
                    ? whatsappTemplates.find((t) => t.id === selectedTemplate)?.name || "Template ausgewählt"
                    : "Template auswählen..."}
                </span>
                <ChevronDown size={14} className={`text-text-muted transition-transform ${showTemplates ? "rotate-180" : ""}`} />
              </button>

              {showTemplates && (
                <div className="mt-1 bg-surface-primary border border-border-secondary rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {/* Clear selection */}
                  <button
                    onClick={() => {
                      setSelectedTemplate("");
                      setShowTemplates(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-text-muted hover:bg-surface-secondary/60 transition-colors border-b border-border-secondary/60"
                  >
                    Kein Template
                  </button>
                  {whatsappTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        setSelectedTemplate(tpl.id);
                        if (tpl.body) setMessage(tpl.body);
                        setShowTemplates(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-accent-light/60 transition-colors border-b border-border-secondary/60 last:border-b-0 ${
                        selectedTemplate === tpl.id ? "bg-accent-light text-blue-700" : "text-text-primary"
                      }`}
                    >
                      <span className="font-medium">{tpl.name || tpl.id}</span>
                      {tpl.body && (
                        <p className="text-text-muted mt-0.5 truncate">{tpl.body}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Message Textarea ─── */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              Nachricht
            </label>
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Nachricht verfassen..."
                className="w-full px-3 py-2.5 bg-surface-primary border border-border-secondary rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-blue-400 transition-all resize-none"
              />
              <span className="absolute bottom-2 right-3 text-[11px] text-text-muted pointer-events-none">
                {message.length}
              </span>
            </div>
          </div>

          {/* ─── WhatsApp 24h Template Notice ─── */}
          {channelType === "whats_app" && (
            <div className="flex items-start gap-2.5 bg-status-warning/10/60 border border-status-warning/20/40 rounded-xl p-3">
              <Clock className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 leading-relaxed">
                Außerhalb des 24h-Fensters können nur genehmigte
                Templates gesendet werden.
              </p>
            </div>
          )}
        </div>

        {/* ═══════ Footer ═══════ */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-secondary/40 sticky bottom-0 bg-surface-primary2xl rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="border border-border-secondary text-text-secondary hover:bg-surface-secondary/60 rounded-xl px-4 py-2.5 text-sm transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="flex items-center gap-2 bg-accent hover:bg-accent text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Wird gesendet...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Senden
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
