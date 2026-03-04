/**
 * Netlify Function: Akquise Outreach
 *
 * Handles campaign-based WhatsApp outreach for KI-Akquise.
 *
 * Endpoints:
 *   POST /api/akquise/outreach
 *     action: 'send_campaign'    — Sends template to all pending leads in a campaign
 *     action: 'send_single'      — Sends template to a single lead
 *     action: 'get_campaigns'    — List all campaigns
 *     action: 'create_campaign'  — Create a new campaign
 *     action: 'get_conversations'— List conversations (with filters)
 *     action: 'get_conversation' — Get single conversation with messages
 *     action: 'get_stats'        — Get automation stats
 *
 * Auth: Origin check + JWT (dashboard user)
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
  normalizePhone, sanitizeString,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import {
  superchatRequest, getAkquiseConfig,
  upsertSuperchatContact, sendTemplate,
} from './shared/superchatHelpers.js';
import { ACQUISITION_FIELDS as AF, VALUES } from './shared/airtableFields.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const WA_CHANNEL = process.env.SUPERCHAT_WA_CHANNEL_ID || 'mc_cy5HABDnpRhRtosxckRzb';

const LOG_PREFIX = '[akquise-outreach]';

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

/** Write to akquise_activity_log (fire-and-forget) */
async function writeLog(entry) {
  try {
    await supabaseRequest('akquise_activity_log', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        user_name:           entry.user_name || 'KI-Bot',
        action:              entry.action,
        conversation_id:     entry.conversation_id || null,
        akquise_airtable_id: entry.akquise_airtable_id || null,
        location_name:       entry.location_name || null,
        city:                entry.city || null,
        detail:              entry.detail || {},
        source:              entry.source || 'automation',
      }),
    });
  } catch (e) {
    console.warn(`${LOG_PREFIX} writeLog failed (non-fatal):`, e.message);
  }
}

/** Verify JWT from Authorization header */
async function verifyJWT(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');

  try {
    // Verify token with Supabase Auth
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_KEY,
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════
 *  ACTION HANDLERS
 * ═══════════════════════════════════════════════ */

/** Get automation stats */
async function handleGetStats() {
  const [campaigns, conversations, todaySent] = await Promise.all([
    supabaseRequest('akquise_campaigns?select=id,status&limit=100'),
    supabaseRequest('akquise_conversations?select=id,status&limit=5000'),
    supabaseRequest(
      `akquise_conversations?template_sent_at=gte.${new Date().toISOString().split('T')[0]}&select=id&limit=1000`
    ),
  ]);

  const convData = conversations.data || [];
  const statusCounts = {};
  for (const c of convData) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  }

  return {
    totalCampaigns: (campaigns.data || []).length,
    activeCampaigns: (campaigns.data || []).filter(c => c.status === 'active').length,
    totalConversations: convData.length,
    statusBreakdown: statusCounts,
    sentToday: (todaySent.data || []).length,
  };
}

/** List all campaigns */
async function handleGetCampaigns() {
  const result = await supabaseRequest(
    'akquise_campaigns?select=*&order=created_at.desc&limit=50'
  );
  if (!result.ok) throw new Error('Kampagnen konnten nicht geladen werden');
  return result.data || [];
}

/** Create a new campaign */
async function handleCreateCampaign(body, userName) {
  const { name, description, templateId, targetFilter } = body;
  if (!name || !templateId) {
    throw new Error('Name und Template-ID sind erforderlich');
  }

  // Count matching leads
  let leadCount = 0;
  const cities = targetFilter?.cities || [];
  let query = `acquisition?lead_status=eq.${encodeURIComponent(VALUES.LEAD_STATUS.NEW_LEAD)}&select=airtable_id&limit=5000`;
  if (cities.length > 0) {
    query += `&city=in.(${cities.map(c => encodeURIComponent(c)).join(',')})`;
  }
  const leadsResult = await supabaseRequest(query);
  leadCount = (leadsResult.data || []).length;

  const result = await supabaseRequest('akquise_campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: sanitizeString(name),
      description: sanitizeString(description || ''),
      template_id: templateId,
      target_filter: targetFilter || {},
      total_leads: leadCount,
      created_by: userName || 'System',
    }),
  });

  if (!result.ok) throw new Error('Kampagne konnte nicht erstellt werden');

  writeLog({
    user_name: userName,
    action: 'campaign_created',
    detail: { name, templateId, leadCount },
    source: 'manual',
  });

  return result.data?.[0] || result.data;
}

/** Send template to a single lead */
async function handleSendSingle(body, userName) {
  const { akquiseAirtableId, campaignId, templateId } = body;
  if (!akquiseAirtableId) throw new Error('akquiseAirtableId ist erforderlich');

  // Check feature flag
  const config = await getAkquiseConfig(SUPABASE_URL, SUPABASE_KEY);
  if (!config.enabled) {
    throw new Error('Akquise-Automation ist deaktiviert (Feature Flag)');
  }

  // Check daily limit
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySent = await supabaseRequest(
    `akquise_conversations?template_sent_at=gte.${todayStr}&select=id&limit=1000`
  );
  if ((todaySent.data || []).length >= config.maxDailySends) {
    throw new Error(`Tageslimit erreicht (${config.maxDailySends} Nachrichten/Tag)`);
  }

  // Fetch lead data from Supabase acquisition table
  const leadResult = await supabaseRequest(
    `acquisition?airtable_id=eq.${encodeURIComponent(akquiseAirtableId)}&select=airtable_id,lead_status,location_name,city,contact_person,contact_phone,contact_email,jet_id,street,street_number,postal_code&limit=1`
  );
  if (!leadResult.ok || !leadResult.data?.length) {
    throw new Error('Lead nicht gefunden');
  }
  const lead = leadResult.data[0];

  if (!lead.contact_phone) {
    throw new Error('Keine Telefonnummer für diesen Lead vorhanden');
  }

  // Check for existing conversation
  const existingConv = await supabaseRequest(
    `akquise_conversations?akquise_airtable_id=eq.${encodeURIComponent(akquiseAirtableId)}&status=not.in.(error,declined,unresponsive,disqualified)&select=id,status&limit=1`
  );
  if (existingConv.ok && existingConv.data?.length > 0) {
    const existing = existingConv.data[0];
    throw new Error(`Für diesen Standort läuft bereits eine Konversation (Status: ${existing.status})`);
  }

  const phone = normalizePhone(config.testPhone || lead.contact_phone);
  const realPhone = normalizePhone(lead.contact_phone);
  if (config.testPhone) {
    console.log(`${LOG_PREFIX} TEST MODE — redirecting WA from ${lead.contact_phone} to ${config.testPhone}`);
  }

  // 1. Create conversation record
  const convResult = await supabaseRequest('akquise_conversations', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: campaignId || null,
      akquise_airtable_id: akquiseAirtableId,
      contact_phone: realPhone,
      contact_name: lead.contact_person || '',
      contact_email: lead.contact_email || '',
      location_name: lead.location_name || '',
      city: lead.city || '',
      jet_id: lead.jet_id || '',
      status: 'pending',
    }),
  });
  if (!convResult.ok) throw new Error('Konversation konnte nicht erstellt werden');
  const conversation = convResult.data?.[0];

  // 2. Upsert SuperChat contact
  let contactResult = { contactId: null, created: false, updated: false };
  if (SUPERCHAT_API_KEY) {
    try {
      contactResult = await upsertSuperchatContact({
        phone: realPhone,
        contactName: lead.contact_person || '',
        customAttrs: {
          'JET ID': lead.location_name || lead.jet_id || '',
        },
      }, SUPERCHAT_API_KEY, LOG_PREFIX);
    } catch (e) {
      console.error(`${LOG_PREFIX} Contact upsert failed (non-fatal):`, e.message);
    }
  }

  // 3. Send WhatsApp template
  const finalTemplateId = templateId || body.templateId;
  let waResult = { ok: false };

  if (SUPERCHAT_API_KEY && finalTemplateId) {
    const firstName = lead.contact_person ? lead.contact_person.split(' ')[0] : 'Standortinhaber/in';
    const variables = [
      { position: 1, value: firstName },
      { position: 2, value: lead.location_name || lead.city || 'Ihren Standort' },
    ];

    waResult = await sendTemplate({
      phone,
      templateId: finalTemplateId,
      variables,
      channelId: WA_CHANNEL,
    }, SUPERCHAT_API_KEY, LOG_PREFIX);
  }

  // 4. Update conversation status
  const now = new Date().toISOString();
  if (waResult.ok) {
    await supabaseRequest(`akquise_conversations?id=eq.${conversation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'template_sent',
        template_sent_at: now,
        superchat_contact_id: contactResult.contactId || null,
        updated_at: now,
      }),
    });

    // Save message record
    await supabaseRequest('akquise_messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        conversation_id: conversation.id,
        direction: 'outbound',
        sender: 'bot',
        content: `Template gesendet: ${finalTemplateId}`,
        message_type: 'template',
        template_id: finalTemplateId,
      }),
    });
  } else {
    // Mark as error
    const errorMsg = waResult.data?.message || waResult.data?.error || `SuperChat API ${waResult.status}`;
    await supabaseRequest(`akquise_conversations?id=eq.${conversation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'error',
        error_message: errorMsg,
        updated_at: now,
      }),
    });
  }

  // 5. Update campaign stats if applicable
  if (campaignId && waResult.ok) {
    await supabaseRequest(
      `rpc/increment_campaign_sent`,
      {
        method: 'POST',
        body: JSON.stringify({ campaign_id_input: campaignId }),
      }
    ).catch(() => {
      // Fallback: direct update (RPC might not exist yet)
      supabaseRequest(`akquise_campaigns?id=eq.${campaignId}`, {
        method: 'PATCH',
        body: JSON.stringify({ sent_count: 0, updated_at: now }), // Will be recalculated
      }).catch(() => {});
    });
  }

  writeLog({
    user_name: userName,
    action: waResult.ok ? 'template_sent' : 'template_failed',
    conversation_id: conversation.id,
    akquise_airtable_id: akquiseAirtableId,
    location_name: lead.location_name,
    city: lead.city,
    detail: {
      templateId: finalTemplateId,
      phone: config.testPhone ? `TEST:${config.testPhone}` : realPhone,
      error: waResult.ok ? undefined : (waResult.data?.message || `${waResult.status}`),
    },
    source: 'manual',
  });

  return {
    success: waResult.ok,
    conversationId: conversation.id,
    status: waResult.ok ? 'template_sent' : 'error',
    whatsappSent: waResult.ok,
    error: waResult.ok ? undefined : (waResult.data?.message || `SuperChat ${waResult.status}`),
    contact: contactResult,
    testMode: !!config.testPhone,
  };
}

/** List conversations (with filters) */
async function handleGetConversations(body) {
  const { campaignId, status, city, limit: queryLimit = 50, offset = 0 } = body || {};

  let query = 'akquise_conversations?select=*&order=updated_at.desc';
  if (campaignId) query += `&campaign_id=eq.${encodeURIComponent(campaignId)}`;
  if (status) query += `&status=eq.${encodeURIComponent(status)}`;
  if (city) query += `&city=ilike.${encodeURIComponent(city)}*`;
  query += `&limit=${Math.min(queryLimit, 200)}&offset=${offset}`;

  const result = await supabaseRequest(query);
  if (!result.ok) throw new Error('Konversationen konnten nicht geladen werden');
  return result.data || [];
}

/** Get single conversation with messages */
async function handleGetConversation(body) {
  const { conversationId } = body;
  if (!conversationId) throw new Error('conversationId ist erforderlich');

  const [conv, msgs] = await Promise.all([
    supabaseRequest(`akquise_conversations?id=eq.${conversationId}&select=*&limit=1`),
    supabaseRequest(`akquise_messages?conversation_id=eq.${conversationId}&select=*&order=created_at.asc&limit=500`),
  ]);

  if (!conv.ok || !conv.data?.length) throw new Error('Konversation nicht gefunden');

  return {
    conversation: conv.data[0],
    messages: msgs.data || [],
  };
}

/** Send campaign — batch template sends to New Leads */
async function handleSendCampaign(body, userName) {
  const { campaignId } = body;
  if (!campaignId) throw new Error('campaignId ist erforderlich');

  const config = await getAkquiseConfig(SUPABASE_URL, SUPABASE_KEY);
  if (!config.enabled) {
    throw new Error('Akquise-Automation ist deaktiviert (Feature Flag)');
  }

  // Load campaign
  const campResult = await supabaseRequest(
    `akquise_campaigns?id=eq.${campaignId}&select=*&limit=1`
  );
  if (!campResult.ok || !campResult.data?.length) throw new Error('Kampagne nicht gefunden');
  const campaign = campResult.data[0];

  if (campaign.status !== 'active' && campaign.status !== 'draft') {
    throw new Error(`Kampagne ist nicht aktiv (Status: ${campaign.status})`);
  }

  // Fetch eligible leads
  const filter = campaign.target_filter || {};
  let query = `acquisition?lead_status=eq.${encodeURIComponent(VALUES.LEAD_STATUS.NEW_LEAD)}&contact_phone=not.is.null&select=airtable_id,location_name,city,contact_person,contact_phone,contact_email,jet_id&limit=500`;
  if (filter.cities?.length > 0) {
    query += `&city=in.(${filter.cities.map(c => encodeURIComponent(c)).join(',')})`;
  }
  const leadsResult = await supabaseRequest(query);
  const allLeads = (leadsResult.data || []).filter(l => l.contact_phone);

  // Exclude leads that already have a conversation
  const existingConvs = await supabaseRequest(
    `akquise_conversations?status=not.in.(error)&select=akquise_airtable_id&limit=5000`
  );
  const existingIds = new Set((existingConvs.data || []).map(c => c.akquise_airtable_id));
  const eligibleLeads = allLeads.filter(l => !existingIds.has(l.airtable_id));

  // Check daily limit
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySent = await supabaseRequest(
    `akquise_conversations?template_sent_at=gte.${todayStr}&select=id&limit=1000`
  );
  const sentToday = (todaySent.data || []).length;
  const remaining = Math.max(0, config.maxDailySends - sentToday);
  const toSend = eligibleLeads.slice(0, remaining);

  if (toSend.length === 0) {
    return {
      sent: 0,
      skipped: allLeads.length - eligibleLeads.length,
      limitReached: remaining === 0,
      totalEligible: eligibleLeads.length,
    };
  }

  // Update campaign status to active
  await supabaseRequest(`akquise_campaigns?id=eq.${campaignId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'active',
      started_at: campaign.started_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  // Send templates sequentially (to avoid rate limits)
  let sentCount = 0;
  let errorCount = 0;
  const results = [];

  for (const lead of toSend) {
    try {
      const result = await handleSendSingle({
        akquiseAirtableId: lead.airtable_id,
        campaignId,
        templateId: campaign.template_id,
      }, userName);

      if (result.success) {
        sentCount++;
      } else {
        errorCount++;
      }
      results.push({ airtableId: lead.airtable_id, ...result });

      // Small delay between sends (avoid SuperChat rate limits)
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (e) {
      errorCount++;
      results.push({ airtableId: lead.airtable_id, success: false, error: e.message });
    }
  }

  // Update campaign stats
  await supabaseRequest(`akquise_campaigns?id=eq.${campaignId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      sent_count: (campaign.sent_count || 0) + sentCount,
      updated_at: new Date().toISOString(),
    }),
  });

  writeLog({
    user_name: userName,
    action: 'campaign_batch_sent',
    detail: { campaignId, sent: sentCount, errors: errorCount, total: toSend.length },
    source: 'manual',
  });

  return {
    sent: sentCount,
    errors: errorCount,
    skipped: allLeads.length - eligibleLeads.length,
    totalEligible: eligibleLeads.length,
    limitReached: remaining <= toSend.length,
    results: results.slice(0, 20), // Only first 20 for response size
  };
}

/* ═══════════════════════════════════════════════
 *  MAIN HANDLER
 * ═══════════════════════════════════════════════ */

export default async (request, context) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const cors = corsHeaders(origin);
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`akquise-outreach:${clientIP}`, 30, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs, origin);

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  // Verify JWT
  const user = await verifyJWT(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const apiStart = Date.now();

  try {
    const body = await request.json();
    const { action } = body;

    let result;

    switch (action) {
      case 'get_stats':
        result = await handleGetStats();
        break;
      case 'get_campaigns':
        result = await handleGetCampaigns();
        break;
      case 'create_campaign':
        result = await handleCreateCampaign(body, user.email);
        break;
      case 'send_single':
        result = await handleSendSingle(body, user.email);
        break;
      case 'send_campaign':
        result = await handleSendCampaign(body, user.email);
        break;
      case 'get_conversations':
        result = await handleGetConversations(body);
        break;
      case 'get_conversation':
        result = await handleGetConversation(body);
        break;
      default:
        return new Response(JSON.stringify({ error: `Unbekannte Aktion: ${action}` }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors },
        });
    }

    logApiCall({
      functionName: 'akquise-outreach',
      service: 'supabase',
      method: 'POST',
      endpoint: action,
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
    });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors },
    });

  } catch (err) {
    logApiCall({
      functionName: 'akquise-outreach',
      service: 'mixed',
      method: 'POST',
      endpoint: 'outreach',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    console.error(`${LOG_PREFIX} Error:`, err.message);
    return safeErrorResponse(500, err.message || 'Akquise-Vorgang fehlgeschlagen', origin, err);
  }
};
