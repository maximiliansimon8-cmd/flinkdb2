# JET Dashboard V2 — Datenquellen-Übersicht

> Erstellt: 14.02.2026 | Letzte Aktualisierung: 14.02.2026
> Zweck: Vollständige Dokumentation aller Datenquellen, Sync-Logik, Mappings und KPI-Berechnungen

---

## 1. Architektur-Übersicht

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Airtable (12 Tab) │────▶│  Netlify Function │────▶│    Supabase      │
│   (READ-ONLY)       │     │  sync-airtable.js │     │  (14 Tabellen)   │
└─────────────────────┘     └──────────────────┘     └────────┬────────┘
                                                              │
┌─────────────────────┐     ┌──────────────────┐              │
│  Google Sheets (CSV)│────▶│  sync-airtable.js │─────────────┤
│  (READ-ONLY)        │     │  (Heartbeats)     │              │
└─────────────────────┘     └──────────────────┘              │
                                                              ▼
                                                     ┌─────────────────┐
                                                     │  React Frontend  │
                                                     │  (App.jsx)       │
                                                     │  + Chat AI       │
                                                     │  + Mobile RPC    │
                                                     └─────────────────┘
```

**Grundregel:** Wir lesen NUR von externen Quellen (Airtable, Google Sheets). Wir schreiben NIEMALS zurück. Supabase ist unser lokaler Cache.

---

## 2. Externe Datenquellen

### 2.1 Airtable

- **Base ID:** `apppFUWK829K6B3R2`
- **Sync-Interval:** Alle 2 Stunden (cron: `0 */2 * * *`)
- **Sync-Funktion:** `netlify/functions/sync-airtable.js`
- **Sync-Modus:** Inkrementell (nur geänderte Records seit letztem Sync via `LAST_MODIFIED_TIME()`)

| # | Airtable-Tabelle | Table ID | Supabase-Ziel | Felder (Anzahl) | Primärschlüssel |
|---|---|---|---|---|---|
| 1 | JET Stammdaten | `tblLJ1S7OUhc2w5Jw` | `stammdaten` | 13 | `airtable_id` |
| 2 | Live Display Locations | `tblS6cWN7uEhZHcie` | `airtable_displays` | 17 | `airtable_id` |
| 3 | Tasks | `tblcKHWJg77mgIQ9l` | `tasks` | 22+ | `airtable_id` |
| 4 | Acquisition_DB | `tblqFMBAeKQ1NbSI8` | `acquisition` | 22 | `airtable_id` |
| 5 | Dayn Screens | `Dayn Screens` (Name) | `dayn_screens` | 24 | `airtable_id` |
| 6 | Installationen | `tblKznpAOAMvEfX8u` | `installationen` | 15 | `airtable_id` |
| 7 | OPS_Player_inventory | `tbl7szvfLUjsUvMkH` | `hardware_ops` | 12 | `id` |
| 8 | SIM_card_inventory | `tblaV4UQX6hhcSDAj` | `hardware_sim` | 4 | `id` |
| 9 | display_inventory | `tblaMScl3j45Q4Dtc` | `hardware_displays` | 4 | `id` |
| 10 | CHG Approval | `tblvj4qjJpBVLbY7F` | `chg_approvals` | 17 | `id` |
| 11 | Hardware Swap | `tblzFHk0HhB4bNYJ4` | `hardware_swaps` | 12 | `id` |
| 12 | Deinstallationen | `tbltdxgzDeNz9d0ZC` | `hardware_deinstalls` | 11 | `id` |
| 13 | activity_log | `tblDk1dl4J3Ow3Qde` | `communications` | 14 | `airtable_id` |

### 2.2 Google Sheets (Heartbeats)

- **URL:** `docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s`
- **Format:** CSV-Export (`?format=csv&gid=0`)
- **Supabase-Ziel:** `display_heartbeats`
- **Sync-Modus:** Inkrementell (Rows mit Timestamp > letzter Sync werden übersprungen)
- **Einfüge-Modus:** INSERT (append-only, kein Upsert) mit `resolution=ignore-duplicates`

**CSV-Spalten → Supabase-Spalten:**

| Google Sheets Spalte | Supabase Spalte | Typ | Beschreibung |
|---|---|---|---|
| `Timestamp` | `timestamp` / `timestamp_parsed` | text / timestamptz | Zeitstempel des Heartbeats (DD.MM.YYYY HH:MM) |
| `Display ID` | `display_id` / `raw_display_id` | text | Display-Kennung (bereinigt + roh) |
| `Location Name` | `location_name` | text | Standortname |
| `Serial Number` | `serial_number` | text | Seriennummer |
| `Date` | `registration_date` | text | Registrierungsdatum |
| `Status` | `heartbeat` | text | Letzter Heartbeat-Zeitstempel |
| `Is Alive` | `is_alive` | text | Online-Status |
| `Display Status` | `display_status` | text | Display-Statustext |
| `Last Online Date` | `last_online_date` | text | Letztes Online-Datum |
| `Days Offline` | `days_offline` | int | Tage offline |

---

## 3. Feld-Mapping: Airtable → Supabase (je Tabelle)

### 3.1 Stammdaten (`stammdaten`)

| Airtable-Feld | Supabase-Spalte | Besonderheiten |
|---|---|---|
| `JET ID` | `jet_id` | Kann Array sein → unwrap zu single value |
| `Display ID` | `display_ids` | Array (jsonb) |
| `Location Name` | `location_name` | |
| `Contact Person` | `contact_person` | |
| `Contact Email` | `contact_email` | |
| `Contact Phone` | `contact_phone` | |
| `Location Email` | `location_email` | |
| `Location Phone` | `location_phone` | |
| `Legal Entity` | `legal_entity` | |
| `Street` / `Street Number` | `street` / `street_number` | |
| `Postal Code` / `City` | `postal_code` / `city` | |
| `Lead Status  (from Akquise)` | `lead_status` | ⚠️ DOPPELTES LEERZEICHEN im Feldnamen! Array (jsonb) |
| `Status` | `display_status` | |

### 3.2 Live Display Locations (`airtable_displays`)

| Airtable-Feld | Supabase-Spalte | Besonderheiten |
|---|---|---|
| `Display ID` | `display_id` | |
| `Display Table ID` | `display_table_id` | |
| `display_name` | `display_name` | |
| `Online Status ` | `online_status` | ⚠️ TRAILING SPACE im Feldnamen! |
| `Live since` | `live_since` | |
| `deinstall_date` | `deinstall_date` | |
| `Screen Type` / `Screen Size ` | `screen_type` / `screen_size` | ⚠️ Screen Size hat TRAILING SPACE |
| `Navori Venue ID (from Installationen)` | `navori_venue_id` | Lookup → first() |
| `Location Name` / `City` / `Street` / `Street Number` / `Postal Code` | standard | Lookups → first() |
| `JET ID (from JET ID)` | `jet_id` | Lookup → first() |
| `SoV Partner Ad` | `sov_partner_ad` | |
| `Created` | `created_at` | |

### 3.3 Tasks (`tasks`)

| Airtable-Feld | Supabase-Spalte | Besonderheiten |
|---|---|---|
| `Task Title` | `title` | |
| `Task Type` | `task_type_select` | Array |
| `Company (from Partner)` / `Partner` | `task_type` | Fallback-Kette |
| `Status` | `status` | Werte: Completed, Open, In Progress, etc. |
| `Priority` | `priority` | Werte: High, Medium, Low, Urgent |
| `Due Date` | `due_date` | |
| `Description` | `description` | |
| `Assigned` | `assigned` | Array von Collaborator-Objekten → .name |
| `Responsible User` | `responsible_user` | Collaborator → .name |
| `Created by` | `created_by` | Collaborator → .name |
| `Display ID (from Displays )` | `display_ids` | ⚠️ Trailing space vor `)` |
| `Location Name (from Locations)` | `location_names` | Array |
| `Overdue` | `overdue` | |
| `completed_task_date` | `completed_date` | |
| `Attachments` | `attachments` | JSONB (url, filename, size, type) |
| `external_visiblity` | `external_visibility` | ⚠️ TYPO im Airtable-Feldnamen! |
| `Online Status  (from Displays )` | `online_status` | ⚠️ Doppeltes Leerzeichen + Trailing Space |
| `Status Installation (from Installation)` | `installation_status` | Lookup Array |
| `Integrator (from Installation)` | `integrator` | Lookup Array |
| `JET ID (from Locations)` | `jet_ids` | Array |
| `City (from Locations)` | `cities` | Array |

### 3.4 Acquisition_DB (`acquisition`)

| Airtable-Feld | Supabase-Spalte | Besonderheiten |
|---|---|---|
| `Akquise ID` | `akquise_id` | |
| `Lead_Status` | `lead_status` | Werte: Won / Signed, New Lead, Qualified, Contacted, Lost, etc. |
| `frequency_approval` | `frequency_approval` | |
| `install_approval` | `install_approval` | |
| `approval_status` | `approval_status` | Werte: Accepted, Rejected, In review, Info required |
| `Acquisition Date` | `acquisition_date` | |
| `Installations Status` | `installations_status` | Lookup Array |
| `Display Location Status` | `display_location_status` | Lookup Array |
| `City` | `city` | Lookup Array |
| `Location Name_new` | `location_name` | Lookup → first() |
| `JET_ID` | `jet_id` | Lookup → first() |
| `Akquisition Partner Name (from Team)` | `acquisition_partner` | Lookup → first() |
| `# dVAC / Woche 100% SoV` | `dvac_week` | |
| `Schaufenster einsehbar` | `schaufenster` | |
| `Hindernisse vorhanden` | `hindernisse` | |
| `Mount Type` | `mount_type` | |
| `Vertrag PDF vorhanden` | `vertrag_vorhanden` | |
| `Akquise Storno` | `akquise_storno` | Boolean |
| `Post‑Install Storno` | `post_install_storno` | ⚠️ NON-BREAKING HYPHEN (U+2011)! |
| `Post‑Install Storno Grund` | `post_install_storno_grund` | ⚠️ NON-BREAKING HYPHEN (U+2011)! Array |
| `ready_for_installation` | `ready_for_installation` | ⚠️ Checkbox = String "checked", nicht Boolean! |

### 3.5 Installationen (`installationen`)

| Airtable-Feld | Supabase-Spalte | Besonderheiten |
|---|---|---|
| `Aufbau Datum` | `install_date` | |
| `Status Installation` | `status` | Werte: Installiert, Abgebrochen, Geplant, Nacharbeit erforderlich, Storniert |
| `Installationsart` | `installation_type` | |
| `Company (from Integrator)` | `integrator` | Array → join(', ') |
| `Name (from Technikers)` | `technicians` | Array |
| `Installationsprotokoll` | `protocol_url` / `protocol_filename` | Array → first().url / .filename |
| `Screen Art` / `Screen Size` | `screen_type` / `screen_size` | |
| `OPS Nr` / `SIM-ID` | `ops_nr` / `sim_id` | |
| `Installationsstart` / `Installationsabschluss` | `install_start` / `install_end` | |
| `Allgemeine Bemerkungen` | `remarks` | |
| `Abnahme Partner (Name)` | `partner_name` | |
| `Display Table ID (from Link to Display ID )` | `display_ids` | ⚠️ Trailing space! Array |

### 3.6 Dayn Screens (`dayn_screens`)

| Airtable-Feld | Supabase-Spalte | Besonderheiten |
|---|---|---|
| `Dayn_Screen_ID` / `DO_Screen_ID` | `dayn_screen_id` / `do_screen_id` | |
| `Screen Status` | `screen_status` | |
| `location_name` / `address` / `city` | standard | |
| `latitude` / `longitude` | `latitude` / `longitude` | Numerisch |
| `screen width (px)` / `screen height (px)` | `screen_width_px` / `screen_height_px` | Numerisch |
| `floor CPM` | `floor_cpm` | Numerisch |
| `# dVAC / Woche 100% SoV` | `dvac_week` | Numerisch |
| `dVAC / Month` / `dVAC per Day` | `dvac_month` / `dvac_day` | Numerisch |
| `Impressions per Spot` | `impressions_per_spot` | Numerisch |
| `static_supported` / `video_supported` | Boolean | "TRUE"/"FALSE" String → Boolean |
| `Maximun video spot lenth (seconds)` | `max_video_length` | ⚠️ TYPO "Maximun" + "lenth" |

### 3.7 Hardware-Tabellen

**OPS Player Inventory (`hardware_ops`):**
- `OpsNr.` → `ops_nr`, `status` → `status`, `OPS-SN` → `ops_sn`
- `ops_hardware_type` → `hardware_type`, `navori_venueID` → `navori_venue_id`
- `SimID (from SimID)` → `sim_id` (Lookup), `display_serial_number (from display_inventory)` → `display_sn` (Lookup)
- `Online Status  (from Live Display Locations)` → `location_online_status` (⚠️ Doppeltes Leerzeichen!)

**SIM Card Inventory (`hardware_sim`):**
- `SimID` → `sim_id` (String!), `activate_date` → `activate_date`, `status` → `status`
- `OPS_Player_inventory 2` → `ops_record_id` (Link)

**Display Inventory (`hardware_displays`):**
- `display_serial_number` → `display_serial_number` (String!), `location` → `location`
- `OPS_Player_inventory` → `ops_record_id` (Link), `status` → `status`

**CHG Approval (`chg_approvals`):**
- Leasing-/Finanzierungsdaten: `Asset ID`, `Display SN`, `Invoice No/Date`
- `Rental start/end date`, `Payment released on/by`, `Status`, `Inspection Status`

**Hardware Swap (`hardware_swaps`):**
- `Tausch-ID` → `swap_id`, `Tausch-Typ` / `Tausch-Datum` / `Tausch-Grund`
- `ALTE Hardware` / `NEUE Hardware` → `old_hardware_ids` / `new_hardware_ids` (Arrays)

**Deinstallationen (`hardware_deinstalls`):**
- `Deinstallations-ID` → `deinstall_id`, `Deinstallationsdatum` → `deinstall_date`
- `Grund` → `reason`, `Hardware-Zustand` / `Zustandsbeschreibung`

### 3.8 Communications (`communications`)

| Airtable-Feld | Supabase-Spalte |
|---|---|
| `Channel` | `channel` |
| `Direction` | `direction` |
| `Subject` / `Message` | `subject` / `message` |
| `Timestamp` | `timestamp` |
| `Status` | `status` |
| `Recipient Name` / `Recipient Contact` | `recipient_name` / `recipient_contact` |
| `Sender` | `sender` |
| `External ID` | `external_id` |
| `Location Name (from Location)` | `location_names` (Array) |
| `Display ID (from Location)` | `display_ids` (Array) |
| `JET ID (from Location)` | `jet_ids` (Array) |

---

## 4. Supabase RPC-Funktionen

### 4.1 `get_mobile_kpis()` — Mobile Dashboard KPIs

**Datei:** `sql/add-mobile-kpis-rpc.sql`
**Zweck:** Alle Dashboard-KPIs in einem einzigen DB-Call berechnen (~2KB JSON)
**Verwendet von:** Mobile App (Fast-Path in `App.jsx`)

**Berechnung:**
1. Holt den **letzten Heartbeat-Snapshot pro display_id** (letzte 30 Tage)
2. Prüft ob Display **jemals online** war (display_first_seen)
3. **Klassifiziert** jeden Display: online (<24h) / warning (24-72h) / critical (72h-7d) / permanent_offline (>7d) / never_online
4. **Aggregiert** Counts und Health Rate
5. **Top 10 offline** Displays (für Attention Cards)
6. **City-Breakdown** (Counts pro Stadt)

**Rückgabe:**
```json
{
  "healthRate": 94.2,
  "totalActive": 312,
  "onlineCount": 287,
  "warningCount": 12,
  "criticalCount": 8,
  "permanentOfflineCount": 3,
  "neverOnlineCount": 2,
  "newlyInstalled": 1,
  "topOffline": [...],
  "byCity": { "München": { "total": 48, "online": 45, ... } },
  "computedAt": "2026-02-14T..."
}
```

**City-Code-Mapping in SQL:**
- CGN → Köln, BER → Berlin, MUC → München, HAM/HH → Hamburg
- DUS → Düsseldorf, FRA → Frankfurt, STR → Stuttgart, DTM/DO → Dortmund
- LEJ → Leipzig, DRS → Dresden, NUE → Nürnberg, HAN → Hannover
- BRE → Bremen, ESS → Essen, KA → Karlsruhe, MS → Münster
- BI → Bielefeld, WI → Wiesbaden, MA → Mannheim, AC → Aachen, KI → Kiel, ROS → Rostock

### 4.2 Weitere SQL-Dateien (noch nicht alle ausgeführt)

| Datei | Zweck | Status |
|---|---|---|
| `add-mobile-kpis-rpc.sql` | Mobile KPIs RPC | ✅ Ausgeführt |
| `add-sync-metadata.sql` | Sync-Tracking für inkrementellen Sync | ⏳ Muss noch ausgeführt werden |
| `add-phone-call-logs.sql` | Telefon-Anruf-Logging | ⏳ Muss noch ausgeführt werden |
| `add-hardware-tables.sql` | Hardware-Tabellen (OPS, SIM, Display, CHG, Swaps, Deinstall) | ✅ Ausgeführt |
| `add-airtable-displays.sql` | Live Display Locations Tabelle | ✅ Ausgeführt |
| `add-dayn-screens.sql` | Dayn Screens Tabelle | ✅ Ausgeführt |
| `add-agent-memory.sql` | AI Agent Memory | ✅ Ausgeführt |
| `add-feedback-table.sql` | User Feedback | ✅ Ausgeführt |
| `add-api-usage-log.sql` | API Usage Tracking | ✅ Ausgeführt |
| `add-attachment-cache.sql` | Attachment Cache (Bilder) | ✅ Ausgeführt |
| `fix-tasks-missing-columns.sql` | Fehlende Spalten in tasks | ✅ Ausgeführt |
| `vistar-tables.sql` | Vistar/Revenue Tabellen | ✅ Ausgeführt |

---

## 5. KPI-Berechnungen und Datenverwendung

### 5.1 Desktop KPIs (berechnet im Frontend: `src/utils/dataProcessing.js`)

Das Frontend lädt alle `display_heartbeats` Rows (paginated, bis zu 40.000) und berechnet client-seitig:

| KPI | Berechnung | Datenquelle |
|---|---|---|
| **Health Rate** | `(onlineCount / totalActive) * 100` | display_heartbeats |
| **Total Active** | Displays mit Heartbeat in letzten 30 Tagen | display_heartbeats |
| **Online Count** | Displays mit offlineHours < 24h | display_heartbeats |
| **Warning Count** | Displays mit offlineHours 24-72h | display_heartbeats |
| **Critical Count** | Displays mit offlineHours 72h-7d | display_heartbeats |
| **Permanent Offline** | Displays mit offlineHours > 7d | display_heartbeats |
| **Never Online** | Displays die nie einen Heartbeat hatten | display_heartbeats + display_first_seen |
| **Newly Installed** | Displays mit firstSeen in letzten 7 Tagen | display_first_seen |

### 5.2 Chat-Kontext KPIs (`src/utils/chatContext.js`)

Der Chat-Kontext wird bei jeder Nachricht mitgeschickt und enthält:

**Aus display_heartbeats / KPIs:**
- overview: totalDisplays, totalActive, healthRate, online/warning/critical/permanentOffline/neverOnline
- offlineDisplays: Top 15 längste Ausfälle (id, location, city, offlineH, status)
- criticalDisplays: Top 20 kritische Displays
- cities: Breakdown pro Stadt (total, online, warning, critical, healthRate)
- recentTrend: 7-Tage Health-Rate-Verlauf

**Aus tasks:**
- total, open, completed, overdueCount
- byStatus, byPartner, byPriority
- problemCategories: Offline/Kein Signal, Installation, Hardware-Defekt, Content, etc.
- locationHotspots: Standorte mit den meisten offenen Tasks
- partnerPerformance: Partner-Ranking nach Overdue-Rate
- allOpenTasks: Alle offenen Tasks mit Beschreibung

**Aus acquisition:**
- total, wonSigned, readyForInstall, withContract
- byLeadStatus, stornoCount, inReviewCount
- last7Days/last30Days: Neue Akquisen

**Aus installationen:**
- erfolgreicheInstallationen: NUR Status "installiert"/"erfolgreich"/"installed"
- gesamtTermine: ALLE Installationstermine (inkl. abgebrochen/storniert)
- letzte7Tage/letzte30Tage/letzte90Tage: Nur erfolgreiche Installationen
- byStatus, byIntegrator, weeklyTrend
- topIntegrators: Ranking nach Anzahl Installationen

**Aus deinstallationen:**
- totalDeinstalls, last7Deinstalls, last30Deinstalls
- deinstReasons: Gründe für Deinstallationen
- deinstByCity: Deinstallationen pro Stadt

**Aus hardware:**
- opsCount (OPS Player), simCount (SIM Cards)
- bankLeasingCount, chgCount (CHG Approvals)

### 5.3 Installations-Funnel (Frontend: `InstallationExecutiveDashboard.jsx`)

Der Installations-Funnel zeigt den Pipeline-Fortschritt:

| Funnel-Stufe | Logik | Datenquelle |
|---|---|---|
| **In Review** | leadStatus = "Won / Signed" AND approvalStatus != "Accepted" AND NOT readyForInstall | `acquisition` |
| **Bereit f. Aufbau** | readyForInstallation = true/checked ODER leadStatus = "ready for install" | `acquisition` |
| **Eingeladen** | Hat Einladungs-Kommunikation | `acquisition` + `communications` |
| **Gebucht** | Hat Installation mit Status != Abgebrochen/Storniert | `acquisition` + `installationen` |
| **Bestätigt** | Installation bestätigt | `installationen` |
| **Installiert** | Status Installation = "Installiert" | `installationen` |

---

## 6. Sync-Logik im Detail

### 6.1 Inkrementeller Sync

**Tracking-Tabelle:** `sync_metadata` (Supabase)
- Speichert pro Tabelle: `last_sync_timestamp`, `records_fetched`, `records_upserted`

**Airtable-Filter:** `filterByFormula=LAST_MODIFIED_TIME()>'${sinceISO}'`
- Holt nur Records die seit dem letzten Sync geändert wurden
- Erster Sync (kein Timestamp vorhanden) = Full Sync

**Google Sheets:** Timestamp-Cutoff
- Rows mit `timestamp_parsed <= lastSync` werden übersprungen
- INSERT mit `resolution=ignore-duplicates` (keine Duplikate)

**Orphan-Erkennung:** Nur bei Full Sync (erster Lauf)
- Vergleicht Supabase airtable_ids mit Airtable Record IDs
- Löscht Records die in Airtable nicht mehr existieren

### 6.2 Sync-Zeitplan

| Funktion | Schedule | Trigger |
|---|---|---|
| `sync-airtable.js` | `0 */2 * * *` (alle 2h) | Scheduled + Manuell via `x-sync-key` |
| `sync-attachments-scheduled.js` | `*/30 * * * *` (alle 30min) | Scheduled |
| `trigger-sync-background.js` | — | Manueller Button im Dashboard |

---

## 7. Externe API-Integrationen (Netlify Functions)

| Funktion | Dienst | Richtung | Zweck |
|---|---|---|---|
| `chat-proxy.js` | Anthropic (Claude) | OUT | AI Chat-Assistent |
| `superchat-proxy.js` | Superchat API | OUT | Messaging an Standorte |
| `vistar-proxy.js` / `vistar-sync.js` | Vistar Media | IN | Revenue/Programmatic Daten |
| `auth-proxy.js` | Supabase Auth | PROXY | Login/Session Management |
| `airtable-proxy.js` | Airtable | PROXY | Direkte Airtable-Abfragen (Detail) |
| `sheets-proxy.js` | Google Sheets | PROXY | Direkte Sheets-Abfragen |
| `install-booker-*.js` | Airtable | READ/WRITE* | Installations-Buchungssystem |

*`install-booker-book.js` schreibt in Airtable (Installationen-Tabelle) — das ist die einzige schreibende Airtable-Integration und bezieht sich nur auf das Buchungssystem.

---

## 8. Bekannte Airtable-Feldname-Probleme

| Problem | Betroffene Felder | Lösung im Code |
|---|---|---|
| **Trailing Space** | `Online Status `, `Screen Size `, `Display ID (from Displays )` | Exakte Feldnamen in `airtableFields.js` mit Space |
| **Doppeltes Leerzeichen** | `Lead Status  (from Akquise)`, `Online Status  (from ...)` | Exakte Feldnamen mit Double-Space |
| **Non-Breaking Hyphen (U+2011)** | `Post‑Install Storno`, `Post‑Install Storno Grund` | Unicode-Escape `\u2011` im Code |
| **Typos** | `external_visiblity` (→ visibility), `Maximun` (→ Maximum), `lenth` (→ length), `Longtitude` (→ Longitude) | Exakte Typo-Schreibweise verwenden |
| **Checkbox als String** | `ready_for_installation` = "checked" (nicht true) | `isReadyForInstall()` Helper prüft beide |

---

## 9. Datenfluss-Diagramm pro KPI

```
Health Rate:
  Google Sheets CSV
    → display_heartbeats (Supabase)
      → Frontend: parseRows() berechnet offlineHours pro Display
        → KPI: online / totalActive * 100

Installations-Zählung:
  Airtable "Installationen"
    → installationen (Supabase)
      → Frontend: chatContext.js filtert isSuccess()
        → erfolgreicheInstallationen (nur status=installiert/erfolgreich)
        → gesamtTermine (alle inkl. abgebrochen)

Akquise-Pipeline:
  Airtable "Acquisition_DB"
    → acquisition (Supabase)
      → Frontend: buildAcquisitionSummary()
        → total, wonSigned, readyForInstall, stornoCount, etc.

Task-Übersicht:
  Airtable "Tasks"
    → tasks (Supabase)
      → Frontend: buildTaskSummary()
        → open, overdue, byPartner, problemCategories, hotspots

Hardware-Tracking:
  Airtable "OPS/SIM/Display Inventory" + "CHG Approval" + "Hardware Swap" + "Deinstallationen"
    → hardware_ops/sim/displays + chg_approvals + hardware_swaps + hardware_deinstalls (Supabase)
      → Frontend: HardwareDashboard Komponente
```

---

## 10. Offene Punkte / TODO

- [ ] **`add-sync-metadata.sql` ausführen** — Supabase-Tabelle für inkrementellen Sync (DRINGEND)
- [ ] **`add-phone-call-logs.sql` ausführen** — Telefon-Logging-Tabelle
- [ ] **City-Code-Mapping verifizieren** — SQL RPC vs. Frontend CITY_MAP abgleichen
- [ ] **Potenzialanalyse** — Neue Datenquelle für Eigentum vs. Miete (Feature noch nicht implementiert)
- [ ] **Vistar Revenue-Integration** — Daten werden geholt aber noch nicht im Mobile Dashboard angezeigt
