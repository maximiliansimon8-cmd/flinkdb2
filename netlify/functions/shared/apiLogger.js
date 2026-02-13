/**
 * Shared API Usage Logger
 *
 * Fire-and-forget logging of all external API calls to Supabase.
 * Non-blocking — errors are silently caught so they never break the actual function.
 *
 * Usage in any Netlify function:
 *   import { logApiCall } from './shared/apiLogger.js';
 *
 *   const start = Date.now();
 *   // ... do API call ...
 *   logApiCall({
 *     functionName: 'chat-proxy',
 *     service: 'anthropic',
 *     method: 'POST',
 *     endpoint: '/v1/messages',
 *     durationMs: Date.now() - start,
 *     statusCode: 200,
 *     success: true,
 *     tokensIn: usage.input_tokens,
 *     tokensOut: usage.output_tokens,
 *     estimatedCostCents: calculateCost(usage),
 *   });
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Log a single API call to the api_usage_log table.
 * Fire-and-forget — never throws, never blocks.
 */
export function logApiCall({
  functionName,
  service,
  method = null,
  endpoint = null,
  durationMs = null,
  statusCode = null,
  success = true,
  tokensIn = null,
  tokensOut = null,
  recordsCount = null,
  bytesTransferred = null,
  estimatedCostCents = null,
  userId = null,
  errorMessage = null,
  metadata = null,
}) {
  // Fire-and-forget — don't await
  _insert({
    function_name: functionName,
    service,
    method,
    endpoint,
    duration_ms: durationMs,
    status_code: statusCode,
    success,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    records_count: recordsCount,
    bytes_transferred: bytesTransferred,
    estimated_cost_cents: estimatedCostCents,
    user_id: userId,
    error_message: errorMessage,
    metadata: metadata ? JSON.stringify(metadata) : null,
  }).catch(() => {
    // Silently ignore logging failures — never break the actual function
  });
}

/**
 * Log multiple API calls at once (batch insert).
 * Useful for sync functions that make many calls.
 */
export function logApiCalls(entries) {
  const rows = entries.map(e => ({
    function_name: e.functionName,
    service: e.service,
    method: e.method || null,
    endpoint: e.endpoint || null,
    duration_ms: e.durationMs || null,
    status_code: e.statusCode || null,
    success: e.success !== false,
    tokens_in: e.tokensIn || null,
    tokens_out: e.tokensOut || null,
    records_count: e.recordsCount || null,
    bytes_transferred: e.bytesTransferred || null,
    estimated_cost_cents: e.estimatedCostCents || null,
    user_id: e.userId || null,
    error_message: e.errorMessage || null,
    metadata: e.metadata ? JSON.stringify(e.metadata) : null,
  }));

  _insertBatch(rows).catch(() => {});
}

/**
 * Estimate Claude API cost in cents.
 * Sonnet 4: $3/M input, $15/M output (as of 2025)
 */
export function estimateClaudeCost(inputTokens, outputTokens) {
  const inputCost = (inputTokens / 1_000_000) * 300;   // $3.00/M = 300 cents/M
  const outputCost = (outputTokens / 1_000_000) * 1500; // $15.00/M = 1500 cents/M
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}

/**
 * Estimate Airtable API cost.
 * Free tier: 100k records/month. After that: usage-based.
 * We just track calls, not actual billing.
 */
export function estimateAirtableCost(recordCount) {
  // Rough: ~0.001 cent per record read/written
  return Math.round(recordCount * 0.001 * 10000) / 10000;
}

// ─── Internal: Supabase insert ───

async function _insert(row) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  await fetch(`${SUPABASE_URL}/rest/v1/api_usage_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
}

async function _insertBatch(rows) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !rows.length) return;

  // Batch in chunks of 100
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await fetch(`${SUPABASE_URL}/rest/v1/api_usage_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(chunk),
    });
  }
}
