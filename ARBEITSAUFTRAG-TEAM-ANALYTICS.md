# ARBEITSAUFTRAG: Team-Aktivitaets-Dashboard ("Wer macht was?")

> Dieser Auftrag ist fuer einen neuen Claude-Agenten gedacht.
> Lies ZUERST die HANDOFF.md komplett durch — dort stehen alle Grundregeln, Praedikate, Sync-Logik und KPI-Formeln.
> Dieser Auftrag baut auf diesem Wissen auf.

---

## HINTERGRUND

Seit Kurzem laeuft ein KI-Chat-Agent (WhatsApp via SuperChat), der automatisch Installationstermine
mit Standort-Betreibern vereinbart. Der Verdacht: Das Team verlaesst sich zunehmend NUR auf den Bot
und vereinbart keine Termine mehr telefonisch. Es fehlt ein Analyse-Tool um zu sehen:

- **Wer** hat **wie viele** Termine erstellt (pro Tag / pro Woche)
- **Wie** wurden Termine erstellt: KI-Bot vs. Telefon vs. manuell in Airtable
- **Wann** loggen sich User ein und nutzen das Interface aktiv
- **Wie produktiv** ist das Team insgesamt (Anrufe, Einladungen, Buchungen)

Das Dashboard muss ALLE Datenquellen korrekt zusammenfuehren — Termine werden sowohl
im JET-Portal (Supabase) als auch direkt in Airtable erstellt.

---

## ZIEL

Ein neuer Admin-Tab **"Team-Auswertung"** im Installations-Tool unter Admin, der Management-Einblick
in die Team-Produktivitaet gibt. Nur fuer Admin-User sichtbar.

**Wo:** `InstallationsDashboard.jsx` > Admin-Kategorie > neuer Subtab `team-analytics`
**Wer sieht es:** Nur `isAdmin === true` User

---

## PHASE 1: DATEN-INFRASTRUKTUR (Backend)

### 1.1 Neue Spalte `created_by_user_id` auf `install_bookings`

**Problem:** Die Tabelle `install_bookings` hat KEIN Feld das speichert, WELCHER Dashboard-User
die Buchung erstellt oder ausgeloest hat. Es gibt nur `booking_source` ('whatsapp_agent', 'phone', 'self_booking').

**Loesung:**

```sql
-- Migration: sql/add-booking-created-by.sql
ALTER TABLE install_bookings
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS created_by_user_name TEXT;

COMMENT ON COLUMN install_bookings.created_by_user_id IS 'Dashboard-User der die Buchung ausgeloest hat (NULL bei Self-Booking durch Kunde)';
COMMENT ON COLUMN install_bookings.created_by_user_name IS 'Name des Users zum Zeitpunkt der Erstellung (denormalisiert fuer schnelle Abfragen)';
```

**Dann alle Booking-Erstellungs-Pfade patchen:**

| Code-Pfad | Datei | Was aendern |
|-----------|-------|-------------|
| WhatsApp-Einladung | `install-booker-invite.js:372-386` | `created_by_user_id` und `created_by_user_name` aus Request-Body uebernehmen (Frontend sendet User-Context mit) |
| Telefon-Buchung | `install-booker-status.js:718-738` | Gleich — User-Context aus Request-Body |
| Selbst-Buchung (Kunde) | `install-booker-book.js:319-333` | `created_by_user_id = NULL` (Kunde, kein Dashboard-User) |
| Phone-Workbench UI | `scheduling/PhoneAcquisitionTab.jsx:349-366` | `getCurrentUser()` aufrufen und an API senden |

**Frontend-Aenderungen fuer Invite-Manager und Phone-Workbench:**
- In `InstallationInviteManager.jsx`: Beim Senden der WhatsApp-Einladung den aktuellen User mitsenden
- In `InstallationPhoneWorkbench.jsx`: Beim Telefonat-Ergebnis den aktuellen User mitsenden
- In `InstallationBookingsDashboard.jsx`: Beim manuellen Status-Aendern den User mitsenden

**User-Context senden (Beispiel):**
```javascript
import { getCurrentUser } from '../utils/authService';
const user = getCurrentUser();
// In fetch body:
{
  ...existingBody,
  created_by_user_id: user?.id || null,
  created_by_user_name: user?.name || null,
}
```

### 1.2 `caller_name` in `phone_call_logs` befuellen

**Problem:** Die Tabelle `phone_call_logs` hat ein Feld `caller_name`, aber es wird IMMER auf `null` gesetzt.

**Datei:** `scheduling/PhoneAcquisitionTab.jsx:311`
```javascript
// VORHER:
caller_name: null, // Could be set from auth context

// NACHHER:
caller_name: user?.name || null,
```

### 1.3 Neue Tabelle `booking_activity_log`

Fuer eine lueckenlose Aktivitaetshistorie brauchen wir ein dediziertes Event-Log:

```sql
-- Migration: sql/create-booking-activity-log.sql
CREATE TABLE IF NOT EXISTS booking_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Wer
  user_id UUID REFERENCES app_users(id),
  user_name TEXT NOT NULL,

  -- Was
  action TEXT NOT NULL CHECK (action IN (
    'invite_sent',         -- WhatsApp-Einladung gesendet
    'reminder_sent',       -- Erinnerung gesendet
    'phone_call',          -- Telefonat gefuehrt
    'booking_created',     -- Buchung manuell erstellt
    'booking_confirmed',   -- Buchung bestaetigt (Kunde hat gewaehlt)
    'booking_cancelled',   -- Buchung storniert
    'booking_completed',   -- Installation abgeschlossen
    'booking_rescheduled', -- Termin verschoben
    'status_changed',      -- Status manuell geaendert
    'airtable_termin_created' -- Termin in Airtable erstellt (via Sync erkannt)
  )),

  -- Kontext
  booking_id UUID REFERENCES install_bookings(id) ON DELETE SET NULL,
  akquise_airtable_id TEXT,
  location_name TEXT,
  city TEXT,

  -- Details
  detail JSONB DEFAULT '{}',
  -- Beispiele:
  -- invite_sent:    { "channel": "whatsapp", "template": "InstallDate2" }
  -- phone_call:     { "outcome": "booked", "duration_seconds": 180 }
  -- booking_confirmed: { "date": "2026-03-15", "time": "10:00", "source": "self_booking" }
  -- airtable_termin: { "created_by_airtable": "Max Simon", "terminstatus": "Geplant" }

  -- Quelle
  source TEXT NOT NULL DEFAULT 'portal' CHECK (source IN (
    'portal',      -- Ueber das JET-Dashboard
    'bot',         -- KI-Chat-Agent / WhatsApp-Bot
    'airtable',    -- Direkt in Airtable erstellt
    'self_booking' -- Kunde hat selbst gebucht
  )),

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indices fuer schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_bal_user_id ON booking_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_bal_action ON booking_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_bal_source ON booking_activity_log(source);
CREATE INDEX IF NOT EXISTS idx_bal_created_at ON booking_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_bal_city ON booking_activity_log(city);
```

### 1.4 Activity-Log beschreiben — an allen relevanten Stellen

| Stelle | Datei | Action | Source |
|--------|-------|--------|--------|
| WhatsApp senden | `install-booker-invite.js` nach Zeile 386 | `invite_sent` | `'bot'` |
| Erinnerung senden | `install-booker-reminder.js` nach Send | `reminder_sent` | `'bot'` |
| Telefon-Anruf loggen | `PhoneAcquisitionTab.jsx` nach phone_call_logs INSERT | `phone_call` | `'portal'` |
| Buchung per Telefon | `install-booker-status.js` nach INSERT (Zeile 738) | `booking_created` | `'portal'` |
| Kunde bucht selbst | `install-booker-book.js` nach PATCH (Zeile 333) | `booking_confirmed` | `'self_booking'` |
| Status-Aenderung | `install-booker-status.js` bei PATCH | `status_changed` | `'portal'` |
| Storno | `install-booker-status.js` bei cancel | `booking_cancelled` | `'portal'` |
| Abgeschlossen | `install-booker-status.js` bei complete | `booking_completed` | `'portal'` |

### 1.5 Airtable-Only-Termine erkennen (Sync-Erweiterung)

**Problem:** Manche Teammitglieder erstellen Termine DIREKT in Airtable, nicht ueber das Portal.
Diese Termine muessen im Activity-Log auftauchen.

**Loesung:** In `sync-airtable.js` nach dem Installationstermine-Sync eine Erkennung einbauen:

```
Logik:
1. Nach dem Upsert der installationstermine: Vergleiche vorherige IDs mit neuen
2. Fuer jede NEUE installationstermine-Zeile (airtable_id nicht vorher vorhanden):
   - Pruefe ob ein install_bookings-Eintrag mit gleichem akquise_airtable_id existiert
   - Wenn JA → wurde ueber Portal erstellt, bereits geloggt
   - Wenn NEIN → Airtable-Only-Termin!
     → INSERT in booking_activity_log:
       action: 'airtable_termin_created'
       source: 'airtable'
       user_name: installationstermine.created_by (Airtable-Collaborator-Name)
       detail: { "created_by_airtable": name, "terminstatus": status, "datum": date }
```

**WICHTIG:** `created_by` in Airtable installationstermine ist der Airtable-Collaborator-Name.
Dieser wird bereits gesynct nach `installationstermine.created_by` via `mapInstallationstermin()`.
Versuche diesen Namen einem `app_users`-Eintrag zuzuordnen (fuzzy Match ueber name).
Wenn kein Match → `user_id = NULL`, `user_name = created_by` (Airtable-Name).

---

## PHASE 2: FRONTEND — Team-Analytics-Dashboard

### 2.1 Neuer Subtab in Admin-Kategorie

**Datei:** `InstallationsDashboard.jsx`

```javascript
// In MENU_CATEGORIES, admin.items erweitern:
{ id: 'team-analytics', label: 'Team-Auswertung', icon: BarChart3 }

// Lazy import:
const TeamAnalyticsDashboard = lazy(() => import('./TeamAnalyticsDashboard'));

// Render:
{activeSubTab === 'team-analytics' && <TeamAnalyticsDashboard />}
```

### 2.2 Komponente `TeamAnalyticsDashboard.jsx`

**Strukturvorschlag:**

```
┌─────────────────────────────────────────────────────────┐
│ ZEITRAUM-SELECTOR: Heute | 7 Tage | 30 Tage | Custom   │
│ STADT-FILTER: Alle | Frankfurt | Berlin | ...           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐       │
│  │ Termine │  │ davon  │  │ davon  │  │ davon  │       │
│  │ Gesamt  │  │ Bot    │  │ Telefon│  │Airtable│       │
│  │   47    │  │  28    │  │  12    │  │   7    │       │
│  │         │  │ (60%)  │  │ (25%)  │  │ (15%)  │       │
│  └────────┘  └────────┘  └────────┘  └────────┘       │
│                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐       │
│  │Anrufe  │  │Erreicht│  │Einladg.│  │ Logins │       │
│  │ Gesamt │  │   /    │  │WhatsApp│  │  Ges.  │       │
│  │   85   │  │nicht er│  │  sent  │  │   23   │       │
│  │         │  │ 42/43  │  │   31   │  │        │       │
│  └────────┘  └────────┘  └────────┘  └────────┘       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  CHART: Termine pro Tag (gestapelt nach Quelle)         │
│  ┌──────────────────────────────────────────────┐       │
│  │  ████                                        │       │
│  │  ████ ███                                    │       │
│  │  ████ ███ ██████                             │       │
│  │  ████ ███ ██████ ████                        │       │
│  │  Mo   Di  Mi     Do    Fr   Sa   So          │       │
│  │  ■ Bot  ■ Telefon  ■ Airtable  ■ Self-Book  │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  CHART: Bot vs. Mensch (Trend ueber Wochen)             │
│  ┌──────────────────────────────────────────────┐       │
│  │  Zeigt ob Bot-Anteil steigt und Mensch sinkt │       │
│  │  Liniendiagramm mit 2 Linien                │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  TABELLE: User-Aktivitaet (Pro Teammitglied)            │
│  ┌──────────────────────────────────────────────┐       │
│  │ Name    │ Anrufe│Einlad│Buchg│Letzter Login │       │
│  │─────────│───────│──────│─────│──────────────│       │
│  │ Max S.  │   23  │  12  │  8  │ vor 2h       │       │
│  │ Anna K. │   18  │   9  │  5  │ vor 5h       │       │
│  │ Tim R.  │    3  │   0  │  0  │ vor 3 Tagen  │       │
│  │ Bot     │    0  │  28  │ 22  │ always-on    │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  TABELLE: Aktivitaets-Feed (letzte Aktionen)            │
│  ┌──────────────────────────────────────────────┐       │
│  │ 14:23  Max S.  📞 Anruf: Pizza Roma (FFM)   │       │
│  │ 14:15  Bot     📱 WA an: Eiscafe Hedi (BER) │       │
│  │ 13:50  Anna K. ✅ Termin: Cafe Mio 18.3.    │       │
│  │ 13:22  (AT)    📋 Termin in Airtable: ...    │       │
│  │ ...                                          │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Datenquellen fuer das Dashboard

| Bereich | Supabase-Tabelle | Query |
|---------|-----------------|-------|
| Termine nach Quelle | `booking_activity_log` | `action IN ('booking_created','booking_confirmed','airtable_termin_created') AND created_at >= range` |
| Bot-Einladungen | `booking_activity_log` | `action = 'invite_sent' AND source = 'bot'` |
| Telefonanrufe | `phone_call_logs` + `booking_activity_log` | `action = 'phone_call'` oder direkt `phone_call_logs` |
| User-Logins | `audit_log` | `action = 'login' AND created_at >= range` |
| User-Details | `app_users` | JOIN fuer Namen, Teams, last_login |
| Airtable-Termine | `installationstermine` | `created_at >= range` (nach Sync) |
| Bot vs Mensch Trend | `booking_activity_log` | GROUP BY week, source |

### 2.4 KPI-Berechnungen

```javascript
// Termine Gesamt (im Zeitraum)
const termineGesamt = activityLog.filter(a =>
  ['booking_created', 'booking_confirmed', 'airtable_termin_created'].includes(a.action)
).length;

// Davon Bot
const termineBot = activityLog.filter(a =>
  ['booking_confirmed'].includes(a.action) && a.source === 'self_booking'
  // Self-Booking = Kunde hat ueber Bot-Link gebucht
).length;

// Davon Telefon
const termineTelefon = activityLog.filter(a =>
  a.action === 'booking_created' && a.source === 'portal'
).length;

// Davon Airtable-Only
const termineAirtable = activityLog.filter(a =>
  a.action === 'airtable_termin_created'
).length;

// Anrufe Gesamt
const anrufeGesamt = activityLog.filter(a => a.action === 'phone_call').length;

// Anrufe erreicht / nicht erreicht
const anrufeErreicht = activityLog.filter(a =>
  a.action === 'phone_call' && a.detail?.outcome === 'reached'
).length;

// WhatsApp-Einladungen gesendet
const einladungenGesendet = activityLog.filter(a => a.action === 'invite_sent').length;

// Logins im Zeitraum
const logins = auditLog.filter(a => a.action === 'login').length;

// Pro User (GROUP BY user_name)
const perUser = groupBy(activityLog, 'user_name');
```

---

## PHASE 3: AIRTABLE-SYNC KORREKTHEIT

### 3.1 Sicherstellen dass Airtable-Only-Termine erkannt werden

Der Kern des Problems: Teammitglieder erstellen Termine in Airtable, aber das Portal weiss nichts davon.
Der Sync laeuft alle 15 Min (inkr.) und stuendlich (full) fuer installationstermine.

**Erkennungs-Logik im Sync:**

```javascript
// In sync-airtable.js, NACH dem Upsert der installationstermine:

// 1. Vorherige IDs laden (vor dem Sync)
const previousIds = new Set(/* SELECT airtable_id FROM installationstermine */);

// 2. Sync durchfuehren (bereits vorhanden)
await syncAirtableTable('Installationstermine', ...);

// 3. Neue IDs erkennen (nach dem Sync)
const currentIds = new Set(/* SELECT airtable_id FROM installationstermine */);
const newIds = [...currentIds].filter(id => !previousIds.has(id));

// 4. Fuer jede neue ID: Pruefen ob Portal-Buchung existiert
for (const newId of newIds) {
  const termin = /* SELECT * FROM installationstermine WHERE airtable_id = newId */;
  const akquiseIds = termin.akquise_links || [];

  // Hat dieses Akquise-Record ein install_booking?
  const hasBooking = /* SELECT 1 FROM install_bookings
    WHERE akquise_airtable_id IN (akquiseIds) LIMIT 1 */;

  if (!hasBooking) {
    // Airtable-Only-Termin erkannt!
    /* INSERT INTO booking_activity_log:
       action: 'airtable_termin_created',
       source: 'airtable',
       user_name: termin.created_by || 'Unbekannt (Airtable)',
       location_name: termin.location_name,
       city: termin.city,
       detail: { created_by_airtable: termin.created_by, terminstatus: termin.terminstatus, ... }
    */
  }
}
```

### 3.2 Timing sicherstellen

- `booking_activity_log` wird bei jeder Portal-Aktion SOFORT beschrieben (kein Sync-Delay)
- Airtable-Only-Termine werden beim naechsten Sync erkannt (max. 15 Min Delay, stuendlich full)
- Das Dashboard muss dies transparent machen: "Letzte Sync: vor X Minuten"

### 3.3 Duplikat-Vermeidung

Wenn ein Termin sowohl im Portal erstellt wird ALS AUCH in Airtable erscheint (weil der
`install-booker-book.js` einen Airtable-Installationstermin anlegt), darf er NICHT doppelt
im Activity-Log erscheinen.

**Loesung:** Die Airtable-Erkennung prueft `hasBooking` — wenn ein install_booking existiert,
wurde der Termin ueber das Portal erstellt und ist bereits geloggt.

---

## PHASE 4: OPTIONALE ERWEITERUNGEN

### 4.1 Supabase RPC fuer schnelle Aggregation

```sql
-- RPC: get_team_activity_summary
CREATE OR REPLACE FUNCTION get_team_activity_summary(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_city TEXT DEFAULT NULL
)
RETURNS JSON AS $$
  SELECT json_build_object(
    'total_bookings', COUNT(*) FILTER (WHERE action IN ('booking_created','booking_confirmed','airtable_termin_created')),
    'bot_bookings', COUNT(*) FILTER (WHERE action = 'booking_confirmed' AND source = 'self_booking'),
    'phone_bookings', COUNT(*) FILTER (WHERE action = 'booking_created' AND source = 'portal'),
    'airtable_bookings', COUNT(*) FILTER (WHERE action = 'airtable_termin_created'),
    'total_calls', COUNT(*) FILTER (WHERE action = 'phone_call'),
    'total_invites', COUNT(*) FILTER (WHERE action = 'invite_sent'),
    'per_user', (
      SELECT json_agg(row_to_json(u))
      FROM (
        SELECT user_name,
          COUNT(*) FILTER (WHERE action = 'phone_call') AS calls,
          COUNT(*) FILTER (WHERE action = 'invite_sent') AS invites,
          COUNT(*) FILTER (WHERE action IN ('booking_created','booking_confirmed')) AS bookings
        FROM booking_activity_log
        WHERE created_at BETWEEN p_from AND p_to
          AND (p_city IS NULL OR city = p_city)
        GROUP BY user_name
        ORDER BY bookings DESC
      ) u
    ),
    'per_day', (
      SELECT json_agg(row_to_json(d))
      FROM (
        SELECT created_at::date AS day,
          COUNT(*) FILTER (WHERE source = 'bot' OR source = 'self_booking') AS bot,
          COUNT(*) FILTER (WHERE source = 'portal') AS portal,
          COUNT(*) FILTER (WHERE source = 'airtable') AS airtable
        FROM booking_activity_log
        WHERE action IN ('booking_created','booking_confirmed','airtable_termin_created')
          AND created_at BETWEEN p_from AND p_to
          AND (p_city IS NULL OR city = p_city)
        GROUP BY created_at::date
        ORDER BY day
      ) d
    )
  )
  FROM booking_activity_log
  WHERE created_at BETWEEN p_from AND p_to
    AND (p_city IS NULL OR city = p_city);
$$ LANGUAGE SQL STABLE;
```

### 4.2 Login-Frequenz pro User

```javascript
// Aus audit_log:
const loginsByUser = auditLog
  .filter(a => a.action === 'login')
  .reduce((acc, a) => {
    acc[a.user_name] = (acc[a.user_name] || 0) + 1;
    return acc;
  }, {});
```

### 4.3 CSV-Export

Ein "Export"-Button der die Daten als CSV herunterlaed:
- Datum, User, Aktion, Standort, Stadt, Quelle
- Fuer Excel-Analyse durch Management

---

## DATEIEN DIE GEAENDERT WERDEN MUESSEN

| Datei | Aenderung | Phase |
|-------|----------|-------|
| **NEU:** `sql/create-booking-activity-log.sql` | Neue Tabelle anlegen | 1.3 |
| **NEU:** `sql/add-booking-created-by.sql` | Spalten zu install_bookings | 1.1 |
| **NEU:** `src/components/TeamAnalyticsDashboard.jsx` | Neue Komponente | 2.2 |
| `netlify/functions/install-booker-invite.js` | `created_by_*` setzen + Activity-Log schreiben | 1.1, 1.4 |
| `netlify/functions/install-booker-book.js` | Activity-Log schreiben | 1.4 |
| `netlify/functions/install-booker-status.js` | `created_by_*` setzen + Activity-Log schreiben | 1.1, 1.4 |
| `netlify/functions/install-booker-reminder.js` | Activity-Log schreiben | 1.4 |
| `netlify/functions/sync-airtable.js` | Airtable-Only-Erkennung nach Termin-Sync | 1.5 |
| `src/components/InstallationsDashboard.jsx` | Neuer Subtab + Lazy Import | 2.1 |
| `src/components/InstallationInviteManager.jsx` | User-Context beim Invite mitsenden | 1.1 |
| `src/components/InstallationPhoneWorkbench.jsx` | User-Context beim Anruf mitsenden | 1.1 |
| `scheduling/PhoneAcquisitionTab.jsx` | `caller_name` befuellen | 1.2 |

---

## REIHENFOLGE DER IMPLEMENTIERUNG

```
1. SQL-Migrationen ausfuehren (Tabelle + Spalten erstellen)
2. Backend: install-booker-*.js Funktionen patchen (created_by + Activity-Log)
3. Backend: sync-airtable.js Airtable-Only-Erkennung
4. Frontend: PhoneAcquisitionTab caller_name fix
5. Frontend: InviteManager + PhoneWorkbench User-Context senden
6. Frontend: TeamAnalyticsDashboard.jsx bauen
7. Frontend: In InstallationsDashboard.jsx einhaengen
8. Testen: Einen Termin per Bot, per Telefon, per Airtable erstellen und pruefen
9. Deployen: npm run build && netlify deploy --prod --dir=dist
```

---

## DESIGN-RICHTLINIEN

- Gleicher UI-Stil wie restliches Dashboard (Tailwind, rounded-2xl, gleiche Farben)
- Recharts fuer Charts (bereits als Dependency vorhanden)
- Responsive: mindestens Tablet + Desktop
- Zeitraum-Selector prominent oben (wie im Executive-Dashboard)
- Farb-Schema fuer Quellen:
  - Bot/Self-Booking: Blau (#3b82f6) — automatisiert
  - Telefon/Portal: Gruen (#22c55e) — menschlich
  - Airtable-Only: Orange (#f59e0b) — manuell extern
  - Unbekannt: Grau (#6b7280)

---

## TESTFAELLE

1. **Bot-Buchung:** WhatsApp-Einladung senden → Kunde bucht → erscheint als "Bot" im Chart
2. **Telefon-Buchung:** User loggt Telefonat → bucht Termin → erscheint als "Telefon" mit User-Name
3. **Airtable-Only:** Termin direkt in Airtable erstellen → nach Sync erscheint er als "Airtable"
4. **Duplikat-Vermeidung:** Bot-Einladung → Kunde bucht → Airtable-Termin wird angelegt → NUR 1x gezaehlt
5. **Zeitraum-Filter:** "Heute" zeigt nur heutige Aktivitaeten, "7 Tage" die letzten 7
6. **Stadt-Filter:** Nur Buchungen der gewaehlten Stadt
7. **User ohne Aktivitaet:** User mit Login aber 0 Aktionen taucht trotzdem in der Tabelle auf (mit 0/0/0)
8. **Historische Daten:** Fuer den Zeitraum VOR der Implementierung gibt es keine Activity-Log-Eintraege.
   Das Dashboard sollte einen Hinweis zeigen: "Detaillierte Tracking-Daten verfuegbar ab [Datum]"

---

## BEKANNTE EINSCHRAENKUNGEN

1. **Keine historischen Daten:** Das Activity-Log startet erst ab Implementierung.
   Fuer aeltere Termine kann man `install_bookings.created_at` + `booking_source` nutzen,
   aber ohne User-Zuordnung.

2. **Bot-Identitaet:** Der Bot hat keinen `app_users`-Eintrag. Im Activity-Log wird er als
   `user_name: 'WhatsApp Bot'` und `source: 'bot'` gefuehrt. `user_id` ist NULL.

3. **Airtable Created-By:** Das ist der Airtable-Collaborator-Name, NICHT der Dashboard-User.
   Mapping muss per Name-Match gemacht werden (kann ungenau sein bei Namensvarianten).

4. **Self-Booking Zuordnung:** Wenn ein Kunde selbst bucht, wird `source: 'self_booking'` gesetzt.
   Dies ist technisch ein Bot-initiierter Prozess (Bot hat Einladung gesendet), zaehlt aber
   als "automatisiert" / "Bot-Flow".
