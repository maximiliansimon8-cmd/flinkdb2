/**
 * Netlify Function: Install Booker – List Templates
 *
 * Returns approved WhatsApp templates from the "Install Dates" folder in SuperChat.
 * Used by the frontend to populate a template selector in the invite dialog.
 *
 * GET /api/install-booker/templates
 *   → { templates: [{ id, name, body, variables, status }] }
 *
 * Auth: Origin check
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
} from './shared/security.js';

const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const SUPERCHAT_BASE = 'https://api.superchat.com/v1.0';

// Folder name to filter on (created by user in SuperChat)
const INSTALL_FOLDER_NAME = 'Install Dates';

// In-memory cache (cleared on cold start)
let _templatesCache = null;
let _templatesCacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default async (request, context) => {
  // CORS preflight
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`install-templates:${clientIP}`, 30, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs, origin);

  const cors = corsHeaders(origin);

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (!SUPERCHAT_API_KEY) {
    return new Response(JSON.stringify({ error: 'SuperChat not configured', templates: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  try {
    // Check cache
    if (_templatesCache && Date.now() - _templatesCacheTs < CACHE_TTL) {
      return new Response(JSON.stringify({ templates: _templatesCache, cached: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Fetch all templates from SuperChat
    const res = await fetch(`${SUPERCHAT_BASE}/templates?limit=100`, {
      headers: {
        'X-API-KEY': SUPERCHAT_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[install-booker-templates] SuperChat API returned ${res.status}`);
      return new Response(JSON.stringify({ error: 'Templates konnten nicht geladen werden', templates: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const data = await res.json();
    const allTemplates = data?.results || [];

    // Filter to "Install Dates" folder + approved status
    const installTemplates = allTemplates
      .filter(t => t.folder?.name === INSTALL_FOLDER_NAME && t.status === 'approved')
      .map(t => ({
        id: t.id,
        name: t.name,
        body: t.content?.body || '',
        variables: (t.content?.variables || []).map(v => ({
          position: v.position,
          displayName: v.display_name || '',
          type: v.type, // 'static' or 'contact_attribute'
        })),
        status: t.status,
      }));

    // Update cache
    _templatesCache = installTemplates;
    _templatesCacheTs = Date.now();

    console.log(`[install-booker-templates] Found ${installTemplates.length} templates in "${INSTALL_FOLDER_NAME}" folder`);

    return new Response(JSON.stringify({ templates: installTemplates }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300, stale-while-revalidate=600',
        ...cors,
      },
    });

  } catch (err) {
    console.error('[install-booker-templates] Error:', err.message);
    return safeErrorResponse(500, 'Interner Fehler beim Laden der Templates', origin, err);
  }
};
