import React, { useState, useMemo } from 'react';
import {
  Database, Search, ChevronDown, ChevronRight, Info,
  AlertTriangle, Code, Zap, BarChart3, Shield,
  ArrowRight, Hash, Layers, CheckCircle2, Calculator,
  Filter, TrendingUp,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   INSTALLATION DATA DICTIONARY
   Zeigt alle Felder, Predicates, KPIs und Thresholds
   die im Installations-Modul verwendet werden.
   ═══════════════════════════════════════════════════════════════════ */

// ─── Predicate Definitions (from src/metrics/predicates.js) ─────
const PREDICATES = [
  {
    id: 'isStorno',
    name: 'isStorno(record)',
    description: 'Prueft ob ein Akquise-Record storniert / abgebrochen ist',
    source: 'src/metrics/predicates.js',
    usedIn: ['ExecutiveDashboard', 'InviteManager', 'PhoneWorkbench', 'MapView', 'AcquisitionDashboard', 'chatContext'],
    logic: [
      { condition: 'akquiseStorno === true/\"true\"', field: 'akquise_storno', origin: 'Airtable: Akquise Storno', airtableTable: 'Acquisition_DB', airtableField: 'Akquise Storno', meaning: 'Stornierung VOR Installation (Akquise-Phase)' },
      { condition: 'postInstallStorno === true/\"true\"', field: 'post_install_storno', origin: 'Airtable: Post\u2011Install Storno', airtableTable: 'Acquisition_DB', airtableField: 'Post\u2011Install Storno', meaning: 'Stornierung NACH Installation (Kuendigung/Abbau)' },
      { condition: 'leadStatus includes storno/cancelled/lost', field: 'lead_status', origin: 'Airtable: Lead_Status', airtableTable: 'Acquisition_DB', airtableField: 'Lead_Status', meaning: 'Status-basierter Fallback (Pipeline-Status)' },
    ],
    returnType: 'boolean',
    notes: 'ODER-Verknuepfung: Einer der 3 Checks reicht. akquiseStorno kann String "true" oder Boolean true sein.',
  },
  {
    id: 'isAlreadyInstalled',
    name: 'isAlreadyInstalled(record)',
    description: 'Prueft ob ein Standort bereits installiert / live ist',
    source: 'src/metrics/predicates.js',
    usedIn: ['ExecutiveDashboard', 'InviteManager', 'PhoneWorkbench', 'MapView', 'AcquisitionDashboard', 'chatContext'],
    logic: [
      { condition: 'installationsStatus includes installiert/live/abgebrochen', field: 'installations_status', origin: 'Airtable: Installations Status', airtableTable: 'Acquisition_DB', airtableField: 'Installations Status', meaning: 'Status der verknuepften Installation (inkl. abgebrochene)' },
      { condition: 'leadStatus === live', field: 'lead_status', origin: 'Airtable: Lead_Status', airtableTable: 'Acquisition_DB', airtableField: 'Lead_Status', meaning: 'Pipeline-Status ist Live' },
      { condition: 'leadStatus === installation', field: 'lead_status', origin: 'Airtable: Lead_Status', airtableTable: 'Acquisition_DB', airtableField: 'Lead_Status', meaning: 'In der Installationsphase' },
      { condition: 'displayLocationStatus hat Eintraege', field: 'display_location_status', origin: 'Airtable: Display Location Status', airtableTable: 'Acquisition_DB', airtableField: 'Display Location Status', meaning: 'Mindestens ein Display-Standort verknuepft' },
    ],
    returnType: 'boolean',
    notes: 'KANONISCHE VERSION = breitester Check (Union aller Varianten). Schliesst installiert, live UND abgebrochen ein — abgebrochene Installationen sollen nicht erneut im Aufbau-Pool landen.',
  },
  {
    id: 'isReadyForInstall',
    name: 'isReadyForInstall(record)',
    description: 'Prueft ob ein Record aufbaubereit ist (Won/Signed + Approved + Vertrag)',
    source: 'src/metrics/predicates.js',
    usedIn: ['ExecutiveDashboard', 'InviteManager', 'PhoneWorkbench', 'MapView'],
    logic: [
      { condition: 'leadStatus === "Won / Signed"', field: 'lead_status', origin: 'Airtable: Lead_Status', airtableTable: 'Acquisition_DB', airtableField: 'Lead_Status', meaning: 'Vertrag unterschrieben (Pipeline-Status)' },
      { condition: 'approvalStatus === "Accepted" / "Approved"', field: 'approval_status', origin: 'Airtable: approval_status', airtableTable: 'Acquisition_DB', airtableField: 'approval_status', meaning: 'Genehmigung erteilt (Hausverwaltung/Eigentuemer)' },
      { condition: 'vertragVorhanden === true/"true"/"checked"/"YES"', field: 'vertrag_vorhanden', origin: 'Airtable: Vertrag PDF vorhanden', airtableTable: 'Acquisition_DB', airtableField: 'Vertrag PDF vorhanden', meaning: 'Unterschriebener Vertrag liegt als PDF vor (DB-Wert: "YES")' },
    ],
    returnType: 'boolean',
    notes: 'UND-Verknuepfung: ALLE 3 Bedingungen muessen erfuellt sein. Storno- und Bereits-installiert-Checks werden vom Aufrufer durchgefuehrt (isStorno, isAlreadyInstalled).',
  },
];

// ─── Threshold Constants (from src/metrics/constants.js) ─────
const THRESHOLDS = [
  {
    id: 'PENDING_NO_RESPONSE_HOURS',
    name: 'PENDING_NO_RESPONSE_HOURS',
    value: '48 Stunden',
    source: 'src/metrics/constants.js → OVERDUE_THRESHOLDS',
    meaning: 'WhatsApp-Einladung ohne Antwort: Ab 48h als ueberfaellig markiert',
    usedIn: ['BookingsDashboard', 'ExecutiveDashboard', 'PhoneWorkbench'],
    severity: 'warning (gelb)',
  },
  {
    id: 'UNCONFIRMED_BEFORE_INSTALL_HOURS',
    name: 'UNCONFIRMED_BEFORE_INSTALL_HOURS',
    value: '24 Stunden',
    source: 'src/metrics/constants.js → OVERDUE_THRESHOLDS',
    meaning: 'Gebuchter Termin nicht bestaetigt: Ab <24h vor Termin als kritisch markiert',
    usedIn: ['BookingsDashboard', 'ExecutiveDashboard'],
    severity: 'critical (rot)',
  },
  {
    id: 'CONFIRMATION_CALL_WITHIN_HOURS',
    name: 'CONFIRMATION_CALL_WITHIN_HOURS',
    value: '72 Stunden',
    source: 'src/metrics/constants.js → OVERDUE_THRESHOLDS',
    meaning: 'Bestaetigungsanruf noetig wenn Termin in weniger als 72h',
    usedIn: ['PhoneWorkbench'],
    severity: 'info (blau)',
  },
  {
    id: 'WEEKLY_BUILD_TARGET',
    name: 'WEEKLY_BUILD_TARGET',
    value: '25 Installationen/Woche',
    source: 'src/metrics/constants.js',
    meaning: 'Wochenziel fuer neue Installationen. Basis fuer Pipeline-Planung.',
    usedIn: ['AcquisitionDashboard', 'ExecutiveDashboard'],
    severity: 'Zielwert',
  },
];

// ─── Field Origins (Akquise-relevante Felder) ─────
const FIELD_ORIGINS = [
  { frontend: 'leadStatus', supabase: 'lead_status', airtable: 'Lead_Status', type: 'text', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Akquise-Pipeline-Status', values: 'New Lead → Contacted → Frequency Check → Approved → Ready for Install → Installation → Live' },
  { frontend: 'akquiseStorno', supabase: 'akquise_storno', airtable: 'Akquise Storno', type: 'boolean/text', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Stornierung vor Installation', values: 'true/false oder "true"/"false"' },
  { frontend: 'postInstallStorno', supabase: 'post_install_storno', airtable: 'Post\u2011Install Storno', type: 'boolean/text', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Stornierung nach Installation', values: 'true/false (ACHTUNG: Non-Breaking Hyphen U+2011 im Airtable-Feldnamen)' },
  { frontend: 'readyForInstallation', supabase: 'ready_for_installation', airtable: 'Ready for Installation (Formel)', type: 'boolean', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Airtable Formelfeld (NICHT MEHR als Predicate verwendet — ersetzt durch leadStatus + approvalStatus)', values: 'true = bereit, false/null = nicht bereit' },
  { frontend: 'installationsStatus', supabase: 'installations_status', airtable: 'Installations Status', type: 'array', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Status der verknuepften Installation(en)', values: '["Installiert", "In Planung", "Abgerufen", "Live"]' },
  { frontend: 'displayLocationStatus', supabase: 'display_location_status', airtable: 'Display Location Status', type: 'array', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Status des Display-Standorts', values: 'Array mit Display-Standort-Namen (leer = kein Display zugeordnet)' },
  { frontend: 'approvalStatus', supabase: 'approval_status', airtable: 'approval_status', type: 'text', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Genehmigungsstatus', values: 'Accepted, Rejected, In review, Info required' },
  { frontend: 'vertragVorhanden', supabase: 'vertrag_vorhanden', airtable: 'Vertrag PDF vorhanden', type: 'text', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Ob ein unterschriebener Vertrag vorliegt', values: 'true/false/"checked"' },
  { frontend: 'contactPerson', supabase: 'contact_person', airtable: 'Contact Person', type: 'text', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Ansprechpartner am Standort', values: 'Freitext' },
  { frontend: 'contactPhone', supabase: 'contact_phone', airtable: 'Contact Phone', type: 'text', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Telefonnummer des Ansprechpartners', values: '+49... Format' },
  { frontend: 'city', supabase: 'city', airtable: 'City', type: 'array', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Stadt(e) des Standorts', values: 'Array: ["Berlin"], ["Frankfurt"]' },
  { frontend: 'dvacWeek', supabase: 'dvac_week', airtable: '# dVAC / Woche 100% SoV', type: 'number', supabaseTable: 'acquisition', airtableTable: 'Acquisition_DB',
    description: 'Digital Views Ad Contacts pro Woche', values: 'Ganzzahl (z.B. 1200)' },
];

// ─── Berechnete KPIs ─────
const COMPUTED_KPIS = [
  {
    id: 'conversionRate',
    name: 'Konversionsrate (Einladung → Buchung)',
    formula: '(booked + confirmed + completed) / (pending + booked + confirmed + completed) × 100',
    unit: '%',
    source: 'src/metrics/computations/installation.js → computeConversionRate()',
    dataSource: 'Supabase: install_bookings',
    inputFields: [
      { field: 'status', table: 'install_bookings', description: 'Booking-Status (pending/booked/confirmed/completed/cancelled/no_show)' },
    ],
    filters: ['cancelled und no_show werden aus dem Nenner ausgeschlossen (haben den Funnel verlassen)'],
    usedIn: ['ExecutiveDashboard'],
    category: 'booking',
  },
  {
    id: 'noShowRate',
    name: 'No-Show-Rate',
    formula: 'noShow / (completed + noShow) × 100',
    unit: '%',
    source: 'src/metrics/computations/installation.js → computeNoShowRate()',
    dataSource: 'Supabase: install_bookings',
    inputFields: [
      { field: 'status', table: 'install_bookings', description: 'Nur Bookings die den Termin erreicht haben (completed + no_show)' },
    ],
    filters: ['Nur Bookings im Endstatus (completed oder no_show)', 'pending/booked/confirmed/cancelled ignoriert'],
    usedIn: ['ExecutiveDashboard'],
    category: 'booking',
  },
  {
    id: 'overdueCount',
    name: 'Ueberfaellige Buchungen',
    formula: 'COUNT(pending mit whatsapp_sent_at > 48h AGO) + COUNT(booked mit booked_date < 24h AHEAD)',
    unit: 'Anzahl',
    source: 'src/metrics/computations/installation.js → getOverdueInfo()',
    dataSource: 'Supabase: install_bookings',
    inputFields: [
      { field: 'status', table: 'install_bookings', description: 'pending oder booked' },
      { field: 'whatsapp_sent_at', table: 'install_bookings', description: 'Zeitpunkt der WhatsApp-Einladung' },
      { field: 'booked_date', table: 'install_bookings', description: 'Geplantes Installationsdatum' },
    ],
    filters: [
      'Pending: whatsapp_sent_at > PENDING_NO_RESPONSE_HOURS (48h) ago → warning (gelb)',
      'Booked: booked_date < UNCONFIRMED_BEFORE_INSTALL_HOURS (24h) ahead → critical (rot)',
    ],
    usedIn: ['ExecutiveDashboard', 'BookingsDashboard', 'PhoneWorkbench'],
    category: 'booking',
  },
  {
    id: 'avgTimeToBook',
    name: 'Durchschn. Zeit bis Buchung',
    formula: 'AVG(booked_at - whatsapp_sent_at) fuer alle Bookings mit beiden Timestamps',
    unit: 'Stunden',
    source: 'InstallationExecutiveDashboard (inline)',
    dataSource: 'Supabase: install_bookings',
    inputFields: [
      { field: 'whatsapp_sent_at', table: 'install_bookings', description: 'Wann die Einladung gesendet wurde' },
      { field: 'booked_at', table: 'install_bookings', description: 'Wann die Buchung erfolgte' },
    ],
    filters: ['Nur Bookings bei denen BEIDE Timestamps vorhanden sind'],
    usedIn: ['ExecutiveDashboard'],
    category: 'booking',
  },
  {
    id: 'capacityUtil',
    name: 'Kapazitaetsauslastung',
    formula: 'COUNT(bookings mit route_id + status in [booked,confirmed,completed]) / SUM(route.max_capacity) × 100',
    unit: '%',
    source: 'InstallationExecutiveDashboard (inline)',
    dataSource: 'Supabase: install_bookings + install_schedule',
    inputFields: [
      { field: 'route_id', table: 'install_bookings', description: 'Zugeordnete Route' },
      { field: 'status', table: 'install_bookings', description: 'booked/confirmed/completed = belegt' },
      { field: 'max_capacity', table: 'install_schedule', description: 'Max Slots pro Route (default: 4)' },
    ],
    filters: ['Nur aktive Bookings (booked/confirmed/completed)', 'Route muss zugeordnet sein (route_id != null)'],
    usedIn: ['ExecutiveDashboard'],
    category: 'booking',
  },
  {
    id: 'readyForInstallCount',
    name: 'Aufbaubereite Standorte (ohne Buchung)',
    formula: 'COUNT(records WHERE leadStatus = "Won / Signed" AND approvalStatus = "Accepted/Approved" AND vertragVorhanden AND !isStorno(r) AND !isAlreadyInstalled(r) AND id NOT IN booking_ids)',
    unit: 'Anzahl',
    source: 'InstallationExecutiveDashboard (inline)',
    dataSource: 'Supabase: acquisition + install_bookings',
    inputFields: [
      { field: 'lead_status', table: 'acquisition', description: 'Pipeline-Status muss "Won / Signed" sein (Vertrag unterschrieben)' },
      { field: 'approval_status', table: 'acquisition', description: 'Genehmigungsstatus muss "Accepted" oder "Approved" sein' },
      { field: 'vertrag_vorhanden', table: 'acquisition', description: 'Vertrag PDF muss vorliegen (true/"true"/"checked")' },
      { field: 'akquise_storno / post_install_storno / lead_status', table: 'acquisition', description: 'Storno-Checks via isStorno()' },
      { field: 'installations_status / lead_status / display_location_status', table: 'acquisition', description: 'Bereits-installiert-Check via isAlreadyInstalled()' },
      { field: 'akquise_airtable_id', table: 'install_bookings', description: 'Verknuepfung zur Akquise (Booking existiert bereits?)' },
    ],
    filters: [
      'leadStatus === "Won / Signed" — Vertrag unterschrieben',
      'approvalStatus === "Accepted"/"Approved" — Genehmigung erteilt',
      'vertragVorhanden — Vertrag PDF liegt vor',
      '!isStorno(r) — kein Storno (Akquise oder Post-Install)',
      '!isAlreadyInstalled(r) — noch nicht installiert/live',
      'Nicht bereits eine Buchung vorhanden (id NOT IN booking akquise_airtable_ids)',
    ],
    usedIn: ['ExecutiveDashboard'],
    category: 'acquisition',
  },
  {
    id: 'stornoTotal',
    name: 'Storno Gesamt',
    formula: 'COUNT(records WHERE isStorno(r))',
    unit: 'Anzahl',
    source: 'AcquisitionDashboard (inline)',
    dataSource: 'Supabase: acquisition',
    inputFields: [
      { field: 'akquise_storno', table: 'acquisition', description: 'Akquise-Storno Flag' },
      { field: 'post_install_storno', table: 'acquisition', description: 'Post-Install-Storno Flag' },
      { field: 'lead_status', table: 'acquisition', description: 'Lead-Status (Fallback: storno/cancelled/lost)' },
    ],
    filters: ['isStorno(r) — ODER-Verknuepfung der 3 Storno-Checks'],
    usedIn: ['AcquisitionDashboard', 'ExecutiveDashboard'],
    category: 'acquisition',
  },
  {
    id: 'activeRecords',
    name: 'Aktive Records',
    formula: 'total - COUNT(isStorno(r))',
    unit: 'Anzahl',
    source: 'AcquisitionDashboard (inline)',
    dataSource: 'Supabase: acquisition',
    inputFields: [
      { field: 'alle Felder', table: 'acquisition', description: 'Gesamtanzahl minus Stornos' },
    ],
    filters: ['Alle Records MINUS isStorno(r)'],
    usedIn: ['AcquisitionDashboard'],
    category: 'acquisition',
  },
  {
    id: 'readyForInstallAcq',
    name: 'Aufbaubereit (Akquise-Pipeline)',
    formula: 'COUNT(records WHERE leadStatus = "Won / Signed" AND approvalStatus = "Accepted/Approved" AND vertragVorhanden AND !isStorno(r))',
    unit: 'Anzahl',
    source: 'AcquisitionDashboard (inline)',
    dataSource: 'Supabase: acquisition',
    inputFields: [
      { field: 'lead_status', table: 'acquisition', description: 'Pipeline-Status muss "Won / Signed" sein' },
      { field: 'approval_status', table: 'acquisition', description: 'Genehmigungsstatus muss "Accepted" oder "Approved" sein' },
      { field: 'vertrag_vorhanden', table: 'acquisition', description: 'Vertrag PDF muss vorliegen' },
      { field: 'akquise_storno / post_install_storno / lead_status', table: 'acquisition', description: 'Storno-Checks via isStorno()' },
    ],
    filters: [
      'leadStatus === "Won / Signed" — Vertrag unterschrieben',
      'approvalStatus === "Accepted"/"Approved" — Genehmigung erteilt',
      'vertragVorhanden — Vertrag PDF liegt vor',
      '!isStorno(r) — kein Storno',
    ],
    usedIn: ['AcquisitionDashboard'],
    category: 'acquisition',
  },
  {
    id: 'vertragCount',
    name: 'Mit Vertrag',
    formula: 'COUNT(records WHERE vertragVorhanden && vertragVorhanden !== "false" && !isStorno(r))',
    unit: 'Anzahl',
    source: 'AcquisitionDashboard (inline)',
    dataSource: 'Supabase: acquisition',
    inputFields: [
      { field: 'vertrag_vorhanden', table: 'acquisition', description: 'Vertrag PDF vorhanden (true/false/"checked")' },
    ],
    filters: ['vertragVorhanden truthy und nicht "false"', '!isStorno(r)'],
    usedIn: ['AcquisitionDashboard'],
    category: 'acquisition',
  },
  {
    id: 'weeklySignRate',
    name: 'Woechentliche Vertragsabschluesse',
    formula: 'COUNT(records mit vertragVorhanden + acquisitionDate in KW) vs WEEKLY_BUILD_TARGET (25)',
    unit: 'Anzahl/Woche',
    source: 'AcquisitionDashboard (inline)',
    dataSource: 'Supabase: acquisition',
    inputFields: [
      { field: 'vertrag_vorhanden', table: 'acquisition', description: 'Vertrag vorhanden' },
      { field: 'submitted_at / acquisition_date', table: 'acquisition', description: 'Datum fuer Wochen-Zuordnung' },
    ],
    filters: ['!isStorno(r)', 'vertragVorhanden truthy', 'Gruppierung nach Kalenderwochen (12 Wochen zurueck)'],
    usedIn: ['AcquisitionDashboard'],
    category: 'acquisition',
  },
  {
    id: 'cityPerformance',
    name: 'Stadt-Performance',
    formula: 'GROUP BY city: total, signed, accepted, installed, live, readyForBuild pro Stadt vs CITY_TARGETS',
    unit: 'Anzahl pro Stadt',
    source: 'AcquisitionDashboard (inline)',
    dataSource: 'Supabase: acquisition',
    inputFields: [
      { field: 'city', table: 'acquisition', description: 'Stadt(e) des Standorts (Array)' },
      { field: 'vertrag_vorhanden', table: 'acquisition', description: 'recordIsSigned()' },
      { field: 'lead_status / approval_status / ready_for_installation', table: 'acquisition', description: 'recordIsApproved()' },
      { field: 'installations_status / lead_status / display_location_status', table: 'acquisition', description: 'isAlreadyInstalled()' },
    ],
    filters: ['!isStorno(r)', 'City-Aliases normalisiert (Frankfurt am Main → Frankfurt)', 'CITY_TARGETS als Zielwerte pro Stadt'],
    usedIn: ['AcquisitionDashboard'],
    category: 'acquisition',
  },
  {
    id: 'avgDaysSinceAcquisition',
    name: 'Durchschn. Tage seit Akquise',
    formula: 'AVG((now - acquisitionDate) / days) fuer Records mit Datum und !isStorno(r)',
    unit: 'Tage',
    source: 'AcquisitionDashboard (inline)',
    dataSource: 'Supabase: acquisition',
    inputFields: [
      { field: 'acquisition_date', table: 'acquisition', description: 'Akquise-Datum' },
    ],
    filters: ['acquisitionDate vorhanden', '!isStorno(r)'],
    usedIn: ['AcquisitionDashboard'],
    category: 'acquisition',
  },
  {
    id: 'bookingStatusCounts',
    name: 'Booking-Status-Verteilung',
    formula: 'GROUP BY status: pending, booked, confirmed, completed, cancelled, no_show',
    unit: 'Anzahl',
    source: 'src/metrics/computations/installation.js → computeBookingStatusCounts()',
    dataSource: 'Supabase: install_bookings',
    inputFields: [
      { field: 'status', table: 'install_bookings', description: 'Booking-Status' },
    ],
    filters: ['Keine — zaehlt alle Bookings nach Status'],
    usedIn: ['ExecutiveDashboard', 'BookingsDashboard'],
    category: 'booking',
  },
];

// ─── Booking Status Pipeline ─────
const BOOKING_PIPELINE = [
  { status: 'pending', label: 'Eingeladen', color: '#eab308', description: 'WhatsApp-Einladung gesendet, wartet auf Buchung' },
  { status: 'booked', label: 'Bestätigt', color: '#34C759', description: 'Termin gebucht und automatisch bestätigt' },
  { status: 'confirmed', label: 'Bestaetigt', color: '#34C759', description: 'Termin telefonisch oder per WhatsApp bestaetigt' },
  { status: 'completed', label: 'Abgeschlossen', color: '#10b981', description: 'Installation erfolgreich durchgefuehrt' },
  { status: 'cancelled', label: 'Storniert', color: '#FF3B30', description: 'Termin vom Kunden oder Team storniert' },
  { status: 'no_show', label: 'No-Show', color: '#6b7280', description: 'Kunde war beim Termin nicht anwesend' },
];

// ─── Data Flow ─────
const DATA_FLOW_STEPS = [
  { step: 1, label: 'Airtable', description: 'Akquise-Daten werden in Airtable Acquisition_DB gepflegt', color: '#FF9500' },
  { step: 2, label: 'Sync (2h)', description: 'Netlify Function synct alle 2h via LAST_MODIFIED_TIME nach Supabase', color: '#AF52DE' },
  { step: 3, label: 'Supabase', description: 'acquisition Tabelle mit gemappten Feldern (camelCase → snake_case)', color: '#007AFF' },
  { step: 4, label: 'airtableService.js', description: 'Frontend laedt via fetchAllAcquisition() + 1min Cache', color: '#06b6d4' },
  { step: 5, label: 'src/metrics/', description: 'Predicates + Constants = Single Source of Truth fuer KPI-Berechnungen', color: '#ec4899' },
  { step: 6, label: 'Komponenten', description: 'Alle Install-Views importieren aus src/metrics/ statt lokale Checks', color: '#34C759' },
];


export default function InstallationDataDictionary() {
  const [expandedSection, setExpandedSection] = useState('predicates');
  const [search, setSearch] = useState('');

  const toggleSection = (id) => setExpandedSection(prev => prev === id ? null : id);

  // Filter all data by search
  const matchesSearch = (text) => {
    if (!search) return true;
    return text.toLowerCase().includes(search.toLowerCase());
  };

  const filteredPredicates = PREDICATES.filter(p =>
    matchesSearch(p.name + p.description + p.logic.map(l => l.field + l.meaning).join(' '))
  );
  const filteredThresholds = THRESHOLDS.filter(t =>
    matchesSearch(t.name + t.meaning + t.value)
  );
  const filteredFields = FIELD_ORIGINS.filter(f =>
    matchesSearch(f.frontend + f.supabase + f.airtable + f.description)
  );
  const filteredKpis = COMPUTED_KPIS.filter(k =>
    matchesSearch(k.name + k.formula + k.inputFields.map(f => f.field + f.description).join(' '))
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Database size={24} className="text-pink-500" />
          Data Dictionary
        </h2>
        <p className="text-text-muted mt-1">
          Alle Felder, Predicates und KPI-Definitionen des Installations-Moduls. Single Source of Truth: <code className="text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded text-xs">src/metrics/</code>
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suche nach Feld, Predicate, Threshold..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface-primary border border-border-secondary rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400/30 focus:border-pink-400 text-sm transition-all"
        />
      </div>

      {/* Data Flow */}
      <div className="bg-gradient-to-r from-amber-50 via-purple-50 via-blue-50 to-emerald-50 rounded-2xl p-5 border border-border-secondary">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Zap size={16} className="text-status-warning" /> Datenfluss
        </h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {DATA_FLOW_STEPS.map((step, i) => (
            <React.Fragment key={step.step}>
              <div className="flex flex-col items-center min-w-[120px]">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: step.color }}
                >
                  {step.step}
                </div>
                <div className="text-xs font-semibold text-text-primary mt-1">{step.label}</div>
                <div className="text-[10px] text-text-muted text-center mt-0.5 max-w-[140px]">{step.description}</div>
              </div>
              {i < DATA_FLOW_STEPS.length - 1 && (
                <ArrowRight size={16} className="text-text-muted shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Predicates Section */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('predicates')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-secondary transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center">
              <Shield size={18} className="text-pink-600" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-text-primary">Predicates (Source of Truth)</h3>
              <p className="text-xs text-text-muted">{filteredPredicates.length} Funktionen in src/metrics/predicates.js</p>
            </div>
          </div>
          {expandedSection === 'predicates' ? <ChevronDown size={18} className="text-text-muted" /> : <ChevronRight size={18} className="text-text-muted" />}
        </button>

        {expandedSection === 'predicates' && (
          <div className="px-5 pb-5 space-y-4">
            {filteredPredicates.map(pred => (
              <div key={pred.id} className="bg-surface-primary rounded-xl border border-border-secondary p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-bold text-pink-700 bg-pink-50 px-2 py-0.5 rounded">{pred.name}</code>
                  <span className="text-xs text-text-muted">→ {pred.returnType}</span>
                </div>
                <p className="text-sm text-text-secondary">{pred.description}</p>

                {/* Logic Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-2 text-text-muted font-medium">Bedingung</th>
                        <th className="text-left py-2 px-2 text-text-muted font-medium">Supabase Feld</th>
                        <th className="text-left py-2 px-2 text-text-muted font-medium">Airtable Tabelle</th>
                        <th className="text-left py-2 px-2 text-text-muted font-medium">Airtable Feld</th>
                        <th className="text-left py-2 px-2 text-text-muted font-medium">Bedeutung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pred.logic.map((l, i) => (
                        <tr key={i} className="border-b border-border-secondary">
                          <td className="py-2 px-2 font-mono text-text-primary">{l.condition}</td>
                          <td className="py-2 px-2">
                            <code className="bg-accent-light text-blue-700 px-1.5 py-0.5 rounded">{l.field}</code>
                          </td>
                          <td className="py-2 px-2">
                            <code className="bg-status-warning/10 text-amber-700 px-1.5 py-0.5 rounded">{l.airtableTable}</code>
                          </td>
                          <td className="py-2 px-2">
                            <code className="bg-status-warning/10 text-orange-700 px-1.5 py-0.5 rounded">{l.airtableField}</code>
                          </td>
                          <td className="py-2 px-2 text-text-secondary">{l.meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Notes */}
                {pred.notes && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-status-warning/10 rounded-lg p-2.5">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    {pred.notes}
                  </div>
                )}

                {/* Used In */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-text-muted font-medium">Verwendet in:</span>
                  {pred.usedIn.map(comp => (
                    <span key={comp} className="text-[10px] px-1.5 py-0.5 bg-surface-secondary text-text-secondary rounded font-mono">
                      {comp}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thresholds Section */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('thresholds')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-secondary transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-status-warning/10 flex items-center justify-center">
              <Zap size={18} className="text-status-warning" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-text-primary">Schwellenwerte & Konstanten</h3>
              <p className="text-xs text-text-muted">{filteredThresholds.length} Werte in src/metrics/constants.js</p>
            </div>
          </div>
          {expandedSection === 'thresholds' ? <ChevronDown size={18} className="text-text-muted" /> : <ChevronRight size={18} className="text-text-muted" />}
        </button>

        {expandedSection === 'thresholds' && (
          <div className="px-5 pb-5">
            <div className="grid gap-3">
              {filteredThresholds.map(t => (
                <div key={t.id} className="bg-surface-primary rounded-xl border border-border-secondary p-4 flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-bold text-orange-700 bg-status-warning/10 px-2 py-0.5 rounded">{t.name}</code>
                      <span className="text-sm font-semibold text-text-primary">{t.value}</span>
                    </div>
                    <p className="text-xs text-text-secondary">{t.meaning}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] px-1.5 py-0.5 bg-surface-secondary text-text-muted rounded">{t.severity}</span>
                      {t.usedIn.map(comp => (
                        <span key={comp} className="text-[10px] px-1.5 py-0.5 bg-surface-secondary text-text-muted rounded font-mono">{comp}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Berechnete KPIs Section */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('kpis')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-secondary transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Calculator size={18} className="text-emerald-600" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-text-primary">Berechnete KPIs</h3>
              <p className="text-xs text-text-muted">{filteredKpis.length} Metriken — Formeln, Eingabefelder & Filter</p>
            </div>
          </div>
          {expandedSection === 'kpis' ? <ChevronDown size={18} className="text-text-muted" /> : <ChevronRight size={18} className="text-text-muted" />}
        </button>

        {expandedSection === 'kpis' && (
          <div className="px-5 pb-5 space-y-4">
            {/* Category headers */}
            {['booking', 'acquisition'].map(cat => {
              const catKpis = filteredKpis.filter(k => k.category === cat);
              if (catKpis.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-3 mt-2">
                    <div className={`w-2 h-2 rounded-full ${cat === 'booking' ? 'bg-accent' : 'bg-status-warning'}`} />
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      {cat === 'booking' ? 'Booking-KPIs (install_bookings)' : 'Akquise-KPIs (acquisition)'}
                    </h4>
                  </div>
                  {catKpis.map(kpi => (
                    <div key={kpi.id} className="bg-surface-primary rounded-xl border border-border-secondary p-4 space-y-3 mb-3">
                      {/* KPI Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-text-primary">{kpi.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-mono">{kpi.unit}</span>
                          </div>
                          <code className="text-xs text-text-muted mt-1 block">{kpi.source}</code>
                        </div>
                        <TrendingUp size={16} className="text-emerald-400 shrink-0 mt-1" />
                      </div>

                      {/* Formula */}
                      <div className="bg-surface-secondary rounded-lg p-3">
                        <div className="text-[10px] text-text-muted font-medium mb-1">FORMEL</div>
                        <code className="text-xs text-text-primary font-mono leading-relaxed">{kpi.formula}</code>
                      </div>

                      {/* Input Fields Table */}
                      <div className="overflow-x-auto">
                        <div className="text-[10px] text-text-muted font-medium mb-1.5 flex items-center gap-1">
                          <Database size={10} /> EINGABE-FELDER
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="text-left py-1.5 px-2 text-text-muted font-medium">Feld</th>
                              <th className="text-left py-1.5 px-2 text-text-muted font-medium">Tabelle</th>
                              <th className="text-left py-1.5 px-2 text-text-muted font-medium">Beschreibung</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kpi.inputFields.map((f, i) => (
                              <tr key={i} className="border-b border-border-secondary">
                                <td className="py-1.5 px-2">
                                  <code className="bg-accent-light text-blue-700 px-1.5 py-0.5 rounded">{f.field}</code>
                                </td>
                                <td className="py-1.5 px-2">
                                  <code className="bg-brand-purple/10 text-brand-purple px-1.5 py-0.5 rounded">{f.table}</code>
                                </td>
                                <td className="py-1.5 px-2 text-text-secondary">{f.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Filters */}
                      {kpi.filters.length > 0 && (
                        <div>
                          <div className="text-[10px] text-text-muted font-medium mb-1.5 flex items-center gap-1">
                            <Filter size={10} /> FILTER & BEDINGUNGEN
                          </div>
                          <div className="space-y-1">
                            {kpi.filters.map((f, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                                <span className="text-status-warning shrink-0 mt-0.5">▸</span>
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Used In */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-text-muted font-medium">Verwendet in:</span>
                        {kpi.usedIn.map(comp => (
                          <span key={comp} className="text-[10px] px-1.5 py-0.5 bg-surface-secondary text-text-secondary rounded font-mono">
                            {comp}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Booking Pipeline Section */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('pipeline')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-secondary transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-light flex items-center justify-center">
              <Layers size={18} className="text-accent" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-text-primary">Booking Pipeline</h3>
              <p className="text-xs text-text-muted">Status-Abfolge der Installationstermine</p>
            </div>
          </div>
          {expandedSection === 'pipeline' ? <ChevronDown size={18} className="text-text-muted" /> : <ChevronRight size={18} className="text-text-muted" />}
        </button>

        {expandedSection === 'pipeline' && (
          <div className="px-5 pb-5">
            <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-3">
              {BOOKING_PIPELINE.filter(s => !['cancelled', 'no_show'].includes(s.status)).map((step, i, arr) => (
                <React.Fragment key={step.status}>
                  <div className="flex flex-col items-center min-w-[100px]">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: step.color }}>
                      {i + 1}
                    </div>
                    <div className="text-xs font-semibold text-text-primary mt-1">{step.label}</div>
                  </div>
                  {i < arr.length - 1 && <ArrowRight size={16} className="text-text-muted shrink-0" />}
                </React.Fragment>
              ))}
            </div>
            <div className="grid gap-2">
              {BOOKING_PIPELINE.map(step => (
                <div key={step.status} className="flex items-center gap-3 p-3 rounded-lg bg-surface-primary border border-border-secondary">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: step.color }} />
                  <div>
                    <span className="text-sm font-medium text-text-primary">{step.label}</span>
                    <span className="text-xs text-text-muted ml-2 font-mono">({step.status})</span>
                  </div>
                  <span className="text-xs text-text-muted ml-auto">{step.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Field Origins Section */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('fields')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-secondary transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-purple/10 flex items-center justify-center">
              <Code size={18} className="text-brand-purple" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-text-primary">Feld-Herkunft</h3>
              <p className="text-xs text-text-muted">{filteredFields.length} Felder: Frontend → Supabase → Airtable</p>
            </div>
          </div>
          {expandedSection === 'fields' ? <ChevronDown size={18} className="text-text-muted" /> : <ChevronRight size={18} className="text-text-muted" />}
        </button>

        {expandedSection === 'fields' && (
          <div className="px-5 pb-5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-secondary">
                    <th className="text-left py-2.5 px-2 text-text-muted font-semibold">Frontend (camelCase)</th>
                    <th className="text-left py-2.5 px-2 text-text-muted font-semibold">Supabase Tabelle.Feld</th>
                    <th className="text-left py-2.5 px-2 text-text-muted font-semibold">Airtable Tabelle</th>
                    <th className="text-left py-2.5 px-2 text-text-muted font-semibold">Airtable Feld</th>
                    <th className="text-left py-2.5 px-2 text-text-muted font-semibold">Typ</th>
                    <th className="text-left py-2.5 px-2 text-text-muted font-semibold">Beschreibung</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFields.map(f => (
                    <tr key={f.frontend} className="border-b border-border-secondary hover:bg-surface-secondary">
                      <td className="py-2 px-2">
                        <code className="text-blue-700 bg-accent-light px-1.5 py-0.5 rounded">{f.frontend}</code>
                      </td>
                      <td className="py-2 px-2">
                        <code className="text-brand-purple bg-brand-purple/10 px-1.5 py-0.5 rounded">{f.supabaseTable}.{f.supabase}</code>
                      </td>
                      <td className="py-2 px-2">
                        <code className="text-amber-700 bg-status-warning/10 px-1.5 py-0.5 rounded">{f.airtableTable}</code>
                      </td>
                      <td className="py-2 px-2">
                        <code className="text-orange-700 bg-status-warning/10 px-1.5 py-0.5 rounded">{f.airtable}</code>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          f.type === 'array' ? 'bg-status-warning/10 text-orange-700' :
                          f.type === 'boolean' || f.type === 'boolean/text' ? 'bg-status-online/10 text-green-700' :
                          f.type === 'number' ? 'bg-cyan-50 text-cyan-700' :
                          'bg-surface-secondary text-text-secondary'
                        }`}>
                          {f.type}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-text-secondary" title={f.values}>{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
