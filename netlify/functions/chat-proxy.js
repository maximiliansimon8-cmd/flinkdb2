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

import { getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse } from './shared/security.js';
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
- Jede Zeile = ein Installationstermin/Versuch
- status "Installiert" = erfolgreich aufgebaut
- status "Abgebrochen" = gescheiterter Termin
- status "In Planung" = kommender Termin
- Wenn User fragt "wie viele aufgebaut?" → nur "Installiert" Status zählen
- Wenn User fragt "wie viele Termine?" → alle Termine (inkl. Abgebrochen, In Planung)
- Wenn User nach Abbrüchen fragt → nur "Abgebrochen" Status

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
  - **installationen**: Echte Installationstermine (jede Zeile = ein Installationsversuch/Termin)
    - total, letzte7Tage, letzte30Tage, letzte90Tage — Anzahl Installationen pro Zeitraum
    - **byStatus**: Status-Verteilung aller Installationen (z.B. "Erfolgreich", "Abgebrochen", "Geplant")
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
- Für Installations-/Rollout-Fragen nutze rollout.installationen (letzte7Tage = "diese Woche aufgebaut", byStatus = erfolgreich/abgebrochen, topIntegrators = wer hat installiert). Für Deinstallations-Fragen nutze rollout.deinstallationen.
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

/* ─── Chat mode: stream from Anthropic ─── */
async function handleChat(body, origin) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Chat-Assistent nicht konfiguriert. ANTHROPIC_API_KEY fehlt.' }),
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

  // Call Anthropic Messages API with streaming
  const apiStart = Date.now();
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    }),
  });

  // Handle Anthropic error responses
  if (!anthropicRes.ok) {
    const status = anthropicRes.status;
    if (status === 429) {
      logApiCall({
        functionName: 'chat-proxy',
        service: 'anthropic',
        method: 'POST',
        endpoint: '/v1/messages',
        durationMs: Date.now() - apiStart,
        statusCode: 429,
        success: false,
        errorMessage: 'Rate limited (429)',
        userId: body.userId || null,
      });
      return new Response(
        JSON.stringify({ error: 'Zu viele Anfragen. Bitte kurz warten.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }
    const errText = await anthropicRes.text().catch(() => '');
    console.error('[chat-proxy] Anthropic error:', status, errText);
    // Return more specific error for debugging
    let errorMsg = 'Fehler bei der Verarbeitung.';
    if (status === 401) errorMsg = 'API-Key ungültig. Bitte prüfe den ANTHROPIC_API_KEY in Netlify.';
    else if (status === 403) errorMsg = 'API-Zugriff verweigert. Key hat keine Berechtigung.';
    else if (status === 400) errorMsg = 'Ungültige Anfrage an die KI-API.';
    logApiCall({
      functionName: 'chat-proxy',
      service: 'anthropic',
      method: 'POST',
      endpoint: '/v1/messages',
      durationMs: Date.now() - apiStart,
      statusCode: status,
      success: false,
      errorMessage: errorMsg,
      userId: body.userId || null,
    });
    return new Response(
      JSON.stringify({ error: errorMsg, debug: { status, detail: errText.substring(0, 200) } }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
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
    metadata: { model: 'claude-haiku-4-5-20251001', maxTokens: 1024 },
  });

  // Stream the SSE response through to the client
  return new Response(anthropicRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders(origin),
    },
  });
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

    return new Response(
      JSON.stringify({ error: `Ungültiger Modus: ${mode}. Erlaubt: chat, feedback, memory-save, memory-load.` }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (err) {
    console.error('[chat-proxy] Error:', err);
    return new Response(
      JSON.stringify({ error: `Chat proxy error: ${err.message}` }),
      { status: 500, headers: jsonHeaders }
    );
  }
};
