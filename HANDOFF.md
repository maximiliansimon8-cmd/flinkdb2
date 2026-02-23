# VOLLSTAENDIGE UEBERGABE — JET Dashboard V2

> Dieses Dokument dient als vollstaendiges Briefing fuer einen neuen Claude-Agenten.
> Kopiere den gesamten Inhalt als erste Nachricht in ein neues Chat-Fenster.

---

## ⚠️ GRUNDREGELN — LIES DAS ZUERST

> Diese Regeln sind VERBINDLICH fuer jeden Entwickler. Sie definieren, wie Daten interpretiert,
> KPIs berechnet und Filter angewendet werden. Halte dich IMMER an diese Regeln.
> Bei Widerspruch zwischen Code und diesen Regeln gelten diese Regeln.

### REGEL 1: Datenquelle-Hierarchie

```
Airtable = Source of Truth (Original-Daten)
     ↓ sync-airtable.js (alle 15 Min, inkrementell)
Supabase = Read-Cache (schnelle Abfragen fuer Frontend)
     ↓
Frontend = liest NUR von Supabase (NIEMALS direkt von Airtable)
     ↓
Schreiboperationen = Frontend > Netlify Function > Airtable API
                     (Supabase wird beim naechsten Sync aktualisiert)
```

- **Lesen:** Frontend → Supabase (direkt oder via /api/supabase-proxy fuer >5000 Records)
- **Schreiben:** Frontend → Netlify Function → Airtable API → naechster Sync → Supabase
- **NIEMALS** direkt in Supabase schreiben wenn die Daten aus Airtable stammen (werden beim naechsten Sync ueberschrieben)
- **Ausnahme:** Tabellen die NUR in Supabase existieren (install_bookings, install_routen, install_teams, app_users, groups, audit_log, feature_flags, hardware_*, warehouse_*, purchase_orders, etc.) duerfen direkt beschrieben werden

### REGEL 2: Standort-Status-Praedikate (KANONISCH)

Die Datei `src/metrics/predicates.js` ist die EINZIGE WAHRHEITSQUELLE fuer Standort-Status.
**NIEMALS** eigene lokale Kopien dieser Logik erstellen. IMMER importieren:

```javascript
import { isStorno, isAlreadyInstalled, isReadyForInstall, isPendingApproval } from '../metrics';
```

#### Praedikat-Definitionen:

| Praedikat | Bedeutung | Bedingungen |
|-----------|-----------|-------------|
| `isStorno(record)` | Storniert/Abgebrochen | akquiseStorno=true ODER postInstallStorno=true ODER leadStatus enthaelt 'storno'/'cancelled'/'lost' |
| `isAlreadyInstalled(record)` | Bereits installiert | installationsStatus enthaelt 'installiert'/'live'/'abgebrochen' ODER leadStatus='live'/'installation' ODER displayLocationStatus hat nicht-leere Werte |
| `isReadyForInstall(record)` | Aufbaubereit | leadStatus='won / signed' UND approvalStatus='accepted'/'approved' UND vertragVorhanden=true |
| `isPendingApproval(record)` | Offene Pruefung | leadStatus='won / signed' UND approvalStatus in ['in review','info required','not started','not tarted'] |

#### Kritische Hinweise zu Praedikaten:

1. **`isReadyForInstall` prueft NICHT auf Storno/Installiert** — der Aufrufer MUSS das tun:
   ```javascript
   // RICHTIG:
   const aufbaubereit = allRecords.filter(a =>
     !isStorno(a) && !isAlreadyInstalled(a) && isReadyForInstall(a)
   );

   // FALSCH — enthaelt stornierte und bereits installierte:
   const aufbaubereit = allRecords.filter(a => isReadyForInstall(a));
   ```

2. **`isAlreadyInstalled` schliesst 'abgebrochen' ein** — abgebrochene Installationen zaehlen als "bereits installiert" und sollen NICHT erneut in die Install-Queue

3. **Airtable-Typo beachten:** approvalStatus `'not tarted'` statt `'not started'` — wird in isPendingApproval beruecksichtigt

4. **vertragVorhanden hat viele Formate:** true, 'true', 'checked', 'YES', 'yes' — alle bedeuten "Vertrag liegt vor"

### REGEL 3: Definition "Aufbaubereit"

Ein Standort ist **aufbaubereit** wenn ALLE diese Bedingungen erfuellt sind:

1. ✅ `leadStatus === 'won / signed'` (Vertrag unterschrieben)
2. ✅ `approvalStatus === 'accepted' || 'approved'` (Genehmigung erteilt)
3. ✅ `vertragVorhanden === true` (Vertrag-PDF liegt vor)
4. ❌ Nicht storniert (`!isStorno(record)`)
5. ❌ Nicht bereits installiert (`!isAlreadyInstalled(record)`)

**Wenn du eine neue Ansicht baust die "aufbaubereite Standorte" zeigt, MUSST du alle 5 Bedingungen pruefen.**

### REGEL 4: Buchungsstatus-Kategorien

Die Supabase-Tabelle `install_bookings` hat folgende Status-Werte:

| DB-Status | UI-Label | Bedeutung | Farbe |
|-----------|----------|-----------|-------|
| `pending` | Eingeladen | WhatsApp gesendet, noch kein Termin gewaehlt | Gelb #eab308 |
| `booked` | Eingebucht | Kunde hat Termin gewaehlt | Gruen #22c55e |
| `confirmed` | Eingebucht | Termin bestaetigt (= booked, gleiche Behandlung) | Gruen #22c55e |
| `completed` | Abgeschlossen | Installation durchgefuehrt | Emerald #10b981 |
| `cancelled` | Storniert | Termin abgesagt | Rot #ef4444 |
| `no_show` | No-Show | Kunde war nicht da | Grau #6b7280 |

**WICHTIG:**
- `booked` und `confirmed` werden in der UI IMMER als "Eingebucht" zusammengefasst
- Ein Standort mit Status `pending` hat KEINEN Termin — nur eine Einladung
- Die Unterscheidung "Eingebucht vs Eingeladen vs Nicht eingeladen" ist:
  - **Eingebucht:** Hat booked/confirmed Status ODER hat einen Airtable-Installationstermin
  - **Eingeladen:** Hat nur pending Status (Einladung gesendet, kein Termin)
  - **Nicht eingeladen:** Hat keinen Eintrag in install_bookings

### REGEL 5: Airtable-Installationstermine vs Supabase-Bookings

Es gibt ZWEI Quellen fuer Termine — die MUESSEN zusammengefuehrt werden:

```
Airtable: installationstermine (Tabelle tblZrFRRg3iKxlXFJ)
  → Status-Mapping: geplant→booked, durchgefuehrt→completed,
    abgesagt→cancelled, verschoben→pending, no-show→no_show, bestaetigt→confirmed

Supabase: install_bookings
  → Direkte Status-Werte (pending, booked, confirmed, etc.)
```

Die Funktion `mergeAirtableTermine()` in `installUtils.js` fuehrt beide zusammen.
**NIEMALS** nur eine Quelle verwenden — es gibt Termine die NUR in Airtable existieren
(manuell eingetragen) und welche die NUR in Supabase existieren (via Booking-Flow).

### REGEL 6: KPI-Berechnungsformeln

| KPI | Formel | Hinweis |
|-----|--------|---------|
| **Konversionsrate** | (booked+confirmed+completed) / (pending+booked+confirmed+completed) × 100 | cancelled und no_show sind NICHT im Nenner (haben den Funnel verlassen) |
| **No-Show-Rate** | no_show / (completed+no_show) × 100 | Nur Termine die den Termin-Tag erreicht haben |
| **Kapazitaetsauslastung** | gebuchte_slots / total_kapazitaet × 100 | Nur zukuenftige offene Routen. Kombiniert Supabase-Bookings + Airtable-Only-Termine |
| **Ueberfaellig** | pending + whatsapp_sent_at > 48h her | Nur pending-Einladungen ohne Antwort seit >48h |
| **Durchschn. Buchungszeit** | Summe(booked_at - whatsapp_sent_at) / Anzahl | Nur Bookings die beide Timestamps haben |
| **Wochen-Trend** | (diese_Woche - letzte_Woche) / letzte_Woche × 100 | Basiert auf created_at der Buchungen |

### REGEL 7: Filter-Reihenfolge

Wenn du Acquisition-Daten filterst, halte IMMER diese Reihenfolge ein:

```javascript
// 1. Erst Storno rausfiltern
// 2. Dann bereits installierte rausfiltern
// 3. Dann positives Kriterium anwenden
const aufbaubereit = acquisitionData.filter(a =>
  !isStorno(a) &&              // Schritt 1
  !isAlreadyInstalled(a) &&    // Schritt 2
  isReadyForInstall(a)         // Schritt 3
);
```

Das gilt UEBERALL: Executive Dashboard, Ready Locations, Bookings Dashboard, Phone Workbench, Invite Manager.

### REGEL 8: Haupt-Dashboard KPIs (Displays, nicht Akquise!)

Das Haupt-Dashboard (App.jsx > KPICards.jsx) zeigt DOOH-Display-KPIs, NICHT Akquise-KPIs:

| KPI | Bedeutung | Quelle |
|-----|-----------|--------|
| Health Rate | % der Displays die online sind (06-22 Uhr) | display_heartbeats via RPC get_kpi_summary |
| Aktive Displays | Displays mit mind. 1 Heartbeat letzte 7 Tage | stammdaten + airtable_displays |
| Online | Displays die aktuell online sind | stammdaten (online_status) |
| Warning | Displays die >24h offline sind | stammdaten |
| Critical | Displays die >72h offline sind | stammdaten |
| Dauerhaft Offline | Displays die >7 Tage offline sind | stammdaten |
| Nie Online | Displays die noch nie einen Heartbeat hatten | stammdaten |
| Neue Displays | Displays letzte 30 Tage live | stammdaten (live_since) |
| Deinstalliert | Displays die deinstalliert wurden | stammdaten (deinstalled) |

**NICHT VERWECHSELN** mit den Installations-KPIs die im InstallationExecutiveDashboard berechnet werden.

### REGEL 9: Deployment

```
IMMER:  npm run build && netlify deploy --prod --dir=dist
NIEMALS: netlify deploy --prod --dir=.   ← ZERSTOERT DIE SEITE
```

Vor jedem Deploy MUSS `npm run build` erfolgreich durchlaufen. Das erzeugt den `dist/` Ordner.

### REGEL 10: SuperChat Template-IDs

SuperChat verwendet **interne IDs** im Format `tn_...`:
- ✅ RICHTIG: `tn_Cs5DK5Qa515O4GpAsDvWo`
- ❌ FALSCH: `installdate2_12345_67890` (das ist Meta-Format, funktioniert NICHT)

Alle 3 Templates:
| Template | ID | Variablen |
|----------|-----|-----------|
| InstallDate2 (Einladung) | `tn_Cs5DK5Qa515O4GpAsDvWo` | {{1}}=Vorname, {{2}}=Buchungslink |
| install_reminder (Erinnerung) | `tn_d3S5yQ0A18EQ9mulWgNUb` | {{1}}=Vorname, {{2}}=Buchungslink |
| install_on_the_way (Auf dem Weg) | `tn_zzfvOxMPZiB3wpwAxC9hD` | {{1}}=Vorname |

### REGEL 11: Datumsformatierung

- **Backend/API:** IMMER `YYYY-MM-DD` (ISO)
- **Frontend-Anzeige:** Deutsche Formatierung via `installUtils.js` (z.B. `formatDateDE`, `formatDateShort`)
- **MonteurView Datums-Bug:** NIEMALS `new Date().toISOString().split('T')[0]` verwenden — das kann durch UTC-Offset den falschen Tag liefern. IMMER:
  ```javascript
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  ```

### REGEL 12: Stadt-Normalisierung

Staedte werden in verschiedenen Formaten gespeichert. Verwende IMMER `normalizeCity()` aus installUtils.js fuer Vergleiche:
- Entfernt Suffixe wie " am Main", " an der "
- Frankfurt am Main → Frankfurt
- Muenchen → bleibt Muenchen

### REGEL 13: Doppelte Daten vermeiden

- Die `mergeAirtableTermine()` Funktion dedupliziert anhand von `akquise_airtable_id`
- Wenn ein Termin sowohl in Airtable als auch in Supabase existiert, hat Supabase-Booking Vorrang (hat mehr Felder)
- Bei neuen Features die Bookings anzeigen: IMMER `mergeAirtableTermine()` nutzen, NIE nur eine Quelle

### REGEL 14: Attachment-URLs expiren

Airtable-Attachment-URLs (Fotos, PDFs) sind nur ~2 Stunden gueltig.
- `sync-attachments-scheduled.js` kopiert sie alle 15 Min nach Supabase Storage
- `attachment_cache` Tabelle mappt Airtable-Record → permanente Supabase-URL
- Im Frontend: `resolveRecordImages()` aus `attachmentResolver.js` nutzen
- **NIEMALS** Airtable-URLs direkt anzeigen — sie werden nach 2h zu 403-Fehlern

---

## VOLLSTAENDIGES KPI- UND STATUS-VERZEICHNIS

> Jede KPI, jeder Status, jede Farbe, jede Berechnung — woher die Daten kommen und wie sie berechnet werden.

---

### A. DISPLAY-GESUNDHEITS-KPIs (Haupt-Dashboard)

**Angezeigt in:** `KPICards.jsx` (App.jsx > Uebersicht-Tab)
**Berechnet in:** `dataProcessing.js` > `computeKPIs()`
**Datenquelle:** `display_heartbeats` + `stammdaten` + `airtable_displays` (alles Supabase)

| KPI | Wert | Formel | Farb-Schwellen | Datenquelle |
|-----|------|--------|---------------|-------------|
| **Health Rate** | `XX.X%` | `totalOnlineHours / totalExpectedHours × 100` | ≥90% gruen (#22c55e), ≥70% amber (#f59e0b), <70% rot (#ef4444) | display_heartbeats (6-22 Uhr, 16h/Tag pro Display) |
| **Aktive Displays** | Zahl | Displays mit Heartbeat innerhalb 24h des letzten Snapshots | Blau #3b82f6 | stammdaten + airtable_displays |
| **Online** | Zahl | offlineHours < 24h | Gruen #22c55e | display_heartbeats → Berechnung offlineHours |
| **Warnung** | Zahl | 24h ≤ offlineHours < 72h | Amber #f59e0b | display_heartbeats |
| **Kritisch** | Zahl | 72h ≤ offlineHours < 168h (7 Tage) | Rot #ef4444 | display_heartbeats |
| **Dauerhaft Offline** | Zahl | offlineHours ≥ 168h (7+ Tage) | Dunkelrot #dc2626 | display_heartbeats |
| **Nie Online** | Zahl | Display hat nie einen Heartbeat gehabt | Grau #64748b | stammdaten (kein Match in heartbeats) |
| **Neu** | +Zahl | Displays deren `live_since` im gewaehlten Zeitraum liegt | Grau #94a3b8 | airtable_displays.live_since |
| **Deinstalliert** | -Zahl | Displays die im Zeitraum verschwunden sind | Grau #94a3b8 | airtable_displays (nicht mehr im letzten Snapshot) |

**offlineHours Berechnung:**
```
offlineHours = (letzter_Snapshot_Timestamp - letzter_Heartbeat_Timestamp) / (1000 × 60 × 60)
```

**Health Rate Detail:**
```
Pro Display pro Tag:
  offlineHours ≤ 3.5h (Grace Period) → 16h Online gezaehlt
  offlineHours ≤ 16h → max(0, 16 - offlineHours) Online-Stunden
  offlineHours > 16h oder kein Heartbeat → 0h

healthRate = Summe aller Online-Stunden / (Anzahl Displays × 16h × Anzahl Tage) × 100
```

**Betriebsstunden:** 06:00 - 22:00 Uhr (16h/Tag). Heartbeats ausserhalb werden ignoriert.

**Trend-Berechnung:** Vergleich erster vs letzter Tag des Zeitraums. `TrendIndicator` zeigt Differenz. "Warnung" und "Kritisch" sind `inverted` (weniger = besser).

---

### B. INSTALLATIONS-EXECUTIVE-KPIs

**Angezeigt in:** `InstallationExecutiveDashboard.jsx` (Install-Tool > Dashboard-Tab)
**Datenquelle:** `install_bookings` + `install_routen` + `acquisition` + `installationstermine`

| KPI | Wert | Formel | Datenquelle |
|-----|------|--------|-------------|
| **Gesamt-Buchungen** | Zahl | `bookings.length` | install_bookings |
| **Diese Woche** | Zahl | Buchungen mit `created_at` in den letzten 7 Tagen | install_bookings.created_at |
| **Eingeladen (Pending)** | Zahl | `bookings.filter(status === 'pending')` | install_bookings |
| **Eingebucht** | Zahl | `bookings.filter(status === 'booked' \|\| status === 'confirmed')` | install_bookings |
| **Abgeschlossen** | Zahl | `bookings.filter(status === 'completed')` | install_bookings |
| **Storniert** | Zahl | `bookings.filter(status === 'cancelled')` | install_bookings |
| **No-Show** | Zahl | `bookings.filter(status === 'no_show')` | install_bookings |
| **Konversionsrate** | `XX%` | `(booked+confirmed+completed) / (pending+booked+confirmed+completed) × 100` | install_bookings (cancelled/no_show NICHT im Nenner!) |
| **No-Show-Rate** | `XX%` | `no_show / (completed + no_show) × 100` | install_bookings |
| **Ø Buchungszeit** | `XXh` | `Summe(booked_at - whatsapp_sent_at) / Anzahl Buchungen mit beiden Timestamps` | install_bookings |
| **Kapazitaetsauslastung** | `XX%` | `gebuchte_Slots / total_Kapazitaet × 100` (nur zukuenftige offene Routen) | install_routen + install_bookings + installationstermine |
| **Ueberfaellig** | Zahl | `pending + whatsapp_sent_at > 48h` | install_bookings |
| **Bereit (nicht eingeladen)** | Zahl | `aufbaubereit + kein Booking` | acquisition (Praedikate) |
| **Offene Pruefungen** | Zahl | `won/signed + approval pending + kein Booking` | acquisition (isPendingApproval) |
| **Wochen-Trend** | `±XX%` | `(diese_Woche - letzte_Woche) / letzte_Woche × 100` | install_bookings.created_at |

**Kapazitaet Detail:**
```
futureOpenRoutes = install_routen WHERE status='open' AND schedule_date >= heute
totalCapacity = Summe(max_capacity || 4) ueber alle futureOpenRoutes
bookedSlots = Supabase-Bookings auf diesen Routen (booked/confirmed/completed)
            + Airtable-Only-Termine (terminstatus='geplant', gleiches Datum+Stadt, NICHT in Bookings)
capacityUtil = bookedSlots / totalCapacity × 100
```

---

### C. AUFBAUBEREIT-KPIs (Ready Locations)

**Angezeigt in:** `InstallationReadyLocations.jsx` (Install-Tool > Aufbaubereit-Tab)
**Datenquelle:** `acquisition` + `install_bookings` + `installationstermine`

| KPI | Wert | Formel | Datenquelle |
|-----|------|--------|-------------|
| **Gesamt** | Zahl | `readyStandorte.length` (aufbaubereit nach Praedikaten) | acquisition |
| **Eingebucht** | Zahl | Standorte mit `getBookingCategory() === 'eingebucht'` | install_bookings + installationstermine |
| **Eingeladen** | Zahl | Standorte mit `getBookingCategory() === 'eingeladen'` | install_bookings (status=pending) |
| **Nicht eingeladen** | Zahl | Standorte mit `getBookingCategory() === 'kein_termin'` | kein Eintrag in install_bookings |
| **Ohne Telefon** | Zahl | Aufbaubereite ohne `contactPhone` | acquisition.contact_phone |
| **% mit Termin** | `XX%` | `eingebucht / total × 100` (Untertitel) | Berechnung |

**getBookingCategory() Logik:**
```
1. Hat Airtable-Installationstermin? → 'eingebucht'
2. Kein Booking? → 'kein_termin'
3. Booking status = 'booked'/'confirmed'? → 'eingebucht'
4. Booking status = 'pending'? → 'eingeladen'
5. Sonst → 'kein_termin'
```

**WICHTIG:** `bookingByAkquise` filtert:
- Vergangene booked/confirmed Termine (booked_date < heute) werden IGNORIERT
- completed/cancelled/no_show werden IGNORIERT
- Nur aktive, zukuenftige Buchungen zaehlen

**terminByAkquise** zaehlt:
- `Durchgefuehrt` → immer (egal ob vergangen)
- `Geplant` → nur wenn Datum ≥ heute

---

### D. BUCHUNGS-VERWALTUNGS-KPIs (Bookings Dashboard)

**Angezeigt in:** `InstallationBookingsDashboard.jsx` (Install-Tool > Buchungen-Tab)
**Datenquelle:** `install_bookings` + `installationstermine` + `install_routen` + `acquisition`

| KPI | Wert | Formel | Datenquelle |
|-----|------|--------|-------------|
| **Gesamt** | Zahl | `allBookings.length` (nur aufbaubereite, merged AT+SB) | install_bookings + installationstermine |
| **Eingeladen** | Zahl | `status === 'pending'` | install_bookings |
| **Eingebucht** | Zahl | `(status === 'booked' \|\| 'confirmed') && booked_date >= heute` | install_bookings (NUR zukuenftige!) |
| **Abgeschlossen** | Zahl | `status === 'completed'` | install_bookings + installationstermine |
| **Storniert** | Zahl | `status === 'cancelled'` | install_bookings + installationstermine |
| **No-Show** | Zahl | `status === 'no_show'` | install_bookings + installationstermine |
| **Rueckruf noetig** | Zahl | `(cancelled \|\| no_show) && contact_phone vorhanden` | install_bookings |

**WICHTIG:** `allBookings` wird gefiltert auf `readyIds` — nur Standorte die aufbaubereit sind.
Ohne diesen Filter wuerde das Dashboard ~317 statt ~47 Eintraege zeigen (inklusive stornierte, installierte, etc.).

**Erinnerungs-Planung:**
```
Erinnerung faellig wenn:
  status === 'pending'
  UND reminder_count === 0 (noch keine gesendet)
  UND whatsapp_sent_at vorhanden
  UND (jetzt - whatsapp_sent_at) >= 22 Stunden
```

---

### E. EINLADUNGS-MANAGER-KPIs (Invite Manager)

**Angezeigt in:** `InstallationInviteManager.jsx` (Install-Tool > WA-Einladungen-Tab)
**Datenquelle:** `acquisition` + `install_bookings` + `installationstermine`

| KPI | Wert | Formel | Datenquelle |
|-----|------|--------|-------------|
| **Aufbaubereit Gesamt** | Zahl | `eligible.filter(isReadyForInstall).length` (ohne Storno, ohne Installiert) | acquisition |
| **Nicht eingeladen** | Zahl | Aufbaubereit OHNE Booking, OHNE Airtable-Termin, OHNE bookingStatus | acquisition + install_bookings |
| **Eingeladen** | Zahl | `pending + whatsapp_sent_at` (unique by akquise_id) + Airtable-Only Invited | install_bookings + acquisition.bookingStatus |
| **Gebucht** | Zahl | `booked/confirmed` (unique by akquise_id) + Airtable-Only Booked | install_bookings + acquisition.bookingStatus |
| **Reschedule** | Zahl | `cancelled/no_show` (unique by akquise_id) | install_bookings |
| **Ohne Telefon** | Zahl | Aufbaubereit, kein Booking, kein Termin, kein bookingStatus, kein Telefon | acquisition |

**BESONDERHEIT:** InviteManager zaehlt per unique Standort (akquise_airtable_id), NICHT per Booking-Zeile.
Wenn ein Standort 3 Mal eingeladen wurde (3 Booking-Rows), zaehlt er trotzdem nur 1× als "Eingeladen".

---

### F. TELEFON-WORKBENCH-QUEUES (Phone Workbench)

**Angezeigt in:** `InstallationPhoneWorkbench.jsx` (Install-Tool > Telefon-Tab)
**Datenquelle:** `acquisition` + `install_bookings`

| Queue | Beschreibung | Filter-Logik |
|-------|-------------|-------------|
| **Anruf-Queue** | Aufbaubereite die noch nie eingeladen wurden | `!isStorno && !isAlreadyInstalled && isReadyForInstall && contactPhone && !bookingByAkquise.has(id)` |
| **Keine Antwort** | Eingeladen >48h, keine Buchung | `status=pending && whatsapp_sent_at < (now - 48h) && contactPhone` |
| **Nachfass/Follow-Up** | 3 Gruppen zusammen: | |
| → Bestaetigung | Termin innerhalb 72h | `status=booked && booked_date innerhalb 72h && contactPhone` |
| → No-Show | Nicht erschienen | `status=no_show && contactPhone` |
| → Storniert | Termin abgesagt | `status=cancelled && contactPhone` |

**Schwellenwerte (aus OVERDUE_THRESHOLDS):**
- Keine Antwort: >48h (`PENDING_NO_RESPONSE_HOURS`)
- Bestaetigungsanruf: <72h vor Termin (`CONFIRMATION_CALL_WITHIN_HOURS`)

---

### G. AKQUISE-PIPELINE-KPIs

**Angezeigt in:** `AcquisitionDashboard.jsx` (Haupt-Dashboard > Akquise-Tab)
**Datenquelle:** `acquisition` (Supabase)

| KPI | Wert | Formel | Datenquelle |
|-----|------|--------|-------------|
| **Gesamt** | Zahl | `filtered.length` | acquisition |
| **Aktiv** | Zahl | `total - stornoTotal` | acquisition |
| **Storno Akquise** | Zahl | `akquiseStorno === true` | acquisition.akquise_storno |
| **Storno Post-Install** | Zahl | `postInstallStorno === true` | acquisition.post_install_storno |
| **Storno Gesamt** | Zahl | `isStorno(record)` (alle 3 Bedingungen) | acquisition |
| **Aufbaubereit** | Zahl | `isReadyForInstall && !isStorno && !isAlreadyInstalled` | acquisition |
| **Mit Vertrag** | Zahl | `vertragVorhanden && !isStorno` | acquisition |
| **Mit Genehmigung** | Zahl | `approvalStatus vorhanden && !isStorno` | acquisition |
| **Ø Alter (Tage)** | Zahl | `Summe(heute - acquisitionDate) / Anzahl` (nur non-Storno) | acquisition.acquisition_date |

**Konversions-Metriken (Funnel):**

| Metrik | Formel |
|--------|--------|
| Visit → Signed Rate | `successfulVisits / storeVisits × 100` |
| Signed → Approved Rate | `approved / signed × 100` |
| Akquise → Approved Rate | `approved / total × 100` |
| Approved → Installed Rate | `installed / approved × 100` |
| Overall Conversion | `installed / totalPipeline × 100` |
| Churn Rate | `cancelledPostInstall / (installed + cancelledPostInstall) × 100` |
| Benoetigte Akquisen/Woche | `ceil(WEEKLY_BUILD_TARGET / overallConversion)` (Target: 25/Woche) |

**Pro-Stadt-Metriken:**
- `signRate = signed / total × 100`
- `installRate = installed / total × 100`
- `churnRate = churn / (installed + churn) × 100`

---

### H. HARDWARE-KPIs

**Angezeigt in:** `HardwareDashboard.jsx` (Haupt-Dashboard > Hardware-Tab)
**Datenquelle:** `hardware_ops` + `hardware_sim` + `hardware_displays` + `chg_approvals`

| KPI | Wert | Quelle |
|-----|------|--------|
| **OPS Gesamt** | Zahl | hardware_ops |
| **Active** | Zahl | status = 'active' | hardware_ops.status |
| **Warehouse** | Zahl | status = 'prep/ warehouse' | hardware_ops.status |
| **Defect** | Zahl | status = 'defect' | hardware_ops.status |
| **Out for Installation** | Zahl | status = 'out for installation' | hardware_ops.status |
| **Test Device** | Zahl | status = 'test device' | hardware_ops.status |

**Abgeleiteter Hardware-Status (_hwStatus):**

| Status-Key | Bedeutung | Farbe |
|-----------|-----------|-------|
| live | Online, Display aktiv | Gruen |
| warehouse | Im Lager | Blau |
| installer | Beim Installateur | Orange |
| deinstalled | Deinstalliert | Grau |
| defect | Defekt | Rot |
| assigned | Display zugewiesen, noch nicht installiert | Cyan |

**Leasing-KPIs:**

| KPI | Formel | Quelle |
|-----|--------|--------|
| Monatliche Rate | `Summe(monthlyPrice)` | bank_leasing |
| Aktive Vertraege | `contractStatus === 'In Miete'` | bank_leasing |
| Zertifikate | `unique(rentalCertificate)` | bank_leasing |
| Matched OPS | `serialNumber in OPS-Set` | bank_leasing × hardware_ops |
| Unmatched OPS | `bank.length - matchedOps` | bank_leasing |

---

### I. PROGRAMMATIC-REVENUE-KPIs

**Angezeigt in:** `ProgrammaticDashboard.jsx` (Haupt-Dashboard > Programmatic-Tab)
**Datenquelle:** `vistar_venue_health` (Supabase, taeglich 03:00 UTC synchronisiert)

| KPI | Wert | Formel |
|-----|------|--------|
| **Impressions** | Zahl | `Summe(totalImpressions)` ueber alle Venues |
| **Spots** | Zahl | `Summe(totalSpots)` |
| **Revenue** | EUR | `Summe(totalRevenue)` |
| **Profit** | EUR | `Summe(totalProfit)` |
| **Ø eCPM** | EUR | `Mittelwert(avgECPM)` ueber Venues mit eCPM > 0 |
| **Aktive Venues** | Zahl | Venues mit `totalSpots > 0` |
| **Gesamt Venues** | Zahl | Alle Venues |

**Trend:** Vergleich mit dem vorherigen Zeitraum (gleiche Laenge). Delta wird als +/- angezeigt.

---

### J. ALLE STATUS-FARBCODES (Referenz)

#### Booking-Status (Install-Buchungssystem)

| Status | UI-Label | Hex-Farbe | Tailwind | Dot |
|--------|----------|-----------|----------|-----|
| `pending` | Eingeladen | #eab308 | bg-yellow-100 text-yellow-700 | bg-yellow-500 |
| `booked` | Eingebucht | #22c55e | bg-green-100 text-green-700 | bg-green-500 |
| `confirmed` | Eingebucht | #22c55e | bg-green-100 text-green-700 | bg-green-500 |
| `completed` | Abgeschlossen | #10b981 | bg-emerald-100 text-emerald-700 | bg-emerald-500 |
| `cancelled` | Storniert | #ef4444 | bg-red-100 text-red-700 | bg-red-500 |
| `no_show` | No-Show | #6b7280 | bg-gray-100 text-gray-700 | bg-gray-500 |

**Definiert in 3 Dateien (MUESSEN synchron bleiben):**
1. `src/metrics/constants.js` → `BOOKING_STATUS_CONFIG` (Hex + Label)
2. `src/utils/installUtils.js` → `STATUS_HEX` (Recharts), `STATUS_COLORS` (Tailwind), `STATUS_LABELS`
3. `src/components/InstallationBookingsDashboard.jsx` → `STATUS_CONFIG` (lokal, mit Icons + order)

#### Display-Online-Status (Haupt-Dashboard)

| Kategorie | Farbe (Hex) | Schwelle |
|-----------|------------|----------|
| online | #22c55e (gruen) | < 24h offline |
| warning | #f59e0b (amber) | 24h – 72h offline |
| critical | #ef4444 (rot) | 72h – 7 Tage offline |
| permanent_offline | #dc2626 (dunkelrot) | > 7 Tage offline |
| never_online | #64748b (grau) | Kein Heartbeat jemals |

**Definiert in:** `src/utils/dataProcessing.js` → `getStatusColor()` + `STATUS_THRESHOLDS`

#### Airtable Terminstatus → Booking-Status Mapping

| Airtable Terminstatus | → Booking Status | Mapping in |
|----------------------|------------------|-----------|
| Geplant | booked | mergeAirtableTermine() |
| Bestaetigt | confirmed | mergeAirtableTermine() |
| Durchgefuehrt | completed | mergeAirtableTermine() |
| Abgesagt | cancelled | mergeAirtableTermine() |
| Verschoben | pending | mergeAirtableTermine() |
| No-Show | no_show | mergeAirtableTermine() |
| (unbekannt) | booked + console.warn | mergeAirtableTermine() |

#### Akquise Lead-Status Werte

| Lead Status | Bedeutung |
|------------|-----------|
| Won / Signed | Vertrag unterschrieben |
| New Lead | Neuer Lead |
| Qualified | Qualifiziert |
| Contacted | Kontaktiert |
| Interested | Interessiert |
| In Progress | In Bearbeitung |
| Info Required | Info benoetigt |
| Unreachable | Nicht erreichbar |
| Disqualified | Disqualifiziert |
| Lost | Verloren |
| (+ Storno-Varianten) | Storniert |

#### Akquise Approval-Status Werte

| Approval Status | Bedeutung |
|----------------|-----------|
| Accepted / Approved | Genehmigt → aufbaubereit |
| In review | In Pruefung |
| Info required | Info benoetigt |
| not started / not tarted | Noch nicht begonnen (Typo!) |
| Rejected | Abgelehnt |

#### Installations-Status Werte (Airtable)

| Status | Bedeutung |
|--------|-----------|
| Installiert | Display installiert und live |
| Abgebrochen | Installation abgebrochen (zaehlt als "installiert" — nicht erneut einplanen!) |
| Geplant | Installation geplant |
| Nacharbeit erforderlich | Muss nachgebessert werden |
| Storniert | Installation storniert |

---

### K. SCHWELLENWERTE UND KONSTANTEN

| Konstante | Wert | Datei | Verwendung |
|-----------|------|-------|-----------|
| `OVERDUE_THRESHOLDS.PENDING_NO_RESPONSE_HOURS` | 48h | metrics/constants.js | Einladung ohne Antwort → ueberfaellig |
| `OVERDUE_THRESHOLDS.UNCONFIRMED_BEFORE_INSTALL_HOURS` | 24h | metrics/constants.js | (aktuell nicht aktiv genutzt) |
| `OVERDUE_THRESHOLDS.CONFIRMATION_CALL_WITHIN_HOURS` | 72h | metrics/constants.js | Nachfass-Anruf wenn Termin <72h |
| `WEEKLY_BUILD_TARGET` | 25 | metrics/constants.js | Installationen pro Woche Ziel |
| `STATUS_THRESHOLDS.ONLINE` | 24h | dataProcessing.js | Display online wenn <24h offline |
| `STATUS_THRESHOLDS.WARNING` | 72h | dataProcessing.js | Warnung ab 24h bis 72h |
| `STATUS_THRESHOLDS.PERMANENT_OFFLINE` | 168h | dataProcessing.js | Dauerhaft offline ab 7 Tagen |
| `OPERATING_HOURS.START` | 06:00 | dataProcessing.js | Health Rate nur 6-22 Uhr |
| `OPERATING_HOURS.END` | 22:00 | dataProcessing.js | Health Rate nur 6-22 Uhr |
| `CACHE_TTL` | 5 Min | airtableService.js | In-Memory Cache Lebensdauer |
| `PERSIST_TTL` | 10 Min | airtableService.js | localStorage Cache Lebensdauer |
| `SLOT_DURATION` | 90 Min | shared/slotUtils.js | Zeitfenster pro Termin |
| `BUFFER` | 30 Min | shared/slotUtils.js | Puffer zwischen Terminen |
| `WORK_START` | 09:00 | shared/slotUtils.js | Arbeitszeit-Beginn |
| `WORK_END` | 22:00 | shared/slotUtils.js | Arbeitszeit-Ende |

---

## PROJEKT-IDENTITAET

- **Repo:** `/Users/maximiliansimon/Desktop/Claude Workspace/Claude Code/JET Dashboard V2`
- **Live-URL:** `https://tools.dimension-outdoor.com`
- **Installations-Tool:** `https://tools.dimension-outdoor.com/install`
- **Buchungsseite (oeffentlich):** `https://tools.dimension-outdoor.com/book/<token>`
- **Monteur-Ansicht:** `https://tools.dimension-outdoor.com/monteur`
- **Hosting:** Netlify (Projekt: `jet-dashboard-v2`)
- **Datenbank:** Supabase (`hvgjdosdejnwkuyivnrq.supabase.co`)
- **Primaere Datenquelle:** Airtable (Base `apppFUWK829K6B3R2`) Sync alle 15 Min nach Supabase

---

## TECH-STACK

- **Frontend:** React 19 + Vite 7 + Tailwind CSS 4 + Recharts + Leaflet Maps + Lucide Icons
- **Backend:** 28 Netlify Serverless Functions (Node 20)
- **Auth:** Supabase Auth (JWT) + Custom RBAC (groups/permissions)
- **Datenbank:** Supabase PostgreSQL (25+ Tabellen, 5 Views, 12 RPC Functions)
- **Externe APIs:** Airtable, SuperChat (WhatsApp), Vistar SSP, Anthropic Claude, Make.com
- **Build:** `npm run build` dann `netlify deploy --prod --dir=dist`
- **WICHTIG:** NIEMALS `netlify deploy --prod --dir=.` — das deployed Source statt Build und zerstoert die Seite

---

## APP-ARCHITEKTUR — 4 EIGENSTAENDIGE SPAs

| SPA | Entry-Point | Route | Auth-Methode |
|-----|-------------|-------|-------------|
| **Haupt-Dashboard** | `index.html` > `src/main.jsx` > `App.jsx` | `/` | Supabase Login |
| **Installations-Tool** | `install.html` > `src/install-main.jsx` > `InstallApp.jsx` | `/install` | Supabase Login (eigene Session) |
| **Booking Page** | `booking/index.html` > `BookingPage.jsx` | `/book/<token>` | Token-basiert (oeffentlich) |
| **Monteur-Ansicht** | `index.html` > `MonteurView.jsx` | `/monteur` | Token-basiert (oeffentlich) |

Vite baut 4 separate Entry-Points (Multi-Page App). Routing innerhalb jeder SPA ist client-seitig.

---

## VERZEICHNISSTRUKTUR

```
src/
  main.jsx                         # Haupt-App Entry
  install-main.jsx                 # Install-Tool Entry
  App.jsx                          # Dashboard-Shell (Sidebar, Auth, Routing)
  InstallApp.jsx                   # Install-Tool-Shell (eigene Auth, Routing)
  index.css                        # Tailwind + globale Styles

  components/                      # 61 React-Komponenten
    # Dashboard-Kern
    KPICards.jsx                   # KPI-Kacheln (Hauptuebersicht)
    DisplayTable.jsx               # Display-Liste mit Filtern
    DisplayDetail.jsx              # Einzelstandort-Detail (groesste Datei)
    DisplayMap.jsx                 # Leaflet-Karte aller Displays
    TaskDashboard.jsx              # Aufgaben-Verwaltung
    CommunicationDashboard.jsx     # E-Mail/WhatsApp/SMS-Verlauf
    AdminPanel.jsx                 # Benutzer + Gruppen + Audit-Log + API
    ChatAssistant.jsx              # Claude AI Chat
    ProgrammaticDashboard.jsx      # Vistar SSP Revenue
    AcquisitionDashboard.jsx       # Akquise-Pipeline
    HardwareDashboard.jsx          # Hardware-Inventar
    DataQualityDashboard.jsx       # Datenqualitaet

    # Installations-System (7 Sub-Tabs)
    InstallationsDashboard.jsx     # Container mit Tab-Navigation
    InstallationExecutiveDashboard.jsx  # KPIs, Funnel, Konversion
    InstallationReadyLocations.jsx      # Aufbaubereite Standorte
    InstallationBookingsDashboard.jsx   # Buchungen verwalten
    InstallationPhoneWorkbench.jsx      # Telefon-Nachfassaktionen
    InstallationInviteManager.jsx       # WhatsApp-Einladungen
    InstallationMapView.jsx             # Karten-Ansicht
    InstallationCalendar.jsx            # Wochen-Kalender
    InstallationTeamDashboard.jsx       # Team-Tagesplan
    MonteurManagement.jsx               # Monteur-Zugaenge verwalten

    # Hardware-Subsystem
    QRHardwareScanner.jsx          # QR-Code Scanner
    HardwareLifecyclePanel.jsx     # Wareneingang, QR-Codes, Positionen
    HardwareComponentDetail.jsx    # Komponenten-Detail
    HardwareSwapModal.jsx          # Tausch-Dialog
    BestellwesenTab.jsx            # Bestellungen
    LagerVersandTab.jsx            # Lager & Versand

    # Mobile
    MobileDashboard.jsx            # Mobile Hauptansicht
    MobileDisplayCards.jsx         # Mobile Display-Karten
    MobileActivityFeed.jsx         # Mobile Aktivitaets-Feed
    MobileBottomNav.jsx            # Mobile Navigation

    # Weitere
    UnifiedStandortDetail.jsx      # Standort-Detail (shared)
    SuperChatHistory.jsx           # WhatsApp-Verlauf
    ActivityFeed.jsx               # Aktivitaets-Timeline
    ContactDirectory.jsx           # Kontakt-Verzeichnis
    CityDashboard.jsx              # Stadt-Statistiken
    FeedbackWidget.jsx             # Feedback/Bug-Reports
    DateRangePicker.jsx            # Datumsbereich
    ChangePasswordModal.jsx        # Passwort aendern
    ForcePasswordChangeModal.jsx   # Pflicht-Passwortaenderung
    SignaturePad.jsx               # Unterschrift
    DeinstallModal.jsx             # Deinstallations-Dialog
    StimmcheckModal.jsx            # Voice-Check
    APIOverviewPanel.jsx           # API-Status
    DataMappingPanel.jsx           # Data Dictionary
    NocoDBPanel.jsx                # NocoDB-Integration
    InstallationDataDictionary.jsx # Daten-Dokumentation

  pages/
    MonteurView.jsx                # Monteur-Tagesansicht (oeffentlich, Token-Auth)

  utils/
    authService.js                 # Supabase Auth + RBAC + Session-Management
    airtableService.js             # Airtable API Client + Cache (2652 Zeilen)
    installUtils.js                # Install-API-Endpoints + Formatierung + Merge
    dataProcessing.js              # KPI-Berechnungen fuer Haupt-Dashboard
    vistarService.js               # Vistar SSP API Client
    superchatService.js            # SuperChat (WhatsApp/SMS)
    attachmentResolver.js          # Foto/Attachment-Handling (Airtable > Supabase Storage)
    chatContext.js                 # Chat-Kontext-Builder fuer Claude
    voiceResponseProcessor.js      # Sprachverarbeitung

  hooks/
    useIsMobile.js                 # Mobile-Erkennung
    useChatEngine.js               # Chat-Engine Hook
    useSpeechRecognition.js        # Speech-to-Text
    useSpeechSynthesis.js          # Text-to-Speech
    useVoiceSettings.js            # Sprach-Einstellungen

  metrics/
    index.js                       # Re-Export aller Metriken
    predicates.js                  # isStorno, isReadyForInstall, isAlreadyInstalled, isPendingApproval
    constants.js                   # OVERDUE_THRESHOLDS, STATUS_THRESHOLDS, WEEKLY_BUILD_TARGET
    computations/
      installation.js              # computeBookingStatusCounts, computeConversionRate, computeNoShowRate

  constants/
    kpiFilters.js                  # KPI-Filter-Konstanten

booking/
  index.html                       # Booking-Page Entry
  main.jsx                         # Booking Entry-Point
  BookingPage.jsx                  # Oeffentliche Buchungsseite (DE/EN/TR)

scheduling/
  index.html                       # Scheduling Entry
  main.jsx                         # Entry-Point
  SchedulingApp.jsx                # Scheduling-Tool

netlify/functions/                 # 28 Serverless Functions (siehe unten)
  shared/                          # Shared Utilities
    airtableFields.js              # Airtable Feld-Mapping
    airtableMappers.js             # Daten-Transformer
    apiLogger.js                   # API-Logging
    attachmentHelper.js            # Attachment-Processing
    security.js                    # Rate-Limiting, CORS, Sanitization
    slotUtils.js                   # Zeitfenster-Berechnung
```

---

## HAUPT-DASHBOARD (App.jsx) — SIDEBAR-TABS

| Tab | Komponente | Beschreibung |
|-----|------------|-------------|
| Uebersicht | KPICards, DisplayTable, Charts | ~350 DOOH-Displays: Status, Heartbeats, KPIs |
| Standorte | DisplayDetail, DisplayMap | Einzelstandort-Details inkl. Karte |
| Aufgaben | TaskDashboard | Task-Management (Airtable-Backend) |
| Kommunikation | CommunicationDashboard | E-Mail/WhatsApp/SMS-Verlauf via SuperChat |
| Hardware | HardwareDashboard | OPS-Player, SIM, Display-Inventar, Wareneingang, QR-Codes |
| Akquise | AcquisitionDashboard | Vertriebspipeline, Lead-Status |
| Installationen | InstallationsDashboard | Gesamtes Install-Management (9 Sub-Tabs) |
| Programmatic | ProgrammaticDashboard | Vistar SSP Umsatzdaten |
| Admin | AdminPanel | Benutzer, Gruppen, Audit-Log, API, Data Mapping |
| Chat | ChatAssistant | Claude AI mit Dashboard-Kontext |

---

## INSTALLATIONS-TOOL (InstallApp.jsx) — SUB-TABS

| Kategorie | Tab-ID | Label | Komponente |
|-----------|--------|-------|------------|
| Uebersicht | executive | Dashboard | InstallationExecutiveDashboard |
| Uebersicht | ready | Aufbaubereit | InstallationReadyLocations |
| Terminierung | bookings | Buchungen | InstallationBookingsDashboard |
| Terminierung | phone | Telefon | InstallationPhoneWorkbench |
| Terminierung | invite | WA-Einladungen | InstallationInviteManager |
| Terminierung | map | Karte | InstallationMapView |
| Terminierung | calendar | Kalender | InstallationCalendar |
| Terminierung | teamplan | Team-Tagesplan | InstallationTeamDashboard |
| Terminierung | monteure | Monteur-Zugaenge | MonteurManagement |
| Admin (adminOnly) | users | Benutzer | AdminPanel |
| Admin (adminOnly) | data | Data Dictionary | InstallationDataDictionary |

Tab-Navigation definiert in `MENU_CATEGORIES` Array in InstallationsDashboard.jsx. Admin-Kategorie hat `adminOnly: true`.

---

## MONTEUR-ANSICHT (MonteurView.jsx)

Mobile-optimierte Tagesansicht fuer Installations-Monteure:
- **Token-basierter Zugang:** Link mit `?token=...&team=...` (HMAC-SHA256)
- **Persistent Login:** Supabase Auth als Alternative (localStorage `monteur_auth`)
- **Tages-Route:** Standorte mit Adressen, Kontaktdaten, Zeitfenstern
- **Quick Actions:** Route (Google Maps), Anrufen (tel:)
- **WhatsApp-Status-Buttons:** "Auf dem Weg", "Verspaetung", "Verschiebung", "Absage"
- **Bildergalerie:** Fotos pro Standort aus Supabase Storage
- **Wochenkalender:** Navigation zwischen Tagen
- **Erledigte Standorte:** Ausgegraut, ans Ende sortiert, ohne Action-Buttons
- **Datums-Fix:** Verwendet `localDateStr()` statt `toISOString()` (UTC-Bug behoben)

---

## BUCHUNGSSYSTEM — VOLLSTAENDIGER FLOW

```
1. Manager waehlt Standorte > InstallationInviteManager
2. WhatsApp-Template "InstallDate2" wird gesendet (SuperChat API)
   Template ID: tn_Cs5DK5Qa515O4GpAsDvWo (approved)
3. Kunde klickt Link > /book/<token> (BookingPage.jsx)
   - 3 Sprachen: DE, EN, TR
   - Lieferando-Branding
4. Zeitfenster werden geladen (install-booker-slots.js)
   - Basiert auf install_routen (Stadt + Datum + Team)
   - Zeitfenster: morning (09-12), afternoon (12-16), evening (16-22)
   - 90 Min pro Termin + 30 Min Buffer
5. Kunde waehlt Termin > install-booker-book.js
   a) Supabase: install_bookings UPDATE (status: confirmed, booked_date/time)
   b) Airtable: Installationstermin-Record erstellt in Tabelle tblZrFRRg3iKxlXFJ
   c) Airtable: Akquise-Record Update (Lead_Status > "Won / Signed")
   d) WhatsApp: Bestaetigungs-Nachricht via SuperChat
   e) Make.com: Webhook > E-Mail/Slack-Benachrichtigung
   f) Optional: Slack direkte Integration (SLACK_INSTALL_WEBHOOK)
6. Automatische Erinnerung (@hourly via install-booker-reminder.js)
   - Nach 22h ohne Buchung
   - Template ID: tn_d3S5yQ0A18EQ9mulWgNUb (approved)
   - Feature Flag: install_reminder_enabled = true
7. Am Installationstag: Monteur nutzt MonteurView
   - "Auf dem Weg": Template tn_zzfvOxMPZiB3wpwAxC9hD (approved)
   - "Verspaetung", "Verschiebung", "Absage": Klartext-WhatsApp
```

---

## AUTH-SYSTEM (authService.js)

### Session-Management
- **Storage:** localStorage (`dooh_user` + `dooh_session_ts`)
- **Timeout:** 8 Stunden Inaktivitaet
- **Recovery:** `recoverSession()` prueft Supabase JWT und stellt Session wieder her
- **Migration:** Automatische Migration von altem `sessionStorage` zu `localStorage`
- **Install-Tool:** Eigene Session (`install_tool_user` + `install_tool_session_ts`)

### Rollen-System
| Gruppe | Role-String | Beschreibung |
|--------|------------|-------------|
| grp_admin | admin | Vollzugriff auf alle Tabs/Actions |
| grp_operations | manager | Display-Management + Tasks |
| grp_sales | manager | Uebersicht + Kommunikation |
| grp_scheduling | manager | Terminierung (Installationen) |
| grp_partner | manager | Hardware/Logistik Partner |
| grp_monteur | monteur | Monteur-Tagesroute + Status |
| grp_management | manager | Berichte |
| grp_tech | manager | Technische Tasks |

### Permissions
- `hasPermission(action)` — prueft gegen `group.actions[]`
- `canAccessTab(tabId)` — prueft gegen `group.tabs[]`
- Admin hat immer vollen Zugriff

### Passwort-Policy
- Min 8 Zeichen, Staerke-Score >= 2
- 90-Tage-Ablauf
- Letzte 5 Passwoerter geprueft (via Netlify Function)
- `mustChangePassword` Flag bei Erstlogin
- Standard-Passwort: `***REMOVED_DEFAULT_PW***`

### Key Exports
```javascript
// Auth
login(email, password), logout(), changePassword(old, new)
requestPasswordReset(email), recoverSession()

// Session
getCurrentUser(), isAuthenticated(), isAdmin()
touchSession(), getSessionRemainingMs()
needsPasswordChange(), getPasswordChangeReason()

// Permissions
getCurrentGroup(), hasPermission(action), canAccessTab(tabId)
getVisibleTabs(), getAllowedActions()

// User Management (via Netlify Function /api/users/*)
fetchAllUsers(), getAllUsers()
addUser({name, email, groupId, password, installerTeam})
updateUserGroup(userId, newGroupId), resetUserPassword(userId)
deleteUser(userId)

// Groups
fetchGroups(), getAllGroups(), getGroupWithMembers(groupId)

// Audit
writeAuditEntry(action, detail, userId, userName)
auditLog(action, detail), getAuditLog(limit)

// Supabase Client
supabase  // Exportierter Client fuer direkte Queries
```

---

## DATEN-ARCHITEKTUR — VOLLSTAENDIGE SYNC-DOKUMENTATION

### Uebersicht Datenfluss
```
┌─────────────────────────────────────────────────────────────────┐
│                    DATENQUELLEN (Extern)                         │
├──────────────────┬──────────────────┬──────────────────┬────────┤
│  Airtable        │  Google Sheets   │  Vistar SSP      │ Super- │
│  13 Tabellen     │  Heartbeat CSV   │  Revenue API     │ Chat   │
│  (Source of      │  (Navori Status) │  (taeglich)      │ (on-   │
│   Truth)         │                  │                  │ demand)│
└──────┬───────────┴────────┬─────────┴──────┬───────────┴────────┘
       │                    │                │
       │ sync-airtable.js   │ sync-airtable  │ vistar-sync.js
       │ (*/15 * * * *)     │ .js (CSV-Teil) │ (03:00 UTC taegl.)
       │                    │                │
       v                    v                v
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Read Cache)                         │
│  25+ Tabellen · 5 Views · 12 RPC Functions                      │
│  PostgreSQL + Storage (Attachments) + Auth (JWT)                 │
└──────┬──────────────────────────────────────────┬───────────────┘
       │ Lesen: direkt via                        │ Schreiben:
       │ Supabase Anon Key                        │ via Netlify
       │ (0 Function Calls!)                      │ Functions
       v                                          v
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                              │
│  airtableService.js: In-Memory Cache (5min) + localStorage      │
│  (10min) + Request-Deduplication                                 │
│  Schreibt via: /api/airtable/* → Airtable API (Source of Truth) │
└─────────────────────────────────────────────────────────────────┘
```

---

### SYNC 1: Airtable → Supabase (`sync-airtable.js`)

**Schedule:** `*/15 * * * *` (alle 15 Minuten via Netlify Scheduled Function)
**Manueller Trigger:** `GET /api/sync` mit Header `x-sync-key: {SYNC_SECRET}`
**Datei:** `netlify/functions/sync-airtable.js`

#### Ablauf im Detail:

```
1. Health-Check: Pruefe ob sync_metadata Tabelle erreichbar ist
   → Wenn nicht: FULL SYNC fuer alle Tabellen (kein inkrementeller Sync moeglich)

2. Letzte Sync-Timestamps laden aus sync_metadata
   → Pro Tabelle: wann wurde zuletzt synchronisiert?

3. FORCE FULL SYNC fuer Tabellen mit Lookup-Fields
   → acquisition, stammdaten, installationen
   → Grund: Airtable Lookup/Rollup-Fields aktualisieren LAST_MODIFIED_TIME() NICHT
     wenn der verlinkte Record sich aendert!
   → Fix: Alle 55 Minuten (ca. jeder 4. Lauf) wird fuer diese 3 Tabellen
     ein kompletter Sync erzwungen (lastSync[table] = null)
   → WICHTIG: Ohne diesen Fix werden z.B. installationsStatus-Aenderungen
     bis zu 15 Stunden nicht erkannt!

4. Google Sheets → display_heartbeats (append-only)
   → CSV von Navori Heartbeat Sheet laden
   → Zeitstempel parsen (DD.MM.YYYY HH:MM → ISO)
   → Nur NEUE Zeilen einfuegen (nach letztem Sync-Timestamp)
   → Insert mit ON CONFLICT DO NOTHING (keine Duplikate)
   → display_id wird normalisiert: "D-1234/Main" → "D-1234" (vor dem Slash)

5. Airtable-Tabellen sequentiell synchronisieren:
   → Inkrementell: filterByFormula LAST_MODIFIED_TIME()>'sinceISO'
   → Oder Full: alle Records laden wenn kein Timestamp vorhanden
```

#### Synchronisierte Tabellen (Reihenfolge):

| # | Airtable-Tabelle | Table-ID | → Supabase-Tabelle | Mapper |
|---|------------------|----------|-------------------|--------|
| 1 | Heartbeats (CSV) | Google Sheet | display_heartbeats | Inline (CSV-Parser) |
| 2 | JET Stammdaten | tblLJ1S7OUhc2w5Jw | stammdaten | mapStammdaten |
| 3 | Live Display Locations | tblS6cWN7uEhZHcie | airtable_displays | mapDisplay |
| 4 | Tasks | tblcKHWJg77mgIQ9l | tasks | mapTask |
| 5 | Acquisition_DB | tblqFMBAeKQ1NbSI8 | acquisition | mapAcquisition |
| 6 | Dayn Screens | 'Dayn Screens' | dayn_screens | mapDaynScreen |
| 7 | Installationen | tblKznpAOAMvEfX8u | installationen | mapInstallation |
| 8 | OPS Player Inventory | tbl7szvfLUjsUvMkH | hardware_ops | mapOpsInventory |
| 9 | SIM Card Inventory | tblaV4UQX6hhcSDAj | hardware_sim | mapSimInventory |
| 10 | Display Inventory | tblaMScl3j45Q4Dtc | hardware_displays | mapDisplayInventory |
| 11 | CHG Approval | tblvj4qjJpBVLbY7F | chg_approvals | mapChgApproval |
| 12 | Hardware Swap | tblzFHk0HhB4bNYJ4 | hardware_swaps | mapHardwareSwap |
| 13 | Deinstallationen | tbltdxgzDeNz9d0ZC | hardware_deinstalls | mapDeinstall |
| 14 | Activity Log | tblDk1dl4J3Ow3Qde | communications | mapCommunication |
| 15 | Installationstermine | tblZrFRRg3iKxlXFJ | installationstermine | mapInstallationstermin |

#### Post-Processing nach Sync:

```
→ RPC: enrich_installationen_jet_id
  Airtable liefert Record-IDs statt numerische JET-IDs in Lookup-Fields.
  Diese RPC-Funktion resolved die IDs via JOIN mit acquisition.

→ RPC: enrich_installationstermine_jet_id
  Gleiche Logik fuer Installationstermine.
```

#### Upsert-Mechanismus:

- Batches von 500 Records
- POST mit `Prefer: resolution=merge-duplicates` (Upsert)
- Automatisches Stripping von unbekannten Spalten bei Schema-Mismatch
  (bis zu 3 Retries pro Batch mit Spalten-Erkennung aus Fehlermeldung)
- Bei Full Sync: Orphan-Detection — loescht Supabase-Records deren
  airtable_id nicht mehr in Airtable existiert

#### sync_metadata Tabelle:

Speichert pro Tabelle den letzten Sync-Status:

| Feld | Zweck |
|------|-------|
| table_name | PK — Supabase-Tabellenname |
| last_sync_timestamp | Wann zuletzt synchronisiert |
| records_fetched | Anzahl geholte Records |
| records_upserted | Anzahl geschriebene Records |
| last_sync_status | 'success' oder 'error' |
| updated_at | Timestamp |

---

### SYNC 2: Attachment-Sync → Supabase Storage

**Problem:** Airtable-Attachment-URLs (Fotos, PDFs) expiren nach ~2 Stunden.
Das Frontend muss permanente URLs verwenden.

**Loesung:** Dateien werden von Airtable heruntergeladen und in Supabase Storage hochgeladen.
Die permanenten URLs werden in der `attachment_cache` Tabelle gespeichert.

#### 2a. Automatischer Attachment-Sync (`sync-attachments-scheduled.js`)

**Schedule:** `*/15 * * * *` (alle 15 Minuten)
**Datei:** `netlify/functions/sync-attachments-scheduled.js`

```
Ablauf:
1. Lade alle bereits gecachten Keys aus attachment_cache
   → Set von "recordId|fieldName|filename" Strings
2. Lade ALLE acquisition-Records aus Supabase (NICHT Airtable!)
   → Liest images, vertrag_pdf, faw_data_attachment JSONB-Spalten
   → Kein Airtable-API-Call noetig! Die URLs stehen bereits im JSONB
3. Vergleiche: welche Attachments fehlen noch im Cache?
4. Lade fehlende Dateien herunter und uploade zu Supabase Storage
   → 8 parallele Downloads gleichzeitig (PARALLEL_CONCURRENCY)
   → 5 Minuten Zeitbudget (MAX_PROCESSING_TIME_MS)
   → ~100-200 Dateien pro Aufruf
   → Alle ~5000 Dateien in 3-6 Stunden komplett gecacht
5. Schreibe Cache-Eintrag in attachment_cache
6. Logge Ergebnis in attachment_sync_log
```

**WICHTIG:** Die Airtable-URLs in den JSONB-Spalten koennen bereits expired sein
(wenn der letzte Daten-Sync >2h her ist). In diesem Fall schlaegt der Download fehl
und die Datei wird beim naechsten Lauf erneut versucht (nach dem naechsten Daten-Sync
hat Airtable frische URLs geliefert).

#### 2b. Manueller Attachment-Sync (`sync-attachments.js`)

**Route:** `GET /api/sync-attachments`
**Datei:** `netlify/functions/sync-attachments.js`

3 Modi:

| Modus | URL-Parameter | Beschreibung |
|-------|--------------|-------------|
| `mode=ready` | Schnellster Modus | Nur aufbaubereite Records (~47 Stueck). Record-IDs aus Supabase, frische URLs von Airtable API |
| `mode=supabase` | Kein Airtable-API | Alle Records. URLs aus Supabase JSONB (koennen expired sein!) |
| Legacy (default) | Langsamster Modus | Alle Records direkt von Airtable API laden |

Weitere Parameter:
- `table=acquisition|tasks` — Nur bestimmte Tabelle
- `limit=50` — Max. Attachments pro Aufruf
- `chain=true` — Auto-Trigger naechsten Batch wenn noch Arbeit uebrig

#### Attachment-Typen die synchronisiert werden:

| Quelle | Airtable-Feld | Storage-Pfad | Supabase-JSONB-Spalte |
|--------|--------------|-------------|----------------------|
| Akquise-Fotos | images_akquise | acquisition/{recordId}/images_akquise/{file} | acquisition.images |
| Vertrag-PDFs | Vertrag (PDF) | acquisition/{recordId}/vertrag_pdf/{file} | acquisition.vertrag_pdf |
| FAW-Daten | FAW_data_attachment | acquisition/{recordId}/faw_data_attachment/{file} | acquisition.faw_data_attachment |
| Install-Protokoll | Installationsprotokoll | installationen/{recordId}/installationsprotokoll/{file} | (nicht in JSONB) |
| Task-Anhaenge | Attachments | tasks/{recordId}/attachments/{file} | tasks.attachments |

#### attachment_cache Tabelle:

| Feld | Zweck |
|------|-------|
| airtable_record_id | Airtable Record-ID |
| airtable_table | 'acquisition', 'tasks', etc. |
| airtable_field | Feldname (z.B. 'images_akquise') |
| original_filename | Originaler Dateiname |
| original_url | Airtable-URL (expired nach ~2h) |
| storage_path | Pfad in Supabase Storage |
| public_url | Permanente oeffentliche URL |
| file_size | Dateigroesse in Bytes |
| mime_type | MIME-Type |

**Unique Constraint:** `(airtable_record_id, airtable_field, original_filename)`

#### Frontend Attachment-Resolution (`attachmentResolver.js`):

```javascript
// So werden Attachments im Frontend aufgeloest:
import { resolveRecordImages } from '../utils/attachmentResolver';

// Fuer ein einzelnes Record:
const images = await resolveRecordImages(recordId, airtableImages);
// → Ersetzt expired Airtable-URLs durch permanente Supabase-URLs
// → Aktualisiert auch Thumbnails (large, full, small)
// → 30 Min In-Memory-Cache (Supabase-URLs expiren nie)

// Batch fuer mehrere Records gleichzeitig:
const resolved = await batchResolveImages(records);
// → Ein einziger Supabase-Query statt N einzelne
```

**REGEL:** Im Frontend NIEMALS direkte Airtable-Attachment-URLs in `<img src>` verwenden!
IMMER `resolveRecordImages()` oder `resolveImageUrl()` nutzen.

---

### SYNC 3: Google Sheets Heartbeats

**Eingebettet in:** `sync-airtable.js` (erster Schritt)
**Quelle:** Google Sheets CSV via `/gviz/tq?tqx=out:csv` (LIVE-Daten, kein Export-Cache!)
**Ziel:** `display_heartbeats` Tabelle (append-only)

```
Google Sheets → CSV → display_heartbeats
  ↓
Felder die extrahiert werden:
  - display_id (normalisiert: vor dem "/" abgeschnitten)
  - timestamp + timestamp_parsed (ISO)
  - location_name, serial_number
  - heartbeat (Status), is_alive, display_status
  - last_online_date, days_offline
```

**Inkrementell:** Nur Zeilen nach dem letzten Sync-Timestamp werden eingefuegt.
**Insert-Modus:** `Prefer: resolution=ignore-duplicates` (ON CONFLICT DO NOTHING)

**WICHTIG:** Die Sheet-URL verwendet `/gviz/tq` statt `/export?format=csv`!
Der Export-Endpoint liefert gecachte Daten die bis zu 30 Min veraltet sein koennen.
`/gviz/tq` liefert immer LIVE-Daten.

---

### SYNC 4: Vistar SSP Revenue

**Schedule:** Taeglich 03:00 UTC
**Datei:** `netlify/functions/vistar-sync.js`
**Ziel:** `vistar_venue_health` (~170.000 Rows)

Loggt sich bei Vistar SSP ein und holt Revenue-Daten pro Venue/Tag.

---

### SYNC 5: NocoDB

**Trigger:** Manuell via `GET /api/sync-nocodb`
**Datei:** `netlify/functions/sync-nocodb.js`
**Ziel:** `nocodb_vorbereitet`, `nocodb_sim_kunden`

Synchronisiert Hardware-Vorbereitungsdaten aus NocoDB (korrekte SIM-IDs, Venue-IDs).
Wird benoetigt weil Airtable SIM-ICCIDs (19 Stellen) als Number speichert und
Precision verliert (letzte Stellen werden abgeschnitten).

---

### Frontend Cache-Strategie (airtableService.js)

Das Frontend hat ein 3-stufiges Cache-System:

```
Stufe 1: In-Memory Cache (5 Min TTL)
  → JavaScript Map-Objekte
  → Schnellster Zugriff (0ms)
  → Geht bei Tab-Reload verloren

Stufe 2: localStorage Cache (10 Min TTL)
  → Key: jet_cache_${key}
  → Format: { data, ts }
  → Ueberlebt Tab-Reload
  → Sofortige Anzeige von gecachten Daten bei Seitenaufruf
  → Quota-Fehler werden ignoriert (try/catch)

Stufe 3: Supabase Direct Fetch
  → Frische Daten direkt aus Supabase
  → Kein Netlify Function Call noetig (Anon Key direkt)
  → Ausnahme: >5000 Records via /api/supabase-proxy (Service Role)
```

#### Request-Deduplication:

```javascript
// _inflight Map verhindert parallele identische Requests
// Wenn fetchAllAcquisition() 3x gleichzeitig aufgerufen wird,
// wird nur 1 Supabase-Query gemacht. Alle 3 Calls erhalten das gleiche Ergebnis.
```

#### Cache invalidieren (nach Schreiboperationen):

```javascript
import { invalidateCache } from '../utils/airtableService';
invalidateCache('allAcquisition');  // Loescht In-Memory + localStorage
```

---

### Airtable Feld-Mapping (WICHTIGE QUIRKS!)

Die Datei `netlify/functions/shared/airtableFields.js` ist die zentrale Referenz.

**⚠️ Bekannte Airtable-Feld-Quirks:**

| Problem | Beispiel | Wo |
|---------|---------|-----|
| Trailing Space | `'Online Status '` (mit Leerzeichen am Ende!) | DISPLAY_FIELDS.ONLINE_STATUS |
| Double Space | `'Lead Status  (from Akquise)'` (2 Leerzeichen!) | STAMMDATEN_FIELDS.LEAD_STATUS_LOOKUP |
| Unicode Non-Breaking Hyphen | `'Post\u2011Install Storno'` (U+2011 statt -) | ACQUISITION_FIELDS.POST_INSTALL_STORNO |
| Typo im Feldnamen | `'external_visiblity'` (fehlendes 'i') | TASK_FIELDS.EXTERNAL_VISIBILITY |
| Typo im Feldnamen | `'Longtitude'` statt Longitude | Einige Tabellen |
| Typo im Feldnamen | `'Maximun video spot lenth'` | DAYN_FIELDS.MAX_VIDEO_LENGTH |
| Typo im Datenwert | `'not tarted'` statt 'not started' | approval_status Werte |
| Checkbox als String | `'checked'` statt boolean true | ready_for_installation |
| SIM-ID Precision Loss | 19-stellige ICCIDs als Number → letzte Stellen verloren | hardware_sim |

**NIEMALS** Airtable-Feldnamen aus dem Kopf eintippen — IMMER aus airtableFields.js importieren!

---

### Airtable Mapper (`airtableMappers.js`)

Jede Airtable-Tabelle hat eine Mapper-Funktion die Airtable-Records in
Supabase-kompatible Objekte transformiert:

```javascript
// Beispiel: mapAcquisition(record)
// Input:  { id: 'recXYZ', fields: { 'Lead_Status': 'Won / Signed', ... } }
// Output: { airtable_id: 'recXYZ', lead_status: 'Won / Signed', ... }
```

Die Mapper:
- Renamen Felder von Airtable-CamelCase zu Supabase-snake_case
- Unwrappen Lookup-Arrays (erste Element extrahieren)
- Konvertieren Attachment-Arrays in JSONB
- Setzen `airtable_id` als Primary Key (fuer Upsert-ON-CONFLICT)

| Mapper | Von | Nach |
|--------|-----|------|
| mapStammdaten | JET Stammdaten | stammdaten |
| mapDisplay | Live Display Locations | airtable_displays |
| mapTask | Tasks | tasks |
| mapAcquisition | Acquisition_DB | acquisition |
| mapDaynScreen | Dayn Screens | dayn_screens |
| mapInstallation | Installationen | installationen |
| mapOpsInventory | OPS Player Inventory | hardware_ops |
| mapSimInventory | SIM Card Inventory | hardware_sim |
| mapDisplayInventory | Display Inventory | hardware_displays |
| mapChgApproval | CHG Approval | chg_approvals |
| mapHardwareSwap | Hardware Swap | hardware_swaps |
| mapDeinstall | Deinstallationen | hardware_deinstalls |
| mapCommunication | Activity Log | communications |
| mapInstallationstermin | Installationstermine | installationstermine |

---

### Wann welche Daten frisch sind (Timing-Uebersicht)

| Datenart | Aktualisierung | Max. Verzoegerung | Quelle → Ziel |
|----------|---------------|-------------------|---------------|
| Akquise-Status | Alle 15 Min (inkr.) + stuendlich (full) | 15 Min (normal), 55 Min (Lookup-Fields) | Airtable → Supabase |
| Stammdaten | Alle 15 Min (inkr.) + stuendlich (full) | 55 Min (wegen Lookups) | Airtable → Supabase |
| Installationen | Alle 15 Min (inkr.) + stuendlich (full) | 55 Min (wegen Lookups) | Airtable → Supabase |
| Tasks | Alle 15 Min (inkrementell) | 15 Min | Airtable → Supabase |
| Display-Heartbeats | Alle 15 Min (append-only) | 15 Min | Google Sheets → Supabase |
| Fotos/PDFs | Alle 15 Min (Attachment-Sync) | 3-6h (fuer alle ~5000) | Airtable Storage → Supabase Storage |
| Buchungen (install_bookings) | Sofort (direkte Supabase-Writes) | 0 | Frontend → Supabase (kein Sync) |
| Routen (install_routen) | Sofort (direkte Supabase-Writes) | 0 | Frontend → Supabase (kein Sync) |
| Revenue (Vistar) | Taeglich 03:00 UTC | 24h | Vistar API → Supabase |
| WhatsApp-Nachrichten | On-Demand | sofort | SuperChat API (Proxy) |
| NocoDB Hardware-Prep | Manuell | manuell | NocoDB → Supabase |

### Airtable-Tabellen (vollstaendig)

| Tabelle | Table-ID | → Supabase-Tabelle | Zweck |
|---------|----------|-------------------|-------|
| JET Stammdaten | tblLJ1S7OUhc2w5Jw | stammdaten | Display-Standort-Stammdaten |
| Live Display Locations | tblS6cWN7uEhZHcie | airtable_displays | Display-Metadaten, Online-Status |
| Tasks | tblcKHWJg77mgIQ9l | tasks | Aufgaben-Management |
| Acquisition_DB | tblqFMBAeKQ1NbSI8 | acquisition | Akquise/Vertriebspipeline (~1500+ Records) |
| Installationen | tblKznpAOAMvEfX8u | installationen | Installations-Records |
| Installationstermine | tblZrFRRg3iKxlXFJ | installationstermine | Installationstermine (separat von Installationen!) |
| Dayn Screens | 'Dayn Screens' | dayn_screens | Programmatic-Screen-Daten |
| Activity Log | tblDk1dl4J3Ow3Qde | communications | E-Mail/WhatsApp/SMS-Log |
| OPS Player Inventory | tbl7szvfLUjsUvMkH | hardware_ops | OPS-Media-Player |
| SIM Card Inventory | tblaV4UQX6hhcSDAj | hardware_sim | SIM-Karten |
| Display Inventory | tblaMScl3j45Q4Dtc | hardware_displays | Display-Hardware |
| CHG Approval | tblvj4qjJpBVLbY7F | chg_approvals | Leasing-Genehmigungen |
| Hardware Swap | tblzFHk0HhB4bNYJ4 | hardware_swaps | Hardware-Tausch-Records |
| Deinstallationen | tbltdxgzDeNz9d0ZC | hardware_deinstalls | Deinstallations-Records |
| Partners | Partners | (nicht synchronisiert) | Partner-Firmen (nur via Proxy gelesen) |

**Airtable Base ID:** `apppFUWK829K6B3R2`

---

## SUPABASE-TABELLEN (25+)

### Kern-Tabellen
| Tabelle | Zweck | Key Fields |
|---------|-------|-----------|
| app_users | Benutzerprofile | auth_id, group_id, installer_team, active |
| groups | Rollen/Permissions | tabs[], actions[], color, icon |
| audit_log | DSGVO Activity Log | action, detail, user_id, created_at |
| feature_flags | Feature Flags | key (PK), enabled, description |

### Akquise & Installationen
| Tabelle | Zweck | Key Fields |
|---------|-------|-----------|
| acquisition | Akquise-Pipeline (~1500+ Records) | lead_status, approval_status, vertrag_vorhanden, city, contact_* |
| stammdaten | Display-Standort-Stammdaten | jet_id, display_ids[], location_name |
| airtable_displays | Display-Metadaten | display_id, online_status, live_since |
| installationen | Installations-Records | display_ids[], install_date, status, technicians[] |
| installationstermine | Installationstermine | terminstatus, installationsdatum, akquise_links[] |

### Buchungssystem
| Tabelle | Zweck | Key Fields |
|---------|-------|-----------|
| install_bookings | Buchungen (24 total, 13 pending, 11 gebucht) | booking_token, status, booked_date/time, akquise_airtable_id |
| install_routen | Routen/Zeitfenster | city, schedule_date, installer_team, time_slots JSONB, max_capacity |
| install_teams | Team-Verwaltung | name, color, is_active, members JSONB |

### Hardware
| Tabelle | Zweck | Key Fields |
|---------|-------|-----------|
| hardware_ops | OPS-Player | ops_nr, ops_sn, sim_id, display_location_id |
| hardware_sim | SIM-Karten | sim_id (ICCID), activate_date |
| hardware_displays | Displays | display_serial_number, location |
| hardware_swaps | Tausch-Records | swap_type[], old/new_hardware_ids[] |
| hardware_deinstalls | Deinstallationen | reason, hardware_condition |
| chg_approvals | CHG Leasing | asset_id, display_sn, rental_start/end |
| bank_leasing | Bank TESMA Leasing | asset_id, serial_number, monthly_price |

### Warehouse/Logistik
| Tabelle | Zweck |
|---------|-------|
| purchase_orders + purchase_order_items | Bestellwesen |
| shipping_orders + shipping_order_items | Versandauftraege |
| return_orders + return_order_items | Ruecksendungen/RMA |
| warehouse_locations | Lagerplaetze |
| goods_receipts | Wareneingang |
| hardware_qr_codes | QR-Code Registry |
| hardware_positions | Positions-Tracking |
| stock_alerts | Mindestbestand-Warnungen |

### NocoDB & Externe Daten
| Tabelle | Zweck |
|---------|-------|
| nocodb_vorbereitet | Hardware-Vorbereitung (korrekte SIM-IDs, Venue-IDs) |
| nocodb_sim_kunden | SIM-Kunden-Mapping |
| attachment_cache | Permanente Supabase Storage URLs |
| vistar_venue_health | Vistar SSP Revenue (~170K Rows) |
| communications | Kommunikations-Log |
| tasks | Aufgaben |
| sync_metadata | Sync-Status pro Tabelle |
| api_usage_log | API-Aufruf-Logging |

### RPC Functions
| Function | Zweck |
|----------|-------|
| get_kpi_summary(days_back) | Dashboard-KPIs aus Heartbeats |
| get_mobile_kpis() | Mobile-optimierte KPIs |
| get_stock_summary() | Lagerbestand-Aggregation |
| pick_for_shipping(order_id, sn, user) | Kommissionierung |
| receive_po_item(po_id, item_id, qty, sns, user) | Wareneingang |
| generate_po_number() | PO-Nummer generieren |
| generate_shipping_id() | Versand-ID generieren |
| generate_return_id() | RMA-ID generieren |
| generate_receipt_id() | Wareneingang-ID generieren |
| generate_qr_code(prefix) | Einzel-QR-Code |
| generate_qr_codes_bulk(count, prefix, batch) | Bulk QR-Codes |
| update_hardware_position(...) | Position aktualisieren |

---

## NETLIFY FUNCTIONS (28)

### Scheduled Functions
| Function | Schedule | Zweck |
|----------|----------|-------|
| sync-airtable.js | */15 * * * * | Airtable > Supabase (inkrementell) |
| sync-attachments-scheduled.js | */15 * * * * | Fotos > Supabase Storage |
| install-booker-reminder.js | @hourly | WhatsApp-Erinnerungen (22h nach Einladung) |

### Install Booker APIs
| Function | Route | Methode | Zweck |
|----------|-------|---------|-------|
| install-booker-invite.js | /api/install-booker/invite | POST | Buchungseinladung senden |
| install-booker-slots.js | /api/install-booker/slots | GET | Verfuegbare Zeitfenster |
| install-booker-book.js | /api/install-booker/book | POST | Termin buchen |
| install-booker-detail.js | /api/install-booker/detail | GET | Akquise-Details |
| install-booker-status.js | /api/install-booker/status | GET/PATCH | Buchungen verwalten |
| install-booker-templates.js | /api/install-booker/templates | GET | SMS/Email Templates |
| install-booker-send-reminder.js | /api/install-booker/send-reminder | GET/POST | Manuelle Erinnerung |

### Monteur APIs
| Function | Route | Methode | Auth | Zweck |
|----------|-------|---------|------|-------|
| install-monteur.js | /api/install-monteur | GET | JWT oder HMAC | Tagesroute laden |
| install-monteur.js | /api/install-monteur/link | POST | JWT | Signierten Link generieren |
| install-monteur-status.js | /api/install-monteur/status | POST | JWT oder HMAC | WhatsApp-Status senden |

### Schedule/Route API
| Function | Route | Methoden | Zweck |
|----------|-------|----------|-------|
| install-schedule.js | /api/install-schedule | GET/POST/PATCH/DELETE | Routen-CRUD |
| install-schedule.js | /api/install-schedule/teams | GET | Teams laden |

### Proxies
| Function | Route | Zweck |
|----------|-------|-------|
| airtable-proxy.js | /api/airtable/* | Airtable CRUD (Token serverseitig) |
| superchat-proxy.js | /api/superchat/* | WhatsApp/SMS (Feature-Flag-Check) |
| vistar-proxy.js | /api/vistar/* | Vistar SSP API |
| supabase-proxy.js | /api/supabase-proxy | Supabase mit Service-Role (bypassed RLS) |
| sheets-proxy.js | /api/sheets | Google Sheets CSV |
| chat-proxy.js | /api/chat-proxy | Claude AI Chat Backend |

### User & System
| Function | Route | Zweck |
|----------|-------|-------|
| user-management.js | /api/users/* | Benutzer CRUD (add/update/delete/reset) |
| feature-flags.js | /api/feature-flags | Feature Flags CRUD |
| sync-airtable.js | /api/sync | Manueller Sync-Trigger |
| trigger-sync-background.js | /api/trigger-sync | Background Sync |
| sync-attachments.js | /api/sync-attachments | Manueller Attachment-Sync |
| sync-nocodb.js | /api/sync-nocodb | NocoDB Sync |
| bank-import.js | /api/bank-import | Bank Leasing XLSX Import |

### Shared Utilities (netlify/functions/shared/)
| Datei | Zweck |
|-------|-------|
| security.js | CORS, Rate-Limiting (60/min), Origin-Validation, Input-Sanitization |
| slotUtils.js | Zeitfenster: SLOT_DURATION=90min, BUFFER=30min, WORK_START=09:00, WORK_END=22:00 |
| apiLogger.js | Fire-and-forget API-Logging nach api_usage_log |
| airtableFields.js | Airtable Feld-Mapping + Table-IDs |
| airtableMappers.js | Daten-Transformer (Airtable <> Supabase) |
| attachmentHelper.js | Attachment-Processing |

---

## METRIC PREDICATES (src/metrics/)

```javascript
// predicates.js — Kanonische Wahrheitsquelle fuer Standort-Status

isStorno(record)
  // true wenn: akquiseStorno ODER postInstallStorno
  // ODER leadStatus enthaelt 'storno'/'cancelled'/'lost'

isAlreadyInstalled(record)
  // true wenn: installationsStatus enthaelt 'installiert'/'live'/'abgebrochen'
  // ODER leadStatus === 'live'/'installation'
  // ODER displayLocationStatus hat nicht-leere Werte
  // HINWEIS: 'abgebrochen' zaehlt als installiert (nicht erneut einplanen)

isReadyForInstall(record)
  // true wenn ALLE:
  //   leadStatus === 'won / signed' (Vertrag unterschrieben)
  //   UND approvalStatus === 'accepted'/'approved' (Genehmigung erteilt)
  //   UND vertragVorhanden === true/'true'/'checked'/'YES'/'yes'
  // Prueft NICHT isStorno/isAlreadyInstalled — Aufrufer muss das tun

isPendingApproval(record)
  // true wenn:
  //   leadStatus === 'won / signed'
  //   UND approvalStatus in ['in review', 'info required', 'not started', 'not tarted']
  //   ('not tarted' ist bekannter Airtable-Typo)
```

```javascript
// constants.js
OVERDUE_THRESHOLDS = {
  PENDING_NO_RESPONSE_HOURS: 48,      // Einladung ohne Antwort
  UNCONFIRMED_BEFORE_INSTALL_HOURS: 24, // Unbestaetigter Termin
  CONFIRMATION_CALL_WITHIN_HOURS: 72,   // Nachfass-Anruf
}
STATUS_THRESHOLDS = {
  ACTIVE_STATUSES: ['pending', 'booked', 'confirmed'],
  COMPLETED_STATUSES: ['completed'],
  NEGATIVE_STATUSES: ['cancelled', 'no_show'],
}
WEEKLY_BUILD_TARGET = 25  // Installationen pro Woche
```

```javascript
// computations/installation.js
computeBookingStatusCounts(bookings)  // { total, pending, booked, confirmed, completed, cancelled, noShow }
computeConversionRate(bookings)       // (booked+confirmed+completed) / (pending+booked+confirmed+completed) * 100
computeNoShowRate(bookings)           // noShow / (completed+noShow) * 100
getOverdueInfo(booking, now)          // { isOverdue, reason, severity }
```

---

## INSTALL UTILS (src/utils/installUtils.js)

### API-Endpoints
```javascript
INSTALL_API = {
  SCHEDULE:       '/api/install-schedule',
  TEAMS:          '/api/install-schedule/teams',
  BOOKINGS:       '/api/install-booker/status',
  DETAIL:         '/api/install-booker/detail',
  INVITE:         '/api/install-booker/invite',
  TEMPLATES:      '/api/install-booker/templates',
  SLOTS:          '/api/install-booker/slots',
  FLAGS:          '/api/feature-flags',
  MONTEUR:        '/api/install-monteur',
  MONTEUR_LINK:   '/api/install-monteur/link',
  MONTEUR_STATUS: '/api/install-monteur/status',
}
```

### Key Functions
```javascript
normalizeCity(city)                    // Entfernt " am Main", " an der "
toDateString(d)                        // Date > "YYYY-MM-DD"
formatDateDE(dateStr)                  // "Montag, 3. Maerz 2025"
formatDateShortDE(dateStr)             // "Mo., 3. Maer."
formatDateWeekdayYear(dateStr)         // "Mo., 3. Maer. 2025"
formatDateShort(dateStr)               // "3. Maer."
formatDateYear(dateStr)                // "3. Maer. 2025"
formatDateTime(dateStr)                // "3. Maer., 14:30"
parseTimeSlots(slots)                  // Parst doppelt-verschachteltes JSON
mergeAirtableTermine(termine, bookings, routes, opts)  // Merged Airtable + Supabase Buchungen
triggerSyncAndReload(reloadFn, toast)  // POST /api/trigger-sync > Cache leeren > 2.5s warten > Reload

// mergeAirtableTermine Status-Mapping:
// 'geplant' > 'booked'
// 'durchgefuehrt' > 'completed'
// 'abgesagt' > 'cancelled'
// 'verschoben' > 'pending'
// 'no-show' > 'no_show'
// 'bestaetigt' > 'confirmed'
```

---

## NETLIFY ENVIRONMENT VARIABLES

| Variable | Zweck |
|----------|-------|
| SUPABASE_URL | Supabase Projekt-URL |
| SUPABASE_SERVICE_ROLE_KEY | Server-seitiger Supabase-Zugang (bypassed RLS) |
| AIRTABLE_TOKEN | Airtable PAT fuer Sync + Proxy |
| SUPERCHAT_API_KEY | WhatsApp/SMS via SuperChat |
| SUPERCHAT_INSTALL_TEMPLATE_ID | WhatsApp Einladungs-Template ID |
| ANTHROPIC_API_KEY | Claude AI Chat-Backend |
| VISTAR_EMAIL | Vistar SSP Login |
| VISTAR_PASSWORD | Vistar SSP Passwort |
| BOOKER_API_KEY | API-Key fuer Buchungs-Endpunkte |
| BOOKING_BASE_URL | Basis-URL fuer Buchungslinks |
| MONTEUR_SECRET | Token-Generierung fuer Monteur-Links (HMAC-SHA256) |
| SYNC_SECRET | Auth fuer manuelle Sync-Trigger |
| DEFAULT_LOGIN_PASSWORD | Standard-Passwort (***REMOVED_DEFAULT_PW***) |
| MAKE_INSTALL_BOOKING_WEBHOOK | Make.com Webhook fuer Buchungs-Benachrichtigungen |
| NOCO_TOKEN | NocoDB API Token |
| SLACK_INSTALL_WEBHOOK | Optional: Direkte Slack-Integration |

---

## SUPERCHAT WHATSAPP TEMPLATES

| Template | Interne ID | Status | Zweck | Variablen |
|----------|-----------|--------|-------|-----------|
| InstallDate2 | tn_Cs5DK5Qa515O4GpAsDvWo | Approved | Buchungseinladung | {{1}}=Vorname, {{2}}=Buchungslink |
| install_reminder | tn_d3S5yQ0A18EQ9mulWgNUb | Approved | Erinnerung 22h | {{1}}=Vorname, {{2}}=Buchungslink |
| install_on_the_way | tn_zzfvOxMPZiB3wpwAxC9hD | Approved | Monteur auf dem Weg | {{1}}=Vorname |

**WICHTIG:** SuperChat verwendet interne `tn_...`-IDs, NICHT das Meta-Format `templatename_12345_67890`.

**SuperChat API:**
- Base: `https://api.superchat.com/v1.0`
- Auth: `Bearer {SUPERCHAT_API_KEY}`
- Template senden: `POST /contacts/{contactId}/messages` mit `template_id`
- Kontakt-Attribute:
  - `ca_cb868yUGScrsohM7y2kwv` = Booking Link
  - `ca_RU9o1ZWjIByskrY9mM9aK` = Booking Date
- WhatsApp Channel ID: `mc_cy5HABDnpRhRtosxckRzb`

---

## FEATURE FLAGS (aktueller Stand: 2026-02-20)

| Flag | Status | Beschreibung |
|------|--------|-------------|
| superchat_enabled | enabled | WhatsApp via SuperChat aktiv |
| superchat_test_phone | disabled | Test-Modus aus (war: 015785085798) |
| install_reminder_enabled | enabled | Stuendliche Erinnerungs-WhatsApp aktiv |

---

## AKTUELLE BUCHUNGSSTATISTIK

- **Total:** 24 Buchungen
- **Pending (eingeladen):** 13
- **Booked/Confirmed (Termin):** 11

---

## KUERZLICH BEHOBENE BUGS (letzte Session)

| Was | Problem | Loesung | Datei(en) |
|-----|---------|---------|-----------|
| Session-Persistenz | Neuer Tab = neuer Login | sessionStorage > localStorage + recoverSession() | authService.js, InstallApp.jsx, App.jsx |
| "Liefernado" Typo | Ueberall falsch geschrieben | replace_all in 3 Dateien (~10 Stellen) | MonteurView.jsx, install-monteur-status.js, BookingPage.jsx |
| Datums-Bug MonteurView | Zeigt morgen statt heute | toISOString() (UTC) > localDateStr() (CET) | MonteurView.jsx |
| Monteur-Account-Verwaltung | Manager konnte keine Monteure anlegen | Neue MonteurManagement.jsx | MonteurManagement.jsx, InstallationsDashboard.jsx |
| Buchungsstatus-Filter | Nur "mit/ohne Buchung" | Granular: Eingebucht / Eingeladen / Nicht eingeladen | InstallationReadyLocations.jsx |
| Buchungsuebersicht | Zeigte 317 statt nur aufbaubereite | isReadyForInstall() Filter hinzugefuegt | InstallationBookingsDashboard.jsx |
| Make.com Webhook | Env-Variable fehlte | MAKE_INSTALL_BOOKING_WEBHOOK gesetzt | Netlify Env |
| Slack-Fallback | Nur Make.com | Direkte Slack-Integration (optional) | install-booker-book.js |
| WhatsApp Reminders | Feature Flag false, Template-IDs falsch | Flag aktiviert, IDs auf tn_ Format | install-booker-reminder.js |

---

## BEKANNTE HINWEISE / EDGE CASES

1. **Airtable SIM-ID Precision Loss:** SIM-ICCIDs (19 Stellen) als Number gespeichert > letzte Stellen verloren. Fix: nocodb_vorbereitet liefert korrekte SIM-IDs.

2. **Deployment:** IMMER `npm run build && netlify deploy --prod --dir=dist`. NIE `--dir=.`.

3. **Supabase Anon Key** im Frontend-Code (authService.js Z.18) — by design (RLS schuetzt). Service Role nur in Functions.

4. **Airtable Attachment-URLs** expiren nach 2h. attachment_cache + sync-attachments-scheduled cached permanente URLs.

5. **/api/supabase-proxy** bypassed RLS fuer Acquisition-Reads (>5000 Records). Alle anderen Frontend-Reads direkt Supabase Anon.

6. **Scheduled Functions:** sync-airtable (15 Min), sync-attachments (15 Min), install-booker-reminder (stuendlich). In netlify.toml.

7. **Airtable Typo:** approvalStatus `'not tarted'` statt `'not started'` — wird in isPendingApproval() beruecksichtigt.

8. **install_on_the_way Template** — jetzt von Meta genehmigt (war pending).

9. **Make.com Webhook:** `https://hook.eu2.make.com/1uukoxjqle2jpz0m684x3tzcukyo3kbz` — sendet E-Mail bei neuer Buchung.

10. **Zeitfenster-Berechnung:** 90 Min pro Termin + 30 Min Buffer. Arbeitszeit 09:00-22:00. 3 Windows: morning/afternoon/evening.

---

## DEPLOYMENT-CHECKLISTE

```bash
cd "/Users/maximiliansimon/Desktop/Claude Workspace/Claude Code/JET Dashboard V2"
npm run build                          # Vite Build > dist/
netlify deploy --prod --dir=dist       # Deploy to Production
```

**Live:** https://tools.dimension-outdoor.com
