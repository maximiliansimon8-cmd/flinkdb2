/**
 * UnifiedStandortDetail — Einheitliche Standort-Detailansicht
 *
 * Wird ueberall verwendet, wo ein Standort-Detail angezeigt wird:
 * - Aufbaubereit-Liste (InstallationReadyLocations)
 * - Karte (InstallationMapView)
 * - Buchungen (InstallationBookingsDashboard)
 * - Einladungsmanager (InstallationInviteManager)
 * - Scheduling / Terminierung (LocationDetailTab)
 *
 * Akzeptiert verschiedene Daten-Formate und normalisiert sie intern.
 *
 * Optional interactive features controlled by props:
 * - showActions, showTimeline, showWhatsApp, showPhoneEdit,
 *   showTeamAssign, showBookingLink, showInviteButton, showAkquiseDetail
 */

import React, { useState, useEffect } from 'react';
import {
  X, MapPin, Phone, Mail, User, Building, Image, FileText,
  Download, CheckCircle, AlertTriangle, Zap, Calendar, Clock,
  ExternalLink, Eye, MessageSquare, CalendarCheck, Send,
  Wrench, Hash, BarChart3, PhoneOff,
  History, Plus, Edit3, Save, Copy, Check, Loader2, RotateCcw,
  Trash2, CalendarClock, Users, ShieldAlert, XCircle,
} from 'lucide-react';
import { resolveRecordImages } from '../utils/attachmentResolver';
import { INSTALL_API, formatDateWeekdayYear, formatDateShort } from '../utils/installUtils';
import SuperChatHistory from './SuperChatHistory';

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

function formatDate(d) {
  if (!d) return '--';
  try {
    return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('de-DE', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return d; }
}

function formatDateTime(d) {
  if (!d) return '--';
  try {
    return new Date(d).toLocaleString('de-DE', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return d; }
}

/* ═══════════════════════════════════════════════
   DATA NORMALIZER
   Accepts any of the 5+ data shapes and returns
   a unified object.
   ═══════════════════════════════════════════════ */

export function normalizeStandort(raw, booking, termin) {
  if (!raw) return null;

  const city = Array.isArray(raw.city) ? raw.city[0] : raw.city;

  return {
    // Identity
    id: raw.id || raw.airtable_id || raw.airtableId,
    airtableId: raw.airtable_id || raw.airtableId || raw.id,
    jetId: raw.jet_id || raw.jetId,
    name: raw.location_name || raw.locationName || raw.name || 'Unbekannt',

    // Address
    street: raw.street,
    streetNumber: raw.street_number || raw.streetNumber,
    plz: raw.plz || raw.postalCode || raw.postal_code,
    city,

    // Contact
    contactName: raw.contact_name || raw.contactPerson,
    contactPhone: raw.contact_phone || raw.contactPhone,
    contactEmail: raw.contact_email || raw.contactEmail,

    // Status
    leadStatus: raw.lead_status || raw.leadStatus,
    approvalStatus: raw.approval_status || raw.approvalStatus || raw.overall_approval_status,
    vertragVorhanden: raw.vertragVorhanden || raw.vertrag_vorhanden,
    installationsStatus: raw.installations_status || raw.installationsStatus,
    displayLocationStatus: raw.display_location_status || raw.displayLocationStatus,
    readyForInstallation: raw.ready_for_installation || raw.readyForInstallation,

    // Technical
    mountType: raw.mount_type || raw.mountType,
    schaufenster: raw.schaufenster_einsehbar || raw.schaufenster,
    hindernisse: raw.hindernisse_vorhanden || raw.hindernisse,
    hindernisseBeschreibung: raw.hindernisse_beschreibung || raw.hindernisseBeschreibung,
    fensterbreite: raw.fensterbreite_ausreichend || raw.fensterbreite || raw.fensterbreiteAusreichend,
    steckdose: raw.steckdose_mit_strom || raw.steckdose || raw.steckdoseMitStrom,

    // Acquisition
    acquisitionPartner: raw.acquisition_partner || raw.akquise_partner || raw.acquisitionPartner,
    acquisitionDate: raw.acquisition_date || raw.akquise_date || raw.acquisitionDate,
    frequencyApproval: raw.frequency_check_status || raw.frequencyApproval,
    frequencyApprovalComment: raw.frequency_approval_comment || raw.frequency_check_comment || raw.frequencyApprovalComment,

    // Contract
    vertragsnummer: raw.vertragsnummer || raw.contract_number,
    vertragspartner: raw.vertragspartner || raw.contract_partner,
    vertragsbeginn: raw.vertragsbeginn || raw.contract_start,
    laufzeit: raw.laufzeit || raw.contract_duration,
    unterschriftsdatum: raw.unterschriftsdatum || raw.signature_date,

    // Attachments (raw — will be resolved)
    images: raw.images_akquise || raw.images || raw.bilder || [],
    vertragPdf: raw.vertragPdf || raw.vertrag_pdf_arr || [],
    fawDataAttachment: raw.fawDataAttachment || raw.faw_data_arr || [],
    vertragPdfUrl: raw.vertrag_pdf || raw.contract_pdf_url,
    fawDataUrl: raw.faw_data_url || raw.faw_download,

    // Coordinates
    latitude: raw.latitude,
    longitude: raw.longitude,
    streetviewLink: raw.streetview_link || raw.streetviewLink,

    // Statistics
    dvacWeek: raw.dvac_week || raw.dvac_per_week || raw.dvacWeek,
    dvacMonth: raw.dvac_month || raw.dvac_per_month || raw.dvacMonth,
    dvacDay: raw.dvac_day || raw.dvac_per_day || raw.dvacPerDay,

    // Comments
    akquiseKommentar: raw.akquise_comment || raw.akquise_kommentar || raw.akquiseKommentar,
    akquiseKommentarUpdate: raw.akquise_comment_updates || raw.akquise_kommentar_update || raw.akquiseKommentarUpdate,
    kommentarInstallationen: raw.installation_comment || raw.kommentar_installation || raw.kommentarInstallationen || raw.kommentarAusInstallationen,

    // Live
    liveSince: raw.live_since || raw.live_date || raw.liveSince,
    doId: raw.do_id || raw.doId,
    displayName: raw.display_name || raw.displayName,
    integratorName: raw.integrator_name || raw.installer_team || raw.integratorName,

    // Booking (from separate object or embedded)
    booking: booking ? {
      id: booking.id || booking.booking_id,
      status: booking.status,
      bookedDate: booking.booked_date || booking.bookedDate,
      bookedTime: booking.booked_time || booking.bookedTime,
      bookedEndTime: booking.booked_end_time || booking.bookedEndTime,
      routeCity: booking.route_city || booking.routeCity,
      whatsappSentAt: booking.whatsapp_sent_at || booking.whatsappSentAt,
      bookedAt: booking.booked_at || booking.bookedAt,
      bookingToken: booking.booking_token || booking.bookingToken,
      bookingSource: booking.booking_source || booking.bookingSource,
      phoneStatus: booking.phone_status || booking.phoneStatus,
      phoneCallAt: booking.phone_call_at,
      phoneNotes: booking.phone_notes,
      callbackDate: booking.callback_date,
      callbackReason: booking.callback_reason,
      notes: booking.notes,
      earliestDate: booking.earliest_date,
      installerTeam: booking.installer_team,
      updatedAt: booking.updated_at,
      reminderSentAt: booking.reminder_sent_at,
      _terminStatus: booking._terminStatus,
      _statusInstallation: booking._statusInstallation,
      _isAirtable: booking._isAirtable,
    } : (raw.booked_date || raw.bookedDate) ? {
      status: raw.status || raw.booking_status,
      bookedDate: raw.booked_date || raw.bookedDate,
      bookedTime: raw.booked_time || raw.bookedTime,
      bookedEndTime: raw.booked_end_time,
      routeCity: raw.route_city,
      whatsappSentAt: raw.whatsapp_sent_at,
      bookedAt: raw.booked_at,
      bookingToken: raw.booking_token,
      notes: raw.notes,
      earliestDate: raw.earliest_date,
      installerTeam: raw.installer_team,
      bookingSource: raw.booking_source,
      updatedAt: raw.updated_at,
      reminderSentAt: raw.reminder_sent_at,
      phoneStatus: raw.phone_status,
      phoneCallAt: raw.phone_call_at,
      phoneNotes: raw.phone_notes,
      _terminStatus: raw._terminStatus,
      _statusInstallation: raw._statusInstallation,
      _isAirtable: raw._isAirtable,
    } : null,

    // Termin (Airtable appointment)
    termin: termin ? {
      status: termin.terminstatus,
      datum: termin.installationsdatum || termin.installationsdatumNurDatum,
      zeit: termin.installationszeit,
      notiz: termin.grundNotiz,
    } : null,
  };
}

/* ═══════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════ */

const BOOKING_STATUS = {
  none:      { label: 'Kein Termin',   color: 'bg-surface-secondary text-text-secondary border-border-secondary', icon: Clock },
  pending:   { label: 'Eingeladen',    color: 'bg-status-warning/10 text-yellow-700 border-status-warning/20', icon: Send },
  booked:    { label: 'Eingebucht',    color: 'bg-status-online/10 text-green-700 border-status-online/20', icon: CheckCircle },
  confirmed: { label: 'Eingebucht',    color: 'bg-status-online/10 text-green-700 border-status-online/20', icon: CheckCircle },
  completed: { label: 'Abgeschlossen', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled: { label: 'Storniert',     color: 'bg-status-offline/10 text-red-700 border-status-offline/20', icon: X },
  no_show:   { label: 'No-Show',       color: 'bg-surface-secondary text-text-secondary border-border-secondary', icon: ShieldAlert },
};

function BookingStatusBadge({ status }) {
  const cfg = BOOKING_STATUS[status] || BOOKING_STATUS.none;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

function StatusBadge({ label, variant = 'default' }) {
  const variants = {
    green: 'bg-status-online/10 text-green-700 border-status-online/20',
    cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    amber: 'bg-status-warning/10 text-amber-700 border-status-warning/20',
    blue: 'bg-accent-light text-blue-700 border-accent/20',
    default: 'bg-surface-secondary text-text-secondary border-border-secondary',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${variants[variant] || variants.default}`}>
      {label}
    </span>
  );
}

function InfoRow({ label, value, mono }) {
  if (!value || value === '--') return null;
  return (
    <div>
      <div className="text-text-muted text-xs">{label}</div>
      <div className={`text-text-primary text-sm ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TIMELINE SUB-COMPONENT
   ═══════════════════════════════════════════════ */

function TimelineSection({ booking, rawBooking }) {
  // Build timeline entries from booking fields
  const entries = [];

  const addEntry = (date, label, icon, color) => {
    if (!date) return;
    entries.push({ date, label, icon, color });
  };

  // From rawBooking (Supabase booking record)
  if (rawBooking) {
    addEntry(rawBooking.created_at, 'Buchung erstellt', Plus, 'text-text-muted');
    addEntry(rawBooking.whatsapp_sent_at, 'WhatsApp gesendet', Send, 'text-status-online');
    addEntry(rawBooking.booked_at, 'Termin gebucht', CalendarCheck, 'text-accent');
    addEntry(rawBooking.confirmed_at, 'Termin bestaetigt', CheckCircle, 'text-emerald-500');
    addEntry(rawBooking.reminder_sent_at, 'Erinnerung gesendet', Clock, 'text-status-warning');
    addEntry(rawBooking.updated_at && rawBooking.updated_at !== rawBooking.created_at
      ? rawBooking.updated_at : null, 'Zuletzt aktualisiert', RotateCcw, 'text-text-muted');
  } else if (booking) {
    addEntry(booking.whatsappSentAt, 'WhatsApp gesendet', Send, 'text-status-online');
    addEntry(booking.bookedAt, 'Termin gebucht', CalendarCheck, 'text-accent');
    addEntry(booking.reminderSentAt, 'Erinnerung gesendet', Clock, 'text-status-warning');
    addEntry(booking.updatedAt, 'Zuletzt aktualisiert', RotateCcw, 'text-text-muted');
  }

  // Airtable enrichment
  if (rawBooking?._terminStatus) {
    addEntry(rawBooking.booked_date, `Terminstatus: ${rawBooking._terminStatus}`, Calendar, 'text-brand-purple');
  }
  if (rawBooking?._statusInstallation) {
    addEntry(rawBooking.booked_date, `Installation: ${rawBooking._statusInstallation}`, Wrench, 'text-indigo-500');
  }

  // Sort by date ascending
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (entries.length === 0) return null;

  return (
    <div className="bg-surface-secondary rounded-2xl p-4 space-y-1 border border-gray-100">
      <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 mb-3">
        <History size={14} /> Verlauf
      </h4>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-surface-tertiary" />
        <div className="space-y-3">
          {entries.map((entry, i) => {
            const Icon = entry.icon;
            return (
              <div key={i} className="flex items-start gap-3 relative">
                <div className={`w-[19px] h-[19px] rounded-full bg-surface-primary border-2 border-border-secondary flex items-center justify-center shrink-0 z-10 ${entry.color}`}>
                  <Icon size={10} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary font-medium">{entry.label}</div>
                  <div className="text-[10px] text-text-muted">{formatDateTime(entry.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   AKQUISE DETAIL LOADER SUB-COMPONENT
   ═══════════════════════════════════════════════ */

function AkquiseDetailSection({ airtableId, bookingId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (bookingId) params.set('bookingId', bookingId);
        else if (airtableId) params.set('akquiseId', airtableId);
        else { setLoading(false); return; }

        const res = await fetch(`${INSTALL_API.DETAIL}?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDetail();
    return () => { cancelled = true; };
  }, [airtableId, bookingId]);

  if (loading) {
    return (
      <div className="bg-status-warning/10/50 rounded-2xl p-4 border border-orange-100 flex items-center justify-center gap-2 text-sm text-status-warning">
        <Loader2 size={14} className="animate-spin" /> Akquise-Daten laden...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-status-offline/10 rounded-2xl p-4 border border-red-100 text-sm text-status-offline flex items-center gap-2">
        <AlertTriangle size={14} /> Fehler beim Laden: {error}
      </div>
    );
  }

  if (!detail) return null;

  const d = detail.akquise || detail;

  return (
    <div className="bg-status-warning/10/50 rounded-2xl p-4 space-y-2 border border-orange-100">
      <h4 className="text-sm font-semibold text-orange-700 flex items-center gap-1.5">
        <Building size={14} /> Akquise-Daten (Detail)
      </h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <InfoRow label="Akquise-Partner" value={d.acquisitionPartner || d.acquisition_partner || d.akquise_partner} />
        <InfoRow label="Akquise-Datum" value={d.acquisitionDate || d.acquisition_date ? formatDate(d.acquisitionDate || d.acquisition_date) : null} />
        <InfoRow label="Montage-Art" value={d.mountType || d.mount_type} />
        <InfoRow label="Vertragsnummer" value={d.vertragsnummer || d.contract_number} mono />
        <InfoRow label="FAW Status" value={d.frequencyApproval || d.frequency_check_status} />
        {(d.dvacWeek || d.dvac_week || d.dvacMonth || d.dvac_month) && (<>
          <div>
            <div className="text-orange-400 text-xs">dVAC / Woche</div>
            <div className="text-text-primary font-semibold">
              {(d.dvacWeek || d.dvac_week) != null ? Math.round(d.dvacWeek || d.dvac_week).toLocaleString('de-DE') : '--'}
            </div>
          </div>
          <div>
            <div className="text-orange-400 text-xs">dVAC / Monat</div>
            <div className="text-text-primary font-semibold">
              {(d.dvacMonth || d.dvac_month) != null ? Math.round(d.dvacMonth || d.dvac_month).toLocaleString('de-DE') : '--'}
            </div>
          </div>
        </>)}
        <InfoRow label="Schaufenster" value={d.schaufenster || d.schaufenster_einsehbar} />
      </div>

      {/* Technical details from API response */}
      {(d.hindernisse || d.hindernisse_vorhanden || d.hindernisseBeschreibung || d.hindernisse_beschreibung) && (
        <div className="mt-2 p-2 bg-status-warning/10 border border-status-warning/20 rounded-lg">
          <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
            <AlertTriangle size={11} /> Hindernisse
          </div>
          <div className="text-xs text-status-warning whitespace-pre-wrap mt-1">
            {d.hindernisseBeschreibung || d.hindernisse_beschreibung || d.hindernisse || d.hindernisse_vorhanden}
          </div>
        </div>
      )}

      {/* Kommentare from API */}
      {(d.akquiseKommentar || d.akquise_comment) && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold text-status-warning uppercase tracking-wider mb-0.5">Akquise Kommentar</div>
          <div className="text-xs text-text-primary whitespace-pre-wrap bg-surface-primary rounded-lg p-2.5 border border-orange-100">
            {d.akquiseKommentar || d.akquise_comment}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

/**
 * UnifiedStandortDetail — Slide-over Panel
 *
 * Props:
 *   standort  — Raw location object (any format)
 *   booking   — Optional booking object
 *   termin    — Optional Airtable appointment
 *   onClose   — Close handler
 *   className — Optional extra classes
 *
 * Action callbacks (all optional — null/undefined = feature hidden):
 *   onStatusChange  — (bookingId, newStatus)
 *   onReinvite      — (booking)
 *   onReschedule    — (bookingId, newDate, newTime)
 *   onDefer         — (bookingId, deferDate, deferNote)
 *   onPhoneUpdate   — (bookingId, newPhone, akquiseAirtableId)
 *   onTeamChange    — (bookingId, teamName)
 *   onInvite        — (standort)
 *   actionLoading   — string (booking ID currently loading) or false
 *
 * Data (optional):
 *   routes       — array of open routes (for reschedule modal)
 *   teams        — array of team objects
 *   rawBooking   — the raw booking object from Supabase
 *
 * Feature flags (all default false):
 *   showActions, showTimeline, showWhatsApp, showPhoneEdit,
 *   showTeamAssign, showBookingLink, showInviteButton, showAkquiseDetail
 */
export default function UnifiedStandortDetail({
  standort: rawStandort, booking, termin, onClose, className = '',
  // Action callbacks
  onStatusChange,
  onReinvite,
  onReschedule,
  onDefer,
  onPhoneUpdate,
  onTeamChange,
  onInvite,
  actionLoading,
  // Data
  routes,
  teams,
  rawBooking,
  // Feature flags
  showActions = false,
  showTimeline = false,
  showWhatsApp = false,
  showPhoneEdit = false,
  showTeamAssign = false,
  showBookingLink = false,
  showInviteButton = false,
  showAkquiseDetail = false,
}) {
  // Normalize data
  const s = normalizeStandort(rawStandort, booking, termin);

  // Resolve images from Supabase cache
  const [resolvedImages, setResolvedImages] = useState(s?.images || []);
  const [resolvedVertragPdf, setResolvedVertragPdf] = useState(s?.vertragPdf || []);
  const [resolvedFawData, setResolvedFawData] = useState(s?.fawDataAttachment || []);

  // Phone edit state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // Defer state
  const [showDeferForm, setShowDeferForm] = useState(false);
  const [deferDate, setDeferDate] = useState('');
  const [deferNote, setDeferNote] = useState('');
  const [savingDefer, setSavingDefer] = useState(false);

  // Booking link copy state
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!s?.airtableId) return;

    if (s.images.length > 0) {
      resolveRecordImages(s.airtableId, s.images, 'images_akquise')
        .then(setResolvedImages).catch(() => {});
    }
    if (s.vertragPdf.length > 0) {
      resolveRecordImages(s.airtableId, s.vertragPdf, 'Vertrag (PDF)')
        .then(setResolvedVertragPdf).catch(() => {});
    }
    if (s.fawDataAttachment.length > 0) {
      resolveRecordImages(s.airtableId, s.fawDataAttachment, 'FAW_data_attachment')
        .then(setResolvedFawData).catch(() => {});
    }
  }, [s?.airtableId]);

  // Reset phone edit when standort changes
  useEffect(() => {
    setEditingPhone(false);
    setPhoneValue(s?.contactPhone || '');
    setShowDeferForm(false);
    setDeferDate('');
    setDeferNote('');
  }, [s?.airtableId, s?.contactPhone]);

  if (!s) return null;

  // Build URLs
  const address = [s.street, s.streetNumber].filter(Boolean).join(' ');
  const fullAddress = [address, [s.plz, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const mapsUrl = s.street && s.city
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${s.plz || ''} ${s.city}`)}`
    : (s.latitude && s.longitude)
      ? `https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`
      : null;
  const streetviewUrl = (s.latitude && s.longitude)
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${s.latitude},${s.longitude}`
    : s.streetviewLink || (s.street && s.city
      ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(`${address}, ${s.plz || ''} ${s.city}`)}`
      : null);

  const isVorhanden = (v) => v === true || v === 'true' || v === 'YES' || v === 'checked' || v === 'Ja';

  // Determine booking status for action bar
  const bookingStatus = rawBooking?.status || s.booking?.status;
  const bookingId = rawBooking?.id || s.booking?.id;
  const isLoading = actionLoading && actionLoading === bookingId;
  const isBookedOrConfirmed = bookingStatus === 'booked' || bookingStatus === 'confirmed';
  const isCancelledOrNoShow = bookingStatus === 'cancelled' || bookingStatus === 'no_show';
  const isPending = bookingStatus === 'pending';

  // Phone edit handlers
  const handlePhoneEditStart = () => {
    setPhoneValue(s.contactPhone || '');
    setEditingPhone(true);
  };
  const handlePhoneEditCancel = () => {
    setEditingPhone(false);
    setPhoneValue(s.contactPhone || '');
  };
  const handlePhoneSave = async () => {
    if (!onPhoneUpdate || !bookingId || !phoneValue.trim()) return;
    setSavingPhone(true);
    try {
      await onPhoneUpdate(bookingId, phoneValue.trim(), s.airtableId);
      setEditingPhone(false);
    } catch (err) {
      console.error('[UnifiedStandortDetail] Phone update failed:', err.message);
    } finally {
      setSavingPhone(false);
    }
  };

  // Defer handlers
  const handleDeferSubmit = async () => {
    if (!onDefer || !bookingId || !deferDate) return;
    setSavingDefer(true);
    try {
      await onDefer(bookingId, deferDate, deferNote);
      setShowDeferForm(false);
      setDeferDate('');
      setDeferNote('');
    } catch (err) {
      console.error('[UnifiedStandortDetail] Defer failed:', err.message);
    } finally {
      setSavingDefer(false);
    }
  };

  // Booking link copy
  const bookingToken = rawBooking?.booking_token || s.booking?.bookingToken;
  const bookingUrl = bookingToken ? `https://tools.dimension-outdoor.com/book/${bookingToken}` : null;
  const handleCopyLink = () => {
    if (!bookingUrl) return;
    navigator.clipboard.writeText(bookingUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  return (
    <div className={`fixed inset-0 bg-black/40 z-50 flex justify-end animate-fade-in ${className}`} onClick={onClose}>
      <div
        className="bg-surface-primary w-full max-w-lg h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 bg-surface-primary border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-text-primary text-lg truncate">{s.name}</h3>
            <p className="text-sm text-text-muted flex items-center gap-1 mt-0.5">
              <MapPin size={13} /> {fullAddress || '---'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-secondary rounded-xl text-text-muted transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ── Status Badges ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {s.leadStatus && <StatusBadge label={s.leadStatus} variant="green" />}
            {s.approvalStatus && <StatusBadge label={s.approvalStatus} variant="cyan" />}
            {isVorhanden(s.vertragVorhanden) && <StatusBadge label="Vertrag vorhanden" variant="green" />}
            {s.booking && <BookingStatusBadge status={s.booking.status} />}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-accent bg-accent-light border border-accent/20 rounded-full hover:bg-accent-light transition-colors">
                <MapPin size={10} /> Maps
              </a>
            )}
            {streetviewUrl && (
              <a href={streetviewUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full hover:bg-indigo-100 transition-colors">
                <Eye size={10} /> Streetview
              </a>
            )}
          </div>

          {/* ══════════════════════════════════════
             1. ACTION BAR (when showActions && rawBooking)
             ══════════════════════════════════════ */}
          {showActions && rawBooking && (
            <div className="bg-surface-primary rounded-2xl p-3 border border-border-secondary shadow-sm space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Booked / confirmed: status change actions */}
                {isBookedOrConfirmed && onStatusChange && (
                  <>
                    <button
                      onClick={() => onStatusChange(bookingId, 'cancelled')}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-status-offline/10 border border-status-offline/20 rounded-lg hover:bg-status-offline/10 transition-colors disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Stornieren
                    </button>
                    <button
                      onClick={() => onStatusChange(bookingId, 'no_show')}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-primary bg-surface-secondary border border-border-secondary rounded-lg hover:bg-surface-secondary transition-colors disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 size={12} className="animate-spin" /> : <ShieldAlert size={12} />}
                      No-Show
                    </button>
                  </>
                )}

                {/* Booked / confirmed: reschedule */}
                {isBookedOrConfirmed && onReschedule && (
                  <button
                    onClick={() => onReschedule(bookingId, null, null)}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-accent-light border border-accent/20 rounded-lg hover:bg-accent-light transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : <CalendarClock size={12} />}
                    Umbuchen
                  </button>
                )}

                {/* Cancelled / no_show with phone: reinvite */}
                {isCancelledOrNoShow && onReinvite && s.contactPhone && (
                  <button
                    onClick={() => onReinvite(rawBooking)}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-status-online border border-green-700 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    Neu einladen
                  </button>
                )}
                {/* Always if phone: call link */}
                {s.contactPhone && (
                  <a
                    href={`tel:${s.contactPhone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <Phone size={12} /> Anrufen
                  </a>
                )}
              </div>

              {/* Cancellation details */}
              {isCancelledOrNoShow && rawBooking && (rawBooking.cancelled_by_user_name || rawBooking.cancelled_reason || rawBooking.cancelled_at) && (
                <div className="mt-2 p-2.5 bg-status-offline/10 border border-status-offline/20 rounded-lg text-xs space-y-1">
                  <div className="font-semibold text-red-700 flex items-center gap-1">
                    <Trash2 size={11} /> Storno-Details
                  </div>
                  {rawBooking.cancelled_by_user_name && (
                    <p className="text-status-offline">Storniert von: <span className="font-medium">{rawBooking.cancelled_by_user_name}</span></p>
                  )}
                  {rawBooking.cancelled_at && (
                    <p className="text-status-offline">Zeitpunkt: {new Date(rawBooking.cancelled_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  )}
                  {rawBooking.cancelled_reason && (
                    <p className="text-status-offline">Grund: {rawBooking.cancelled_reason}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Map Preview (clickable link to Google Maps) ── */}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="block rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:border-cyan-300 transition-colors group relative">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 h-24 flex items-center justify-center gap-3">
                <MapPin size={28} className="text-accent group-hover:text-accent transition-colors" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-text-primary">{address}</div>
                  <div className="text-xs text-text-muted">{[s.plz, s.city].filter(Boolean).join(' ')}</div>
                  <div className="text-[10px] text-accent mt-0.5 group-hover:text-blue-700 font-medium">In Google Maps oeffnen →</div>
                </div>
              </div>
            </a>
          )}

          {/* ── Kontakt (with optional Phone Edit) ── */}
          <div className="bg-surface-secondary rounded-2xl p-4 space-y-2 border border-gray-100">
            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <User size={14} /> Kontakt
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Name" value={s.contactName} />
              <div>
                <div className="text-text-muted text-xs">Telefon</div>
                {editingPhone && showPhoneEdit ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="tel"
                      value={phoneValue}
                      onChange={e => setPhoneValue(e.target.value)}
                      className="w-full px-2 py-1 text-sm font-mono border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20"
                      placeholder="+49..."
                      autoFocus
                    />
                    <button
                      onClick={handlePhoneSave}
                      disabled={savingPhone || !phoneValue.trim()}
                      className="p-1.5 text-status-online hover:bg-status-online/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Speichern"
                    >
                      {savingPhone ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    </button>
                    <button
                      onClick={handlePhoneEditCancel}
                      className="p-1.5 text-text-muted hover:bg-surface-secondary rounded-lg transition-colors"
                      title="Abbrechen"
                    >
                      <XCircle size={13} />
                    </button>
                  </div>
                ) : s.contactPhone ? (
                  <div className="flex items-center gap-1">
                    <a href={`tel:${s.contactPhone}`} className="text-text-primary font-mono text-sm hover:text-cyan-600 transition-colors">
                      {s.contactPhone}
                    </a>
                    {showPhoneEdit && onPhoneUpdate && (
                      <button
                        onClick={handlePhoneEditStart}
                        className="p-1 text-text-muted hover:text-accent hover:bg-accent-light rounded transition-colors"
                        title="Telefonnummer bearbeiten"
                      >
                        <Edit3 size={11} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-status-warning flex items-center gap-1 text-sm"><PhoneOff size={11} /> Keine Nr.</span>
                    {showPhoneEdit && onPhoneUpdate && (
                      <button
                        onClick={handlePhoneEditStart}
                        className="p-1 text-text-muted hover:text-accent hover:bg-accent-light rounded transition-colors"
                        title="Telefonnummer hinzufuegen"
                      >
                        <Edit3 size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="text-text-muted text-xs">E-Mail</div>
                {s.contactEmail ? (
                  <a href={`mailto:${s.contactEmail}`} className="text-text-primary text-sm truncate block hover:text-cyan-600 transition-colors">
                    {s.contactEmail}
                  </a>
                ) : <span className="text-text-muted text-sm">--</span>}
              </div>
              {s.jetId && !s.jetId.startsWith('rec') && (
                <div>
                  <div className="text-text-muted text-xs">JET ID</div>
                  <div className="text-text-primary font-mono text-sm">{s.jetId}</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Fotos ── */}
          {resolvedImages.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <Image size={14} /> Standort-Fotos ({resolvedImages.length})
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {resolvedImages.slice(0, 6).map((img, i) => (
                  <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={img.thumbnails?.large?.url || img.thumbnails?.small?.url || img.url}
                      alt={img.filename || `Foto ${i + 1}`}
                      className="w-full h-20 object-cover rounded-xl border border-gray-100 hover:border-cyan-300 transition-colors"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
              {resolvedImages.length > 6 && (
                <div className="text-[10px] text-text-muted text-center">+{resolvedImages.length - 6} weitere Fotos</div>
              )}
            </div>
          )}

          {/* ── Hindernisse / Technische Details ── */}
          {(s.hindernisse || s.hindernisseBeschreibung || s.fensterbreite || s.steckdose || s.mountType) && (
            <div className="p-3 bg-status-warning/10 border border-status-warning/20 rounded-xl space-y-2">
              <div className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Hindernisse / Technische Details
              </div>
              {s.mountType && (
                <div className="text-xs text-amber-800 flex items-center gap-1"><Wrench size={11} /> Montageart: {s.mountType}</div>
              )}
              {s.hindernisse && typeof s.hindernisse === 'string' && (
                <div className="text-xs text-status-warning whitespace-pre-wrap">{s.hindernisse}</div>
              )}
              {s.hindernisseBeschreibung && (
                <div className="text-xs text-status-warning whitespace-pre-wrap">{s.hindernisseBeschreibung}</div>
              )}
              <div className="flex gap-3 text-xs">
                {s.fensterbreite && (
                  <span className={`inline-flex items-center gap-1 ${isVorhanden(s.fensterbreite) ? 'text-status-online' : 'text-text-muted'}`}>
                    <CheckCircle size={11} /> Fensterbreite: {s.fensterbreite === true ? 'Ja' : s.fensterbreite}
                  </span>
                )}
                {s.steckdose && (
                  <span className={`inline-flex items-center gap-1 ${isVorhanden(s.steckdose) ? 'text-status-online' : 'text-text-muted'}`}>
                    <Zap size={11} /> Steckdose: {s.steckdose === true ? 'Ja' : s.steckdose}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Buchung ── */}
          {s.booking && s.booking.status && s.booking.status !== 'none' && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 space-y-2 border border-blue-100">
              <h4 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                <CalendarCheck size={14} /> Buchung
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-accent text-xs">Status</div>
                  <BookingStatusBadge status={s.booking.status} />
                </div>
                {s.booking.bookedDate && (
                  <div>
                    <div className="text-accent text-xs">Termin</div>
                    <div className="text-blue-900 font-semibold">{formatDate(s.booking.bookedDate)}</div>
                  </div>
                )}
                {s.booking.bookedTime && (
                  <div>
                    <div className="text-accent text-xs">Uhrzeit</div>
                    <div className="text-blue-900">{s.booking.bookedTime}{s.booking.bookedEndTime ? ` - ${s.booking.bookedEndTime}` : ''}</div>
                  </div>
                )}
                {s.booking.routeCity && (
                  <div>
                    <div className="text-accent text-xs">Route / Stadt</div>
                    <div className="text-blue-900">{s.booking.routeCity}</div>
                  </div>
                )}
                {s.booking.whatsappSentAt && (
                  <div>
                    <div className="text-accent text-xs">WhatsApp gesendet</div>
                    <div className="text-blue-900">{formatDateTime(s.booking.whatsappSentAt)}</div>
                  </div>
                )}
                {s.booking.bookedAt && (
                  <div>
                    <div className="text-accent text-xs">Bestaetigt am</div>
                    <div className="text-blue-900">{formatDateTime(s.booking.bookedAt)}</div>
                  </div>
                )}
                {s.booking.installerTeam && (
                  <div>
                    <div className="text-accent text-xs">Team</div>
                    <div className="text-blue-900">{s.booking.installerTeam}</div>
                  </div>
                )}
                {s.booking.bookingSource && (
                  <div>
                    <div className="text-accent text-xs">Quelle</div>
                    <div className="text-blue-900 text-xs">{s.booking.bookingSource === 'airtable' ? 'Airtable' : s.booking.bookingSource}</div>
                  </div>
                )}
              </div>
              {s.booking.bookingToken && !showBookingLink && (
                <a href={`/book/${s.booking.bookingToken}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent hover:text-blue-800 font-medium mt-1">
                  <ExternalLink size={11} /> Buchungsseite oeffnen
                </a>
              )}
              {s.booking.notes && (
                <div className="mt-2 pt-2 border-t border-blue-100">
                  <div className="text-accent text-xs mb-0.5">Notizen</div>
                  <div className="text-xs text-blue-900 whitespace-pre-wrap">{s.booking.notes}</div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════
             2. TEAM ASSIGNMENT (when showTeamAssign && teams)
             ══════════════════════════════════════ */}
          {showTeamAssign && teams && teams.length > 0 && rawBooking && (
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-4 space-y-2 border border-purple-100">
              <h4 className="text-sm font-semibold text-purple-700 flex items-center gap-1.5">
                <Users size={14} /> Team-Zuweisung
              </h4>
              <select
                value={rawBooking.installer_team || ''}
                onChange={e => onTeamChange && onTeamChange(rawBooking.id, e.target.value)}
                className="w-full px-3 py-2 text-sm border border-brand-purple/20 rounded-xl bg-surface-primary focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300 transition-colors"
              >
                <option value="">-- Kein Team --</option>
                {teams.map(team => (
                  <option key={team.id || team.name} value={team.name}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ══════════════════════════════════════
             5. DEFER / EARLIEST DATE (when showActions && rawBooking)
             ══════════════════════════════════════ */}
          {showActions && rawBooking && (
            <>
              {/* Earliest date info */}
              {rawBooking.earliest_date && (
                <div className="flex items-start gap-2 p-3 bg-status-warning/10 border border-status-warning/20 rounded-xl">
                  <CalendarClock size={14} className="text-status-warning shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-amber-700">Fruehestens ab</div>
                    <div className="text-sm font-semibold text-amber-900">{formatDate(rawBooking.earliest_date)}</div>
                  </div>
                </div>
              )}

              {/* Defer button + form for pending bookings */}
              {isPending && onDefer && (
                <div className="space-y-2">
                  {!showDeferForm ? (
                    <button
                      onClick={() => setShowDeferForm(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-status-warning/10 border border-status-warning/20 rounded-lg hover:bg-status-warning/10 transition-colors"
                    >
                      <CalendarClock size={12} /> Auf spaeter verschieben
                    </button>
                  ) : (
                    <div className="bg-status-warning/10 rounded-xl p-3 border border-status-warning/20 space-y-2">
                      <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
                        <CalendarClock size={12} /> Auf spaeter verschieben
                      </div>
                      <div>
                        <label className="text-[10px] text-status-warning block mb-0.5">Fruehestes Datum</label>
                        <input
                          type="date"
                          value={deferDate}
                          onChange={e => setDeferDate(e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-status-warning/20 rounded-lg bg-surface-primary focus:outline-none focus:ring-2 focus:ring-amber-200"
                          min={new Date().toLocaleDateString('sv-SE')}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-status-warning block mb-0.5">Notiz (optional)</label>
                        <input
                          type="text"
                          value={deferNote}
                          onChange={e => setDeferNote(e.target.value)}
                          placeholder="z.B. Urlaub bis ..."
                          className="w-full px-2 py-1.5 text-sm border border-status-warning/20 rounded-lg bg-surface-primary focus:outline-none focus:ring-2 focus:ring-amber-200"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDeferSubmit}
                          disabled={!deferDate || savingDefer}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                        >
                          {savingDefer ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Verschieben
                        </button>
                        <button
                          onClick={() => { setShowDeferForm(false); setDeferDate(''); setDeferNote(''); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-primary border border-border-secondary rounded-lg hover:bg-surface-secondary transition-colors"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════
             4. BOOKING LINK (when showBookingLink && bookingToken)
             ══════════════════════════════════════ */}
          {showBookingLink && bookingUrl && (
            <div className="bg-accent-light/50 rounded-xl p-3 border border-blue-100 space-y-1.5">
              <div className="text-xs font-medium text-accent flex items-center gap-1">
                <ExternalLink size={11} /> Buchungslink
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 text-[11px] font-mono text-blue-800 bg-surface-primary px-2.5 py-1.5 rounded-lg border border-blue-100 truncate">
                  {bookingUrl}
                </div>
                <button
                  onClick={handleCopyLink}
                  className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                    linkCopied
                      ? 'text-status-online bg-status-online/10 border-status-online/20'
                      : 'text-accent bg-surface-primary border-accent/20 hover:bg-accent-light'
                  }`}
                  title={linkCopied ? 'Kopiert!' : 'Link kopieren'}
                >
                  {linkCopied ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1.5 text-accent bg-surface-primary border border-accent/20 rounded-lg hover:bg-accent-light transition-colors"
                  title="Buchungsseite oeffnen"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}

          {/* ── Installationstermin (Airtable) ── */}
          {s.termin && (
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-4 space-y-2 border border-purple-100">
              <h4 className="text-sm font-semibold text-purple-700 flex items-center gap-1.5">
                <Calendar size={14} /> Installationstermin
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-brand-purple text-xs">Status</div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                    s.termin.status === 'Geplant' ? 'bg-accent-light text-blue-700 border-accent/20' :
                    s.termin.status === 'Durchgeführt' ? 'bg-status-online/10 text-green-700 border-status-online/20' :
                    s.termin.status === 'Verschoben' ? 'bg-status-warning/10 text-amber-700 border-status-warning/20' :
                    s.termin.status === 'Abgesagt' ? 'bg-status-offline/10 text-red-700 border-status-offline/20' :
                    'bg-surface-secondary text-text-secondary border-border-secondary'
                  }`}>{s.termin.status || 'Unbekannt'}</span>
                </div>
                {s.termin.datum && (
                  <div>
                    <div className="text-brand-purple text-xs">Datum</div>
                    <div className="text-purple-900 font-semibold">{formatDate(s.termin.datum)}</div>
                  </div>
                )}
                {s.termin.zeit && (
                  <div>
                    <div className="text-brand-purple text-xs">Uhrzeit</div>
                    <div className="text-purple-900">{s.termin.zeit}</div>
                  </div>
                )}
                {s.termin.notiz && (
                  <div className="col-span-2">
                    <div className="text-brand-purple text-xs">Notiz</div>
                    <div className="text-purple-900 text-xs whitespace-pre-wrap">{s.termin.notiz}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Akquise-Daten (static or API-loaded) ── */}
          {showAkquiseDetail && s.airtableId ? (
            <AkquiseDetailSection
              airtableId={s.airtableId}
              bookingId={rawBooking?.id || s.booking?.id}
            />
          ) : (
            <div className="bg-status-warning/10/50 rounded-2xl p-4 space-y-2 border border-orange-100">
              <h4 className="text-sm font-semibold text-orange-700 flex items-center gap-1.5">
                <Building size={14} /> Akquise-Daten
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Akquise-Partner" value={s.acquisitionPartner} />
                <InfoRow label="Akquise-Datum" value={s.acquisitionDate ? formatDate(s.acquisitionDate) : null} />
                <InfoRow label="Montage-Art" value={s.mountType || 'Nicht angegeben'} />
                <InfoRow label="Vertragsnummer" value={s.vertragsnummer} mono />
                {(s.dvacWeek || s.dvacMonth) && (<>
                  <div>
                    <div className="text-orange-400 text-xs">dVAC / Woche</div>
                    <div className="text-text-primary font-semibold">{s.dvacWeek != null ? Math.round(s.dvacWeek).toLocaleString('de-DE') : '--'}</div>
                  </div>
                  <div>
                    <div className="text-orange-400 text-xs">dVAC / Monat</div>
                    <div className="text-text-primary font-semibold">{s.dvacMonth != null ? Math.round(s.dvacMonth).toLocaleString('de-DE') : '--'}</div>
                  </div>
                </>)}
                {s.schaufenster && <InfoRow label="Schaufenster" value={s.schaufenster} />}
                {s.frequencyApproval && <InfoRow label="FAW Status" value={s.frequencyApproval} />}
              </div>
            </div>
          )}

          {/* ── Vertragsdaten ── */}
          {(s.vertragsnummer || s.vertragspartner || s.vertragsbeginn || s.laufzeit) && (
            <div className="bg-emerald-50/50 rounded-2xl p-4 space-y-2 border border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <FileText size={14} /> Vertragsdaten
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Vertragsnummer" value={s.vertragsnummer} mono />
                <InfoRow label="Vertragspartner" value={s.vertragspartner} />
                <InfoRow label="Vertragsbeginn" value={s.vertragsbeginn ? formatDate(s.vertragsbeginn) : null} />
                <InfoRow label="Laufzeit" value={s.laufzeit} />
                <InfoRow label="Unterschriftsdatum" value={s.unterschriftsdatum ? formatDate(s.unterschriftsdatum) : null} />
              </div>
            </div>
          )}

          {/* ── Dokumente ── */}
          {(resolvedVertragPdf.length > 0 || resolvedFawData.length > 0 || s.vertragPdfUrl || s.fawDataUrl) && (
            <div className="bg-surface-secondary rounded-2xl p-4 space-y-2 border border-border-secondary">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <FileText size={14} /> Dokumente
              </h4>
              <div className="space-y-1.5">
                {resolvedVertragPdf.map((doc, i) => (
                  <a key={`pdf-${i}`} href={doc.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-surface-primary rounded-xl border border-gray-100 hover:border-green-300 hover:bg-status-online/10/50 transition-colors group">
                    <FileText size={14} className="text-status-online shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-text-primary truncate">{doc.filename || 'Vertrag PDF'}</div>
                      {doc.size > 0 && <div className="text-[10px] text-text-muted">{(doc.size / 1024).toFixed(0)} KB</div>}
                    </div>
                    <Download size={12} className="text-text-muted group-hover:text-status-online shrink-0" />
                  </a>
                ))}
                {resolvedFawData.map((doc, i) => (
                  <a key={`faw-${i}`} href={doc.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-surface-primary rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-accent-light/50 transition-colors group">
                    <FileText size={14} className="text-accent shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-text-primary truncate">{doc.filename || 'FAW Daten'}</div>
                      {doc.size > 0 && <div className="text-[10px] text-text-muted">{(doc.size / 1024).toFixed(0)} KB</div>}
                    </div>
                    <Download size={12} className="text-text-muted group-hover:text-accent shrink-0" />
                  </a>
                ))}
                {/* Fallback for URL-only documents (from API responses) */}
                {resolvedVertragPdf.length === 0 && s.vertragPdfUrl && (
                  <a href={s.vertragPdfUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-surface-primary rounded-xl border border-gray-100 hover:border-green-300 hover:bg-status-online/10/50 transition-colors group">
                    <FileText size={14} className="text-status-online shrink-0" />
                    <div className="text-xs font-medium text-text-primary">Vertrag PDF</div>
                    <Download size={12} className="text-text-muted group-hover:text-status-online shrink-0 ml-auto" />
                  </a>
                )}
                {resolvedFawData.length === 0 && s.fawDataUrl && (
                  <a href={s.fawDataUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-surface-primary rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-accent-light/50 transition-colors group">
                    <FileText size={14} className="text-accent shrink-0" />
                    <div className="text-xs font-medium text-text-primary">FAW Daten</div>
                    <Download size={12} className="text-text-muted group-hover:text-accent shrink-0 ml-auto" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════
             6. WHATSAPP CHAT HISTORY (when showWhatsApp && contactPhone)
             ══════════════════════════════════════ */}
          {showWhatsApp && s.contactPhone && (
            <SuperChatHistory
              contactPhone={s.contactPhone}
              contactName={s.contactName || s.name}
              collapsed={true}
              maxHeight="300px"
            />
          )}

          {/* ══════════════════════════════════════
             8. TIMELINE (when showTimeline)
             ══════════════════════════════════════ */}
          {showTimeline && (
            <TimelineSection booking={s.booking} rawBooking={rawBooking} />
          )}

          {/* ── Kommentare ── */}
          {(s.akquiseKommentar || s.kommentarInstallationen || s.frequencyApprovalComment || s.akquiseKommentarUpdate) && (
            <div className="bg-sky-50/50 rounded-2xl p-4 space-y-3 border border-sky-100">
              <h4 className="text-sm font-semibold text-sky-700 flex items-center gap-1.5">
                <MessageSquare size={14} /> Kommentare
              </h4>
              {s.akquiseKommentar && (
                <div>
                  <div className="text-[10px] font-semibold text-sky-500 uppercase tracking-wider mb-0.5">Akquise</div>
                  <div className="text-xs text-text-primary whitespace-pre-wrap bg-surface-primary rounded-lg p-2.5 border border-sky-100">{s.akquiseKommentar}</div>
                </div>
              )}
              {s.akquiseKommentarUpdate && (
                <div>
                  <div className="text-[10px] font-semibold text-sky-500 uppercase tracking-wider mb-0.5">Akquise Update</div>
                  <div className="text-xs text-text-primary whitespace-pre-wrap bg-surface-primary rounded-lg p-2.5 border border-sky-100">{s.akquiseKommentarUpdate}</div>
                </div>
              )}
              {s.kommentarInstallationen && (
                <div>
                  <div className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider mb-0.5">Installation</div>
                  <div className="text-xs text-text-primary whitespace-pre-wrap bg-surface-primary rounded-lg p-2.5 border border-violet-100">{s.kommentarInstallationen}</div>
                </div>
              )}
              {s.frequencyApprovalComment && (
                <div>
                  <div className="text-[10px] font-semibold text-status-warning uppercase tracking-wider mb-0.5">FAW Kommentar</div>
                  <div className="text-xs text-text-primary whitespace-pre-wrap bg-surface-primary rounded-lg p-2.5 border border-amber-100">{s.frequencyApprovalComment}</div>
                </div>
              )}
            </div>
          )}

          {/* ── Live / Installation Info ── */}
          {(s.liveSince || s.displayName || s.doId || s.integratorName) && (
            <div className="bg-emerald-50/50 rounded-2xl p-4 space-y-2 border border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <BarChart3 size={14} /> Installation / Live
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Live seit" value={s.liveSince ? formatDate(s.liveSince) : null} />
                <InfoRow label="Display Name" value={s.displayName} />
                <InfoRow label="DO ID" value={s.doId} mono />
                <InfoRow label="Installations-Team" value={s.integratorName} />
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════
             9. INVITE BUTTON (when showInviteButton && onInvite && contactPhone)
             ══════════════════════════════════════ */}
          {showInviteButton && onInvite && s.contactPhone && (
            <button
              onClick={() => onInvite(rawStandort)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-status-online border border-green-700 rounded-xl hover:bg-green-700 transition-colors shadow-sm"
            >
              <Send size={14} /> Einladung senden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
