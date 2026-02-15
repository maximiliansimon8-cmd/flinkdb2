import React, { useState, useMemo } from 'react';
import {
  Globe,
  Database,
  MessageSquare,
  Monitor,
  Sparkles,
  FileSpreadsheet,
  Zap,
  Link,
  Key,
  Shield,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Search,
  ExternalLink,
  Clock,
  Server,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  Radio,
  RefreshCw,
  Code,
  Eye,
  Edit3,
  Trash2,
  Plus,
  XCircle,
  Copy,
  Info,
  Download,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   API OVERVIEW PANEL — Vollstaendige Uebersicht aller integrierten APIs
   Rechte, Endpunkte, Nutzung und verfuegbare Funktionen
   ═══════════════════════════════════════════════════════════════════ */

// ─── Category definitions ─────────────────────────────────────────

const CATEGORIES = {
  all: { label: 'Alle', color: null },
  database: { label: 'Datenbank', color: '#3b82f6' },
  messaging: { label: 'Messaging', color: '#10b981' },
  dooh: { label: 'DOOH', color: '#ec4899' },
  ai: { label: 'AI', color: '#8b5cf6' },
  automation: { label: 'Automation', color: '#f59e0b' },
  data: { label: 'Datenquelle', color: '#06b6d4' },
};

// ─── API definitions ──────────────────────────────────────────────

const API_DATA = [
  {
    id: 'airtable',
    name: 'Airtable API',
    icon: Database,
    color: '#fcb400',
    category: 'database',
    status: 'connected',
    statusLabel: 'Verbunden',
    authMethod: 'Bearer Token (PAT)',
    baseUrl: 'https://api.airtable.com/v0/apppFUWK829K6B3R2',
    description: 'Zentrale Datenquelle fuer alle JET-Standortdaten, Tasks, Hardware und Installationen. Airtable ist der "Master" — wir lesen und schreiben.',
    rateLimit: '120 Requests / 60 Sekunden pro IP',
    rights: 'READ + WRITE',
    rightsDetail: 'Vollstaendiger CRUD-Zugriff (GET, POST, PATCH, DELETE)',
    rightsColor: 'emerald',
    authDetails: [
      { label: 'Methode', value: 'Personal Access Token (PAT)' },
      { label: 'Header', value: 'Authorization: Bearer $AIRTABLE_TOKEN' },
      { label: 'Scope', value: 'data.records:read, data.records:write' },
    ],
    envVars: ['AIRTABLE_TOKEN'],
    tables: [
      {
        id: 'tblcKHWJg77mgIQ9l',
        name: 'Tasks',
        usage: 'Aufgabenverwaltung',
        supabaseTable: 'tasks',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['TaskDashboard', 'ActivityFeed', 'DisplayDetail'],
        fields: [
          { airtable: 'Task Title', supabase: 'title', type: 'text', synced: true, interpretation: 'Titel der Aufgabe' },
          { airtable: 'Task Type', supabase: 'task_type_select', type: 'array', synced: true, interpretation: 'Aufgabentyp (Multi-Select)' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'New, In Progress, Completed, Follow Up, On Hold, In Review' },
          { airtable: 'Priority', supabase: 'priority', type: 'text', synced: true, interpretation: 'High, Medium, Low' },
          { airtable: 'Due Date', supabase: 'due_date', type: 'date', synced: true, interpretation: 'Faelligkeit' },
          { airtable: 'Description', supabase: 'description', type: 'text', synced: true, interpretation: 'Aufgaben-Beschreibung' },
          { airtable: 'Responsible User', supabase: 'responsible_user', type: 'text', synced: true, interpretation: 'Zustaendiger Benutzer' },
          { airtable: 'Assigned', supabase: 'assigned', type: 'array', synced: true, interpretation: 'Zugewiesene Personen' },
          { airtable: 'Display ID (from Displays )', supabase: 'display_ids', type: 'array', synced: true, interpretation: 'Verknuepfte Displays (TRAILING SPACE!)' },
          { airtable: 'Location Name (from Locations)', supabase: 'location_names', type: 'array', synced: true, interpretation: 'Verknuepfte Standorte' },
          { airtable: 'Overdue', supabase: 'overdue', type: 'text', synced: true, interpretation: 'Berechnet: Overdue wenn due_date < heute' },
          { airtable: 'Attachments', supabase: 'attachments', type: 'attachment', synced: true, interpretation: 'Angehaengte Dateien' },
          { airtable: 'Online Status  (from Displays )', supabase: 'online_status', type: 'array', synced: true, interpretation: 'DOUBLE SPACE + TRAILING SPACE!' },
          { airtable: 'Kommentar Nacharbeit', supabase: 'nacharbeit_kommentar', type: 'text', synced: true, interpretation: 'Nacharbeitsnotizen' },
          { airtable: 'external_visiblity', supabase: 'external_visibility', type: 'text', synced: true, interpretation: 'TYPO: visiblity statt visibility' },
        ],
      },
      {
        id: 'tblDk1dl4J3Ow3Qde',
        name: 'Activity Log',
        usage: 'Kommunikationshistorie',
        supabaseTable: 'communications',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['ActivityFeed', 'DisplayDetail', 'CommunicationPanel'],
        fields: [
          { airtable: 'Channel', supabase: 'channel', type: 'text', synced: true, interpretation: 'Email, WhatsApp, SMS, Phone' },
          { airtable: 'Direction', supabase: 'direction', type: 'text', synced: true, interpretation: 'Inbound, Outbound' },
          { airtable: 'Subject', supabase: 'subject', type: 'text', synced: true, interpretation: 'Betreff der Nachricht' },
          { airtable: 'Message', supabase: 'message', type: 'text', synced: true, interpretation: 'Nachrichteninhalt' },
          { airtable: 'Timestamp', supabase: 'timestamp', type: 'date', synced: true, interpretation: 'Zeitstempel' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Sent, Received, Pending' },
          { airtable: 'Recipient Name', supabase: 'recipient_name', type: 'text', synced: true, interpretation: 'Empfaenger' },
          { airtable: 'Sender', supabase: 'sender', type: 'text', synced: true, interpretation: 'Absender' },
          { airtable: 'External ID', supabase: 'external_id', type: 'text', synced: true, interpretation: 'Superchat Message ID' },
          { airtable: 'Location', supabase: 'location_ids', type: 'link', synced: true, interpretation: 'Verknuepfter Standort' },
        ],
      },
      {
        id: 'tblS6cWN7uEhZHcie',
        name: 'Live Display Locations',
        usage: 'Display-Standorte',
        supabaseTable: 'airtable_displays',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['DisplayOverview', 'MapView', 'DisplayDetail', 'KPICards'],
        fields: [
          { airtable: 'Display ID', supabase: 'display_id', type: 'text', synced: true, interpretation: 'Eindeutige Display-Kennung' },
          { airtable: 'display_name', supabase: 'display_name', type: 'text', synced: true, interpretation: 'Anzeigename des Displays' },
          { airtable: 'Online Status ', supabase: 'online_status', type: 'text', synced: true, interpretation: 'TRAILING SPACE! Werte: Live, Offline' },
          { airtable: 'Live since', supabase: 'live_since', type: 'date', synced: true, interpretation: 'Aktivierungsdatum' },
          { airtable: 'deinstall_date', supabase: 'deinstall_date', type: 'date', synced: true, interpretation: 'Wenn gesetzt = abgebaut' },
          { airtable: 'Screen Type', supabase: 'screen_type', type: 'text', synced: true, interpretation: 'WD (Window Display) etc.' },
          { airtable: 'Screen Size ', supabase: 'screen_size', type: 'text', synced: true, interpretation: 'TRAILING SPACE! Groesse in Zoll' },
          { airtable: 'Navori Venue ID', supabase: 'navori_venue_id', type: 'text', synced: true, interpretation: 'Link zu Navori CMS / Vistar SSP' },
          { airtable: 'Location Name', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Standortname' },
          { airtable: 'City', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt' },
          { airtable: 'JET ID (from JET ID)', supabase: 'jet_id', type: 'text', synced: true, interpretation: 'Standort-ID' },
          { airtable: 'SoV Partner Ad', supabase: 'sov_partner_ad', type: 'number', synced: true, interpretation: 'Share of Voice Partner-Anteil' },
        ],
      },
      {
        id: 'tblLJ1S7OUhc2w5Jw',
        name: 'JET Stammdaten',
        usage: 'Kontakt- & Adressdaten',
        supabaseTable: 'stammdaten',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['StammdatenView', 'DisplayDetail', 'InstallBooker'],
        fields: [
          { airtable: 'JET ID', supabase: 'jet_id', type: 'text', synced: true, interpretation: 'Standort-ID (JET-STADT-NR)' },
          { airtable: 'Display ID', supabase: 'display_ids', type: 'array', synced: true, interpretation: 'Alle Display-IDs dieses Standorts' },
          { airtable: 'Location Name', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Name des Standorts' },
          { airtable: 'Contact Person', supabase: 'contact_person', type: 'text', synced: true, interpretation: 'Ansprechpartner' },
          { airtable: 'Contact Email', supabase: 'contact_email', type: 'text', synced: true, interpretation: 'Kontakt E-Mail' },
          { airtable: 'Contact Phone', supabase: 'contact_phone', type: 'text', synced: true, interpretation: 'Kontakt Telefon' },
          { airtable: 'Street', supabase: 'street', type: 'text', synced: true, interpretation: 'Strasse' },
          { airtable: 'City', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt' },
          { airtable: 'Postal Code', supabase: 'postal_code', type: 'text', synced: true, interpretation: 'PLZ' },
          { airtable: 'Lead Status  (from Akquise)', supabase: 'lead_status', type: 'text', synced: true, interpretation: 'DOUBLE SPACE! Akquise-Status' },
          { airtable: 'Status', supabase: 'display_status', type: 'text', synced: true, interpretation: 'Display-Status' },
        ],
      },
      {
        id: 'tblqFMBAeKQ1NbSI8',
        name: 'Acquisition_DB',
        usage: 'Akquise-Pipeline',
        supabaseTable: 'acquisition',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['AcquisitionPipeline', 'KPICards'],
        fields: [
          { airtable: 'Akquise ID', supabase: 'akquise_id', type: 'text', synced: true, interpretation: 'Eindeutige Akquise-ID' },
          { airtable: 'Lead_Status', supabase: 'lead_status', type: 'text', synced: true, interpretation: 'Pipeline: Lead\u2192Qualified\u2192Contracted\u2192Ready\u2192Installed\u2192Live' },
          { airtable: 'Location Name_new', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Standortname' },
          { airtable: 'City', supabase: 'city', type: 'array', synced: true, interpretation: 'Stadt' },
          { airtable: 'frequency_approval', supabase: 'frequency_approval', type: 'text', synced: true, interpretation: 'FAW-Check Genehmigung' },
          { airtable: 'install_approval', supabase: 'install_approval', type: 'text', synced: true, interpretation: 'Installations-Genehmigung' },
          { airtable: 'ready_for_installation', supabase: 'ready_for_installation', type: 'text', synced: true, interpretation: 'ACHTUNG: String \'checked\' statt Boolean!' },
          { airtable: 'Akquise Storno', supabase: 'akquise_storno', type: 'text', synced: true, interpretation: 'Akquise storniert?' },
          { airtable: 'Post\u2011Install Storno', supabase: 'post_install_storno', type: 'text', synced: true, interpretation: 'NON-BREAKING HYPHEN U+2011!' },
          { airtable: 'Vertrag PDF vorhanden', supabase: 'vertrag_vorhanden', type: 'text', synced: true, interpretation: 'Vertrags-PDF hochgeladen?' },
          { airtable: '# dVAC / Woche 100% SoV', supabase: 'dvac_week', type: 'number', synced: true, interpretation: 'Daily Views at Capacity pro Woche' },
        ],
      },
      {
        id: 'tblKznpAOAMvEfX8u',
        name: 'Installationen',
        usage: 'Install-Termine',
        supabaseTable: 'installationen',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['InstallBooker', 'InstallOverview', 'DisplayDetail'],
        fields: [
          { airtable: 'Aufbau Datum', supabase: 'install_date', type: 'date', synced: true, interpretation: 'Installations-Termin' },
          { airtable: 'Status Installation', supabase: 'status', type: 'text', synced: true, interpretation: 'Installiert, Abgebrochen, Terminiert, Nacharbeit' },
          { airtable: 'Installationsart', supabase: 'installation_type', type: 'text', synced: true, interpretation: 'Boden-, Wand-, Deckenmontage' },
          { airtable: 'Company (from Integrator)', supabase: 'integrator', type: 'text', synced: true, interpretation: 'e-Systems, MediaAV, DAYNMEDIA' },
          { airtable: 'Screen Art', supabase: 'screen_type', type: 'text', synced: true, interpretation: 'WD etc.' },
          { airtable: 'OPS Nr', supabase: 'ops_nr', type: 'text', synced: true, interpretation: 'OPS-Player Nummer' },
          { airtable: 'SIM-ID', supabase: 'sim_id', type: 'text', synced: true, interpretation: 'SIM-Karten ID' },
          { airtable: 'Allgemeine Bemerkungen', supabase: 'remarks', type: 'text', synced: true, interpretation: 'Installations-Notizen' },
        ],
      },
      {
        id: 'tblzFHk0HhB4bNYJ4',
        name: 'Hardware Swap',
        usage: 'Hardware-Tausch',
        supabaseTable: 'hardware_swaps',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['HardwareOverview', 'DisplayDetail'],
        fields: [
          { airtable: 'Tausch-ID', supabase: 'swap_id', type: 'text', synced: true, interpretation: 'Eindeutige Tausch-ID' },
          { airtable: 'Tausch-Typ', supabase: 'swap_type', type: 'array', synced: true, interpretation: 'Art des Tausches' },
          { airtable: 'Tausch-Datum', supabase: 'swap_date', type: 'date', synced: true, interpretation: 'Datum des Tausches' },
          { airtable: 'Tausch-Grund', supabase: 'swap_reason', type: 'text', synced: true, interpretation: 'Grund fuer Hardware-Tausch' },
          { airtable: 'Defekt-Beschreibung', supabase: 'defect_description', type: 'text', synced: true, interpretation: 'Detaillierte Fehlerbeschreibung' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status des Tausches' },
        ],
      },
      {
        id: 'tbltdxgzDeNz9d0ZC',
        name: 'Deinstallationen',
        usage: 'Deinstall-Protokolle',
        supabaseTable: 'hardware_deinstalls',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['HardwareOverview', 'DisplayDetail'],
        fields: [
          { airtable: 'Deinstallations-ID', supabase: 'deinstall_id', type: 'text', synced: true, interpretation: 'Eindeutige ID' },
          { airtable: 'Deinstallationsdatum', supabase: 'deinstall_date', type: 'date', synced: true, interpretation: 'Datum der Deinstallation' },
          { airtable: 'Grund', supabase: 'reason', type: 'text', synced: true, interpretation: 'Deinstallationsgrund' },
          { airtable: 'Hardware-Zustand', supabase: 'hardware_condition', type: 'text', synced: true, interpretation: 'Zustand der Hardware' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status' },
        ],
      },
      {
        id: 'tbl7szvfLUjsUvMkH',
        name: 'OPS_Player_inventory',
        usage: 'Media-Player Hardware',
        supabaseTable: 'hardware_ops',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['HardwareOverview', 'OPSInventory'],
        fields: [
          { airtable: 'OpsNr.', supabase: 'ops_nr', type: 'text', synced: true, interpretation: 'OPS-Player Nummer' },
          { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Active, Inactive, RMA' },
          { airtable: 'OPS-SN', supabase: 'ops_sn', type: 'text', synced: true, interpretation: 'Seriennummer' },
          { airtable: 'ops_hardware_type', supabase: 'hardware_type', type: 'text', synced: true, interpretation: 'Hardware-Typ' },
          { airtable: 'navori_venueID', supabase: 'navori_venue_id', type: 'text', synced: true, interpretation: 'Navori Venue ID' },
          { airtable: 'SimID (from SimID)', supabase: 'sim_id', type: 'text', synced: true, interpretation: 'Verknuepfte SIM-Karte' },
          { airtable: 'Online Status ', supabase: 'location_online_status', type: 'text', synced: true, interpretation: 'DOUBLE SPACE! Display Online-Status' },
        ],
      },
      {
        id: 'tblaV4UQX6hhcSDAj',
        name: 'SIM_card_inventory',
        usage: 'SIM-Karten',
        supabaseTable: 'hardware_sim',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['HardwareOverview', 'SIMInventory'],
        fields: [
          { airtable: 'SimID', supabase: 'sim_id', type: 'text', synced: true, interpretation: 'SIM-Karten ID' },
          { airtable: 'activate_date', supabase: 'activate_date', type: 'date', synced: true, interpretation: 'Aktivierungsdatum' },
          { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Active, Inactive' },
        ],
      },
      {
        id: 'tblaMScl3j45Q4Dtc',
        name: 'display_inventory',
        usage: 'Display-Hardware',
        supabaseTable: 'hardware_displays',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['HardwareOverview', 'DisplayInventory'],
        fields: [
          { airtable: 'display_serial_number', supabase: 'display_serial_number', type: 'text', synced: true, interpretation: 'Display-Seriennummer' },
          { airtable: 'location', supabase: 'location', type: 'text', synced: true, interpretation: 'Zugeordneter Standort' },
          { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Active, Inactive, RMA' },
        ],
      },
      {
        id: 'tblvj4qjJpBVLbY7F',
        name: 'CHG Approval',
        usage: 'Bank-Zertifizierungen',
        supabaseTable: 'chg_approvals',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['CHGOverview', 'BankLeasing'],
        fields: [
          { airtable: 'JET ID Location', supabase: 'jet_id_location', type: 'text', synced: true, interpretation: 'JET Standort-ID' },
          { airtable: 'Asset ID', supabase: 'asset_id', type: 'text', synced: true, interpretation: 'CHG Asset-ID' },
          { airtable: 'Display SN', supabase: 'display_sn', type: 'text', synced: true, interpretation: 'Display Seriennummer' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Approved, Pending, Rejected' },
          { airtable: 'Rental start date', supabase: 'rental_start', type: 'date', synced: true, interpretation: 'Mietbeginn' },
          { airtable: 'Rental end date', supabase: 'rental_end', type: 'date', synced: true, interpretation: 'Mietende' },
          { airtable: 'Payment released on', supabase: 'payment_released_on', type: 'date', synced: true, interpretation: 'Zahlungsfreigabe' },
        ],
      },
      {
        id: 'tblPxz19KsF1TUkwr',
        name: 'external_team',
        usage: 'Partner & Integratoren',
        supabaseTable: 'external_team',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['TeamOverview', 'InstallBooker'],
        fields: [
          { airtable: 'Company', supabase: 'company', type: 'text', synced: true, interpretation: 'Firmenname des Partners' },
          { airtable: 'Name', supabase: 'name', type: 'text', synced: true, interpretation: 'Ansprechpartner' },
          { airtable: 'Email', supabase: 'email', type: 'text', synced: true, interpretation: 'E-Mail' },
          { airtable: 'Phone', supabase: 'phone', type: 'text', synced: true, interpretation: 'Telefon' },
          { airtable: 'Role', supabase: 'role', type: 'text', synced: true, interpretation: 'Rolle (Integrator, Techniker etc.)' },
        ],
      },
    ],
    endpoints: [
      { method: 'GET', path: '/v0/{baseId}/{tableId}', description: 'Records lesen (mit Pagination, max 100/Request)', icon: Eye },
      { method: 'POST', path: '/v0/{baseId}/{tableId}', description: 'Neue Records erstellen (max 10/Request)', icon: Plus },
      { method: 'PATCH', path: '/v0/{baseId}/{tableId}', description: 'Records aktualisieren (max 10/Request)', icon: Edit3 },
      { method: 'DELETE', path: '/v0/{baseId}/{tableId}', description: 'Records loeschen (max 10/Request)', icon: Trash2 },
    ],
    usedBy: [
      'airtable-proxy.js',
      'sync-airtable.js',
      'install-booker-invite.js',
      'install-booker-book.js',
      'install-booker-detail.js',
      'auth-proxy.js',
      'sync-attachments-scheduled.js',
    ],
    unusedFeatures: [
      'Webhooks (Echtzeit-Benachrichtigungen bei Aenderungen)',
      'Metadata API (Schema-Informationen, Feld-Definitionen)',
      'Field Creation (Felder programmatisch anlegen)',
      'View Management (Views erstellen/aendern)',
      'Comments API (Kommentare an Records)',
      'User Collaborator API',
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    subtitle: 'PostgreSQL + Auth + Storage',
    icon: Database,
    color: '#3ecf8e',
    category: 'database',
    status: 'connected',
    statusLabel: 'Aktiv',
    authMethod: 'Anon Key + Service Role',
    baseUrl: 'https://hvgjdosdejnwkuyivnrq.supabase.co',
    description: 'Lokaler Cache und Auth-Backend. PostgreSQL-Datenbank mit Row Level Security, JWT-basierter Authentifizierung und Storage fuer Attachments.',
    rateLimit: 'Keine harten Limits (Fair Use)',
    rights: 'READ + WRITE (Full)',
    rightsDetail: 'Anon Key: RLS-geschuetzt | Service Role: Bypasses RLS',
    rightsColor: 'emerald',
    authDetails: [
      { label: 'Anon Key', value: 'Browser-seitig, RLS enforced' },
      { label: 'Service Role', value: 'Server-seitig, bypasses RLS' },
      { label: 'Auth', value: 'JWT Sessions (8h Laufzeit)' },
      { label: 'Storage', value: 'attachments Bucket (public)' },
    ],
    envVars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    tables: [
      { id: 'app_users', name: 'app_users', usage: 'Benutzerkonten & Rollen' },
      { id: 'groups', name: 'groups', usage: 'Benutzergruppen' },
      { id: 'audit_log', name: 'audit_log', usage: 'Aenderungsprotokoll' },
      { id: 'stammdaten', name: 'stammdaten', usage: 'JET Stammdaten Cache' },
      { id: 'airtable_displays', name: 'airtable_displays', usage: 'Display-Standorte Cache' },
      { id: 'tasks', name: 'tasks', usage: 'Tasks Cache' },
      { id: 'installationen', name: 'installationen', usage: 'Installationen Cache' },
      { id: 'communications', name: 'communications', usage: 'Kommunikation Cache' },
      { id: 'acquisition', name: 'acquisition', usage: 'Akquise Cache' },
      { id: 'hardware_ops', name: 'hardware_ops', usage: 'OPS Player Cache' },
      { id: 'hardware_sim', name: 'hardware_sim', usage: 'SIM Karten Cache' },
      { id: 'hardware_displays', name: 'hardware_displays', usage: 'Display Hardware Cache' },
      { id: 'hardware_swaps', name: 'hardware_swaps', usage: 'Hardware Swap Cache' },
      { id: 'hardware_deinstalls', name: 'hardware_deinstalls', usage: 'Deinstall Cache' },
      { id: 'chg_approvals', name: 'chg_approvals', usage: 'Bank-Zertifizierungen' },
      { id: 'bank_leasing', name: 'bank_leasing', usage: 'Bank/Leasing Import' },
      { id: 'vistar_venues', name: 'vistar_venues', usage: 'Vistar Venue Mapping' },
      { id: 'vistar_venue_health', name: 'vistar_venue_health', usage: 'Vistar Revenue-Daten' },
      { id: 'sync_metadata', name: 'sync_metadata', usage: 'Sync-Status Tracking' },
      { id: 'attachment_cache', name: 'attachment_cache', usage: 'Attachment URLs Cache' },
      { id: 'feedback_requests', name: 'feedback_requests', usage: 'Bug Reports & Feedback' },
      { id: 'agent_memories', name: 'agent_memories', usage: 'AI Agent Kontext' },
      { id: 'dayn_screens', name: 'dayn_screens', usage: 'DAYN Screen-Netzwerk' },
    ],
    endpoints: [
      { method: 'GET', path: '/rest/v1/{table}', description: 'Records lesen (PostgREST, Filter, Pagination)', icon: Eye },
      { method: 'POST', path: '/rest/v1/{table}', description: 'Records erstellen (Upsert moeglich)', icon: Plus },
      { method: 'PATCH', path: '/rest/v1/{table}', description: 'Records aktualisieren', icon: Edit3 },
      { method: 'DELETE', path: '/rest/v1/{table}', description: 'Records loeschen', icon: Trash2 },
      { method: 'POST', path: '/auth/v1/token', description: 'Authentifizierung (Login/Signup)', icon: Key },
      { method: 'POST', path: '/rest/v1/rpc/{fn}', description: 'RPC Functions (get_mobile_kpis, etc.)', icon: Code },
      { method: 'POST', path: '/storage/v1/object/{bucket}', description: 'Datei-Upload (Attachments)', icon: Plus },
    ],
    usedBy: [
      'authService.js',
      'airtableService.js',
      'vistarService.js',
      'sync-airtable.js',
      'chat-proxy.js',
      'bank-import.js',
      'Alle Netlify Functions',
    ],
    unusedFeatures: [
      'Realtime Subscriptions (Live-Updates via WebSockets)',
      'Edge Functions (Deno-basierte serverless Functions)',
      'Database Functions (PL/pgSQL Stored Procedures)',
      'Vault (Secrets Management)',
      'pg_cron (Scheduled Database Jobs)',
      'Branching (Database Branching fuer Dev/Staging)',
    ],
  },
  {
    id: 'vistar',
    name: 'Vistar Media SSP',
    subtitle: 'Programmatic DOOH',
    icon: Monitor,
    color: '#ec4899',
    category: 'dooh',
    status: 'connected',
    statusLabel: 'Aktiv',
    authMethod: 'Session Cookie',
    baseUrl: 'https://trafficking.vistarmedia.com',
    secondaryUrl: 'https://platform-api.vistarmedia.com',
    description: 'Programmatic Digital Out-of-Home Supply-Side Platform. Liefert Umsatz-, Impressions- und eCPM-Daten fuer alle DAYN-Venues.',
    rateLimit: '30 Requests / 60 Sekunden pro IP',
    rights: 'READ-ONLY',
    rightsDetail: 'Nur Reporting-Daten und Netzwerk-Informationen',
    rightsColor: 'blue',
    authDetails: [
      { label: 'Methode', value: 'Email + Password Session Auth' },
      { label: 'Login', value: 'POST /api/session (JSON body)' },
      { label: 'Session', value: 'Cookie-basiert, ~7h Cache-Dauer' },
      { label: 'Credentials', value: 'VISTAR_EMAIL + VISTAR_PASSWORD' },
    ],
    envVars: ['VISTAR_EMAIL', 'VISTAR_PASSWORD'],
    tables: [],
    endpoints: [
      { method: 'POST', path: '/api/session', description: 'Login — Session-Cookie erhalten', icon: Key },
      { method: 'POST', path: '/report', description: 'SSP Exchange Report (Impressions, Revenue, eCPM)', icon: Eye },
      { method: 'GET', path: '/networks', description: 'Netzwerk-Uebersicht (Platform API)', icon: Radio },
    ],
    metrics: ['impressions', 'spots', 'partner_revenue', 'partner_profit', 'partner_eCPM'],
    usedBy: [
      'vistar-proxy.js',
      'vistar-sync.js',
      'vistar-sync-scheduled.js',
      'vistarService.js',
    ],
    unusedFeatures: [
      'Campaign Management API (Kampagnen erstellen/verwalten)',
      'Inventory API (verfuegbares Inventar abfragen)',
      'Creative Management (Creatives hochladen/verwalten)',
      'Audience Targeting (Zielgruppen-Definition)',
      'Real-time Bidding Insights',
      'Venue Group Management',
    ],
  },
  {
    id: 'superchat',
    name: 'Superchat',
    subtitle: 'Multi-Channel Messaging',
    icon: MessageSquare,
    color: '#10b981',
    category: 'messaging',
    status: 'connected',
    statusLabel: 'Verbunden',
    authMethod: 'API Key Header',
    baseUrl: 'https://api.superchat.com/v1.0',
    description: 'Multi-Channel Messaging Platform fuer WhatsApp und Email Kommunikation mit JET-Standorten. Templates, Kontaktverwaltung und Konversationen.',
    rateLimit: '2.500 Requests / 5 Minuten (API) | 60 Requests / 60s (Proxy)',
    rights: 'READ + WRITE',
    rightsDetail: 'Konversationen, Nachrichten und Kontakte lesen & erstellen',
    rightsColor: 'emerald',
    authDetails: [
      { label: 'Methode', value: 'API Key im Header' },
      { label: 'Header', value: 'X-API-KEY: $SUPERCHAT_API_KEY' },
      { label: 'Channels', value: 'WhatsApp, Email' },
    ],
    envVars: ['SUPERCHAT_API_KEY'],
    tables: [],
    endpoints: [
      { method: 'GET', path: '/conversations', description: 'Konversationen auflisten (Pagination)', icon: Eye },
      { method: 'POST', path: '/conversations', description: 'Neue Konversation starten', icon: Plus },
      { method: 'GET', path: '/messages', description: 'Nachrichten einer Konversation lesen', icon: Eye },
      { method: 'POST', path: '/messages', description: 'Nachricht senden (Text, Template)', icon: Edit3 },
      { method: 'GET', path: '/contacts', description: 'Kontakte auflisten', icon: Eye },
      { method: 'POST', path: '/contacts', description: 'Kontakt erstellen/aktualisieren', icon: Plus },
      { method: 'GET', path: '/templates', description: 'WhatsApp Templates abrufen', icon: Eye },
      { method: 'GET', path: '/channels', description: 'Verfuegbare Kanaele auflisten', icon: Radio },
    ],
    usedBy: [
      'superchat-proxy.js',
      'superchatService.js',
      'install-booker-book.js',
    ],
    unusedFeatures: [
      'Webhook Events (Eingehende Nachrichten-Benachrichtigung)',
      'Team Management API (Agenten & Zuweisungen)',
      'Analytics API (Antwortzeiten, Volumen)',
      'Automation API (Auto-Replies, Workflows)',
      'Labels & Tags Management',
      'Broadcast Messages (Massen-Nachrichten)',
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude API',
    subtitle: 'AI Assistant',
    icon: Sparkles,
    color: '#8b5cf6',
    category: 'ai',
    status: 'connected',
    statusLabel: 'Aktiv',
    authMethod: 'Bearer Token',
    baseUrl: 'https://api.anthropic.com',
    description: 'AI-Chat-Assistant fuer das Dashboard. Streaming-Antworten mit Claude Sonnet, Kontext aus Dashboard-Daten, Bug-Reports und Agent-Memory.',
    rateLimit: '120 Requests / 60 Sekunden (Proxy)',
    rights: 'READ (Completions)',
    rightsDetail: 'Nur Chat-Completions und Streaming-Responses',
    rightsColor: 'blue',
    authDetails: [
      { label: 'Methode', value: 'API Key im Header' },
      { label: 'Header', value: 'x-api-key: $ANTHROPIC_API_KEY' },
      { label: 'Model', value: 'Claude Sonnet (claude-sonnet-4-20250514)' },
      { label: 'Streaming', value: 'SSE (Server-Sent Events)' },
    ],
    envVars: ['ANTHROPIC_API_KEY'],
    tables: [],
    modes: [
      { name: 'Chat', description: 'Streaming-Antworten mit Dashboard-Kontext' },
      { name: 'Feedback', description: 'Bug Reports direkt in Supabase speichern' },
      { name: 'Memory', description: 'Agent-Kontext persistent in agent_memories' },
    ],
    endpoints: [
      { method: 'POST', path: '/v1/messages', description: 'Chat Completion (SSE Streaming)', icon: Sparkles },
    ],
    usedBy: [
      'chat-proxy.js',
    ],
    unusedFeatures: [
      'Vision API (Bild-Analyse und -Verstaendnis)',
      'Tool Use / Function Calling',
      'Batch API (Grosse Mengen an Requests)',
      'Message Batches (Asynchrone Verarbeitung)',
      'Prompt Caching (Kosten-Optimierung)',
      'Citations API',
    ],
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    subtitle: 'CSV Export',
    icon: FileSpreadsheet,
    color: '#0f9d58',
    category: 'data',
    status: 'connected',
    statusLabel: 'Aktiv',
    authMethod: 'Keine (Public)',
    baseUrl: 'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s',
    description: 'Heartbeat-Daten von allen Displays. Navori API schreibt alle ~5 Min in Google Sheets, wir exportieren als CSV (Public, keine Auth noetig).',
    rateLimit: '30 Requests / 60 Sekunden (Proxy) | 30s Browser + 60s CDN Cache',
    rights: 'READ-ONLY',
    rightsDetail: 'Oeffentlicher CSV-Export, kein Schreibzugriff',
    rightsColor: 'blue',
    authDetails: [
      { label: 'Methode', value: 'Keine Authentifizierung' },
      { label: 'Zugriff', value: 'Public CSV Export URL' },
      { label: 'Spreadsheet', value: '1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s' },
      { label: 'Caching', value: '30s Browser-Cache + 60s CDN-Cache' },
    ],
    envVars: [],
    tables: [],
    endpoints: [
      { method: 'GET', path: '/export?format=csv', description: 'CSV-Export des gesamten Sheets', icon: Eye },
    ],
    usedBy: [
      'sheets-proxy.js',
      'sync-airtable.js',
    ],
    unusedFeatures: [
      'Google Sheets API v4 (Auth-basiert, vollstaendiger Zugriff)',
      'Real-time Collaboration API',
      'Named Ranges (Benannte Bereiche)',
      'Charts & Pivot Tables API',
      'Apps Script Integration',
      'Data Validation API',
    ],
  },
  {
    id: 'make',
    name: 'Make.com',
    subtitle: 'Webhook Automation',
    icon: Zap,
    color: '#6d28d9',
    category: 'automation',
    status: 'connected',
    statusLabel: 'Aktiv',
    authMethod: 'API Key Header',
    baseUrl: 'Webhook-basiert (kein fester Base URL)',
    description: 'Webhook-basierte Automation. Make.com triggert Netlify Functions fuer Standort-Bereitschaft (Install Booker) und XLSX-Email-Parsing (Bank Import).',
    rateLimit: 'Keine (Webhook-Trigger)',
    rights: 'WRITE (Incoming)',
    rightsDetail: 'Nur eingehende Webhook-Calls an unsere Endpoints',
    rightsColor: 'amber',
    authDetails: [
      { label: 'Methode', value: 'API Key im Header' },
      { label: 'Header', value: 'x-api-key: $BOOKER_API_KEY' },
      { label: 'Richtung', value: 'Make.com ruft UNSERE Endpoints auf' },
    ],
    envVars: ['BOOKER_API_KEY'],
    tables: [],
    endpoints: [
      { method: 'POST', path: '/install-booker-invite', description: 'Standort-Bereitschaft melden (Location Readiness)', icon: Zap },
      { method: 'POST', path: '/bank-import', description: 'XLSX Email-Parsing (Bank/Leasing Daten)', icon: Zap },
    ],
    usedBy: [
      'install-booker-invite.js',
      'bank-import.js',
    ],
    unusedFeatures: [
      'Scenario API (Szenarien erstellen/verwalten)',
      'Organization API (Team-Verwaltung)',
      'Data Stores (Persistente Key-Value Speicher)',
      'Custom Apps (Eigene Integrationen)',
      'Execution History API',
      'Webhook Response (Bidirektionale Kommunikation)',
    ],
  },
];

// ─── Stats ────────────────────────────────────────────────────────

const STATS = [
  { label: 'APIs Gesamt', value: '7', icon: Globe, color: '#3b82f6', sub: 'Integrierte Services' },
  { label: 'Aktive Endpunkte', value: '~25', icon: Server, color: '#8b5cf6', sub: 'GET, POST, PATCH, DELETE' },
  { label: 'Read-Only', value: '2', icon: Eye, color: '#06b6d4', sub: 'Vistar, Google Sheets' },
  { label: 'Read + Write', value: '4', icon: Edit3, color: '#10b981', sub: 'Airtable, Supabase, Superchat, Claude' },
  { label: 'Scheduled Syncs', value: '3', icon: RefreshCw, color: '#f59e0b', sub: 'Airtable, Vistar, Heartbeats' },
  { label: 'Env Variables', value: '9', icon: Key, color: '#ef4444', sub: 'In Netlify Environment' },
  { label: 'Rate Limits', value: '6', icon: Shield, color: '#6d28d9', sub: 'Aktiv ueberwacht' },
];

/* ─── Component ─── */

export default function APIOverviewPanel() {
  const [expandedApi, setExpandedApi] = useState(null);
  const [expandedTableId, setExpandedTableId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [copiedText, setCopiedText] = useState(null);

  // Filter APIs
  const filteredApis = useMemo(() => {
    return API_DATA.filter(api => {
      if (selectedCategory !== 'all' && api.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          api.name.toLowerCase().includes(q) ||
          (api.subtitle || '').toLowerCase().includes(q) ||
          api.description.toLowerCase().includes(q) ||
          api.baseUrl.toLowerCase().includes(q) ||
          api.usedBy.some(f => f.toLowerCase().includes(q)) ||
          api.endpoints.some(e => e.path.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)) ||
          api.unusedFeatures.some(f => f.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { all: API_DATA.length };
    API_DATA.forEach(api => {
      counts[api.category] = (counts[api.category] || 0) + 1;
    });
    return counts;
  }, []);

  // Copy handler
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // ─── CSV Export helpers ──────────────────────────────────────────
  const escapeCSV = (val) => {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const downloadCSV = (filename, csvContent) => {
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
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

  // Export a single table's fields as CSV
  const exportTableCSV = (table, apiName) => {
    if (!table.fields || table.fields.length === 0) return;
    const headers = ['Synced', 'Airtable Feld', 'Supabase Spalte', 'Typ', 'Bedeutung'];
    const rows = table.fields.map(f => [
      f.synced ? 'Ja' : 'Nein',
      f.airtable,
      f.supabase,
      f.type,
      f.interpretation || '',
    ]);
    const meta = [
      ['# Tabelle', table.name],
      ['# Table ID', table.id],
      ['# Supabase', table.supabaseTable || ''],
      ['# Sync', table.syncFrequency || ''],
      ['# Methode', table.syncMethod || ''],
      ['# Verwendet in', (table.usedIn || []).join(', ')],
      ['# API', apiName],
      [],
    ];
    const csv = [...meta, headers, ...rows].map(r => r.map(escapeCSV).join(',')).join('\n');
    downloadCSV(`${table.supabaseTable || table.name}_felder.csv`, csv);
  };

  // Export ALL tables of an API as a single CSV
  const exportAllTablesCSV = (api) => {
    const tablesWithFields = api.tables.filter(t => t.fields && t.fields.length > 0);
    if (tablesWithFields.length === 0) return;
    const headers = ['Tabelle', 'Table ID', 'Supabase', 'Sync', 'Synced', 'Airtable Feld', 'Supabase Spalte', 'Typ', 'Bedeutung', 'Verwendet in'];
    const rows = [];
    tablesWithFields.forEach(t => {
      t.fields.forEach(f => {
        rows.push([
          t.name,
          t.id,
          t.supabaseTable || '',
          t.syncFrequency || '',
          f.synced ? 'Ja' : 'Nein',
          f.airtable,
          f.supabase,
          f.type,
          f.interpretation || '',
          (t.usedIn || []).join(', '),
        ]);
      });
    });
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(',')).join('\n');
    downloadCSV(`${api.id}_alle_tabellen.csv`, csv);
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Globe size={20} className="text-blue-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">API & Service Overview</h2>
          <p className="text-xs text-slate-500">Alle integrierten APIs, Rechte und verfuegbare Funktionen</p>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {STATS.map((stat, i) => (
          <StatCard key={i} {...stat} />
        ))}
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suche nach API, Endpoint, Funktion, Datei..."
            className="w-full bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400/60 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <XCircle size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <FilterChip
              key={key}
              active={selectedCategory === key}
              onClick={() => setSelectedCategory(key)}
              label={cat.label}
              count={categoryCounts[key] || 0}
              color={cat.color}
            />
          ))}
        </div>
      </div>

      {/* ── API Cards ── */}
      <div className="space-y-2">
        {filteredApis.map((api) => {
          const isExpanded = expandedApi === api.id;
          const Icon = api.icon;

          return (
            <div
              key={api.id}
              className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm shadow-black/[0.03] transition-all"
            >
              {/* API Header (clickable) */}
              <button
                onClick={() => setExpandedApi(isExpanded ? null : api.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50/50 transition-colors"
              >
                {/* Color dot */}
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: api.color }} />

                {/* Icon */}
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: api.color + '12' }}>
                  <Icon size={16} style={{ color: api.color }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{api.name}</span>
                    {api.subtitle && (
                      <span className="text-xs text-slate-400 hidden sm:inline">({api.subtitle})</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{api.description}</p>
                </div>

                {/* Badges */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  {/* Status Badge */}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                    api.status === 'connected'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                      : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${api.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {api.statusLabel}
                  </span>

                  {/* Auth Method Tag */}
                  <span className="text-xs font-mono bg-slate-100/80 text-slate-500 px-2 py-1 rounded-lg flex items-center gap-1">
                    <Lock size={10} />
                    {api.authMethod}
                  </span>

                  {/* Rights Badge */}
                  <RightsBadge rights={api.rights} color={api.rightsColor} />
                </div>

                {/* Expand */}
                <div className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  <ChevronRight size={16} className="text-slate-400" />
                </div>
              </button>

              {/* Mobile badges (shown below header on small screens) */}
              <div className="sm:hidden flex items-center gap-2 px-4 pb-3 -mt-1 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  api.status === 'connected'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${api.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {api.statusLabel}
                </span>
                <RightsBadge rights={api.rights} color={api.rightsColor} />
                <span className="text-xs font-mono bg-slate-100/80 text-slate-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Lock size={9} />
                  {api.authMethod}
                </span>
              </div>

              {/* ── Expanded Detail ── */}
              {isExpanded && (
                <div className="border-t border-slate-200/60 bg-slate-50/30 p-4 space-y-4">
                  {/* Meta Row */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <MetaChip label="Base URL" value={api.baseUrl} onCopy={handleCopy} copied={copiedText === api.baseUrl} />
                    {api.secondaryUrl && (
                      <MetaChip label="Platform API" value={api.secondaryUrl} onCopy={handleCopy} copied={copiedText === api.secondaryUrl} />
                    )}
                    <MetaChip label="Rate Limit" value={api.rateLimit} />
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Auth Details */}
                    <div className="bg-white/70 rounded-xl border border-slate-200/40 p-3">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Key size={12} />
                        Authentifizierung
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        {api.authDetails.map((detail, i) => (
                          <div key={i} className="flex justify-between gap-2">
                            <span className="text-slate-400 shrink-0">{detail.label}</span>
                            <span className="font-mono text-slate-700 text-right truncate">{detail.value}</span>
                          </div>
                        ))}
                      </div>
                      {/* Env Vars */}
                      {api.envVars.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-200/40">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Environment Variables</div>
                          <div className="flex flex-wrap gap-1">
                            {api.envVars.map((v, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-xs font-mono bg-red-50/80 text-red-700 px-1.5 py-0.5 rounded cursor-pointer hover:bg-red-100/80" onClick={() => handleCopy(v)}>
                                <Key size={9} />
                                {v}
                                {copiedText === v ? <CheckCircle2 size={9} className="text-emerald-500" /> : <Copy size={9} className="text-red-400" />}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {api.envVars.length === 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-200/40">
                          <div className="text-[10px] text-slate-400 italic">Keine Env Variables noetig (Public Access)</div>
                        </div>
                      )}
                    </div>

                    {/* Rights */}
                    <div className="bg-white/70 rounded-xl border border-slate-200/40 p-3">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Shield size={12} />
                        Rechte & Zugriff
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div>
                          <div className={`inline-flex items-center gap-1.5 font-semibold ${
                            api.rightsColor === 'emerald' ? 'text-emerald-700' :
                            api.rightsColor === 'blue' ? 'text-blue-700' :
                            'text-amber-700'
                          }`}>
                            {api.rights === 'READ-ONLY' ? <Eye size={14} /> :
                             api.rights === 'WRITE (Incoming)' ? <ArrowRight size={14} /> :
                             <Edit3 size={14} />}
                            {api.rights}
                          </div>
                          <p className="text-slate-500 mt-1">{api.rightsDetail}</p>
                        </div>

                        {/* Rate Limit visual */}
                        <div className="mt-2 pt-2 border-t border-slate-200/40">
                          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                            <Clock size={11} />
                            <span className="uppercase tracking-wider text-[10px]">Rate Limit</span>
                          </div>
                          <span className="font-mono text-slate-600 text-xs">{api.rateLimit}</span>
                        </div>
                      </div>

                      {/* Modes (for Claude) */}
                      {api.modes && (
                        <div className="mt-3 pt-2 border-t border-slate-200/40">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Modi</div>
                          <div className="space-y-1">
                            {api.modes.map((mode, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-xs">
                                <span className="text-purple-500 mt-0.5"><Sparkles size={10} /></span>
                                <div>
                                  <span className="font-medium text-slate-700">{mode.name}</span>
                                  <span className="text-slate-400 ml-1">— {mode.description}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Metrics (for Vistar) */}
                      {api.metrics && (
                        <div className="mt-3 pt-2 border-t border-slate-200/40">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Metriken</div>
                          <div className="flex flex-wrap gap-1">
                            {api.metrics.map((m, i) => (
                              <span key={i} className="text-xs font-mono bg-pink-50/80 text-pink-700 px-1.5 py-0.5 rounded">{m}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Used By */}
                    <div className="bg-white/70 rounded-xl border border-slate-200/40 p-3">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Code size={12} />
                        Verwendet in
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {api.usedBy.map((file, i) => (
                          <span key={i} className="inline-flex items-center text-xs font-mono bg-blue-50/80 text-blue-700 px-2 py-1 rounded-lg">
                            {file}
                          </span>
                        ))}
                      </div>

                      {/* Endpoint count summary */}
                      <div className="mt-3 pt-2 border-t border-slate-200/40 text-xs text-slate-500">
                        <span className="font-mono">{api.endpoints.length}</span> Endpoints genutzt
                        {api.tables.length > 0 && (
                          <span> | <span className="font-mono">{api.tables.length}</span> Tabellen</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tables (if any) — expandable rows */}
                  {api.tables.length > 0 && (
                    <div className="bg-white/70 rounded-xl border border-slate-200/40 overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-200/40 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Database size={12} />
                          Tabellen / Collections ({api.tables.length})
                          {api.tables.some(t => t.fields) && (
                            <span className="text-[10px] text-slate-400 font-normal normal-case tracking-normal ml-2">Klicken zum Aufklappen</span>
                          )}
                        </h4>
                        {api.tables.some(t => t.fields && t.fields.length > 0) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); exportAllTablesCSV(api); }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/60 border border-slate-200/60 text-slate-600 hover:border-blue-400/60 hover:text-blue-600 transition-colors"
                            title="Alle Tabellen als CSV exportieren"
                          >
                            <Download size={11} />
                            Alle exportieren
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200/40 bg-slate-50/50">
                              <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider w-6"></th>
                              <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Table ID</th>
                              <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                              <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Verwendung</th>
                            </tr>
                          </thead>
                          <tbody>
                            {api.tables.map((table, i) => {
                              const tableKey = `${api.id}-${table.id}`;
                              const isTableExpanded = expandedTableId === tableKey;
                              return (
                                <React.Fragment key={i}>
                                  <tr
                                    className="border-b border-slate-100/60 hover:bg-blue-50/30 cursor-pointer transition-colors"
                                    onClick={() => setExpandedTableId(isTableExpanded ? null : tableKey)}
                                  >
                                    <td className="px-3 py-2 text-slate-400">
                                      <div className={`transition-transform ${isTableExpanded ? 'rotate-90' : ''}`}>
                                        <ChevronRight size={12} />
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-500 text-[11px]">
                                      <span
                                        className="cursor-pointer hover:text-slate-700"
                                        onClick={(e) => { e.stopPropagation(); handleCopy(table.id); }}
                                      >
                                        {table.id}
                                        {copiedText === table.id && <CheckCircle2 size={10} className="inline ml-1 text-emerald-500" />}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-700">{table.name}</td>
                                    <td className="px-3 py-2 text-slate-500">{table.usage}</td>
                                  </tr>

                                  {/* Expanded table detail */}
                                  {isTableExpanded && (
                                    <tr>
                                      <td colSpan={4} className="p-0">
                                        <div className="bg-slate-50/50 border-t border-slate-200/40 p-4 space-y-3">
                                          {/* Sync Info + Usage chips */}
                                          <div className="flex flex-wrap gap-3 text-xs">
                                            {table.syncFrequency && (
                                              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-mono">
                                                <RefreshCw size={10} /> {table.syncFrequency}
                                              </span>
                                            )}
                                            {table.syncMethod && (
                                              <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded-lg font-mono">
                                                {table.syncMethod}
                                              </span>
                                            )}
                                            {table.supabaseTable && (
                                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg font-mono">
                                                {'\u2192'} {table.supabaseTable}
                                              </span>
                                            )}
                                          </div>

                                          {/* Used in components */}
                                          {table.usedIn && table.usedIn.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                              <span className="text-xs text-slate-400 mr-1">Verwendet in:</span>
                                              {table.usedIn.map((comp, j) => (
                                                <span key={j} className="text-xs font-mono bg-blue-50/80 text-blue-700 px-2 py-0.5 rounded">
                                                  {comp}
                                                </span>
                                              ))}
                                            </div>
                                          )}

                                          {/* Fields table */}
                                          {table.fields && table.fields.length > 0 && (
                                            <div className="bg-white/70 rounded-xl border border-slate-200/40 overflow-hidden">
                                              <div className="px-3 py-2 border-b border-slate-200/40 flex items-center justify-between">
                                                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                                  Felder ({table.fields.length})
                                                </span>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[10px] text-slate-400">
                                                    {table.fields.filter(f => f.synced).length} synced / {table.fields.filter(f => !f.synced).length} verfuegbar
                                                  </span>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); exportTableCSV(table, api.name); }}
                                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100/80 text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                                    title={`${table.name} als CSV exportieren`}
                                                  >
                                                    <Download size={10} />
                                                    CSV
                                                  </button>
                                                </div>
                                              </div>
                                              <table className="w-full text-xs">
                                                <thead>
                                                  <tr className="border-b border-slate-200/40 bg-slate-50/50">
                                                    <th className="text-center px-2 py-1.5 w-6"></th>
                                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-500 uppercase tracking-wider">Airtable</th>
                                                    <th className="text-center px-1 py-1.5 text-slate-300 w-6">{'\u2192'}</th>
                                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-500 uppercase tracking-wider">Supabase</th>
                                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-500 uppercase tracking-wider">Typ</th>
                                                    <th className="text-left px-2 py-1.5 font-semibold text-slate-500 uppercase tracking-wider">Bedeutung</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {table.fields.map((field, k) => (
                                                    <tr key={k} className={`border-b border-slate-100/40 ${!field.synced ? 'opacity-50' : ''}`}>
                                                      <td className="text-center px-2 py-1.5">
                                                        {field.synced ? (
                                                          <CheckCircle2 size={11} className="text-emerald-500 mx-auto" />
                                                        ) : (
                                                          <div className="w-2.5 h-2.5 rounded-full border border-slate-300 mx-auto" />
                                                        )}
                                                      </td>
                                                      <td className="px-2 py-1.5 font-mono text-slate-700 text-[11px]">{field.airtable}</td>
                                                      <td className="text-center px-1 py-1.5 text-slate-300">{'\u2192'}</td>
                                                      <td className="px-2 py-1.5 font-mono text-blue-700 text-[11px]">{field.supabase}</td>
                                                      <td className="px-2 py-1.5">
                                                        <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                                                          field.type === 'text' ? 'bg-blue-50 text-blue-700' :
                                                          field.type === 'date' ? 'bg-purple-50 text-purple-700' :
                                                          field.type === 'number' ? 'bg-green-50 text-green-700' :
                                                          field.type === 'array' ? 'bg-orange-50 text-orange-700' :
                                                          field.type === 'attachment' ? 'bg-pink-50 text-pink-700' :
                                                          field.type === 'link' ? 'bg-cyan-50 text-cyan-700' :
                                                          'bg-slate-50 text-slate-600'
                                                        }`}>{field.type}</span>
                                                      </td>
                                                      <td className="px-2 py-1.5 text-[11px] text-slate-500 max-w-xs">{field.interpretation || ''}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Endpoints Table */}
                  <div className="bg-white/70 rounded-xl border border-slate-200/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-200/40">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Link size={12} />
                        Genutzte Endpoints ({api.endpoints.length})
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200/40 bg-slate-50/50">
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider w-20">Method</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Endpoint</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Beschreibung</th>
                          </tr>
                        </thead>
                        <tbody>
                          {api.endpoints.map((ep, i) => (
                            <tr key={i} className="border-b border-slate-100/60 hover:bg-slate-50/50">
                              <td className="px-3 py-2">
                                <MethodBadge method={ep.method} />
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-700 text-[11px]">{ep.path}</td>
                              <td className="px-3 py-2 text-slate-500 flex items-center gap-1.5">
                                <ep.icon size={11} className="text-slate-400 shrink-0" />
                                {ep.description}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Unused Features */}
                  <div className="bg-white/70 rounded-xl border border-slate-200/40 p-3">
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlertCircle size={12} className="text-amber-500" />
                      Verfuegbar aber nicht genutzt
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {api.unusedFeatures.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-slate-300 mt-0.5 shrink-0">
                            <Unlock size={11} />
                          </span>
                          <span className="text-slate-500">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredApis.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            Keine APIs gefunden fuer &quot;{searchQuery}&quot;
          </div>
        )}
      </div>

      {/* ── Architecture Overview ── */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm shadow-black/[0.03]">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Server size={16} className="text-blue-500" />
          Architektur & Datenfluss
        </h3>
        <div className="font-mono text-xs text-slate-600 leading-relaxed bg-slate-50/80 rounded-xl p-4 border border-slate-200/40 overflow-x-auto">
          <pre className="whitespace-pre">{`
  EXTERNE DATENQUELLEN                    NETLIFY FUNCTIONS                     DATENBANK & FRONTEND
  ========================               ========================              ========================

  Airtable (13 Tabellen)  ──▶  sync-airtable.js (2h)     ──▶  Supabase PostgreSQL
       READ + WRITE                                                  (23 Tabellen)
       PAT Auth                                                      Service Role Key
                                                                          │
  Google Sheets (CSV)     ──▶  sheets-proxy.js            ──▶  display_heartbeats
       READ-ONLY                sync-airtable.js                 Append-only (~170K Rows)
       Public Export                                                      │
                                                                          ▼
  Vistar SSP              ──▶  vistar-sync.js (4h)        ──▶  vistar_venue_health
       READ-ONLY                vistar-proxy.js                  Revenue + Impressions
       Session Cookie                                                     │
                                                                          ▼
  Superchat               ──▶  superchat-proxy.js         ──▶  React Frontend (App.jsx)
       READ + WRITE             install-booker-book.js           Desktop: ~40K Rows
       API Key                                                   Mobile:  RPC (2KB JSON)
                                                                          │
  Anthropic Claude        ──▶  chat-proxy.js (SSE)        ──▶  ChatAssistant.jsx
       READ (Completions)       buildChatContext()               Streaming Responses
       Bearer Token             feedback → Supabase              Agent Memory
                                                                          │
  Make.com Webhooks       ──▶  install-booker-invite.js   ──▶  Supabase / Airtable
       WRITE (Incoming)         bank-import.js                   Write-back moeglich
       API Key                  (XLSX parsing)
`}</pre>
        </div>

        {/* Rights Summary Grid */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <RightsSummaryCard
            icon={Eye}
            title="Read-Only APIs"
            color="blue"
            items={[
              'Vistar SSP (Reports, Networks)',
              'Google Sheets (CSV Export)',
            ]}
          />
          <RightsSummaryCard
            icon={Edit3}
            title="Read + Write APIs"
            color="emerald"
            items={[
              'Airtable (Full CRUD)',
              'Supabase (Full + Auth + Storage)',
              'Superchat (Messages, Contacts)',
              'Claude (Completions only)',
            ]}
          />
          <RightsSummaryCard
            icon={ArrowRight}
            title="Incoming Only"
            color="amber"
            items={[
              'Make.com (Webhook Triggers)',
            ]}
          />
          <RightsSummaryCard
            icon={Shield}
            title="Security Model"
            color="purple"
            items={[
              'Alle Keys in Netlify Env Vars',
              'RLS Policies auf Supabase',
              'Proxy-Layer fuer Rate Limits',
              'Session-Cache (Vistar ~7h)',
            ]}
          />
        </div>

        {/* Environment Variables Summary */}
        <div className="mt-4 bg-red-50/30 rounded-xl p-3 border border-red-200/30">
          <h4 className="text-xs font-semibold text-red-800 flex items-center gap-1.5 mb-2">
            <Key size={12} />
            Alle Environment Variables (Netlify)
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {[
              'AIRTABLE_TOKEN',
              'SUPABASE_URL',
              'SUPABASE_ANON_KEY',
              'SUPABASE_SERVICE_ROLE_KEY',
              'VISTAR_EMAIL',
              'VISTAR_PASSWORD',
              'SUPERCHAT_API_KEY',
              'ANTHROPIC_API_KEY',
              'BOOKER_API_KEY',
            ].map((v, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs font-mono bg-red-100/60 text-red-800 px-2 py-1 rounded-lg cursor-pointer hover:bg-red-100"
                onClick={() => handleCopy(v)}
              >
                <Lock size={9} />
                {v}
                {copiedText === v && <CheckCircle2 size={9} className="text-emerald-500" />}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <Info size={12} className="text-blue-400 mt-0.5 shrink-0" />
          <span>
            <strong>Architektur-Prinzip:</strong> Alle externen API-Calls laufen ueber Netlify Functions (Server-side Proxy).
            Das Frontend spricht NUR mit Supabase (Anon Key + RLS). API-Keys sind nie im Browser sichtbar.
          </span>
        </div>
      </div>

      {/* ── Sync Schedule Overview ── */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm shadow-black/[0.03]">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <RefreshCw size={16} className="text-amber-500" />
          Sync-Schedule & Cron Jobs
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200/60">
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Job</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Quelle</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Ziel</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Frequenz</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider">Methode</th>
              </tr>
            </thead>
            <tbody>
              {[
                { job: 'sync-airtable.js', source: 'Airtable (13 Tables)', target: 'Supabase', freq: 'Alle 2 Stunden', method: 'Inkrementell (LAST_MODIFIED_TIME)' },
                { job: 'sync-airtable.js', source: 'Google Sheets (CSV)', target: 'display_heartbeats', freq: 'Alle 2 Stunden', method: 'Append-only INSERT' },
                { job: 'vistar-sync-scheduled.js', source: 'Vistar SSP', target: 'vistar_venue_health', freq: 'Alle 4 Stunden', method: 'Upsert (venue_id + date)' },
                { job: 'sync-attachments-scheduled.js', source: 'Airtable Attachments', target: 'Supabase Storage', freq: 'Alle 30 Minuten', method: 'Differential (URL hash check)' },
              ].map((row, i) => (
                <tr key={i} className="border-b border-slate-100/60 hover:bg-slate-50/30">
                  <td className="px-3 py-2 font-mono text-blue-700">{row.job}</td>
                  <td className="px-3 py-2 text-slate-700">{row.source}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{row.target}</td>
                  <td className="px-3 py-2">
                    <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-mono">{row.freq}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-Components ─── */

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-3.5 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '12' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-xl font-bold font-mono text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{sub}</div>
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

function MetaChip({ label, value, onCopy, copied }) {
  return (
    <span className="inline-flex items-center gap-1 bg-slate-100/80 text-slate-600 px-2 py-1 rounded-lg font-mono text-xs max-w-full">
      <span className="text-slate-400 font-sans shrink-0">{label}:</span>
      <span className="text-slate-700 truncate">{value}</span>
      {onCopy && (
        <button onClick={() => onCopy(value)} className="text-slate-300 hover:text-slate-500 ml-0.5 shrink-0">
          {copied ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Copy size={10} />}
        </button>
      )}
    </span>
  );
}

function RightsBadge({ rights, color }) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    blue: 'bg-blue-50 text-blue-700 border-blue-200/60',
    amber: 'bg-amber-50 text-amber-700 border-amber-200/60',
  };

  const iconMap = {
    'READ-ONLY': Eye,
    'READ + WRITE': Edit3,
    'READ + WRITE (Full)': Edit3,
    'READ (Completions)': Eye,
    'WRITE (Incoming)': ArrowRight,
  };

  const RIcon = iconMap[rights] || Shield;

  return (
    <span className={`text-xs font-mono px-2 py-1 rounded-lg flex items-center gap-1 border ${colorClasses[color] || colorClasses.blue}`}>
      <RIcon size={10} />
      {rights}
    </span>
  );
}

function MethodBadge({ method }) {
  const colors = {
    GET: 'bg-blue-50 text-blue-700',
    POST: 'bg-emerald-50 text-emerald-700',
    PATCH: 'bg-amber-50 text-amber-700',
    PUT: 'bg-orange-50 text-orange-700',
    DELETE: 'bg-red-50 text-red-700',
  };

  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${colors[method] || 'bg-slate-50 text-slate-600'}`}>
      {method}
    </span>
  );
}

function RightsSummaryCard({ icon: Icon, title, color, items }) {
  const colorClasses = {
    blue: 'bg-blue-50/50 border-blue-200/30 text-blue-800',
    emerald: 'bg-emerald-50/50 border-emerald-200/30 text-emerald-800',
    amber: 'bg-amber-50/50 border-amber-200/30 text-amber-800',
    purple: 'bg-purple-50/50 border-purple-200/30 text-purple-800',
  };
  const itemColor = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    purple: 'text-purple-700',
  };

  return (
    <div className={`rounded-xl p-3 border ${colorClasses[color]}`}>
      <div className={`flex items-center gap-2 text-xs font-semibold mb-1.5 ${colorClasses[color].split(' ').pop()}`}>
        <Icon size={14} />
        {title}
      </div>
      <div className={`text-xs space-y-1 ${itemColor[color]}`}>
        {items.map((item, i) => (
          <div key={i}>{'\u2022'} {item}</div>
        ))}
      </div>
    </div>
  );
}
