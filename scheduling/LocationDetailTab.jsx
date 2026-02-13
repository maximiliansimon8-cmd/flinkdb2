import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, Filter, MapPin, Building2, Phone, Mail, ExternalLink,
  Image as ImageIcon, Camera, FileText, Download, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, X, Loader2, RefreshCw, Calendar, Clock,
  CheckCircle, AlertCircle, AlertTriangle, XCircle, Info, User,
  Wrench, ShieldCheck, FileSignature, MessageSquare, BarChart3,
  Eye, Maximize2, MinusCircle, PlusCircle, Zap, Hash,
} from 'lucide-react';
import { supabase } from '../src/utils/authService.js';

/* =================================================================
   CONSTANTS
   ================================================================= */

const API_DETAIL = '/api/install-booker/detail';

const STATUS_CONFIG = {
  pipeline:     { label: 'Pipeline',       color: 'bg-amber-100 text-amber-700 border-amber-200' },
  bereit:       { label: 'Aufbau bereit',  color: 'bg-green-100 text-green-700 border-green-200' },
  gebucht:      { label: 'Termin gebucht', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  installiert:  { label: 'Installiert',    color: 'bg-purple-100 text-purple-700 border-purple-200' },
  storniert:    { label: 'Storniert',      color: 'bg-red-100 text-red-700 border-red-200' },
  in_pruefung:  { label: 'In Prüfung',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  abgebrochen:  { label: 'Abgebrochen',    color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const STATUS_FILTERS = [
  { value: 'pipeline',     label: 'Pipeline' },
  { value: 'bereit',       label: 'Aufbau bereit' },
  { value: 'gebucht',      label: 'Termin gebucht' },
  { value: 'installiert',  label: 'Installiert' },
  { value: 'abgebrochen',  label: 'Abgebrochen' },
  { value: '',             label: 'Alle' },
];

/* =================================================================
   HELPERS
   ================================================================= */

function formatDate(d) {
  if (!d) return '---';
  return new Date(d).toLocaleDateString('de-DE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDateTime(d) {
  if (!d) return '---';
  return new Date(d).toLocaleString('de-DE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function normalizeStatus(raw, loc) {
  // Determine composite status from Lead_Status + Installations Status + approval_status
  // Real Airtable values:
  //   Lead_Status: "Won / Signed"
  //   approval_status: "Accepted", "Rejected", "In review", "Info required"
  //   Installations Status: "Installiert", "Abgebrochen - Vorort", "Aufbau evtl. Möglich - ...", ""
  //   ready_for_installation: "checked" or empty

  const installStatus = (loc?.installations_status || '').toLowerCase().trim();
  const approvalStatus = (loc?.overall_approval_status || loc?.approval_status || '').toLowerCase().trim();

  // 1. Already installed?
  if (installStatus.startsWith('installiert')) return 'installiert';

  // 2. Aborted / cancelled?
  if (installStatus.startsWith('abgebrochen') || installStatus.startsWith('abbruch')) return 'abgebrochen';

  // 3. Booking confirmed?
  if (loc?.booked_date) return 'gebucht';

  // 4. Check Lead_Status
  if (!raw) return 'in_pruefung';
  const s = raw.toLowerCase().trim();

  // Won / Signed with Accepted approval → Aufbau bereit
  // Won / Signed with In review → Pipeline (waiting for approval)
  if (s === 'won / signed' || s === 'won/signed') {
    if (approvalStatus === 'accepted') return 'bereit';
    if (approvalStatus === 'rejected') return 'abgebrochen';
    if (approvalStatus === 'in review') return 'pipeline';
    return 'pipeline'; // Won but not yet approved (Info required, empty, etc.)
  }

  // Legacy status values (for compatibility)
  if (s === 'installed' || s === 'installiert' || s === 'live') return 'installiert';
  if (s === 'cancelled' || s === 'storniert' || s === 'abgelehnt' || s === 'nicht realisierbar') return 'abgebrochen';
  if (s === 'confirmed' || s === 'gebucht' || s === 'booked' || s === 'installation geplant') return 'gebucht';
  if (s === 'ready for install' || s === 'freigegeben' || s === 'bereit') return 'bereit';
  if (s === 'gewonnen' || s === 'signed' || s === 'won' || s === 'approved') {
    if (approvalStatus === 'accepted') return 'bereit';
    return 'pipeline';
  }

  return 'in_pruefung';
}

function buildAddress(loc) {
  const parts = [];
  if (loc.street) {
    parts.push(loc.street + (loc.street_number ? ' ' + loc.street_number : ''));
  }
  if (loc.plz || loc.city) {
    parts.push([loc.plz, loc.city].filter(Boolean).join(' '));
  }
  return parts.join(', ') || loc.address || '---';
}

function boolDisplay(val) {
  if (val === true || val === 'Ja' || val === 'ja' || val === 'yes' || val === '1' || val === 1) return 'ja';
  if (val === false || val === 'Nein' || val === 'nein' || val === 'no' || val === '0' || val === 0) return 'nein';
  return 'unbekannt';
}

function getImageUrl(img) {
  if (typeof img === 'string') return img;
  if (img?.url) return img.url;
  if (img?.thumbnails?.large?.url) return img.thumbnails.large.url;
  if (img?.thumbnails?.full?.url) return img.thumbnails.full.url;
  return null;
}

function getThumbnailUrl(img) {
  if (typeof img === 'string') return img;
  // Use large thumbnail for clear previews (small is too blurry)
  if (img?.thumbnails?.large?.url) return img.thumbnails.large.url;
  if (img?.thumbnails?.full?.url) return img.thumbnails.full.url;
  if (img?.url) return img.url;
  return null;
}

function getImageFilename(img) {
  if (typeof img === 'string') {
    try { return decodeURIComponent(img.split('/').pop().split('?')[0]); }
    catch { return 'Bild'; }
  }
  return img?.filename || 'Bild';
}

/* =================================================================
   API RECORD TRANSFORMER
   Maps { booking, akquise } from the API into the flat snake_case
   object that the UI components expect.
   ================================================================= */

const KNOWN_CITIES = ['Frankfurt', 'Düsseldorf', 'Köln', 'München', 'Hamburg', 'Berlin'];

function transformApiRecord(record) {
  const { booking, akquise } = record;
  if (!akquise) return null;

  const a = akquise;
  const b = booking || {};

  // Extract first URL from Airtable attachment arrays
  const firstUrl = (arr) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr[0]?.url || null;
  };

  return {
    // Use Airtable record ID as primary id, fallback to booking id
    id: b.id || a.id,
    airtable_id: a.id,
    booking_id: b.id || null,

    // Location basics
    location_name: a.locationName || null,
    name: a.locationName || null,
    jet_id: a.jetId || null,
    street: a.street || null,
    street_number: a.streetNumber || null,
    plz: a.postalCode || null,
    city: a.city || null,

    // Contact
    contact_name: a.contactPerson || null,
    contact_phone: a.contactPhone || null,
    contact_email: a.contactEmail || null,

    // Status
    status: b.status || a.leadStatus || null,
    lead_status: a.leadStatus || null,

    // Installation details
    mount_type: a.mountType || null,
    schaufenster_einsehbar: a.schaufenster || null,
    hindernisse_vorhanden: a.hindernisse || null,
    hindernisse_beschreibung: a.hindernisseBeschreibung || null,
    fensterbreite_ausreichend: a.fensterbreiteAusreichend || null,
    steckdose_mit_strom: a.steckdoseMitStrom || null,

    // Approvals
    frequency_check_status: a.frequencyApproval || null,
    install_approval_status: a.installApproval || null,
    overall_approval_status: a.approvalStatus || null,
    approval_status: a.approvalStatus || null,
    ready_for_installation: a.readyForInstallation || false,

    // Installation status from Airtable
    installations_status: a.installationsStatus || null,
    display_location_status: a.displayLocationStatus || null,

    // Comments
    akquise_comment: a.akquiseKommentar || null,
    akquise_kommentar: a.akquiseKommentar || null,
    akquise_comment_updates: a.akquiseKommentarUpdate || null,
    akquise_kommentar_update: a.akquiseKommentarUpdate || null,
    installation_comment: a.kommentarAusInstallationen || null,
    kommentar_installation: a.kommentarAusInstallationen || null,
    frequency_approval_comment: a.frequencyApprovalComment || null,
    frequency_check_comment: a.frequencyApprovalComment || null,

    // Contract
    vertragsnummer: a.vertragsnummer || null,
    contract_number: a.vertragsnummer || null,
    vertragspartner: a.vertragspartner || null,
    contract_partner: a.vertragspartner || null,
    vertragsbeginn: a.vertragsbeginn || null,
    contract_start: a.vertragsbeginn || null,
    laufzeit: a.laufzeit || null,
    contract_duration: a.laufzeit || null,
    unterschriftsdatum: a.unterschriftsdatum || null,
    signature_date: a.unterschriftsdatum || null,

    // Attachments — extract URL from Airtable attachment arrays
    vertrag_pdf: firstUrl(a.vertragPdf),
    contract_pdf_url: firstUrl(a.vertragPdf),
    faw_data_url: firstUrl(a.fawDataAttachment),
    installationsprotokoll_url: firstUrl(a.installationsprotokoll),

    // Images — keep full array for gallery component
    images_akquise: a.images || [],
    images: a.images || [],

    // Coordinates
    latitude: a.latitude || null,
    longitude: a.longitude || null,
    streetview_link: a.streetviewLink || null,

    // Statistics
    dvac_week: a.dvacWeek || null,
    dvac_per_week: a.dvacWeek || null,
    dvac_month: a.dvacMonth || null,
    dvac_per_month: a.dvacMonth || null,
    dvac_day: a.dvacPerDay || null,
    dvac_per_day: a.dvacPerDay || null,

    // Acquisition
    acquisition_partner: a.acquisitionPartner || null,
    akquise_partner: a.acquisitionPartner || null,
    acquisition_date: a.acquisitionDate || null,
    akquise_date: a.acquisitionDate || null,

    // Booking & Installation
    booked_date: b.booked_date || null,
    booked_time: b.booked_time || null,
    display_name: a.displayName || null,
    do_id: a.doId || null,
    live_since: a.liveSince || null,
    live_date: a.liveSince || null,
    integrator_name: a.integratorName || null,
    installer_team: a.integratorName || null,

    // Keep raw references for potential re-use
    _akquise: a,
    _booking: b.id ? b : null,
  };
}

/* =================================================================
   STATUS BADGE
   ================================================================= */

function StatusBadge({ status, location, size = 'sm' }) {
  const norm = normalizeStatus(status, location);
  const cfg = STATUS_CONFIG[norm] || STATUS_CONFIG.in_pruefung;
  const sizeClasses = size === 'lg'
    ? 'px-3 py-1 text-sm'
    : 'px-2 py-0.5 text-xs';
  const iconSize = size === 'lg' ? 14 : 11;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium border ${cfg.color} ${sizeClasses}`}>
      {norm === 'pipeline' && <ShieldCheck size={iconSize} />}
      {norm === 'bereit' && <CheckCircle size={iconSize} />}
      {norm === 'gebucht' && <Calendar size={iconSize} />}
      {norm === 'installiert' && <Zap size={iconSize} />}
      {norm === 'storniert' && <XCircle size={iconSize} />}
      {norm === 'abgebrochen' && <XCircle size={iconSize} />}
      {norm === 'in_pruefung' && <Clock size={iconSize} />}
      {cfg.label}
    </span>
  );
}

/* =================================================================
   DETAIL SECTION (collapsible)
   ================================================================= */

function DetailSection({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="text-orange-500" />}
          <span className="text-sm font-semibold text-gray-800">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* =================================================================
   IMAGE VIEWER MODAL
   ================================================================= */

function ImageViewerModal({ images, initialIndex, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const containerRef = useRef(null);

  const currentImage = images[currentIndex];
  const imageUrl = getImageUrl(currentImage);
  const filename = getImageFilename(currentImage);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setCurrentIndex(i => (i > 0 ? i - 1 : images.length - 1));
      if (e.key === 'ArrowRight') setCurrentIndex(i => (i < images.length - 1 ? i + 1 : 0));
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={(e) => { if (e.target === containerRef.current) onClose(); }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
      >
        <X size={24} />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-white/10 rounded-full text-white text-sm font-medium">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Previous button */}
      {images.length > 1 && (
        <button
          onClick={() => setCurrentIndex(i => (i > 0 ? i - 1 : images.length - 1))}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Image */}
      <div className="flex flex-col items-center max-w-[90vw] max-h-[85vh]">
        <img
          src={imageUrl}
          alt={filename}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
          draggable={false}
        />
        <div className="mt-3 text-white/70 text-sm text-center truncate max-w-md">
          {filename}
        </div>
      </div>

      {/* Next button */}
      {images.length > 1 && (
        <button
          onClick={() => setCurrentIndex(i => (i < images.length - 1 ? i + 1 : 0))}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <ChevronRight size={28} />
        </button>
      )}
    </div>
  );
}

/* =================================================================
   IMAGE GALLERY
   ================================================================= */

function ImageGallery({ images }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <Camera size={28} className="mb-2" />
        <p className="text-sm">Keine Fotos vorhanden</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((img, idx) => {
          const thumbUrl = getThumbnailUrl(img);
          const filename = getImageFilename(img);
          if (!thumbUrl) return null;
          return (
            <button
              key={idx}
              onClick={() => { setViewerIndex(idx); setViewerOpen(true); }}
              className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200
                         hover:border-orange-300 hover:shadow-md transition-all"
            >
              <img
                src={thumbUrl}
                alt={filename}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <Maximize2 size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="text-white text-[10px] truncate">{filename}</p>
              </div>
            </button>
          );
        })}
      </div>

      {viewerOpen && (
        <ImageViewerModal
          images={images}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}

/* =================================================================
   INFO ROW
   ================================================================= */

function InfoRow({ label, value, icon: Icon, href, type, mono }) {
  const displayValue = value ?? '---';
  const isEmpty = !value || value === '---';

  let valueEl;
  if (href && !isEmpty) {
    valueEl = (
      <a
        href={href}
        target={type === 'tel' || type === 'mailto' ? undefined : '_blank'}
        rel="noopener noreferrer"
        className="text-orange-600 hover:text-orange-700 underline underline-offset-2 break-all"
      >
        {displayValue}
      </a>
    );
  } else {
    valueEl = (
      <span className={`${isEmpty ? 'text-gray-400 italic' : 'text-gray-900'} ${mono ? 'font-mono text-xs' : ''} break-all`}>
        {displayValue}
      </span>
    );
  }

  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon size={14} className="text-gray-400 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        <div className="text-sm mt-0.5">{valueEl}</div>
      </div>
    </div>
  );
}

/* =================================================================
   BOOL INDICATOR
   ================================================================= */

function BoolIndicator({ label, value, description }) {
  const state = boolDisplay(value);
  const colorClass = state === 'ja'
    ? 'bg-green-50 border-green-200 text-green-700'
    : state === 'nein'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-gray-50 border-gray-200 text-gray-500';
  const iconEl = state === 'ja'
    ? <CheckCircle size={14} className="text-green-500" />
    : state === 'nein'
    ? <XCircle size={14} className="text-red-500" />
    : <MinusCircle size={14} className="text-gray-400" />;

  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${colorClass}`}>
      <div className="mt-0.5 shrink-0">{iconEl}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {state === 'ja' && <span className="text-xs">Ja</span>}
        {state === 'nein' && <span className="text-xs">Nein</span>}
        {state === 'unbekannt' && <span className="text-xs italic">Unbekannt</span>}
        {description && state === 'nein' && (
          <p className="text-xs mt-1 opacity-80">{description}</p>
        )}
      </div>
    </div>
  );
}

/* =================================================================
   APPROVAL ROW
   ================================================================= */

function ApprovalRow({ label, status, comment }) {
  const s = (status || '').toLowerCase();
  const isApproved = s === 'approved' || s === 'accepted' || s === 'ja' || status === true;
  const isRejected = s === 'rejected' || s === 'nein' || s === 'abgelehnt' || status === false;
  const isPending = !isApproved && !isRejected;

  const colorClass = isApproved
    ? 'text-green-600'
    : isRejected
    ? 'text-red-600'
    : 'text-yellow-600';
  const bgClass = isApproved
    ? 'bg-green-50'
    : isRejected
    ? 'bg-red-50'
    : 'bg-yellow-50';
  const icon = isApproved
    ? <CheckCircle size={14} />
    : isRejected
    ? <XCircle size={14} />
    : <Clock size={14} />;
  const statusText = isApproved ? 'Genehmigt' : isRejected ? 'Abgelehnt' : 'Ausstehend';

  return (
    <div className={`p-3 rounded-lg ${bgClass}`}>
      <div className="flex items-center gap-2">
        <span className={colorClass}>{icon}</span>
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className={`ml-auto text-xs font-medium ${colorClass}`}>{statusText}</span>
      </div>
      {comment && (
        <p className="text-xs text-gray-600 mt-1.5 ml-6 italic">"{comment}"</p>
      )}
    </div>
  );
}

/* =================================================================
   COMMENT CARD
   ================================================================= */

function CommentCard({ label, text, timestamp }) {
  if (!text) return null;
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
        {timestamp && (
          <span className="text-[10px] text-gray-400">{formatDateTime(timestamp)}</span>
        )}
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{text}</p>
    </div>
  );
}

/* =================================================================
   LOCATION CARD (list item)
   ================================================================= */

function LocationCard({ location, isSelected, onClick }) {
  const status = normalizeStatus(location.status || location.lead_status, location);
  const hasImages = location.images_akquise?.length > 0;
  const thumbUrl = hasImages ? getThumbnailUrl(location.images_akquise[0]) : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isSelected
          ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        {thumbUrl ? (
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
            <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-gray-400" />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">
            {location.location_name || location.name || 'Unbekannter Standort'}
          </h3>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {buildAddress(location)}
          </p>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusBadge status={location.status || location.lead_status} location={location} />
            {location.booked_date && (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                <Calendar size={9} />
                {formatDate(location.booked_date)}
                {location.booked_time && ` ${location.booked_time}`}
              </span>
            )}
            {hasImages && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                <Camera size={9} /> {location.images_akquise.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/* =================================================================
   LOCATION DETAIL (right panel)
   ================================================================= */

function LocationDetail({ location, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <span className="text-sm text-gray-500">Details werden geladen...</span>
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-gray-400">
        <Building2 size={48} className="mb-3" />
        <p className="font-medium text-lg">Kein Standort ausgewaehlt</p>
        <p className="text-sm mt-1">Waehle einen Standort aus der Liste, um die Details anzuzeigen.</p>
      </div>
    );
  }

  const loc = location;

  // Build Google Streetview link from coords
  const streetviewLink = (loc.latitude && loc.longitude)
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.latitude},${loc.longitude}`
    : loc.streetview_link || null;

  // Build Google Maps link from address or coords
  const googleMapsLink = (loc.latitude && loc.longitude)
    ? `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`
    : (loc.street && loc.city)
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${loc.street}${loc.street_number ? ' ' + loc.street_number : ''}, ${loc.plz || ''} ${loc.city}`
        )}`
      : null;

  // Mount type icon
  const mountTypeIcon = (type) => {
    if (!type) return null;
    const t = type.toLowerCase();
    if (t.includes('wand')) return 'Wandmontage';
    if (t.includes('boden')) return 'Bodenmontage';
    if (t.includes('decke')) return 'Deckenmontage';
    return type;
  };

  // Determine images
  const images = loc.images_akquise || loc.images || [];

  // Determine approval readiness based on actual status
  const currentStatus = normalizeStatus(loc.status || loc.lead_status, loc);
  const isReadyForInstall = currentStatus === 'bereit' || loc.ready_for_installation;

  return (
    <div className="space-y-4 pb-8">
      {/* Detail Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {loc.location_name || loc.name || 'Standort'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{buildAddress(loc)}</p>
          </div>
          <StatusBadge status={loc.status || loc.lead_status} location={loc} size="lg" />
        </div>

        {loc.jet_id && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
            <Hash size={12} /> JET ID: <span className="font-mono font-medium text-gray-700">{loc.jet_id}</span>
          </div>
        )}

        {isReadyForInstall && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs font-medium">
            <ShieldCheck size={13} /> Bereit für Installation
          </div>
        )}
      </div>

      {/* Section A: Standort-Uebersicht */}
      <DetailSection title="Standort-Uebersicht" icon={MapPin} defaultOpen={true}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <InfoRow label="Standortname" value={loc.location_name || loc.name} icon={Building2} />
          <InfoRow label="JET ID" value={loc.jet_id} icon={Hash} mono />
          <InfoRow label="Strasse" value={loc.street ? `${loc.street}${loc.street_number ? ' ' + loc.street_number : ''}` : null} icon={MapPin} />
          <InfoRow label="PLZ / Stadt" value={[loc.plz, loc.city].filter(Boolean).join(' ') || null} icon={Building2} />
          <InfoRow
            label="Google Streetview"
            value={streetviewLink ? 'Streetview oeffnen' : null}
            href={streetviewLink}
            icon={ExternalLink}
          />
          <InfoRow
            label="Google Maps"
            value={googleMapsLink ? 'In Maps oeffnen' : null}
            href={googleMapsLink}
            icon={MapPin}
          />
          <InfoRow label="Koordinaten" value={loc.latitude && loc.longitude ? `${loc.latitude}, ${loc.longitude}` : null} icon={MapPin} mono />
        </div>

        {/* Contact info */}
        {(loc.contact_name || loc.contact_phone || loc.contact_email) && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Kontakt</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <InfoRow label="Name" value={loc.contact_name} icon={User} />
              <InfoRow
                label="Telefon"
                value={loc.contact_phone}
                href={loc.contact_phone ? `tel:${loc.contact_phone}` : null}
                type="tel"
                icon={Phone}
                mono
              />
              <InfoRow
                label="E-Mail"
                value={loc.contact_email}
                href={loc.contact_email ? `mailto:${loc.contact_email}` : null}
                type="mailto"
                icon={Mail}
              />
            </div>
          </div>
        )}
      </DetailSection>

      {/* Section B: Fotos */}
      <DetailSection title={`Fotos (${images.length})`} icon={Camera} defaultOpen={images.length > 0}>
        <ImageGallery images={images} />
      </DetailSection>

      {/* Section C: Installationsdetails */}
      <DetailSection title="Installationsdetails" icon={Wrench} defaultOpen={true}>
        <div className="space-y-2">
          {/* Mount type */}
          {loc.mount_type && (
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <Wrench size={14} className="text-orange-500" />
              <span className="text-sm font-medium text-orange-800">
                Montageart: {mountTypeIcon(loc.mount_type)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <BoolIndicator label="Schaufenster einsehbar" value={loc.schaufenster_einsehbar} />
            <BoolIndicator label="Fensterbreite ausreichend" value={loc.fensterbreite_ausreichend} />
            <BoolIndicator label="Hindernisse vorhanden" value={loc.hindernisse_vorhanden} description={loc.hindernisse_beschreibung} />
            <BoolIndicator label="Steckdose mit Strom" value={loc.steckdose_mit_strom} />
          </div>
        </div>
      </DetailSection>

      {/* Section D: Genehmigungen */}
      <DetailSection title="Genehmigungen" icon={ShieldCheck} defaultOpen={true}>
        <div className="space-y-2">
          <ApprovalRow
            label="Frequenz-Check"
            status={loc.frequency_check_status}
            comment={loc.frequency_check_comment || loc.frequency_approval_comment}
          />
          <ApprovalRow
            label="Install Approval"
            status={loc.install_approval_status}
            comment={loc.install_approval_comment}
          />
          <ApprovalRow
            label="Gesamtstatus"
            status={isReadyForInstall ? 'approved' : (loc.overall_approval_status || null)}
            comment={loc.overall_approval_comment}
          />
        </div>
      </DetailSection>

      {/* Section E: Vertrag */}
      <DetailSection title="Vertrag" icon={FileSignature} defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <InfoRow label="Vertragsnummer" value={loc.vertragsnummer || loc.contract_number} icon={FileText} mono />
          <InfoRow label="Vertragspartner" value={loc.vertragspartner || loc.contract_partner} icon={User} />
          <InfoRow label="Vertragsbeginn" value={formatDate(loc.vertragsbeginn || loc.contract_start)} icon={Calendar} />
          <InfoRow label="Laufzeit" value={loc.laufzeit || loc.contract_duration} icon={Clock} />
          <InfoRow label="Unterschriftsdatum" value={formatDate(loc.unterschriftsdatum || loc.signature_date)} icon={FileSignature} />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {(loc.vertrag_pdf || loc.contract_pdf_url) && (
            <a
              href={loc.vertrag_pdf || loc.contract_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200
                         text-orange-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Download size={14} /> Vertrag PDF
            </a>
          )}
          {(loc.faw_data_url || loc.faw_download) && (
            <a
              href={loc.faw_data_url || loc.faw_download}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200
                         text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Download size={14} /> FAW Daten
            </a>
          )}
          {!loc.vertrag_pdf && !loc.contract_pdf_url && !loc.faw_data_url && !loc.faw_download && (
            <p className="text-sm text-gray-400 italic">Keine Dokumente vorhanden</p>
          )}
        </div>
      </DetailSection>

      {/* Section F: Kommentare */}
      <DetailSection title="Kommentare" icon={MessageSquare} defaultOpen={false}>
        <div className="space-y-3">
          <CommentCard
            label="Akquise Kommentar"
            text={loc.akquise_comment || loc.akquise_kommentar}
            timestamp={loc.akquise_comment_date}
          />
          <CommentCard
            label="Akquise Update"
            text={loc.akquise_comment_updates || loc.akquise_kommentar_update}
            timestamp={loc.akquise_update_date}
          />
          <CommentCard
            label="Kommentar aus Installationen"
            text={loc.installation_comment || loc.kommentar_installation}
            timestamp={loc.installation_comment_date}
          />
          <CommentCard
            label="Frequenz Approval Kommentar"
            text={loc.frequency_approval_comment || loc.frequency_check_comment}
            timestamp={loc.frequency_approval_date}
          />
          <CommentCard
            label="Allgemeine Notizen"
            text={loc.notes || loc.phone_notes}
          />
          {!loc.akquise_comment && !loc.akquise_kommentar && !loc.akquise_comment_updates &&
           !loc.akquise_kommentar_update && !loc.installation_comment && !loc.kommentar_installation &&
           !loc.frequency_approval_comment && !loc.frequency_check_comment && !loc.notes && !loc.phone_notes && (
            <p className="text-sm text-gray-400 italic text-center py-4">Keine Kommentare vorhanden</p>
          )}
        </div>
      </DetailSection>

      {/* Section G: Buchung & Installation */}
      <DetailSection title="Buchung & Installation" icon={Calendar} defaultOpen={true}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <InfoRow label="Status" value={loc.status || loc.lead_status || null} icon={CheckCircle} />
          <InfoRow label="Buchungsdatum" value={formatDate(loc.booked_date)} icon={Calendar} />
          <InfoRow label="Buchungszeit" value={loc.booked_time ? `${loc.booked_time} Uhr` : null} icon={Clock} />
          <InfoRow label="Integrator" value={loc.integrator_name || loc.installer_team} icon={User} />
          <InfoRow label="Display Name" value={loc.display_name} icon={Building2} />
          <InfoRow label="DO-ID" value={loc.do_id} icon={Hash} mono />
          <InfoRow label="Live seit" value={formatDate(loc.live_since || loc.live_date)} icon={Zap} />
        </div>

        {(loc.installationsprotokoll_url || loc.install_protocol_url) && (
          <div className="mt-4">
            <a
              href={loc.installationsprotokoll_url || loc.install_protocol_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200
                         text-purple-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Download size={14} /> Installationsprotokoll
            </a>
          </div>
        )}
      </DetailSection>

      {/* Section H: Statistiken */}
      <DetailSection title="Statistiken" icon={BarChart3} defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="dVAC / Woche" value={loc.dvac_week ?? loc.dvac_per_week} />
          <StatCard label="dVAC / Monat" value={loc.dvac_month ?? loc.dvac_per_month} />
          <StatCard label="dVAC / Tag" value={loc.dvac_day ?? loc.dvac_per_day} />
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <InfoRow label="Akquise-Partner" value={loc.acquisition_partner || loc.akquise_partner} icon={User} />
          <InfoRow label="Akquise-Datum" value={formatDate(loc.acquisition_date || loc.akquise_date)} icon={Calendar} />
        </div>
      </DetailSection>
    </div>
  );
}

/* =================================================================
   STAT CARD
   ================================================================= */

function StatCard({ label, value }) {
  const displayValue = value != null ? (typeof value === 'number' ? value.toLocaleString('de-DE') : value) : '---';
  const isEmpty = value == null;

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 text-center">
      <div className="text-xs text-gray-500 font-medium mb-1">{label}</div>
      <div className={`text-xl font-bold ${isEmpty ? 'text-gray-300' : 'text-gray-900'}`}>
        {displayValue}
      </div>
    </div>
  );
}

/* =================================================================
   MAIN COMPONENT: LocationDetailTab
   ================================================================= */

export default function LocationDetailTab({ initialLocationId, initialLocationName }) {
  // Data state
  const [locations, setLocations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState(initialLocationName || '');
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState('pipeline');

  // Mobile detail view
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const detailPanelRef = useRef(null);

  /* -- Data Fetching --------------------------------------------------- */

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get Supabase auth token for API calls
      let token = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || null;
      } catch {
        console.warn('[LocationDetailTab] Could not get auth session');
      }

      if (!token) {
        console.warn('[LocationDetailTab] No auth token available — API calls will fail');
      }

      // Always load ALL ready records; city filtering is done client-side
      const apiUrl = `${API_DETAIL}?all=ready`;

      let apiData = null;
      try {
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(apiUrl, { headers });
        if (res.ok) {
          const json = await res.json();
          // API returns { total, bookingsCount, records: [{ booking, akquise }] }
          const records = json.records || [];
          apiData = records
            .map(transformApiRecord)
            .filter(Boolean); // Remove nulls (records without akquise data)
        } else {
          const errText = await res.text();
          console.warn(`[LocationDetailTab] API returned ${res.status}: ${errText}`);
        }
      } catch (e) {
        console.warn('[LocationDetailTab] API call failed:', e.message);
        // API not available, fall through to Supabase fallback
      }

      if (apiData && apiData.length > 0) {
        console.log(`[LocationDetailTab] Loaded ${apiData.length} locations from Airtable API`);
        setLocations(apiData);
      } else {
        // Fallback: load from Supabase (may only have test data)
        console.warn('[LocationDetailTab] Falling back to Supabase install_bookings');
        const { data, error: sbError } = await supabase
          .from('install_bookings')
          .select('*')
          .order('created_at', { ascending: false });

        if (sbError) throw sbError;
        setLocations(data || []);
      }
    } catch (e) {
      console.error('Failed to fetch locations:', e);
      setError('Fehler beim Laden der Standorte: ' + (e.message || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies — loads all data once; city filtering is client-side

  const fetchLocationDetail = useCallback(async (loc) => {
    setDetailLoading(true);
    setSelectedDetail(null);

    try {
      // The initial fetchLocations already loads full Airtable data (images, PDFs, etc.)
      // so we can use the location data directly.
      // If there's a booking_id, optionally refetch for fresh attachment URLs.
      const bookingId = loc.booking_id;

      if (bookingId) {
        try {
          let token = null;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            token = session?.access_token || null;
          } catch { /* ignore */ }

          const headers = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`${API_DETAIL}?bookingId=${encodeURIComponent(bookingId)}`, { headers });
          if (res.ok) {
            const json = await res.json();
            // API returns { booking, akquise } for single booking
            if (json.akquise || json.booking) {
              const freshData = transformApiRecord({ booking: json.booking, akquise: json.akquise });
              if (freshData) {
                setSelectedDetail({ ...loc, ...freshData });
                return;
              }
            }
          }
        } catch (e) {
          console.warn('[LocationDetailTab] Detail API call failed, using cached data:', e.message);
        }
      }

      // Use the already-loaded data directly (which is already fully transformed)
      setSelectedDetail(loc);
    } catch (e) {
      console.error('Failed to fetch detail:', e);
      setSelectedDetail(loc); // Fallback to local data
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Auto-select location when navigated from another tab
  useEffect(() => {
    if (initialLocationId && locations.length > 0) {
      const target = locations.find(l =>
        l.id === initialLocationId ||
        l.airtable_id === initialLocationId ||
        l.booking_id === initialLocationId ||
        (l.location_name || '').toLowerCase() === (initialLocationName || '').toLowerCase()
      );
      if (target) {
        handleSelect(target);
      }
    }
  }, [initialLocationId, locations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -- Selection ------------------------------------------------------- */

  const handleSelect = useCallback((loc) => {
    setSelectedId(loc.id);
    fetchLocationDetail(loc);
    setMobileDetailOpen(true);

    // Scroll detail panel to top on desktop
    if (detailPanelRef.current) {
      detailPanelRef.current.scrollTop = 0;
    }
  }, [fetchLocationDetail]);

  /* -- Filtering ------------------------------------------------------- */

  const cities = useMemo(() =>
    [...new Set(locations.map(l => l.city).filter(Boolean))].sort(),
  [locations]);

  const filtered = useMemo(() => {
    let result = locations;

    // Search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        (l.location_name || l.name || '').toLowerCase().includes(s) ||
        (l.city || '').toLowerCase().includes(s) ||
        (l.jet_id || '').toLowerCase().includes(s) ||
        (l.street || '').toLowerCase().includes(s) ||
        (l.contact_name || '').toLowerCase().includes(s)
      );
    }

    // City
    if (filterCity) {
      result = result.filter(l => l.city === filterCity);
    }

    // Status
    if (filterStatus) {
      result = result.filter(l => normalizeStatus(l.status || l.lead_status, l) === filterStatus);
    }

    return result;
  }, [locations, search, filterCity, filterStatus]);

  /* -- Stats ----------------------------------------------------------- */

  const stats = useMemo(() => {
    const statuses = locations.map(l => normalizeStatus(l.status || l.lead_status, l));
    return {
      total: locations.length,
      pipeline: statuses.filter(s => s === 'pipeline').length,
      bereit: statuses.filter(s => s === 'bereit').length,
      gebucht: statuses.filter(s => s === 'gebucht').length,
      installiert: statuses.filter(s => s === 'installiert').length,
      abgebrochen: statuses.filter(s => s === 'abgebrochen').length,
    };
  }, [locations]);

  /* -- Render ---------------------------------------------------------- */

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Aufbau-Details</h2>
          <p className="text-gray-500 mt-1 text-sm">
            Standorte mit allen Akquise-Details und Dokumenten
          </p>
        </div>
        <button
          onClick={fetchLocations}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50
                     text-gray-700 text-sm font-medium disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <div className="flex items-center gap-2 text-amber-600 text-xs font-medium mb-1">
            <ShieldCheck size={14} /> Pipeline
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.pipeline}</div>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 text-green-600 text-xs font-medium mb-1">
            <CheckCircle size={14} /> Aufbau bereit
          </div>
          <div className="text-2xl font-bold text-green-600">{stats.bereit}</div>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 text-blue-600 text-xs font-medium mb-1">
            <Calendar size={14} /> Termin gebucht
          </div>
          <div className="text-2xl font-bold text-blue-600">{stats.gebucht}</div>
        </div>
        <div className="bg-white rounded-xl border border-purple-200 p-4">
          <div className="flex items-center gap-2 text-purple-600 text-xs font-medium mb-1">
            <Zap size={14} /> Installiert
          </div>
          <div className="text-2xl font-bold text-purple-600">{stats.installiert}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Standort, Stadt oder JET ID suchen..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none
                       focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 text-sm transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* City filter */}
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-orange-400
                     text-sm bg-white min-w-[140px] transition-colors"
        >
          <option value="">Alle Staedte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Status filter tabs */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterStatus === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Fehler beim Laden</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Main Content: List + Detail side by side */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          <span className="text-sm">Standorte werden geladen...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-xl border border-gray-200">
          <Building2 size={36} className="mb-2" />
          <p className="font-medium text-base">Keine Standorte gefunden</p>
          <p className="text-sm mt-1">
            {search || filterCity || filterStatus
              ? 'Versuche andere Filtereinstellungen.'
              : 'Derzeit keine Standorte vorhanden.'}
          </p>
        </div>
      ) : (
        <div className="flex gap-5 items-start relative">
          {/* Left: Location List */}
          <div className={`w-full lg:w-1/3 space-y-2 ${mobileDetailOpen ? 'hidden lg:block' : 'block'}`}>
            <div className="text-xs text-gray-500 mb-2 px-1">
              {filtered.length} von {locations.length} Standorten
            </div>
            <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1 scrollbar-thin">
              {filtered.map(loc => (
                <LocationCard
                  key={loc.id || loc.jet_id || Math.random()}
                  location={loc}
                  isSelected={selectedId === loc.id}
                  onClick={() => handleSelect(loc)}
                />
              ))}
            </div>
          </div>

          {/* Right: Detail Panel */}
          <div
            ref={detailPanelRef}
            className={`w-full lg:w-2/3 lg:sticky lg:top-[140px] max-h-[calc(100vh-180px)] overflow-y-auto
                        scrollbar-thin ${mobileDetailOpen ? 'block' : 'hidden lg:block'}`}
          >
            {/* Mobile back button */}
            {mobileDetailOpen && (
              <button
                onClick={() => setMobileDetailOpen(false)}
                className="lg:hidden flex items-center gap-1.5 mb-3 px-3 py-2 text-sm text-gray-600
                           bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={16} />
                Zurueck zur Liste
              </button>
            )}

            <LocationDetail
              location={selectedDetail}
              loading={detailLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
}
