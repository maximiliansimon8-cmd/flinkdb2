/**
 * Attachment Helper — Resolve permanent URLs for Airtable attachments
 *
 * Airtable attachment URLs expire after ~2 hours. This helper checks
 * the attachment_cache table in Supabase for a permanent URL first,
 * and falls back to the (possibly expired) Airtable URL if not cached.
 *
 * Usage:
 *   import { getAttachmentUrl, getAttachmentUrls } from './shared/attachmentHelper.js';
 *
 *   // Single attachment
 *   const url = await getAttachmentUrl(supabaseUrl, serviceKey, recordId, 'images_akquise', 'photo.jpg');
 *
 *   // All attachments for a record + field
 *   const urls = await getAttachmentUrls(supabaseUrl, serviceKey, recordId, 'images_akquise');
 */

/**
 * Get the permanent Supabase Storage URL for a single attachment.
 * Returns the cached public_url if found, or null.
 *
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} serviceKey  - Supabase service role key
 * @param {string} airtableRecordId - Airtable record ID (e.g. "recXYZ123")
 * @param {string} fieldName   - Airtable field name (e.g. "images_akquise")
 * @param {string} filename    - Original filename (e.g. "photo.jpg")
 * @returns {Promise<string|null>} Permanent public URL or null
 */
export async function getAttachmentUrl(supabaseUrl, serviceKey, airtableRecordId, fieldName, filename) {
  try {
    const params = new URLSearchParams({
      airtable_record_id: `eq.${airtableRecordId}`,
      airtable_field: `eq.${fieldName}`,
      original_filename: `eq.${filename}`,
      select: 'public_url',
      limit: '1',
    });

    const res = await fetch(`${supabaseUrl}/rest/v1/attachment_cache?${params}`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });

    if (!res.ok) return null;

    const rows = await res.json();
    return rows.length > 0 ? rows[0].public_url : null;
  } catch {
    return null;
  }
}

/**
 * Get all cached attachment URLs for a given record + field.
 * Returns a map of { filename: publicUrl }.
 *
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @param {string} airtableRecordId
 * @param {string} fieldName
 * @returns {Promise<Record<string, string>>} Map of filename → public URL
 */
export async function getAttachmentUrls(supabaseUrl, serviceKey, airtableRecordId, fieldName) {
  try {
    const params = new URLSearchParams({
      airtable_record_id: `eq.${airtableRecordId}`,
      airtable_field: `eq.${fieldName}`,
      select: 'original_filename,public_url',
    });

    const res = await fetch(`${supabaseUrl}/rest/v1/attachment_cache?${params}`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });

    if (!res.ok) return {};

    const rows = await res.json();
    const map = {};
    for (const row of rows) {
      map[row.original_filename] = row.public_url;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Resolve an array of Airtable attachment objects, replacing expired URLs
 * with permanent Supabase Storage URLs where available.
 *
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @param {string} airtableRecordId
 * @param {string} fieldName
 * @param {Array} attachments - Array of Airtable attachment objects [{url, filename, ...}]
 * @returns {Promise<Array>} Same array but with urls replaced where cached
 */
export async function resolveAttachments(supabaseUrl, serviceKey, airtableRecordId, fieldName, attachments) {
  if (!attachments || attachments.length === 0) return attachments;

  const cachedUrls = await getAttachmentUrls(supabaseUrl, serviceKey, airtableRecordId, fieldName);

  return attachments.map(att => {
    const cachedUrl = cachedUrls[att.filename];
    if (cachedUrl) {
      return {
        ...att,
        url: cachedUrl,
        cached: true,
      };
    }
    return { ...att, cached: false };
  });
}
