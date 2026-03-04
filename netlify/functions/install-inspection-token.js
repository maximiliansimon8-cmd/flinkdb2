/**
 * Netlify Function: Install Inspection Token
 *
 * Handles:
 *   - generate:            Creates HMAC token URL for external inspectors (JWT-secured)
 *   - load_installations:  Returns installation data for external viewers (HMAC auth)
 *   - set_freigabe_vorort: Sets Freigabe for external viewers (HMAC auth)
 *   - create_nacharbeit_task: Creates Nacharbeit task for external viewers (HMAC auth)
 *
 * Auth: JWT (generate) + HMAC Token (all other actions)
 */
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
  sanitizeString, isValidAirtableId,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import { INSTALLATION_FIELDS as IF_ } from './shared/airtableFields.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const INSTALLATIONEN_TABLE = 'tblKznpAOAMvEfX8u';
const TASKS_TABLE = 'tblcKHWJg77mgIQ9l';
const INSPECTION_SECRET = process.env.INSPECTION_SECRET || process.env.MONTEUR_SECRET;

const TOKEN_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

if (!INSPECTION_SECRET) console.error('[install-inspection-token] CRITICAL: INSPECTION_SECRET / MONTEUR_SECRET not configured!');

function getLocalDateString(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

// ── Token Generation ──
async function generateToken(inspector, ts) {
  const crypto = await import('node:crypto');
  return crypto.createHmac('sha256', INSPECTION_SECRET)
    .update(`inspection|${inspector}|${ts}`)
    .digest('hex')
    .substring(0, 24);
}

// ── Token Validation ──
async function validateToken(token, inspector, ts) {
  if (!INSPECTION_SECRET || !token || !inspector || !ts) return false;

  // Check expiry (7 days)
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum) || Date.now() - tsNum > TOKEN_VALIDITY_MS) return false;

  const expected = await generateToken(inspector, ts);
  try {
    const crypto = await import('node:crypto');
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// ── Supabase Helper ──
async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  });
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
  return res.json();
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
  }

  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`inspection-token:${clientIP}`, 60, 60_000);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)), ...PUBLIC_CORS } }
    );
  }

  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const body = await request.json();
    const { action } = body;

    // ═══ Action: Generate Token (JWT-secured, dashboard only) ═══
    if (action === 'generate') {
      // Verify JWT from dashboard
      const origin = getAllowedOrigin(request);
      if (!origin) return forbiddenResponse();

      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'JWT erforderlich' }), {
          status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }

      // Verify with Supabase
      const jwt = authHeader.substring(7);
      const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': SUPABASE_KEY },
      });
      if (!verifyRes.ok) {
        return new Response(JSON.stringify({ error: 'Ungueltige Sitzung' }), {
          status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }

      const { inspector, city, integrator } = body;
      if (!inspector || typeof inspector !== 'string' || inspector.length < 2) {
        return new Response(JSON.stringify({ error: 'Inspector-Name erforderlich (min. 2 Zeichen)' }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }

      const sanitizedInspector = sanitizeString(inspector).substring(0, 50);
      const ts = String(Date.now());
      const token = await generateToken(sanitizedInspector, ts);

      // Build URL
      const siteUrl = process.env.URL || 'https://tools.dimension-outdoor.com';
      const params = new URLSearchParams({ token, inspector: sanitizedInspector, ts });
      if (city) params.set('city', sanitizeString(city).substring(0, 50));
      if (integrator) params.set('integrator', sanitizeString(integrator).substring(0, 50));

      const inspectionUrl = `${siteUrl}/inspection/?${params.toString()}`;
      const expiresAt = new Date(Date.now() + TOKEN_VALIDITY_MS).toLocaleDateString('de-DE');

      console.log(`[install-inspection-token] Token generated for inspector="${sanitizedInspector}", expires=${expiresAt}`);

      return new Response(JSON.stringify({
        success: true,
        url: inspectionUrl,
        token,
        inspector: sanitizedInspector,
        expires: expiresAt,
      }), {
        status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // ═══ All other actions require HMAC token ═══
    const { token, inspector, ts } = body;

    if (!token || !inspector || !ts) {
      return new Response(
        JSON.stringify({ error: 'Authentifizierung erforderlich. Bitte gueltigen Prueferlink verwenden.' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS } }
      );
    }

    // Validate input lengths
    if (token.length > 30 || inspector.length > 60 || String(ts).length > 15) {
      return new Response(JSON.stringify({ error: 'Ungueltiges Parameterformat' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const isValid = await validateToken(token, inspector, ts);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Token ungueltig oder abgelaufen. Bitte neuen Link anfordern.' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS } }
      );
    }

    // ═══ Action: Load Installations ═══
    if (action === 'load_installations') {
      const { city, integrator: intFilter } = body;

      const apiStart = Date.now();

      // Build filter
      let filter = `status=in.("Installiert","Installiert - Nacharbeit notwendig")`;
      if (city) filter += `&city=eq.${encodeURIComponent(city)}`;

      const fields = [
        'id', 'airtable_id', 'display_ids', 'install_date', 'status',
        'integrator', 'jet_id', 'location_name', 'city', 'street',
        'street_number', 'postal_code', 'protocol_url', 'protocol_filename',
        'screen_type', 'screen_size',
        'freigabe_online_rate', 'freigabe_installation_vorort',
        'freigabe_chg', 'freigabe_datum_chg', 'akquise_links',
      ].join(',');

      const instData = await supabaseGet(
        `installationen?${filter}&select=${fields}&order=install_date.desc&limit=500`
      );

      // Apply integrator filter if specified (after fetch, since it might be an array field)
      let filtered = instData;
      if (intFilter) {
        filtered = instData.filter(i => (i.integrator || '').toLowerCase().includes(intFilter.toLowerCase()));
      }

      // Load related Nacharbeit tasks
      const taskData = await supabaseGet(
        `tasks?title=ilike.*Nacharbeit*&select=id,title,status,priority,created_time&order=created_time.desc&limit=200`
      );

      logApiCall('supabase', 'GET installations + tasks (inspection)', 200, Date.now() - apiStart);

      console.log(`[install-inspection-token] Data loaded for inspector="${inspector}": ${filtered.length} installations, ${taskData.length} tasks`);

      return new Response(JSON.stringify({
        success: true,
        installations: filtered,
        tasks: taskData,
        inspector,
      }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // ═══ Action: Set Freigabe Vorort (external) ═══
    if (action === 'set_freigabe_vorort') {
      const { installation_airtable_id } = body;
      if (!installation_airtable_id || !isValidAirtableId(installation_airtable_id)) {
        return new Response(JSON.stringify({ error: 'Gueltige installation_airtable_id erforderlich' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
        });
      }

      if (!AIRTABLE_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server-Konfigurationsfehler' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
        });
      }

      // PATCH Airtable: set checkbox
      const apiStart = Date.now();
      const atRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/${INSTALLATIONEN_TABLE}/${installation_airtable_id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: { [IF_.FREIGABE_INSTALLATION_VORORT]: true },
          }),
        }
      );
      logApiCall('airtable', 'PATCH Freigabe Vorort (external)', atRes.status, Date.now() - apiStart);

      if (!atRes.ok) {
        const errText = await atRes.text().catch(() => '');
        console.error(`[install-inspection-token] Airtable PATCH failed: ${atRes.status} ${errText.substring(0, 200)}`);
        return new Response(JSON.stringify({ error: 'Freigabe konnte nicht gesetzt werden' }), {
          status: 502, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
        });
      }

      // Auto-set CHG if both Freigabe fields are now true
      const checkRes = await supabaseGet(
        `installationen?airtable_id=eq.${encodeURIComponent(installation_airtable_id)}&select=freigabe_online_rate&limit=1`
      );
      if (checkRes[0]?.freigabe_online_rate === true) {
        const chgStart = Date.now();
        const chgRes = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE}/${INSTALLATIONEN_TABLE}/${installation_airtable_id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fields: {
                [IF_.FREIGABE_CHG]: true,
                [IF_.FREIGABE_DATUM_CHG]: getLocalDateString(),
              },
            }),
          }
        );
        logApiCall('airtable', 'PATCH Freigabe CHG (auto, external)', chgRes.status, Date.now() - chgStart);
        if (chgRes.ok) {
          console.log(`[install-inspection-token] Auto-set CHG for ${installation_airtable_id} (inspector=${inspector})`);
        }
      }

      console.log(`[install-inspection-token] Freigabe Vorort set by inspector="${inspector}" for ${installation_airtable_id}`);

      return new Response(JSON.stringify({ success: true, action: 'freigabe_vorort_set' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // ═══ Action: Create Nacharbeit Task (external) ═══
    if (action === 'create_nacharbeit_task') {
      const { installation_airtable_id, category, description, location_name, city, display_id, integrator: instIntegrator, install_date, akquise_airtable_id } = body;

      if (!category || !description) {
        return new Response(JSON.stringify({ error: 'Kategorie und Beschreibung erforderlich' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
        });
      }

      if (!AIRTABLE_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server-Konfigurationsfehler' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
        });
      }

      const safeCat = sanitizeString(category).substring(0, 50);
      const safeDesc = sanitizeString(description).substring(0, 500);
      const safeLoc = sanitizeString(location_name || 'Unbekannt').substring(0, 100);

      const taskTitle = `Nacharbeit: ${safeLoc} — ${safeCat}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 5);

      const taskDescription = [
        'Bei der Protokollpruefung wurde ein Problem festgestellt:',
        '',
        `Kategorie: ${safeCat}`,
        `Beschreibung: ${safeDesc}`,
        '',
        `Pruefer: ${inspector}`,
        `Display-ID: ${display_id || '—'}`,
        `Integrator: ${instIntegrator || '—'}`,
        `Standort: ${safeLoc}, ${city || '—'}`,
        `Installationsdatum: ${install_date || '—'}`,
      ].join('\n');

      const taskFields = {
        'Task Title': taskTitle,
        'Description': taskDescription,
        'Status': 'New',
        'Priority': 'High',
        'Due Date': getLocalDateString(dueDate),
      };

      if (akquise_airtable_id && isValidAirtableId(akquise_airtable_id)) {
        taskFields['Locations'] = [akquise_airtable_id];
      }

      const apiStart = Date.now();
      const atRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${TASKS_TABLE}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: [{ fields: taskFields }] }),
      });
      logApiCall('airtable', 'POST Task Nacharbeit (external)', atRes.status, Date.now() - apiStart);

      if (!atRes.ok) {
        const errText = await atRes.text().catch(() => '');
        console.error(`[install-inspection-token] Task creation failed: ${atRes.status} ${errText.substring(0, 200)}`);
        return new Response(JSON.stringify({ error: 'Task konnte nicht erstellt werden' }), {
          status: 502, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
        });
      }

      const taskData = await atRes.json();
      const taskId = taskData.records?.[0]?.id;
      console.log(`[install-inspection-token] Nacharbeit task by inspector="${inspector}": ${taskTitle} (${taskId})`);

      return new Response(JSON.stringify({ success: true, action: 'task_created', task_id: taskId }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    return new Response(JSON.stringify({ error: `Unbekannte Aktion: ${action}` }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });

  } catch (err) {
    console.error('[install-inspection-token] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Interner Fehler bei der Protokollpruefung' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }
};
