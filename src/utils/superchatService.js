/**
 * Superchat Service – real-time communication via Superchat API v1.0
 * Handles conversations, messages, contacts, templates, and channels.
 *
 * In development: uses Vite dev proxy at /api/superchat
 * In production: uses Netlify function at /api/superchat
 *
 * Pagination: Superchat uses cursor-based pagination with `next_cursor`.
 * Rate limit: 2,500 requests / 5 min.
 */

import { createCommunicationRecord } from './airtableService';

const SUPERCHAT_BASE = '/api/superchat';

/* ═══════════════════════ Internal helpers ═══════════════════════ */

/**
 * Generic paginated fetcher.
 * Superchat returns: { results: [], pagination: { next_cursor, previous_cursor, next_url, previous_url } }
 * The query param for the next page is `after=<next_cursor>`.
 */
async function fetchPaginated(path, { limit = 100, maxPages = 50 } = {}) {
  let allResults = [];
  let cursor = null;
  let page = 0;

  do {
    page++;
    let url = `${SUPERCHAT_BASE}${path}${path.includes('?') ? '&' : '?'}limit=${limit}`;
    if (cursor) url += `&after=${encodeURIComponent(cursor)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const status = response.status;
        console.error(`[Superchat] ${path} page ${page} error: ${status}`);
        // 403 = feature not available, stop pagination
        if (status === 403) return { results: allResults, error: 'forbidden' };
        break;
      }

      const data = await response.json();
      const results = data.results || [];
      allResults = allResults.concat(results);
      cursor = data.pagination?.next_cursor || null;

      // Safety: stop if page returned 0 results
      if (results.length === 0) break;
    } catch (err) {
      console.error(`[Superchat] ${path} page ${page} fetch error:`, err);
      break;
    }
  } while (cursor && page < maxPages);

  return { results: allResults, pages: page };
}

/**
 * Fetch a single page (for progressive loading).
 */
async function fetchOnePage(path, { limit = 100, after = null } = {}) {
  let url = `${SUPERCHAT_BASE}${path}${path.includes('?') ? '&' : '?'}limit=${limit}`;
  if (after) url += `&after=${encodeURIComponent(after)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Superchat] ${path} error: ${response.status}`);
      return { results: [], nextCursor: null, error: response.status };
    }
    const data = await response.json();
    return {
      results: data.results || [],
      nextCursor: data.pagination?.next_cursor || null,
    };
  } catch (err) {
    console.error(`[Superchat] ${path} error:`, err);
    return { results: [], nextCursor: null, error: err.message };
  }
}

/* ═══════════════════════ Conversations ═══════════════════════ */

/**
 * Fetch ONE page of conversations.
 * @returns {{ results: Array, nextCursor: string|null }}
 */
export async function fetchConversationsPage({ limit = 100, after = null } = {}) {
  return fetchOnePage('/conversations', { limit, after });
}

/**
 * Fetch ALL conversations across all pages.
 * @returns {Promise<Array>}
 */
export async function fetchAllConversations() {
  const { results } = await fetchPaginated('/conversations', { limit: 100 });
  return results;
}

/**
 * Fetch a single conversation by ID.
 */
export async function fetchConversation(conversationId) {
  try {
    const response = await fetch(`${SUPERCHAT_BASE}/conversations/${conversationId}`);
    if (!response.ok) {
      console.error('[Superchat] fetchConversation error:', response.status);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error('[Superchat] fetchConversation error:', err);
    return null;
  }
}

/* ═══════════════════════ Messages ═══════════════════════ */

/**
 * Fetch messages for a conversation.
 * NOTE: This endpoint may return 403 if workspace doesn't have the Messages API feature.
 * @returns {{ messages: Array, error?: string }}
 */
export async function fetchMessages(conversationId, params = {}) {
  const limit = params.limit || 50;
  let url = `${SUPERCHAT_BASE}/conversations/${conversationId}/messages?limit=${limit}`;
  if (params.after) url += `&after=${encodeURIComponent(params.after)}`;

  try {
    const response = await fetch(url);
    if (response.status === 403) {
      console.warn('[Superchat] Messages API not available (403) – feature not in workspace plan');
      return { messages: [], error: 'forbidden' };
    }
    if (!response.ok) {
      console.error('[Superchat] fetchMessages error:', response.status);
      return { messages: [], error: `${response.status}` };
    }
    const data = await response.json();
    return {
      messages: data.results || [],
      nextCursor: data.pagination?.next_cursor || null,
    };
  } catch (err) {
    console.error('[Superchat] fetchMessages error:', err);
    return { messages: [], error: err.message };
  }
}

/**
 * Fetch ALL messages for a conversation across all pages.
 * Returns { messages: [], error?: string }
 */
export async function fetchAllMessages(conversationId) {
  const { results, error } = await fetchPaginated(
    `/conversations/${conversationId}/messages`,
    { limit: 100 }
  );
  return { messages: results, error };
}

/**
 * Send a message via Superchat and optionally log it in Airtable.
 * POST /messages
 */
export async function sendMessage(opts) {
  try {
    const payload = {
      from: {
        channel_id: opts.channelId,
        type: opts.channelType || 'whats_app',
      },
      to: {
        contact_id: opts.contactId,
      },
      body: opts.body,
    };
    if (opts.subject) payload.subject = opts.subject;
    if (opts.templateId) payload.template_id = opts.templateId;

    const response = await fetch(`${SUPERCHAT_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Superchat] sendMessage error:', response.status, errText);
      return { success: false, error: `${response.status}: ${errText}` };
    }

    const result = await response.json();

    // Optionally log in Airtable Communication Log
    if (opts.logToAirtable !== false) {
      try {
        const channelLabel = opts.channelType === 'mail' ? 'Email' : 'WhatsApp';
        await createCommunicationRecord({
          channel: channelLabel,
          direction: 'Outbound',
          subject: opts.subject || '',
          message: opts.body,
          recipientName: opts.recipientName || '',
          recipientContact: opts.contactId || '',
          sender: opts.senderName || 'Team',
          status: 'Sent',
          locationIds: opts.locationIds || [],
          externalId: result.id || '',
        });
      } catch (logErr) {
        console.warn('[Superchat] Failed to log in Airtable:', logErr);
      }
    }

    return { success: true, messageId: result.id };
  } catch (err) {
    console.error('[Superchat] sendMessage error:', err);
    return { success: false, error: err.message };
  }
}

/* ═══════════════════════ Contacts ═══════════════════════ */

/**
 * Fetch ONE page of contacts.
 */
export async function fetchContactsPage({ limit = 100, after = null } = {}) {
  return fetchOnePage('/contacts', { limit, after });
}

/**
 * Fetch ALL contacts across all pages.
 */
export async function fetchAllContacts() {
  const { results } = await fetchPaginated('/contacts', { limit: 100 });
  return results;
}

/**
 * Create a contact in Superchat.
 */
export async function createContact(contactData) {
  try {
    const response = await fetch(`${SUPERCHAT_BASE}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactData),
    });
    if (!response.ok) {
      console.error('[Superchat] createContact error:', response.status);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error('[Superchat] createContact error:', err);
    return null;
  }
}

/**
 * Get a single contact by ID.
 */
export async function fetchContact(contactId) {
  try {
    const response = await fetch(`${SUPERCHAT_BASE}/contacts/${contactId}`);
    if (!response.ok) {
      console.error('[Superchat] fetchContact error:', response.status);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error('[Superchat] fetchContact error:', err);
    return null;
  }
}

/* ═══════════════════════ Templates ═══════════════════════ */

/**
 * Fetch ALL templates across all pages.
 */
export async function fetchAllTemplates() {
  const { results } = await fetchPaginated('/templates', { limit: 100 });
  return results;
}

/* ═══════════════════════ Channels ═══════════════════════ */

/**
 * Fetch available channels from Superchat.
 */
export async function fetchChannels() {
  try {
    const response = await fetch(`${SUPERCHAT_BASE}/channels?limit=100`);
    if (!response.ok) {
      console.error('[Superchat] fetchChannels error:', response.status);
      return [];
    }
    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error('[Superchat] fetchChannels error:', err);
    return [];
  }
}

/* ═══════════════════════ Contact Helpers ═══════════════════════ */

/**
 * Extract the contact's display name.
 * Superchat contacts: { first_name, last_name, handles: [{ type, value }], custom_attributes: [...] }
 */
export function getContactDisplayName(contact) {
  if (!contact) return 'Unbekannt';
  const first = contact.first_name || '';
  const last = contact.last_name || '';
  const full = `${first} ${last}`.trim();
  return full || contact.name || 'Unbekannt';
}

/**
 * Get phone number from contact handles.
 */
export function getContactPhone(contact) {
  if (!contact?.handles) return '';
  const h = contact.handles.find((h) => h.type === 'phone' || h.type === 'whats_app');
  return h?.value || '';
}

/**
 * Get email from contact handles.
 */
export function getContactEmail(contact) {
  if (!contact?.handles) return '';
  const h = contact.handles.find((h) => h.type === 'mail' || h.type === 'email');
  return h?.value || '';
}

/**
 * Get a custom attribute value by name.
 */
export function getContactAttribute(contact, attrName) {
  if (!contact?.custom_attributes) return '';
  const attr = contact.custom_attributes.find(
    (a) => a.name?.toLowerCase() === attrName.toLowerCase()
  );
  return attr?.value || '';
}
