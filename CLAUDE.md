# CLAUDE.md — FlinkDB2 (Dimension Outdoor DOOH Operations)

> Automatisch geladen bei jeder Claude Code Session.
> Beschreibt die FlinkDB2 Codebase — das Display-Netzwerk-Management fuer Dimension Outdoor.

---

## Was ist FlinkDB2?

FlinkDB2 ist das **Operations-Dashboard fuer das Dimension Outdoor DOOH-Netzwerk** (Digital Out-of-Home).
Es verwaltet ~350 digitale Displays in ganz Deutschland: Echtzeit-Monitoring, Installationsplanung,
Hardware-Inventar, Akquise-Pipeline und Programmatic-Advertising-Integration.

**Live-URL:** `https://startling-pothos-27fc77.netlify.app`
**Repo:** `maximiliansimon8-cmd/flinkdb2`

---

## Stack

| Bereich | Technologie |
|---------|------------|
| **Frontend** | React 19 + Tailwind CSS 4 + Vite 7 — JSX, Hooks, Utility Classes |
| **Charts** | Recharts 3.7 |
| **Karten** | React-Leaflet 5 + Leaflet 1.9 (OpenStreetMap) |
| **Backend** | 39 Netlify Functions (ES Modules `.js`) in `netlify/functions/` |
| **Datenbank** | Supabase (PostgreSQL + RLS + Auth) |
| **Primaere Datenquelle** | Airtable Base `apppFUWK829K6B3R2` (13 Tabellen, via Sync) |
| **WhatsApp/SMS** | SuperChat API (`api.superchat.com/v1.0`) |
| **Programmatic** | Vistar SSP API (Revenue, Impressions) |
| **KI-Chat** | Anthropic Claude API (SSE Streaming) |
| **Heartbeat-Daten** | Google Sheets CSV (Navori Player Export) |
| **Hosting** | Netlify (auto-deploy `main`, Functions + CDN) |

---

## Wichtige Befehle

```bash
npm run dev          # Vite Dev-Server (localhost:5173)
npm run build        # Production Build → dist/
npm run lint         # ESLint
npx netlify dev      # Functions lokal testen (liest .env / .env.local)
```

**Deploy:** `git push origin main` → Netlify baut automatisch.
Manuell: `npm run build && netlify deploy --prod --dir=dist`

---

## 7 Entry Points (SPAs)

| Route | Entry HTML | Root-Komponente | Zweck | Auth |
|-------|-----------|----------------|-------|------|
| `/` `/dashboard` | `index.html` → `main.jsx` | `App.jsx` (2876 Zeilen) | Haupt-Dashboard: KPIs, Displays, Tasks, Hardware, Chat | Supabase JWT |
| `/install` | `install.html` → `install-main.jsx` | `InstallApp.jsx` | Installations-Tool (Terminierung, Buchungen, Monteure) | Supabase JWT |
| `/book/*` | `booking/index.html` | `BookingPage.jsx` | Oeffentliche Terminbuchung fuer Standort-Betreiber | Token (public) |
| `/scheduling/*` | `scheduling/index.html` | `SchedulingApp.jsx` | Telefon-Akquise + Standort-Detail-Editor | Supabase JWT |
| `/inspection/*` | `inspection/index.html` | `InspectionApp.jsx` | Protokollpruefung fuer externe Pruefer | Token |
| `/faw/*` | `faw/index.html` | `FAWCheckApp.jsx` | INDA-Frequenzanalyse fuer Frequenzpruefer | Token |
| `/monteur` | `index.html` (Hash-Route) | `MonteurView.jsx` | Monteur-Tagesroute (mobil) | HMAC Token |

Alle Redirects in `public/_redirects` (wird nach `dist/` kopiert beim Build).

---

## Datenfluss

```
Airtable (Source of Truth, 13 Tabellen)
  ↓ sync-airtable.js (*/5 Min) → trigger-sync-background.js (inkrementell, max 15 Min)
Supabase (Read-Cache, 46+ Tabellen)
  ↓
Frontend (liest NUR von Supabase)
  ↓
Schreiboperationen → Netlify Function → Airtable API
                     (Supabase beim naechsten Sync aktualisiert)
```

**Ausnahme:** Supabase-only Tabellen (install_bookings, install_routen, install_teams,
app_users, groups, audit_log, feature_flags, warehouse_*, etc.) werden direkt beschrieben.

---

## Netlify Functions (39 Stueck)

### Scheduled (Cron)
| Function | Schedule | Zweck |
|----------|----------|-------|
| `sync-airtable.js` | */5 Min | Trigger fuer Background-Sync |
| `sync-attachments-scheduled.js` | */15 Min | Trigger fuer Foto-Sync |
| `install-booker-reminder.js` | @hourly | WhatsApp-Erinnerungen |
| `vistar-sync-scheduled.js` | taeglich 03:00 | Vistar SSP Revenue-Sync |
| `navori-heartbeat-scheduled.js` | Trigger | Navori Heartbeat-CSV Import |

### Background (max 15 Min)
| Function | Zweck |
|----------|-------|
| `trigger-sync-background.js` | Airtable → Supabase Hauptsync (14 Tabellen, 6 Batches) |
| `trigger-sync-attachments-background.js` | Airtable-Fotos → Supabase Storage |
| `install-verification-background.js` | Installations-Foto-Verifikation |
| `navori-heartbeat-background.js` | Google Sheets CSV → display_heartbeats |

### Install-Booker (7 Functions)
`install-booker-invite.js`, `install-booker-detail.js`, `install-booker-slots.js`,
`install-booker-book.js`, `install-booker-status.js`, `install-booker-send-reminder.js`,
`install-booker-templates.js`

### Monteur Mobile (3 Functions)
`install-monteur.js`, `install-monteur-status.js`, `install-schedule.js`

### Proxies & APIs
`airtable-proxy.js`, `supabase-proxy.js`, `superchat-proxy.js`, `vistar-proxy.js`,
`sheets-proxy.js`, `chat-proxy.js`, `auth-proxy.js`, `bank-import.js`

### Weitere
`user-management.js`, `feature-flags.js`, `akquise-outreach.js`, `sync-nocodb.js`,
`faw-check.js`, `faw-check-token.js`, `install-inspection.js`, `install-inspection-token.js`,
`stammdaten-import.js`, `vistar-sync.js`

### Shared Utilities (`netlify/functions/shared/`)
| Datei | Inhalt |
|-------|--------|
| `security.js` | CORS, Auth, Rate Limiting, Sanitization — PFLICHT fuer jede Function |
| `apiLogger.js` | API-Call-Tracking (Kosten) |
| `airtableFields.js` | Alle Airtable-Feldnamen, Tabellen-IDs, Werte-Konstanten |
| `airtableMappers.js` | Airtable → Supabase Transformatoren |
| `attachmentHelper.js` | Airtable-Foto-URLs → Supabase Storage |
| `slotUtils.js` | Installations-Slot-Berechnung |
| `superchatHelpers.js` | WhatsApp Template-IDs, Normalisierung |

---

## Supabase-Tabellen (Uebersicht)

### Sync-Tabellen (aus Airtable, nur lesen)
`stammdaten`, `airtable_displays`, `acquisition`, `installationen`, `installationstermine`,
`communications`, `tasks`, `chg_approvals`, `dayn_screens`, `hardware_ops`, `hardware_sim`,
`hardware_displays`, `hardware_swaps`, `hardware_deinstalls`, `display_heartbeats`

### Vistar (Programmatic)
`vistar_venues`, `vistar_networks`, `vistar_venue_health`

### App-eigene Tabellen (Supabase-only, read-write)
`app_users`, `groups`, `install_bookings`, `install_teams`, `install_routen`,
`audit_log`, `feature_flags`, `feedback_requests`, `agent_memory`,
`phone_call_logs`, `booking_activity_log`, `akquise_activity_log`

### Warehouse & Bestellwesen
`bank_leasing`, `purchase_orders`, `return_orders`, `shipping_orders`,
`goods_receipts`, `hardware_positions`, `warehouse_locations`, `stock_alerts`

### Metadaten
`sync_metadata`, `attachment_sync_log`, `attachment_cache`, `api_usage_log`,
`display_first_seen`

---

## Authentifizierung

| Methode | Wo | Beispiel-Functions |
|---------|----|--------------------|
| **Origin-Check** | Dashboard-interne Calls | `airtable-proxy.js`, `feature-flags.js` |
| **Supabase JWT** | Eingeloggte User | `user-management.js`, `install-schedule.js` |
| **API-Key** (`x-api-key`) | Make.com, externe Trigger | `install-booker-invite.js` |
| **HMAC Token** | Monteur-Links (stateless) | `install-monteur.js` |
| **Token-based** | Public Forms | `faw-check.js`, `install-inspection.js` |

**Session:** 8h Timeout (localStorage), Activity-basiert. Passwort-Expiry konfigurierbar.
**RBAC:** `grp_admin`, `grp_monteur`, `grp_partner`, `grp_faw_pruefer`

---

## Wichtige Regeln

### 1. Supabase SDK: Frontend JA, Backend NEIN

```javascript
// FRONTEND: SDK (authService.js exportiert die Instanz)
import { supabase } from '../utils/authService';

// BACKEND (Netlify Functions): fetch() direkt
const res = await fetch(`${SUPABASE_URL}/rest/v1/tabelle?select=id,name`, {
  headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY },
});
```

### 2. Shared Security — Pflicht fuer jede Netlify Function

```javascript
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
```

### 3. Airtable-Felder aus Konstanten

Airtable-Feldnamen haben Trailing Spaces, Double Spaces, Unicode-Hyphens und Typos.
**IMMER** aus `shared/airtableFields.js` lesen, nie hardcoden.

### 4. Praedikate (Standort-Status)

`src/metrics/predicates.js` ist die kanonische Quelle fuer:
- `isStorno(record)` — Storniert/Abgebrochen
- `isAlreadyInstalled(record)` — Bereits installiert
- `isReadyForInstall(record)` — Aufbaubereit (3 Felder)
- `isPendingApproval(record)` — Offene Pruefung

**Im Frontend immer importieren, nie lokal kopieren.**

### 5. Destructive Actions — IMMER erst fragen

- SQL mit `DROP`, `ALTER COLUMN`, `DELETE` ohne `WHERE`
- `git push --force`
- Aenderungen an `shared/security.js`
- SuperChat Template-IDs aendern
- Massenhafte Supabase-Updates

---

## Hauptmodule (Frontend)

| Modul | Komponenten | Beschreibung |
|-------|------------|-------------|
| **KPI Dashboard** | `App.jsx`, `KPICards`, `HealthTrendChart`, `OfflineDistributionChart` | Health Rate, Online/Offline-Status, Trends |
| **Display-Verwaltung** | `DisplayTable`, `DisplayDetail`, `DisplayMap`, `DisplayTrends` | Liste, Detail, Karte, Watchlist |
| **Installationen** | `InstallationsDashboard` (5 Subtabs), `InstallationInviteManager`, `InstallationPhoneWorkbench`, `InstallationCalendar` | Terminierung, Buchungen, WA-Einladungen |
| **Hardware** | `HardwareDashboard` (7 Subtabs), `QRHardwareScanner`, `LagerVersandTab`, `BestellwesenTab` | OPS/SIM/Display-Inventar, Wareneingang, Versand |
| **Akquise** | `AcquisitionDashboard` (4 Tabs), `AkquiseApp`, `AkquiseAutomationDashboard` | Pipeline, Storno, Automation |
| **Tasks** | `TaskDashboard`, `TaskCreateModal`, `TaskEditModal` | Wartungsaufgaben |
| **Kommunikation** | `CommunicationDashboard`, `SuperChatHistory`, `ComposeMessage` | WhatsApp/SMS/Email-Verlauf |
| **Programmatic** | `ProgrammaticDashboard` | Vistar SSP Revenue & Impressions |
| **Admin** | `AdminPanel`, `TeamAnalyticsDashboard`, `DataMappingPanel`, `APIOverviewPanel` | User, Flags, Audit, Team-Auswertung |
| **KI-Chat** | `ChatAssistant`, `useChatEngine` | Claude AI mit SSE Streaming |
| **Monteur** | `MonteurView` (72KB) | Tagesroute mobil |

---

## Utils

| Datei | Zweck |
|-------|-------|
| `authService.js` | Supabase Auth, Session, RBAC, getCurrentUser() |
| `dataProcessing.js` | KPI-Berechnung, parseRows, aggregateData |
| `airtableService.js` | Airtable CRUD (ueber Proxy) |
| `chatContext.js` | Claude AI Prompt-Builder mit Dashboard-Kontext |
| `vistarService.js` | Vistar SSP API Integration |
| `superchatService.js` | SuperChat/WhatsApp Helper |
| `installUtils.js` | API-Endpunkte und Booking-Hilfsfunktionen |
| `attachmentResolver.js` | Airtable-Foto-URLs → Supabase Storage |
| `indaParser.js` | INDA-Frequenzdaten Parser |

---

## Hooks

| Hook | Zweck |
|------|-------|
| `useFeatureFlags` | Feature-Flag-Loading + Caching |
| `useChatEngine` | Chat Streaming + Memory |
| `useIsMobile` | Responsive Detection |
| `useTheme` | Dark Mode Toggle |
| `useSpeechRecognition` | Voice Input |
| `useSpeechSynthesis` | Voice Output |

---

## Environment Variables

```bash
# Frontend (VITE_* Prefix)
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Backend (Netlify Functions)
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
AIRTABLE_TOKEN=pat_...
AIRTABLE_BASE=apppFUWK829K6B3R2
ANTHROPIC_API_KEY=sk-ant-...
SUPERCHAT_API_KEY=...
VISTAR_EMAIL=...
VISTAR_PASSWORD=...
MONTEUR_SECRET=...          # HMAC-Signing fuer Monteur-Links
BOOKER_API_KEY=...          # Make.com Integration
```

---

## Code-Konventionen

- **Fehlermeldungen:** User-facing auf Deutsch, `console.error()` auf Englisch mit `[function-name]` Prefix
- **Supabase Queries:** Immer `select=feld1,feld2` (nie `select=*`), immer `limit` setzen
- **API Logging:** `logApiCall()` nach jedem externen Call
- **Datums-Konvertierung:** NIEMALS `toISOString().split('T')[0]` — immer lokale CET-Berechnung
- **Booking Status:** `booked` und `confirmed` werden als "Eingebucht" angezeigt
- **Attachments:** Airtable-URLs verfallen nach 2h — `resolveRecordImages()` nutzen

---

## Vor jedem Commit

- [ ] `npm run build` erfolgreich
- [ ] Keine Secrets im Code (Supabase-Keys sind in authService.js hardcoded — bekannter Zustand)
- [ ] Neue Netlify Functions nutzen `shared/security.js` und `shared/apiLogger.js`
- [ ] Airtable-Felder kommen aus Konstanten
- [ ] Fehlertexte auf Deutsch
