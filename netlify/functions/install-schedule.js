/**
 * Netlify Function: Install Schedule (Routen-CRUD)
 *
 * Manages installation route schedules (which cities on which dates).
 * Bidirectional: Dashboard writes here + Airtable automations can also write via API key.
 *
 * Endpoints:
 *   GET    /api/install-schedule          → List routes (optional ?city=&from=&to=)
 *   POST   /api/install-schedule          → Create route
 *   PATCH  /api/install-schedule/:id      → Update route
 *   DELETE /api/install-schedule/:id      → Delete route
 */

import { getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse } from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BOOKER_API_KEY = process.env.BOOKER_API_KEY;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';

/** Check auth: either Origin-based (dashboard) or API-key (Make.com / Airtable automation) */
function authenticate(request) {
  // Check API key first (for Make.com / external triggers)
  const apiKey = request.headers.get('x-api-key');
  if (apiKey && BOOKER_API_KEY && apiKey === BOOKER_API_KEY) {
    return { source: 'api-key', origin: '*' };
  }

  // Fall back to origin check (dashboard)
  const origin = getAllowedOrigin(request);
  if (origin) {
    return { source: 'dashboard', origin };
  }

  return null;
}

/** Supabase REST helper */
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

/** Airtable write helper (for bidirectional sync) */
async function airtableWrite(tableIdOrName, method, recordId, fields) {
  const url = recordId
    ? `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableIdOrName}/${recordId}`
    : `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableIdOrName}`;

  const body = recordId ? { fields } : { records: [{ fields }] };

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const auth = authenticate(request);
  if (!auth) return forbiddenResponse();

  const cors = corsHeaders(auth.origin === '*' ? undefined : auth.origin);
  const url = new URL(request.url);

  // Extract route ID from path: /api/install-schedule/{id}
  const pathParts = url.pathname.replace(/^\/?(\.netlify\/functions\/install-schedule\/?|api\/install-schedule\/?)/, '').split('/').filter(Boolean);
  const routeId = pathParts[0] || null;

  const apiStart = Date.now();

  try {
    // ── GET: List routes ──
    if (request.method === 'GET') {
      const city = url.searchParams.get('city');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const status = url.searchParams.get('status');

      let query = 'install_routen?select=*&order=schedule_date.asc';
      if (city) query += `&city=eq.${encodeURIComponent(city)}`;
      if (from) query += `&schedule_date=gte.${from}`;
      if (to) query += `&schedule_date=lte.${to}`;
      if (status) query += `&status=eq.${encodeURIComponent(status)}`;

      const result = await supabaseRequest(query);

      logApiCall({
        functionName: 'install-schedule',
        service: 'supabase',
        method: 'GET',
        endpoint: 'install_routen',
        durationMs: Date.now() - apiStart,
        statusCode: result.status,
        success: result.ok,
      });

      return new Response(JSON.stringify(result.data || []), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── POST: Create route ──
    if (request.method === 'POST') {
      const body = await request.json();
      const { city, schedule_date, installer_team, max_capacity, time_slots, notes, airtable_id } = body;

      if (!city || !schedule_date) {
        return new Response(JSON.stringify({ error: 'city and schedule_date are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const row = {
        city,
        schedule_date,
        installer_team: installer_team || null,
        max_capacity: max_capacity || 4,
        time_slots: JSON.stringify(time_slots || ['09:00', '11:00', '14:00', '16:00']),
        status: 'open',
        notes: notes || null,
        airtable_id: airtable_id || null,
      };

      const result = await supabaseRequest('install_routen', {
        method: 'POST',
        body: JSON.stringify(row),
      });

      // NOTE: Airtable Install_Routen sync disabled — routes managed only in Supabase for now

      logApiCall({
        functionName: 'install-schedule',
        service: 'supabase',
        method: 'POST',
        endpoint: 'install_routen',
        durationMs: Date.now() - apiStart,
        statusCode: result.status,
        success: result.ok,
      });

      return new Response(JSON.stringify(result.data), {
        status: result.ok ? 201 : result.status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── PATCH: Update route ──
    if (request.method === 'PATCH' && routeId) {
      const body = await request.json();
      const allowed = ['city', 'schedule_date', 'installer_team', 'max_capacity', 'time_slots', 'status', 'notes'];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) {
          updates[key] = key === 'time_slots' ? JSON.stringify(body[key]) : body[key];
        }
      }

      const result = await supabaseRequest(`install_routen?id=eq.${routeId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      // NOTE: Airtable Install_Routen sync disabled — routes managed only in Supabase for now

      logApiCall({
        functionName: 'install-schedule',
        service: 'supabase',
        method: 'PATCH',
        endpoint: 'install_routen',
        durationMs: Date.now() - apiStart,
        statusCode: result.status,
        success: result.ok,
      });

      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── DELETE: Remove route ──
    if (request.method === 'DELETE' && routeId) {
      // First get the record to check for airtable_id
      const existing = await supabaseRequest(`install_routen?id=eq.${routeId}&select=airtable_id`);

      const result = await supabaseRequest(`install_routen?id=eq.${routeId}`, {
        method: 'DELETE',
      });

      // NOTE: Airtable Install_Routen sync disabled — routes managed only in Supabase for now

      logApiCall({
        functionName: 'install-schedule',
        service: 'supabase',
        method: 'DELETE',
        endpoint: 'install_routen',
        durationMs: Date.now() - apiStart,
        statusCode: result.status,
        success: result.ok,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });

  } catch (err) {
    logApiCall({
      functionName: 'install-schedule',
      service: 'supabase',
      method: request.method,
      endpoint: 'install_routen',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      error: err.message,
    });

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
};
