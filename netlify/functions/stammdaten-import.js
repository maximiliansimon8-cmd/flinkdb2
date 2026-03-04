/**
 * Netlify Function: stammdaten-import
 * Validates and writes Stammdaten changes to Airtable (source of truth).
 * Supports: CREATE new records, UPDATE existing records (PATCH).
 * Auth: Supabase JWT (logged-in user only)
 *
 * Flow: Frontend sends validated diff → this function writes to Airtable → next sync updates Supabase.
 */
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
  sanitizeString,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import { STAMMDATEN_FIELDS as SF, TABLES } from './shared/airtableFields.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const STAMMDATEN_TABLE = TABLES.STAMMDATEN;

/** Max 10 records per Airtable batch */
const AIRTABLE_BATCH_SIZE = 10;

/** Fields that are writable in Airtable Stammdaten (not computed/formula/lookup) */
const WRITABLE_FIELDS = new Set([
  SF.LOCATION_NAME, SF.LEGAL_ENTITY, SF.LEGA_ENTITY_ADRESS,
  SF.STREET, SF.STREET_NUMBER, SF.POSTAL_CODE, SF.CITY,
  SF.CONTACT_PERSON, SF.CONTACT_EMAIL, SF.CONTACT_PHONE,
  SF.LOCATION_EMAIL, SF.LOCATION_PHONE, SF.EMAIL, SF.PHONE,
  SF.JET_CHAIN, SF.RESTAURANT_WEBSITE, SF.BRANDS_LISTED,
  SF.LATITUDE, SF.LONGITUDE,
  SF.REGULAR_OPEN_TIME, SF.REGULAR_CLOSE_TIME_WEEKDAYS,
  SF.REGULAR_CLOSE_TIME_WEEKDEND, SF.WEEKEND_CLOSE_TIME, SF.CLOSED_DAYS,
  SF.LOCATION_CATEGORIES, SF.SUPERCHAT_ID,
]);

/** Map from CSV/frontend field key to Airtable field name */
const FIELD_MAP = {
  name:             SF.LOCATION_NAME,
  street:           SF.STREET,
  street_number:    SF.STREET_NUMBER,
  postcode:         SF.POSTAL_CODE,
  city:             SF.CITY,
  phone:            SF.LOCATION_PHONE,
  email:            SF.LOCATION_EMAIL,
  contact_name:     SF.CONTACT_PERSON,
  contact_email:    SF.CONTACT_EMAIL,
  contact_phone:    SF.CONTACT_PHONE,
  account_name:     SF.LEGAL_ENTITY,
  lega_entity_adress: SF.LEGA_ENTITY_ADRESS,
  location_categories: SF.LOCATION_CATEGORIES,
  jet_chain:        SF.JET_CHAIN,
  restaurant_website: SF.RESTAURANT_WEBSITE,
  brands_listed:    SF.BRANDS_LISTED,
  latitude:         SF.LATITUDE,
  longitude:        SF.LONGITUDE,
  formatted_phone:  SF.FORMATTED_PHONE,
  superchat_id:     SF.SUPERCHAT_ID,
  regular_open_time:            SF.REGULAR_OPEN_TIME,
  regular_close_time_weekdays:  SF.REGULAR_CLOSE_TIME_WEEKDAYS,
  regular_close_time_weekdend:  SF.REGULAR_CLOSE_TIME_WEEKDEND,
  weekend_close_time:           SF.WEEKEND_CLOSE_TIME,
  closed_days:                  SF.CLOSED_DAYS,
};

/** Verify Supabase JWT token */
async function verifyJWT(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

/** Validate a single record for import */
function validateRecord(record, mode) {
  const errors = [];
  const warnings = [];

  // Must have JET ID for updates
  if (mode === 'update' && !record.airtable_id) {
    errors.push('Kein Airtable Record-ID fuer Update');
  }

  // Name is required
  if (!record.fields?.name && !record.fields?.[SF.LOCATION_NAME]) {
    errors.push('Location Name fehlt');
  }

  // Postal code format (German: 5 digits)
  const plz = record.fields?.postcode || record.fields?.[SF.POSTAL_CODE] || '';
  if (plz && !/^\d{4,5}$/.test(plz.trim())) {
    warnings.push(`PLZ "${plz}" ist kein gueltiges Format`);
  }

  // Email format
  const emails = [
    record.fields?.email || record.fields?.[SF.LOCATION_EMAIL],
    record.fields?.contact_email || record.fields?.[SF.CONTACT_EMAIL],
  ].filter(Boolean);
  for (const em of emails) {
    if (em && !em.includes('@')) {
      warnings.push(`E-Mail "${em}" ungueltig`);
    }
  }

  // Lat/Lng range check
  const lat = Number(record.fields?.latitude || record.fields?.[SF.LATITUDE]);
  const lng = Number(record.fields?.longitude || record.fields?.[SF.LONGITUDE]);
  if (lat && (lat < 45 || lat > 56)) {
    warnings.push(`Breitengrad ${lat} ausserhalb DACH-Region`);
  }
  if (lng && (lng < 5 || lng > 18)) {
    warnings.push(`Laengengrad ${lng} ausserhalb DACH-Region`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Convert frontend field keys to Airtable field names, filter to writable */
function toAirtableFields(fields) {
  const atFields = {};
  for (const [key, val] of Object.entries(fields)) {
    const atFieldName = FIELD_MAP[key];
    if (!atFieldName) continue;
    if (!WRITABLE_FIELDS.has(atFieldName)) continue;

    // Sanitize strings, convert numbers
    if (atFieldName === SF.LATITUDE || atFieldName === SF.LONGITUDE) {
      const num = Number(val);
      if (!isNaN(num) && val !== '' && val != null) atFields[atFieldName] = num;
    } else {
      atFields[atFieldName] = sanitizeString(String(val || ''), 5000);
    }
  }
  return atFields;
}

/** Write batch to Airtable (max 10 records) */
async function airtableBatch(method, records) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${STAMMDATEN_TABLE}`;
  const body = method === 'PATCH'
    ? { records: records.map(r => ({ id: r.airtable_id, fields: r.fields })) }
    : { records: records.map(r => ({ fields: r.fields })) };

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`[stammdaten-import] Airtable ${method} failed: ${res.status}`, JSON.stringify(data).substring(0, 500));
    return { ok: false, status: res.status, error: data.error?.message || `Airtable ${method} fehlgeschlagen` };
  }
  return { ok: true, records: data.records || [] };
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`stammdaten-import:${clientIP}`, 30, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs, origin);

  const cors = corsHeaders(origin);
  const apiStart = Date.now();

  try {
    // Only POST allowed
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Nur POST erlaubt' }), {
        status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Auth: require logged-in user
    const user = await verifyJWT(request);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Nicht autorisiert. Bitte einloggen.' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (!AIRTABLE_TOKEN) {
      return safeErrorResponse(500, 'Server-Konfigurationsfehler: Airtable Token fehlt', origin);
    }

    const body = await request.json();
    const { action, records: inputRecords } = body;

    // ── ACTION: validate ──
    // Returns validation results without writing anything
    if (action === 'validate') {
      const results = (inputRecords || []).map((rec, i) => {
        const mode = rec.airtable_id ? 'update' : 'create';
        const validation = validateRecord(rec, mode);
        const atFields = toAirtableFields(rec.fields || {});
        return {
          index: i,
          jet_id: rec.jet_id || null,
          mode,
          field_count: Object.keys(atFields).length,
          ...validation,
        };
      });

      const valid = results.filter(r => r.valid).length;
      const invalid = results.filter(r => !r.valid).length;
      const withWarnings = results.filter(r => r.warnings.length > 0).length;

      return new Response(JSON.stringify({
        action: 'validate',
        summary: { total: results.length, valid, invalid, withWarnings },
        results,
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── ACTION: import ──
    // Actually writes to Airtable
    if (action === 'import') {
      if (!inputRecords || inputRecords.length === 0) {
        return new Response(JSON.stringify({ error: 'Keine Records zum Import' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // Safety limit
      if (inputRecords.length > 500) {
        return new Response(JSON.stringify({ error: 'Maximal 500 Records pro Import' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // Separate updates and creates
      const updates = [];
      const creates = [];
      const skipped = [];

      for (const rec of inputRecords) {
        const mode = rec.airtable_id ? 'update' : 'create';
        const validation = validateRecord(rec, mode);
        if (!validation.valid) {
          skipped.push({ jet_id: rec.jet_id, errors: validation.errors });
          continue;
        }

        const atFields = toAirtableFields(rec.fields || {});
        if (Object.keys(atFields).length === 0) {
          skipped.push({ jet_id: rec.jet_id, errors: ['Keine schreibbaren Felder'] });
          continue;
        }

        if (mode === 'update') {
          updates.push({ airtable_id: rec.airtable_id, jet_id: rec.jet_id, fields: atFields });
        } else {
          creates.push({ jet_id: rec.jet_id, fields: atFields });
        }
      }

      // Process updates in batches of 10
      const updateResults = [];
      for (let i = 0; i < updates.length; i += AIRTABLE_BATCH_SIZE) {
        const batch = updates.slice(i, i + AIRTABLE_BATCH_SIZE);
        const result = await airtableBatch('PATCH', batch);
        logApiCall({
          functionName: 'stammdaten-import', service: 'airtable', method: 'PATCH',
          endpoint: 'stammdaten', durationMs: Date.now() - apiStart,
          statusCode: result.ok ? 200 : 500, success: result.ok,
        });

        if (result.ok) {
          updateResults.push(...batch.map((b, idx) => ({
            jet_id: b.jet_id, ok: true, airtable_id: result.records[idx]?.id,
          })));
        } else {
          updateResults.push(...batch.map(b => ({
            jet_id: b.jet_id, ok: false, error: result.error,
          })));
        }

        // Rate limit: Airtable allows 5 requests/sec
        if (i + AIRTABLE_BATCH_SIZE < updates.length) {
          await new Promise(r => setTimeout(r, 250));
        }
      }

      // Process creates in batches of 10
      const createResults = [];
      for (let i = 0; i < creates.length; i += AIRTABLE_BATCH_SIZE) {
        const batch = creates.slice(i, i + AIRTABLE_BATCH_SIZE);
        const result = await airtableBatch('POST', batch);
        logApiCall({
          functionName: 'stammdaten-import', service: 'airtable', method: 'POST',
          endpoint: 'stammdaten', durationMs: Date.now() - apiStart,
          statusCode: result.ok ? 200 : 500, success: result.ok,
        });

        if (result.ok) {
          createResults.push(...batch.map((b, idx) => ({
            jet_id: b.jet_id, ok: true, airtable_id: result.records[idx]?.id,
          })));
        } else {
          createResults.push(...batch.map(b => ({
            jet_id: b.jet_id, ok: false, error: result.error,
          })));
        }

        if (i + AIRTABLE_BATCH_SIZE < creates.length) {
          await new Promise(r => setTimeout(r, 250));
        }
      }

      const successUpdates = updateResults.filter(r => r.ok).length;
      const successCreates = createResults.filter(r => r.ok).length;
      const failedUpdates = updateResults.filter(r => !r.ok).length;
      const failedCreates = createResults.filter(r => !r.ok).length;

      console.log(`[stammdaten-import] Import by ${user.email}: ${successUpdates} updated, ${successCreates} created, ${failedUpdates + failedCreates} failed, ${skipped.length} skipped`);

      return new Response(JSON.stringify({
        action: 'import',
        user: user.email,
        summary: {
          updates: { success: successUpdates, failed: failedUpdates },
          creates: { success: successCreates, failed: failedCreates },
          skipped: skipped.length,
        },
        updateResults,
        createResults,
        skipped,
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unbekannte Aktion. Erlaubt: validate, import' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[stammdaten-import] Error:', err.message);
    return safeErrorResponse(500, 'Import fehlgeschlagen', origin, err);
  }
};
