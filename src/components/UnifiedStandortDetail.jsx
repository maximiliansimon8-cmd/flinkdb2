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
 */

import React, { useState, useEffect } from 'react';
import {
  X, MapPin, Phone, Mail, User, Building, Image, FileText,
  Download, CheckCircle, AlertTriangle, Zap, Calendar, Clock,
  ExternalLink, Eye, MessageSquare, CalendarCheck, Send,
  Wrench, Hash, BarChart3, PhoneOff,
} from 'lucide-react';
import { resolveRecordImages } from '../utils/attachmentResolver';

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
    } : (raw.booked_date || raw.bookedDate) ? {
      status: raw.status || raw.booking_status,
      bookedDate: raw.booked_date || raw.bookedDate,
      bookedTime: raw.booked_time || raw.bookedTime,
      bookedEndTime: raw.booked_end_time,
      routeCity: raw.route_city,
      whatsappSentAt: raw.whatsapp_sent_at,
      bookedAt: raw.booked_at,
      bookingToken: raw.booking_token,
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
  none:      { label: 'Kein Termin',   color: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock },
  pending:   { label: 'Eingeladen',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Send },
  booked:    { label: 'Eingebucht',    color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  confirmed: { label: 'Eingebucht',    color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  completed: { label: 'Abgeschlossen', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled: { label: 'Storniert',     color: 'bg-red-100 text-red-700 border-red-200', icon: X },
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
    green: 'bg-green-100 text-green-700 border-green-200',
    cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    default: 'bg-gray-100 text-gray-600 border-gray-200',
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
      <div className="text-gray-400 text-xs">{label}</div>
      <div className={`text-gray-900 text-sm ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
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
 */
export default function UnifiedStandortDetail({ standort: rawStandort, booking, termin, onClose, className = '' }) {
  // Normalize data
  const s = normalizeStandort(rawStandort, booking, termin);

  // Resolve images from Supabase cache
  const [resolvedImages, setResolvedImages] = useState(s?.images || []);
  const [resolvedVertragPdf, setResolvedVertragPdf] = useState(s?.vertragPdf || []);
  const [resolvedFawData, setResolvedFawData] = useState(s?.fawDataAttachment || []);

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

  return (
    <div className={`fixed inset-0 bg-black/40 z-50 flex justify-end animate-fade-in ${className}`} onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-xl border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-lg truncate">{s.name}</h3>
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin size={13} /> {fullAddress || '---'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors shrink-0">
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
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors">
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

          {/* ── Map Preview (clickable link to Google Maps) ── */}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="block rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:border-cyan-300 transition-colors group relative">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 h-24 flex items-center justify-center gap-3">
                <MapPin size={28} className="text-blue-400 group-hover:text-blue-600 transition-colors" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-800">{address}</div>
                  <div className="text-xs text-gray-500">{[s.plz, s.city].filter(Boolean).join(' ')}</div>
                  <div className="text-[10px] text-blue-500 mt-0.5 group-hover:text-blue-700 font-medium">In Google Maps oeffnen →</div>
                </div>
              </div>
            </a>
          )}

          {/* ── Kontakt ── */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <User size={14} /> Kontakt
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Name" value={s.contactName} />
              <div>
                <div className="text-gray-400 text-xs">Telefon</div>
                {s.contactPhone ? (
                  <a href={`tel:${s.contactPhone}`} className="text-gray-900 font-mono text-sm hover:text-cyan-600 transition-colors">
                    {s.contactPhone}
                  </a>
                ) : (
                  <span className="text-amber-500 flex items-center gap-1 text-sm"><PhoneOff size={11} /> Keine Nr.</span>
                )}
              </div>
              <div>
                <div className="text-gray-400 text-xs">E-Mail</div>
                {s.contactEmail ? (
                  <a href={`mailto:${s.contactEmail}`} className="text-gray-900 text-sm truncate block hover:text-cyan-600 transition-colors">
                    {s.contactEmail}
                  </a>
                ) : <span className="text-gray-400 text-sm">--</span>}
              </div>
              {s.jetId && !s.jetId.startsWith('rec') && (
                <div>
                  <div className="text-gray-400 text-xs">JET ID</div>
                  <div className="text-gray-900 font-mono text-sm">{s.jetId}</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Fotos ── */}
          {resolvedImages.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
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
                <div className="text-[10px] text-gray-400 text-center">+{resolvedImages.length - 6} weitere Fotos</div>
              )}
            </div>
          )}

          {/* ── Hindernisse / Technische Details ── */}
          {(s.hindernisse || s.hindernisseBeschreibung || s.fensterbreite || s.steckdose || s.mountType) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Hindernisse / Technische Details
              </div>
              {s.mountType && (
                <div className="text-xs text-amber-800 flex items-center gap-1"><Wrench size={11} /> Montageart: {s.mountType}</div>
              )}
              {s.hindernisse && typeof s.hindernisse === 'string' && (
                <div className="text-xs text-amber-600 whitespace-pre-wrap">{s.hindernisse}</div>
              )}
              {s.hindernisseBeschreibung && (
                <div className="text-xs text-amber-600 whitespace-pre-wrap">{s.hindernisseBeschreibung}</div>
              )}
              <div className="flex gap-3 text-xs">
                {s.fensterbreite && (
                  <span className={`inline-flex items-center gap-1 ${isVorhanden(s.fensterbreite) ? 'text-green-600' : 'text-gray-500'}`}>
                    <CheckCircle size={11} /> Fensterbreite: {s.fensterbreite === true ? 'Ja' : s.fensterbreite}
                  </span>
                )}
                {s.steckdose && (
                  <span className={`inline-flex items-center gap-1 ${isVorhanden(s.steckdose) ? 'text-green-600' : 'text-gray-500'}`}>
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
                  <div className="text-blue-400 text-xs">Status</div>
                  <BookingStatusBadge status={s.booking.status} />
                </div>
                {s.booking.bookedDate && (
                  <div>
                    <div className="text-blue-400 text-xs">Termin</div>
                    <div className="text-blue-900 font-semibold">{formatDate(s.booking.bookedDate)}</div>
                  </div>
                )}
                {s.booking.bookedTime && (
                  <div>
                    <div className="text-blue-400 text-xs">Uhrzeit</div>
                    <div className="text-blue-900">{s.booking.bookedTime}{s.booking.bookedEndTime ? ` - ${s.booking.bookedEndTime}` : ''}</div>
                  </div>
                )}
                {s.booking.routeCity && (
                  <div>
                    <div className="text-blue-400 text-xs">Route / Stadt</div>
                    <div className="text-blue-900">{s.booking.routeCity}</div>
                  </div>
                )}
                {s.booking.whatsappSentAt && (
                  <div>
                    <div className="text-blue-400 text-xs">WhatsApp gesendet</div>
                    <div className="text-blue-900">{formatDateTime(s.booking.whatsappSentAt)}</div>
                  </div>
                )}
                {s.booking.bookedAt && (
                  <div>
                    <div className="text-blue-400 text-xs">Bestaetigt am</div>
                    <div className="text-blue-900">{formatDateTime(s.booking.bookedAt)}</div>
                  </div>
                )}
              </div>
              {s.booking.bookingToken && (
                <a href={`/book/${s.booking.bookingToken}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium mt-1">
                  <ExternalLink size={11} /> Buchungsseite oeffnen
                </a>
              )}
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
                  <div className="text-purple-400 text-xs">Status</div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                    s.termin.status === 'Geplant' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                    s.termin.status === 'Durchgeführt' ? 'bg-green-100 text-green-700 border-green-200' :
                    s.termin.status === 'Verschoben' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    s.termin.status === 'Abgesagt' ? 'bg-red-100 text-red-700 border-red-200' :
                    'bg-gray-100 text-gray-600 border-gray-200'
                  }`}>{s.termin.status || 'Unbekannt'}</span>
                </div>
                {s.termin.datum && (
                  <div>
                    <div className="text-purple-400 text-xs">Datum</div>
                    <div className="text-purple-900 font-semibold">{formatDate(s.termin.datum)}</div>
                  </div>
                )}
                {s.termin.zeit && (
                  <div>
                    <div className="text-purple-400 text-xs">Uhrzeit</div>
                    <div className="text-purple-900">{s.termin.zeit}</div>
                  </div>
                )}
                {s.termin.notiz && (
                  <div className="col-span-2">
                    <div className="text-purple-400 text-xs">Notiz</div>
                    <div className="text-purple-900 text-xs whitespace-pre-wrap">{s.termin.notiz}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Akquise-Daten ── */}
          <div className="bg-orange-50/50 rounded-2xl p-4 space-y-2 border border-orange-100">
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
                  <div className="text-gray-900 font-semibold">{s.dvacWeek != null ? Math.round(s.dvacWeek).toLocaleString('de-DE') : '--'}</div>
                </div>
                <div>
                  <div className="text-orange-400 text-xs">dVAC / Monat</div>
                  <div className="text-gray-900 font-semibold">{s.dvacMonth != null ? Math.round(s.dvacMonth).toLocaleString('de-DE') : '--'}</div>
                </div>
              </>)}
              {s.schaufenster && <InfoRow label="Schaufenster" value={s.schaufenster} />}
              {s.frequencyApproval && <InfoRow label="FAW Status" value={s.frequencyApproval} />}
            </div>
          </div>

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
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2 border border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <FileText size={14} /> Dokumente
              </h4>
              <div className="space-y-1.5">
                {resolvedVertragPdf.map((doc, i) => (
                  <a key={`pdf-${i}`} href={doc.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 hover:border-green-300 hover:bg-green-50/50 transition-colors group">
                    <FileText size={14} className="text-green-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-900 truncate">{doc.filename || 'Vertrag PDF'}</div>
                      {doc.size > 0 && <div className="text-[10px] text-gray-400">{(doc.size / 1024).toFixed(0)} KB</div>}
                    </div>
                    <Download size={12} className="text-gray-300 group-hover:text-green-500 shrink-0" />
                  </a>
                ))}
                {resolvedFawData.map((doc, i) => (
                  <a key={`faw-${i}`} href={doc.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50/50 transition-colors group">
                    <FileText size={14} className="text-blue-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-900 truncate">{doc.filename || 'FAW Daten'}</div>
                      {doc.size > 0 && <div className="text-[10px] text-gray-400">{(doc.size / 1024).toFixed(0)} KB</div>}
                    </div>
                    <Download size={12} className="text-gray-300 group-hover:text-blue-500 shrink-0" />
                  </a>
                ))}
                {/* Fallback for URL-only documents (from API responses) */}
                {resolvedVertragPdf.length === 0 && s.vertragPdfUrl && (
                  <a href={s.vertragPdfUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 hover:border-green-300 hover:bg-green-50/50 transition-colors group">
                    <FileText size={14} className="text-green-500 shrink-0" />
                    <div className="text-xs font-medium text-gray-900">Vertrag PDF</div>
                    <Download size={12} className="text-gray-300 group-hover:text-green-500 shrink-0 ml-auto" />
                  </a>
                )}
                {resolvedFawData.length === 0 && s.fawDataUrl && (
                  <a href={s.fawDataUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50/50 transition-colors group">
                    <FileText size={14} className="text-blue-500 shrink-0" />
                    <div className="text-xs font-medium text-gray-900">FAW Daten</div>
                    <Download size={12} className="text-gray-300 group-hover:text-blue-500 shrink-0 ml-auto" />
                  </a>
                )}
              </div>
            </div>
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
                  <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-2.5 border border-sky-100">{s.akquiseKommentar}</div>
                </div>
              )}
              {s.akquiseKommentarUpdate && (
                <div>
                  <div className="text-[10px] font-semibold text-sky-500 uppercase tracking-wider mb-0.5">Akquise Update</div>
                  <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-2.5 border border-sky-100">{s.akquiseKommentarUpdate}</div>
                </div>
              )}
              {s.kommentarInstallationen && (
                <div>
                  <div className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider mb-0.5">Installation</div>
                  <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-2.5 border border-violet-100">{s.kommentarInstallationen}</div>
                </div>
              )}
              {s.frequencyApprovalComment && (
                <div>
                  <div className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-0.5">FAW Kommentar</div>
                  <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-2.5 border border-amber-100">{s.frequencyApprovalComment}</div>
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
        </div>
      </div>
    </div>
  );
}
