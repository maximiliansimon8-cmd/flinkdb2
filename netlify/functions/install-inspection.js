/**
 * Netlify Function: Install Inspection API
 *
 * Handles:
 *   - set_freigabe_vorort: Sets "Freigabe Installation (Installation Vorort)" in Airtable
 *   - create_nacharbeit_task: Creates a Nacharbeit task for e-Systems in Airtable
 *
 * Auth: Origin check + JWT (dashboard users)
 */
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import { AIRTABLE_BASE, TABLES, INSTALLATION_FIELDS as IF_ } from './shared/airtableFields.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

function getLocalDateString(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`install-inspection:${clientIP}`, 30, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs, origin);

  const cors = corsHeaders(origin);

  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { action } = body;

    // ── Action: Set Freigabe Installation (Vorort) ──
    if (action === 'set_freigabe_vorort') {
      const { installation_airtable_id } = body;
      if (!installation_airtable_id) {
        return new Response(JSON.stringify({ error: 'installation_airtable_id erforderlich' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      if (!AIRTABLE_TOKEN) {
        return safeErrorResponse(500, 'Airtable-Konfiguration fehlt', origin);
      }

      // PATCH Airtable: set checkbox
      const apiStart = Date.now();
      const atRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLES.INSTALLATIONEN}/${installation_airtable_id}`,
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
      logApiCall('airtable', 'PATCH Freigabe Installation Vorort', atRes.status, Date.now() - apiStart);

      if (!atRes.ok) {
        const errText = await atRes.text().catch(() => '');
        console.error(`[install-inspection] Airtable PATCH failed: ${atRes.status} ${errText.substring(0, 200)}`);
        return safeErrorResponse(502, 'Freigabe konnte nicht gesetzt werden', origin);
      }

      // Check if both Freigabe fields are now true → auto-set CHG
      // Read the updated record to check freigabe_online_rate
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/installationen?airtable_id=eq.${encodeURIComponent(installation_airtable_id)}&select=freigabe_online_rate&limit=1`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData[0]?.freigabe_online_rate === true) {
          // Both are now true → set CHG
          const chgStart = Date.now();
          const chgRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLES.INSTALLATIONEN}/${installation_airtable_id}`,
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
          logApiCall('airtable', 'PATCH Freigabe CHG (auto)', chgRes.status, Date.now() - chgStart);
          if (chgRes.ok) {
            console.log(`[install-inspection] Auto-set Freigabe CHG for ${installation_airtable_id}`);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, action: 'freigabe_vorort_set' }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── Action: Create Nacharbeit Task ──
    if (action === 'create_nacharbeit_task') {
      const { installation_airtable_id, category, description, location_name, city, display_id, integrator, install_date, akquise_airtable_id } = body;

      if (!category || !description) {
        return new Response(JSON.stringify({ error: 'Kategorie und Beschreibung erforderlich' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      if (!AIRTABLE_TOKEN) {
        return safeErrorResponse(500, 'Airtable-Konfiguration fehlt', origin);
      }

      const taskTitle = `Nacharbeit: ${location_name || 'Unbekannt'} — ${category}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 5); // 5 Werktage

      const taskDescription = [
        'Bei der Protokollpruefung wurde ein Problem festgestellt:',
        '',
        `Kategorie: ${category}`,
        `Beschreibung: ${description}`,
        '',
        `Display-ID: ${display_id || '—'}`,
        `Integrator: ${integrator || '—'}`,
        `Standort: ${location_name || '—'}, ${city || '—'}`,
        `Installationsdatum: ${install_date || '—'}`,
      ].join('\n');

      const taskFields = {
        'Task Title': taskTitle,
        'Description': taskDescription,
        'Status': 'New',
        'Priority': 'High',
        'Due Date': getLocalDateString(dueDate),
      };

      // Link to Akquise/Location if available
      if (akquise_airtable_id) {
        taskFields['Locations'] = [akquise_airtable_id];
      }

      const apiStart = Date.now();
      const atRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLES.TASKS}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: [{ fields: taskFields }] }),
      });
      logApiCall('airtable', 'POST Task (Nacharbeit)', atRes.status, Date.now() - apiStart);

      if (!atRes.ok) {
        const errText = await atRes.text().catch(() => '');
        console.error(`[install-inspection] Task creation failed: ${atRes.status} ${errText.substring(0, 200)}`);
        return safeErrorResponse(502, 'Task konnte nicht erstellt werden', origin);
      }

      const taskData = await atRes.json();
      const taskId = taskData.records?.[0]?.id;
      console.log(`[install-inspection] Nacharbeit task created: ${taskTitle} (${taskId})`);

      return new Response(JSON.stringify({ success: true, action: 'task_created', task_id: taskId }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unbekannte Aktion: ${action}` }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[install-inspection] Error:', err.message);
    return safeErrorResponse(500, 'Interner Fehler bei der Protokollpruefung', origin, err);
  }
};
