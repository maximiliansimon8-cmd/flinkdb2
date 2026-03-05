/**
 * Netlify Function: Slack Feedback Notifier
 *
 * Receives feedback from the FeedbackWidget and posts it to a Slack channel
 * via Incoming Webhook. This lets the team see and discuss feedback in real-time.
 *
 * Auth: Origin check (dashboard only)
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

const SLACK_WEBHOOK_URL = process.env.SLACK_FEEDBACK_WEBHOOK_URL;

const PRIORITY_EMOJI = {
  low: ':white_circle:',
  medium: ':large_blue_circle:',
  high: ':large_orange_circle:',
  critical: ':red_circle:',
};

const TYPE_EMOJI = {
  bug: ':bug:',
  feedback: ':bulb:',
  feature: ':camera:',
};

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = getAllowedOrigin(origin);

  if (event.httpMethod === 'OPTIONS') {
    return handlePreflight(origin);
  }

  if (!allowed) {
    return forbiddenResponse('Origin not allowed');
  }

  const headers = corsHeaders(origin);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Rate limit: 10 feedback posts per minute per IP
  const ip = getClientIP(event);
  if (!checkRateLimit(ip, 10)) {
    return rateLimitResponse(headers);
  }

  if (!SLACK_WEBHOOK_URL) {
    console.warn('[slack-feedback] SLACK_FEEDBACK_WEBHOOK_URL not configured');
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, slack: 'skipped', reason: 'no webhook configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { type, title, description, priority, userName, component, url } = body;

    if (!description && !title) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Titel oder Beschreibung erforderlich' }) };
    }

    const typeEmoji = TYPE_EMOJI[type] || ':speech_balloon:';
    const prioEmoji = PRIORITY_EMOJI[priority] || ':white_circle:';
    const typeLabel = type === 'bug' ? 'Bug' : type === 'feature' ? 'Screenshot/Feature' : 'Feedback';

    const slackMessage = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${typeLabel}: ${title || 'Kein Titel'}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Typ:*\n${typeEmoji} ${typeLabel}` },
            { type: 'mrkdwn', text: `*Prioritaet:*\n${prioEmoji} ${(priority || 'medium').charAt(0).toUpperCase() + (priority || 'medium').slice(1)}` },
            { type: 'mrkdwn', text: `*Von:*\n${userName || 'Unbekannt'}` },
            { type: 'mrkdwn', text: `*Bereich:*\n${component || 'Unbekannt'}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Beschreibung:*\n${description || '_Keine Beschreibung_'}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `<${url || 'https://startling-pothos-27fc77.netlify.app'}|Im Dashboard oeffnen>`,
            },
          ],
        },
      ],
    };

    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    const slackOk = slackRes.ok;
    if (!slackOk) {
      const errText = await slackRes.text();
      console.error('[slack-feedback] Slack webhook error:', slackRes.status, errText);
    }

    logApiCall('slack-feedback', 'slack-webhook', slackOk ? 'success' : 'error');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, slack: slackOk ? 'sent' : 'error' }),
    };
  } catch (err) {
    console.error('[slack-feedback] Error:', err.message);
    return safeErrorResponse(headers, err);
  }
};
