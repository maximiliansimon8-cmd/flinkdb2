/**
 * Netlify Function: Claude Chat API Proxy + Feedback Storage + Memory
 *
 * Modes:
 *   mode='chat'         — Streams Claude (Sonnet) responses via SSE
 *   mode='feedback'     — Saves feature requests / bug reports to Supabase
 *   mode='memory-save'  — Saves agent memory to Supabase
 *   mode='memory-load'  — Loads agent memories from Supabase
 *
 * Security: Origin validation, restricted CORS.
 * Environment variables required (set in Netlify dashboard):
 *   ANTHROPIC_API_KEY          – Anthropic API key
 *   SUPABASE_URL               – Supabase project URL (for feedback + memory)
 *   SUPABASE_SERVICE_ROLE_KEY  – Supabase service role key (for feedback + memory)
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString, safeErrorResponse,
} from './shared/security.js';
import { logApiCall, estimateClaudeCost } from './shared/apiLogger.js';

/* ─── System prompt (hardcoded) ─── */
const SYSTEM_PROMPT = `Du bist J.E.T. — Jarvis-Enhanced Thinking — der analytische Sparringspartner für das JET Germany Display Network.

DEINE ROLLE:
Du bist ein datengetriebener Analyst. Du antwortest PRÄZISE auf die gestellte Frage. Nicht mehr, nicht weniger.

WER MIT DIR SPRICHT:
Interner JET-Mitarbeiter (Admin, Ops Manager, Team-Lead). Duze ihn. Gib kompakte Briefings.

ANTWORT-REGELN — HÖCHSTE PRIORITÄT:
1. Beantworte NUR was gefragt wurde. Öffne KEINE neuen Themen.
2. Wenn gefragt "Wie viele Installationen diese Woche?" → Antworte NUR mit Installationszahlen. NICHT Tasks, NICHT Quality-Checks, NICHT Empfehlungen zu anderen Themen.
3. Empfehlungen nur wenn sie DIREKT zur Frage gehören. "Wie viele Installs?" braucht KEINE Task-Empfehlung.
4. Max 5-8 Zeilen. Bullets statt Fließtext. **Fett** für Key Numbers.
5. STRENG VERBOTEN: Themenwechsel, ungebetene Analysen, Einleitungen, Wiederholungen, offensichtliche Erklärungen.

BUSINESS-GLOSSAR — KORREKTE DEFINITIONEN:
Diese Definitionen sind VERBINDLICH. Verwende sie IMMER korrekt:

**Akquise-Pool / Lead-Pool:**
- acquisition.total = ALLE jemals für Akquise freigegebenen Standorte (ALL-TIME). Das ist der Gesamtpool.
- "New Lead" = Noch nicht bearbeitet. Nur ein Name in der Datenbank. NICHT Teil der aktiven Pipeline!
- byCityDetail[stadt].newLeads = Nicht-bearbeitete Leads. Diese Zahl ist für Pipeline-Berechnungen IRRELEVANT.

**Aktive Pipeline (= was wirklich zählt):**
- Pipeline = Leads die AKTIV bearbeitet werden = Contacted + Approved + Frequency Check + Ready for Install + Installation
- Pipeline-Berechnung: byCityDetail[stadt].active MINUS byCityDetail[stadt].newLeads
- Wenn User nach "Pipeline" fragt, zeige NUR die aktive Pipeline, NIEMALS den Gesamtpool mit New Leads!
- Install-Rate = installed / (aktive Pipeline), NICHT installed / total!

**Installationen (rollout.installationen):**
- erfolgreicheInstallationen = NUR erfolgreich aufgebaute Displays (Status "Installiert"/"Erfolgreich")
- gesamtTermine = ALLE Termine inkl. Abbrüche und Planung
- letzte7Tage / letzte30Tage / letzte90Tage = nur ERFOLGREICHE Installationen im Zeitraum
- gesamtTermine7Tage / gesamtTermine30Tage = alle Termine inkl. Abbrüche im Zeitraum
- byStatus = Verteilung aller Termine nach Status
- WICHTIG: Wenn User fragt "wie viele installiert/aufgebaut?" → IMMER erfolgreicheInstallationen verwenden, NIEMALS gesamtTermine!
- Wenn User fragt "wie viele Termine?" → gesamtTermine verwenden
- Abbrüche = gesamtTermine minus erfolgreicheInstallationen (oder aus byStatus ablesen)

**Deinstallationen (rollout.deinstallationen):**
- Jede Zeile = ein Abbau-Auftrag
- reason = Warum abgebaut wurde

**Stornos (acquisition.stornos):**
- akquiseStorno = Lead wurde VOR Installation abgebrochen (kein Interesse, Vermieter lehnt ab, etc.)
- postInstallStorno = Display WAR aufgebaut, wurde DANACH wieder abgebaut (Churn)
- Das sind VERSCHIEDENE Dinge! Storno ≠ Deinstallation, aber postInstallStorno führt zu einer Deinstallation.

**"Bereit für Aufbau" = readyForInstall:**
- Standorte die alle Prüfungen bestanden haben und auf einen Installationstermin warten
- DAS ist die relevante Pipeline-Metrik für "was steht an?"

**"In Prüfung" = Frequency Check / Approved (noch nicht readyForInstall):**
- Leads die gerade geprüft werden (Frequenzmessung, Genehmigung)

**Konversionsrate:**
- NIEMALS total (mit New Leads) als Basis nehmen!
- Konversion = installed / aktive Pipeline (ohne New Leads, ohne Stornos)
- Für spezifische Stufen: signed → approved → readyForInstall → installed

DATEN IM KONTEXT:
Du bekommst bei jeder Nachricht aktuelle Dashboard-Daten als JSON:
- **overview**: Gesamt-KPIs (totalDisplays, healthRate, online/warning/critical/permanentOffline, newDisplays, deinstalled)
- **performance**: Health-Rate-Trend (Start → Ende → Veränderung), Durchschnittswerte
- **cities**: Alle Städte mit Total, Online, Warning, Critical, HealthRate
- **allDisplays**: ALLE aktiven Displays mit id, loc (Standortname), city, status, offH (Offline-Stunden), sn (Seriennummer) — nutze diese Liste um JEDEN Standort nachzuschlagen!
- **offlineDisplays**: Top 15 Langzeit-Offline-Displays (sortiert nach Offline-Stunden)
- **criticalDisplays**: Alle kritischen/permanent-offline Displays
- **warningDisplays**: Displays im Warning-Status
- **recentlyInstalled**: Neue Installationen der letzten 30 Tage
- **hardware**: OPS-Geräte, SIM-Karten, Bank-Leasing, CHG-Counts
- **tasks**: Task-Übersicht mit:
  - Counts: open/completed, byStatus, byPartner, byPriority
  - **problemCategories**: Automatische Kategorisierung ALLER Tasks (Content & Werbemittel, Offline / Kein Signal, Installation, Inspektion / Follow-up, Hardware-Defekt, Stromversorgung, Repositionierung, etc.)
  - **locationHotspots**: Top 15 Standorte mit den meisten offenen Tasks (mit Overdue-Count und Kategorien) — zeigt wo die größten Probleme sind!
  - **partnerPerformance**: Top 10 Partner mit Overdue-Rate und Haupt-Problemkategorie — zeigt wer hinterherhinkt!
  - **cityDistribution**: Task-Verteilung nach Stadt mit Overdue-Counts
  - **allOpenTasks**: ALLE offenen Tasks mit VOLLEM Text (title, description OHNE Limit, category, locations, displayIds) — durchsuche diese Liste wenn der User nach Tasks für einen bestimmten Standort/Partner fragt!
  - **overdueTasks**: Top 20 überfällige Tasks mit Kategorisierung
- **acquisition**: Akquise-Pipeline mit:
  - total, stornoCount, gewonnenLive, readyForInstall, withContract
  - **byLeadStatus**: Counts pro Lead-Status
  - **byCity**: Einfache Counts pro Stadt
  - **byCityDetail**: DETAILLIERTE Stats pro Stadt mit {total, active, signed, live, installed, storno, newLeads, contacted, approved, readyForInstall, inInstallation, byStatus, byPLZ, installMetrics}. NUTZE DIESE für stadt-spezifische Fragen!
    - **byPLZ**: Top-10 PLZ (Postleitzahlen) pro Stadt mit {total, live, installed, storno}. Nutze diese für PLZ-spezifische Fragen ("Wie viele Leads in PLZ 10115?", "Welche PLZ hat die meisten Installationen?")
    - **installMetrics**: {installRate (% der aktiven Leads die installiert sind), avgDaysToInstall (Ø Tage von Akquise bis Installation), installedCount}. Nur vorhanden wenn Installationen existieren.
  - **byPLZOverview**: Top-20 PLZ über ALLE Städte mit {plz, total, live, installed, storno, city}. Nutze diese für PLZ-übergreifende Fragen!
  - last7Days, last30Days mit Lead-Status-Breakdown
  - **stornos**: Zeitliche Storno-Aufschlüsselung mit {gesamt, letzte7Tage, letzte30Tage, letzte30TageGruende (Grund → Count), letzte30TageByCity, letzte7Detail (location, city, type, reasons)}. NUTZE DIESE für Storno-Fragen wie "Wie viele Stornos diese Woche?" oder "Warum wurde abgebrochen?"
- **rollout**: Installations- und Deinstallations-Daten aus den Ops-Tabellen:
  - **installationen**: Echte Installationstermine
    - erfolgreicheInstallationen — NUR erfolgreich aufgebaute (= Headline-Zahl für "wie viele installiert?")
    - letzte7Tage, letzte30Tage, letzte90Tage — nur ERFOLGREICHE Installationen pro Zeitraum
    - gesamtTermine — ALLE Termine inkl. Abbrüche (für "wie viele Termine?")
    - gesamtTermine7Tage, gesamtTermine30Tage — alle Termine inkl. Abbrüche pro Zeitraum
    - **byStatus**: Status-Verteilung ALLER Termine (z.B. "Installiert", "Abgebrochen", "Geplant")
    - **topIntegrators**: Top 10 Integratoren/Partner nach Installations-Anzahl (name, total, last30)
    - **weeklyTrend**: Wöchentliche Installations-Zahlen (KW → Count, letzte 12 Wochen)
    - **letzte7Detail**: Details der Installationen der letzten 7 Tage (date, status, integrator, type, displays)
  - **deinstallationen**: Abbau-Aufträge
    - total, letzte7Tage, letzte30Tage — Anzahl pro Zeitraum
    - **reasons**: Gründe für Deinstallationen (Grund → Count)
    - **letzte30TageReasons**: Gründe nur der letzten 30 Tage
    - **byCity**: Deinstallationen nach Stadt
    - **letzte7Detail**: Details der Deinstallationen der letzten 7 Tage
  - **nettoLetzten30Tage**: Netto-Aufbau der letzten 30 Tage (Installs - Deinstalls)
  NUTZE rollout.installationen für Fragen wie "Wie viele wurden diese Woche aufgebaut?", "Welcher Integrator macht die meisten Installs?", "Wie viele Termine gab es?"
  NUTZE rollout.deinstallationen für Fragen wie "Wie viele wurden abgebaut?", "Warum wurde deinstalliert?"
- **recentTrend**: Health-Rate und Status-Zahlen der letzten 7 Tage (Tageswerte mit date, healthRate, total, online, warning, critical, permanentOffline)
- **fullTrend**: Tägliche Werte der letzten 30 TAGE — nutze diese für Periodenvergleiche! Keys: date, hr (healthRate), t (total), on (online), w (warning), c (critical), po (permanentOffline). IMMER diese echten Daten verwenden für Vorzeitraum-Vergleiche.
- **preComputedInsights**: Vorberechnete Analysen (cityRanking, riskDisplays, taskHealth, pipelineHealth, trendDirection)

Bei spezifischen Standort-Anfragen bekommst du zusätzlich:
- Display-Details, Stammdaten, Hardware, Installation, Akquise, Account-Verknüpfung über alle 7 Systeme
- [Zugehörige Tasks für diesen Standort] — gefilterte Tasks die zu diesem Display passen
- [Akquise-Daten] — Wenn die JET-ID / der Standort NICHT in aktiven Displays ist, wird in der Akquise-Pipeline gesucht. Diese Daten zeigen den Akquise-Status, Partner, Vertrag, Installations-Status etc. für Standorte die noch nicht live sind oder deinstalliert wurden.

WICHTIG — STANDORT-DETAILS:
- Du hast in allDisplays ALLE Standorte. Suche dort den passenden Eintrag wenn der User nach einem Standort fragt.
- In tasks.allOpenTasks sind ALLE offenen Tasks mit locations[] und displayIds[] — durchsuche die Liste manuell nach dem Standortnamen wenn du Tasks für einen Standort brauchst.
- Wenn dir [Zugehörige Tasks] gegeben werden, nutze primär diese. Falls leer, suche selbst in allOpenTasks.
- Task-Descriptions sind VOLLSTÄNDIG — lies sie komplett um die genauen Probleme zu identifizieren.
- Jeder Task hat ein "category"-Feld (z.B. "Offline / Kein Signal", "Installation", "Content & Werbemittel") — nutze es für Problem-Analysen.

PROBLEM-ANALYSE — WENN GEFRAGT:
- Nutze tasks.problemCategories für die Verteilung der Problemtypen
- Nutze tasks.locationHotspots um Standorte mit den meisten Problemen zu identifizieren
- Nutze tasks.partnerPerformance um Partner mit hoher Overdue-Rate zu finden
- Nutze tasks.cityDistribution um Stadt-Schwerpunkte zu erkennen
- Wenn nach "wo ist das Problem" gefragt wird: Nenne KONKRET den Standort, die Stadt, und den verantwortlichen Partner
- Wenn nach "wer soll sich kümmern" gefragt wird: Nenne den zuständigen Partner aus dem Task

WICHTIG — DATENINTERPRETATION:
- NIEMALS Daten schätzen, raten oder mit "~" markieren! Nutze IMMER die echten Werte aus den Daten.
- Für Vorzeitraum-Vergleiche: Teile fullTrend in zwei Hälften (z.B. Tag 1-7 vs Tag 8-14) und berechne echte Durchschnitte.
- "total" bei Akquise = Gesamtzahl aller für Akquise FREIGEGEBENEN Standorte (ALL-TIME). Das sind NICHT aktive Displays, sondern potenzielle Standorte in der Pipeline.
- In byLeadStatus stehen die Lead-Status-Counts. "Gewonnen" = konvertierte/gewonnene Standorte. Davon sind nur die "abgerufen" (mit tatsächlicher Installation) wirklich live.
- Für zeitbasierte Akquise-Fragen nutze "last7Days"/"last30Days". Für Storno-Fragen nutze acquisition.stornos (letzte7Tage, letzte30Tage, Gründe).
- Für Installations-/Rollout-Fragen nutze rollout.installationen (erfolgreicheInstallationen = Gesamtzahl aufgebaut, letzte7Tage = "diese Woche aufgebaut" NUR erfolgreiche, gesamtTermine = alle Termine inkl. Abbrüche, byStatus = Status-Verteilung, topIntegrators = wer hat installiert). Für Deinstallations-Fragen nutze rollout.deinstallationen.
- STADT-SPEZIFISCHE AKQUISE-FRAGEN: Nutze acquisition.byCityDetail[stadtName] für exakte Zahlen! Dort findest du total, active, signed, live, installed, storno, newLeads, byPLZ (PLZ-Breakdown), installMetrics (Install-Rate, Ø Tage). NIEMALS schätzen wenn die Daten da sind!
- PLZ-FRAGEN: Nutze byCityDetail[stadt].byPLZ für stadt-spezifische PLZ-Daten oder byPLZOverview für die Top-20 PLZ netzwerkweit. Wenn User nach einem PLZ fragt, schaue in der passenden Stadt nach.
- STADT-ALIASE: FFM=Frankfurt, HH=Hamburg, BER=Berlin, MUC=München, CGN=Köln, DUS=Düsseldorf. Wenn User "FFM" sagt, schaue unter "Frankfurt" nach!
- Wenn ein Feld null ist: sage "Keine Daten vorhanden" — erfinde KEINE Daten
- "installDatenVorhanden": false → "Keine Installationsdaten in der Datenbank"
- "akquiseDatenVorhanden": false → "Keine Akquise-Daten verknüpft"
- Beziehe dich IMMER auf [Spezifische Display-Daten] der AKTUELLEN Nachricht, nie auf alte Standorte

KONTEXT-VERANKERUNG:
- Wenn der Benutzer nach einem neuen Standort fragt, fokussiere dich NUR auf diesen
- Mische NIEMALS Daten von verschiedenen Standorten

TASK-ERSTELLUNG — NUR wenn der User EXPLIZIT einen Task anlegen will:
Erstelle NIEMALS ungefragt Tasks oder schlage Tasks vor. Nur wenn der User sagt "erstelle Task", "leg Task an" o.ä.:
1. Marker: [TASK]{"title":"...","description":"...","partner":"...","priority":"Medium","status":"New","dueDate":"YYYY-MM-DD"}[/TASK]

EINSCHRÄNKUNGEN — STRIKT:
- Antworte auf Deutsch, es sei denn der Benutzer schreibt auf Englisch
- Erwähne KEINE Tasks wenn nicht nach Tasks gefragt wurde
- Erwähne KEINE Empfehlungen zu Themen die nicht gefragt wurden
- Wenn gefragt "Wie viele Installs?" → NUR Installationszahlen, NICHT Tasks/Backlogs/Empfehlungen
- Wenn gefragt "Health Rate?" → NUR Health Rate, NICHT Pipeline/Installs/Tasks
- Wenn gefragt "Pipeline Köln?" → NUR Pipeline-Daten Köln (OHNE New Leads!), NICHT andere Städte
- Öffne NIEMALS ein neues Thema das der User nicht angesprochen hat
- Bei Akquise-Analysen: Verwende IMMER die Pipeline-Definition aus dem Business-Glossar (ohne New Leads!)

GEDÄCHTNIS / MEMORY — DEIN LERNZENTRUM:
Du lernst aktiv dazu. Bei jeder Nachricht bekommst du unter [Agent-Gedächtnis] deine bisherigen Erkenntnisse. Nutze sie, um immer bessere Analysen zu liefern.

DEIN LERN-MINDSET:
Du bist ein System das sich selbst beibringt. Jede Interaktion ist eine Chance zu lernen:
- Was sagt der Admin? Seine Einschätzungen, Korrekturen, Prioritäten = Gold wert
- Welche Muster siehst du wiederholt? Speichere sie für zukünftige Analysen
- Was hat sich verändert seit dem letzten Gespräch? Deltas erkennen und merken
- Wie reagiert der User? Passt er deine Empfehlungen an? → lerne daraus

WANN speichern — SEI PROAKTIV:
- Admin korrigiert dich oder ergänzt Kontext → IMMER speichern (relevanceScore: 8-10)
- Admin trifft eine operative Entscheidung → speichern als "decision"
- Du siehst ein Muster zum 2. Mal → speichern (beim 1. Mal noch nicht)
- Admin teilt Wissen das nicht in den Daten steckt ("Partner X ist unzuverlässig", "Standort Y hat Stromprobleme") → sofort speichern
- Admin sagt was ihm wichtig ist, wie er Dinge sehen will → "preference" speichern
- Du erkennst Trends über Zeit (Health Rate fällt seit 3 Tagen) → "insight" speichern
- Admin gibt dir Feedback zu deinen Antworten → als "preference" merken

WANN NICHT speichern:
- Triviale Datenfakten die sich jederzeit aus den Daten ergeben
- Einmalige Fragen ohne strategische Bedeutung
- Wiederholung eines bereits gespeicherten Memory

WIE du speicherst:
Füge am Ende deiner Antwort ein:
[MEMORY]{"category":"insight","content":"Kurze Erkenntnis (max 200 Zeichen)","metadata":{},"relevanceScore":5}[/MEMORY]

Erlaubte Kategorien (NUR diese!):
- "insight" — Muster, Trends, Analysen, wiederkehrende Probleme
- "decision" — Operative Entscheidungen (Deinstall, Eskalation, Priorisierung)
- "preference" — Wie der Admin arbeiten will, was ihm wichtig ist
- "context" — Hintergrundwissen zu Standorten/Partnern/Prozessen das nicht in den Daten steht
- "pin" — User sagt explizit "merk dir das"

relevanceScore-Guide:
- 1-3: Nice-to-know, schwaches Muster
- 4-6: Solides Muster, nützlicher Kontext
- 7-8: Wichtige Erkenntnis, Admin-Entscheidung
- 9-10: Geschäftskritisch, wiederholt bestätigtes Muster, Admin-Priorität

Max 1 Memory pro Antwort. Content max 200 Zeichen.

WIE du Memories NUTZT — SEI INTELLIGENT:
- Verknüpfe aktuelle Daten mit gespeicherten Erkenntnissen: "Passt zum bekannten Muster..."
- Wenn ein Memory relevant ist, erwähne es aktiv — zeig dem User dass du lernst
- Nutze Memories um bessere Empfehlungen zu geben: "Basierend auf der Erfahrung mit X..."
- Widerspreche alten Memories wenn die Daten sich geändert haben — und update das Memory

STIL:
- KURZ. Max 5-8 Zeilen. Bullets statt Absätze.
- **Fettdruck** für Key Numbers und Headlines
- Empfehlung NUR wenn sie direkt zur gestellten Frage passt — NICHT bei jeder Antwort
- Keine Floskeln, keine Einleitungen, kein Filler
- NICHT proaktiv andere Themen ansprechen`;

/* ─── Model fallback chain ─── */
const MODEL_CHAIN = [
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku-20241022',
  'claude-sonnet-4-5-20250929',
];

/* ─── Retry config for transient errors ─── */
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 3000];

/**
 * Parse an Anthropic error response body to extract the error type and message.
 */
function parseAnthropicError(status, bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    return {
      type: parsed.error?.type || 'unknown_error',
      message: parsed.error?.message || bodyText.substring(0, 300),
    };
  } catch {
    return { type: 'parse_error', message: bodyText.substring(0, 300) };
  }
}

/**
 * Check if an error indicates the model is not found / not available.
 */
function isModelNotFoundError(status, errorType, errorMessage) {
  if (status === 404) return true;
  if (errorType === 'not_found_error') return true;
  if (errorType === 'invalid_request_error' && /model/i.test(errorMessage)) return true;
  return false;
}

/**
 * Build a human-readable German error message from Anthropic error details.
 */
function buildErrorMessage(status, errorType, errorMessage) {
  if (status === 401) return `KI-Service Authentifizierung fehlgeschlagen. (${errorType})`;
  if (status === 403) return `KI-Service Zugriff verweigert. (${errorType})`;
  if (status === 404) return `KI-Modell nicht gefunden. (${errorMessage})`;
  if (status === 429) return 'Zu viele Anfragen. Bitte kurz warten.';
  if (status === 400) return `Ungültige Anfrage: ${errorMessage}`;
  if (status === 529) return 'Anthropic API überlastet. Bitte kurz warten.';
  if (status >= 500) return `KI-Service temporär nicht erreichbar (${status}).`;
  return `KI-Fehler: ${errorType} — ${errorMessage}`;
}

/**
 * Make a single Anthropic API call (streaming).
 * Returns { ok, response, status, errorType, errorMessage, model }
 */
async function callAnthropic(apiKey, model, messages, maxTokens = 2048) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    }),
  });

  if (res.ok) {
    return { ok: true, response: res, status: 200, errorType: null, errorMessage: null, model };
  }

  const bodyText = await res.text().catch(() => '');
  const { type, message } = parseAnthropicError(res.status, bodyText);
  console.error(`[chat-proxy] Anthropic error (model=${model}): ${res.status} ${type} — ${message}`);

  return {
    ok: false,
    response: null,
    status: res.status,
    errorType: type,
    errorMessage: message,
    model,
  };
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ─── Chat mode: stream from Anthropic (with fallback + retry) ─── */
async function handleChat(body, origin) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('[chat-proxy] ANTHROPIC_API_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Chat-Assistent nicht konfiguriert. API-Key fehlt in den Netlify-Einstellungen.', errorCode: 'NO_API_KEY' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  // Build enriched user message
  let userContent = '';
  if (body.context) {
    userContent += `[Kontext — JET Display Network]\n${JSON.stringify(body.context)}\n\n`;
  }
  if (body.displayContext) {
    userContent += `[Spezifische Display-Daten — DIESE Daten gelten für die aktuelle Frage]\n${JSON.stringify(body.displayContext)}\n\n`;
  }
  if (body.taskContext) {
    userContent += `[Zugehörige Tasks für diesen Standort]\n${JSON.stringify(body.taskContext)}\n\n`;
  }
  if (body.acquisitionContext) {
    userContent += `[Akquise-Daten — Standort(e) aus der Akquise-Pipeline (nicht in aktiven Displays)]\n${JSON.stringify(body.acquisitionContext)}\nHinweis: Diese Standorte sind noch NICHT als Live-Display aktiv, sondern in der Akquise-/Installations-Pipeline. Nutze diese Daten um Fragen zu JET-IDs, Akquise-Status, Installationsdatum etc. zu beantworten.\n\n`;
  }
  if (body.accountLinks) {
    userContent += `[Account-Verknüpfung über Systeme]\n${JSON.stringify(body.accountLinks)}\n\n`;
  }
  if (body.memoryContext && body.memoryContext.length > 0) {
    userContent += `[Agent-Gedächtnis — Erkenntnisse aus früheren Sessions]\n${JSON.stringify(body.memoryContext)}\n\n`;
  }
  userContent += `[Benutzerfrage]\n${body.message}`;

  // Build messages array with conversation history
  const messages = [];
  if (Array.isArray(body.conversationHistory)) {
    for (const msg of body.conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }
  messages.push({ role: 'user', content: userContent });

  const apiStart = Date.now();
  let lastError = null;
  let usedModel = null;

  // Try each model in the fallback chain
  for (let modelIdx = 0; modelIdx < MODEL_CHAIN.length; modelIdx++) {
    const model = MODEL_CHAIN[modelIdx];

    // Retry loop for transient errors on each model
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await callAnthropic(ANTHROPIC_API_KEY, model, messages);

      if (result.ok) {
        usedModel = model;
        const wasFallback = modelIdx > 0;
        if (wasFallback) {
          console.log(`[chat-proxy] Fallback to model ${model} succeeded (primary was ${MODEL_CHAIN[0]})`);
        }

        // Log successful stream initiation
        logApiCall({
          functionName: 'chat-proxy',
          service: 'anthropic',
          method: 'STREAM',
          endpoint: '/v1/messages',
          durationMs: Date.now() - apiStart,
          statusCode: 200,
          success: true,
          userId: body.userId || null,
          metadata: { model: usedModel, maxTokens: 2048, fallback: wasFallback, attempt },
        });

        // Inject model info as first SSE event, then stream the rest
        const modelInfoEvent = `data: ${JSON.stringify({ type: 'model_info', model: usedModel, fallback: wasFallback })}\n\n`;
        const encoder = new TextEncoder();
        const modelInfoChunk = encoder.encode(modelInfoEvent);

        // Create a ReadableStream that first emits model info, then pipes the API body
        const combinedStream = new ReadableStream({
          async start(controller) {
            controller.enqueue(modelInfoChunk);
            const reader = result.response.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            } catch (err) {
              console.error('[chat-proxy] Stream read error:', err.message);
            } finally {
              controller.close();
            }
          },
        });

        return new Response(combinedStream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            ...corsHeaders(origin),
          },
        });
      }

      // Error path
      lastError = result;

      // If model not found, skip retries and try next model in chain
      if (isModelNotFoundError(result.status, result.errorType, result.errorMessage)) {
        console.warn(`[chat-proxy] Model ${model} not found, trying next in fallback chain...`);
        break; // break retry loop, continue model loop
      }

      // If auth error (401/403), no point retrying or trying other models
      if (result.status === 401 || result.status === 403) {
        logApiCall({
          functionName: 'chat-proxy',
          service: 'anthropic',
          method: 'POST',
          endpoint: '/v1/messages',
          durationMs: Date.now() - apiStart,
          statusCode: result.status,
          success: false,
          errorMessage: `${result.errorType}: ${result.errorMessage}`,
          userId: body.userId || null,
          metadata: { model },
        });
        const errorMsg = buildErrorMessage(result.status, result.errorType, result.errorMessage);
        return new Response(
          JSON.stringify({ error: errorMsg, errorCode: 'AUTH_ERROR', details: result.errorType }),
          { status: result.status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
        );
      }

      // If transient error and we have retries left, wait and retry
      if (TRANSIENT_STATUS_CODES.has(result.status) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt] || 3000;
        console.log(`[chat-proxy] Transient error ${result.status} on ${model}, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      // Non-retryable, non-model-not-found error: try next model
      break;
    }
  }

  // All models and retries exhausted
  const finalStatus = lastError?.status || 500;
  const finalErrorType = lastError?.errorType || 'unknown';
  const finalErrorMsg = lastError?.errorMessage || 'Alle KI-Modelle nicht erreichbar.';

  logApiCall({
    functionName: 'chat-proxy',
    service: 'anthropic',
    method: 'POST',
    endpoint: '/v1/messages',
    durationMs: Date.now() - apiStart,
    statusCode: finalStatus,
    success: false,
    errorMessage: `All models failed. Last: ${finalErrorType}: ${finalErrorMsg}`,
    userId: body.userId || null,
    metadata: { triedModels: MODEL_CHAIN, lastModel: lastError?.model },
  });

  const userErrorMsg = buildErrorMessage(finalStatus, finalErrorType, finalErrorMsg);
  return new Response(
    JSON.stringify({
      error: userErrorMsg,
      errorCode: 'ALL_MODELS_FAILED',
      details: finalErrorType,
      triedModels: MODEL_CHAIN,
    }),
    { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
  );
}

/* ─── Feedback mode: save to Supabase ─── */
async function handleFeedback(body, origin) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Feedback-Service nicht konfiguriert.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  const { type, title, description, userId, userName, userEmail } = body.feedbackData || {};

  if (!type || !title || !userId || !userName) {
    return new Response(
      JSON.stringify({ error: 'Pflichtfelder fehlen: type, title, userId, userName.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback_requests`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      user_name: userName,
      user_email: userEmail || null,
      type,
      title,
      description: description || null,
      priority: 'medium',
      status: 'open',
    }),
  });

  logApiCall({
    functionName: 'chat-proxy',
    service: 'supabase',
    method: 'POST',
    endpoint: '/feedback_requests',
    statusCode: res.status,
    success: res.ok,
    recordsCount: 1,
    userId: body.feedbackData?.userId || null,
    errorMessage: res.ok ? null : `Supabase feedback error: ${res.status}`,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[chat-proxy] Supabase feedback error:', res.status, errText);
    return new Response(
      JSON.stringify({ error: 'Fehler beim Speichern des Feedbacks.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  const data = await res.json();
  const inserted = Array.isArray(data) ? data[0] : data;

  return new Response(
    JSON.stringify({ success: true, id: inserted.id }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
  );
}

/* ─── Memory: save to Supabase ─── */
async function handleMemorySave(body, origin) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Memory-Service nicht konfiguriert.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  const { category, content, metadata, relevanceScore, createdBy } = body.memoryData || {};

  if (!content) {
    return new Response(
      JSON.stringify({ error: 'Pflichtfeld fehlt: content.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  // Validate category — fallback to 'insight' if agent sends invalid value
  const VALID_CATEGORIES = ['insight', 'decision', 'preference', 'context', 'pin'];
  const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'insight';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_memory`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      category: safeCategory,
      content: content.substring(0, 500),
      metadata: metadata || {},
      relevance_score: Math.min(10, Math.max(1, relevanceScore || 5)),
      created_by: createdBy || null,
      active: true,
    }),
  });

  logApiCall({
    functionName: 'chat-proxy',
    service: 'supabase',
    method: 'POST',
    endpoint: '/agent_memory',
    statusCode: res.status,
    success: res.ok,
    recordsCount: 1,
    userId: body.memoryData?.createdBy || null,
    errorMessage: res.ok ? null : `Supabase memory save error: ${res.status}`,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[chat-proxy] Supabase memory save error:', res.status, errText);
    return new Response(
      JSON.stringify({ error: 'Fehler beim Speichern des Memory.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  const data = await res.json();
  const inserted = Array.isArray(data) ? data[0] : data;

  return new Response(
    JSON.stringify({ success: true, id: inserted.id }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
  );
}

/* ─── Memory: load from Supabase ─── */
async function handleMemoryLoad(body, origin) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ memories: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }

  try {
    // Load top 20 active memories, sorted by relevance and recency
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_memory?active=eq.true&order=relevance_score.desc,last_used_at.desc&limit=20`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!res.ok) {
      logApiCall({
        functionName: 'chat-proxy',
        service: 'supabase',
        method: 'GET',
        endpoint: '/agent_memory',
        statusCode: res.status,
        success: false,
        errorMessage: `Memory load error: ${res.status}`,
      });
      console.error('[chat-proxy] Memory load error:', res.status);
      return new Response(
        JSON.stringify({ memories: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    const memories = await res.json();

    logApiCall({
      functionName: 'chat-proxy',
      service: 'supabase',
      method: 'GET',
      endpoint: '/agent_memory',
      statusCode: res.status,
      success: true,
      recordsCount: memories.length,
    });

    // Update last_used_at for loaded memories (fire-and-forget)
    // Note: use_count increment via RPC would be ideal, but PATCH with
    // individual values isn't feasible in a single call. We only update last_used_at.
    if (memories.length > 0) {
      const ids = memories.map(m => m.id);
      fetch(`${SUPABASE_URL}/rest/v1/agent_memory?id=in.(${ids.join(',')})`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last_used_at: new Date().toISOString(),
        }),
      }).catch(() => {}); // fire-and-forget
    }

    // Return simplified memory objects for context injection
    const simplified = memories.map(m => ({
      id: m.id,
      category: m.category,
      content: m.content,
      metadata: m.metadata,
      relevance: m.relevance_score,
      createdAt: m.created_at,
      createdBy: m.created_by,
    }));

    return new Response(
      JSON.stringify({ memories: simplified }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  } catch (err) {
    console.error('[chat-proxy] Memory load error:', err);
    return new Response(
      JSON.stringify({ memories: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }
}

/* ─── Health check: test API key and model availability ─── */
async function handleHealth(origin) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const jsonHeaders = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        status: 'error',
        error: 'ANTHROPIC_API_KEY not configured',
        keyConfigured: false,
        primaryModel: MODEL_CHAIN[0],
        fallbackModels: MODEL_CHAIN.slice(1),
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: jsonHeaders }
    );
  }

  // Test with a minimal non-streaming request to validate API key + model
  const results = [];
  for (const model of MODEL_CHAIN) {
    try {
      const start = Date.now();
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      const durationMs = Date.now() - start;

      if (res.ok) {
        results.push({ model, status: 'ok', durationMs });
      } else {
        const bodyText = await res.text().catch(() => '');
        const { type, message } = parseAnthropicError(res.status, bodyText);
        results.push({ model, status: 'error', httpStatus: res.status, errorType: type, errorMessage: message, durationMs });
      }
    } catch (err) {
      results.push({ model, status: 'error', errorType: 'network', errorMessage: err.message });
    }
  }

  const anyOk = results.some(r => r.status === 'ok');
  const firstOk = results.find(r => r.status === 'ok');

  return new Response(
    JSON.stringify({
      status: anyOk ? 'ok' : 'error',
      keyConfigured: true,
      activeModel: firstOk?.model || null,
      primaryModel: MODEL_CHAIN[0],
      fallbackModels: MODEL_CHAIN.slice(1),
      modelResults: results,
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: jsonHeaders }
  );
}

/* ─── Main handler ─── */
export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const jsonHeaders = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  // Handle GET requests (health check)
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');
    if (mode === 'health') {
      return await handleHealth(origin);
    }
    return new Response(
      JSON.stringify({ error: 'GET only supports mode=health. Use POST for chat/feedback/memory.' }),
      { status: 400, headers: jsonHeaders }
    );
  }

  // Rate limiting (chat is expensive — 20/min per IP)
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`chat-proxy:${clientIP}`, 20, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  // Only accept POST
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: jsonHeaders }
    );
  }

  try {
    const body = await request.json();
    const mode = body.mode;

    if (mode === 'chat') {
      return await handleChat(body, origin);
    }

    if (mode === 'feedback') {
      return await handleFeedback(body, origin);
    }

    if (mode === 'memory-save') {
      return await handleMemorySave(body, origin);
    }

    if (mode === 'memory-load') {
      return await handleMemoryLoad(body, origin);
    }

    const safeMode = sanitizeString(String(mode || ''), 50);
    return new Response(
      JSON.stringify({ error: `Ungültiger Modus. Erlaubt: chat, feedback, memory-save, memory-load.` }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (err) {
    console.error('[chat-proxy] Error:', err.message);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: jsonHeaders }
    );
  }
};
