import { useState, useMemo, useEffect } from 'react';
import {
  Database,
  Table2,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Copy,
  ExternalLink,
  Wifi,
  FileSpreadsheet,
  Layers,
  Hash,
  Code,
  Info,
  Zap,
  XCircle,
  Shield,
  ShieldCheck,
  Eye,
  Pencil,
  Lock,
  Unlock,
  CircleDot,
  Circle,
  BarChart3,
  Download,
} from 'lucide-react';
import { supabase } from '../utils/authService';

/* ═══════════════════════════════════════════════════════════════════
   DATA MAPPING PANEL — Vollständige Übersicht aller Datenquellen
   ALLE Felder (synced + verfügbar), Sync-Status, Rechte, Nutzung
   ═══════════════════════════════════════════════════════════════════ */

// ─── COMPLETE Data Source Definitions ──────────────────────────────
// Every field from airtableFields.js, with sync status per field

const DATA_SOURCES = [
  {
    id: 'stammdaten',
    name: 'JET Stammdaten',
    airtableTable: 'JET Stammdaten',
    tableId: 'tblLJ1S7OUhc2w5Jw',
    supabaseTable: 'stammdaten',
    primaryKey: 'airtable_id',
    category: 'core',
    description: 'Stammdaten aller JET-Standorte (Kontaktdaten, Adressen, JET-IDs)',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['CommunicationDashboard', 'ContactDirectory', 'NewDisplayWatchlist', 'TaskCreateModal', 'TaskEditModal', 'DisplayDetail'],
    fields: [
      { airtable: 'JET ID', supabase: 'jet_id', type: 'text', synced: true, interpretation: 'Standort-ID (JET-STADT-NR), kann mehrere Displays haben' },
      { airtable: 'Display ID', supabase: 'display_ids', type: 'array', synced: true, interpretation: 'Array aller Display-IDs dieses Standorts' },
      { airtable: 'Location Name', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Name des Standorts / Geschaefts' },
      { airtable: 'Contact Person', supabase: 'contact_person', type: 'text', synced: true, interpretation: 'Ansprechpartner am Standort' },
      { airtable: 'Contact Email', supabase: 'contact_email', type: 'text', synced: true, interpretation: 'E-Mail des Ansprechpartners' },
      { airtable: 'Contact Phone', supabase: 'contact_phone', type: 'text', synced: true, interpretation: 'Telefon des Ansprechpartners' },
      { airtable: 'Location Email', supabase: 'location_email', type: 'text', synced: true, interpretation: 'Allgemeine E-Mail des Standorts' },
      { airtable: 'Location Phone', supabase: 'location_phone', type: 'text', synced: true, interpretation: 'Allgemeine Telefonnummer des Standorts' },
      { airtable: 'Legal Entity', supabase: 'legal_entity', type: 'text', synced: true, interpretation: 'Rechtsform / Firmenname des Partners' },
      { airtable: 'Street', supabase: 'street', type: 'text', synced: true, interpretation: 'Strassenname des Standorts' },
      { airtable: 'Street Number', supabase: 'street_number', type: 'text', synced: true, interpretation: 'Hausnummer des Standorts' },
      { airtable: 'Postal Code', supabase: 'postal_code', type: 'text', synced: true, interpretation: 'Postleitzahl des Standorts' },
      { airtable: 'City', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt des Standorts' },
      { airtable: 'Lead Status  (from Akquise)', supabase: 'lead_status', type: 'text', synced: true, quirk: 'DOUBLE SPACE im Feldnamen', interpretation: 'ACHTUNG Double Space! Akquise-Status' },
      { airtable: 'Status', supabase: 'display_status', type: 'text', synced: true, interpretation: 'Standort-Status (Active/Inactive)' },
    ],
  },
  {
    id: 'airtable_displays',
    name: 'Live Display Locations',
    airtableTable: 'Live Display Locations',
    tableId: 'tblS6cWN7uEhZHcie',
    supabaseTable: 'airtable_displays',
    primaryKey: 'airtable_id',
    category: 'core',
    description: 'Alle aktiven Display-Standorte mit Online-Status, Typ und Geo-Daten',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['App.jsx', 'DisplayDetail', 'DisplayTable', 'HardwareDashboard'],
    fields: [
      { airtable: 'Display ID', supabase: 'display_id', type: 'text', synced: true, interpretation: 'Eindeutige Display-ID (DO-GER-STADT-NR)' },
      { airtable: 'Display Table ID', supabase: 'display_table_id', type: 'text', synced: true, interpretation: 'Interne Airtable Record-ID des Displays' },
      { airtable: 'display_name', supabase: 'display_name', type: 'text', synced: true, interpretation: 'Anzeigename des Displays in Navori' },
      { airtable: 'Online Status ', supabase: 'online_status', type: 'text', synced: true, quirk: 'TRAILING SPACE', interpretation: 'ACHTUNG Trailing Space! Werte: Live, Offline etc.' },
      { airtable: 'Live since', supabase: 'live_since', type: 'date', synced: true, interpretation: 'Datum Aktivierung des Displays' },
      { airtable: 'deinstall_date', supabase: 'deinstall_date', type: 'date', synced: true, interpretation: 'Wenn gesetzt = Display abgebaut' },
      { airtable: 'Screen Type', supabase: 'screen_type', type: 'text', synced: true, interpretation: 'Bildschirmtyp (z.B. LCD, LED)' },
      { airtable: 'Screen Size ', supabase: 'screen_size', type: 'text', synced: true, quirk: 'TRAILING SPACE', interpretation: 'Bildschirmgroesse in Zoll (Trailing Space beachten)' },
      { airtable: 'Navori Venue ID (from Installationen)', supabase: 'navori_venue_id', type: 'text', synced: true, interpretation: 'Link zu Navori/Vistar fuer Programmatic' },
      { airtable: 'Location Name', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Standortname (aus verknuepfter Tabelle)' },
      { airtable: 'City', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt des Display-Standorts' },
      { airtable: 'Street', supabase: 'street', type: 'text', synced: true, interpretation: 'Strasse des Display-Standorts' },
      { airtable: 'Street Number', supabase: 'street_number', type: 'text', synced: true, interpretation: 'Hausnummer des Display-Standorts' },
      { airtable: 'Postal Code', supabase: 'postal_code', type: 'text', synced: true, interpretation: 'PLZ des Display-Standorts' },
      { airtable: 'JET ID (from JET ID)', supabase: 'jet_id', type: 'text', synced: true, interpretation: 'Verknuepfung zum JET-Standort' },
      { airtable: 'SoV Partner Ad', supabase: 'sov_partner_ad', type: 'number', synced: true, interpretation: 'Share of Voice fuer Partner-Werbung in Prozent' },
      { airtable: 'Created', supabase: 'created_at', type: 'date', synced: true, interpretation: 'Erstellungsdatum des Airtable-Eintrags' },
    ],
  },
  {
    id: 'tasks',
    name: 'Tasks',
    airtableTable: 'Tasks',
    tableId: 'tblcKHWJg77mgIQ9l',
    supabaseTable: 'tasks',
    primaryKey: 'airtable_id',
    category: 'operations',
    description: 'Aufgabenverwaltung mit Zuweisungen, Prioritaeten und Status-Tracking',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['TaskDashboard', 'ActivityFeed', 'TaskCreateModal', 'TaskEditModal', 'DisplayDetail'],
    fields: [
      { airtable: 'Task Title', supabase: 'title', type: 'text', synced: true, interpretation: 'Titel / Bezeichnung der Aufgabe' },
      { airtable: 'Task Type', supabase: 'task_type_select', type: 'array', synced: true, interpretation: 'Aufgabentyp als Multi-Select (z.B. Wartung, Installation)' },
      { airtable: 'Partner', supabase: '(task_type fallback)', type: 'text', synced: true, interpretation: 'Fallback fuer Aufgabentyp wenn task_type_select leer' },
      { airtable: 'Company (from Partner)', supabase: 'task_type', type: 'text', synced: true, interpretation: 'Firmenname des Partners (Lookup)' },
      { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'New, In Progress, Completed, Follow Up, On Hold, In Review' },
      { airtable: 'Priority', supabase: 'priority', type: 'text', synced: true, interpretation: 'Prioritaet: Low, Medium, High, Urgent' },
      { airtable: 'Due Date', supabase: 'due_date', type: 'date', synced: true, interpretation: 'Faelligkeitsdatum der Aufgabe' },
      { airtable: 'Description', supabase: 'description', type: 'text', synced: true, interpretation: 'Ausfuehrliche Beschreibung der Aufgabe' },
      { airtable: 'Created time', supabase: 'created_time', type: 'date', synced: true, interpretation: 'Erstellungszeitpunkt der Aufgabe' },
      { airtable: 'Responsible User', supabase: 'responsible_user', type: 'text', synced: true, interpretation: 'Verantwortliche Person fuer die Aufgabe' },
      { airtable: 'Assigned', supabase: 'assigned', type: 'array', synced: true, interpretation: 'Zugewiesene Personen (Multi-Select)' },
      { airtable: 'Created by', supabase: 'created_by', type: 'text', synced: true, interpretation: 'Ersteller der Aufgabe' },
      { airtable: 'Display ID (from Displays )', supabase: 'display_ids', type: 'array', synced: true, quirk: 'TRAILING SPACE vor )', interpretation: 'Verknuepfte Display-IDs (Trailing Space beachten)' },
      { airtable: 'Location Name (from Locations)', supabase: 'location_names', type: 'array', synced: true, interpretation: 'Standortnamen der verknuepften Locations' },
      { airtable: 'Overdue', supabase: 'overdue', type: 'text', synced: true, interpretation: 'Berechnet: Overdue wenn due_date < heute' },
      { airtable: 'completed_task_date', supabase: 'completed_date', type: 'date', synced: true, interpretation: 'Datum an dem die Aufgabe abgeschlossen wurde' },
      { airtable: 'completed_task_by', supabase: 'completed_by', type: 'text', synced: true, interpretation: 'Wer die Aufgabe abgeschlossen hat' },
      { airtable: 'Attachments', supabase: 'attachments', type: 'attachment', synced: true, interpretation: 'Anhaenge (Fotos, Dokumente) zur Aufgabe' },
      { airtable: 'Online Status  (from Displays )', supabase: 'online_status', type: 'array', synced: true, quirk: 'DOUBLE SPACE + TRAILING SPACE', interpretation: 'Online-Status der verknuepften Displays' },
      { airtable: 'Live since (from Displays )', supabase: 'live_since', type: 'array', synced: true, quirk: 'TRAILING SPACE vor )', interpretation: 'Live-Datum der verknuepften Displays' },
      { airtable: 'Status Installation (from Installation)', supabase: 'installation_status', type: 'array', synced: true, interpretation: 'Installationsstatus der verknuepften Installation' },
      { airtable: 'Integrator (from Installation)', supabase: 'integrator', type: 'array', synced: true, interpretation: 'Installationsfirma (z.B. Motiondisplay)' },
      { airtable: 'Aufbau Datum (from Installation)', supabase: 'install_date', type: 'array', synced: true, interpretation: 'Geplantes oder tatsaechliches Aufbaudatum' },
      { airtable: 'Display Serial Number (from Installation)', supabase: 'display_serial_number', type: 'array', synced: true, interpretation: 'Seriennummer des verbauten Displays' },
      { airtable: 'Allgemeine Bemerkungen (from Installation)', supabase: 'install_remarks', type: 'array', synced: true, interpretation: 'Freitext-Bemerkungen zur Installation' },
      { airtable: 'Installationsart (from Installation)', supabase: 'install_type', type: 'array', synced: true, interpretation: 'Art der Installation (Neuinstallation, Tausch etc.)' },
      { airtable: 'external_visiblity', supabase: 'external_visibility', type: 'text', synced: true, quirk: 'TYPO: visiblity statt visibility', interpretation: 'Sichtbarkeit fuer externe Partner (Typo im Feldnamen!)' },
      { airtable: 'Kommentar Nacharbeit', supabase: 'nacharbeit_kommentar', type: 'text', synced: true, interpretation: 'Kommentar zu notwendiger Nacharbeit' },
      { airtable: 'Superchat', supabase: 'superchat', type: 'text', synced: true, interpretation: 'Superchat-Nachricht / Kommentar-Feed' },
      { airtable: 'Status changed by', supabase: 'status_changed_by', type: 'text', synced: true, interpretation: 'Wer den Status zuletzt geaendert hat' },
      { airtable: 'Status changed date', supabase: 'status_changed_date', type: 'date', synced: true, interpretation: 'Wann der Status zuletzt geaendert wurde' },
      { airtable: 'JET ID (from Locations)', supabase: 'jet_ids', type: 'array', synced: true, interpretation: 'JET-IDs der verknuepften Standorte' },
      { airtable: 'City (from Locations)', supabase: 'cities', type: 'array', synced: true, interpretation: 'Staedte der verknuepften Standorte' },
    ],
  },
  {
    id: 'acquisition',
    name: 'Acquisition_DB',
    airtableTable: 'Acquisition_DB',
    tableId: 'tblqFMBAeKQ1NbSI8',
    supabaseTable: 'acquisition',
    primaryKey: 'airtable_id',
    category: 'sales',
    description: 'Akquise-Pipeline mit Lead-Status, Vertraegen und Genehmigungen',
    syncFrequency: 'Alle 2 Stunden (Basis) / On-Demand (Detail)',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['AcquisitionDashboard', 'AkquiseApp', 'InstallationExecutiveDashboard', 'InstallationInviteManager', 'InstallationPhoneWorkbench'],
    fields: [
      // ── Synced Fields (ACQUISITION_FIELDS → mapAcquisition) ──
      { airtable: 'Akquise ID', supabase: 'akquise_id', type: 'text', synced: true, interpretation: 'Eindeutige Akquise-ID des Standorts' },
      { airtable: 'Lead_Status', supabase: 'lead_status', type: 'text', synced: true, interpretation: 'Pipeline: Lead\u2192Qualified\u2192Contracted\u2192Ready\u2192Installed\u2192Live' },
      { airtable: 'frequency_approval (previous FAW Check)', supabase: 'frequency_approval', type: 'text', synced: true, interpretation: 'FAW-Genehmigung (Frequenzabfrage Werbeanlagen)' },
      { airtable: 'install_approval', supabase: 'install_approval', type: 'text', synced: true, interpretation: 'Installationsgenehmigung erteilt ja/nein' },
      { airtable: 'approval_status', supabase: 'approval_status', type: 'text', synced: true, interpretation: 'Gesamtstatus aller Genehmigungen' },
      { airtable: 'Acquisition Date', supabase: 'acquisition_date', type: 'date', synced: true, interpretation: 'Datum der Akquise / Vertragsabschluss' },
      { airtable: 'Installations Status', supabase: 'installations_status', type: 'array', synced: true, interpretation: 'Status der verknuepften Installation(en)' },
      { airtable: 'Display Location Status', supabase: 'display_location_status', type: 'array', synced: true, interpretation: 'Status des Display-Standorts (Live, Offline etc.)' },
      { airtable: 'City', supabase: 'city', type: 'array', synced: true, interpretation: 'Stadt des Akquise-Standorts' },
      { airtable: 'Location Name_new', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Standortname (neues Feld, ersetzt altes)' },
      { airtable: 'Street', supabase: 'street', type: 'text', synced: true, interpretation: 'Strasse des Akquise-Standorts' },
      { airtable: 'Street Number', supabase: 'street_number', type: 'text', synced: true, interpretation: 'Hausnummer des Akquise-Standorts' },
      { airtable: 'Postal Code', supabase: 'postal_code', type: 'text', synced: true, interpretation: 'PLZ des Akquise-Standorts' },
      { airtable: 'JET_ID', supabase: 'jet_id', type: 'text', synced: true, interpretation: 'Zugeordnete JET-Standort-ID' },
      { airtable: 'Contact Person', supabase: 'contact_person', type: 'text', synced: true, interpretation: 'Ansprechpartner am Standort' },
      { airtable: 'Contact Email', supabase: 'contact_email', type: 'text', synced: true, interpretation: 'E-Mail des Ansprechpartners' },
      { airtable: 'Contact Phone', supabase: 'contact_phone', type: 'text', synced: true, interpretation: 'Telefon des Ansprechpartners' },
      { airtable: 'Akquisition Partner Name (from Team)', supabase: 'acquisition_partner', type: 'text', synced: true, interpretation: 'Name des Akquise-Partners / Vertriebsmitarbeiters' },
      { airtable: '# dVAC / Woche 100% SoV', supabase: 'dvac_week', type: 'number', synced: true, interpretation: 'Digital Views Ad Contacts pro Woche bei 100% Share of Voice' },
      { airtable: 'Schaufenster einsehbar', supabase: 'schaufenster', type: 'text', synced: true, interpretation: 'Ist das Schaufenster von aussen sichtbar?' },
      { airtable: 'Hindernisse vorhanden', supabase: 'hindernisse', type: 'text', synced: true, interpretation: 'Gibt es Hindernisse vor dem Schaufenster?' },
      { airtable: 'Mount Type', supabase: 'mount_type', type: 'text', synced: true, interpretation: 'Befestigungsart des Displays (Wand, Stativ etc.)' },
      { airtable: 'Submitted By', supabase: 'submitted_by', type: 'text', synced: true, interpretation: 'Wer den Akquise-Eintrag eingereicht hat' },
      { airtable: 'Submitted At', supabase: 'submitted_at', type: 'date', synced: true, interpretation: 'Zeitpunkt der Einreichung' },
      { airtable: 'Vertrag PDF vorhanden', supabase: 'vertrag_vorhanden', type: 'text', synced: true, interpretation: 'Ob ein unterschriebener Vertrag als PDF vorliegt' },
      { airtable: 'Akquise Storno', supabase: 'akquise_storno', type: 'text', synced: true, interpretation: 'Stornierung vor Installation (Grund/Status)' },
      { airtable: 'Post\u2011Install Storno', supabase: 'post_install_storno', type: 'text', synced: true, quirk: 'U+2011 Non-Breaking Hyphen', interpretation: 'Stornierung nach Installation (Non-Breaking Hyphen beachten!)' },
      { airtable: 'Post\u2011Install Storno Grund', supabase: 'post_install_storno_grund', type: 'array', synced: true, quirk: 'U+2011 Non-Breaking Hyphen', interpretation: 'Grund fuer Post-Install Stornierung (Multi-Select)' },
      { airtable: 'ready_for_installation', supabase: 'ready_for_installation', type: 'text', synced: true, interpretation: 'Airtable-Formel (NICHT MEHR als Predicate — kanonisch: lead_status + approval_status + vertrag_vorhanden)' },
      { airtable: 'Created', supabase: 'created_at', type: 'date', synced: true, interpretation: 'Erstellungsdatum des Akquise-Eintrags' },
      // ── Detail-only Fields (ACQUISITION_DETAIL_FIELDS → transformAkquiseDetail) ──
      // These are fetched on-demand by install-booker-detail.js, NOT in scheduled sync
      { airtable: 'Hindernisse Beschreibung', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Beschreibung vorhandener Hindernisse' },
      { airtable: 'Fensterbreite ausreichend', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Ist das Fenster breit genug fuer das Display?' },
      { airtable: 'Steckdose mit Strom 6-22 Uhr?', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Stromversorgung waehrend Betriebszeiten gesichert?' },
      { airtable: 'Akquise Kommentar', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Freitext-Kommentar zur Akquise' },
      { airtable: 'Akquise Kommentar (from Acquisition Update)', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Kommentar aus Update-Tabelle (Lookup)' },
      { airtable: 'Kommentar aus Installationen', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Installations-Kommentar (Lookup)' },
      { airtable: 'frequency_approval_comment', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Kommentar zur FAW-Genehmigung' },
      { airtable: 'Vertrag (PDF)', supabase: '\u2014', type: 'attachment', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Unterschriebener Vertrag als PDF-Datei' },
      { airtable: 'Vertragsnummer', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Eindeutige Vertragsnummer' },
      { airtable: 'Vertragspartner', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Name des Vertragspartners' },
      { airtable: 'Vertragsbeginn', supabase: '\u2014', type: 'date', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Startdatum des Vertrags' },
      { airtable: 'Laufzeit', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Vertragslaufzeit (z.B. 36 Monate)' },
      { airtable: 'Unterschriftsdatum', supabase: '\u2014', type: 'date', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Datum der Vertragsunterschrift' },
      { airtable: 'images_akquise', supabase: '\u2014', type: 'attachment', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Fotos vom Standort (Akquise-Phase)' },
      { airtable: 'FAW_data_attachment', supabase: '\u2014', type: 'attachment', synced: false, note: 'On-Demand via Detail-API', interpretation: 'FAW-Dokumente als Anhang' },
      { airtable: 'Installationsprotokoll (from Installationen)', supabase: '\u2014', type: 'attachment', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Installationsprotokoll als PDF (Lookup)' },
      { airtable: 'dVAC / Month', supabase: '\u2014', type: 'number', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Digital Views Ad Contacts pro Monat' },
      { airtable: 'dVAC per Day', supabase: '\u2014', type: 'number', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Digital Views Ad Contacts pro Tag' },
      { airtable: 'Latitude', supabase: '\u2014', type: 'number', synced: false, note: 'On-Demand via Detail-API', interpretation: 'GPS Breitengrad des Standorts' },
      { airtable: 'Longitude', supabase: '\u2014', type: 'number', synced: false, note: 'On-Demand via Detail-API', interpretation: 'GPS Laengengrad des Standorts' },
      { airtable: 'Koordinaten (from JET ID)', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Koordinaten aus Stammdaten (Lookup)' },
      { airtable: 'Streetview Link (from JET ID)', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Google Streetview Link des Standorts' },
      { airtable: 'Aufbau Datum', supabase: '\u2014', type: 'date', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Geplantes Datum des Aufbaus' },
      { airtable: 'Integrator (Installation)', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Installationsfirma fuer den Aufbau' },
      { airtable: 'display_name (from Displays)', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Navori Display-Name (Lookup)' },
      { airtable: 'DO-ID (from Installationen)', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Display-Order ID aus Installation' },
      { airtable: 'Live since (from Displays)', supabase: '\u2014', type: 'date', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Live-Datum des verknuepften Displays' },
      { airtable: 'Abbruchgrund', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Grund fuer Abbruch der Akquise' },
      { airtable: 'Exclude Reason', supabase: '\u2014', type: 'text', synced: false, note: 'On-Demand via Detail-API', interpretation: 'Grund fuer Ausschluss aus Pipeline' },
    ],
  },
  {
    id: 'dayn_screens',
    name: 'Dayn Screens',
    airtableTable: 'Dayn Screens',
    tableId: 'Dayn Screens',
    supabaseTable: 'dayn_screens',
    primaryKey: 'airtable_id',
    category: 'programmatic',
    description: 'Programmatic DOOH Display-Netzwerk (DAYN-Integration): Screen-Specs, CPM, Impressions',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['App.jsx (KPIs)', 'DisplayTable', 'MobileDisplayCards'],
    fields: [
      { airtable: 'Dayn_Screen_ID', supabase: 'dayn_screen_id', type: 'text', synced: true, interpretation: 'Eindeutige Dayn-Screen-ID im DOOH-Netzwerk' },
      { airtable: 'DO_Screen_ID', supabase: 'do_screen_id', type: 'text', synced: true, interpretation: 'Display-Order Screen-ID (interne Zuordnung)' },
      { airtable: 'Screen Status', supabase: 'screen_status', type: 'text', synced: true, interpretation: 'Status des Dayn-Screens (Active, Inactive etc.)' },
      { airtable: 'location_name', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Name des Standorts im Dayn-Netzwerk' },
      { airtable: 'address', supabase: 'address', type: 'text', synced: true, interpretation: 'Vollstaendige Adresse des Screens' },
      { airtable: 'city', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt des Dayn-Screens' },
      { airtable: 'region', supabase: 'region', type: 'text', synced: true, interpretation: 'Region / Bundesland' },
      { airtable: 'country', supabase: 'country', type: 'text', synced: true, interpretation: 'Land (typisch: DE)' },
      { airtable: 'zip_code', supabase: 'zip_code', type: 'text', synced: true, interpretation: 'Postleitzahl des Dayn-Screens' },
      { airtable: 'venue type', supabase: 'venue_type', type: 'text', synced: true, interpretation: 'Art des Standorts (z.B. Retail, Restaurant)' },
      { airtable: 'floor CPM', supabase: 'floor_cpm', type: 'number', synced: true, interpretation: 'Mindest-CPM fuer programmatische Buchung' },
      { airtable: 'screen width (px)', supabase: 'screen_width_px', type: 'number', synced: true, interpretation: 'Bildschirmbreite in Pixeln' },
      { airtable: 'screen height (px)', supabase: 'screen_height_px', type: 'number', synced: true, interpretation: 'Bildschirmhoehe in Pixeln' },
      { airtable: 'latitude', supabase: 'latitude', type: 'number', synced: true, interpretation: 'GPS Breitengrad' },
      { airtable: 'longitude', supabase: 'longitude', type: 'number', synced: true, interpretation: 'GPS Laengengrad' },
      { airtable: 'Screen_Inch', supabase: 'screen_inch', type: 'text', synced: true, interpretation: 'Bildschirmgroesse in Zoll' },
      { airtable: 'Screen_Type', supabase: 'screen_type', type: 'text', synced: true, interpretation: 'Typ des Bildschirms (LCD, LED etc.)' },
      { airtable: 'Street with Number', supabase: 'address', type: 'text', synced: true, interpretation: 'Strasse mit Hausnummer (Duplikat zu address)' },
      { airtable: '# dVAC / Woche 100% SoV', supabase: 'dvac_week', type: 'number', synced: true, interpretation: 'dVAC pro Woche bei vollem Share of Voice' },
      { airtable: 'dVAC / Month', supabase: 'dvac_month', type: 'number', synced: true, interpretation: 'dVAC pro Monat' },
      { airtable: 'dVAC per Day', supabase: 'dvac_day', type: 'number', synced: true, interpretation: 'dVAC pro Tag' },
      { airtable: 'Impressions per Spot', supabase: 'impressions_per_spot', type: 'number', synced: true, interpretation: 'Geschaetzte Impressions pro Werbespot' },
      { airtable: 'Maximun video spot lenth (seconds)', supabase: 'max_video_length', type: 'number', synced: true, quirk: 'TYPO: Maximun + lenth', interpretation: 'Max. Videodauer in Sekunden (Typos im Feldnamen!)' },
      { airtable: 'Minimum video spot lenth (seconds)', supabase: 'min_video_length', type: 'number', synced: true, quirk: 'TYPO: lenth', interpretation: 'Min. Videodauer in Sekunden (Typo im Feldnamen!)' },
      { airtable: 'static duration (in seconds)', supabase: 'static_duration', type: 'number', synced: true, interpretation: 'Anzeigedauer statischer Bilder in Sekunden' },
      { airtable: 'static_supported (can your screens run images JPG/PNG)', supabase: 'static_supported', type: 'text', synced: true, interpretation: 'Unterstuetzt der Screen statische Bilder?' },
      { airtable: 'video_supported (can your screens run video?)', supabase: 'video_supported', type: 'text', synced: true, interpretation: 'Unterstuetzt der Screen Video-Wiedergabe?' },
      { airtable: 'install_year', supabase: 'install_year', type: 'text', synced: true, interpretation: 'Installationsjahr des Screens' },
    ],
  },
  {
    id: 'installationen',
    name: 'Installationen',
    airtableTable: 'Installationen',
    tableId: 'tblKznpAOAMvEfX8u',
    supabaseTable: 'installationen',
    primaryKey: 'airtable_id',
    category: 'operations',
    description: 'Installations-Termine mit Status, Integrator-Zuweisungen und Protokollen',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['AdminPanel', 'NewDisplayWatchlist', 'TaskCreateModal', 'TaskEditModal', 'DisplayDetail', 'HardwareDashboard'],
    fields: [
      { airtable: 'Aufbau Datum', supabase: 'install_date', type: 'date', synced: true, interpretation: 'Geplantes oder tatsaechliches Aufbaudatum' },
      { airtable: 'Status Installation', supabase: 'status', type: 'text', synced: true, interpretation: 'Installationsstatus (Geplant, In Arbeit, Abgeschlossen etc.)' },
      { airtable: 'Installationsart', supabase: 'installation_type', type: 'text', synced: true, interpretation: 'Art: Neuinstallation, Tausch, Nachruestung' },
      { airtable: 'Company (from Integrator)', supabase: 'integrator', type: 'text', synced: true, interpretation: 'Installationsfirma (z.B. Motiondisplay)' },
      { airtable: 'Name (from Technikers)', supabase: 'technicians', type: 'array', synced: true, interpretation: 'Namen der eingesetzten Techniker' },
      { airtable: 'Installationsprotokoll', supabase: 'protocol_url / protocol_filename', type: 'attachment', synced: true, interpretation: 'Unterschriebenes Installationsprotokoll als PDF' },
      { airtable: 'Screen Art', supabase: 'screen_type', type: 'text', synced: true, interpretation: 'Typ des installierten Bildschirms' },
      { airtable: 'Screen Size', supabase: 'screen_size', type: 'text', synced: true, interpretation: 'Groesse des installierten Bildschirms in Zoll' },
      { airtable: 'OPS Nr', supabase: 'ops_nr', type: 'text', synced: true, interpretation: 'Zugeordnete OPS-Player-Nummer' },
      { airtable: 'SIM-ID', supabase: 'sim_id', type: 'text', synced: true, interpretation: 'Zugeordnete SIM-Karten-ID' },
      { airtable: 'Installationsstart', supabase: 'install_start', type: 'date', synced: true, interpretation: 'Startzeit der Installation' },
      { airtable: 'Installationsabschluss', supabase: 'install_end', type: 'date', synced: true, interpretation: 'Abschlusszeit der Installation' },
      { airtable: 'Allgemeine Bemerkungen', supabase: 'remarks', type: 'text', synced: true, interpretation: 'Freitext-Bemerkungen zur Installation' },
      { airtable: 'Abnahme Partner (Name)', supabase: 'partner_name', type: 'text', synced: true, interpretation: 'Name des Partners bei der Abnahme' },
      { airtable: 'Display Table ID (from Link to Display ID )', supabase: 'display_ids', type: 'array', synced: true, quirk: 'TRAILING SPACE vor )', interpretation: 'Verknuepfte Display-IDs (Trailing Space beachten)' },
    ],
  },
  {
    id: 'hardware_ops',
    name: 'OPS Player Inventory',
    airtableTable: 'OPS_Player_inventory',
    tableId: 'tbl7szvfLUjsUvMkH',
    supabaseTable: 'hardware_ops',
    primaryKey: 'id',
    category: 'hardware',
    description: 'OPS-Player Hardware (Media-Player an den Standorten)',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['HardwareDashboard', 'HardwareSwapModal', 'DisplayDetail', 'HardwareComponentDetail'],
    fields: [
      { airtable: 'OpsNr.', supabase: 'ops_nr', type: 'text', synced: true, interpretation: 'Eindeutige OPS-Player-Nummer' },
      { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status des OPS-Players (In Use, Available, Defect)' },
      { airtable: 'OPS-SN', supabase: 'ops_sn', type: 'text', synced: true, interpretation: 'Seriennummer des OPS-Players' },
      { airtable: 'ops_hardware_type', supabase: 'hardware_type', type: 'text', synced: true, interpretation: 'Hardware-Typ des Media-Players' },
      { airtable: 'navori_venueID', supabase: 'navori_venue_id', type: 'text', synced: true, interpretation: 'Navori Venue-ID fuer Content-Management' },
      { airtable: 'SimID', supabase: 'sim_record_id', type: 'link', synced: true, interpretation: 'Link zur zugeordneten SIM-Karte (Record-ID)' },
      { airtable: 'SimID (from SimID)', supabase: 'sim_id', type: 'text', synced: true, interpretation: 'SIM-ID als Text (Lookup)' },
      { airtable: 'display_inventory', supabase: 'display_record_id', type: 'link', synced: true, interpretation: 'Link zum zugeordneten Display (Record-ID)' },
      { airtable: 'display_serial_number (from display_inventory)', supabase: 'display_sn', type: 'text', synced: true, interpretation: 'Seriennummer des zugeordneten Displays (Lookup)' },
      { airtable: 'Live Display Locations', supabase: 'display_location_id', type: 'link', synced: true, interpretation: 'Link zum Display-Standort' },
      { airtable: 'Online Status  (from Live Display Locations)', supabase: 'location_online_status', type: 'text', synced: true, quirk: 'DOUBLE SPACE', interpretation: 'Online-Status des Standorts (Double Space beachten!)' },
      { airtable: 'Partner', supabase: 'partner_id', type: 'link', synced: true, interpretation: 'Zugeordneter Installations-Partner' },
      { airtable: 'note', supabase: 'note', type: 'text', synced: true, interpretation: 'Freitext-Notiz zum OPS-Player' },
    ],
  },
  {
    id: 'hardware_sim',
    name: 'SIM Card Inventory',
    airtableTable: 'SIM_card_inventory',
    tableId: 'tblaV4UQX6hhcSDAj',
    supabaseTable: 'hardware_sim',
    primaryKey: 'id',
    category: 'hardware',
    description: 'SIM-Karten-Bestand fuer mobile OPS-Player',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['HardwareDashboard', 'DisplayDetail', 'HardwareComponentDetail'],
    fields: [
      { airtable: 'SimID', supabase: 'sim_id', type: 'text', synced: true, interpretation: 'Eindeutige SIM-Karten-ID' },
      { airtable: 'activate_date', supabase: 'activate_date', type: 'date', synced: true, interpretation: 'Aktivierungsdatum der SIM-Karte' },
      { airtable: 'OPS_Player_inventory 2', supabase: 'ops_record_id', type: 'link', synced: true, interpretation: 'Link zum zugeordneten OPS-Player' },
      { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status der SIM-Karte (Active, Inactive, Available)' },
    ],
  },
  {
    id: 'hardware_displays',
    name: 'Display Inventory',
    airtableTable: 'display_inventory',
    tableId: 'tblaMScl3j45Q4Dtc',
    supabaseTable: 'hardware_displays',
    primaryKey: 'id',
    category: 'hardware',
    description: 'Physische Display-Hardware (Seriennummern, Zuordnungen)',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['HardwareDashboard', 'DisplayDetail', 'HardwareComponentDetail'],
    fields: [
      { airtable: 'display_serial_number', supabase: 'display_serial_number', type: 'text', synced: true, interpretation: 'Seriennummer des physischen Displays' },
      { airtable: 'location', supabase: 'location', type: 'text', synced: true, interpretation: 'Aktueller Standort des Displays' },
      { airtable: 'OPS_Player_inventory', supabase: 'ops_record_id', type: 'link', synced: true, interpretation: 'Link zum zugeordneten OPS-Player' },
      { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status des Displays (In Use, Available, Defect)' },
    ],
  },
  {
    id: 'chg_approvals',
    name: 'CHG Approval',
    airtableTable: 'CHG Approval',
    tableId: 'tblvj4qjJpBVLbY7F',
    supabaseTable: 'chg_approvals',
    primaryKey: 'id',
    category: 'operations',
    description: 'CHG-Abnahmen (Bank-Zertifizierungen fuer Display-Standorte)',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['App.jsx', 'HardwareDashboard', 'DisplayDetail'],
    fields: [
      { airtable: 'JET ID Location', supabase: 'jet_id_location', type: 'text', synced: true, interpretation: 'JET-ID des Standorts fuer CHG-Abnahme' },
      { airtable: 'Asset ID', supabase: 'asset_id', type: 'text', synced: true, interpretation: 'Asset-ID des Displays bei der Bank' },
      { airtable: 'Display SN', supabase: 'display_sn', type: 'text', synced: true, interpretation: 'Seriennummer des Displays fuer CHG' },
      { airtable: 'Integrator Invoice No', supabase: 'integrator_invoice_no', type: 'text', synced: true, interpretation: 'Rechnungsnummer des Integrators' },
      { airtable: 'Installation certificate at the bank (CHG)', supabase: 'chg_certificate', type: 'text', synced: true, interpretation: 'Bank-Zertifikat fuer die Installation' },
      { airtable: 'Invoice date', supabase: 'invoice_date', type: 'date', synced: true, interpretation: 'Rechnungsdatum des Integrators' },
      { airtable: 'Rental start date at the bank', supabase: 'rental_start', type: 'date', synced: true, interpretation: 'Mietbeginn bei der Bank' },
      { airtable: 'Rental end date at the bank', supabase: 'rental_end', type: 'date', synced: true, interpretation: 'Mietende bei der Bank' },
      { airtable: 'Payment released on', supabase: 'payment_released_on', type: 'date', synced: true, interpretation: 'Datum der Zahlungsfreigabe' },
      { airtable: 'Payment released by', supabase: 'payment_released_by', type: 'text', synced: true, interpretation: 'Wer die Zahlung freigegeben hat' },
      { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status der CHG-Abnahme' },
      { airtable: 'Installation', supabase: 'installation_id', type: 'link', synced: true, interpretation: 'Link zur verknuepften Installation' },
      { airtable: 'Inspection Status', supabase: 'inspection_status', type: 'array', synced: true, interpretation: 'Status der Inspektion (Multi-Select)' },
      { airtable: 'DisplayID', supabase: 'display_id', type: 'array', synced: true, interpretation: 'Verknuepfte Display-IDs' },
      { airtable: 'Location Name', supabase: 'location_name', type: 'array', synced: true, interpretation: 'Standortname (Lookup)' },
      { airtable: 'City', supabase: 'city', type: 'array', synced: true, interpretation: 'Stadt des Standorts (Lookup)' },
      { airtable: 'Address', supabase: 'address', type: 'array', synced: true, interpretation: 'Adresse des Standorts (Lookup)' },
      { airtable: 'created', supabase: 'created_at', type: 'date', synced: true, interpretation: 'Erstellungsdatum des CHG-Eintrags' },
    ],
  },
  {
    id: 'hardware_swaps',
    name: 'Hardware Swap',
    airtableTable: 'Hardware Swap',
    tableId: 'tblzFHk0HhB4bNYJ4',
    supabaseTable: 'hardware_swaps',
    primaryKey: 'id',
    category: 'hardware',
    description: 'Hardware-Tausch-Protokolle (OPS, Displays, SIMs)',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['HardwareDashboard', 'HardwareSwapModal', 'DisplayDetail'],
    fields: [
      { airtable: 'Tausch-ID', supabase: 'swap_id', type: 'text', synced: true, interpretation: 'Eindeutige ID des Hardware-Tauschs' },
      { airtable: 'Live Display Location', supabase: 'display_location_id', type: 'link', synced: true, interpretation: 'Link zum betroffenen Display-Standort' },
      { airtable: 'Tausch-Typ', supabase: 'swap_type', type: 'array', synced: true, interpretation: 'Was getauscht wird (OPS, Display, SIM)' },
      { airtable: 'Tausch-Datum', supabase: 'swap_date', type: 'date', synced: true, interpretation: 'Datum des Hardware-Tauschs' },
      { airtable: 'Tausch-Grund', supabase: 'swap_reason', type: 'text', synced: true, interpretation: 'Grund fuer den Tausch (Defekt, Upgrade etc.)' },
      { airtable: 'Partner', supabase: 'partner_id', type: 'link', synced: true, interpretation: 'Ausfuehrender Installations-Partner' },
      { airtable: 'Techniker', supabase: 'technician', type: 'text', synced: true, interpretation: 'Name des ausfuehrenden Technikers' },
      { airtable: 'ALTE Hardware', supabase: 'old_hardware_ids', type: 'array', synced: true, interpretation: 'Record-IDs der ausgebauten Hardware' },
      { airtable: 'NEUE Hardware', supabase: 'new_hardware_ids', type: 'array', synced: true, interpretation: 'Record-IDs der eingebauten Hardware' },
      { airtable: 'Defekt-Beschreibung', supabase: 'defect_description', type: 'text', synced: true, interpretation: 'Beschreibung des Defekts der alten Hardware' },
      { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status des Tauschvorgangs' },
      { airtable: 'Location Name (from Live Display Location)', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Standortname (Lookup)' },
      { airtable: 'City (from Live Display Location)', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt des Standorts (Lookup)' },
    ],
  },
  {
    id: 'hardware_deinstalls',
    name: 'Deinstallationen',
    airtableTable: 'Deinstallationen',
    tableId: 'tbltdxgzDeNz9d0ZC',
    supabaseTable: 'hardware_deinstalls',
    primaryKey: 'id',
    category: 'hardware',
    description: 'Deinstallations-Protokolle mit Gruenden und Hardware-Zustand',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['HardwareDashboard', 'DeinstallModal', 'DisplayDetail'],
    fields: [
      { airtable: 'Deinstallations-ID', supabase: 'deinstall_id', type: 'text', synced: true, interpretation: 'Eindeutige ID der Deinstallation' },
      { airtable: 'Live Display Location', supabase: 'display_location_id', type: 'link', synced: true, interpretation: 'Link zum deinstallierten Display-Standort' },
      { airtable: 'OPS-Nr / Hardware-Set', supabase: 'ops_record_id', type: 'link', synced: true, interpretation: 'Link zum ausgebauten Hardware-Set' },
      { airtable: 'Deinstallationsdatum', supabase: 'deinstall_date', type: 'date', synced: true, interpretation: 'Datum der Deinstallation' },
      { airtable: 'Grund', supabase: 'reason', type: 'text', synced: true, interpretation: 'Grund fuer die Deinstallation' },
      { airtable: 'Partner', supabase: 'partner_id', type: 'link', synced: true, interpretation: 'Ausfuehrender Installations-Partner' },
      { airtable: 'Techniker', supabase: 'technician', type: 'text', synced: true, interpretation: 'Name des ausfuehrenden Technikers' },
      { airtable: 'Hardware-Zustand', supabase: 'hardware_condition', type: 'text', synced: true, interpretation: 'Zustand der ausgebauten Hardware (OK, Defekt etc.)' },
      { airtable: 'Zustandsbeschreibung', supabase: 'condition_description', type: 'text', synced: true, interpretation: 'Detaillierte Beschreibung des Hardware-Zustands' },
      { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status des Deinstallationsvorgangs' },
      { airtable: 'Location Name (from Live Display Location)', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Standortname (Lookup)' },
      { airtable: 'City (from Live Display Location)', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt des Standorts (Lookup)' },
    ],
  },
  {
    id: 'communications',
    name: 'Activity Log',
    airtableTable: 'activity_log',
    tableId: 'tblDk1dl4J3Ow3Qde',
    supabaseTable: 'communications',
    primaryKey: 'airtable_id',
    category: 'operations',
    description: 'Kommunikationshistorie (E-Mails, Anrufe, Notizen)',
    syncFrequency: 'Alle 2 Stunden',
    syncMethod: 'Inkrementell (LAST_MODIFIED_TIME)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['CommunicationDashboard', 'DisplayDetail'],
    fields: [
      { airtable: 'Channel', supabase: 'channel', type: 'text', synced: true, interpretation: 'Kommunikationskanal (E-Mail, Telefon, Notiz)' },
      { airtable: 'Direction', supabase: 'direction', type: 'text', synced: true, interpretation: 'Richtung: Inbound / Outbound' },
      { airtable: 'Subject', supabase: 'subject', type: 'text', synced: true, interpretation: 'Betreff der Kommunikation' },
      { airtable: 'Message', supabase: 'message', type: 'text', synced: true, interpretation: 'Inhalt der Nachricht / Notiz' },
      { airtable: 'Timestamp', supabase: 'timestamp', type: 'date', synced: true, interpretation: 'Zeitpunkt der Kommunikation' },
      { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status der Kommunikation (Sent, Draft etc.)' },
      { airtable: 'Recipient Name', supabase: 'recipient_name', type: 'text', synced: true, interpretation: 'Name des Empfaengers' },
      { airtable: 'Recipient Contact', supabase: 'recipient_contact', type: 'text', synced: true, interpretation: 'Kontaktdaten des Empfaengers (E-Mail/Telefon)' },
      { airtable: 'Sender', supabase: 'sender', type: 'text', synced: true, interpretation: 'Absender der Kommunikation' },
      { airtable: 'External ID', supabase: 'external_id', type: 'text', synced: true, interpretation: 'Externe Referenz-ID (z.B. E-Mail Message-ID)' },
      { airtable: 'Location', supabase: 'location_ids', type: 'link', synced: true, interpretation: 'Verknuepfte Standorte (Record-IDs)' },
      { airtable: 'Location Name (from Location)', supabase: 'location_names', type: 'array', synced: true, interpretation: 'Standortnamen (Lookup)' },
      { airtable: 'Display ID (from Location)', supabase: 'display_ids', type: 'array', synced: true, interpretation: 'Display-IDs der verknuepften Standorte (Lookup)' },
      { airtable: 'JET ID (from Location)', supabase: 'jet_ids', type: 'array', synced: true, interpretation: 'JET-IDs der verknuepften Standorte (Lookup)' },
      { airtable: 'Related Task', supabase: 'related_task', type: 'link', synced: true, interpretation: 'Verknuepfte Aufgabe (Record-ID)' },
    ],
  },
  {
    id: 'heartbeats',
    name: 'Heartbeats (Google Sheets)',
    airtableTable: null,
    tableId: null,
    supabaseTable: 'display_heartbeats',
    primaryKey: 'display_id + timestamp',
    category: 'monitoring',
    source: 'google_sheets',
    description: 'Live-Heartbeat-Daten von allen Displays (alle 5 Min via Navori API → Google Sheets)',
    syncFrequency: 'Alle 2 Stunden (CSV export)',
    syncMethod: 'Append-only INSERT (nicht inkrementell)',
    rights: { source: 'read', supabase: 'read+write' },
    usedIn: ['App.jsx (KPIs)', 'MobileDisplayCards'],
    fields: [
      { airtable: 'Timestamp', supabase: 'timestamp / timestamp_parsed', type: 'timestamptz', synced: true, interpretation: 'Zeitpunkt des System-Checks (Navori ~5 Min)' },
      { airtable: 'Display ID', supabase: 'display_id / raw_display_id', type: 'text', synced: true, interpretation: 'Eindeutige Display-ID (DO-GER-STADT-NR)' },
      { airtable: 'Location Name', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Standortname aus Navori-System' },
      { airtable: 'Serial Number', supabase: 'serial_number', type: 'text', synced: true, interpretation: 'Seriennummer des OPS-Players' },
      { airtable: 'Status', supabase: 'heartbeat', type: 'text', synced: true, interpretation: 'Letzter Online-Zeitpunkt' },
      { airtable: 'Is Alive', supabase: 'is_alive', type: 'text', synced: true, interpretation: 'Navori-Status: Online/Offline' },
      { airtable: 'Display Status', supabase: 'display_status', type: 'text', synced: true, interpretation: 'Airtable-Status (Active/Inactive)' },
      { airtable: 'Days Offline', supabase: 'days_offline', type: 'int', synced: true, interpretation: 'Tage seit letztem Heartbeat' },
    ],
  },
];

const CATEGORY_INFO = {
  core: { label: 'Stammdaten', color: '#3b82f6', icon: Database },
  operations: { label: 'Operations', color: '#8b5cf6', icon: Layers },
  sales: { label: 'Sales / Akquise', color: '#10b981', icon: Zap },
  hardware: { label: 'Hardware', color: '#f59e0b', icon: Code },
  programmatic: { label: 'Programmatic', color: '#ec4899', icon: FileSpreadsheet },
  monitoring: { label: 'Monitoring', color: '#06b6d4', icon: Wifi },
};

const KNOWN_QUIRKS = [
  { field: 'Online Status ', table: 'Live Display Locations', issue: 'Trailing Space im Feldnamen', severity: 'warning' },
  { field: 'Screen Size ', table: 'Live Display Locations', issue: 'Trailing Space im Feldnamen', severity: 'warning' },
  { field: 'Lead Status  (from Akquise)', table: 'JET Stammdaten', issue: 'Double Space im Feldnamen', severity: 'warning' },
  { field: 'Online Status  (from Displays )', table: 'Tasks', issue: 'Double Space + Trailing Space', severity: 'error' },
  { field: 'external_visiblity', table: 'Tasks', issue: 'Typo: visiblity statt visibility', severity: 'warning' },
  { field: 'Post\u2011Install Storno', table: 'Acquisition_DB', issue: 'Non-Breaking Hyphen U+2011', severity: 'error' },
  { field: 'Maximun video spot lenth', table: 'Dayn Screens', issue: 'Typo: Maximun + lenth', severity: 'info' },
  { field: 'Longtitude', table: 'Diverse', issue: 'Typo: Longtitude statt Longitude', severity: 'info' },
];

// ─── KPI Audit Data ─────────────────────────────────────────────────
const KPI_AUDIT_DATA = [
  {
    id: 'health_rate', label: 'Health Rate', component: 'KPICards.jsx', location: 'Dashboard Hauptseite',
    formula: 'Sum(onlineOperatingHours) / Sum(expectedOperatingHours) \u00d7 100',
    formulaDetail: 'Pro Display/Tag: offline \u2264 3.5h \u2192 16h | 3.5-16h \u2192 16-offline | >16h \u2192 0h. Betriebszeit: 06:00-22:00',
    dataSource: 'display_heartbeats', fields: ['timestamp', 'heartbeat', 'display_id'],
    interpretation: 'Prozent der Betriebsstunden in denen alle Displays online waren. 100% = alle liefen ganzen Tag. <80% = Problem.',
    issues: ['Heartbeat nur alle ~3.5h \u2192 kurze Ausfaelle nicht erfasst', 'Navori-Ausfall = alle offline obwohl Displays laufen', 'Grace Period 3.5h maskiert kurze Ausfaelle'],
    mobileNote: 'Mobile: onlineCount/totalActive \u00d7 100 (keine stuendliche Berechnung)', category: 'core',
  },
  {
    id: 'total_active', label: 'Aktive Displays', component: 'KPICards.jsx', location: 'Dashboard Hauptseite',
    formula: 'Count(displays WHERE lastSeen >= latestTimestamp - 24h)',
    dataSource: 'display_heartbeats', fields: ['display_id', 'timestamp'],
    interpretation: 'Displays mit Heartbeat in letzten 24h. NICHT gleich Anzahl installierter Displays in Airtable!',
    issues: ['Never-online werden trotzdem als aktiv gezaehlt', 'Dayn Screens werden auf Mobile addiert'], category: 'core',
  },
  {
    id: 'online_count', label: 'Online Displays', component: 'KPICards.jsx', location: 'Dashboard Hauptseite',
    formula: 'Count(active WHERE offlineHours < 24)',
    dataSource: 'display_heartbeats', fields: ['timestamp', 'heartbeat'],
    interpretation: 'Letzter Heartbeat < 24h. 24h Schwelle ist grosszuegig \u2013 Display kann 23h offline sein und als "online" gelten.',
    issues: ['24h Schwelle maskiert lange Ausfaelle'], category: 'core',
  },
  {
    id: 'warning_count', label: 'Warnung (24-72h)', component: 'KPICards.jsx', location: 'Dashboard',
    formula: 'Count(active WHERE 24 \u2264 offlineHours < 72)',
    dataSource: 'display_heartbeats', fields: ['timestamp', 'heartbeat'],
    interpretation: '1-3 Tage offline. Oft temporaer (Strom/Netzwerk). Untersuchen!', issues: [], category: 'status',
  },
  {
    id: 'critical_count', label: 'Kritisch (>72h)', component: 'KPICards.jsx', location: 'Dashboard',
    formula: 'Count(active WHERE 72 \u2264 offlineHours < 168)',
    dataSource: 'display_heartbeats', fields: ['timestamp', 'heartbeat'],
    interpretation: '3-7 Tage offline. Wahrscheinlich defekt. Task erstellen!',
    issues: ['Grenze permanent_offline bei 168h ist hardcoded'], category: 'status',
  },
  {
    id: 'permanent_offline', label: 'Dauerhaft Offline (>7d)', component: 'KPICards.jsx', location: 'Dashboard',
    formula: 'Count(active WHERE offlineHours \u2265 168)',
    dataSource: 'display_heartbeats', fields: ['timestamp', 'heartbeat'],
    interpretation: '>7 Tage offline. Defekt, deinstalliert oder Standort geschlossen.',
    issues: ['Kann gleichzeitig "aktiv" UND "permanent_offline" sein'], category: 'status',
  },
  {
    id: 'never_online', label: 'Nie Online', component: 'KPICards.jsx', location: 'Dashboard',
    formula: 'Count(active WHERE nie ein Heartbeat empfangen)',
    dataSource: 'display_heartbeats', fields: ['heartbeat'],
    interpretation: 'Im System aber NIE online gewesen. Neue Installation noch nicht konfiguriert.',
    issues: ['Pruefung ueber ALLE Snapshots \u2013 1x Heartbeat = nicht mehr never_online'], category: 'status',
  },
  {
    id: 'newly_installed', label: 'Neu installiert', component: 'KPICards.jsx', location: 'Dashboard',
    formula: 'Count(WHERE globalFirstSeen >= rangeStart)',
    dataSource: 'display_heartbeats + display_first_seen', fields: ['display_id', 'first_seen'],
    interpretation: 'Erstmals im Heartbeat in gewaehltem Zeitraum. Neu = erster Heartbeat, NICHT Airtable Install-Datum.',
    issues: ['first_seen \u2260 Installations-Datum in Airtable'], category: 'tracking',
  },
  {
    id: 'deinstalled', label: 'Deinstalliert', component: 'KPICards.jsx', location: 'Dashboard',
    formula: 'Count(WHERE !isActive AND lastSeen >= rangeStart)',
    dataSource: 'display_heartbeats', fields: ['display_id', 'timestamp'],
    interpretation: 'War im Zeitraum aktiv, jetzt verschwunden. DEINSTALL_DAYS = 3 als Schwelle.',
    issues: ['Falsch positiv wenn Navori Display temporaer entfernt'], category: 'tracking',
  },
  {
    id: 'mobile_health', label: 'Health Rate (Mobile)', component: 'App.jsx', location: 'Mobile',
    formula: 'RPC get_mobile_kpis() ODER Fallback: (online+daynOnline)/(total+daynTotal)\u00d7100',
    dataSource: 'display_heartbeats + dayn_screens', fields: ['days_offline', 'is_alive', 'screen_status'],
    interpretation: 'WEICHT VON DESKTOP AB! Mobile nutzt Tages-Granularitaet (<1d=online), Desktop stundengenau.',
    issues: ['Mobile \u2260 Desktop Health Rate!', 'Dayn Screens nur auf Mobile', 'Fallback max 2000 Rows', 'Cache 24h vs Desktop 4h'],
    category: 'core',
  },
  {
    id: 'task_velocity', label: 'Velocity (30d)', component: 'TaskDashboard.jsx', location: 'Aufgaben',
    formula: '(completed_30d / created_30d) \u00d7 100',
    dataSource: 'tasks', fields: ['status', 'createdTime', 'completed_date'],
    interpretation: '>100% = Rueckstand wird abgebaut, <100% = Rueckstand waechst.',
    issues: ['completed_date muss korrekt gesetzt sein'], category: 'operations',
  },
  {
    id: 'vistar_revenue', label: 'SSP Revenue', component: 'ProgrammaticDashboard.jsx', location: 'Programmatic',
    formula: 'Sum(vistar_venue_health.partner_revenue)',
    dataSource: 'vistar_venue_health', fields: ['partner_revenue', 'impressions', 'partner_ecpm'],
    interpretation: 'Programmatic DOOH Umsatz. 1 Tag Verzoegerung (Sync 03:00 UTC). Nur verknuepfte Venues.',
    issues: ['1 Tag Verzoegerung', 'Fehlende partner_venue_id = fehlende Revenue'], category: 'revenue',
  },
];

// ─── Installation & Akquise KPI Definitions (from src/metrics/) ─────
const INSTALL_KPI_AUDIT_DATA = [
  {
    id: 'is_storno', label: 'isStorno (Predicate)', component: 'src/metrics/predicates.js', location: 'Alle Install + Akquise Views',
    formula: 'akquiseStorno === true ODER postInstallStorno === true ODER leadStatus includes "storno|cancelled|lost"',
    formulaDetail: 'Prueft 3 Bedingungen: (1) akquiseStorno boolean, (2) postInstallStorno boolean, (3) leadStatus String-Match. ODER-Verknuepfung.',
    dataSource: 'acquisition', fields: ['akquise_storno', 'post_install_storno', 'lead_status'],
    interpretation: 'Ob ein Akquise-Record storniert/abgebrochen ist. Single Source of Truth fuer alle Komponenten.',
    issues: ['akquiseStorno kann "true" (String) oder true (Boolean) sein', 'leadStatus "lost" = auch Storno', 'postInstallStorno hat Non-Breaking Hyphen U+2011 in Airtable'],
    category: 'predicates',
  },
  {
    id: 'is_already_installed', label: 'isAlreadyInstalled (Predicate)', component: 'src/metrics/predicates.js', location: 'Alle Install Views',
    formula: 'installationsStatus includes "installiert|live|abgebrochen" ODER leadStatus === "live|installation" ODER displayLocationStatus hat Eintraege',
    formulaDetail: 'Breiteste Pruefung (Union aller Varianten): Status-Array (inkl. abgebrochene), Lead-Status und Display-Location-Status.',
    dataSource: 'acquisition', fields: ['installations_status', 'lead_status', 'display_location_status'],
    interpretation: 'Ob ein Standort bereits installiert/live ist oder einen Installations-Versuch hatte (abgebrochen). Schliesst diese aus dem Aufbau-Pool aus.',
    issues: ['installationsStatus ist Array mit verschiedenen Werten', 'displayLocationStatus kann leere Strings enthalten', 'leadStatus "installation" = in Arbeit, zaehlt als installiert'],
    category: 'predicates',
  },
  {
    id: 'is_ready_for_install', label: 'isReadyForInstall (Predicate)', component: 'src/metrics/predicates.js', location: 'Install Views',
    formula: 'leadStatus === "Won / Signed" AND approvalStatus === "Accepted/Approved" AND vertragVorhanden',
    formulaDetail: 'UND-Verknuepfung: Vertrag unterschrieben + Genehmigung erteilt + Vertrag PDF vorhanden. Storno/Installiert-Checks vom Aufrufer.',
    dataSource: 'acquisition', fields: ['lead_status', 'approval_status', 'vertrag_vorhanden'],
    interpretation: 'Ob ein Record aufbaubereit ist. Kanonischer Check auf Pipeline-Status, Genehmigung und Vertrag.',
    issues: ['vertragVorhanden kann true, "true" oder "checked" sein'],
    category: 'predicates',
  },
  {
    id: 'overdue_pending', label: 'Ueberfaellig: Keine Antwort', component: 'src/metrics/computations/installation.js', location: 'BookingsDashboard, ExecutiveDashboard, PhoneWorkbench',
    formula: 'status === "pending" AND (now - whatsapp_sent_at) > PENDING_NO_RESPONSE_HOURS (48h)',
    formulaDetail: 'Threshold aus OVERDUE_THRESHOLDS.PENDING_NO_RESPONSE_HOURS = 48 Stunden. Severity: warning.',
    dataSource: 'install_bookings', fields: ['status', 'whatsapp_sent_at'],
    interpretation: 'Einladung per WhatsApp gesendet, aber keine Buchung nach 48h. Telefonisches Follow-up noetig.',
    issues: ['Nur wenn whatsapp_sent_at gesetzt (manche Bookings ohne WhatsApp)'],
    category: 'installation',
  },
  {
    id: 'overdue_unconfirmed', label: 'Ueberfaellig: Nicht bestaetigt', component: 'src/metrics/computations/installation.js', location: 'BookingsDashboard, ExecutiveDashboard',
    formula: 'status === "booked" AND installDate within +-UNCONFIRMED_BEFORE_INSTALL_HOURS (24h) of now',
    formulaDetail: 'Threshold aus OVERDUE_THRESHOLDS.UNCONFIRMED_BEFORE_INSTALL_HOURS = 24 Stunden. Severity: critical.',
    dataSource: 'install_bookings', fields: ['status', 'booked_date'],
    interpretation: 'Termin in weniger als 24h aber noch nicht bestaetigt. Dringend Bestaetigung einholen!',
    issues: ['Auch Termine in der Vergangenheit (< -24h) werden nicht als overdue gezaehlt'],
    category: 'installation',
  },
  {
    id: 'confirmation_call', label: 'Bestaetigungsanruf noetig', component: 'InstallationPhoneWorkbench.jsx', location: 'PhoneWorkbench Follow-Up Queue',
    formula: 'status === "booked" AND installDate within CONFIRMATION_CALL_WITHIN_HOURS (72h)',
    formulaDetail: 'Threshold aus OVERDUE_THRESHOLDS.CONFIRMATION_CALL_WITHIN_HOURS = 72 Stunden.',
    dataSource: 'install_bookings', fields: ['status', 'booked_date', 'contact_phone'],
    interpretation: 'Termin in weniger als 3 Tagen, noch nicht bestaetigt. Confirmation Call empfohlen.',
    issues: [],
    category: 'installation',
  },
  {
    id: 'conversion_rate', label: 'Einladung-zu-Buchung Rate', component: 'src/metrics/computations/installation.js', location: 'ExecutiveDashboard',
    formula: '(booked + confirmed + completed) / (pending + booked + confirmed + completed) * 100',
    formulaDetail: 'Cancelled und No-Show werden aus dem Nenner ausgeschlossen (haben Funnel verlassen).',
    dataSource: 'install_bookings', fields: ['status'],
    interpretation: 'Wie viel Prozent der eingeladenen Standorte tatsaechlich einen Termin buchen.',
    issues: ['Nur fuer Buchungen mit Status, nicht fuer Akquise-Pipeline'],
    category: 'installation',
  },
  {
    id: 'no_show_rate', label: 'No-Show Rate', component: 'src/metrics/computations/installation.js', location: 'ExecutiveDashboard',
    formula: 'noShow / (completed + noShow) * 100',
    formulaDetail: 'Nur Records die das Terminstadium erreicht haben (completed oder no_show).',
    dataSource: 'install_bookings', fields: ['status'],
    interpretation: 'Prozent der Termine die als No-Show enden (Kunde nicht angetroffen).',
    issues: [],
    category: 'installation',
  },
  {
    id: 'weekly_build_target', label: 'Woechentliches Aufbauziel', component: 'src/metrics/constants.js', location: 'AcquisitionDashboard, ExecutiveDashboard',
    formula: 'WEEKLY_BUILD_TARGET = 25',
    dataSource: 'Konstante', fields: [],
    interpretation: 'Ziel: 25 Installationen pro Woche. Basis fuer Conversion-Berechnung und Pipeline-Planung.',
    issues: ['Hardcoded Wert, sollte ggf. konfigurierbar sein'],
    category: 'installation',
  },
  {
    id: 'pipeline_readyForInstall', label: 'Pipeline: Aufbaubereit', component: 'AcquisitionDashboard, ExecutiveDashboard', location: 'Akquise + Install Views',
    formula: 'isReadyForInstall(r) AND NOT isStorno(r) AND NOT isAlreadyInstalled(r) AND kein aktives Booking',
    formulaDetail: 'Won/Signed + Approved + Vertrag vorhanden MINUS bereits installierte MINUS stornierte MINUS solche die schon ein Booking haben.',
    dataSource: 'acquisition + install_bookings', fields: ['lead_status', 'approval_status', 'vertrag_vorhanden', 'akquise_storno', 'installations_status'],
    interpretation: 'Standorte die fuer Installation bereit sind und noch keinen Termin haben. Basis fuer PhoneWorkbench Queue.',
    issues: [],
    category: 'predicates',
  },
];

const KPI_CATEGORY_INFO = {
  core: { label: 'Kern-KPIs', color: '#3b82f6' },
  status: { label: 'Status-KPIs', color: '#f59e0b' },
  tracking: { label: 'Tracking', color: '#8b5cf6' },
  operations: { label: 'Operations', color: '#06b6d4' },
  revenue: { label: 'Revenue', color: '#10b981' },
  predicates: { label: 'Predicates (Source of Truth)', color: '#ec4899' },
  installation: { label: 'Installations-KPIs', color: '#f97316' },
};

/* ─── Component ─── */

export default function DataMappingPanel() {
  const [expandedSource, setExpandedSource] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [syncMetadata, setSyncMetadata] = useState([]);
  const [loadingSyncData, setLoadingSyncData] = useState(true);
  const [copiedText, setCopiedText] = useState(null);
  const [tableCounts, setTableCounts] = useState({});
  const [showOnlySynced, setShowOnlySynced] = useState(false);
  const [showKPIAudit, setShowKPIAudit] = useState(false);

  // Fetch sync metadata from Supabase
  useEffect(() => {
    async function fetchSyncData() {
      try {
        const { data, error } = await supabase
          .from('sync_metadata')
          .select('*')
          .order('table_name');
        if (!error && data) setSyncMetadata(data);
      } catch (e) {
        console.warn('[DataMapping] Could not fetch sync_metadata:', e.message);
      }

      // Fetch row counts for each table
      const counts = {};
      for (const src of DATA_SOURCES) {
        try {
          const { count, error } = await supabase
            .from(src.supabaseTable)
            .select('*', { count: 'exact', head: true });
          if (!error) counts[src.supabaseTable] = count;
        } catch (e) {
          // Table might not exist yet
        }
      }
      setTableCounts(counts);
      setLoadingSyncData(false);
    }
    fetchSyncData();
  }, []);

  // Get sync info for a table
  const getSyncInfo = (tableName) => {
    return syncMetadata.find(s => s.table_name === tableName);
  };

  // Filter sources
  const filteredSources = useMemo(() => {
    return DATA_SOURCES.filter(src => {
      if (selectedCategory !== 'all' && src.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          src.name.toLowerCase().includes(q) ||
          src.supabaseTable.toLowerCase().includes(q) ||
          src.description.toLowerCase().includes(q) ||
          src.fields.some(f =>
            f.airtable.toLowerCase().includes(q) ||
            f.supabase.toLowerCase().includes(q)
          )
        );
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

  // Stats
  const stats = useMemo(() => {
    const totalFields = DATA_SOURCES.reduce((sum, s) => sum + s.fields.length, 0);
    const syncedFields = DATA_SOURCES.reduce((sum, s) => sum + s.fields.filter(f => f.synced).length, 0);
    const totalRecords = Object.values(tableCounts).reduce((sum, c) => sum + (c || 0), 0);
    const airtableSources = DATA_SOURCES.filter(s => s.source !== 'google_sheets').length;
    const lastSync = syncMetadata.reduce((latest, s) => {
      if (s.last_sync_timestamp && (!latest || new Date(s.last_sync_timestamp) > new Date(latest))) {
        return s.last_sync_timestamp;
      }
      return latest;
    }, null);
    const failedSyncs = syncMetadata.filter(s => s.last_sync_status === 'error').length;
    return { totalFields, syncedFields, totalRecords, airtableSources, lastSync, failedSyncs };
  }, [tableCounts, syncMetadata]);

  // Copy handler
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // ─── CSV Export ──────────────────────────────────────────────────
  const escapeCSV = (val) => {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const downloadCSV = (filename, csvContent) => {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export single data source fields
  const exportSourceCSV = (src) => {
    const headers = ['Synced', 'Airtable Feld', 'Supabase Spalte', 'Typ', 'Bedeutung', 'Hinweis'];
    const rows = src.fields.map(f => [
      f.synced ? 'Ja' : 'Nein',
      f.airtable,
      f.supabase,
      f.type,
      f.interpretation || '',
      f.quirk || f.note || '',
    ]);
    const meta = [
      ['# Tabelle', src.name],
      ['# Airtable', src.airtableTable || ''],
      ['# Supabase', src.supabaseTable],
      ['# Sync', src.syncFrequency],
      ['# Methode', src.syncMethod],
      ['# Kategorie', CATEGORY_INFO[src.category]?.label || src.category],
      ['# Verwendet in', (src.usedIn || []).join(', ')],
      ['# Records', tableCounts[src.supabaseTable] || ''],
      [],
    ];
    const csv = [...meta, headers, ...rows].map(r => r.map(escapeCSV).join(',')).join('\n');
    downloadCSV(`${src.supabaseTable}_felder.csv`, csv);
  };

  // Export ALL data sources as single CSV
  const exportAllSourcesCSV = () => {
    const headers = ['Datenquelle', 'Kategorie', 'Supabase Tabelle', 'Sync', 'Synced', 'Airtable Feld', 'Supabase Spalte', 'Typ', 'Bedeutung', 'Hinweis', 'Verwendet in'];
    const rows = [];
    DATA_SOURCES.forEach(src => {
      src.fields.forEach(f => {
        rows.push([
          src.name,
          CATEGORY_INFO[src.category]?.label || src.category,
          src.supabaseTable,
          src.syncFrequency,
          f.synced ? 'Ja' : 'Nein',
          f.airtable,
          f.supabase,
          f.type,
          f.interpretation || '',
          f.quirk || f.note || '',
          (src.usedIn || []).join(', '),
        ]);
      });
    });
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(',')).join('\n');
    downloadCSV('jet_data_dictionary_komplett.csv', csv);
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '\u2013';
    try {
      return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return '\u2013'; }
  };

  const formatDuration = (ms) => {
    if (!ms) return '\u2013';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (ts) => {
    if (!ts) return null;
    try {
      const diff = Date.now() - new Date(ts).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'gerade eben';
      if (mins < 60) return `vor ${mins} Min`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `vor ${hrs}h`;
      const days = Math.floor(hrs / 24);
      return `vor ${days}d`;
    } catch { return null; }
  };

  return (
    <div className="space-y-5">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Datenquellen"
          value={DATA_SOURCES.length}
          sub={`${stats.airtableSources} Airtable + 1 Google Sheets`}
          icon={Database}
          color="#3b82f6"
        />
        <StatCard
          label="Felder gesamt"
          value={stats.totalFields}
          sub={`${stats.syncedFields} synced / ${stats.totalFields - stats.syncedFields} verfuegbar`}
          icon={Table2}
          color="#8b5cf6"
        />
        <StatCard
          label="Records"
          value={stats.totalRecords.toLocaleString('de-DE')}
          sub="in Supabase"
          icon={Hash}
          color="#10b981"
        />
        <StatCard
          label="Letzter Sync"
          value={stats.lastSync ? formatTimeAgo(stats.lastSync) || formatTimestamp(stats.lastSync) : 'Kein Sync'}
          sub={stats.lastSync ? formatTimestamp(stats.lastSync) : 'sync_metadata leer'}
          icon={Clock}
          color={stats.lastSync ? '#f59e0b' : '#ef4444'}
        />
        <StatCard
          label="Sync-Fehler"
          value={stats.failedSyncs}
          sub={stats.failedSyncs === 0 ? 'Alle OK' : `${stats.failedSyncs} Tabelle(n)`}
          icon={stats.failedSyncs === 0 ? CheckCircle2 : AlertTriangle}
          color={stats.failedSyncs === 0 ? '#10b981' : '#ef4444'}
        />
      </div>

      {/* Export + KPI Audit Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={exportAllSourcesCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/60 backdrop-blur-xl text-slate-600 border border-slate-200/60 hover:bg-emerald-50/80 hover:text-emerald-700 hover:border-emerald-200/60 transition-all"
          title="Alle Datenquellen als CSV exportieren"
        >
          <Download size={13} />
          Alle exportieren
        </button>
        <button
          onClick={() => setShowKPIAudit(!showKPIAudit)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            showKPIAudit
              ? 'bg-blue-50/80 text-blue-700 border border-blue-200/60 shadow-sm'
              : 'bg-white/60 backdrop-blur-xl text-slate-600 border border-slate-200/60 hover:bg-white/80 hover:text-slate-800'
          }`}
        >
          <BarChart3 size={16} />
          KPI Audit
          <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${showKPIAudit ? 'bg-blue-100 text-blue-600' : 'bg-slate-100/80 text-slate-400'}`}>
            {KPI_AUDIT_DATA.length + INSTALL_KPI_AUDIT_DATA.length}
          </span>
          <ChevronDown size={14} className={`transition-transform ${showKPIAudit ? 'rotate-180' : ''}`} />
        </button>

        {showKPIAudit && (
          <div className="mt-3 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm shadow-black/[0.03] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <BarChart3 size={16} className="text-blue-500" />
                KPI Audit &mdash; Formeln, Datenquellen &amp; bekannte Probleme
              </h3>
              <div className="flex gap-1.5">
                {Object.entries(KPI_CATEGORY_INFO).map(([key, cat]) => (
                  <span key={key} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: cat.color + '18', color: cat.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.label}
                  </span>
                ))}
              </div>
            </div>

            {Object.entries(KPI_CATEGORY_INFO).map(([catKey, catInfo]) => {
              const kpis = [...KPI_AUDIT_DATA, ...INSTALL_KPI_AUDIT_DATA].filter(k => k.category === catKey);
              if (kpis.length === 0) return null;
              return (
                <div key={catKey}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: catInfo.color }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catInfo.color }} />
                    {catInfo.label} ({kpis.length})
                  </h4>
                  <div className="grid gap-2">
                    {kpis.map((kpi) => (
                      <div key={kpi.id} className="bg-white/70 rounded-xl border border-slate-200/40 p-4 space-y-2.5">
                        {/* KPI Header */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">{kpi.label}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100/80 text-slate-500">
                            {kpi.component}
                          </span>
                          <span className="text-[10px] text-slate-400">{kpi.location}</span>
                        </div>

                        {/* Formula */}
                        <div className="font-mono text-xs bg-slate-100/80 rounded-lg p-2 text-slate-700 leading-relaxed">
                          {kpi.formula}
                          {kpi.formulaDetail && (
                            <div className="mt-1 text-slate-500 text-[10px]">{kpi.formulaDetail}</div>
                          )}
                        </div>

                        {/* Data Source & Fields */}
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-slate-400">Quelle:</span>
                          <span className="font-mono text-blue-700 bg-blue-50/60 px-1.5 py-0.5 rounded">{kpi.dataSource}</span>
                          <span className="text-slate-300">|</span>
                          {kpi.fields.map((f, i) => (
                            <span key={i} className="font-mono text-slate-600 bg-slate-100/60 px-1.5 py-0.5 rounded text-[10px]">
                              {f}
                            </span>
                          ))}
                        </div>

                        {/* Interpretation */}
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {kpi.interpretation}
                        </p>

                        {/* Issues */}
                        {kpi.issues && kpi.issues.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {kpi.issues.map((issue, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50/80 border border-amber-200/40 px-2 py-0.5 rounded-full">
                                <AlertTriangle size={10} className="shrink-0" />
                                {issue}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Mobile Note */}
                        {kpi.mobileNote && (
                          <div className="flex items-start gap-1.5 text-[10px] text-purple-700 bg-purple-50/60 border border-purple-200/30 rounded-lg px-2.5 py-1.5">
                            <Info size={10} className="shrink-0 mt-0.5" />
                            {kpi.mobileNote}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suche nach Tabelle, Feld, Beschreibung..."
            className="w-full bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400/60 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <XCircle size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          <FilterChip active={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')} label="Alle" count={DATA_SOURCES.length} />
          {Object.entries(CATEGORY_INFO).map(([key, cat]) => (
            <FilterChip
              key={key}
              active={selectedCategory === key}
              onClick={() => setSelectedCategory(key)}
              label={cat.label}
              count={DATA_SOURCES.filter(s => s.category === key).length}
              color={cat.color}
            />
          ))}
        </div>
      </div>

      {/* Data Sources List */}
      <div className="space-y-2">
        {filteredSources.map((src) => {
          const syncInfo = getSyncInfo(src.supabaseTable);
          const rowCount = tableCounts[src.supabaseTable];
          const isExpanded = expandedSource === src.id;
          const catInfo = CATEGORY_INFO[src.category];
          const syncedCount = src.fields.filter(f => f.synced).length;
          const availableCount = src.fields.filter(f => !f.synced).length;

          return (
            <div
              key={src.id}
              className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm shadow-black/[0.03] transition-all"
            >
              {/* Source Header (clickable) */}
              <button
                onClick={() => setExpandedSource(isExpanded ? null : src.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50/50 transition-colors"
              >
                {/* Category Dot */}
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: catInfo.color }} />

                {/* Source Icon */}
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: catInfo.color + '12' }}>
                  {src.source === 'google_sheets'
                    ? <FileSpreadsheet size={16} style={{ color: catInfo.color }} />
                    : <Table2 size={16} style={{ color: catInfo.color }} />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{src.name}</span>
                    <span className="text-xs font-mono text-slate-400 bg-slate-100/80 px-1.5 py-0.5 rounded shrink-0">
                      {src.supabaseTable}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{src.description}</p>
                </div>

                {/* Badges */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono bg-slate-100/80 text-slate-600 px-2 py-1 rounded-lg">
                    {syncedCount}
                    {availableCount > 0 && <span className="text-slate-400">+{availableCount}</span>}
                    {' '}Felder
                  </span>
                  {rowCount != null && (
                    <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg">
                      {rowCount.toLocaleString('de-DE')} Rows
                    </span>
                  )}
                  <SyncStatusBadge syncInfo={syncInfo} />
                </div>

                {/* Expand Icon */}
                <div className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-slate-200/60 bg-slate-50/30 p-4 space-y-4">
                  {/* Meta Row */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {src.tableId && (
                      <MetaChip label="Table ID" value={src.tableId} onCopy={handleCopy} copied={copiedText === src.tableId} />
                    )}
                    <MetaChip label="Supabase" value={src.supabaseTable} onCopy={handleCopy} copied={copiedText === src.supabaseTable} />
                    <MetaChip label="PK" value={src.primaryKey} />
                    <MetaChip label="Kategorie" value={catInfo.label} />
                    {src.source === 'google_sheets' && (
                      <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded-lg font-mono">
                        <FileSpreadsheet size={11} />
                        Google Sheets
                      </span>
                    )}
                  </div>

                  {/* Sync, Rights & Usage Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Sync Info */}
                    <div className="bg-white/70 rounded-xl border border-slate-200/40 p-3">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <RefreshCw size={12} />
                        Sync
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Frequenz</span>
                          <span className="font-mono text-slate-700">{src.syncFrequency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Methode</span>
                          <span className="font-mono text-slate-700 text-right">{src.syncMethod}</span>
                        </div>
                        {syncInfo ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Letzter Sync</span>
                              <span className="font-mono text-slate-700">{formatTimestamp(syncInfo.last_sync_timestamp)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Dauer</span>
                              <span className="font-mono text-slate-700">{formatDuration(syncInfo.last_sync_duration_ms)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Fetched / Upserted</span>
                              <span className="font-mono text-slate-700">{syncInfo.records_fetched ?? '\u2013'} / {syncInfo.records_upserted ?? '\u2013'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Status</span>
                              <span className={`font-mono ${syncInfo.last_sync_status === 'success' ? 'text-emerald-700' : syncInfo.last_sync_status === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                                {syncInfo.last_sync_status === 'success' ? '\u2705 OK' : syncInfo.last_sync_status === 'error' ? '\u274c Fehler' : syncInfo.last_sync_status || 'pending'}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-400 italic mt-1">
                            Kein Sync-Eintrag in sync_metadata
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rights */}
                    <div className="bg-white/70 rounded-xl border border-slate-200/40 p-3">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Shield size={12} />
                        Rechte
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div>
                          <div className="text-slate-400 mb-1">Quelle ({src.source === 'google_sheets' ? 'Google Sheets' : 'Airtable'})</div>
                          <div className="flex items-center gap-1.5">
                            <Eye size={12} className="text-blue-500" />
                            <span className="font-mono text-slate-700">READ-ONLY</span>
                          </div>
                          {src.source !== 'google_sheets' && (
                            <div className="text-slate-400 mt-0.5 text-[10px]">
                              Auth: Personal Access Token (PAT)
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-slate-400 mb-1">Supabase</div>
                          <div className="flex items-center gap-1.5">
                            <Pencil size={12} className="text-emerald-500" />
                            <span className="font-mono text-slate-700">READ + WRITE</span>
                          </div>
                          <div className="text-slate-400 mt-0.5 text-[10px]">
                            Service Role Key (Server-side)
                          </div>
                        </div>
                        <div className="border-t border-slate-200/40 pt-1.5 mt-1.5">
                          <div className="text-slate-400 mb-1">Frontend</div>
                          <div className="flex items-center gap-1.5">
                            <Eye size={12} className="text-blue-500" />
                            <span className="font-mono text-slate-700">READ-ONLY</span>
                          </div>
                          <div className="text-slate-400 mt-0.5 text-[10px]">
                            Anon Key + RLS Policies
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Usage */}
                    <div className="bg-white/70 rounded-xl border border-slate-200/40 p-3">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Code size={12} />
                        Verwendet in
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {(src.usedIn || []).map((comp, i) => (
                          <span key={i} className="inline-flex items-center text-xs font-mono bg-blue-50/80 text-blue-700 px-2 py-1 rounded-lg">
                            {comp}
                          </span>
                        ))}
                        {(!src.usedIn || src.usedIn.length === 0) && (
                          <span className="text-slate-400 italic text-xs">Keine direkte Nutzung</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Field Mapping Table */}
                  <div className="bg-white/70 rounded-xl border border-slate-200/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-200/40 flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <ArrowRight size={12} />
                        Field Mapping ({syncedCount} synced{availableCount > 0 ? ` + ${availableCount} verfuegbar` : ''})
                      </h4>
                      <div className="flex items-center gap-2">
                        {availableCount > 0 && (
                          <button
                            onClick={() => setShowOnlySynced(!showOnlySynced)}
                            className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                              showOnlySynced ? 'bg-blue-50 text-blue-700' : 'bg-slate-100/80 text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {showOnlySynced ? 'Nur Synced' : 'Alle zeigen'}
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); exportSourceCSV(src); }}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium bg-slate-100/80 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                          title={`${src.name} als CSV exportieren`}
                        >
                          <Download size={11} />
                          CSV
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200/40 bg-slate-50/50">
                            <th className="text-center px-2 py-2 w-8 font-semibold text-slate-500"></th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Airtable Field</th>
                            <th className="text-center px-2 py-2 text-slate-400">\u2192</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Supabase Column</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Typ</th>
                            {src.fields.some(f => f.interpretation) && (
                              <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Bedeutung</th>
                            )}
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Hinweis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {src.fields
                            .filter(f => !showOnlySynced || f.synced)
                            .map((field, i) => (
                            <tr key={i} className={`border-b border-slate-100/60 ${
                              field.quirk ? 'bg-amber-50/30' :
                              !field.synced ? 'bg-slate-50/40' : ''
                            }`}>
                              <td className="text-center px-2 py-2">
                                {field.synced ? (
                                  <CircleDot size={14} className="text-emerald-500 mx-auto" title="Synced" />
                                ) : (
                                  <Circle size={14} className="text-slate-300 mx-auto" title="Verfuegbar, nicht synced" />
                                )}
                              </td>
                              <td className={`px-3 py-2 font-mono ${field.synced ? 'text-slate-700' : 'text-slate-400'}`}>
                                {field.airtable}
                              </td>
                              <td className="text-center px-2 py-2 text-slate-300">
                                {field.synced ? <ArrowRight size={12} /> : <span className="text-slate-200">\u2013</span>}
                              </td>
                              <td className={`px-3 py-2 font-mono ${field.synced ? 'text-blue-700' : 'text-slate-300'}`}>
                                {field.supabase}
                              </td>
                              <td className="px-3 py-2">
                                <TypeBadge type={field.type} dimmed={!field.synced} />
                              </td>
                              {src.fields.some(f => f.interpretation) && (
                                <td className="px-3 py-2 text-slate-500 max-w-xs">
                                  {field.interpretation && (
                                    <span className="text-[11px] leading-relaxed">{field.interpretation}</span>
                                  )}
                                </td>
                              )}
                              <td className="px-3 py-2">
                                {field.quirk && (
                                  <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100/60 px-1.5 py-0.5 rounded mr-1">
                                    <AlertTriangle size={10} />
                                    {field.quirk}
                                  </span>
                                )}
                                {field.note && (
                                  <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50/60 px-1.5 py-0.5 rounded">
                                    <Info size={10} />
                                    {field.note}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Legend */}
                    <div className="px-3 py-2 border-t border-slate-200/40 flex items-center gap-4 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><CircleDot size={10} className="text-emerald-500" /> Wird synchronisiert</span>
                      <span className="flex items-center gap-1"><Circle size={10} className="text-slate-300" /> In Airtable verfuegbar, nicht synced</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredSources.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            Keine Datenquellen gefunden fuer &quot;{searchQuery}&quot;
          </div>
        )}
      </div>

      {/* Known Quirks Section */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm shadow-black/[0.03]">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-amber-500" />
          Bekannte Airtable-Feldprobleme
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Diese Felder haben Sonderzeichen, Tippfehler oder Leerzeichen im Airtable-Feldnamen. Sie werden im Sync korrekt behandelt.
        </p>
        <div className="grid gap-2">
          {KNOWN_QUIRKS.map((q, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={`mt-0.5 shrink-0 ${
                q.severity === 'error' ? 'text-red-500' :
                q.severity === 'warning' ? 'text-amber-500' : 'text-blue-400'
              }`}>
                {q.severity === 'error' ? <XCircle size={12} /> :
                 q.severity === 'warning' ? <AlertTriangle size={12} /> :
                 <Info size={12} />}
              </span>
              <div>
                <span className="font-mono text-slate-700 bg-slate-100/80 px-1 rounded">{q.field}</span>
                <span className="text-slate-400 mx-1">in</span>
                <span className="text-slate-600">{q.table}</span>
                <span className="text-slate-400 mx-1">\u2014</span>
                <span className="text-slate-500">{q.issue}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sync Architecture & Rights Overview */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm shadow-black/[0.03]">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <Layers size={16} className="text-blue-500" />
          Architektur & Berechtigungen
        </h3>
        <div className="font-mono text-xs text-slate-600 leading-relaxed bg-slate-50/80 rounded-xl p-4 border border-slate-200/40 overflow-x-auto">
          <pre className="whitespace-pre">{`Airtable (13 Tabellen)  \u2500\u2500\u25B6  sync-airtable.js  \u2500\u2500\u25B6  Supabase (14 Tabellen)
   READ-ONLY (PAT)            Netlify Scheduled        Inkrementeller Sync
                               Alle 2 Stunden           LAST_MODIFIED_TIME()

Attachments (Fotos)    \u2500\u2500\u25B6  sync-attachments-scheduled.js  \u2500\u2500\u25B6  Supabase Storage
   READ-ONLY (PAT)            Netlify Scheduled               Public Buckets
                               Alle 30 Minuten

Google Sheets (CSV)    \u2500\u2500\u25B6  sync-airtable.js  \u2500\u2500\u25B6  display_heartbeats
   Navori Heartbeats          INSERT append-only        ~170K Rows

Supabase  \u2500\u2500\u25B6  React Frontend (App.jsx)
               Desktop: Volle Daten (~40K Rows)
               Mobile:  RPC get_mobile_kpis() (~2KB JSON)
               Chat AI: buildChatContext() \u2192 Anthropic API`}</pre>
        </div>

        {/* Rights Summary */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-200/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-800 mb-1.5">
              <Eye size={14} />
              Airtable (Quelle)
            </div>
            <div className="text-xs text-blue-700 space-y-1">
              <div>\u2022 Nur Lese-Zugriff (Personal Access Token)</div>
              <div>\u2022 Base ID: apppFUWK829K6B3R2</div>
              <div>\u2022 13 Tabellen, ~250+ Felder</div>
              <div>\u2022 Kein Write-Back \u2014 Airtable ist Master</div>
            </div>
          </div>
          <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-200/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 mb-1.5">
              <Pencil size={14} />
              Supabase (Cache)
            </div>
            <div className="text-xs text-emerald-700 space-y-1">
              <div>\u2022 Sync: Service Role Key (Full Access)</div>
              <div>\u2022 Frontend: Anon Key + RLS Policies</div>
              <div>\u2022 14 Tabellen + Storage Buckets</div>
              <div>\u2022 Lokaler Read-Cache \u2014 kein Master</div>
            </div>
          </div>
          <div className="bg-purple-50/50 rounded-xl p-3 border border-purple-200/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-800 mb-1.5">
              <Shield size={14} />
              Google Sheets
            </div>
            <div className="text-xs text-purple-700 space-y-1">
              <div>\u2022 Nur Lese-Zugriff (Public CSV Export)</div>
              <div>\u2022 Navori API \u2192 Google Sheets \u2192 CSV</div>
              <div>\u2022 Heartbeat-Daten alle ~5 Min</div>
              <div>\u2022 Append-only (kein Update/Delete)</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <Info size={12} className="text-blue-400 mt-0.5 shrink-0" />
          <span>
            <strong>Grundregel:</strong> Wir lesen NUR von externen Quellen (Airtable, Google Sheets).
            Wir schreiben NIEMALS zurueck. Supabase ist unser lokaler Cache.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-Components ─── */

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '12' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-xl font-bold font-mono text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      <div className="text-xs text-slate-400 font-mono mt-0.5">{sub}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
        active
          ? 'bg-white/80 text-slate-900 shadow-sm border border-slate-200/60'
          : 'bg-white/30 text-slate-500 hover:text-slate-600 border border-transparent'
      }`}
    >
      {color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      {count != null && (
        <span className={`font-mono px-1 py-0.5 rounded text-xs ${
          active ? 'bg-blue-50 text-blue-600' : 'bg-slate-100/60 text-slate-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function SyncStatusBadge({ syncInfo }) {
  if (!syncInfo) return (
    <span className="text-xs font-mono bg-slate-100/80 text-slate-400 px-2 py-1 rounded-lg flex items-center gap-1">
      <Clock size={10} />
      Kein Sync
    </span>
  );

  const status = syncInfo.last_sync_status;
  if (status === 'success') return (
    <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg flex items-center gap-1">
      <CheckCircle2 size={10} />
      OK
    </span>
  );
  if (status === 'error') return (
    <span className="text-xs font-mono bg-red-50 text-red-700 px-2 py-1 rounded-lg flex items-center gap-1">
      <XCircle size={10} />
      Fehler
    </span>
  );
  return (
    <span className="text-xs font-mono bg-amber-50 text-amber-700 px-2 py-1 rounded-lg flex items-center gap-1">
      <Clock size={10} />
      {status || 'pending'}
    </span>
  );
}

function MetaChip({ label, value, onCopy, copied }) {
  return (
    <span className="inline-flex items-center gap-1 bg-slate-100/80 text-slate-600 px-2 py-1 rounded-lg font-mono">
      <span className="text-slate-400 font-sans">{label}:</span>
      <span className="text-slate-700">{value}</span>
      {onCopy && (
        <button onClick={() => onCopy(value)} className="text-slate-300 hover:text-slate-500 ml-0.5">
          {copied ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Copy size={10} />}
        </button>
      )}
    </span>
  );
}

function TypeBadge({ type, dimmed }) {
  const colors = {
    text: 'bg-blue-50 text-blue-700',
    date: 'bg-purple-50 text-purple-700',
    number: 'bg-green-50 text-green-700',
    int: 'bg-green-50 text-green-700',
    timestamptz: 'bg-purple-50 text-purple-700',
    array: 'bg-orange-50 text-orange-700',
    attachment: 'bg-pink-50 text-pink-700',
    link: 'bg-cyan-50 text-cyan-700',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${dimmed ? 'bg-slate-50 text-slate-400' : (colors[type] || 'bg-slate-50 text-slate-600')}`}>
      {type}
    </span>
  );
}
