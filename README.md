# JET Dashboard V2

Operations Dashboard fuer das JET DOOH Display-Netzwerk. Verwaltet ~350 digitale Displays in ganz Deutschland mit Echtzeit-Monitoring, Aufgabenverwaltung und Programmatic Advertising.

**Live:** [jet-dashboard-v2.netlify.app](https://jet-dashboard-v2.netlify.app)

---

## Tech Stack

| Schicht       | Technologie                        |
|---------------|-------------------------------------|
| Frontend      | React 19, Vite 7, Tailwind CSS 4   |
| Backend       | Netlify Functions (25 Serverless)   |
| Datenbank     | Supabase (PostgreSQL + Auth)        |
| Datenquelle   | Airtable (13 Tabellen, Source of Truth) |
| APIs          | Vistar SSP, Superchat, Anthropic Claude, Google Sheets |
| Hosting       | Netlify (CDN + Functions)           |
| CI/CD         | Git Push -> Netlify Auto-Deploy     |

## Architektur

```
Airtable (13 Tabellen)  ──▶  sync-airtable.js  ──▶  Supabase (22 Tabellen)
   READ-ONLY (PAT)            Netlify Scheduled        Inkrementeller Sync
                               Alle 2 Stunden           LAST_MODIFIED_TIME()

Google Sheets (CSV)     ──▶  sync-airtable.js  ──▶  display_heartbeats
   Navori Heartbeats          INSERT append-only        ~170K Rows

Vistar SSP              ──▶  vistar-sync.js    ──▶  vistar_venue_health
   Daily 03:00 UTC            90-Tage-Fenster          Revenue + Impressions

Supabase  ──▶  React Frontend (App.jsx)
               Desktop: Volle Daten (~40K Rows)
               Mobile:  RPC get_mobile_kpis() (~2KB JSON)
               Chat AI: buildChatContext() -> Anthropic API
```

**Grundregel:** Wir lesen NUR von externen Quellen. Supabase ist der lokale Cache. Airtable ist Master.

## Projektstruktur

```
src/
  App.jsx                          # Haupt-App (Routing, Auth, KPI-Berechnung)
  components/
    KPICards.jsx                   # Dashboard KPI-Kacheln
    DisplayTable.jsx               # Display-Liste mit Filter/Sortierung
    DisplayDetail.jsx              # Display-Detailansicht (groesste Datei)
    TaskDashboard.jsx              # Aufgabenverwaltung
    CommunicationDashboard.jsx     # E-Mail/WhatsApp/SMS Verlauf
    AdminPanel.jsx                 # Benutzerverwaltung + Admin-Tools
    DataMappingPanel.jsx           # Data Dictionary + KPI Audit
    APIOverviewPanel.jsx           # API-Integrations-Uebersicht
    ChatAssistant.jsx              # Claude AI Chat mit Dashboard-Kontext
    ProgrammaticDashboard.jsx      # Vistar SSP Revenue
    HardwareDashboard.jsx          # OPS/SIM/Display Inventar
    AcquisitionDashboard.jsx       # Akquise-Pipeline
    InstallationsDashboard.jsx     # Installations-Uebersicht
    MobileAgentView.jsx            # Mobile Hauptansicht
    MobileBottomNav.jsx            # Mobile Navigation
    ...56 Komponenten gesamt
  utils/
    dataProcessing.js              # KPI-Berechnung (Health Rate, Status-Klassifizierung)
    authService.js                 # Supabase Auth + RBAC
    vistarService.js               # Vistar SSP API Client
    chatContext.js                 # Chat-Kontext-Builder fuer Claude
  constants/
    kpiFilters.js                  # KPI Filter-Konstanten
  hooks/
    useIsMobile.js                 # Mobile Detection Hook

netlify/functions/
  sync-airtable.js                # Scheduled: Airtable -> Supabase (alle 2h)
  sync-attachments-scheduled.js   # Scheduled: Foto-Sync (alle 30 Min)
  vistar-sync-scheduled.js        # Scheduled: Vistar Revenue (taeglich 03:00)
  airtable-proxy.js               # CRUD-Proxy fuer Airtable-Schreibzugriffe
  chat.js                         # Claude AI Chat Backend
  superchat-send.js               # WhatsApp/SMS Versand via Superchat
  bank-import.js                  # Bank Leasing XLSX Import
  ...25 Functions gesamt

sql/
  *.sql                           # Supabase Migrationen (14 Dateien)
```

## Wichtige Konzepte

### Health Rate Berechnung
```
Pro Display/Tag:
  offlineHours = snapshot_time - heartbeat_time

  offline <= 3.5h  ->  16h online (Grace Period, Check-Intervall)
  3.5-16h          ->  max(0, 16 - offlineHours)
  > 16h            ->  0h

Health Rate = Sum(onlineOperatingHours) / Sum(expectedOperatingHours) * 100
Betriebszeit: 06:00 - 22:00 (16h/Tag)
```

### Status-Klassifizierung
| Status              | Schwelle        | Bedeutung                        |
|---------------------|-----------------|-----------------------------------|
| Online              | < 24h offline   | Display sendet Heartbeats         |
| Warnung             | 24-72h offline  | Temporaer, untersuchen            |
| Kritisch            | 72h-7d offline  | Wahrscheinlich defekt, Task anlegen|
| Dauerhaft Offline   | > 7 Tage        | Defekt oder deinstalliert          |
| Nie Online          | Kein Heartbeat  | Neue Installation, nicht konfiguriert |

### Bekannte Airtable-Feldprobleme
- `Online Status ` — Trailing Space im Feldnamen
- `Lead Status  (from Akquise)` — Double Space
- `Post-Install Storno` — Non-Breaking Hyphen U+2011
- `external_visiblity` — Typo (visibility)
- `ready_for_installation` — String "checked" statt Boolean

## Entwicklung

```bash
# Dependencies installieren
npm install

# Dev Server starten (Port 5173)
npm run dev

# Build erstellen
npm run build

# Netlify Functions lokal testen
npx netlify dev
```

### Environment Variables (Netlify)
```
SUPABASE_URL          # Supabase Projekt-URL
SUPABASE_SERVICE_KEY  # Service Role Key (Server-side)
VITE_SUPABASE_URL     # Supabase URL (Frontend)
VITE_SUPABASE_ANON_KEY # Anon Key (Frontend, RLS)
AIRTABLE_TOKEN        # Airtable Personal Access Token
AIRTABLE_BASE_ID      # apppFUWK829K6B3R2
SUPERCHAT_API_KEY     # Superchat X-API-KEY
VISTAR_EMAIL          # Vistar SSP Login
VISTAR_PASSWORD       # Vistar SSP Password
ANTHROPIC_API_KEY     # Claude API Key
```

## Deployment

Push to `main` -> Netlify baut automatisch und deployed.

- **Build Command:** `vite build`
- **Publish Directory:** `dist`
- **Functions Directory:** `netlify/functions`
- **Scheduled Functions:** In `netlify.toml` konfiguriert

## Dokumentation

| Datei                      | Inhalt                                      |
|----------------------------|----------------------------------------------|
| `README.md`                | Dieses Dokument — Projekt-Uebersicht         |
| `CHANGELOG.md`             | Aenderungsverlauf aller Releases             |
| `DATA_DICTIONARY.md`       | Vollstaendige Feld-Dokumentation (61KB)       |
| `DATA_SOURCES_OVERVIEW.md` | Datenquellen-Architektur                     |
| Admin > Data Mapping       | Live Data Dictionary im Dashboard            |
| Admin > API Overview       | API-Status und Endpunkte im Dashboard        |
| Admin > KPI Audit          | KPI-Formeln und Daten-Validierung            |

## Mobile vs Desktop

| Feature              | Desktop                      | Mobile                           |
|----------------------|-------------------------------|-----------------------------------|
| Datenladung          | ~40K Heartbeat Rows           | RPC get_mobile_kpis() (~2KB)     |
| Health Rate          | Stundengenau (Operating Hours)| Tages-Granularitaet (days_offline)|
| Dayn Screens         | Nicht in KPIs                 | In KPIs addiert                   |
| Cache                | 4h localStorage               | 24h localStorage                  |
| Render               | Full SPA mit allen Tabs       | Dedicated Mobile Components       |

> **ACHTUNG:** Mobile Health Rate != Desktop Health Rate! Siehe KPI Audit im Admin-Panel.
