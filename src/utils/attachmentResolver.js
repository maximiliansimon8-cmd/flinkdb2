/**
 * Attachment URL Resolver
 *
 * Airtable attachment URLs expire after ~2 hours. This module resolves
 * them to permanent Supabase Storage URLs using the attachment_cache table.
 *
 * Usage:
 *   import { resolveRecordImages, resolveImageUrl } from './attachmentResolver';
 *
 *   // Resolve all images for a record (returns new array with permanent URLs)
 *   const resolved = await resolveRecordImages(recordId, images);
 *
 *   // Check a single image URL
 *   const url = resolveImageUrl(recordId, filename);
 */

import { supabase } from './authService';

// ═══════════════════════════════════════════════
//  IN-MEMORY CACHE
// ═══════════════════════════════════════════════

// Cache: recordId → { filename → publicUrl }
const _cache = new Map();
const _cacheTimestamps = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (Supabase URLs don't expire)

/**
 * Fetch all cached attachment URLs for a given record from Supabase.
 * Results are cached in memory for 30 minutes.
 *
 * @param {string} recordId - Airtable record ID (e.g., "recXYZ123")
 * @param {string} fieldName - Airtable field name (default: "images_akquise")
 * @returns {Promise<Record<string, string>>} Map of filename → public URL
 */
export async function fetchCachedUrls(recordId, fieldName = 'images_akquise') {
  const cacheKey = `${recordId}|${fieldName}`;

  // Check in-memory cache
  const ts = _cacheTimestamps.get(cacheKey);
  if (ts && Date.now() - ts < CACHE_TTL && _cache.has(cacheKey)) {
    return _cache.get(cacheKey);
  }

  try {
    const { data, error } = await supabase
      .from('attachment_cache')
      .select('original_filename,public_url')
      .eq('airtable_record_id', recordId)
      .eq('airtable_field', fieldName);

    if (error) {
      console.warn('[attachmentResolver] Cache query error:', error.message);
      return {};
    }

    const urlMap = {};
    for (const row of data || []) {
      urlMap[row.original_filename] = row.public_url;
    }

    _cache.set(cacheKey, urlMap);
    _cacheTimestamps.set(cacheKey, Date.now());

    return urlMap;
  } catch (err) {
    console.warn('[attachmentResolver] Error:', err.message);
    return {};
  }
}

/**
 * Resolve a single image attachment to its cached Supabase Storage URL.
 *
 * @param {string} recordId - Airtable record ID
 * @param {object|string} img - Airtable attachment object or URL string
 * @param {string} fieldName - Field name (default: "images_akquise")
 * @returns {Promise<string|null>} Permanent URL or original URL as fallback
 */
export async function resolveImageUrl(recordId, img, fieldName = 'images_akquise') {
  const filename = typeof img === 'string' ? null : img?.filename;
  if (!filename || !recordId) {
    return typeof img === 'string' ? img : img?.url || null;
  }

  const urlMap = await fetchCachedUrls(recordId, fieldName);
  return urlMap[filename] || img?.url || null;
}

/**
 * Resolve all images for a record, replacing expired Airtable URLs
 * with permanent Supabase Storage URLs where available.
 *
 * Returns a NEW array — does not mutate the input.
 *
 * @param {string} recordId - Airtable record ID
 * @param {Array} images - Array of Airtable attachment objects [{url, filename, thumbnails, ...}]
 * @param {string} fieldName - Field name (default: "images_akquise")
 * @returns {Promise<Array>} Resolved image array with permanent URLs
 */
export async function resolveRecordImages(recordId, images, fieldName = 'images_akquise') {
  if (!images || images.length === 0 || !recordId) return images || [];

  const urlMap = await fetchCachedUrls(recordId, fieldName);

  if (Object.keys(urlMap).length === 0) {
    // No cached URLs available — return original (may be expired)
    return images;
  }

  return images.map(img => {
    if (typeof img === 'string') return img;
    const filename = img?.filename;
    if (!filename) return img;

    const cachedUrl = urlMap[filename];
    if (cachedUrl) {
      return {
        ...img,
        url: cachedUrl,
        // Also update thumbnails to use cached URL (thumbnails expire too!)
        thumbnails: {
          ...img.thumbnails,
          large: { ...(img.thumbnails?.large || {}), url: cachedUrl },
          full: { ...(img.thumbnails?.full || {}), url: cachedUrl },
          small: { ...(img.thumbnails?.small || {}), url: cachedUrl },
        },
        _cached: true,
      };
    }
    return img;
  });
}

/**
 * Resolve document attachment URLs (Vertrag PDF, FAW data, etc.)
 * for a single record. Returns a map of { fieldName: resolvedUrl }.
 *
 * @param {string} recordId - Airtable record ID
 * @param {object} attachments - Map of fieldName → attachment array
 * @returns {Promise<Record<string, string>>} Map of fieldName → resolved URL
 */
export async function resolveDocumentUrls(recordId, attachments) {
  if (!recordId || !attachments) return {};

  const result = {};

  for (const [fieldName, atts] of Object.entries(attachments)) {
    if (!atts || !Array.isArray(atts) || atts.length === 0) continue;
    const first = atts[0];
    if (!first?.filename) {
      result[fieldName] = first?.url || null;
      continue;
    }

    const urlMap = await fetchCachedUrls(recordId, fieldName);
    result[fieldName] = urlMap[first.filename] || first.url || null;
  }

  return result;
}

/**
 * Batch-resolve images for multiple records at once.
 * More efficient than calling resolveRecordImages per record.
 *
 * @param {Array<{recordId: string, images: Array}>} records
 * @param {string} fieldName
 * @returns {Promise<Map<string, Array>>} Map of recordId → resolved images
 */
export async function batchResolveImages(records, fieldName = 'images_akquise') {
  if (!records || records.length === 0) return new Map();

  // Collect all record IDs that need resolution
  const recordIds = records
    .filter(r => r.images && r.images.length > 0)
    .map(r => r.recordId);

  if (recordIds.length === 0) return new Map();

  // Batch fetch all cache entries in one query
  try {
    const { data, error } = await supabase
      .from('attachment_cache')
      .select('airtable_record_id,original_filename,public_url')
      .eq('airtable_field', fieldName)
      .in('airtable_record_id', recordIds);

    if (error) {
      console.warn('[attachmentResolver] Batch query error:', error.message);
      return new Map();
    }

    // Build nested lookup: recordId → { filename → publicUrl }
    const lookup = new Map();
    for (const row of data || []) {
      if (!lookup.has(row.airtable_record_id)) {
        lookup.set(row.airtable_record_id, {});
      }
      lookup.get(row.airtable_record_id)[row.original_filename] = row.public_url;
    }

    // Also populate the per-record cache
    for (const [recId, urlMap] of lookup.entries()) {
      const cacheKey = `${recId}|${fieldName}`;
      _cache.set(cacheKey, urlMap);
      _cacheTimestamps.set(cacheKey, Date.now());
    }

    // Resolve each record's images
    const resultMap = new Map();
    for (const rec of records) {
      const urlMap = lookup.get(rec.recordId) || {};
      if (Object.keys(urlMap).length === 0) {
        resultMap.set(rec.recordId, rec.images);
        continue;
      }

      resultMap.set(rec.recordId, rec.images.map(img => {
        if (typeof img === 'string') return img;
        const cachedUrl = urlMap[img?.filename];
        if (cachedUrl) {
          return {
            ...img,
            url: cachedUrl,
            thumbnails: {
              ...img.thumbnails,
              large: { ...(img.thumbnails?.large || {}), url: cachedUrl },
              full: { ...(img.thumbnails?.full || {}), url: cachedUrl },
              small: { ...(img.thumbnails?.small || {}), url: cachedUrl },
            },
            _cached: true,
          };
        }
        return img;
      }));
    }

    return resultMap;
  } catch (err) {
    console.warn('[attachmentResolver] Batch error:', err.message);
    return new Map();
  }
}

/**
 * Clear the in-memory cache (useful after sync operations).
 */
export function clearCache() {
  _cache.clear();
  _cacheTimestamps.clear();
}
