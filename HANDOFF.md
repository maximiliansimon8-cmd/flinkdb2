# VOLLSTAENDIGE UEBERGABE — FlinkDB2

> Dieses Dokument dient als vollstaendiges Briefing fuer einen neuen Claude-Agenten.
> Kopiere den gesamten Inhalt als erste Nachricht in ein neues Chat-Fenster.

---

## GRUNDREGELN

> Diese Regeln sind VERBINDLICH. Bei Widerspruch zwischen Code und diesen Regeln gelten diese Regeln.

### REGEL 1: Datenquelle-Hierarchie

```
Airtable = Source of Truth (13 Tabellen, Originalfelder)
     ↓ sync-airtable.js (*/5 Min, inkrementell via LAST_MODIFIED_TIME)
     ↓ trigger-sync-background.js (Background Function, max 15 Min)
Supabase = Read-Cache (46+ Tabellen)
     ↓
Frontend = liest NUR von Supabase (@supabase/supabase-js SDK)
     ↓
Schreiboperationen = Frontend → Netlify Function → Airtable API
                     (Supabase beim naechsten Sync aktualisiert)
```

- **NIEMALS** direkt in Supabase schreiben wenn die Daten aus Airtable stammen
- **Ausnahme:** Supabase-only Tabellen (install_bookings, install_routen, install_teams,
  app_users, groups, audit_log, feature_flags, warehouse_*, etc.) duerfen direkt beschrieben werden

### REGEL 2: Standort-Status-Praedikate (KANONISCH)

Die Datei `src/metrics/predicates.js` ist die EINZIGE WAHRHEITSQUELLE.
**NIEMALS** eigene lokale Kopien erstellen. IMMER importieren:

```javascript
import { isStorno, isAlreadyInstalled, isReadyForInstall, isPendingApproval } from '../metrics';
```

| Praedikat | Bedingungen |
|-----------|-------------|
| `isStorno(r)` | akquiseStorno=true ODER postInstallStorno=true ODER leadStatus enthaelt 'storno'/'cancelled'/'lost' |
| `isAlreadyInstalled(r)` | installationsStatus enthaelt 'installiert'/'live'/'abgebrochen' ODER leadStatus='live'/'installation' ODER displayLocationStatus nicht-leer |
| `isReadyForInstall(r)` | leadStatus='won / signed' UND approvalStatus='accepted'/'approved' UND vertragVorhanden=true |
| `isPendingApproval(r)` | leadStatus='won / signed' UND approvalStatus in ['in review','info required','not started','not tarted'] |

**Kritisch:** `isReadyForInstall` prueft NICHT auf Storno/Installiert — der Aufrufer MUSS das tun:
```javascript
const aufbaubereit = records.filter(a =>
  !isStorno(a) && !isAlreadyInstalled(a) && isReadyForInstall(a)
);
```

### REGEL 3: Supabase SDK Frontend JA, Backend NEIN

```javascript
// FRONTEND: SDK verwenden
import { supabase } from '../utils/authService';
const { data } = await supabase.from('acquisition').select('id, leadStatus');

// BACKEND (Netlify Functions): fetch() direkt
const res = await fetch(`${SUPABASE_URL}/rest/v1/tabelle?select=id,name`, {
  headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY },
});
```

### REGEL 4: Security Module Pflicht

Jede Netlify Function MUSS diese Imports haben:

```javascript
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
```

### REGEL 5: Airtable-Felder aus Konstanten

Airtable-Felder haben bekannte Probleme:

| Problem | Beispiel |
|---------|----------|
| Trailing Spaces | `'Online Status '` |
| Double Spaces | `'Lead Status  (from Akquise)'` |
| Unicode Hyphen U+2011 | `'Post‑Install Storno'` |
| Typos | `'external_visiblity'`, `'Longtitude'` |
| Checkbox = String | `ready_for_installation = 'checked'` nicht `true` |
| Lookup = Array | Lookup-Felder liefern immer Arrays |

**IMMER** aus `netlify/functions/shared/airtableFields.js` lesen.

### REGEL 6: Buchungsstatus-Kategorien

| DB-Status | UI-Label | Farbe |
|-----------|----------|-------|
| `pending` | Eingeladen | Gelb #eab308 |
| `booked` | Eingebucht | Gruen #22c55e |
| `confirmed` | Eingebucht | Gruen #22c55e |
| `completed` | Abgeschlossen | Emerald #10b981 |
| `cancelled` | Storniert | Rot #ef4444 |
| `no_show` | No-Show | Grau #6b7280 |

**`booked` und `confirmed` werden IMMER als "Eingebucht" zusammengefasst.**

---

## PROJEKT-IDENTITAET

| | |
|---|---|
| **Name** | FlinkDB2 |
| **Zweck** | DOOH Display-Netzwerk Operations Dashboard |
| **Betreiber** | Dimension Outdoor |
| **Live-URL** | https://startling-pothos-27fc77.netlify.app |
| **Repo** | maximiliansimon8-cmd/flinkdb2 |
| **Displays** | ~350 digitale Screens in Deutschland |

---

## TECH STACK

| Bereich | Technologie | Version |
|---------|------------|---------|
| Frontend | React | 19.2.0 |
| Styling | Tailwind CSS | 4.1.18 |
| Build | Vite | 7.3.1 |
| Charts | Recharts | 3.7.0 |
| Karten | React-Leaflet + Leaflet | 5.0.0 / 1.9.4 |
| Icons | Lucide React | 0.563.0 |
| Excel-Import | xlsx | 0.18.5 |
| CSV-Parser | papaparse | 5.5.3 |
| QR-Codes | qrcode | 1.5.4 |
| Backend | Netlify Functions (ES Modules) | Node 20 |
| Datenbank | Supabase (PostgreSQL) | SDK 2.95.3 |
| Hosting | Netlify | CDN + Functions |

---

## 7 ENTRY POINTS

### 1. Main Dashboard (`/`, `/dashboard`)
- **Entry:** `index.html` → `src/main.jsx` → `src/App.jsx`
- **Auth:** Supabase JWT (8h Session)
- **Zweck:** Komplettes Operations-Dashboard
- **Tabs:** Dashboard, Displays, Tasks, Kommunikation, Hardware, Akquise, Installationen, Programmatic, Admin

### 2. Install Tool (`/install`)
- **Entry:** `install.html` → `src/install-main.jsx` → `src/InstallApp.jsx`
- **Auth:** Supabase JWT
- **Zweck:** Standalone Installations-Management
- **Subtabs:** Executive, Aufbaubereit, Buchungen, Telefon, WA-Einladungen, Karte, Kalender, Team-Tagesplan, Monteur-Zugaenge, Admin

### 3. Booking Page (`/book/*`)
- **Entry:** `booking/index.html` → `booking/BookingPage.jsx`
- **Auth:** Public (Token-basiert)
- **Zweck:** Standort-Betreiber waehlen Installationstermin

### 4. Scheduling (`/scheduling/*`)
- **Entry:** `scheduling/index.html` → `scheduling/SchedulingApp.jsx`
- **Auth:** Supabase JWT
- **Zweck:** Telefon-Akquise Interface + Standort-Detail-Editor

### 5. Inspection (`/inspection/*`)
- **Entry:** `inspection/index.html` → `InspectionApp.jsx`
- **Auth:** Token-basiert
- **Zweck:** Protokollpruefung fuer externe Pruefer

### 6. FAW Check (`/faw/*`)
- **Entry:** `faw/index.html` → `FAWCheckApp.jsx`
- **Auth:** Token-basiert
- **Zweck:** INDA-Frequenzanalyse

### 7. Monteur View (`/monteur`)
- **Entry:** `index.html` (Hash-Route in App.jsx)
- **Auth:** HMAC Token (stateless)
- **Zweck:** Tagesroute fuer Monteur-Teams (mobil-optimiert)

---

## NETLIFY FUNCTIONS (39)

### Scheduled Functions

| Function | Cron | Zweck |
|----------|------|-------|
| `sync-airtable.js` | */5 * * * * | Trigger fuer Background-Sync (< 1s) |
| `sync-attachments-scheduled.js` | */15 * * * * | Trigger fuer Foto-Sync |
| `install-booker-reminder.js` | @hourly | WhatsApp/SMS Erinnerungen |
| `vistar-sync-scheduled.js` | 0 3 * * * | Vistar SSP Revenue (taeglich 03:00 UTC) |
| `navori-heartbeat-scheduled.js` | Trigger | Navori Heartbeat-CSV Import |
| `install-verification-scheduled.js` | Trigger | Foto-Verifikation |

**KRITISCH:** Scheduled Functions haben 30s Limit → Background Functions (15 Min Limit) fuer lange Operationen.

### Background Functions

| Function | Zweck |
|----------|-------|
| `trigger-sync-background.js` | Airtable → Supabase Hauptsync (14 Tabellen in 6 Batches) |
| `trigger-sync-attachments-background.js` | Airtable-Fotos → Supabase Storage |
| `install-verification-background.js` | Installations-Foto-Verifikation |
| `navori-heartbeat-background.js` | Google Sheets CSV → display_heartbeats |

### Sync-Reihenfolge (Batches)

1. Displays, Acquisition, DaynScreens
2. OPS, SIM, Display Inventory
3. CHG, Stammdaten, Tasks
4. Installationen, Swaps, Deinstalls
5. Installationstermine, Communications
6. Heartbeats

Bei Tabellen-Fehler laeuft der Rest weiter (`Promise.allSettled`).

### Install-Booker System (7 Functions)

| Function | Methode | Zweck |
|----------|---------|-------|
| `install-booker-invite.js` | POST | WhatsApp-Einladung senden |
| `install-booker-detail.js` | GET | Akquise-Record laden |
| `install-booker-slots.js` | GET | Verfuegbare Zeitslots |
| `install-booker-book.js` | POST | Termin buchen (Self-Booking) |
| `install-booker-status.js` | GET/POST/PATCH | Buchungsstatus aendern |
| `install-booker-send-reminder.js` | POST | Manuelle Erinnerung |
| `install-booker-templates.js` | GET | WhatsApp-Template-Liste |

### Monteur Mobile (3 Functions)

| Function | Zweck |
|----------|-------|
| `install-monteur.js` | Tagesroute laden (HMAC oder JWT) |
| `install-monteur-status.js` | Status-Update vom Feld |
| `install-schedule.js` | Routen erstellen/bearbeiten |

### Proxies

| Function | Ziel-API |
|----------|----------|
| `airtable-proxy.js` | Airtable REST API |
| `supabase-proxy.js` | Supabase REST (fuer >5000 Records) |
| `superchat-proxy.js` | SuperChat (WhatsApp/SMS) |
| `vistar-proxy.js` | Vistar SSP |
| `sheets-proxy.js` | Google Sheets CSV |
| `chat-proxy.js` | Anthropic Claude (SSE Streaming) |
| `auth-proxy.js` | Supabase Auth |

### Weitere Functions

| Function | Zweck |
|----------|-------|
| `user-management.js` | User CRUD, Passwort-Reset, Gruppen |
| `feature-flags.js` | Runtime-Konfiguration |
| `akquise-outreach.js` | Make.com Outreach-Automation |
| `sync-nocodb.js` | NocoDB Integration |
| `bank-import.js` | Bank-Leasing XLSX Upload |
| `stammdaten-import.js` | Stammdaten Import |
| `faw-check.js` | Frequenzpruefung (public) |
| `faw-check-token.js` | FAW-Token Generierung |
| `install-inspection.js` | Inspektionsformular (public) |
| `install-inspection-token.js` | Inspektions-Token |
| `vistar-sync.js` | Manueller Vistar-Sync |

### Shared Utilities (`netlify/functions/shared/`)

| Datei | Groesse | Inhalt |
|-------|---------|--------|
| `airtableFields.js` | ~30KB | Tabellen-IDs, Feldnamen, Werte-Konstanten, FETCH_FIELDS |
| `airtableMappers.js` | ~30KB | Airtable → Supabase Transformatoren (mapDisplay, mapAcquisition, etc.) |
| `security.js` | ~15KB | CORS, Origin-Check, Rate Limiting, Input Sanitization, JWT Validation |
| `apiLogger.js` | ~3KB | API-Call-Tracking + Kosten-Logging |
| `attachmentHelper.js` | ~5KB | Airtable-Foto-URLs → Supabase Storage |
| `slotUtils.js` | ~3KB | Installations-Slot-Berechnung (06:00-22:00) |
| `superchatHelpers.js` | ~3KB | WhatsApp Template-IDs, Phone-Normalisierung |

---

## SUPABASE-TABELLEN

### Sync-Tabellen (aus Airtable, NUR LESEN im Frontend)

| Supabase-Tabelle | Airtable-Tabelle | Airtable-ID |
|-----------------|-----------------|-------------|
| `stammdaten` | JET Stammdaten | `tblLJ1S7OUhc2w5Jw` |
| `airtable_displays` | Live Display Locations | `tblS6cWN7uEhZHcie` |
| `acquisition` | Acquisition_DB | `tblqFMBAeKQ1NbSI8` |
| `installationen` | Installationen | `tblKznpAOAMvEfX8u` |
| `installationstermine` | Installationstermine | `tblZrFRRg3iKxlXFJ` |
| `communications` | activity_log | `tblDk1dl4J3Ow3Qde` |
| `tasks` | Tasks | `tblcKHWJg77mgIQ9l` |
| `chg_approvals` | CHG Approval | `tblvj4qjJpBVLbY7F` |
| `dayn_screens` | Dayn Screens | (Name-basiert) |
| `hardware_ops` | OPS_Player_inventory | `tbl7szvfLUjsUvMkH` |
| `hardware_sim` | SIM_card_inventory | `tblaV4UQX6hhcSDAj` |
| `hardware_displays` | display_inventory | `tblaMScl3j45Q4Dtc` |
| `hardware_swaps` | Hardware Swap | `tblzFHk0HhB4bNYJ4` |
| `hardware_deinstalls` | Deinstallationen | `tbltdxgzDeNz9d0ZC` |
| `display_heartbeats` | (Google Sheets CSV) | -- |

### Vistar-Tabellen (Programmatic Advertising)

`vistar_venues`, `vistar_networks`, `vistar_venue_health`

### App-eigene Tabellen (Supabase-only, read-write)

| Tabelle | Zweck |
|---------|-------|
| `app_users` | User-Profile + Gruppenzuordnung |
| `groups` | RBAC-Gruppen (grp_admin, grp_monteur, grp_partner, grp_faw_pruefer) |
| `install_bookings` | Terminbuchungen (Token, Status, Zeitslot, Team) |
| `install_teams` | Monteur-Teams |
| `install_routen` | Tagesrouten mit Stopps |
| `audit_log` | DSGVO-konformes Aktivitaetslog |
| `feature_flags` | Runtime-Konfiguration |
| `feedback_requests` | In-App Bug Reports |
| `agent_memory` | Claude AI Kontext-Speicher |
| `phone_call_logs` | Telefon-Anruf-Protokolle |
| `booking_activity_log` | Booking-Events fuer Team-Analytics |
| `akquise_activity_log` | Akquise-Aktivitaeten |
| `attachment_cache` | Permanente Supabase-URLs fuer Airtable-Fotos |

### Warehouse & Bestellwesen

`bank_leasing`, `purchase_orders`, `return_orders`, `shipping_orders`,
`goods_receipts`, `hardware_positions`, `warehouse_locations`, `stock_alerts`

### Metadaten

`sync_metadata`, `attachment_sync_log`, `api_usage_log`, `display_first_seen`

---

## AUTHENTIFIZIERUNG

### Auth-Methoden

| Methode | Wann | Beispiel-Functions |
|---------|------|--------------------|
| **Origin-Check** | Dashboard-interne API-Calls | `airtable-proxy.js`, `feature-flags.js` |
| **Supabase JWT** | Eingeloggte User-Aktionen | `user-management.js`, `install-schedule.js` |
| **API-Key** (`x-api-key`) | Make.com, externe Trigger | `install-booker-invite.js` |
| **HMAC Token** | Monteur-Links (stateless) | `install-monteur.js`, `install-monteur-status.js` |
| **Dual (JWT + API-Key)** | Flexible Endpoints | `install-booker-detail.js` |
| **Token-based** | Public Forms | `faw-check.js`, `install-inspection.js` |

### Session-Management

- **Timeout:** 8 Stunden (Activity-basiert)
- **Storage:** `localStorage` (Key: `dooh_user`)
- **Refresh:** Bei jeder User-Interaktion via `touchSession()`
- **Passwort-Expiry:** Konfigurierbar (Default 90 Tage)
- **Force-Change:** Bei erstem Login

### RBAC-Gruppen

| Gruppe | Rechte |
|--------|--------|
| `grp_admin` | Alles (User-Verwaltung, Feature Flags, Audit Log) |
| `grp_monteur` | Monteur-View, Status-Updates |
| `grp_partner` | Eingeschraenkte Dashboard-Sicht |
| `grp_faw_pruefer` | Nur FAW-Check |

---

## FRONTEND-ARCHITEKTUR

### App.jsx (Haupt-Dashboard, 2876 Zeilen)

Verwaltet: Auth-State, Daten-Loading, Routing (Tab-basiert), KPI-Cache, Theme.

**Tabs:** Dashboard, Displays, Tasks, Kommunikation, Hardware, Akquise, Installationen,
Programmatic, Admin, Chat, Monteur (Mobile)

### Lazy-Loading

Alle grossen Komponenten werden via `React.lazy()` + `Suspense` geladen.
Code-Splitting per Vite Rollup → separate Chunks.

### Haupt-Komponenten (70+)

| Modul | Komponenten | Beschreibung |
|-------|------------|-------------|
| **KPI** | `KPICards`, `HealthTrendChart`, `OfflineDistributionChart`, `CityHealthChart`, `OverviewHealthPatterns`, `OverviewDisplayHealth` | Health Rate, Trends, Verteilung |
| **Displays** | `DisplayTable`, `DisplayDetail`, `DisplayMap`, `DisplayTrends`, `NewDisplayWatchlist` | Liste, Detail (Heartbeats), Karte, Trends |
| **Installationen** | `InstallationsDashboard` (Router), `InstallationExecutiveDashboard`, `InstallationReadyLocations`, `InstallationBookingsDashboard`, `InstallationInviteManager`, `InstallationPhoneWorkbench`, `InstallationCalendar`, `InstallationTeamDashboard`, `InstallationMapView`, `InstallationLiveticker` | Komplettes Install-Management |
| **Hardware** | `HardwareDashboard` (Router + 7 Subtabs), `QRHardwareScanner`, `LagerVersandTab`, `BestellwesenTab`, `HardwareSwapModal`, `HardwareLifecyclePanel`, `DeinstallModal` | Inventar, Bestellwesen, Warehouse |
| **Akquise** | `AcquisitionDashboard`, `AkquiseApp`, `AkquiseAutomationDashboard`, `UnifiedStandortDetail` | Pipeline, Storno, Automation |
| **Tasks** | `TaskDashboard`, `TaskCreateModal`, `TaskEditModal` | Wartungsaufgaben |
| **Kommunikation** | `CommunicationDashboard`, `SuperChatHistory`, `ComposeMessage`, `ContactDirectory` | WhatsApp/SMS/Email |
| **Programmatic** | `ProgrammaticDashboard` | Vistar Revenue |
| **Admin** | `AdminPanel`, `TeamAnalyticsDashboard`, `DataMappingPanel`, `DataQualityDashboard`, `APIOverviewPanel`, `NocoDBPanel`, `StammdatenImport` | Verwaltung |
| **Chat** | `ChatAssistant` + `useChatEngine` | Claude AI (SSE) |
| **Mobile** | `MobileDashboard`, `MobileDisplayCards`, `MobileActivityFeed`, `MobileAgentView`, `MobileBottomNav` | Responsive Views |
| **Layout** | `Sidebar`, `ContentHeader` | Shell |
| **UI** | `Badge`, `Button`, `Card`, `Input` | Basis-Elemente |

### Utils (10 Dateien)

| Datei | Groesse | Zweck |
|-------|---------|-------|
| `authService.js` | 37KB | Supabase Auth, Session, RBAC, getCurrentUser() |
| `airtableService.js` | 95KB | Airtable CRUD Operationen (via Proxy) |
| `chatContext.js` | 56KB | Claude AI Prompt-Builder mit Dashboard-Kontext |
| `dataProcessing.js` | 34KB | KPI-Berechnung, parseRows, aggregateData, computeKPIs |
| `vistarService.js` | ~5KB | Vistar SSP API |
| `superchatService.js` | ~5KB | SuperChat/WhatsApp |
| `installUtils.js` | ~5KB | API-Endpunkte, Booking-Helper |
| `attachmentResolver.js` | ~5KB | Airtable-Foto-URLs → permanente Supabase-URLs |
| `indaParser.js` | ~3KB | INDA-Frequenzdaten Parser |
| `voiceResponseProcessor.js` | ~3KB | Sprach-AI Antwortverarbeitung |

### Hooks (7 Dateien)

| Hook | Zweck |
|------|-------|
| `useFeatureFlags.js` | Feature-Flag-Loading + Caching |
| `useChatEngine.js` | Chat Streaming + Memory (20KB) |
| `useIsMobile.js` | Responsive Detection |
| `useTheme.js` | Dark Mode Toggle |
| `useSpeechRecognition.js` | Voice Input |
| `useSpeechSynthesis.js` | Voice Output |
| `useVoiceSettings.js` | Voice-Konfiguration |

---

## KPI-DEFINITIONEN

### Health Rate (Kernmetrik)

```
Health Rate = Online-Stunden / Erwartete Stunden * 100
```

- Grace Period: 3.5 Stunden (kurze Ausfaelle ignorieren)
- Basis: `display_heartbeats` Tabelle (~170K Rows)
- Mobile: Vereinfacht via `get_mobile_kpis()` RPC

### Display-Status-Kategorien

| Status | Bedingung | KPI_FILTER |
|--------|-----------|------------|
| Aktiv | `is_active = true` | `ACTIVE` |
| Online | Letzter Heartbeat < 24h | `ONLINE` |
| Warnung | 24h - 72h seit letztem Heartbeat | `WARNING` |
| Kritisch | 72h - 7 Tage | `CRITICAL` |
| Dauerhaft Offline | > 7 Tage | `PERMANENT_OFFLINE` |
| Nie Online | Kein Heartbeat je empfangen | `NEVER_ONLINE` |
| Neu installiert | live_since < 7 Tage | `NEW` |
| Deinstalliert | deinstall_date < 30 Tage | `DEINSTALLED` |

---

## EXTERNE APIS

| API | Zweck | Auth | Proxy-Function |
|-----|-------|------|----------------|
| **Airtable** | Source of Truth (13 Tabellen) | PAT Token | `airtable-proxy.js` |
| **SuperChat** | WhatsApp/SMS Versand | X-API-KEY | `superchat-proxy.js` |
| **Anthropic Claude** | KI-Chat (Sonnet) | API Key | `chat-proxy.js` |
| **Vistar SSP** | Programmatic Revenue | Email/Password | `vistar-proxy.js` |
| **Google Sheets** | Navori Heartbeat CSV | Public URL | `sheets-proxy.js` |
| **Make.com** | Akquise Automation | Webhook | `akquise-outreach.js` |

### SuperChat / WhatsApp

- Nur approved Meta Templates funktionieren ausserhalb des 24h-Fensters
- Template-IDs (`tn_...`) NIEMALS aendern ohne Approval-Status geprueft
- Phone-Nummern: `normalizePhone()` aus `shared/security.js`
- Templates in `shared/superchatHelpers.js`

---

## ENVIRONMENT VARIABLES

```bash
# Frontend (VITE_* Prefix, in index.html/Build eingebettet)
VITE_SUPABASE_URL=https://hvgjdosdejnwkuyivnrq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Backend (Netlify Functions, nur serverseitig)
SUPABASE_URL=https://hvgjdosdejnwkuyivnrq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
AIRTABLE_TOKEN=pat_...
AIRTABLE_BASE=apppFUWK829K6B3R2
ANTHROPIC_API_KEY=sk-ant-...
SUPERCHAT_API_KEY=...
VISTAR_EMAIL=...
VISTAR_PASSWORD=...
MONTEUR_SECRET=...          # HMAC-Signing fuer Monteur-Links
BOOKER_API_KEY=...          # Make.com Integration
SUPERCHAT_WA_CHANNEL_ID=... # Default: mc_cy5HABDnpRhRtosxckRzb
```

**Hinweis:** Supabase URL und Anon Key sind in `src/utils/authService.js` hardcoded (Zeile 17-18).
Das ist ein bekannter Zustand — Anon Keys sind per Design public (RLS schuetzt die Daten).

---

## NETLIFY FUNCTION STANDARDSTRUKTUR

```javascript
/**
 * Netlify Function: [Name]
 * [Beschreibung]
 * Auth: [Origin | JWT | API-Key | HMAC]
 */
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`function-name:${clientIP}`, 60, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs, origin);
  const cors = corsHeaders(origin);
  try {
    // Logik hier
  } catch (err) {
    console.error('[function-name] Error:', err.message);
    return safeErrorResponse(500, 'Fehlertext auf Deutsch', origin, err);
  }
};
```

---

## BUILD & DEPLOY

```bash
npm run dev                    # Vite Dev-Server (localhost:5173)
npm run build                  # Build → dist/
npm run lint                   # ESLint
npx netlify dev                # Functions lokal testen

# Produktion:
git push origin main           # Netlify auto-deploy
# Oder manuell:
npm run build && netlify deploy --prod --dir=dist
```

**Build-Config** (`netlify.toml`):
- Node 20
- Build: `npm run build` → `dist/`
- Functions: `netlify/functions/`
- Security Headers: CSP, HSTS, X-Frame-Options, etc.

**Vite-Config** (`vite.config.js`):
- 6 Entry Points (main, install, booking, scheduling, inspection, faw)
- Dev-Proxies fuer Google Sheets, Airtable, SuperChat
- `modulePreload: false` (verhindert TDZ-Errors bei grossen Chunks)

---

## CODE-KONVENTIONEN

- **Fehlermeldungen:** User-facing auf Deutsch, `console.error()` auf Englisch mit `[function-name]` Prefix
- **Supabase Queries:** Immer `select=feld1,feld2` (nie `select=*`), immer `limit` setzen
- **API Logging:** `logApiCall()` nach jedem externen Call
- **Datums-Konvertierung:** NIEMALS `toISOString().split('T')[0]` — immer lokale CET-Berechnung
- **Attachments:** Airtable-URLs verfallen nach 2h — `resolveRecordImages()` nutzen

---

## FEATURE FLAGS

In Supabase-Tabelle `feature_flags`. Nie hardcoden:

```javascript
// Backend:
const res = await fetch(
  `${SUPABASE_URL}/rest/v1/feature_flags?key=in.(flag_1,flag_2)&select=*`,
  { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
);

// Frontend:
import { useFeatureFlags } from '../hooks/useFeatureFlags';
const { flags } = useFeatureFlags();
const isEnabled = flags?.my_flag?.enabled === true;
```

---

## BEKANNTE EIGENHEITEN

1. **Supabase Anon Key hardcoded** in `authService.js` — per Design (RLS schuetzt Daten)
2. **App.jsx ist 2876 Zeilen** — historisch gewachsen, enthaelt KPI-Logik + Routing
3. **airtableService.js ist 95KB** — alle Airtable-CRUD-Operationen
4. **chatContext.js ist 56KB** — baut den gesamten Dashboard-Kontext fuer Claude AI
5. **Airtable-Feldname-Typos** — in Konstanten gekapselt, NIEMALS selbst schreiben
6. **`booking_source` Werte:** `'whatsapp_agent'`, `'phone'`, `'self_booking'`
7. **Monteur-Links:** Stateless via HMAC Token, kein Login noetig
8. **display_heartbeats:** ~170K Rows, taeglicher Append aus Google Sheets CSV

---

## VOR JEDEM COMMIT

- [ ] `npm run build` erfolgreich
- [ ] Keine Secrets im Code
- [ ] Neue Functions nutzen `shared/security.js` und `shared/apiLogger.js`
- [ ] Airtable-Felder aus Konstanten
- [ ] Fehlertexte auf Deutsch
- [ ] Keine `select=*` in Supabase-Queries
