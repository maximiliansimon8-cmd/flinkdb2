# CLAUDE.md — JET Dashboard V2 (Dimension Outdoor)

> Automatisch geladen bei jeder Claude Code Session.
> Basiert auf verifiziertem Code-Review (Feb 2026). Bei Widerspruch gilt HANDOFF.md.

## Weiterführende Dokumentation

| Datei | Inhalt |
|-------|--------|
| `HANDOFF.md` | 1396-Zeilen Master-Referenz — bei Architektur-Fragen IMMER zuerst lesen |
| `AIRTABLE_FIELD_REFERENCE.md` | Vollständige Airtable-Felddokumentation |
| `src/metrics/predicates.js` | Kanonische Standort-Status-Prädikate (isStorno, isReadyForInstall etc.) |
| `netlify/functions/shared/airtableFields.js` | Airtable-Konstanten, Tabellen-IDs, Helper-Funktionen, VALUES |
| `netlify/functions/shared/airtableMappers.js` | Airtable→Supabase Transformatoren |
| `netlify/functions/shared/security.js` | CORS, Auth, Rate Limiting, Sanitization — betrifft ALLE Functions |

---

## Echter Stack

| Bereich | Technologie |
|---------|------------|
| **Frontend** | **React 19** + **Tailwind CSS 4** + **Vite 7** — JSX-Komponenten, Hooks, CSS utility classes |
| **Backend** | 28 Netlify Functions (ES Modules `.js`) in `netlify/functions/` |
| **Datenbank** | Supabase (PostgreSQL) — Frontend via `@supabase/supabase-js` SDK, Backend via direktem `fetch()` |
| **Primäre Datenquelle** | Airtable Base `apppFUWK829K6B3R2` |
| **WhatsApp** | SuperChat API `https://api.superchat.com/v1.0` |
| **Hosting** | Netlify (`main` → Produktion, Feature Branches → Deploy Previews) |
| **Live-URL** | https://tools.dimension-outdoor.com |

---

## Wichtige Befehle

```bash
npm run dev                                    # Vite Dev-Server (localhost:5173)
npm run build                                  # Build → dist/ (IMMER vor Deploy!)
npm run build && netlify deploy --prod --dir=dist  # Produktions-Deploy (NIEMALS --dir=.)
npx netlify dev                                # Functions lokal testen (liest .env.local)
```

---

## Absolute Regeln

### 1. Datenquelle-Hierarchie

```
Airtable = Source of Truth
     ↓ sync-airtable.js (alle 5 Min) → trigger-sync-background.js (inkrementell)
Supabase = Read-Cache
     ↓
Frontend = liest NUR von Supabase
     ↓
Schreiboperationen = Frontend → Netlify Function → Airtable API
                     (Supabase beim nächsten Sync aktualisiert)
```

- **NIEMALS** direkt in Supabase schreiben wenn Daten aus Airtable stammen
- **Ausnahme:** Supabase-only Tabellen (install_bookings, install_routen, install_teams, app_users, feature_flags etc.)

### 2. Supabase SDK: Frontend JA, Backend NEIN

```javascript
// ✅ FRONTEND: SDK verwenden (authService.js exportiert die Instanz)
import { supabase } from '../utils/authService';
const { data } = await supabase.from('acquisition').select('*');

// ✅ BACKEND (Netlify Functions): fetch() direkt gegen REST API
const res = await fetch(`${SUPABASE_URL}/rest/v1/tabelle?select=id,name`, {
  headers: {
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'apikey': SUPABASE_KEY,
  },
});

// ❌ FALSCH: SDK in Netlify Functions importieren
import { createClient } from '@supabase/supabase-js'; // NUR in src/, NICHT in netlify/functions/
```

### 3. Shared Security Module — Pflicht für jede Netlify Function

```javascript
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
  normalizePhone, sanitizeString, sanitizeForAirtableFormula,
  isValidUUID, isValidAirtableId,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
```

Keine neue Function ohne diese Imports.

### 4. Airtable-Felder IMMER aus Constants

```javascript
// ✅ RICHTIG: Konstanten aus shared/airtableFields.js
import { AIRTABLE_BASE, TABLES, FETCH_FIELDS, ACQUISITION_FIELDS as AF, VALUES } from './shared/airtableFields.js';
import { mapAcquisition } from './shared/airtableMappers.js';

// ❌ FALSCH: Feldnamen hardcoden (Trailing Spaces, Typos, Unicode!)
filter: `{Lead_Status}='Won / Signed'`
// → stattdessen: VALUES.LEAD_STATUS.WON_SIGNED
```

### 5. Prädikate: ZWEI verschiedene isReadyForInstall()

Es gibt zwei Funktionen mit demselben Namen — verschiedene Zwecke:

| Datei | Prüft | Verwendet in |
|-------|-------|-------------|
| `src/metrics/predicates.js` | `leadStatus + approvalStatus + vertragVorhanden` (3 Felder) | **Frontend-Komponenten** — kanonische Version |
| `netlify/functions/shared/airtableFields.js` | Nur `ready_for_installation` Checkbox (`'checked'`, `true`) | **Backend-Sync** — Airtable Formelfeld |

**Im Frontend IMMER die Predicate-Version verwenden:**

```javascript
import { isStorno, isAlreadyInstalled, isReadyForInstall, isPendingApproval } from '../metrics/predicates';

// Aufbaubereit = alle 3 positiven Kriterien + 2 Ausschlüsse:
const aufbaubereit = records.filter(a =>
  !isStorno(a) && !isAlreadyInstalled(a) && isReadyForInstall(a)
);
```

### 6. Destructive Actions — IMMER erst fragen

- SQL Migrations mit `DROP`, `ALTER COLUMN`, `DELETE` ohne `WHERE`
- `git push --force`
- Env-Vars löschen oder überschreiben
- SuperChat Template-IDs ändern (Meta-Approval dauert Tage!)
- Massenhafte Supabase-Updates ohne einschränkende WHERE-Clause
- Änderungen an `shared/security.js` (betrifft alle 28 Functions!)

---

## Airtable Quirks — Kritisch!

| Problem | Beispiel | Regel |
|---------|----------|-------|
| Trailing Spaces | `'Online Status '`, `'Kommentar Nacharbeit '`, `'Status changed date '` | IMMER aus Konstante lesen |
| Double Spaces | `'Lead Status  (from Akquise)'` | IMMER aus Konstante lesen |
| Unicode Hyphen U+2011 | `'Post\u2011Install Storno'` | `ACQUISITION_FIELDS.POST_INSTALL_STORNO` |
| Typos in Feldnamen | `'external_visiblity'` (fehlendes 'i'), `'Longtitude'` | Aus Konstante lesen |
| Checkbox = String | `ready_for_installation = 'checked'` nicht `true` | Helper oder Predicate nutzen |
| Lookup = Array | Lookup-Felder liefern immer Arrays | `unwrap()`, `first()`, `lookupArray()` |
| vertragVorhanden Formate | `true`, `'true'`, `'checked'`, `'YES'`, `'yes'` | `isReadyForInstall()` prüft alle |

---

## Architektur

### 4 SPAs (separate Entry Points)

| App | Entry | Root-Komponente | Auth |
|-----|-------|----------------|------|
| Main Dashboard | `index.html` → `src/main.jsx` | `App.jsx` | Supabase JWT |
| Install Tool | `install.html` → `src/install-main.jsx` | `InstallApp.jsx` | Supabase JWT |
| Booking Page | `booking/index.html` | `BookingPage.jsx` | Public (Token) |
| Monteur View | via `index.html` Route | `MonteurView.jsx` | Public (HMAC Token) |

### Scheduled → Background Pattern (KRITISCH!)

Netlify Scheduled Functions haben ein **30-Sekunden-Limit**. Unser Sync braucht Minuten.

```
sync-airtable.js (Scheduled, */5 * * * *)
  ↓ HTTP POST (< 1 Sekunde)
trigger-sync-background.js (Background Function, 15 Min Limit)
  ↓ Inkrementeller Sync via LAST_MODIFIED_TIME()
  ↓ 14 Tabellen in 6 Batches (Promise.allSettled)
Supabase (16 Tabellen aktualisiert)
```

- **Scheduled Functions** (`-scheduled` suffix oder `export const config = { schedule }`) → max 30s
- **Background Functions** (`-background` suffix) → max 15 Min
- Bei einem Tabellen-Fehler läuft der Rest trotzdem weiter (`Promise.allSettled`)

### Sync-Reihenfolge (Batches)

1. Displays, Acquisition, DaynScreens
2. OPS, SIM, Display Inventory
3. CHG, Stammdaten, Tasks
4. Installationen, Swaps, Deinstalls
5. Installationstermine, Communications
6. Heartbeats

### Authentifizierungs-Muster

| Methode | Wann | Beispiel-Functions |
|---------|------|--------------------|
| Origin-Check | Dashboard-interne Calls | `airtable-proxy.js`, `feature-flags.js` |
| Supabase JWT | Eingeloggte User-Aktionen | `install-booker-detail.js`, `user-management.js` |
| API-Key (`x-api-key`) | Make.com / externe Trigger | `install-booker-invite.js`, `install-schedule.js` |
| HMAC Token | Monteur-Links | `install-monteur.js`, `install-monteur-status.js` |
| Dual (JWT + API-Key) | Flexible Endpoints | `install-booker-detail.js`, `install-schedule.js` |

### Airtable Tabellen-IDs

```javascript
TABLES = {
  STAMMDATEN:         'tblLJ1S7OUhc2w5Jw',  // JET Stammdaten
  DISPLAYS:           'tblS6cWN7uEhZHcie',  // Live Display Locations
  TASKS:              'tblcKHWJg77mgIQ9l',  // Tasks
  INSTALLATIONEN:     'tblKznpAOAMvEfX8u',  // Installationen
  ACTIVITY_LOG:       'tblDk1dl4J3Ow3Qde',  // activity_log / Communications
  ACQUISITION:        'tblqFMBAeKQ1NbSI8',  // Acquisition_DB
  INSTALLATIONSTERMINE: 'tblZrFRRg3iKxlXFJ', // Installationstermine
  OPS_INVENTORY:      'tbl7szvfLUjsUvMkH',  // OPS_Player_inventory
  SIM_INVENTORY:      'tblaV4UQX6hhcSDAj',  // SIM_card_inventory
  DISPLAY_INVENTORY:  'tblaMScl3j45Q4Dtc',  // display_inventory
  CHG:                'tblvj4qjJpBVLbY7F',  // CHG Approval
  DEINSTALLATIONEN:   'tbltdxgzDeNz9d0ZC',  // Deinstallationen
  HARDWARE_SWAP:      'tblzFHk0HhB4bNYJ4',  // Hardware-Tausch
}
```

### Supabase Tabellen (Sync-Ziele)

```
stammdaten, airtable_displays, tasks, installationen, communications,
dayn_screens, acquisition, hardware_ops, hardware_sim, hardware_displays,
chg_approvals, hardware_swaps, hardware_deinstalls, display_heartbeats,
installationstermine
```

Plus Supabase-only: `install_bookings`, `install_routen`, `install_teams`, `app_users`, `groups`, `audit_log`, `feature_flags`, `sync_metadata`, `warehouse_*`, `purchase_orders`, `bank_leasing`

### Bekannte Feldwerte (VALUES)

```javascript
VALUES.LEAD_STATUS.WON_SIGNED          // 'Won / Signed'
VALUES.APPROVAL_STATUS.ACCEPTED        // 'Accepted'
VALUES.INSTALLATION_STATUS.INSTALLIERT // 'Installiert'
VALUES.TERMINSTATUS.GEPLANT            // 'Geplant'
VALUES.ONLINE_STATUS.ONLINE            // 'online'
VALUES.READY_FOR_INSTALL.CHECKED       // 'checked' (⚠️ String, nicht boolean!)
```

---

## SuperChat / WhatsApp

- Nur approved Meta Templates funktionieren außerhalb des 24h-Fensters
- Template-IDs (`tn_...`) NIEMALS ändern ohne Approval-Status geprüft
- Test-Modus: `superchat_test_phone` Feature Flag respektieren
- Phone-Nummern: `normalizePhone()` aus `shared/security.js`
- WA Channel: `SUPERCHAT_WA_CHANNEL_ID` (Default: `mc_cy5HABDnpRhRtosxckRzb`)
- Templates: Einladung `tn_Cs5DK5Qa515O4GpAsDvWo`, Erinnerung `tn_d3S5yQ0A18EQ9mulWgNUb`, Auf dem Weg `tn_zzfvOxMPZiB3wpwAxC9hD`

---

## Netlify Function Standardstruktur

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
  const apiStart = Date.now();
  try {
    // Logik hier
  } catch (err) {
    console.error('[function-name] Error:', err.message);
    return safeErrorResponse(500, 'Fehlertext auf Deutsch', origin, err);
  }
};
```

---

## Feature Flags

In Supabase-Tabelle `feature_flags`. Nie hardcoden:

```javascript
const res = await fetch(
  `${SUPABASE_URL}/rest/v1/feature_flags?key=in.(flag_1,flag_2)&select=*`,
  { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
);
const flags = await res.json();
const isEnabled = flags.find(f => f.key === 'flag_1')?.enabled === true;
```

---

## Airtable Paginierung — immer implementieren

```javascript
const records = [];
let offset = null;
do {
  let url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLE}?pageSize=100`;
  if (filterFormula) url += `&filterByFormula=${encodeURIComponent(filterFormula)}`;
  if (offset) url += `&offset=${encodeURIComponent(offset)}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } });
  if (!res.ok) throw new Error(`Airtable failed: ${res.status}`);
  const data = await res.json();
  records.push(...(data.records || []));
  offset = data.offset || null;
} while (offset);
```

---

## Code-Konventionen

- **Fehlermeldungen:** User-facing auf Deutsch, `console.error()` auf Englisch mit `[function-name]` Prefix
- **Supabase Queries:** Immer `select=feld1,feld2` (nie `select=*`), immer `limit` setzen
- **API Logging:** `logApiCall()` nach jedem externen Call (Airtable, Supabase, SuperChat)
- **Datums-Konvertierung:** NIEMALS `toISOString().split('T')[0]` — immer lokale CET-Berechnung
- **Booking Status:** `booked` und `confirmed` werden IMMER als "Eingebucht" angezeigt
- **Attachments:** Airtable-URLs verfallen nach 2h — `resolveRecordImages()` aus `attachmentResolver.js` nutzen

---

## Git Workflow

```
feature/install-booker-jwt-auth     # Neue Features
fix/phone-normalisierung-at-ch      # Bugfixes
chore/airtable-felder-update        # Config, Dependencies
hotfix/superchat-template-approval  # Kritische Fixes
```

Regeln: Kein direkter Push auf `main`. `npm run build` muss lokal grün sein.

---

## Vor jeder neuen Netlify Function

1. Prüfen ob Airtable-Felder bereits in `shared/airtableFields.js` existieren
2. Prüfen ob Transformer in `shared/airtableMappers.js` existiert
3. Function nach Standardmuster (oben) aufbauen
4. Security-Imports + API-Logging einbauen
5. Fehlertexte auf Deutsch

## Vor jedem Commit

- [ ] `npm run build` erfolgreich
- [ ] Keine Secrets im Code
- [ ] Neue Tabellen haben RLS aktiviert
- [ ] Neue Functions nutzen `shared/security.js` und `shared/apiLogger.js`
- [ ] Airtable-Felder kommen aus Konstanten
- [ ] Fehlertexte auf Deutsch
