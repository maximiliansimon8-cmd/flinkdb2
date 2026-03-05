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
  database: { label: 'Datenbank', color: '#007AFF' },
  messaging: { label: 'Messaging', color: '#10b981' },
  dooh: { label: 'DOOH', color: '#ec4899' },
  ai: { label: 'AI', color: '#AF52DE' },
  automation: { label: 'Automation', color: '#FF9500' },
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
    description: 'Zentrale Datenquelle fuer alle Flink-Standortdaten, Tasks, Hardware und Installationen. Airtable ist der "Master" — wir lesen und schreiben.',
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
          // ── Synced fields (in TASK_FIELDS / mapTask) ──
          { airtable: 'Task Title', supabase: 'title', type: 'text', synced: true, interpretation: 'Titel der Aufgabe' },
          { airtable: 'Task Type', supabase: 'task_type_select', type: 'link', synced: true, interpretation: 'Aufgabentyp (Multi-Select)' },
          { airtable: 'Partner', supabase: 'task_type', type: 'link', synced: true, interpretation: 'Verknuepfter Partner' },
          { airtable: 'Company (from Partner)', supabase: 'task_type', type: 'text', synced: true, interpretation: 'Firmenname des Partners (Lookup, auch fuer task_type)' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'New, In Progress, Completed, Follow Up, On Hold, In Review' },
          { airtable: 'Priority', supabase: 'priority', type: 'text', synced: true, interpretation: 'High, Medium, Low' },
          { airtable: 'Due Date', supabase: 'due_date', type: 'text', synced: true, interpretation: 'Faelligkeit' },
          { airtable: 'Description', supabase: 'description', type: 'text', synced: true, interpretation: 'Aufgaben-Beschreibung' },
          { airtable: 'Created time', supabase: 'created_time', type: 'text', synced: true, interpretation: 'Erstellungszeitpunkt' },
          { airtable: 'Responsible User', supabase: 'responsible_user', type: 'text', synced: true, interpretation: 'Zustaendiger Benutzer' },
          { airtable: 'Assigned', supabase: 'assigned', type: 'text', synced: true, interpretation: 'Zugewiesene Personen (Collaborator)' },
          { airtable: 'Created by', supabase: 'created_by', type: 'computed', synced: true, interpretation: 'Erstellt von (Collaborator)' },
          { airtable: 'Display ID (from Displays )', supabase: 'display_ids', type: 'link', synced: true, interpretation: 'Verknuepfte Displays (TRAILING SPACE!)' },
          { airtable: 'Location Name (from Locations)', supabase: 'location_names', type: 'link', synced: true, interpretation: 'Verknuepfte Standorte (Lookup)' },
          { airtable: 'Overdue', supabase: 'overdue', type: 'text', synced: true, interpretation: 'Berechnet: Overdue wenn due_date < heute' },
          { airtable: 'completed_task_date', supabase: 'completed_date', type: 'text', synced: true, interpretation: 'Abschlussdatum der Aufgabe' },
          { airtable: 'completed_task_by', supabase: 'completed_by', type: 'computed', synced: true, interpretation: 'Aufgabe abgeschlossen von (Collaborator)' },
          { airtable: 'Attachments', supabase: 'attachments', type: 'attachment', synced: true, interpretation: 'Angehaengte Dateien' },
          { airtable: 'Online Status  (from Displays )', supabase: 'online_status', type: 'link', synced: true, interpretation: 'DOUBLE SPACE + TRAILING SPACE! Display-Status (Lookup)' },
          { airtable: 'Kommentar Nacharbeit', supabase: 'nacharbeit_kommentar', type: 'text', synced: true, interpretation: 'Nacharbeitsnotizen' },
          { airtable: 'external_visiblity', supabase: 'external_visibility', type: 'text', synced: true, interpretation: 'TYPO: visiblity statt visibility' },
          { airtable: 'Live since (from Displays )', supabase: 'live_since', type: 'link', synced: true, interpretation: 'Live-Datum (Lookup, TRAILING SPACE!)' },
          { airtable: 'Status Installation (from Installation)', supabase: 'installation_status', type: 'link', synced: true, interpretation: 'Installationsstatus (Lookup)' },
          { airtable: 'Integrator (from Installation)', supabase: 'integrator', type: 'link', synced: true, interpretation: 'Integrator-Firma (Lookup)' },
          { airtable: 'Aufbau Datum (from Installation)', supabase: 'install_date', type: 'link', synced: true, interpretation: 'Installationsdatum (Lookup)' },
          { airtable: 'Display Serial Number (from Installation)', supabase: 'display_serial_number', type: 'link', synced: true, interpretation: 'Display-Seriennummer (Lookup)' },
          { airtable: 'Allgemeine Bemerkungen (from Installation)', supabase: 'install_remarks', type: 'link', synced: true, interpretation: 'Installations-Bemerkungen (Lookup)' },
          { airtable: 'Installationsart (from Installation)', supabase: 'install_type', type: 'link', synced: true, interpretation: 'Installationsart (Lookup)' },
          { airtable: 'Superchat', supabase: 'superchat', type: 'text', synced: true, interpretation: 'Superchat-Konversations-Link' },
          { airtable: 'Status changed by', supabase: 'status_changed_by', type: 'computed', synced: true, interpretation: 'Wer hat den Status zuletzt geaendert' },
          { airtable: 'Status changed date', supabase: 'status_changed_date', type: 'text', synced: true, interpretation: 'Wann wurde der Status zuletzt geaendert' },
          { airtable: 'JET ID (from Locations)', supabase: 'jet_ids', type: 'link', synced: true, interpretation: 'JET Standort-ID (Lookup)' },
          { airtable: 'City (from Locations)', supabase: 'cities', type: 'link', synced: true, interpretation: 'Stadt (Lookup)' },
          // ── NOT synced (53 total fields from Airtable Metadata API) ──
          { airtable: 'City (from Locations)', supabase: '—', type: 'link', synced: false, interpretation: 'Stadt vom Standort (Lookup, Duplikat?)' },
          { airtable: 'Created', supabase: '—', type: 'text', synced: false, interpretation: 'Erstellungsdatum' },
          { airtable: 'Days Until Due', supabase: '—', type: 'number', synced: false, interpretation: 'Tage bis Faelligkeit' },
          { airtable: 'Description formula', supabase: '—', type: 'text', synced: false, interpretation: 'Beschreibung als Formelfeld' },
          { airtable: 'Displays ', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Displays (TRAILING SPACE!)' },
          { airtable: 'Displays (from Locations)', supabase: '—', type: 'link', synced: false, interpretation: 'Displays vom Standort (Lookup)' },
          { airtable: 'Due Date 7 Day', supabase: '—', type: 'text', synced: false, interpretation: '7-Tage Faelligkeits-Berechnung' },
          { airtable: 'Eigentum Sticker (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Eigentum-Sticker Status (Lookup)' },
          { airtable: 'Email (from Partner)', supabase: '—', type: 'link', synced: false, interpretation: 'Partner E-Mail (Lookup)' },
          { airtable: 'Folie entfernt (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Schutzfolie entfernt? (Lookup)' },
          { airtable: 'Fotos \u2013 Au\u00dfenansicht (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Aussenansicht-Fotos (Lookup)' },
          { airtable: 'Fotos \u2013 Rueckseite 1m/3m (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Rueckseiten-Fotos (Lookup)' },
          { airtable: 'Fotos \u2013 SIM Karte (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'SIM-Karten-Fotos (Lookup)' },
          { airtable: 'Fotos \u2013 Standort vorher (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Fotos vorher (Lookup)' },
          { airtable: 'Handout (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Handout uebergeben? (Lookup)' },
          { airtable: 'Installation', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Installation' },
          { airtable: 'Installationen (from Locations)', supabase: '—', type: 'link', synced: false, interpretation: 'Installationen des Standorts (Lookup)' },
          { airtable: 'Installationsprotokoll (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Installationsprotokoll (Lookup)' },
          { airtable: 'Integrator Nachpruefung erforderlich (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Integrator-Nachpruefung noetig? (Lookup)' },
          { airtable: 'LTE aktiv (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'LTE-Verbindung aktiv? (Lookup)' },
          { airtable: 'Live Display Locations copy', supabase: '—', type: 'text', synced: false, interpretation: 'Display-Standort Kopie (Hilfsfeld)' },
          { airtable: 'Locations', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Standorte' },
          { airtable: 'Priority Adjustment Suggestion', supabase: '—', type: 'computed', synced: false, interpretation: 'KI-Vorschlag zur Prioritaetsanpassung' },
          { airtable: 'SIM eingesteckt (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'SIM eingesteckt? (Lookup)' },
          { airtable: 'Serveranbindung (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Server-Anbindung ok? (Lookup)' },
          { airtable: 'Street (from Locations)', supabase: '—', type: 'link', synced: false, interpretation: 'Strasse (Lookup)' },
          { airtable: 'Street Number (from Locations)', supabase: '—', type: 'link', synced: false, interpretation: 'Hausnummer (Lookup)' },
          { airtable: 'Suche Location (from Installation)', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Suche (Lookup)' },
          { airtable: 'Task Summary', supabase: '—', type: 'computed', synced: false, interpretation: 'Zusammenfassung der Aufgabe (AI/Computed)' },
          { airtable: 'Technikers', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Techniker' },
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
          // ── Synced fields (in COMMUNICATION_FIELDS / mapCommunication) ──
          { airtable: 'Channel', supabase: 'channel', type: 'text', synced: true, interpretation: 'Email, WhatsApp, SMS, Phone' },
          { airtable: 'Direction', supabase: 'direction', type: 'text', synced: true, interpretation: 'Inbound, Outbound' },
          { airtable: 'Subject', supabase: 'subject', type: 'text', synced: true, interpretation: 'Betreff der Nachricht' },
          { airtable: 'Message', supabase: 'message', type: 'text', synced: true, interpretation: 'Nachrichteninhalt' },
          { airtable: 'Timestamp', supabase: 'timestamp', type: 'text', synced: true, interpretation: 'Zeitstempel' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Sent, Received, Pending' },
          { airtable: 'Recipient Name', supabase: 'recipient_name', type: 'text', synced: true, interpretation: 'Empfaenger' },
          { airtable: 'Recipient Contact', supabase: 'recipient_contact', type: 'text', synced: true, interpretation: 'Kontaktdaten des Empfaengers' },
          { airtable: 'Sender', supabase: 'sender', type: 'text', synced: true, interpretation: 'Absender' },
          { airtable: 'External ID', supabase: 'external_id', type: 'text', synced: true, interpretation: 'Superchat Message ID' },
          { airtable: 'Location', supabase: 'location_ids', type: 'link', synced: true, interpretation: 'Verknuepfter Standort' },
          { airtable: 'Location Name (from Location)', supabase: 'location_names', type: 'link', synced: true, interpretation: 'Standortname (Lookup)' },
          { airtable: 'Display ID (from Location)', supabase: 'display_ids', type: 'link', synced: true, interpretation: 'Display-ID (Lookup)' },
          { airtable: 'JET ID (from Location)', supabase: 'jet_ids', type: 'link', synced: true, interpretation: 'JET Standort-ID (Lookup)' },
          { airtable: 'Related Task', supabase: 'related_task', type: 'link', synced: true, interpretation: 'Verknuepfte Aufgabe' },
          // ── NOT synced (visible in Metadata API but not fetched) ──
          { airtable: 'Index', supabase: '—', type: 'number', synced: false, interpretation: 'Laufende Nummer / Sortier-Index' },
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
          // ── Synced fields (in DISPLAY_FIELDS / mapDisplay) ──
          { airtable: 'Display ID', supabase: 'display_id', type: 'text', synced: true, interpretation: 'Eindeutige Display-Kennung' },
          { airtable: 'display_name', supabase: 'display_name', type: 'text', synced: true, interpretation: 'Anzeigename des Displays' },
          { airtable: 'Online Status ', supabase: 'online_status', type: 'text', synced: true, interpretation: 'TRAILING SPACE! Werte: online, offline' },
          { airtable: 'Live since', supabase: 'live_since', type: 'date', synced: true, interpretation: 'Aktivierungsdatum' },
          { airtable: 'deinstall_date', supabase: 'deinstall_date', type: 'date', synced: true, interpretation: 'Wenn gesetzt = abgebaut' },
          { airtable: 'Screen Type', supabase: 'screen_type', type: 'text', synced: true, interpretation: 'WD (Window Display) etc.' },
          { airtable: 'Screen Size ', supabase: 'screen_size', type: 'text', synced: true, interpretation: 'TRAILING SPACE! Groesse in Zoll' },
          { airtable: 'Navori Venue ID (from Installationen)', supabase: 'navori_venue_id', type: 'link', synced: true, interpretation: 'Navori CMS Venue ID (Lookup von Installationen)' },
          { airtable: 'Location Name', supabase: 'location_name', type: 'link', synced: true, interpretation: 'Standortname (Lookup)' },
          { airtable: 'City', supabase: 'city', type: 'link', synced: true, interpretation: 'Stadt (Lookup)' },
          { airtable: 'JET ID (from JET ID)', supabase: 'jet_id', type: 'link', synced: true, interpretation: 'Standort-ID (Lookup)' },
          { airtable: 'SoV Partner Ad', supabase: 'sov_partner_ad', type: 'number', synced: true, interpretation: 'Share of Voice Partner-Anteil' },
          { airtable: 'Display Table ID', supabase: 'display_table_id', type: 'text', synced: true, interpretation: 'Airtable Record ID des Displays' },
          { airtable: 'Street', supabase: 'street', type: 'link', synced: true, interpretation: 'Strasse (Lookup)' },
          { airtable: 'Street Number', supabase: 'street_number', type: 'link', synced: true, interpretation: 'Hausnummer (Lookup)' },
          { airtable: 'Postal Code', supabase: 'postal_code', type: 'link', synced: true, interpretation: 'Postleitzahl (Lookup)' },
          { airtable: 'Created', supabase: 'created_at', type: 'text', synced: true, interpretation: 'Erstellungsdatum des Records' },
          // ── NOT synced (62 total fields from Airtable Metadata API) ──
          { airtable: 'Akquise Link', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfung zur Akquise' },
          { airtable: 'Attachment Summary', supabase: '—', type: 'computed', synced: false, interpretation: 'Zusammenfassung der Anhaenge' },
          { airtable: 'Aufbau Datum (from Installationen)', supabase: '—', type: 'link', synced: false, interpretation: 'Installationsdatum (Lookup)' },
          { airtable: 'City count', supabase: '—', type: 'link', synced: false, interpretation: 'Anzahl Standorte in der Stadt' },
          { airtable: 'Contact Person', supabase: '—', type: 'link', synced: false, interpretation: 'Ansprechpartner (Lookup)' },
          { airtable: 'Contact Phone', supabase: '—', type: 'link', synced: false, interpretation: 'Kontakt-Telefon (Lookup)' },
          { airtable: 'Contact email', supabase: '—', type: 'link', synced: false, interpretation: 'Kontakt-Email (Lookup)' },
          { airtable: 'Create Date Short', supabase: '—', type: 'text', synced: false, interpretation: 'Kurzformat Erstellungsdatum' },
          { airtable: 'Created By', supabase: '—', type: 'computed', synced: false, interpretation: 'Erstellt von (Collaborator)' },
          { airtable: 'Date of Inspection (from Installation Inspections)', supabase: '—', type: 'link', synced: false, interpretation: 'Inspektionsdatum (Lookup)' },
          { airtable: 'Display laeuft im Regelbetrieb (ca. 6-22Uhr) (from Installation Inspections)', supabase: '—', type: 'link', synced: false, interpretation: 'Regelbetrieb-Status (Lookup)' },
          { airtable: 'Email', supabase: '—', type: 'link', synced: false, interpretation: 'E-Mail (Lookup)' },
          { airtable: 'FAW Daten (from Akquise Link)', supabase: '—', type: 'link', synced: false, interpretation: 'FAW-Daten (Lookup von Akquise)' },
          { airtable: 'Formatted Germany Mobile Phone (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'Formatierte Mobilnummer (Lookup)' },
          { airtable: 'Fotos \u2013 Au\u00dfenansicht (from Installationen)', supabase: '—', type: 'link', synced: false, interpretation: 'Aussenansicht-Fotos (Lookup)' },
          { airtable: 'Impressions per Spot', supabase: '—', type: 'number', synced: false, interpretation: 'Impressions pro Werbespot' },
          { airtable: 'Installation Inspections', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Inspektionen' },
          { airtable: 'Installationen', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Installationen' },
          { airtable: 'Installationsprotokoll (from Installationen)', supabase: '—', type: 'link', synced: false, interpretation: 'Installationsprotokoll (Lookup)' },
          { airtable: 'Is the display on? (from Installation Inspections)', supabase: '—', type: 'link', synced: false, interpretation: 'Display eingeschaltet? (Lookup)' },
          { airtable: 'Is the display present? (from Installation Inspections)', supabase: '—', type: 'link', synced: false, interpretation: 'Display vorhanden? (Lookup)' },
          { airtable: 'JET ID', supabase: '—', type: 'link', synced: false, interpretation: 'JET Stammdaten Verknuepfung' },
          { airtable: 'Latitude', supabase: '—', type: 'link', synced: false, interpretation: 'Breitengrad (Lookup)' },
          { airtable: 'Location Categories', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Kategorien (Lookup)' },
          { airtable: 'Location recID', supabase: '—', type: 'link', synced: false, interpretation: 'Standort Record-ID (Lookup)' },
          { airtable: 'Longtitude', supabase: '—', type: 'link', synced: false, interpretation: 'Laengengrad (Lookup, TYPO: Longtitude)' },
          { airtable: 'OPS NR', supabase: '—', type: 'link', synced: false, interpretation: 'OPS-Nummer (Lookup)' },
          { airtable: 'OPS-SN', supabase: '—', type: 'link', synced: false, interpretation: 'OPS-Seriennummer (Lookup)' },
          { airtable: 'OPS_Player_inventory', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepftes OPS-Inventar' },
          { airtable: 'Partner Creative Team Notes', supabase: '—', type: 'text', synced: false, interpretation: 'Notizen vom Partner-Creative-Team' },
          { airtable: 'Restaurant Werbemittel erstellt & hochgeladen', supabase: '—', type: 'text', synced: false, interpretation: 'Restaurant-Werbemittel Status' },
          { airtable: 'Search Location', supabase: '—', type: 'text', synced: false, interpretation: 'Suchfeld fuer Standort' },
          { airtable: 'Street & Number', supabase: '—', type: 'text', synced: false, interpretation: 'Strasse und Hausnummer kombiniert' },
          { airtable: 'Task creation trigger', supabase: '—', type: 'text', synced: false, interpretation: 'Trigger fuer automatische Task-Erstellung' },
          { airtable: 'Tasks', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Tasks' },
          { airtable: 'Technikers', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Techniker' },
          { airtable: 'VAC / Woche (from Akquise Link)', supabase: '—', type: 'link', synced: false, interpretation: 'VAC pro Woche (Lookup)' },
          { airtable: 'Vertrag (PDF) (from Akquise Link)', supabase: '—', type: 'link', synced: false, interpretation: 'Vertrags-PDF (Lookup)' },
          { airtable: 'Vorname', supabase: '—', type: 'computed', synced: false, interpretation: 'Vorname (Collaborator/Computed)' },
          { airtable: 'adress_combined', supabase: '—', type: 'text', synced: false, interpretation: 'Kombinierte Adresse' },
          { airtable: 'dVAC / Month (from Akquise Link)', supabase: '—', type: 'link', synced: false, interpretation: 'dVAC pro Monat (Lookup)' },
          { airtable: 'dVAC per Day (from Akquise Link)', supabase: '—', type: 'link', synced: false, interpretation: 'dVAC pro Tag (Lookup)' },
          { airtable: 'formatted_german_phone_t', supabase: '—', type: 'text', synced: false, interpretation: 'Formatierte deutsche Telefonnummer' },
          { airtable: 'recordID (from OPS_Player_inventory)', supabase: '—', type: 'link', synced: false, interpretation: 'OPS Record-ID (Lookup)' },
          { airtable: 'superchat_id', supabase: '—', type: 'link', synced: false, interpretation: 'Superchat-ID (Lookup)' },
          { airtable: 'superchat_id_text', supabase: '—', type: 'text', synced: false, interpretation: 'Superchat-ID als Text' },
        ],
      },
      {
        id: 'tblLJ1S7OUhc2w5Jw',
        name: 'Flink Stammdaten',
        usage: 'Kontakt- & Adressdaten',
        supabaseTable: 'stammdaten',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['StammdatenView', 'DisplayDetail', 'InstallBooker'],
        fields: [
          // ── Synced fields (in STAMMDATEN_FIELDS / mapStammdaten) ──
          { airtable: 'JET ID', supabase: 'jet_id', type: 'text', synced: true, interpretation: 'Standort-ID (JET-STADT-NR)' },
          { airtable: 'Display ID', supabase: 'display_ids', type: 'text', synced: true, interpretation: 'Alle Display-IDs dieses Standorts' },
          { airtable: 'Location Name', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Name des Standorts' },
          { airtable: 'Contact Person', supabase: 'contact_person', type: 'text', synced: true, interpretation: 'Ansprechpartner' },
          { airtable: 'Contact Email', supabase: 'contact_email', type: 'text', synced: true, interpretation: 'Kontakt E-Mail' },
          { airtable: 'Contact Phone', supabase: 'contact_phone', type: 'text', synced: true, interpretation: 'Kontakt Telefon' },
          { airtable: 'Location Email', supabase: 'location_email', type: 'text', synced: true, interpretation: 'E-Mail des Standorts' },
          { airtable: 'Location Phone', supabase: 'location_phone', type: 'text', synced: true, interpretation: 'Telefon des Standorts' },
          { airtable: 'Legal Entity', supabase: 'legal_entity', type: 'text', synced: true, interpretation: 'Rechtsform / Juristische Person' },
          { airtable: 'Street', supabase: 'street', type: 'text', synced: true, interpretation: 'Strasse' },
          { airtable: 'Street Number', supabase: 'street_number', type: 'text', synced: true, interpretation: 'Hausnummer' },
          { airtable: 'Postal Code', supabase: 'postal_code', type: 'text', synced: true, interpretation: 'PLZ' },
          { airtable: 'City', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt' },
          { airtable: 'Lead Status  (from Akquise)', supabase: 'lead_status', type: 'link', synced: true, interpretation: 'DOUBLE SPACE! Akquise-Status (Lookup)' },
          { airtable: 'Status', supabase: 'display_status', type: 'text', synced: true, interpretation: 'Display-Status' },
          // ── NOT synced (36 total fields from Airtable Metadata API) ──
          { airtable: 'Akquise', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfung zur Akquise-Tabelle' },
          { airtable: 'Akquise Freigabedatum', supabase: '—', type: 'text', synced: false, interpretation: 'Datum der Akquise-Freigabe' },
          { airtable: 'Akquise Freigegeben von', supabase: '—', type: 'computed', synced: false, interpretation: 'Freigabe durch (Collaborator)' },
          { airtable: 'Count (Installationen)', supabase: '—', type: 'number', synced: false, interpretation: 'Anzahl Installationen am Standort' },
          { airtable: 'Created', supabase: '—', type: 'text', synced: false, interpretation: 'Erstellungsdatum des Records' },
          { airtable: 'Created By', supabase: '—', type: 'computed', synced: false, interpretation: 'Erstellt von (Collaborator)' },
          { airtable: 'Formatted Germany Mobile Phone', supabase: '—', type: 'computed', synced: false, interpretation: 'Formatierte deutsche Mobilnummer' },
          { airtable: 'JET SEARCH', supabase: '—', type: 'text', synced: false, interpretation: 'Suchfeld (JET ID + Name)' },
          { airtable: 'JET SEARCH 2', supabase: '—', type: 'text', synced: false, interpretation: 'Erweitertes Suchfeld' },
          { airtable: 'Koordinaten', supabase: '—', type: 'text', synced: false, interpretation: 'Kombiniertes Koordinaten-Feld' },
          { airtable: 'Latitude', supabase: '—', type: 'text', synced: false, interpretation: 'Breitengrad' },
          { airtable: 'Location', supabase: '—', type: 'text', synced: false, interpretation: 'Standort (Freitext)' },
          { airtable: 'Location Search', supabase: '—', type: 'text', synced: false, interpretation: 'Standort-Suchfeld' },
          { airtable: 'Longitude', supabase: '—', type: 'text', synced: false, interpretation: 'Laengengrad' },
          { airtable: 'Streetview Link', supabase: '—', type: 'computed', synced: false, interpretation: 'Google Streetview Link' },
          { airtable: 'Weischer 30m Frequency', supabase: '—', type: 'number', synced: false, interpretation: 'Weischer Frequenz 30m Radius' },
          { airtable: 'Zur Akquise freigegeben?', supabase: '—', type: 'boolean', synced: false, interpretation: 'Ist der Standort zur Akquise freigegeben?' },
          { airtable: 'email', supabase: '—', type: 'text', synced: false, interpretation: 'E-Mail (Hilfsfeld)' },
          { airtable: 'phone', supabase: '—', type: 'text', synced: false, interpretation: 'Telefon (Hilfsfeld)' },
          { airtable: 'recordID', supabase: '—', type: 'text', synced: false, interpretation: 'Airtable Record-ID' },
          { airtable: 'regular_close_time_weekdays', supabase: '—', type: 'computed', synced: false, interpretation: 'Schliesszeit Wochentags' },
          { airtable: 'regular_close_time_weekdend', supabase: '—', type: 'computed', synced: false, interpretation: 'Schliesszeit Wochenende (TYPO: weekdend)' },
          { airtable: 'regular_open_time', supabase: '—', type: 'computed', synced: false, interpretation: 'Oeffnungszeit' },
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
          // ── Synced fields (in ACQUISITION_FIELDS / mapAcquisition) ──
          { airtable: 'Akquise ID', supabase: 'akquise_id', type: 'number', synced: true, interpretation: 'Eindeutige Akquise-ID (Auto-Increment)' },
          { airtable: 'Lead_Status', supabase: 'lead_status', type: 'text', synced: true, interpretation: 'Pipeline: New Lead, Qualified, Contacted, Won/Signed, Lost ...' },
          { airtable: 'frequency_approval (previous FAW Check)', supabase: 'frequency_approval', type: 'text', synced: true, interpretation: 'FAW-Genehmigung (vollstaendiger Feldname)' },
          { airtable: 'install_approval', supabase: 'install_approval', type: 'text', synced: true, interpretation: 'Installations-Genehmigung' },
          { airtable: 'approval_status', supabase: 'approval_status', type: 'text', synced: true, interpretation: 'Accepted, Rejected, In review, Info required' },
          { airtable: 'Acquisition Date', supabase: 'acquisition_date', type: 'text', synced: true, interpretation: 'Akquise-Datum' },
          { airtable: 'Installations Status', supabase: 'installations_status', type: 'text', synced: true, interpretation: 'Status der Installation (Lookup)' },
          { airtable: 'Display Location Status', supabase: 'display_location_status', type: 'text', synced: true, interpretation: 'Status des Display-Standorts (Lookup)' },
          { airtable: 'City', supabase: 'city', type: 'link', synced: true, interpretation: 'Stadt (Lookup)' },
          { airtable: 'Location Name_new', supabase: 'location_name', type: 'link', synced: true, interpretation: 'Standortname (Lookup)' },
          { airtable: 'Street', supabase: 'street', type: 'link', synced: true, interpretation: 'Strasse (Lookup)' },
          { airtable: 'Street Number', supabase: 'street_number', type: 'link', synced: true, interpretation: 'Hausnummer (Lookup)' },
          { airtable: 'Postal Code', supabase: 'postal_code', type: 'text', synced: true, interpretation: 'Postleitzahl' },
          { airtable: 'JET_ID', supabase: 'jet_id', type: 'link', synced: true, interpretation: 'JET Standort-ID (Lookup)' },
          { airtable: 'Contact Person', supabase: 'contact_person', type: 'link', synced: true, interpretation: 'Ansprechpartner (Lookup)' },
          { airtable: 'Contact Email', supabase: 'contact_email', type: 'link', synced: true, interpretation: 'Kontakt E-Mail (Lookup)' },
          { airtable: 'Contact Phone', supabase: 'contact_phone', type: 'link', synced: true, interpretation: 'Kontakt Telefon (Lookup)' },
          { airtable: 'Akquisition Partner Name (from Team)', supabase: 'acquisition_partner', type: 'text', synced: true, interpretation: 'Akquise-Partner (Lookup)' },
          { airtable: '# dVAC / Woche 100% SoV', supabase: 'dvac_week', type: 'number', synced: true, interpretation: 'Daily Views at Capacity pro Woche' },
          { airtable: 'Schaufenster einsehbar', supabase: 'schaufenster', type: 'text', synced: true, interpretation: 'Ist das Schaufenster einsehbar?' },
          { airtable: 'Hindernisse vorhanden', supabase: 'hindernisse', type: 'text', synced: true, interpretation: 'Sind Hindernisse vorhanden?' },
          { airtable: 'Mount Type', supabase: 'mount_type', type: 'text', synced: true, interpretation: 'Montage-Typ' },
          { airtable: 'Submitted By', supabase: 'submitted_by', type: 'text', synced: true, interpretation: 'Eingereicht von' },
          { airtable: 'Submitted At', supabase: 'submitted_at', type: 'text', synced: true, interpretation: 'Einreichungsdatum' },
          { airtable: 'Vertrag PDF vorhanden', supabase: 'vertrag_vorhanden', type: 'text', synced: true, interpretation: 'Vertrags-PDF hochgeladen?' },
          { airtable: 'Akquise Storno', supabase: 'akquise_storno', type: 'text', synced: true, interpretation: 'Akquise storniert?' },
          { airtable: 'Post\u2011Install Storno', supabase: 'post_install_storno', type: 'text', synced: true, interpretation: 'NON-BREAKING HYPHEN U+2011!' },
          { airtable: 'Post\u2011Install Storno Grund', supabase: 'post_install_storno_grund', type: 'text', synced: true, interpretation: 'Grund fuer Post-Install Storno (NON-BREAKING HYPHEN U+2011!)' },
          { airtable: 'ready_for_installation', supabase: 'ready_for_installation', type: 'text', synced: true, interpretation: 'Airtable-Formel (NICHT MEHR als Predicate verwendet — kanonisch: lead_status + approval_status + vertrag_vorhanden)' },
          { airtable: 'Created', supabase: 'created_at', type: 'text', synced: true, interpretation: 'Erstellungsdatum des Records' },
          // ── Synced in DETAIL view only (ACQUISITION_DETAIL_FIELDS) ──
          { airtable: 'Hindernisse Beschreibung', supabase: 'hindernisse_beschreibung', type: 'text', synced: true, interpretation: 'Beschreibung der Hindernisse (Detail)' },
          { airtable: 'Fensterbreite ausreichend', supabase: 'fensterbreite', type: 'text', synced: true, interpretation: 'Ist die Fensterbreite ausreichend? (Detail)' },
          { airtable: 'Steckdose mit Strom 6-22 Uhr?', supabase: 'steckdose', type: 'text', synced: true, interpretation: 'Stromversorgung 6-22 Uhr? (Detail)' },
          { airtable: 'Akquise Kommentar', supabase: 'akquise_kommentar', type: 'text', synced: true, interpretation: 'Akquise-Kommentar (Detail)' },
          { airtable: 'Akquise Kommentar (from Acquisition Update)', supabase: 'akquise_kommentar_update', type: 'text', synced: true, interpretation: 'Akquise-Kommentar aus Update (Lookup, Detail)' },
          { airtable: 'Kommentar aus Installationen', supabase: 'kommentar_installationen', type: 'text', synced: true, interpretation: 'Installationskommentar (Detail)' },
          { airtable: 'frequency_approval_comment', supabase: 'frequency_approval_comment', type: 'text', synced: true, interpretation: 'FAW-Genehmigungs-Kommentar (Detail)' },
          { airtable: 'Vertrag (PDF)', supabase: 'vertrag_pdf', type: 'attachment', synced: true, interpretation: 'Vertrags-PDF (Detail)' },
          { airtable: 'Vertragsnummer', supabase: 'vertragsnummer', type: 'computed', synced: true, interpretation: 'Vertragsnummer (Detail)' },
          { airtable: 'Vertragspartner', supabase: 'vertragspartner', type: 'computed', synced: true, interpretation: 'Vertragspartner (Detail)' },
          { airtable: 'Vertragsbeginn', supabase: 'vertragsbeginn', type: 'computed', synced: true, interpretation: 'Vertragsbeginn (Detail)' },
          { airtable: 'Laufzeit', supabase: 'laufzeit', type: 'computed', synced: true, interpretation: 'Vertragslaufzeit (Detail)' },
          { airtable: 'Unterschriftsdatum', supabase: 'unterschriftsdatum', type: 'computed', synced: true, interpretation: 'Datum der Unterschrift (Detail)' },
          { airtable: 'images_akquise', supabase: 'images', type: 'attachment', synced: true, interpretation: 'Akquise-Fotos (Detail)' },
          { airtable: 'FAW_data_attachment', supabase: 'faw_data_attachment', type: 'attachment', synced: true, interpretation: 'FAW-Daten Anhang (Detail)' },
          { airtable: 'Installationsprotokoll (from Installationen)', supabase: 'installationsprotokoll', type: 'link', synced: true, interpretation: 'Installationsprotokoll (Lookup, Detail)' },
          { airtable: 'dVAC / Month', supabase: 'dvac_month', type: 'number', synced: true, interpretation: 'dVAC pro Monat (Detail)' },
          { airtable: 'dVAC per Day', supabase: 'dvac_day', type: 'number', synced: true, interpretation: 'dVAC pro Tag (Detail)' },
          { airtable: 'Latitude', supabase: 'latitude', type: 'link', synced: true, interpretation: 'Breitengrad (Lookup, Detail)' },
          { airtable: 'Longitude', supabase: 'longitude', type: 'link', synced: true, interpretation: 'Laengengrad (Lookup, Detail)' },
          { airtable: 'Koordinaten (from JET ID)', supabase: 'coordinates', type: 'link', synced: true, interpretation: 'Koordinaten (Lookup, Detail)' },
          { airtable: 'Streetview Link (from JET ID)', supabase: 'streetview_link', type: 'link', synced: true, interpretation: 'Google Streetview Link (Lookup, Detail)' },
          { airtable: 'Aufbau Datum', supabase: 'installations_datum', type: 'text', synced: true, interpretation: 'Installationsdatum (Detail)' },
          { airtable: 'Integrator (Installation)', supabase: 'integrator_name', type: 'text', synced: true, interpretation: 'Integrator der Installation (Detail)' },
          { airtable: 'display_name (from Displays)', supabase: 'display_name', type: 'link', synced: true, interpretation: 'Display-Name (Lookup, Detail)' },
          { airtable: 'DO-ID (from Installationen)', supabase: 'do_id', type: 'link', synced: true, interpretation: 'DO-ID (Lookup, Detail)' },
          { airtable: 'Live since (from Displays)', supabase: 'live_since', type: 'link', synced: true, interpretation: 'Live-Datum (Lookup, Detail)' },
          { airtable: 'Abbruchgrund', supabase: 'abbruchgrund', type: 'text', synced: true, interpretation: 'Grund fuer Abbruch (Detail)' },
          { airtable: 'Exclude Reason', supabase: 'exclude_reason', type: 'text', synced: true, interpretation: 'Ausschlussgrund (Detail)' },
          // ── NOT synced (46 total fields from Airtable Metadata API) ──
          { airtable: 'install_approval_comment_last_modified_by', supabase: '—', type: 'computed', synced: false, interpretation: 'Letzter Bearbeiter des Genehmigungs-Kommentars' },
          { airtable: 'install_approval_comment_last_modified_by_text', supabase: '—', type: 'text', synced: false, interpretation: 'Letzter Bearbeiter als Text' },
          { airtable: 'Appointment Link', supabase: '—', type: 'computed', synced: false, interpretation: 'Terminbuchungs-Link' },
          { airtable: 'Email from Stammdaten', supabase: '—', type: 'link', synced: false, interpretation: 'E-Mail aus Stammdaten (Lookup)' },
          { airtable: 'Frequenz Indicator ', supabase: '—', type: 'link', synced: false, interpretation: 'Frequenz-Indikator (Lookup)' },
          { airtable: 'JET ID', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfung zu JET Stammdaten' },
          { airtable: 'JET Search', supabase: '—', type: 'link', synced: false, interpretation: 'JET Suchfeld (Lookup)' },
          { airtable: 'JET Search 2', supabase: '—', type: 'link', synced: false, interpretation: 'JET Suchfeld 2 (Lookup)' },
          { airtable: 'Last modified Lead Status', supabase: '—', type: 'computed', synced: false, interpretation: 'Letzte Aenderung Lead-Status (Collaborator)' },
          { airtable: 'Last modified time Lead Status', supabase: '—', type: 'text', synced: false, interpretation: 'Zeitpunkt letzte Lead-Status-Aenderung' },
          { airtable: 'Location Email', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Email (Lookup)' },
          { airtable: 'Location Phone', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Telefon (Lookup)' },
          { airtable: 'Location Search (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Suchfeld (Lookup)' },
          { airtable: 'Location search', supabase: '—', type: 'text', synced: false, interpretation: 'Standort-Suche (Hilfsfeld)' },
          { airtable: 'Week Last modified time Lead Status', supabase: '—', type: 'number', synced: false, interpretation: 'KW der letzten Lead-Status-Aenderung' },
          { airtable: 'Year Last modified time Lead Status', supabase: '—', type: 'number', synced: false, interpretation: 'Jahr der letzten Lead-Status-Aenderung' },
          { airtable: 'acquisition_commission', supabase: '—', type: 'number', synced: false, interpretation: 'Akquise-Provision' },
          { airtable: 'add_to_mailchimp', supabase: '—', type: 'number', synced: false, interpretation: 'Zu Mailchimp hinzufuegen (Trigger)' },
          { airtable: 'formatted_germany_phone', supabase: '—', type: 'link', synced: false, interpretation: 'Formatierte deutsche Telefonnummer (Lookup)' },
          { airtable: 'formatted_germany_phone_f', supabase: '—', type: 'text', synced: false, interpretation: 'Formatierte Telefonnummer (Formel)' },
          { airtable: 'installations_number', supabase: '—', type: 'number', synced: false, interpretation: 'Anzahl Installationen' },
          { airtable: 'mailchimp_id', supabase: '—', type: 'text', synced: false, interpretation: 'Mailchimp Kontakt-ID' },
          { airtable: 'recordID', supabase: '—', type: 'text', synced: false, interpretation: 'Airtable Record-ID' },
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
          // ── Synced fields (in INSTALLATION_FIELDS / mapInstallation) ──
          { airtable: 'Aufbau Datum', supabase: 'install_date', type: 'text', synced: true, interpretation: 'Installations-Termin' },
          { airtable: 'Status Installation', supabase: 'status', type: 'text', synced: true, interpretation: 'Installiert, Abgebrochen, Geplant, Nacharbeit, Storniert' },
          { airtable: 'Installationsart', supabase: 'installation_type', type: 'text', synced: true, interpretation: 'Boden-, Wand-, Deckenmontage' },
          { airtable: 'Company (from Integrator)', supabase: 'integrator', type: 'link', synced: true, interpretation: 'e-Systems, MediaAV, DAYNMEDIA (Lookup)' },
          { airtable: 'Name (from Technikers)', supabase: 'technicians', type: 'link', synced: true, interpretation: 'Techniker-Namen (Lookup)' },
          { airtable: 'Installationsprotokoll', supabase: 'protocol_url', type: 'link', synced: true, interpretation: 'Installationsprotokoll (Attachment)' },
          { airtable: 'Screen Art', supabase: 'screen_type', type: 'text', synced: true, interpretation: 'WD etc.' },
          { airtable: 'Screen Size', supabase: 'screen_size', type: 'text', synced: true, interpretation: 'Bildschirmgroesse in Zoll' },
          { airtable: 'OPS Nr', supabase: 'ops_nr', type: 'text', synced: true, interpretation: 'OPS-Player Nummer' },
          { airtable: 'SIM-ID', supabase: 'sim_id', type: 'text', synced: true, interpretation: 'SIM-Karten ID' },
          { airtable: 'Installationsstart', supabase: 'install_start', type: 'text', synced: true, interpretation: 'Startzeit der Installation' },
          { airtable: 'Installationsabschluss', supabase: 'install_end', type: 'text', synced: true, interpretation: 'Endzeit der Installation' },
          { airtable: 'Allgemeine Bemerkungen', supabase: 'remarks', type: 'text', synced: true, interpretation: 'Installations-Notizen' },
          { airtable: 'Abnahme Partner (Name)', supabase: 'partner_name', type: 'text', synced: true, interpretation: 'Abnahmepartner Name' },
          { airtable: 'Display Table ID (from Link to Display ID )', supabase: 'display_ids', type: 'link', synced: true, interpretation: 'Display Table ID (Lookup, TRAILING SPACE!)' },
          // ── NOT synced (71 total fields from Airtable Metadata API) ──
          { airtable: 'Abbruchgrund', supabase: '—', type: 'text', synced: false, interpretation: 'Grund fuer Installationsabbruch' },
          { airtable: 'Acquisition Partner (from Akquise)', supabase: '—', type: 'link', synced: false, interpretation: 'Akquise-Partner (Lookup)' },
          { airtable: 'Akquise', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfung zur Akquise' },
          { airtable: 'Aufbau Jahr', supabase: '—', type: 'number', synced: false, interpretation: 'Installationsjahr' },
          { airtable: 'City', supabase: '—', type: 'link', synced: false, interpretation: 'Stadt (Lookup)' },
          { airtable: 'City Code', supabase: '—', type: 'text', synced: false, interpretation: 'Stadtcode' },
          { airtable: 'Contact Email (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'Kontakt-Email (Lookup)' },
          { airtable: 'Country', supabase: '—', type: 'text', synced: false, interpretation: 'Land' },
          { airtable: 'Created', supabase: '—', type: 'text', synced: false, interpretation: 'Erstellungsdatum' },
          { airtable: 'Created Week', supabase: '—', type: 'number', synced: false, interpretation: 'Erstellungs-Kalenderwoche' },
          { airtable: 'Created Year', supabase: '—', type: 'number', synced: false, interpretation: 'Erstellungsjahr' },
          { airtable: 'Created by', supabase: '—', type: 'computed', synced: false, interpretation: 'Erstellt von (Collaborator)' },
          { airtable: 'Created time', supabase: '—', type: 'text', synced: false, interpretation: 'Erstellungszeitpunkt' },
          { airtable: 'Display Serial Number', supabase: '—', type: 'computed', synced: false, interpretation: 'Display-Seriennummer' },
          { airtable: 'E-Mail (from Technikers)', supabase: '—', type: 'link', synced: false, interpretation: 'Techniker-Email (Lookup)' },
          { airtable: 'Erstellt am', supabase: '—', type: 'text', synced: false, interpretation: 'Erstellungsdatum (Deutsch)' },
          { airtable: 'Foto Abstand', supabase: '—', type: 'link', synced: false, interpretation: 'Foto mit Abstand' },
          { airtable: 'Fotos - Seriennummer Display / OPS', supabase: '—', type: 'link', synced: false, interpretation: 'Seriennummer-Fotos' },
          { airtable: 'Fotos \u2013 Au\u00dfenansicht', supabase: '—', type: 'link', synced: false, interpretation: 'Aussenansicht-Fotos' },
          { airtable: 'Fotos \u2013 Rueckseite 1m/3m', supabase: '—', type: 'link', synced: false, interpretation: 'Rueckseiten-Fotos (1m/3m Abstand)' },
          { airtable: 'Fotos \u2013 SIM Karte', supabase: '—', type: 'link', synced: false, interpretation: 'SIM-Karten-Fotos' },
          { airtable: 'Fotos \u2013 Standort vorher', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Fotos vor Installation' },
          { airtable: 'Handout', supabase: '—', type: 'boolean', synced: false, interpretation: 'Handout uebergeben?' },
          { airtable: 'Install Number', supabase: '—', type: 'number', synced: false, interpretation: 'Installations-Nummer' },
          { airtable: 'Install targets per Week', supabase: '—', type: 'link', synced: false, interpretation: 'Installations-Ziele pro Woche' },
          { airtable: 'Installation ID', supabase: '—', type: 'number', synced: false, interpretation: 'Eindeutige Installations-ID' },
          { airtable: 'Integrator', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfter Integrator' },
          { airtable: 'JET ID', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte JET Stammdaten' },
          { airtable: 'JET ID (from Akquise)', supabase: '—', type: 'link', synced: false, interpretation: 'JET-ID von Akquise (Lookup)' },
          { airtable: 'JET ID (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'JET-ID (Lookup)' },
          { airtable: 'JET SEARCH (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'JET-Suchfeld (Lookup)' },
          { airtable: 'LAT', supabase: '—', type: 'link', synced: false, interpretation: 'Breitengrad (Lookup)' },
          { airtable: 'Last Modified', supabase: '—', type: 'text', synced: false, interpretation: 'Letzte Aenderung' },
          { airtable: 'Last modified by', supabase: '—', type: 'computed', synced: false, interpretation: 'Zuletzt geaendert von (Collaborator)' },
          { airtable: 'Link to Display ID ', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfung zu Display (TRAILING SPACE!)' },
          { airtable: 'Live Display Locations copy', supabase: '—', type: 'text', synced: false, interpretation: 'Display-Standort Kopie (Hilfsfeld)' },
          { airtable: 'Location Email (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Email (Lookup)' },
          { airtable: 'Location Email (from JET ID) 2', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Email 2 (Lookup)' },
          { airtable: 'Location Name', supabase: '—', type: 'link', synced: false, interpretation: 'Standortname (Lookup)' },
          { airtable: 'Location Search (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'Standort-Suchfeld (Lookup)' },
          { airtable: 'Lontitude', supabase: '—', type: 'link', synced: false, interpretation: 'Laengengrad (Lookup, TYPO: Lontitude)' },
          { airtable: 'Online Status  (from Link to Display ID )', supabase: '—', type: 'link', synced: false, interpretation: 'Display Online-Status (Lookup, DOUBLE SPACE!)' },
          { airtable: 'Postal Code', supabase: '—', type: 'link', synced: false, interpretation: 'Postleitzahl (Lookup)' },
          { airtable: 'Street', supabase: '—', type: 'link', synced: false, interpretation: 'Strasse (Lookup)' },
          { airtable: 'Street Number', supabase: '—', type: 'link', synced: false, interpretation: 'Hausnummer (Lookup)' },
          { airtable: 'Streetview Link (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'Google Streetview (Lookup)' },
          { airtable: 'Suche Location', supabase: '—', type: 'text', synced: false, interpretation: 'Standort-Suchfeld' },
          { airtable: 'Tasks', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Aufgaben' },
          { airtable: 'Tasks copy', supabase: '—', type: 'text', synced: false, interpretation: 'Tasks Kopie (Hilfsfeld)' },
          { airtable: 'Techniker 1 Name', supabase: '—', type: 'computed', synced: false, interpretation: 'Name Techniker 1' },
          { airtable: 'Techniker 2 Name', supabase: '—', type: 'computed', synced: false, interpretation: 'Name Techniker 2' },
          { airtable: 'Technikers', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfte Techniker' },
          { airtable: 'Unit Index', supabase: '—', type: 'number', synced: false, interpretation: 'Unit-Index' },
          { airtable: 'Zuletzt geaendert', supabase: '—', type: 'text', synced: false, interpretation: 'Letzte Aenderung (Deutsch)' },
          { airtable: 'address', supabase: '—', type: 'text', synced: false, interpretation: 'Adresse (Hilfsfeld)' },
          { airtable: 'installed_email_sent', supabase: '—', type: 'boolean', synced: false, interpretation: 'Installations-Email gesendet?' },
          { airtable: 'recordID', supabase: '—', type: 'text', synced: false, interpretation: 'Airtable Record-ID' },
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
          // ── Synced fields (in SWAP_FIELDS / mapHardwareSwap) ──
          { airtable: 'Tausch-ID', supabase: 'swap_id', type: 'text', synced: true, interpretation: 'Eindeutige Tausch-ID' },
          { airtable: 'Live Display Location', supabase: 'display_location_id', type: 'link', synced: true, interpretation: 'Verknuepfter Display-Standort' },
          { airtable: 'Tausch-Typ', supabase: 'swap_type', type: 'link', synced: true, interpretation: 'Art des Tausches' },
          { airtable: 'Tausch-Datum', supabase: 'swap_date', type: 'text', synced: true, interpretation: 'Datum des Tausches' },
          { airtable: 'Tausch-Grund', supabase: 'swap_reason', type: 'text', synced: true, interpretation: 'Grund fuer Hardware-Tausch' },
          { airtable: 'Partner', supabase: 'partner_id', type: 'link', synced: true, interpretation: 'Partner / Integrator' },
          { airtable: 'Techniker', supabase: 'technician', type: 'text', synced: true, interpretation: 'Techniker fuer den Tausch' },
          { airtable: 'ALTE Hardware', supabase: 'old_hardware_ids', type: 'link', synced: true, interpretation: 'Alte Hardware-Kennung' },
          { airtable: 'NEUE Hardware', supabase: 'new_hardware_ids', type: 'link', synced: true, interpretation: 'Neue Hardware-Kennung' },
          { airtable: 'Defekt-Beschreibung', supabase: 'defect_description', type: 'text', synced: true, interpretation: 'Detaillierte Fehlerbeschreibung' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status des Tausches' },
          { airtable: 'Location Name (from Live Display Location)', supabase: 'location_name', type: 'link', synced: true, interpretation: 'Standortname (Lookup)' },
          { airtable: 'City (from Live Display Location)', supabase: 'city', type: 'link', synced: true, interpretation: 'Stadt (Lookup)' },
          // ── Hinweis: Tabelle hat KEINE Records, Felder basieren auf SWAP_FIELDS ──
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
          // ── Synced fields (in DEINSTALL_FIELDS / mapDeinstall) ──
          { airtable: 'Deinstallations-ID', supabase: 'deinstall_id', type: 'text', synced: true, interpretation: 'Eindeutige ID' },
          { airtable: 'Live Display Location', supabase: 'display_location_id', type: 'link', synced: true, interpretation: 'Verknuepfter Display-Standort' },
          { airtable: 'OPS-Nr / Hardware-Set', supabase: 'ops_record_id', type: 'link', synced: true, interpretation: 'OPS-Nummer / Hardware-Set' },
          { airtable: 'Deinstallationsdatum', supabase: 'deinstall_date', type: 'text', synced: true, interpretation: 'Datum der Deinstallation' },
          { airtable: 'Grund', supabase: 'reason', type: 'text', synced: true, interpretation: 'Deinstallationsgrund' },
          { airtable: 'Partner', supabase: 'partner_id', type: 'link', synced: true, interpretation: 'Partner / Integrator' },
          { airtable: 'Techniker', supabase: 'technician', type: 'text', synced: true, interpretation: 'Techniker fuer die Deinstallation' },
          { airtable: 'Hardware-Zustand', supabase: 'hardware_condition', type: 'text', synced: true, interpretation: 'Zustand der Hardware' },
          { airtable: 'Zustandsbeschreibung', supabase: 'condition_description', type: 'text', synced: true, interpretation: 'Beschreibung des Hardware-Zustands' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Status' },
          { airtable: 'Location Name (from Live Display Location)', supabase: 'location_name', type: 'link', synced: true, interpretation: 'Standortname (Lookup)' },
          { airtable: 'City (from Live Display Location)', supabase: 'city', type: 'link', synced: true, interpretation: 'Stadt (Lookup)' },
          // ── Hinweis: Tabelle hat KEINE Records, Felder basieren auf DEINSTALL_FIELDS ──
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
          // ── Synced fields (in OPS_FIELDS / mapOpsInventory) ──
          { airtable: 'OpsNr.', supabase: 'ops_nr', type: 'text', synced: true, interpretation: 'OPS-Player Nummer' },
          { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Active, Inactive, RMA' },
          { airtable: 'OPS-SN', supabase: 'ops_sn', type: 'text', synced: true, interpretation: 'Seriennummer' },
          { airtable: 'ops_hardware_type', supabase: 'hardware_type', type: 'text', synced: true, interpretation: 'Hardware-Typ' },
          { airtable: 'navori_venueID', supabase: 'navori_venue_id', type: 'text', synced: true, interpretation: 'Navori Venue ID' },
          { airtable: 'SimID', supabase: 'sim_record_id', type: 'link', synced: true, interpretation: 'Verknuepfte SIM-Karte (Link)' },
          { airtable: 'SimID (from SimID)', supabase: 'sim_id', type: 'link', synced: true, interpretation: 'SIM-Karten-ID (Lookup)' },
          { airtable: 'display_inventory', supabase: 'display_record_id', type: 'link', synced: true, interpretation: 'Verknuepftes Display-Inventar (Link)' },
          { airtable: 'display_serial_number (from display_inventory)', supabase: 'display_sn', type: 'text', synced: true, interpretation: 'Display-Seriennummer (Lookup)' },
          { airtable: 'Live Display Locations', supabase: 'display_location_id', type: 'link', synced: true, interpretation: 'Verknuepfte Display-Standorte' },
          { airtable: 'Online Status  (from Live Display Locations)', supabase: 'location_online_status', type: 'link', synced: true, interpretation: 'DOUBLE SPACE! Display Online-Status (Lookup)' },
          { airtable: 'Partner', supabase: 'partner_id', type: 'link', synced: true, interpretation: 'Partner / Integrator' },
          { airtable: 'note', supabase: 'note', type: 'text', synced: true, interpretation: 'Notizen zum OPS-Player' },
          // ── NOT synced (11 fields visible in Metadata API) ──
          { airtable: 'Navori Venue ID (from Installationen) (from Live Display Locations)', supabase: '—', type: 'link', synced: false, interpretation: 'Navori Venue ID (doppelter Lookup)' },
          { airtable: 'recordID', supabase: '—', type: 'text', synced: false, interpretation: 'Airtable Record-ID' },
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
          // ── Synced fields (in SIM_FIELDS / mapSimInventory) ──
          { airtable: 'SimID', supabase: 'sim_id', type: 'number', synced: true, interpretation: 'SIM-Karten ID (Integer in Airtable)' },
          { airtable: 'activate_date', supabase: 'activate_date', type: 'text', synced: true, interpretation: 'Aktivierungsdatum' },
          { airtable: 'OPS_Player_inventory 2', supabase: 'ops_record_id', type: 'link', synced: true, interpretation: 'Verknuepfter OPS-Player' },
          { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Active, Inactive' },
          // ── Hinweis: Nur 1 Feld (SimID) war in der Metadata API sichtbar ──
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
          // ── Synced fields (in DISPLAY_INV_FIELDS / mapDisplayInventory) ──
          { airtable: 'display_serial_number', supabase: 'display_serial_number', type: 'text', synced: true, interpretation: 'Display-Seriennummer' },
          { airtable: 'location', supabase: 'location', type: 'text', synced: true, interpretation: 'Zugeordneter Standort' },
          { airtable: 'OPS_Player_inventory', supabase: 'ops_record_id', type: 'link', synced: true, interpretation: 'Verknuepfter OPS-Player' },
          { airtable: 'status', supabase: 'status', type: 'text', synced: true, interpretation: 'Active, Inactive, RMA' },
          // ── Hinweis: Tabelle hat KEINE Records, Felder basieren auf DISPLAY_INV_FIELDS ──
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
          // ── Synced fields (in CHG_FIELDS / mapChgApproval) ──
          { airtable: 'JET ID Location', supabase: 'jet_id_location', type: 'text', synced: true, interpretation: 'JET Standort-ID' },
          { airtable: 'Asset ID', supabase: 'asset_id', type: 'text', synced: true, interpretation: 'CHG Asset-ID' },
          { airtable: 'Display SN', supabase: 'display_sn', type: 'text', synced: true, interpretation: 'Display Seriennummer' },
          { airtable: 'Integrator Invoice No', supabase: 'integrator_invoice_no', type: 'text', synced: true, interpretation: 'Integrator-Rechnungsnummer' },
          { airtable: 'Installation certificate at the bank (CHG)', supabase: 'chg_certificate', type: 'text', synced: true, interpretation: 'Installationszertifikat bei der Bank' },
          { airtable: 'Invoice date', supabase: 'invoice_date', type: 'text', synced: true, interpretation: 'Rechnungsdatum' },
          { airtable: 'Rental start date at the bank', supabase: 'rental_start', type: 'text', synced: true, interpretation: 'Mietbeginn bei der Bank' },
          { airtable: 'Rental end date at the bank', supabase: 'rental_end', type: 'text', synced: true, interpretation: 'Mietende bei der Bank' },
          { airtable: 'Payment released on', supabase: 'payment_released_on', type: 'text', synced: true, interpretation: 'Zahlungsfreigabe-Datum' },
          { airtable: 'Payment released by', supabase: 'payment_released_by', type: 'text', synced: true, interpretation: 'Zahlungsfreigabe durch' },
          { airtable: 'Status', supabase: 'status', type: 'text', synced: true, interpretation: 'Approved, Pending, Rejected' },
          { airtable: 'Installation', supabase: 'installation_id', type: 'link', synced: true, interpretation: 'Verknuepfte Installation' },
          { airtable: 'Inspection Status', supabase: 'inspection_status', type: 'link', synced: true, interpretation: 'Pruefungsstatus (Lookup)' },
          { airtable: 'DisplayID', supabase: 'display_id', type: 'link', synced: true, interpretation: 'Display-ID (Lookup)' },
          { airtable: 'Location Name', supabase: 'location_name', type: 'link', synced: true, interpretation: 'Standortname (Lookup)' },
          { airtable: 'City', supabase: 'city', type: 'link', synced: true, interpretation: 'Stadt (Lookup)' },
          { airtable: 'Address', supabase: 'address', type: 'link', synced: true, interpretation: 'Adresse (Lookup)' },
          { airtable: 'created', supabase: 'created_at', type: 'text', synced: true, interpretation: 'Erstellungsdatum' },
          // ── NOT synced (21 total fields from Airtable Metadata API) ──
          { airtable: 'JET', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfung zu JET Stammdaten' },
          { airtable: 'JET ID', supabase: '—', type: 'link', synced: false, interpretation: 'JET-ID Verknuepfung' },
          { airtable: 'JET ID (from JET ID)', supabase: '—', type: 'link', synced: false, interpretation: 'JET-ID (Lookup)' },
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
      {
        id: 'Dayn Screens',
        name: 'Dayn Screens',
        usage: 'DAYN Screen-Netzwerk',
        supabaseTable: 'dayn_screens',
        syncFrequency: 'Alle 2 Stunden',
        syncMethod: 'Inkrementell',
        usedIn: ['DaynOverview', 'VistarMapping', 'KPICards'],
        fields: [
          // ── Synced fields (in DAYN_FIELDS / mapDaynScreen) ──
          { airtable: 'Dayn_Screen_ID', supabase: 'dayn_screen_id', type: 'text', synced: true, interpretation: 'Eindeutige DAYN Screen-ID' },
          { airtable: 'DO_Screen_ID', supabase: 'do_screen_id', type: 'text', synced: true, interpretation: 'DO Screen-ID' },
          { airtable: 'Screen Status', supabase: 'screen_status', type: 'text', synced: true, interpretation: 'Status des Screens' },
          { airtable: 'location_name', supabase: 'location_name', type: 'text', synced: true, interpretation: 'Standortname' },
          { airtable: 'address', supabase: 'address', type: 'text', synced: true, interpretation: 'Adresse' },
          { airtable: 'city', supabase: 'city', type: 'text', synced: true, interpretation: 'Stadt' },
          { airtable: 'region', supabase: 'region', type: 'text', synced: true, interpretation: 'Region / Bundesland' },
          { airtable: 'country', supabase: 'country', type: 'text', synced: true, interpretation: 'Land' },
          { airtable: 'zip_code', supabase: 'zip_code', type: 'computed', synced: true, interpretation: 'Postleitzahl (dict/computed)' },
          { airtable: 'venue type', supabase: 'venue_type', type: 'text', synced: true, interpretation: 'Venue-Typ (z.B. Restaurant, Retail)' },
          { airtable: 'floor CPM', supabase: 'floor_cpm', type: 'number', synced: true, interpretation: 'Mindest-CPM (Floor Price)' },
          { airtable: 'screen width (px)', supabase: 'screen_width_px', type: 'number', synced: true, interpretation: 'Bildschirmbreite in Pixel' },
          { airtable: 'screen height (px)', supabase: 'screen_height_px', type: 'number', synced: true, interpretation: 'Bildschirmhoehe in Pixel' },
          { airtable: 'latitude', supabase: 'latitude', type: 'number', synced: true, interpretation: 'Breitengrad' },
          { airtable: 'longitude', supabase: 'longitude', type: 'number', synced: true, interpretation: 'Laengengrad' },
          { airtable: 'Screen_Inch', supabase: 'screen_inch', type: 'text', synced: true, interpretation: 'Bildschirmgroesse in Zoll' },
          { airtable: 'Screen_Type', supabase: 'screen_type', type: 'text', synced: true, interpretation: 'Screen-Typ' },
          { airtable: 'Street with Number', supabase: 'address', type: 'computed', synced: true, interpretation: 'Strasse mit Hausnummer (dict, Fallback fuer address)' },
          { airtable: '# dVAC / Woche 100% SoV', supabase: 'dvac_week', type: 'number', synced: true, interpretation: 'dVAC pro Woche bei 100% SoV' },
          { airtable: 'dVAC / Month', supabase: 'dvac_month', type: 'number', synced: true, interpretation: 'dVAC pro Monat' },
          { airtable: 'dVAC per Day', supabase: 'dvac_day', type: 'number', synced: true, interpretation: 'dVAC pro Tag' },
          { airtable: 'Impressions per Spot', supabase: 'impressions_per_spot', type: 'number', synced: true, interpretation: 'Impressions pro Spot' },
          { airtable: 'Maximun video spot lenth (seconds)', supabase: 'max_video_length', type: 'text', synced: true, interpretation: 'Max. Videodauer in Sekunden (TYPO: Maximun + lenth)' },
          { airtable: 'Minimum video spot lenth (seconds)', supabase: 'min_video_length', type: 'text', synced: true, interpretation: 'Min. Videodauer in Sekunden (TYPO: lenth)' },
          { airtable: 'static duration (in seconds)', supabase: 'static_duration', type: 'text', synced: true, interpretation: 'Dauer statischer Anzeigen in Sekunden' },
          { airtable: 'static_supported (can your screens run images JPG/PNG)', supabase: 'static_supported', type: 'text', synced: true, interpretation: 'Unterstuetzt der Screen statische Bilder? (TRUE/FALSE)' },
          { airtable: 'video_supported (can your screens run video?)', supabase: 'video_supported', type: 'text', synced: true, interpretation: 'Unterstuetzt der Screen Video? (TRUE/FALSE)' },
          { airtable: 'install_year', supabase: 'install_year', type: 'text', synced: true, interpretation: 'Installationsjahr' },
          // ── NOT synced (33 total fields from Airtable Metadata API) ──
          { airtable: 'FAW-Tool', supabase: '—', type: 'link', synced: false, interpretation: 'Verknuepfung zum FAW-Tool' },
          { airtable: 'city_code', supabase: '—', type: 'text', synced: false, interpretation: 'Stadtcode' },
          { airtable: 'network', supabase: '—', type: 'text', synced: false, interpretation: 'Netzwerk-Zuordnung' },
          { airtable: 'screen_image', supabase: '—', type: 'link', synced: false, interpretation: 'Screen-Foto/Bild' },
          { airtable: 'screen_network_identifier', supabase: '—', type: 'text', synced: false, interpretation: 'Netzwerk-Screen-Kennung' },
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
    baseUrl: 'https://nrijgfcdlvuhhudasicd.supabase.co',
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
      { id: 'stammdaten', name: 'stammdaten', usage: 'Flink Stammdaten Cache' },
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
    fields: [
      // Auth
      { name: 'auth.user.id', type: 'uuid', used: true, source: 'Auth API', description: 'User UUID (Primary Key in app_users)' },
      { name: 'auth.user.email', type: 'text', used: true, source: 'Auth API', description: 'Benutzer-E-Mail' },
      { name: 'auth.user.role', type: 'text', used: true, source: 'Auth API', description: 'User Role (authenticated)' },
      { name: 'auth.session.access_token', type: 'text', used: true, source: 'Auth API', description: 'JWT Access Token (8h Laufzeit)' },
      { name: 'auth.session.refresh_token', type: 'text', used: true, source: 'Auth API', description: 'Refresh Token' },
      { name: 'auth.user.user_metadata', type: 'object', used: false, source: 'Auth API', description: 'Benutzerdefinierte Metadaten' },
      { name: 'auth.user.app_metadata', type: 'object', used: false, source: 'Auth API', description: 'App-spezifische Metadaten' },
      { name: 'auth.mfa', type: 'object', used: false, source: 'Auth API', description: 'Multi-Factor Authentication' },
      // REST API (PostgREST)
      { name: 'select', type: 'query', used: true, source: 'PostgREST', description: 'Spalten-Auswahl (z.B. select=id,name)' },
      { name: 'filter (eq, gt, lt, in, is)', type: 'query', used: true, source: 'PostgREST', description: 'Row-Filter (z.B. status=eq.active)' },
      { name: 'order', type: 'query', used: true, source: 'PostgREST', description: 'Sortierung (z.B. order=created_at.desc)' },
      { name: 'limit', type: 'query', used: true, source: 'PostgREST', description: 'Ergebnis-Limit' },
      { name: 'offset', type: 'query', used: false, source: 'PostgREST', description: 'Pagination Offset' },
      { name: 'Prefer: resolution=merge-duplicates', type: 'header', used: true, source: 'PostgREST', description: 'Upsert-Modus (INSERT or UPDATE)' },
      { name: 'Prefer: resolution=ignore-duplicates', type: 'header', used: true, source: 'PostgREST', description: 'Insert mit Duplikat-Ignorierung' },
      { name: 'Prefer: return=representation', type: 'header', used: false, source: 'PostgREST', description: 'Gibt eingefuegte/aktualisierte Rows zurueck' },
      // RPC
      { name: 'rpc.get_mobile_kpis()', type: 'function', used: true, source: 'RPC', description: 'Mobile KPI Aggregation (lightweight ~2KB JSON)' },
      { name: 'rpc.get_display_kpis()', type: 'function', used: false, source: 'RPC', description: 'Display-spezifische KPIs (nicht implementiert)' },
      // Storage
      { name: 'storage.bucket', type: 'text', used: true, source: 'Storage API', description: 'Bucket-Name: attachments (public)' },
      { name: 'storage.object.upload', type: 'binary', used: true, source: 'Storage API', description: 'Datei-Upload (Airtable Attachment Cache)' },
      { name: 'storage.object.download', type: 'binary', used: true, source: 'Storage API', description: 'Datei-Download via Public URL' },
      { name: 'storage.object.list', type: 'array', used: false, source: 'Storage API', description: 'Dateien in einem Bucket auflisten' },
      { name: 'storage.object.delete', type: 'void', used: false, source: 'Storage API', description: 'Datei loeschen' },
      // Realtime (nicht genutzt)
      { name: 'realtime.channel', type: 'text', used: false, source: 'Realtime API', description: 'WebSocket Channel fuer Live-Updates' },
      { name: 'realtime.broadcast', type: 'object', used: false, source: 'Realtime API', description: 'Broadcast Messages an Clients' },
      { name: 'realtime.presence', type: 'object', used: false, source: 'Realtime API', description: 'User Presence Tracking' },
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
    fields: [
      // Felder die wir nutzen
      { name: 'impressions', type: 'number', used: true, source: 'SSP Exchange Report', description: 'Anzahl der ausgelieferten Ad-Impressions pro Venue/Tag' },
      { name: 'spots', type: 'number', used: true, source: 'SSP Exchange Report', description: 'Anzahl der abgespielten Spots (1 Spot = 1 Ad-Playout)' },
      { name: 'partner_revenue', type: 'currency', used: true, source: 'SSP Exchange Report', description: 'Umsatz-Anteil des Partners (JET/DAYN) in EUR' },
      { name: 'partner_profit', type: 'currency', used: true, source: 'SSP Exchange Report', description: 'Profit-Anteil nach Vistar-Fee in EUR' },
      { name: 'partner_eCPM', type: 'currency', used: true, source: 'SSP Exchange Report', description: 'Effective Cost per Mille (Umsatz pro 1000 Impressions)' },
      // Felder die theoretisch verfuegbar sind
      { name: 'gross_revenue', type: 'currency', used: false, source: 'SSP Exchange Report', description: 'Brutto-Umsatz vor Abzug der Vistar-Fee' },
      { name: 'exchange_fee', type: 'currency', used: false, source: 'SSP Exchange Report', description: 'Vistar Exchange Fee (Plattform-Gebuehr)' },
      { name: 'fill_rate', type: 'percent', used: false, source: 'SSP Exchange Report', description: 'Anteil der verfuegbaren Slots die verkauft wurden (%)' },
      { name: 'avails', type: 'number', used: false, source: 'SSP Exchange Report', description: 'Verfuegbare Ad-Slots pro Venue/Tag' },
      { name: 'venue_id', type: 'text', used: true, source: 'Network API', description: 'Eindeutige Vistar Venue-ID (z.B. vn-XXX)' },
      { name: 'venue_name', type: 'text', used: true, source: 'Network API', description: 'Anzeigename des Venues in Vistar' },
      { name: 'venue_address', type: 'text', used: false, source: 'Network API', description: 'Adresse des Venues' },
      { name: 'venue_lat', type: 'number', used: false, source: 'Network API', description: 'Breitengrad des Venues' },
      { name: 'venue_lng', type: 'number', used: false, source: 'Network API', description: 'Laengengrad des Venues' },
      { name: 'network_id', type: 'text', used: true, source: 'Network API', description: 'Netzwerk-ID (DAYN Network)' },
      { name: 'network_name', type: 'text', used: true, source: 'Network API', description: 'Netzwerk-Name' },
      { name: 'screen_count', type: 'number', used: false, source: 'Network API', description: 'Anzahl Screens im Venue' },
      { name: 'screen_width', type: 'number', used: false, source: 'Network API', description: 'Bildschirmbreite in Pixel' },
      { name: 'screen_height', type: 'number', used: false, source: 'Network API', description: 'Bildschirmhoehe in Pixel' },
      { name: 'cpm_floor', type: 'currency', used: false, source: 'Network API', description: 'Mindest-CPM (Floor Price)' },
      { name: 'operating_hours', type: 'text', used: false, source: 'Network API', description: 'Betriebszeiten des Venues' },
      { name: 'dsp_name', type: 'text', used: false, source: 'SSP Exchange Report', description: 'Name der Demand-Side Platform (Kaeufer)' },
      { name: 'campaign_name', type: 'text', used: false, source: 'SSP Exchange Report', description: 'Kampagnenname des Advertisers' },
      { name: 'creative_id', type: 'text', used: false, source: 'SSP Exchange Report', description: 'ID des ausgespielten Creatives' },
      { name: 'date', type: 'date', used: true, source: 'SSP Exchange Report', description: 'Berichtsdatum' },
    ],
    endpoints: [
      { method: 'POST', path: '/api/session', description: 'Login — Session-Cookie erhalten', icon: Key },
      { method: 'POST', path: '/report', description: 'SSP Exchange Report (Impressions, Revenue, eCPM)', icon: Eye },
      { method: 'GET', path: '/networks', description: 'Netzwerk-Uebersicht (Platform API)', icon: Radio },
    ],
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
    description: 'Multi-Channel Messaging Platform fuer WhatsApp und Email Kommunikation mit Flink-Standorten. Templates, Kontaktverwaltung und Konversationen.',
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
    fields: [
      // Conversations
      { name: 'conversation.id', type: 'text', used: true, source: 'Conversations API', description: 'Eindeutige Konversations-ID' },
      { name: 'conversation.status', type: 'text', used: true, source: 'Conversations API', description: 'open, closed, pending' },
      { name: 'conversation.channel', type: 'text', used: true, source: 'Conversations API', description: 'whatsapp, email, sms, instagram, facebook' },
      { name: 'conversation.assignee', type: 'text', used: false, source: 'Conversations API', description: 'Zugewiesener Agent/Mitarbeiter' },
      { name: 'conversation.tags', type: 'array', used: false, source: 'Conversations API', description: 'Labels/Tags der Konversation' },
      { name: 'conversation.created_at', type: 'date', used: true, source: 'Conversations API', description: 'Erstellungszeitpunkt' },
      { name: 'conversation.updated_at', type: 'date', used: true, source: 'Conversations API', description: 'Letztes Update' },
      // Messages
      { name: 'message.id', type: 'text', used: true, source: 'Messages API', description: 'Eindeutige Nachrichten-ID' },
      { name: 'message.body', type: 'text', used: true, source: 'Messages API', description: 'Nachrichteninhalt (Text)' },
      { name: 'message.direction', type: 'text', used: true, source: 'Messages API', description: 'inbound, outbound' },
      { name: 'message.type', type: 'text', used: false, source: 'Messages API', description: 'text, image, document, template, location' },
      { name: 'message.media_url', type: 'text', used: false, source: 'Messages API', description: 'URL des Medien-Anhangs' },
      { name: 'message.template_name', type: 'text', used: true, source: 'Messages API', description: 'Name des WhatsApp Templates' },
      { name: 'message.status', type: 'text', used: true, source: 'Messages API', description: 'sent, delivered, read, failed' },
      { name: 'message.created_at', type: 'date', used: true, source: 'Messages API', description: 'Sendezeitpunkt' },
      { name: 'message.error_code', type: 'text', used: false, source: 'Messages API', description: 'Fehlercode bei fehlgeschlagener Zustellung' },
      // Contacts
      { name: 'contact.id', type: 'text', used: true, source: 'Contacts API', description: 'Eindeutige Kontakt-ID' },
      { name: 'contact.name', type: 'text', used: true, source: 'Contacts API', description: 'Kontaktname' },
      { name: 'contact.phone', type: 'text', used: true, source: 'Contacts API', description: 'Telefonnummer (WhatsApp)' },
      { name: 'contact.email', type: 'text', used: false, source: 'Contacts API', description: 'E-Mail-Adresse' },
      { name: 'contact.custom_fields', type: 'object', used: false, source: 'Contacts API', description: 'Benutzerdefinierte Felder' },
      { name: 'contact.tags', type: 'array', used: false, source: 'Contacts API', description: 'Kontakt-Labels' },
      { name: 'contact.created_at', type: 'date', used: false, source: 'Contacts API', description: 'Erstellungsdatum' },
      // Templates
      { name: 'template.name', type: 'text', used: true, source: 'Templates API', description: 'Template-Name (z.B. standort_bereitschaft)' },
      { name: 'template.language', type: 'text', used: true, source: 'Templates API', description: 'Sprache (de, en, tr)' },
      { name: 'template.status', type: 'text', used: false, source: 'Templates API', description: 'approved, pending, rejected' },
      { name: 'template.components', type: 'array', used: false, source: 'Templates API', description: 'Template-Bestandteile (Header, Body, Buttons)' },
      { name: 'template.category', type: 'text', used: false, source: 'Templates API', description: 'marketing, utility, authentication' },
      // Channels
      { name: 'channel.id', type: 'text', used: false, source: 'Channels API', description: 'Kanal-ID' },
      { name: 'channel.type', type: 'text', used: false, source: 'Channels API', description: 'whatsapp, email, sms' },
      { name: 'channel.name', type: 'text', used: false, source: 'Channels API', description: 'Kanal-Name' },
      { name: 'channel.phone_number', type: 'text', used: false, source: 'Channels API', description: 'WhatsApp Business Nummer' },
    ],
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
    color: '#AF52DE',
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
    fields: [
      // Request
      { name: 'model', type: 'text', used: true, source: 'Messages API', description: 'Modell-ID (claude-sonnet-4-20250514, claude-haiku-4-5-20251001)' },
      { name: 'messages', type: 'array', used: true, source: 'Messages API', description: 'Konversationsverlauf (role + content)' },
      { name: 'max_tokens', type: 'number', used: true, source: 'Messages API', description: 'Maximale Antwortlaenge in Tokens' },
      { name: 'system', type: 'text', used: true, source: 'Messages API', description: 'System-Prompt mit Dashboard-Kontext' },
      { name: 'stream', type: 'boolean', used: true, source: 'Messages API', description: 'SSE Streaming aktiviert (true)' },
      { name: 'temperature', type: 'number', used: false, source: 'Messages API', description: 'Kreativitaet (0.0-1.0, default 1.0)' },
      { name: 'top_p', type: 'number', used: false, source: 'Messages API', description: 'Nucleus Sampling Parameter' },
      { name: 'top_k', type: 'number', used: false, source: 'Messages API', description: 'Top-K Sampling Parameter' },
      { name: 'stop_sequences', type: 'array', used: false, source: 'Messages API', description: 'Stop-Sequenzen fuer Antwort-Terminierung' },
      { name: 'tools', type: 'array', used: false, source: 'Messages API', description: 'Tool-Definitionen fuer Function Calling' },
      { name: 'tool_choice', type: 'text', used: false, source: 'Messages API', description: 'auto, any, tool (Tool-Auswahl-Strategie)' },
      // Response
      { name: 'response.id', type: 'text', used: true, source: 'Messages API', description: 'Eindeutige Antwort-ID (msg_...)' },
      { name: 'response.content', type: 'array', used: true, source: 'Messages API', description: 'Antwort-Bloecke (text, tool_use)' },
      { name: 'response.model', type: 'text', used: true, source: 'Messages API', description: 'Verwendetes Modell' },
      { name: 'response.stop_reason', type: 'text', used: true, source: 'Messages API', description: 'end_turn, max_tokens, stop_sequence, tool_use' },
      { name: 'response.usage.input_tokens', type: 'number', used: true, source: 'Messages API', description: 'Verbrauchte Input-Tokens' },
      { name: 'response.usage.output_tokens', type: 'number', used: true, source: 'Messages API', description: 'Generierte Output-Tokens' },
      { name: 'response.usage.cache_creation_input_tokens', type: 'number', used: false, source: 'Messages API', description: 'Tokens fuer Prompt Caching (Erstellung)' },
      { name: 'response.usage.cache_read_input_tokens', type: 'number', used: false, source: 'Messages API', description: 'Tokens aus Prompt Cache gelesen' },
      // Streaming Events
      { name: 'event.message_start', type: 'event', used: true, source: 'SSE Stream', description: 'Stream-Start mit Message-Metadaten' },
      { name: 'event.content_block_delta', type: 'event', used: true, source: 'SSE Stream', description: 'Text-Delta (inkrementelle Antwort)' },
      { name: 'event.message_stop', type: 'event', used: true, source: 'SSE Stream', description: 'Stream-Ende' },
      { name: 'event.ping', type: 'event', used: false, source: 'SSE Stream', description: 'Keepalive-Ping' },
      { name: 'event.error', type: 'event', used: false, source: 'SSE Stream', description: 'Fehler-Event im Stream' },
    ],
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
    fields: [
      // CSV Spalten die wir nutzen
      { name: 'Display ID', type: 'text', used: true, source: 'CSV Export', description: 'Display-Kennung (Format: ID/Name, Split bei /)' },
      { name: 'Timestamp', type: 'datetime', used: true, source: 'CSV Export', description: 'Heartbeat-Zeitstempel (DD.MM.YYYY HH:MM)' },
      { name: 'Location Name', type: 'text', used: true, source: 'CSV Export', description: 'Standortname' },
      { name: 'Serial Number', type: 'text', used: true, source: 'CSV Export', description: 'Display-Seriennummer' },
      { name: 'Date', type: 'date', used: true, source: 'CSV Export', description: 'Registrierungsdatum' },
      { name: 'Status', type: 'text', used: true, source: 'CSV Export', description: 'Heartbeat-Status (Online/Offline)' },
      { name: 'Is Alive', type: 'text', used: true, source: 'CSV Export', description: 'Alive-Flag (Yes/No)' },
      { name: 'Display Status', type: 'text', used: true, source: 'CSV Export', description: 'Display-Status (Active, Inactive)' },
      { name: 'Last Online Date', type: 'datetime', used: true, source: 'CSV Export', description: 'Letzter Online-Zeitpunkt' },
      { name: 'Days Offline', type: 'number', used: true, source: 'CSV Export', description: 'Anzahl Tage offline' },
      // Theoretisch verfuegbare Google Sheets API v4 Features
      { name: 'spreadsheetId', type: 'text', used: false, source: 'Sheets API v4', description: 'Spreadsheet-ID (wir nutzen Public CSV statt API)' },
      { name: 'sheets[].properties', type: 'object', used: false, source: 'Sheets API v4', description: 'Sheet-Metadaten (Titel, Index, Groesse)' },
      { name: 'sheets[].data', type: 'array', used: false, source: 'Sheets API v4', description: 'Zelldaten mit Formatierung' },
      { name: 'namedRanges', type: 'array', used: false, source: 'Sheets API v4', description: 'Benannte Bereiche' },
      { name: 'developerMetadata', type: 'array', used: false, source: 'Sheets API v4', description: 'Entwickler-Metadaten' },
      { name: 'values', type: 'array', used: false, source: 'Sheets API v4', description: 'Batch-Read/Write von Zellwerten' },
    ],
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
    fields: [
      // Install Booker Invite (incoming webhook payload)
      { name: 'location_name', type: 'text', used: true, source: 'install-booker-invite', description: 'Standortname aus Airtable' },
      { name: 'jet_id', type: 'text', used: true, source: 'install-booker-invite', description: 'JET-ID des Standorts' },
      { name: 'contact_name', type: 'text', used: true, source: 'install-booker-invite', description: 'Ansprechpartner-Name' },
      { name: 'contact_phone', type: 'text', used: true, source: 'install-booker-invite', description: 'Telefonnummer fuer WhatsApp' },
      { name: 'language', type: 'text', used: true, source: 'install-booker-invite', description: 'Sprache (de, en, tr)' },
      { name: 'install_date', type: 'date', used: true, source: 'install-booker-invite', description: 'Geplanter Installations-Termin' },
      { name: 'airtable_record_id', type: 'text', used: true, source: 'install-booker-invite', description: 'Airtable Record ID fuer Write-back' },
      // Bank Import (incoming webhook payload)
      { name: 'xlsx_data', type: 'binary', used: true, source: 'bank-import', description: 'XLSX-Datei als Base64 (Bank/Leasing Daten)' },
      { name: 'sender_email', type: 'text', used: true, source: 'bank-import', description: 'Absender-E-Mail der Bank' },
      { name: 'subject', type: 'text', used: true, source: 'bank-import', description: 'E-Mail-Betreff' },
      { name: 'received_at', type: 'date', used: true, source: 'bank-import', description: 'Empfangszeitpunkt' },
      // Theoretisch verfuegbare Make.com API Features
      { name: 'scenario.id', type: 'number', used: false, source: 'Scenarios API', description: 'Szenario-ID' },
      { name: 'scenario.name', type: 'text', used: false, source: 'Scenarios API', description: 'Szenario-Name' },
      { name: 'scenario.is_enabled', type: 'boolean', used: false, source: 'Scenarios API', description: 'Aktiv/Inaktiv' },
      { name: 'execution.id', type: 'number', used: false, source: 'Executions API', description: 'Execution-ID' },
      { name: 'execution.status', type: 'text', used: false, source: 'Executions API', description: 'success, warning, error' },
      { name: 'execution.operations', type: 'number', used: false, source: 'Executions API', description: 'Verbrauchte Operationen' },
      { name: 'data_store', type: 'object', used: false, source: 'Data Stores API', description: 'Persistenter Key-Value Speicher' },
    ],
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
  { label: 'APIs Gesamt', value: '7', icon: Globe, color: '#007AFF', sub: 'Integrierte Services' },
  { label: 'Aktive Endpunkte', value: '~25', icon: Server, color: '#AF52DE', sub: 'GET, POST, PATCH, DELETE' },
  { label: 'Read-Only', value: '2', icon: Eye, color: '#06b6d4', sub: 'Vistar, Google Sheets' },
  { label: 'Read + Write', value: '4', icon: Edit3, color: '#10b981', sub: 'Airtable, Supabase, Superchat, Claude' },
  { label: 'Scheduled Syncs', value: '3', icon: RefreshCw, color: '#FF9500', sub: 'Airtable, Vistar, Heartbeats' },
  { label: 'Env Variables', value: '9', icon: Key, color: '#FF3B30', sub: 'In Netlify Environment' },
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
          api.unusedFeatures.some(f => f.toLowerCase().includes(q)) ||
          (api.fields || []).some(f => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q))
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
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Globe size={20} className="text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-text-primary">API & Service Overview</h2>
          <p className="text-xs text-text-muted">Alle integrierten APIs, Rechte und verfuegbare Funktionen</p>
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
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suche nach API, Endpoint, Funktion, Datei..."
            className="w-full bg-surface-primary border border-border-secondary rounded-xl pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-blue-400/60 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
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
              className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden shadow-card transition-all"
            >
              {/* API Header (clickable) */}
              <button
                onClick={() => setExpandedApi(isExpanded ? null : api.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-secondary/50 transition-colors"
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
                    <span className="text-sm font-semibold text-text-primary truncate">{api.name}</span>
                    {api.subtitle && (
                      <span className="text-xs text-text-muted hidden sm:inline">({api.subtitle})</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 truncate">{api.description}</p>
                </div>

                {/* Badges */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  {/* Status Badge */}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                    api.status === 'connected'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                      : 'bg-surface-secondary text-text-muted border border-border-secondary'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${api.status === 'connected' ? 'bg-emerald-500' : 'bg-text-muted'}`} />
                    {api.statusLabel}
                  </span>

                  {/* Auth Method Tag */}
                  <span className="text-xs bg-surface-secondary/80 text-text-muted px-2 py-1 rounded-lg flex items-center gap-1">
                    <Lock size={10} />
                    {api.authMethod}
                  </span>

                  {/* Rights Badge */}
                  <RightsBadge rights={api.rights} color={api.rightsColor} />
                </div>

                {/* Expand */}
                <div className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  <ChevronRight size={16} className="text-text-muted" />
                </div>
              </button>

              {/* Mobile badges (shown below header on small screens) */}
              <div className="sm:hidden flex items-center gap-2 px-4 pb-3 -mt-1 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  api.status === 'connected'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-surface-secondary text-text-muted'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${api.status === 'connected' ? 'bg-emerald-500' : 'bg-text-muted'}`} />
                  {api.statusLabel}
                </span>
                <RightsBadge rights={api.rights} color={api.rightsColor} />
                <span className="text-xs bg-surface-secondary/80 text-text-muted px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Lock size={9} />
                  {api.authMethod}
                </span>
              </div>

              {/* ── Expanded Detail ── */}
              {isExpanded && (
                <div className="border-t border-border-secondary bg-surface-secondary/30 p-4 space-y-4">
                  {/* Meta Row */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <MetaChip label="Base URL" value={api.baseUrl} onCopy={handleCopy} copied={copiedText === api.baseUrl} />
                    {api.secondaryUrl && (
                      <MetaChip label="Platform API" value={api.secondaryUrl} onCopy={handleCopy} copied={copiedText === api.secondaryUrl} />
                    )}
                    <MetaChip label="Rate Limit" value={api.rateLimit} />
                    <MetaChip label="Rechte" value={api.rights} />
                    <span className="inline-flex items-center gap-1 bg-surface-secondary/80 text-text-secondary px-2 py-1 rounded-lg text-xs">
                      <Code size={10} className="text-text-muted" />
                      {api.usedBy.length} Dateien
                    </span>
                  </div>

                  {/* API-level Fields FIRST (for non-Airtable APIs) */}
                  {api.fields && api.fields.length > 0 && (
                    <div className="bg-surface-primary rounded-xl border border-border-secondary/40 overflow-hidden">
                      <div className="px-3 py-2 border-b border-border-secondary/40 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                          <Database size={12} />
                          Verfuegbare Felder & Parameter ({api.fields.length})
                          <span className="text-[10px] text-text-muted font-normal normal-case tracking-normal ml-2">
                            {api.fields.filter(f => f.used).length} genutzt / {api.fields.filter(f => !f.used).length} verfuegbar
                          </span>
                        </h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border-secondary/40 bg-surface-secondary/50">
                              <th className="text-center px-2 py-1.5 w-6"></th>
                              <th className="text-left px-2 py-1.5 font-semibold text-text-muted">Feld / Parameter</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-text-muted">Typ</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-text-muted">Quelle</th>
                              <th className="text-left px-2 py-1.5 font-semibold text-text-muted">Beschreibung</th>
                            </tr>
                          </thead>
                          <tbody>
                            {api.fields.map((field, k) => (
                              <tr key={k} className={`border-b border-border-secondary/40 ${!field.used ? 'opacity-50' : ''}`}>
                                <td className="text-center px-2 py-1.5">
                                  {field.used ? (
                                    <CheckCircle2 size={11} className="text-emerald-500 mx-auto" />
                                  ) : (
                                    <div className="w-2.5 h-2.5 rounded-full border border-border-primary mx-auto" />
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-text-primary text-[11px]">{field.name}</td>
                                <td className="px-2 py-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    field.type === 'text' ? 'bg-accent-light text-blue-700' :
                                    field.type === 'date' || field.type === 'datetime' ? 'bg-brand-purple/10 text-purple-700' :
                                    field.type === 'number' ? 'bg-status-online/10 text-green-700' :
                                    field.type === 'currency' ? 'bg-emerald-50 text-emerald-700' :
                                    field.type === 'percent' ? 'bg-teal-50 text-teal-700' :
                                    field.type === 'array' || field.type === 'object' ? 'bg-status-warning/10 text-orange-700' :
                                    field.type === 'boolean' ? 'bg-status-warning/10 text-yellow-700' :
                                    field.type === 'binary' ? 'bg-status-offline/10 text-red-700' :
                                    field.type === 'uuid' ? 'bg-indigo-50 text-indigo-700' :
                                    field.type === 'query' || field.type === 'header' ? 'bg-cyan-50 text-cyan-700' :
                                    field.type === 'function' ? 'bg-violet-50 text-violet-700' :
                                    field.type === 'event' ? 'bg-status-warning/10 text-amber-700' :
                                    field.type === 'void' ? 'bg-surface-secondary text-text-muted' :
                                    'bg-surface-secondary text-text-secondary'
                                  }`}>{field.type}</span>
                                </td>
                                <td className="px-2 py-1.5 text-[11px] text-text-muted">{field.source}</td>
                                <td className="px-2 py-1.5 text-[11px] text-text-muted max-w-sm">{field.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Tables FIRST (if any) — expandable rows */}
                  {api.tables.length > 0 && (
                    <div className="bg-surface-primary rounded-xl border border-border-secondary/40 overflow-hidden">
                      <div className="px-3 py-2 border-b border-border-secondary/40 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                          <Database size={12} />
                          Tabellen / Collections ({api.tables.length})
                          {api.tables.some(t => t.fields) && (
                            <span className="text-[10px] text-text-muted font-normal normal-case tracking-normal ml-2">Klicken zum Aufklappen</span>
                          )}
                        </h4>
                        {api.tables.some(t => t.fields && t.fields.length > 0) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); exportAllTablesCSV(api); }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-primary border border-border-secondary text-text-secondary hover:border-blue-400/60 hover:text-accent transition-colors"
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
                            <tr className="border-b border-border-secondary/40 bg-surface-secondary/50">
                              <th className="text-left px-3 py-2 font-semibold text-text-muted w-6"></th>
                              <th className="text-left px-3 py-2 font-semibold text-text-muted">Table ID</th>
                              <th className="text-left px-3 py-2 font-semibold text-text-muted">Name</th>
                              <th className="text-left px-3 py-2 font-semibold text-text-muted">Verwendung</th>
                            </tr>
                          </thead>
                          <tbody>
                            {api.tables.map((table, i) => {
                              const tableKey = `${api.id}-${table.id}`;
                              const isTableExpanded = expandedTableId === tableKey;
                              return (
                                <React.Fragment key={i}>
                                  <tr
                                    className="border-b border-border-secondary/60 hover:bg-accent-light/30 cursor-pointer transition-colors"
                                    onClick={() => setExpandedTableId(isTableExpanded ? null : tableKey)}
                                  >
                                    <td className="px-3 py-2 text-text-muted">
                                      <div className={`transition-transform ${isTableExpanded ? 'rotate-90' : ''}`}>
                                        <ChevronRight size={12} />
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-text-muted text-[11px]">
                                      <span
                                        className="cursor-pointer hover:text-text-primary"
                                        onClick={(e) => { e.stopPropagation(); handleCopy(table.id); }}
                                      >
                                        {table.id}
                                        {copiedText === table.id && <CheckCircle2 size={10} className="inline ml-1 text-emerald-500" />}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 font-medium text-text-primary">{table.name}</td>
                                    <td className="px-3 py-2 text-text-muted">{table.usage}</td>
                                  </tr>

                                  {/* Expanded table detail */}
                                  {isTableExpanded && (
                                    <tr>
                                      <td colSpan={4} className="p-0">
                                        <div className="bg-surface-secondary/50 border-t border-border-secondary/40 p-4 space-y-3">
                                          {/* Sync Info + Usage chips */}
                                          <div className="flex flex-wrap gap-3 text-xs">
                                            {table.syncFrequency && (
                                              <span className="inline-flex items-center gap-1 bg-accent-light text-blue-700 px-2 py-1 rounded-lg">
                                                <RefreshCw size={10} /> {table.syncFrequency}
                                              </span>
                                            )}
                                            {table.syncMethod && (
                                              <span className="inline-flex items-center gap-1 bg-brand-purple/10 text-purple-700 px-2 py-1 rounded-lg">
                                                {table.syncMethod}
                                              </span>
                                            )}
                                            {table.supabaseTable && (
                                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg">
                                                {'\u2192'} {table.supabaseTable}
                                              </span>
                                            )}
                                          </div>

                                          {/* Used in components */}
                                          {table.usedIn && table.usedIn.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                              <span className="text-xs text-text-muted mr-1">Verwendet in:</span>
                                              {table.usedIn.map((comp, j) => (
                                                <span key={j} className="text-xs bg-accent-light/80 text-blue-700 px-2 py-0.5 rounded">
                                                  {comp}
                                                </span>
                                              ))}
                                            </div>
                                          )}

                                          {/* Fields table */}
                                          {table.fields && table.fields.length > 0 && (
                                            <div className="bg-surface-primary rounded-xl border border-border-secondary/40 overflow-hidden">
                                              <div className="px-3 py-2 border-b border-border-secondary/40 flex items-center justify-between">
                                                <span className="text-xs font-semibold text-text-primary">
                                                  Felder ({table.fields.length})
                                                </span>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[10px] text-text-muted">
                                                    {table.fields.filter(f => f.synced).length} synced / {table.fields.filter(f => !f.synced).length} verfuegbar
                                                  </span>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); exportTableCSV(table, api.name); }}
                                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-surface-secondary/80 text-text-muted hover:bg-accent-light hover:text-accent transition-colors"
                                                    title={`${table.name} als CSV exportieren`}
                                                  >
                                                    <Download size={10} />
                                                    CSV
                                                  </button>
                                                </div>
                                              </div>
                                              <table className="w-full text-xs">
                                                <thead>
                                                  <tr className="border-b border-border-secondary/40 bg-surface-secondary/50">
                                                    <th className="text-center px-2 py-1.5 w-6"></th>
                                                    <th className="text-left px-2 py-1.5 font-semibold text-text-muted">Airtable</th>
                                                    <th className="text-center px-1 py-1.5 text-text-muted w-6">{'\u2192'}</th>
                                                    <th className="text-left px-2 py-1.5 font-semibold text-text-muted">Supabase</th>
                                                    <th className="text-left px-2 py-1.5 font-semibold text-text-muted">Typ</th>
                                                    <th className="text-left px-2 py-1.5 font-semibold text-text-muted">Bedeutung</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {table.fields.map((field, k) => (
                                                    <tr key={k} className={`border-b border-border-secondary/40 ${!field.synced ? 'opacity-50' : ''}`}>
                                                      <td className="text-center px-2 py-1.5">
                                                        {field.synced ? (
                                                          <CheckCircle2 size={11} className="text-emerald-500 mx-auto" />
                                                        ) : (
                                                          <div className="w-2.5 h-2.5 rounded-full border border-border-primary mx-auto" />
                                                        )}
                                                      </td>
                                                      <td className="px-2 py-1.5 text-text-primary text-[11px]">
                                                        <span className="inline-flex items-center gap-1">
                                                          {field.airtable}
                                                          {field.airtable !== field.airtable.trim() && (
                                                            <span className="relative group cursor-help">
                                                              <AlertCircle size={10} className="text-status-warning" />
                                                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-surface-primary text-white text-[10px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                Feldname hat Leerzeichen am Ende (Trailing Space) — Bug in Airtable
                                                              </span>
                                                            </span>
                                                          )}
                                                          {/[Ll]enth|[Mm]aximun|visiblity|weekdend|Longt?itude/.test(field.airtable) && (
                                                            <span className="relative group cursor-help">
                                                              <AlertCircle size={10} className="text-status-offline" />
                                                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-surface-primary text-white text-[10px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                Tippfehler im Airtable-Feldnamen — kann nicht umbenannt werden ohne Sync-Bruch
                                                              </span>
                                                            </span>
                                                          )}
                                                          {/  /.test(field.airtable) && (
                                                            <span className="relative group cursor-help">
                                                              <AlertCircle size={10} className="text-orange-400" />
                                                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-surface-primary text-white text-[10px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                Doppeltes Leerzeichen im Feldnamen — Bug in Airtable
                                                              </span>
                                                            </span>
                                                          )}
                                                        </span>
                                                      </td>
                                                      <td className="text-center px-1 py-1.5 text-text-muted">{'\u2192'}</td>
                                                      <td className="px-2 py-1.5 text-blue-700 text-[11px]">{field.supabase}</td>
                                                      <td className="px-2 py-1.5">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                          field.type === 'text' ? 'bg-accent-light text-blue-700' :
                                                          field.type === 'date' ? 'bg-brand-purple/10 text-purple-700' :
                                                          field.type === 'number' ? 'bg-status-online/10 text-green-700' :
                                                          field.type === 'array' ? 'bg-status-warning/10 text-orange-700' :
                                                          field.type === 'attachment' ? 'bg-pink-50 text-pink-700' :
                                                          field.type === 'link' ? 'bg-cyan-50 text-cyan-700' :
                                                          'bg-surface-secondary text-text-secondary'
                                                        }`}>{field.type}</span>
                                                      </td>
                                                      <td className="px-2 py-1.5 text-[11px] text-text-muted max-w-xs">{field.interpretation || ''}</td>
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
                  <div className="bg-surface-primary rounded-xl border border-border-secondary/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-border-secondary/40">
                      <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                        <Link size={12} />
                        Genutzte Endpoints ({api.endpoints.length})
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border-secondary/40 bg-surface-secondary/50">
                            <th className="text-left px-3 py-2 font-semibold text-text-muted w-20">Method</th>
                            <th className="text-left px-3 py-2 font-semibold text-text-muted">Endpoint</th>
                            <th className="text-left px-3 py-2 font-semibold text-text-muted">Beschreibung</th>
                          </tr>
                        </thead>
                        <tbody>
                          {api.endpoints.map((ep, i) => (
                            <tr key={i} className="border-b border-border-secondary/60 hover:bg-surface-secondary/50">
                              <td className="px-3 py-2">
                                <MethodBadge method={ep.method} />
                              </td>
                              <td className="px-3 py-2 text-text-primary text-[11px]">{ep.path}</td>
                              <td className="px-3 py-2 text-text-muted flex items-center gap-1.5">
                                <ep.icon size={11} className="text-text-muted shrink-0" />
                                {ep.description}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* API Details (Auth, Rights, Used By) — below fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Auth Details */}
                    <div className="bg-surface-primary rounded-xl border border-border-secondary/40 p-3">
                      <h4 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                        <Key size={12} />
                        Authentifizierung
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        {api.authDetails.map((detail, i) => (
                          <div key={i} className="flex justify-between gap-2">
                            <span className="text-text-muted shrink-0">{detail.label}</span>
                            <span className="font-mono text-text-primary text-right truncate">{detail.value}</span>
                          </div>
                        ))}
                      </div>
                      {api.envVars.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-border-secondary/40">
                          <div className="text-[10px] text-text-muted mb-1.5">Environment Variables</div>
                          <div className="flex flex-wrap gap-1">
                            {api.envVars.map((v, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-xs bg-status-offline/10/80 text-red-700 px-1.5 py-0.5 rounded cursor-pointer hover:bg-status-offline/10/80" onClick={() => handleCopy(v)}>
                                <Key size={9} />
                                {v}
                                {copiedText === v ? <CheckCircle2 size={9} className="text-emerald-500" /> : <Copy size={9} className="text-status-offline" />}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {api.envVars.length === 0 && (
                        <div className="mt-3 pt-2 border-t border-border-secondary/40">
                          <div className="text-[10px] text-text-muted italic">Keine Env Variables noetig (Public Access)</div>
                        </div>
                      )}
                    </div>

                    {/* Rights & Access */}
                    <div className="bg-surface-primary rounded-xl border border-border-secondary/40 p-3">
                      <h4 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1.5">
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
                          <p className="text-text-muted mt-1">{api.rightsDetail}</p>
                        </div>
                        <div className="mt-2 pt-2 border-t border-border-secondary/40">
                          <div className="flex items-center gap-1.5 text-text-muted mb-1">
                            <Clock size={11} />
                            <span className="uppercase tracking-wider text-[10px]">Rate Limit</span>
                          </div>
                          <span className="font-mono text-text-secondary text-xs">{api.rateLimit}</span>
                        </div>
                      </div>
                      {api.modes && (
                        <div className="mt-3 pt-2 border-t border-border-secondary/40">
                          <div className="text-[10px] text-text-muted mb-1.5">Modi</div>
                          <div className="space-y-1">
                            {api.modes.map((mode, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-xs">
                                <span className="text-brand-purple mt-0.5"><Sparkles size={10} /></span>
                                <div>
                                  <span className="font-medium text-text-primary">{mode.name}</span>
                                  <span className="text-text-muted ml-1">— {mode.description}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Used By */}
                    <div className="bg-surface-primary rounded-xl border border-border-secondary/40 p-3">
                      <h4 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                        <Code size={12} />
                        Verwendet in
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {api.usedBy.map((file, i) => (
                          <span key={i} className="inline-flex items-center text-xs bg-accent-light/80 text-blue-700 px-2 py-1 rounded-lg">
                            {file}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 pt-2 border-t border-border-secondary/40 text-xs text-text-muted">
                        <span className="font-mono">{api.endpoints.length}</span> Endpoints
                        {api.tables.length > 0 && (
                          <span> | <span className="font-mono">{api.tables.length}</span> Tabellen</span>
                        )}
                        {api.fields && (
                          <span> | <span className="font-mono">{api.fields.length}</span> Felder</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Unused Features */}
                  <div className="bg-surface-primary rounded-xl border border-border-secondary/40 p-3">
                    <h4 className="text-xs font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                      <AlertCircle size={12} className="text-status-warning" />
                      Verfuegbar aber nicht genutzt
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {api.unusedFeatures.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-text-muted mt-0.5 shrink-0">
                            <Unlock size={11} />
                          </span>
                          <span className="text-text-muted">{feature}</span>
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
          <div className="text-center py-12 text-text-muted text-sm">
            Keine APIs gefunden fuer &quot;{searchQuery}&quot;
          </div>
        )}
      </div>

      {/* ── Architecture Overview ── */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-card">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
          <Server size={16} className="text-accent" />
          Architektur & Datenfluss
        </h3>
        <div className="font-mono text-xs text-text-secondary leading-relaxed bg-surface-secondary/80 rounded-xl p-4 border border-border-secondary/40 overflow-x-auto">
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
        <div className="mt-4 bg-status-offline/10/30 rounded-xl p-3 border border-status-offline/20/30">
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
                className="inline-flex items-center gap-1 text-xs bg-status-offline/10/60 text-red-800 px-2 py-1 rounded-lg cursor-pointer hover:bg-status-offline/10"
                onClick={() => handleCopy(v)}
              >
                <Lock size={9} />
                {v}
                {copiedText === v && <CheckCircle2 size={9} className="text-emerald-500" />}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 text-xs text-text-muted">
          <Info size={12} className="text-accent mt-0.5 shrink-0" />
          <span>
            <strong>Architektur-Prinzip:</strong> Alle externen API-Calls laufen ueber Netlify Functions (Server-side Proxy).
            Das Frontend spricht NUR mit Supabase (Anon Key + RLS). API-Keys sind nie im Browser sichtbar.
          </span>
        </div>
      </div>

      {/* ── Sync Schedule Overview ── */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-card">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
          <RefreshCw size={16} className="text-status-warning" />
          Sync-Schedule & Cron Jobs
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-secondary">
                <th className="text-left px-3 py-2 font-semibold text-text-muted">Job</th>
                <th className="text-left px-3 py-2 font-semibold text-text-muted">Quelle</th>
                <th className="text-left px-3 py-2 font-semibold text-text-muted">Ziel</th>
                <th className="text-left px-3 py-2 font-semibold text-text-muted">Frequenz</th>
                <th className="text-left px-3 py-2 font-semibold text-text-muted">Methode</th>
              </tr>
            </thead>
            <tbody>
              {[
                { job: 'sync-airtable.js', source: 'Airtable (13 Tables)', target: 'Supabase', freq: 'Alle 2 Stunden', method: 'Inkrementell (LAST_MODIFIED_TIME)' },
                { job: 'sync-airtable.js', source: 'Google Sheets (CSV)', target: 'display_heartbeats', freq: 'Alle 2 Stunden', method: 'Append-only INSERT' },
                { job: 'vistar-sync-scheduled.js', source: 'Vistar SSP', target: 'vistar_venue_health', freq: 'Alle 4 Stunden', method: 'Upsert (venue_id + date)' },
                { job: 'sync-attachments-scheduled.js', source: 'Airtable Attachments', target: 'Supabase Storage', freq: 'Alle 30 Minuten', method: 'Differential (URL hash check)' },
              ].map((row, i) => (
                <tr key={i} className="border-b border-border-secondary/60 hover:bg-surface-secondary/30">
                  <td className="px-3 py-2 text-blue-700">{row.job}</td>
                  <td className="px-3 py-2 text-text-primary">{row.source}</td>
                  <td className="px-3 py-2 text-text-secondary">{row.target}</td>
                  <td className="px-3 py-2">
                    <span className="bg-status-warning/10 text-amber-700 px-1.5 py-0.5 rounded">{row.freq}</span>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{row.method}</td>
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
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-3.5 shadow-card">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '12' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-xl font-bold text-text-primary">{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
        active
          ? 'bg-surface-primary text-text-primary shadow-sm border border-border-secondary'
          : 'bg-surface-primary/40 text-text-muted hover:text-text-secondary border border-transparent'
      }`}
    >
      {color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      {count != null && (
        <span className={`font-mono px-1 py-0.5 rounded text-xs ${
          active ? 'bg-accent-light text-accent' : 'bg-surface-secondary/60 text-text-muted'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function MetaChip({ label, value, onCopy, copied }) {
  return (
    <span className="inline-flex items-center gap-1 bg-surface-secondary/80 text-text-secondary px-2 py-1 rounded-lg text-xs max-w-full">
      <span className="text-text-muted font-sans shrink-0">{label}:</span>
      <span className="text-text-primary truncate">{value}</span>
      {onCopy && (
        <button onClick={() => onCopy(value)} className="text-text-muted hover:text-text-muted ml-0.5 shrink-0">
          {copied ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Copy size={10} />}
        </button>
      )}
    </span>
  );
}

function RightsBadge({ rights, color }) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    blue: 'bg-accent-light text-blue-700 border-accent/20/60',
    amber: 'bg-status-warning/10 text-amber-700 border-status-warning/20/60',
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
    <span className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 border ${colorClasses[color] || colorClasses.blue}`}>
      <RIcon size={10} />
      {rights}
    </span>
  );
}

function MethodBadge({ method }) {
  const colors = {
    GET: 'bg-accent-light text-blue-700',
    POST: 'bg-emerald-50 text-emerald-700',
    PATCH: 'bg-status-warning/10 text-amber-700',
    PUT: 'bg-status-warning/10 text-orange-700',
    DELETE: 'bg-status-offline/10 text-red-700',
  };

  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${colors[method] || 'bg-surface-secondary text-text-secondary'}`}>
      {method}
    </span>
  );
}

function RightsSummaryCard({ icon: Icon, title, color, items }) {
  const colorClasses = {
    blue: 'bg-accent-light/50 border-accent/20/30 text-blue-800',
    emerald: 'bg-emerald-50/50 border-emerald-200/30 text-emerald-800',
    amber: 'bg-status-warning/10/50 border-status-warning/20/30 text-amber-800',
    purple: 'bg-brand-purple/10/50 border-brand-purple/20/30 text-purple-800',
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
