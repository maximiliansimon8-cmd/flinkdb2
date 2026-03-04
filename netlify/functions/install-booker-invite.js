/**
 * Netlify Function: Install Booker – Send Invite
 *
 * Called by Make.com when a location becomes ready_for_installation.
 * 1. Checks if the city has available installation routes
 * 2. Generates a unique booking token
 * 3. Creates a pending booking in Supabase
 * 4. Creates/updates SuperChat contact with custom attributes
 * 5. Sends WhatsApp template via SuperChat (template uses contact attributes)
 * 6. Updates Airtable Akquise record with Booking Status
 *
 * Auth: API-Key header (x-api-key)
 */

import {
  getAllowedOrigin, corsHeaders,
  checkRateLimit, getClientIP,
  sanitizeString, isValidAirtableId,
  normalizePhone, secureCompare,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import { normalizeCity } from './shared/slotUtils.js';
import { AIRTABLE_BASE, TABLES, VALUES } from './shared/airtableFields.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BOOKER_API_KEY = process.env.BOOKER_API_KEY;
const BOOKING_BASE_URL = process.env.BOOKING_BASE_URL || 'https://tools.dimension-outdoor.com/book';

const SUPERCHAT_BASE = 'https://api.superchat.com/v1.0';

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

/** Fire-and-forget write to booking_activity_log (non-fatal) */
async function writeActivityLog(entry) {
  try {
    await supabaseRequest('booking_activity_log', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        user_id:             entry.user_id             || null,
        user_name:           entry.user_name            || 'System',
        action:              entry.action,
        booking_id:          entry.booking_id           || null,
        akquise_airtable_id: entry.akquise_airtable_id || null,
        location_name:       entry.location_name        || null,
        city:                entry.city                 || null,
        detail:              entry.detail               || {},
        source:              entry.source               || 'portal',
      }),
    });
  } catch (e) {
    console.warn('[writeActivityLog] Failed (non-fatal):', e.message);
  }
}

/** SuperChat API helper */
async function superchatRequest(path, options = {}) {
  const res = await fetch(`${SUPERCHAT_BASE}/${path}`, {
    ...options,
    headers: {
      'X-API-KEY': SUPERCHAT_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

/** Format date range for WhatsApp message */
function formatDateRange(routes) {
  if (!routes.length) return '';
  const dates = routes.map(r => new Date(r.schedule_date));
  const fmt = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
  if (dates.length === 1) return fmt(dates[0]);
  const sorted = dates.sort((a, b) => a - b);
  return `${fmt(sorted[0])} - ${fmt(sorted[sorted.length - 1])}`;
}

/** Check SuperChat flags: enabled + optional test phone override */
async function getSuperchatConfig() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/feature_flags?key=in.(superchat_enabled,superchat_test_phone)&select=key,enabled,description&limit=10`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return { enabled: false, testPhone: null };
    const data = await res.json();
    const enabledFlag = data.find(f => f.key === 'superchat_enabled');
    const testPhoneFlag = data.find(f => f.key === 'superchat_test_phone');
    return {
      enabled: enabledFlag?.enabled === true,
      testPhone: testPhoneFlag?.enabled ? (testPhoneFlag.description || null) : null,
    };
  } catch { return { enabled: false, testPhone: null }; }
}

/* ═══════════════════════════════════════════════════════════════
 *  SUPERCHAT CONTACT MANAGEMENT
 *  - Load custom attribute definitions (IDs by name)
 *  - Search contact by phone
 *  - Create or update contact with custom attributes
 * ═══════════════════════════════════════════════════════════════ */

// In-memory cache for attribute definitions (cleared on cold start)
let _attributeCache = null;
let _attributeCacheTs = 0;
const ATTR_CACHE_TTL = 10 * 60 * 1000; // 10 min

/**
 * Fetch custom attribute definitions from SuperChat.
 * Returns a Map: attributeName → attributeId
 */
async function getAttributeDefinitions() {
  // Return from cache if fresh
  if (_attributeCache && Date.now() - _attributeCacheTs < ATTR_CACHE_TTL) {
    return _attributeCache;
  }

  const result = await superchatRequest('custom-attributes?limit=100');
  if (!result.ok || !result.data?.results) {
    console.warn('[install-booker-invite] Failed to load custom attribute definitions:', result.status);
    return new Map();
  }

  const map = new Map();
  for (const attr of result.data.results) {
    if (attr.name && attr.id) {
      map.set(attr.name, attr.id);
    }
  }

  _attributeCache = map;
  _attributeCacheTs = Date.now();
  console.log(`[install-booker-invite] Loaded ${map.size} custom attribute definitions:`, [...map.keys()].join(', '));
  return map;
}

/**
 * Search for an existing SuperChat contact by phone number.
 * Returns the contact object or null.
 */
async function findContactByPhone(phone) {
  const result = await superchatRequest('contacts/search', {
    method: 'POST',
    body: JSON.stringify({
      query: {
        value: [{ field: 'phone', operator: '=', value: phone }],
      },
    }),
  });

  if (!result.ok) {
    console.warn('[install-booker-invite] Contact search failed:', result.status);
    return null;
  }

  // API returns results array
  const contacts = result.data?.results || result.data;
  if (Array.isArray(contacts) && contacts.length > 0) {
    return contacts[0];
  }
  return null;
}

/**
 * Create or update a SuperChat contact with custom attributes for the install template.
 *
 * The WhatsApp template "InstallDate2" uses contact attribute placeholders:
 *   {{First name}}, {{Install City}}, {{Install Booking Dates Open}}, {{Install Booking Link}}
 *
 * We set these attributes on the contact BEFORE sending the template,
 * so the template auto-fills the values.
 */
async function upsertSuperchatContact({ phone, contactName, city, dateRange, bookingUrl, jetId, locationName }) {
  // 1. Load attribute definitions to get IDs
  const attrDefs = await getAttributeDefinitions();

  // Map our data to attribute names → IDs
  // NOTE: SuperChat attribute names include {{ }} wrappers and trailing spaces
  // as they were created from template variable placeholders.
  // Template "InstallDate2" uses {{3}} = "JET ID" attribute for the location name
  // in the sentence "für Ihren Standort {{3}} vereinbaren".
  const attrMapping = {
    '{{Install City}} ': city,
    '{{Install Booking Dates Open}} ': dateRange,
    '{{Install Booking Link}} ': bookingUrl,
    'JET ID': locationName || jetId || '',
  };

  // Build custom_attributes array with id + value
  // IMPORTANT: SuperChat API requires { id: "ca_...", value: "..." }
  // NOT { attribute_id: "ca_...", value: "..." } — that causes 400: Invalid parameter
  const customAttributes = [];
  for (const [name, value] of Object.entries(attrMapping)) {
    const attrId = attrDefs.get(name);
    if (attrId && value) {
      customAttributes.push({ id: attrId, value: String(value) });
    } else if (!attrId) {
      console.warn(`[install-booker-invite] Custom attribute "${name}" not found in SuperChat definitions`);
    }
  }

  // 2. Search for existing contact
  const existing = await findContactByPhone(phone);

  // Extract first name from contact name (e.g. "Max Simon" → "Max")
  const firstName = contactName ? contactName.split(' ')[0] : '';
  const lastName = contactName ? contactName.split(' ').slice(1).join(' ') : '';

  if (existing) {
    // 3a. UPDATE existing contact
    console.log(`[install-booker-invite] Updating existing contact ${existing.id} (${phone}) with ${customAttributes.length} attributes`);
    const updateResult = await superchatRequest(`contacts/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        first_name: firstName || existing.first_name || undefined,
        last_name: lastName || existing.last_name || undefined,
        custom_attributes: customAttributes,
      }),
    });

    if (!updateResult.ok) {
      console.error('[install-booker-invite] Contact update failed:', updateResult.status, JSON.stringify(updateResult.data)?.slice(0, 300));
    }
    return { contactId: existing.id, created: false, updated: updateResult.ok };
  }

  // 3b. CREATE new contact
  console.log(`[install-booker-invite] Creating new contact for ${phone} with ${customAttributes.length} attributes`);
  const createResult = await superchatRequest('contacts', {
    method: 'POST',
    body: JSON.stringify({
      first_name: firstName || 'Standortinhaber/in',
      last_name: lastName || '',
      handles: [{ type: 'phone', value: phone }],
      custom_attributes: customAttributes,
    }),
  });

  if (!createResult.ok) {
    console.error('[install-booker-invite] Contact creation failed:', createResult.status, JSON.stringify(createResult.data)?.slice(0, 300));
    return { contactId: null, created: false, updated: false };
  }

  const contactId = createResult.data?.id || null;
  console.log(`[install-booker-invite] Created contact ${contactId}`);
  return { contactId, created: true, updated: false };
}


/* ═══════════════════════════════════════════════════════════════
 *  MAIN HANDLER
 * ═══════════════════════════════════════════════════════════════ */

export default async (request, context) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Auth: API key (Make.com) OR dashboard origin
  const apiKey = request.headers.get('x-api-key');
  const dashboardOrigin = getAllowedOrigin(request);
  const cors = corsHeaders(dashboardOrigin || undefined);
  if (!(apiKey && BOOKER_API_KEY && secureCompare(apiKey, BOOKER_API_KEY)) && !dashboardOrigin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`install-invite:${clientIP}`, 20, 60_000);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...cors, 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  const apiStart = Date.now();

  try {
    const body = await request.json();
    const { akquiseAirtableId, contactPhone, contactName, locationName, city, jetId,
      created_by_user_id, created_by_user_name } = body;

    if (!akquiseAirtableId || !contactPhone || !city) {
      return new Response(JSON.stringify({ error: 'akquiseAirtableId, contactPhone, and city are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Validate Airtable ID format
    if (!isValidAirtableId(akquiseAirtableId)) {
      return new Response(JSON.stringify({ error: 'Ungültiges Airtable-ID-Format' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Verify Standort is approved (Won/Signed + Approved + Vertrag)
    const akquiseCheck = await supabaseRequest(
      `acquisition?airtable_id=eq.${encodeURIComponent(akquiseAirtableId)}&select=lead_status,approval_status,install_approval,vertrag_vorhanden&limit=1`
    );
    if (akquiseCheck.ok && akquiseCheck.data?.length) {
      const akq = akquiseCheck.data[0];
      const ls = (akq.lead_status || '').toLowerCase();
      const as = (akq.approval_status || akq.install_approval || '').toLowerCase();
      const vv = akq.vertrag_vorhanden;
      const isWon = ls === VALUES.LEAD_STATUS.WON_SIGNED.toLowerCase() || ls === 'won/signed';
      const isApproved = as === VALUES.APPROVAL_STATUS.ACCEPTED.toLowerCase() || as === 'approved';
      const hasVertrag = vv === true || vv === 'true' || vv === VALUES.READY_FOR_INSTALL.CHECKED || vv === 'YES' || vv === 'yes';

      if (!isWon || !isApproved || !hasVertrag) {
        const missing = [];
        if (!isWon) missing.push('Lead Status ≠ Won/Signed');
        if (!isApproved) missing.push('Approval fehlt');
        if (!hasVertrag) missing.push('Vertrag fehlt');
        return new Response(JSON.stringify({
          error: 'not_ready',
          message: `Standort ist nicht aufbaubereit: ${missing.join(', ')}`,
        }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
    }

    // ═══ DUPLIKAT-SPERRE: Verhindert doppelte Einladungen für denselben Standort ═══
    // Prüfe ob bereits eine offene Einladung (pending/booked/confirmed) existiert
    // NOTE: invite_failed is NOT included — failed invites can be retried
    const existingBooking = await supabaseRequest(
      `install_bookings?akquise_airtable_id=eq.${encodeURIComponent(akquiseAirtableId)}&status=in.(pending,booked,confirmed)&select=id,status,location_name,created_at,whatsapp_sent_at&limit=1`
    );
    if (existingBooking.ok && existingBooking.data?.length > 0) {
      const existing = existingBooking.data[0];
      // Allow retry if pending booking has no whatsapp_sent_at (= previous failed invite before fix)
      const isPendingWithoutWA = existing.status === 'pending' && !existing.whatsapp_sent_at;
      if (!isPendingWithoutWA) {
        const createdAt = existing.created_at ? new Date(existing.created_at).toLocaleDateString('de-DE') : '';
        console.warn(`[invite] Duplikat blockiert: ${locationName || akquiseAirtableId} hat bereits ein offenes Booking (${existing.status}, erstellt ${createdAt})`);
        return new Response(JSON.stringify({
          error: 'duplicate_invite',
          message: `${locationName || 'Standort'} hat bereits eine offene Einladung (Status: ${existing.status === 'pending' ? 'Eingeladen' : existing.status === 'booked' || existing.status === 'confirmed' ? 'Eingebucht' : existing.status}). Bitte zuerst die bestehende Einladung stornieren.`,
          existingBookingId: existing.id,
          existingStatus: existing.status,
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      // Pending without WA → clean up the stale booking and allow re-invite
      console.log(`[invite] Stale pending booking ${existing.id} for ${locationName || akquiseAirtableId} (no whatsapp_sent_at) — deleting and re-inviting`);
      await supabaseRequest(`install_bookings?id=eq.${existing.id}`, { method: 'DELETE' });
    }

    // 1. Check if there are available routes in this city
    //    Use ilike with wildcard to match city name variants (e.g. "Frankfurt" vs "Frankfurt am Main")
    const today = new Date().toISOString().split('T')[0];
    const cityBase = normalizeCity(city);
    const routesResult = await supabaseRequest(
      `install_routen?city=ilike.${encodeURIComponent(cityBase)}*&schedule_date=gte.${today}&status=eq.open&order=schedule_date.asc`
    );

    if (!routesResult.ok || !routesResult.data?.length) {
      logApiCall({
        functionName: 'install-booker-invite',
        service: 'supabase',
        method: 'GET',
        endpoint: 'install_routen',
        durationMs: Date.now() - apiStart,
        statusCode: 404,
        success: false,
        error: `No available routes in ${city}`,
      });
      return new Response(JSON.stringify({
        error: 'no_routes_available',
        message: `Keine verfügbaren Installationstermine in ${city}`,
        city,
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const availableRoutes = routesResult.data;

    // 2. Generate booking token
    const bookingToken = crypto.randomUUID();

    // 3. Create pending booking in Supabase (whatsapp_sent_at set AFTER successful send)
    const bookingResult = await supabaseRequest('install_bookings', {
      method: 'POST',
      body: JSON.stringify({
        booking_token: bookingToken,
        akquise_airtable_id: akquiseAirtableId,
        location_name: locationName || '',
        city,
        contact_name: contactName || '',
        contact_phone: contactPhone,
        jet_id: jetId || '',
        status: 'pending',
        booking_source: 'whatsapp_agent',
        created_by_user_id: created_by_user_id || null,
        created_by_user_name: created_by_user_name || null,
      }),
    });

    if (!bookingResult.ok) {
      throw new Error(`Failed to create booking: ${JSON.stringify(bookingResult.data)}`);
    }

    // Activity log: invite sent (fire-and-forget)
    writeActivityLog({
      user_id: created_by_user_id || null,
      user_name: created_by_user_name || 'WhatsApp Bot',
      action: 'invite_sent',
      booking_id: bookingResult.data?.[0]?.id || null,
      akquise_airtable_id: akquiseAirtableId,
      location_name: locationName,
      city,
      source: 'bot',
      detail: { channel: 'whatsapp', template: body.templateId || 'InstallDate2' },
    });

    // 4. Prepare WhatsApp data
    const bookingUrl = `${BOOKING_BASE_URL}/${bookingToken}`;
    const dateRange = formatDateRange(availableRoutes);

    // Build fallback message text
    const messageText = [
      `Hallo ${contactName || 'Standortinhaber/in'},`,
      '',
      `Hier ist das Lieferando Display Team. Wir planen demnächst Installationen in ${city} und würden gerne einen Termin für Ihren Standort ${locationName || 'Ihrem Standort'} vereinbaren.`,
      '',
      `Verfügbare Termine: ${dateRange}`,
      '',
      `Buchen Sie hier Ihren Wunschtermin: ${bookingUrl}`,
      '',
      `Bei Fragen antworten Sie einfach auf diese Nachricht.`,
      '',
      `Viele Grüße`,
    ].join('\n');

    let whatsappResult = { ok: false };
    let whatsappSkipped = false;
    let contactResult = { contactId: null, created: false, updated: false };
    const WA_CHANNEL = process.env.SUPERCHAT_WA_CHANNEL_ID || 'mc_cy5HABDnpRhRtosxckRzb';
    const INSTALL_TEMPLATE_ID = process.env.SUPERCHAT_INSTALL_TEMPLATE_ID || null;

    // ── Feature Flag: Only send WhatsApp if superchat_enabled is true ──
    const scConfig = await getSuperchatConfig();
    if (!scConfig.enabled) {
      console.log('[install-booker-invite] WhatsApp SKIPPED — superchat_enabled=false (Feature Flag)');
      whatsappSkipped = true;
    }

    // Test mode: override recipient phone with test number
    const actualPhone = normalizePhone(scConfig.testPhone || contactPhone);
    if (scConfig.testPhone) {
      console.log(`[install-booker-invite] TEST MODE — redirecting WA from ${contactPhone} to ${scConfig.testPhone}`);
    }

    if (SUPERCHAT_API_KEY && !whatsappSkipped) {
      // ── Step 4a: Create/Update SuperChat contact with custom attributes ──
      // Always search by the REAL phone (contactPhone), not the test phone.
      // The contact in SuperChat is associated with the real phone number,
      // and we need to set attributes on THAT contact for the AI Agent knowledge.
      const contactSearchPhone = normalizePhone(contactPhone);
      try {
        contactResult = await upsertSuperchatContact({
          phone: contactSearchPhone,
          contactName: contactName || '',
          city,
          dateRange,
          bookingUrl,
          jetId: jetId || '',
          locationName: locationName || '',
        });
        console.log(`[install-booker-invite] Contact upsert result: id=${contactResult.contactId}, created=${contactResult.created}, updated=${contactResult.updated}`);
      } catch (e) {
        console.error('[install-booker-invite] Contact upsert failed (non-fatal):', e.message);
        // Non-fatal: continue with template send even if contact upsert fails
      }

      // ── Step 4b: Send template ──
      // ALL variables must be sent as positional vars — even contact_attribute types!
      // SuperChat does NOT auto-fill contact attributes in the API; all must be explicit.
      //   {{1}} = First name
      //   {{2}} = Install City
      //   {{3}} = Location Name (template field called "JET ID" but used as Standort)
      //   {{4}} = Available Dates
      //   {{5}} = Booking Link
      const templateId = body.templateId || INSTALL_TEMPLATE_ID;
      if (templateId) {
        const firstName = contactName ? contactName.split(' ')[0] : 'Standortinhaber/in';
        const templateVars = [
          { position: 1, value: firstName },
          { position: 2, value: city },
          { position: 3, value: locationName || jetId || city },
          { position: 4, value: dateRange },
          { position: 5, value: bookingUrl },
        ];
        console.log(`[install-booker-invite] Sending template ${templateId} to ${actualPhone} via channel ${WA_CHANNEL}`, JSON.stringify(templateVars));
        const scRes = await superchatRequest('messages', {
          method: 'POST',
          body: JSON.stringify({
            to: [{ identifier: actualPhone }],
            from: { channel_id: WA_CHANNEL },
            content: {
              type: 'whats_app_template',
              template_id: templateId,
              variables: templateVars,
            },
          }),
        });
        whatsappResult = { ok: scRes.ok, status: scRes.status, data: scRes.data };
        console.log(`[install-booker-invite] Template result: ${scRes.status} ${scRes.ok ? 'OK' : 'FAILED'}`, JSON.stringify(scRes.data)?.slice(0, 1000));
      } else {
        console.log('[install-booker-invite] No template ID configured — skipping template send');
      }

      // Fallback: send as plain text if no template or template failed
      if (!whatsappResult.ok) {
        console.log(`[install-booker-invite] Trying text fallback to ${actualPhone} via channel ${WA_CHANNEL}`);
        const scRes = await superchatRequest('messages', {
          method: 'POST',
          body: JSON.stringify({
            to: [{ identifier: actualPhone }],
            from: { channel_id: WA_CHANNEL },
            content: { type: 'text', body: messageText },
          }),
        });
        whatsappResult = { ok: scRes.ok, status: scRes.status, data: scRes.data };
        console.log(`[install-booker-invite] Text fallback result: ${scRes.status} ${scRes.ok ? 'OK' : 'FAILED'}`, JSON.stringify(scRes.data)?.slice(0, 300));
      }
    }

    // 5. Update booking based on WhatsApp result
    const bookingId = bookingResult.data?.[0]?.id;
    if (bookingId) {
      if (whatsappResult.ok || whatsappSkipped) {
        // WhatsApp sent successfully (or skipped because disabled) → mark as sent
        await supabaseRequest(`install_bookings?id=eq.${bookingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            whatsapp_sent_at: new Date().toISOString(),
          }),
        });
      } else {
        // WhatsApp FAILED → mark booking as invite_failed so it doesn't show as "eingeladen"
        const errorMsg = whatsappResult.data?.message || whatsappResult.data?.error || `SuperChat API ${whatsappResult.status}`;
        await supabaseRequest(`install_bookings?id=eq.${bookingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'invite_failed',
          }),
        });
        console.error(`[install-booker-invite] WhatsApp send FAILED for ${locationName || city}: status=${whatsappResult.status}`, JSON.stringify(whatsappResult.data)?.slice(0, 500));
        // Log the error details to activity log
        writeActivityLog({
          user_id: created_by_user_id || null,
          user_name: created_by_user_name || 'WhatsApp Bot',
          action: 'invite_failed',
          booking_id: bookingId,
          akquise_airtable_id: akquiseAirtableId,
          location_name: locationName,
          city,
          source: 'bot',
          detail: { channel: 'whatsapp', error: errorMsg },
        });
      }
    }

    logApiCall({
      functionName: 'install-booker-invite',
      service: 'superchat',
      method: 'POST',
      endpoint: 'messages',
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: whatsappResult.ok || whatsappSkipped,
    });

    return new Response(JSON.stringify({
      success: true,
      bookingToken,
      bookingUrl,
      city,
      availableRoutes: availableRoutes.length,
      dateRange,
      whatsappSent: whatsappResult.ok,
      whatsappSkipped: whatsappSkipped,
      whatsappError: (!whatsappSkipped && !whatsappResult.ok) ? (whatsappResult.data?.message || whatsappResult.data?.error || `SuperChat API ${whatsappResult.status}`) : undefined,
      contact: {
        id: contactResult.contactId,
        created: contactResult.created,
        updated: contactResult.updated,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });

  } catch (err) {
    logApiCall({
      functionName: 'install-booker-invite',
      service: 'mixed',
      method: 'POST',
      endpoint: 'invite',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    console.error('[install-booker-invite] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Einladung fehlgeschlagen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
};
