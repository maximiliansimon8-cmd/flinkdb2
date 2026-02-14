/**
 * Netlify Function: Bank Leasing Import (TESMA/CHG-MERIDIAN)
 *
 * Receives parsed XLSX data and upserts into bank_leasing table.
 * Two import paths:
 *   1. Make.com webhook → parses XLSX from email, POSTs JSON here
 *   2. Dashboard Admin UI → client-side XLSX parse, POSTs JSON here
 *
 * POST /api/bank-import
 * Body: { assets: [{ asset_id, serial_number, ... }] }
 *
 * Environment variables:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString, safeErrorResponse,
} from './shared/security.js';

/**
 * Map incoming asset data to bank_leasing columns.
 * Handles both German column names (from XLSX) and English (from API).
 */
function mapAsset(a) {
  return {
    asset_id:             a.asset_id             || a['Asset-ID']            || a['Asset ID']            || null,
    serial_number:        a.serial_number         || a['Seriennummer']        || a['Serial Number']       || null,
    asset_class:          a.asset_class           || a['Assetklasse']         || a['Asset Class']         || null,
    designation:          a.designation            || a['Bezeichnung']         || a['Designation']         || null,
    contract_status:      a.contract_status       || a['Vertragsstatus']      || a['Contract Status']     || null,
    customer:             a.customer              || a['Kunde']               || a['Customer']            || null,
    customer_id:          a.customer_id != null   ? Number(a.customer_id)    : (a['Kunden ID'] != null ? Number(a['Kunden ID']) : null),
    rental_certificate:   a.rental_certificate    || a['Mietschein']          || a['Rental Certificate']  || null,
    rental_start:         a.rental_start          || a['Mietbeginn']          || null,
    rental_end_planned:   a.rental_end_planned    || a['Geplantes Mietende']  || null,
    rental_end_actual:    a.rental_end_actual     || a['Tatsächliches Mietende'] || a['Tatsaechliches Mietende'] || null,
    monthly_price:        a.monthly_price != null ? Number(a.monthly_price)  : (a['Mietpreis'] != null ? Number(a['Mietpreis']) : null),
    currency:             a.currency              || a['Währung']             || a['Waehrung']            || 'EUR',
    order_number:         a.order_number          || a['Bestellnummer']       || a['Order Number']        || null,
    installation_location: a.installation_location || a['Installationsort']   || null,
    cost_center:          a.cost_center           || a['Kostenstelle']        || a['Cost Center']         || null,
    city:                 a.city                  || a['Werk']                || a['City']                || null,
    manufacturer:         a.manufacturer          || a['Hersteller']          || a['Manufacturer']        || null,
    lessor_id:            a.lessor_id != null     ? Number(a.lessor_id)      : (a['Leasinggeber ID'] != null ? Number(a['Leasinggeber ID']) : null),
    lessor:               a.lessor                || a['Leasinggeber']        || a['Lessor']              || null,
    updated_at:           new Date().toISOString(),
  };
}

/**
 * Parse date strings from XLSX.
 * Handles: "01.10.2025", "2025-10-01", "10/01/2025", Excel serial numbers
 */
function parseDate(val) {
  if (val === null || val === undefined || val === '') return null;

  // Handle numeric values first (Excel serial numbers from XLSX parser)
  if (typeof val === 'number') {
    if (val > 40000 && val < 60000) {
      const d = new Date((val - 25569) * 86400000);
      return d.toISOString().substring(0, 10);
    }
    return null;
  }

  // Ensure string for regex operations
  val = String(val);

  // Already ISO date
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);

  // German format: DD.MM.YYYY
  const de = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`;

  // US format: MM/DD/YYYY
  const us = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;

  // Excel serial number as string
  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date((num - 25569) * 86400000);
    return d.toISOString().substring(0, 10);
  }

  return null;
}

/**
 * Parse price strings: "64,51" or "64.51" → 64.51
 */
function parsePrice(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return val;
  return Number(String(val).replace(/\./g, '').replace(',', '.')) || null;
}

export default async (request) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // Rate limiting — bank import is an admin operation
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`bank-import:${clientIP}`, 10, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[bank-import] Missing required environment variables');
    return safeErrorResponse(500, 'Server-Konfigurationsfehler', origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const { assets } = body;
  if (!Array.isArray(assets) || assets.length === 0) {
    return new Response(JSON.stringify({ error: 'Body must contain "assets" array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // Limit batch size to prevent abuse
  if (assets.length > 5000) {
    return new Response(JSON.stringify({ error: 'Maximal 5000 Assets pro Import' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // Map and clean all assets
  const rows = assets
    .map(a => {
      const mapped = mapAsset(a);
      // Parse dates
      mapped.rental_start = parseDate(mapped.rental_start);
      mapped.rental_end_planned = parseDate(mapped.rental_end_planned);
      mapped.rental_end_actual = parseDate(mapped.rental_end_actual);
      // Parse price
      mapped.monthly_price = parsePrice(mapped.monthly_price);
      // Parse integer fields
      mapped.customer_id = mapped.customer_id ? Math.round(mapped.customer_id) : null;
      mapped.lessor_id = mapped.lessor_id ? Math.round(mapped.lessor_id) : null;
      return mapped;
    })
    .filter(r => r.asset_id); // Must have asset_id

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid assets (missing asset_id)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // Upsert to bank_leasing in batches (on conflict: asset_id)
  const batchSize = 100;
  let upserted = 0;
  let errors = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${supabaseUrl}/rest/v1/bank_leasing?on_conflict=asset_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[bank-import] Supabase upsert error: ${res.status} ${errText.substring(0, 300)}`);
      errors.push({ batch: i / batchSize + 1, status: res.status, error: errText.substring(0, 200) });
    } else {
      upserted += batch.length;
    }
  }

  const result = {
    imported: upserted,
    total: rows.length,
    skipped: assets.length - rows.length,
    errors: errors.length > 0 ? errors : undefined,
  };

  console.log(`[bank-import] Imported ${upserted}/${rows.length} assets (${assets.length - rows.length} skipped)`);

  return new Response(JSON.stringify(result), {
    status: errors.length > 0 && upserted === 0 ? 500 : 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
};
