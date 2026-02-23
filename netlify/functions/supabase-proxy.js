/**
 * Netlify Function: Supabase Proxy for RLS-blocked tables
 *
 * Provides read-only access to tables that the frontend can't query directly
 * due to missing anon RLS policies. Uses the service role key server-side.
 *
 * Supported tables:
 *   - display_heartbeats (Startscreen, 178K rows)
 *   - installationen (710 rows)
 *   - tasks (1,337 rows)
 *
 * Usage:
 *   GET /api/supabase-proxy?table=installationen
 *   GET /api/supabase-proxy?table=tasks
 *   GET /api/supabase-proxy?table=display_heartbeats&select=display_id,days_offline&limit=2000&order=timestamp_parsed.desc
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  safeErrorResponse,
} from './shared/security.js';

// Allowed tables (whitelist to prevent arbitrary table access)
const ALLOWED_TABLES = new Set([
  'display_heartbeats',
  'installationen',
  'installationstermine',
  'tasks',
  'acquisition',
]);

// Default select columns per table (to limit data transfer)
const DEFAULT_SELECTS = {
  display_heartbeats: 'display_id,timestamp,raw_display_id,location_name,serial_number,registration_date,heartbeat,is_alive,display_status,last_online_date,days_offline,timestamp_parsed',
  installationen: 'id,ops_nr,install_date,status,installation_type,integrator,technicians,sim_id,install_start,install_end,screen_type,screen_size,remarks,display_ids,partner_name,airtable_id',
  tasks: 'title,status,priority,due_date,description,display_ids,location_names,responsible_user,created_time,install_date,install_remarks,nacharbeit_kommentar',
  acquisition: '*',
};

// Max rows per table (to prevent abuse)
const MAX_ROWS = {
  display_heartbeats: 5000,
  installationen: 5000,
  installationstermine: 5000,
  tasks: 5000,
  acquisition: 15000,
};

export default async (request) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`supabase-proxy:${clientIP}`, 60, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  const url = new URL(request.url);
  const table = url.searchParams.get('table');
  const select = url.searchParams.get('select');
  const limitParam = parseInt(url.searchParams.get('limit') || '5000');
  const offsetParam = parseInt(url.searchParams.get('offset') || '0');
  const order = url.searchParams.get('order');
  const filter = url.searchParams.get('filter'); // e.g. "ops_nr=eq.312"

  if (!table || !ALLOWED_TABLES.has(table)) {
    return safeErrorResponse(400, `Table not allowed. Allowed: ${[...ALLOWED_TABLES].join(', ')}`, origin);
  }

  const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
  const SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return safeErrorResponse(500, 'Supabase not configured', origin);
  }

  try {
    const effectiveSelect = select || DEFAULT_SELECTS[table] || '*';
    const effectiveLimit = Math.min(limitParam, MAX_ROWS[table] || 5000);

    let queryUrl = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(effectiveSelect)}&limit=${effectiveLimit}`;

    // Pagination offset (PostgREST uses Range header, but offset param is simpler)
    if (offsetParam > 0) {
      queryUrl += `&offset=${offsetParam}`;
    }

    if (order) {
      queryUrl += `&order=${encodeURIComponent(order)}`;
    }

    if (filter) {
      // Validate filter format: only allow safe PostgREST filter patterns (column=operator.value)
      const SAFE_FILTER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*=(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd)\..+$/;
      const filterParts = filter.split('&');
      const safeFilters = filterParts.filter(f => SAFE_FILTER_PATTERN.test(f.trim()));
      if (safeFilters.length > 0) {
        queryUrl += `&${safeFilters.map(f => encodeURI(f.trim())).join('&')}`;
      }
    }

    const startTime = Date.now();
    const res = await fetch(queryUrl, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[supabase-proxy] Error for ${table}: ${res.status} ${body.slice(0, 200)}`);
      return safeErrorResponse(res.status, 'Datenabfrage fehlgeschlagen', origin);
    }

    const data = await res.json();
    const elapsed = Date.now() - startTime;
    console.log(`[supabase-proxy] ${table}: ${data.length} rows in ${elapsed}ms`);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
        'X-Rows': String(data.length),
        'X-Duration-Ms': String(elapsed),
        ...corsHeaders(origin),
      },
    });

  } catch (err) {
    console.error(`[supabase-proxy] Error:`, err.message);
    return safeErrorResponse(500, 'Proxy request failed', origin, err);
  }
};

export const config = { path: '/api/supabase-proxy' };
