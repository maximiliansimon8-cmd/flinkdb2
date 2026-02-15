# Changelog — JET Dashboard V2

Alle relevanten Aenderungen an diesem Projekt werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

---

## [Unreleased] — 2026-02-15

### Hinzugefuegt
- **KPI Audit Panel** im Admin-Bereich (Data Mapping Tab)
  - Zeigt jede KPI-Kachel mit exakter Formel, Datenquelle und Berechnung
  - Business-Interpretation fuer jede Metrik (deutsch)
  - Warnungen bei potenziellen Datenproblemen (z.B. Mobile != Desktop Health Rate)
  - 12 KPIs dokumentiert: Health Rate, Aktive Displays, Online, Warning, Critical, Permanent Offline, Never Online, Neu installiert, Deinstalliert, Mobile Health, Task Velocity, SSP Revenue
- **Feld-Interpretationen** in Data Mapping Panel
  - Jedes Feld hat jetzt eine "Bedeutung"-Spalte mit Business-Kontext
  - Erklaerung was Online Rate, Health Rate, Installationen etc. wirklich messen
- **MobileActivityFeed.jsx** — Mobile-optimierter Liveticker mit Aktivitaets-Gruppierung
- **QRHardwareScanner.jsx** — Hardware-/Display-Suche mit QR-Scanner
- **APIOverviewPanel.jsx** — Komplette API-Integrations-Uebersicht mit Status
- **DataMappingPanel.jsx** — Vollstaendiges Data Dictionary (254+ Felder, 20 Datenquellen)
- Violet/Indigo Theme fuer Chat Assistant (Gradient FAB, Sparkles Icon)
- **URL-basiertes Sub-Tab Routing** (#admin/data-mapping, #hardware/fehler etc.)
  - Jeder Sub-Tab hat eigene URL — Links teilbar, Browser-Back funktioniert
  - 4 Panels: AdminPanel (8), HardwareDashboard (7), AcquisitionDashboard (4), InstallationsDashboard (5)
- **Vollstaendige API-Felder-Dokumentation** in APIOverviewPanel
  - Alle 7 APIs mit kompletten Feld-Auflistungen (Vistar 25, Superchat 33, Claude 24, Sheets 16, Make 18, Supabase 27)
  - Inkl. theoretisch verfuegbare aber nicht genutzte Felder (used/unused Markierung)
  - Felder-Tabelle jetzt OBEN im erweiterten Bereich, API-Details (Auth, Rights) darunter
- **CSV-Export** fuer APIOverviewPanel und DataMappingPanel
  - Pro Tabelle und global exportierbar (UTF-8 BOM fuer Excel)

### Geaendert
- Chat-Modell auf `claude-haiku-4-5-20251001` aktualisiert
- Mobile: Stale-While-Revalidate Pattern fuer Instant-Load
- Mobile: RPC Timeout-Fallback (lightweight query ~500ms statt 5-10s)
- Cache-Akzeptanz von 4h auf 24h erweitert fuer Mobile
- Mobile Render Guard vereinfacht (verhindert Blank Screen)
- APIOverviewPanel Reihenfolge: Felder/Tabellen zuerst, dann Endpoints, dann Auth/Rights

### Behoben
- Voice AI Unicode-Bug bei Markdown-Stripping
- Installations-Zaehlung in Funnel korrigiert
- Aktivitaeten-Ticker Lesbarkeit verbessert
- **sync-airtable.js Robustheit**: Health-Check fuer sync_metadata, besseres Error-Logging, CSV-Spalten-Validierung, graceful Fallback auf Full-Sync

---

## [1.9.0] — 2026-02-10

### Hinzugefuegt
- **Inkrementeller Sync** — Airtable-Sync nutzt jetzt LAST_MODIFIED_TIME statt Full-Scan
- **Data Sources Overview** — Dokumentation aller Datenquellen
- Mobile Fast-Path via Supabase RPC `get_mobile_kpis()`

---

## [1.8.0] — 2026-02-07

### Hinzugefuegt
- **Feedback-Widget** — In-App Bug Reports und Feature Requests mit Klick-Position
- **Telefon-Workbench** — Anruf-Interface fuer Installations-Team
- **Attachment Auto-Sync** — Scheduled Function alle 30 Min fuer Airtable-Fotos

### Geaendert
- Origin-Label sichtbarer (blau statt grau, 10px statt 9px)

---

## [1.7.0] — 2026-02-04

### Hinzugefuegt
- **Cross-System Error Checks** — Fehler-Tab zeigt Upstream-Quelle (Airtable/CSV) pro Check
- Gruppierte Location-Ansicht im Fehler-Tab
- Security Hardening (CSP, HSTS, MIME-Type Protection)
- Hardware Lifecycle Tracking
- Stimmcheck-Feature

---

## [1.6.0] — 2026-01-28

### Hinzugefuegt
- **Hardware Fehler-Interface** — Detaillierte Hardware-Diagnostik
- UI Audit und Verbesserungen
- Google Streetview Integration
- Attachment-Verwaltung

### Refactored
- Alle Mapper-Funktionen in `shared/airtableMappers.js` zentralisiert
- Sync-Funktionen nutzen gemeinsames `airtableFields.js`

---

## [1.5.0] — 2026-01-21

### Hinzugefuegt
- Foto-Qualitaets-Pruefung
- Cross-Tab Navigation zwischen Dashboard-Bereichen
- Pipeline-Filter als Standard in Akquise

### Behoben
- Echte Airtable-Werte fuer Approval + Status-Logik
- Aufbau-Details mit korrekten Feldwerten

---

## [1.4.0] — 2026-01-15

### Hinzugefuegt
- **Standalone Scheduling Interface** unter `/scheduling/`
- SuperChat API Template-Support fuer WhatsApp Invites
- Install Date Booker: Storno-Tasks, Telefonbuchung, Mehrsprachigkeit

### Behoben
- SuperChat API Format-Kompatibilitaet
- Slot-Berechnung fuer Installations-Termine

---

## [1.3.0] — 2026-01-08

### Behoben
- ComparisonData TDZ-Crash behoben (Reference before declaration)
- Global Error Boundary gegen White-Screen-Crashes
- Vereinfachte effectiveDisplays-Berechnung
- Gruppierte Navigation und KPI-Qualitaet verbessert

---

## [1.2.0] — 2025-12-20

### Hinzugefuegt
- **Chat Agent** — Claude-basierter Assistent mit Dashboard-Kontext
- **Akquise App** — Standalone Akquise-Pipeline
- **Vistar SSP Integration** — Programmatic DOOH Revenue Dashboard
- **Install Booker** — Automatisierte Installations-Terminierung
- **Hardware Dashboard** — OPS/SIM/Display Inventar-Verwaltung

---

## [1.0.0] — 2025-11-01

### Initial Release
- React 19 + Vite 7 + Tailwind CSS 4
- Supabase Auth + DB
- Airtable Integration (13 Tabellen)
- KPI Dashboard mit Health Rate, Online/Offline Tracking
- Display-Tabelle mit Detailansicht
- City Health Charts
- Task Management
- Kommunikations-Dashboard
- Admin Panel mit Benutzerverwaltung
