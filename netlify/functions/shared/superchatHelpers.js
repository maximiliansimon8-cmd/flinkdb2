/**
 * Shared SuperChat API Helpers
 *
 * Extracted from install-booker-invite.js for reuse across:
 *   - install-booker-invite.js (Install-Einladungen)
 *   - akquise-outreach.js (KI-Akquise Automation)
 *
 * Provides:
 *   - superchatRequest() — low-level API helper
 *   - getAttributeDefinitions() — cached attribute ID lookup
 *   - findContactByPhone() — search contact by phone
 *   - upsertSuperchatContact() — create or update contact with custom attributes
 *   - getSuperchatConfig() — feature flags (enabled + test phone)
 *   - sendTemplate() — send WhatsApp template message
 *   - sendTextMessage() — send plain text WhatsApp message
 */

const SUPERCHAT_BASE = 'https://api.superchat.com/v1.0';

// In-memory cache for attribute definitions (cleared on cold start)
let _attributeCache = null;
let _attributeCacheTs = 0;
const ATTR_CACHE_TTL = 10 * 60 * 1000; // 10 min

/**
 * SuperChat API helper — low-level fetch wrapper.
 * @param {string} path — API path (e.g. 'contacts', 'messages')
 * @param {string} apiKey — SUPERCHAT_API_KEY
 * @param {object} options — fetch options (method, body, headers)
 * @returns {{ ok: boolean, status: number, data: any }}
 */
export async function superchatRequest(path, apiKey, options = {}) {
  const res = await fetch(`${SUPERCHAT_BASE}/${path}`, {
    ...options,
    headers: {
      'X-API-KEY': apiKey,
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

/**
 * Fetch custom attribute definitions from SuperChat.
 * Returns a Map: attributeName → attributeId
 * Cached for 10 minutes in-memory.
 */
export async function getAttributeDefinitions(apiKey, logPrefix = '[superchat]') {
  if (_attributeCache && Date.now() - _attributeCacheTs < ATTR_CACHE_TTL) {
    return _attributeCache;
  }

  const result = await superchatRequest('custom-attributes?limit=100', apiKey);
  if (!result.ok || !result.data?.results) {
    console.warn(`${logPrefix} Failed to load custom attribute definitions:`, result.status);
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
  console.log(`${logPrefix} Loaded ${map.size} custom attribute definitions:`, [...map.keys()].join(', '));
  return map;
}

/**
 * Search for an existing SuperChat contact by phone number.
 * @returns {object|null} — the contact object or null
 */
export async function findContactByPhone(phone, apiKey, logPrefix = '[superchat]') {
  const result = await superchatRequest('contacts/search', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      query: {
        value: [{ field: 'phone', operator: '=', value: phone }],
      },
    }),
  });

  if (!result.ok) {
    console.warn(`${logPrefix} Contact search failed:`, result.status);
    return null;
  }

  const contacts = result.data?.results || result.data;
  if (Array.isArray(contacts) && contacts.length > 0) {
    return contacts[0];
  }
  return null;
}

/**
 * Create or update a SuperChat contact with custom attributes.
 *
 * @param {object} params
 * @param {string} params.phone — normalized phone number
 * @param {string} params.contactName — full name
 * @param {object} params.customAttrs — { attributeName: value } pairs to set
 * @param {string} apiKey
 * @param {string} logPrefix
 * @returns {{ contactId: string|null, created: boolean, updated: boolean }}
 */
export async function upsertSuperchatContact({ phone, contactName, customAttrs = {} }, apiKey, logPrefix = '[superchat]') {
  // 1. Load attribute definitions to get IDs
  const attrDefs = await getAttributeDefinitions(apiKey, logPrefix);

  // Build custom_attributes array with id + value
  // IMPORTANT: SuperChat API requires { id: "ca_...", value: "..." }
  const customAttributes = [];
  for (const [name, value] of Object.entries(customAttrs)) {
    const attrId = attrDefs.get(name);
    if (attrId && value) {
      customAttributes.push({ id: attrId, value: String(value) });
    } else if (!attrId) {
      console.warn(`${logPrefix} Custom attribute "${name}" not found in SuperChat definitions`);
    }
  }

  // 2. Search for existing contact
  const existing = await findContactByPhone(phone, apiKey, logPrefix);

  // Extract first/last name
  const firstName = contactName ? contactName.split(' ')[0] : '';
  const lastName = contactName ? contactName.split(' ').slice(1).join(' ') : '';

  if (existing) {
    // 3a. UPDATE existing contact
    console.log(`${logPrefix} Updating existing contact ${existing.id} (${phone}) with ${customAttributes.length} attributes`);
    const updateResult = await superchatRequest(`contacts/${existing.id}`, apiKey, {
      method: 'PATCH',
      body: JSON.stringify({
        first_name: firstName || existing.first_name || undefined,
        last_name: lastName || existing.last_name || undefined,
        custom_attributes: customAttributes,
      }),
    });

    if (!updateResult.ok) {
      console.error(`${logPrefix} Contact update failed:`, updateResult.status, JSON.stringify(updateResult.data)?.slice(0, 300));
    }
    return { contactId: existing.id, created: false, updated: updateResult.ok };
  }

  // 3b. CREATE new contact
  console.log(`${logPrefix} Creating new contact for ${phone} with ${customAttributes.length} attributes`);
  const createResult = await superchatRequest('contacts', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      first_name: firstName || 'Standortinhaber/in',
      last_name: lastName || '',
      handles: [{ type: 'phone', value: phone }],
      custom_attributes: customAttributes,
    }),
  });

  if (!createResult.ok) {
    console.error(`${logPrefix} Contact creation failed:`, createResult.status, JSON.stringify(createResult.data)?.slice(0, 300));
    return { contactId: null, created: false, updated: false };
  }

  const contactId = createResult.data?.id || null;
  console.log(`${logPrefix} Created contact ${contactId}`);
  return { contactId, created: true, updated: false };
}

/**
 * Check SuperChat feature flags: enabled + optional test phone override.
 * Reads from Supabase feature_flags table.
 *
 * @param {string} supabaseUrl
 * @param {string} supabaseKey
 * @param {string[]} flagKeys — which flags to check (default: superchat_enabled + superchat_test_phone)
 * @returns {{ enabled: boolean, testPhone: string|null }}
 */
export async function getSuperchatConfig(supabaseUrl, supabaseKey, flagKeys = ['superchat_enabled', 'superchat_test_phone']) {
  try {
    const keyList = flagKeys.map(k => k).join(',');
    const res = await fetch(`${supabaseUrl}/rest/v1/feature_flags?key=in.(${keyList})&select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
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

/**
 * Check Akquise automation feature flags.
 *
 * @param {string} supabaseUrl
 * @param {string} supabaseKey
 * @returns {{ enabled: boolean, aiEnabled: boolean, testPhone: string|null, maxDailySends: number }}
 */
export async function getAkquiseConfig(supabaseUrl, supabaseKey) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/feature_flags?key=in.(akquise_automation_enabled,akquise_ai_bot_enabled,akquise_test_phone,akquise_max_daily_sends)&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!res.ok) return { enabled: false, aiEnabled: false, testPhone: null, maxDailySends: 50 };
    const data = await res.json();
    const find = (key) => data.find(f => f.key === key);
    return {
      enabled: find('akquise_automation_enabled')?.enabled === true,
      aiEnabled: find('akquise_ai_bot_enabled')?.enabled === true,
      testPhone: find('akquise_test_phone')?.enabled ? (find('akquise_test_phone').description || null) : null,
      maxDailySends: parseInt(find('akquise_max_daily_sends')?.description || '50', 10),
    };
  } catch { return { enabled: false, aiEnabled: false, testPhone: null, maxDailySends: 50 }; }
}

/**
 * Send a WhatsApp template message via SuperChat.
 *
 * @param {object} params
 * @param {string} params.phone — recipient phone (already normalized)
 * @param {string} params.templateId — SuperChat template ID (tn_...)
 * @param {Array<{position: number, value: string}>} params.variables — template variables
 * @param {string} params.channelId — WhatsApp channel ID
 * @param {string} apiKey
 * @param {string} logPrefix
 * @returns {{ ok: boolean, status: number, data: any }}
 */
export async function sendTemplate({ phone, templateId, variables, channelId }, apiKey, logPrefix = '[superchat]') {
  console.log(`${logPrefix} Sending template ${templateId} to ${phone} via channel ${channelId}`, JSON.stringify(variables));
  const result = await superchatRequest('messages', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      to: [{ identifier: phone }],
      from: { channel_id: channelId },
      content: {
        type: 'whats_app_template',
        template_id: templateId,
        variables,
      },
    }),
  });
  console.log(`${logPrefix} Template result: ${result.status} ${result.ok ? 'OK' : 'FAILED'}`, JSON.stringify(result.data)?.slice(0, 500));
  return result;
}

/**
 * Send a plain text WhatsApp message via SuperChat.
 *
 * @param {object} params
 * @param {string} params.phone — recipient phone
 * @param {string} params.text — message body
 * @param {string} params.channelId — WhatsApp channel ID
 * @param {string} apiKey
 * @param {string} logPrefix
 * @returns {{ ok: boolean, status: number, data: any }}
 */
export async function sendTextMessage({ phone, text, channelId }, apiKey, logPrefix = '[superchat]') {
  console.log(`${logPrefix} Sending text message to ${phone} via channel ${channelId}`);
  const result = await superchatRequest('messages', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      to: [{ identifier: phone }],
      from: { channel_id: channelId },
      content: { type: 'text', body: text },
    }),
  });
  console.log(`${logPrefix} Text message result: ${result.status} ${result.ok ? 'OK' : 'FAILED'}`, JSON.stringify(result.data)?.slice(0, 300));
  return result;
}
