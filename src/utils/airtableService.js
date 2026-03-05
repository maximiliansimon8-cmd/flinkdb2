/**
 * Data Service – FlinkDB2 — Dimension Outdoor DOOH Dashboard
 *
 * Architecture (hybrid):
 *   READ  → Supabase (fast, zero Netlify Function calls)
 *   WRITE → Airtable API via proxy (Airtable = source of truth)
 *   SYNC  → Netlify Function syncs Airtable → Supabase periodically
 *
 * This replaces the old Airtable-only reads which were slow (200+ pages)
 * and consumed Netlify Function credits on every load.
 */

import { supabase } from './authService';

/* ═══════════════════════════════════════════════════════════
 *  AIRTABLE CONFIG (for write operations only)
 * ═══════════════════════════════════════════════════════════ */

const BASE_ID = 'apppFUWK829K6B3R2';
const TASKS_TABLE = 'tblcKHWJg77mgIQ9l';
const ACTIVITY_LOG_TABLE = 'tblDk1dl4J3Ow3Qde';
const PARTNERS_TABLE = 'Partners'; // Uses table name (Airtable also accepts names)

// Proxy endpoint – both dev (Vite) and prod (Netlify Function)
const AIRTABLE_BASE = '/api/airtable';

/* ═══════════════════════════════════════════════════════════
 *  IN-MEMORY CACHE
 * ═══════════════════════════════════════════════════════════ */

const cache = {
  stammdaten: new Map(),        // displayId → record
  tasks: new Map(),             // displayId → tasks[]
  installation: new Map(),      // displayId → installation
  allTasks: null,
  allTasksTimestamp: null,
  allStammdaten: null,
  allStammdatenTimestamp: null,
  allCommunications: null,
  allCommunicationsTimestamp: null,
  partners: null,               // { name → recordId } mapping
  partnersTimestamp: null,
  allAcquisition: null,
  allAcquisitionTimestamp: null,
  allInstallationstermine: null,
  allInstallationstermineTimestamp: null,
};

// Supabase syncs every 15 min, so 5 min TTL is safe and prevents redundant fetches
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ═══════════════════════════════════════════════════════════
 *  REQUEST DEDUPLICATION
 *  Prevents duplicate fetches when multiple components mount simultaneously
 * ═══════════════════════════════════════════════════════════ */

const _inflight = {};

/* ═══════════════════════════════════════════════════════════
 *  localStorage PERSISTENCE LAYER
 *  Shows cached data instantly on reload, refreshes in background
 * ═══════════════════════════════════════════════════════════ */

const PERSIST_TTL = 10 * 60 * 1000; // 10 minutes for localStorage

function loadFromPersist(key) {
  try {
    const raw = localStorage.getItem(`jet_cache_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > PERSIST_TTL) {
      localStorage.removeItem(`jet_cache_${key}`);
      return null;
    }
    return data;
  } catch { return null; }
}

function saveToPersist(key, data) {
  try {
    localStorage.setItem(`jet_cache_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

/**
 * Invalidate a specific cache key (call after writes/updates).
 */
export function invalidateCache(key) {
  if (cache[key] !== undefined) cache[key] = null;
  if (cache[key + 'Timestamp'] !== undefined) cache[key + 'Timestamp'] = null;
  try { localStorage.removeItem(`jet_cache_${key}`); } catch {}
}

/* ═══════════════════════════════════════════════════════════
 *  READ: STAMMDATEN (from Supabase)
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch Stammdaten for a given Display ID.
 * Searches Supabase array column using @> (contains) operator.
 * Returns Airtable-compatible field names for backwards compat.
 */
export async function fetchStammdatenByDisplayId(displayId) {
  if (cache.stammdaten.has(displayId)) {
    return cache.stammdaten.get(displayId);
  }

  try {
    const { data, error } = await supabase
      .from('stammdaten')
      .select('*') // Mapped via mapStammdatenToAirtable — all fields needed
      .contains('display_ids', [displayId])
      .limit(1)
      .single();

    if (error || !data) {
      // Fallback: try text search if contains doesn't match
      const { data: data2 } = await supabase
        .from('stammdaten')
        .select('*') // Mapped via mapStammdatenToAirtable — all fields needed
        .filter('display_ids', 'cs', `{${displayId}}`)
        .limit(1)
        .maybeSingle();

      if (!data2) {
        cache.stammdaten.set(displayId, null);
        return null;
      }
      const record = mapStammdatenToAirtable(data2);
      cache.stammdaten.set(displayId, record);
      return record;
    }

    const record = mapStammdatenToAirtable(data);
    cache.stammdaten.set(displayId, record);
    return record;
  } catch (err) {
    console.error('Supabase Stammdaten fetch error:', err);
    return null;
  }
}

/**
 * Map Supabase row → Airtable-compatible field names.
 * This ensures all existing components keep working without changes.
 */
function mapStammdatenToAirtable(row) {
  if (!row) return null;
  return {
    'JET ID': row.jet_id ? [row.jet_id] : [],
    'Display ID': row.display_ids || [],
    'Location Name': row.location_name || '',
    'Contact Person': row.contact_person || '',
    'Contact Email': row.contact_email || '',
    'Contact Phone': row.contact_phone || '',
    'Location Email': row.location_email || '',
    'Location Phone': row.location_phone || '',
    'Legal Entity': row.legal_entity || '',
    'Street': row.street || '',
    'Street Number': row.street_number || '',
    'Postal Code': row.postal_code || '',
    'City': row.city || '',
    'Lead Status  (from Akquise)': row.lead_status || [],
    'Status': row.display_status || '',
  };
}

/**
 * Fetch ALL Stammdaten (locations) from Supabase.
 * Cached for 5 minutes. Used for location selectors, communication dashboard etc.
 */
export async function fetchAllStammdaten() {
  if (
    cache.allStammdaten &&
    cache.allStammdatenTimestamp &&
    Date.now() - cache.allStammdatenTimestamp < CACHE_TTL
  ) {
    return cache.allStammdaten;
  }

  // Request deduplication
  if (_inflight.allStammdaten) return _inflight.allStammdaten;

  _inflight.allStammdaten = _fetchAllStammdatenImpl();
  try {
    return await _inflight.allStammdaten;
  } finally {
    _inflight.allStammdaten = null;
  }
}

async function _fetchAllStammdatenImpl() {
  // localStorage instant fallback
  const persisted = loadFromPersist('allStammdaten');
  if (persisted && !cache.allStammdaten) {
    cache.allStammdaten = persisted;
    cache.allStammdatenTimestamp = Date.now() - CACHE_TTL + 10_000;
  }

  try {
    // Supabase returns max 1000 rows by default, we need pagination
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('stammdaten')
        .select('*') // Full cache load — all fields needed for multi-component use
        .order('location_name', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const locations = allRows.map((r) => ({
      id: r.airtable_id || r.id,
      name: r.location_name || '',
      jetIds: r.jet_id ? [r.jet_id] : [],
      displayIds: r.display_ids || [],
      contactPerson: r.contact_person || '',
      contactEmail: r.contact_email || '',
      contactPhone: r.contact_phone || '',
      locationEmail: r.location_email || '',
      locationPhone: r.location_phone || '',
      legalEntity: r.legal_entity || '',
      street: r.street || '',
      streetNumber: r.street_number || '',
      postalCode: r.postal_code || '',
      city: r.city || '',
      leadStatus: r.lead_status || [],
    }));

    cache.allStammdaten = locations;
    cache.allStammdatenTimestamp = Date.now();
    saveToPersist('allStammdaten', locations);
    return locations;
  } catch (err) {
    console.error('Supabase fetchAllStammdaten error:', err);
    return cache.allStammdaten || loadFromPersist('allStammdaten') || [];
  }
}

/* ═══════════════════════════════════════════════════════════
 *  READ: TASKS (from Supabase)
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch Tasks linked to a given Display ID.
 * Returns tasks sorted by created_time descending (newest first).
 */
export async function fetchTasksByDisplayId(displayId) {
  if (cache.tasks.has(displayId)) {
    return cache.tasks.get(displayId);
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*') // Mapped via mapTaskFromSupabase — all fields needed
      .contains('display_ids', [displayId])
      .order('created_time', { ascending: false })
      .limit(50);

    if (error) throw error;

    const tasks = (data || []).map(mapTaskFromSupabase);
    cache.tasks.set(displayId, tasks);
    return tasks;
  } catch (err) {
    console.error('Supabase Tasks fetch error:', err);
    return [];
  }
}

/**
 * Fetch ALL tasks from Supabase (for the Task Dashboard).
 * Cached for 5 minutes.
 */
export async function fetchAllTasks() {
  if (
    cache.allTasks &&
    cache.allTasksTimestamp &&
    Date.now() - cache.allTasksTimestamp < CACHE_TTL
  ) {
    return cache.allTasks;
  }

  // Request deduplication
  if (_inflight.allTasks) return _inflight.allTasks;

  _inflight.allTasks = _fetchAllTasksImpl();
  try {
    return await _inflight.allTasks;
  } finally {
    _inflight.allTasks = null;
  }
}

async function _fetchAllTasksImpl() {
  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*') // Full cache load — all fields needed for multi-component use
        .order('created_time', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const tasks = allRows.map(mapTaskFromSupabase);

    cache.allTasks = tasks;
    cache.allTasksTimestamp = Date.now();
    return tasks;
  } catch (err) {
    console.error('Supabase fetchAllTasks error:', err);
    return cache.allTasks || [];
  }
}

/**
 * Map a Supabase task row → component-compatible format.
 */
function mapTaskFromSupabase(row) {
  // partner is stored in the task_type column (repurposed from task type)
  const rawPartner = row.task_type;
  const partner = Array.isArray(rawPartner)
    ? (rawPartner[0] || '')
    : (typeof rawPartner === 'string' ? rawPartner : '');
  return {
    id: row.airtable_id || row.id,
    title: row.title || '',
    partner,
    status: row.status || '',
    priority: row.priority || '',
    dueDate: row.due_date || null,
    description: row.description || '',
    createdTime: row.created_time || '',
    responsibleUser: row.responsible_user || '',
    assigned: row.assigned || [],
    createdBy: row.created_by || '',
    displayIds: row.display_ids || [],
    locationNames: row.location_names || [],
    overdue: row.overdue || '',
    completedDate: row.completed_date || null,
    completedBy: row.completed_by || '',
    attachments: row.attachments || [],
    // Extended fields (synced but previously not exposed)
    nacharbeitKommentar: row.nacharbeit_kommentar || '',
    statusChangedBy: row.status_changed_by || '',
    statusChangedDate: row.status_changed_date || null,
    externalVisibility: row.external_visibility || false,
    superchat: row.superchat || '',
    integrator: Array.isArray(row.integrator) ? row.integrator.join(', ') : (row.integrator || ''),
    installDate: Array.isArray(row.install_date) ? row.install_date[0] : (row.install_date || null),
    installRemarks: Array.isArray(row.install_remarks) ? row.install_remarks.join('; ') : (row.install_remarks || ''),
  };
}

/* ═══════════════════════════════════════════════════════════
 *  READ: INSTALLATIONEN (from Supabase)
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch Installation record for a given Display ID.
 */
export async function fetchInstallationByDisplayId(displayId) {
  if (cache.installation.has(displayId)) {
    return cache.installation.get(displayId);
  }

  try {
    const { data, error } = await supabase
      .from('installationen')
      .select('*') // Many fields used for installation detail view
      .contains('display_ids', [displayId])
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      cache.installation.set(displayId, null);
      return null;
    }

    // Build protocol attachment array
    let protocol = data.protocol_url ? [{
      url: data.protocol_url,
      filename: data.protocol_filename || 'Protokoll.pdf',
    }] : [];

    // Resolve cached attachment URLs for the protocol (non-blocking, best-effort)
    const airtableId = data.airtable_id || data.id;
    if (protocol.length > 0 && airtableId) {
      try {
        protocol = await resolveAttachmentUrls(airtableId, 'Installationsprotokoll', protocol);
      } catch { /* keep original URLs */ }
    }

    const result = {
      airtableId,
      installDate: data.install_date || null,
      status: data.status || '',
      installationType: data.installation_type || '',
      integrator: data.integrator || '',
      technicians: data.technicians || [],
      protocol,
      screenType: data.screen_type || '',
      screenSize: data.screen_size || '',
      opsNr: data.ops_nr || '',
      simId: data.sim_id || '',
      installStart: data.install_start || null,
      installEnd: data.install_end || null,
      remarks: data.remarks || '',
      partnerName: data.partner_name || '',
    };

    cache.installation.set(displayId, result);
    return result;
  } catch (err) {
    console.error('Supabase Installation fetch error:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════
 *  WRITE: TASKS (to Airtable via proxy)
 *  Airtable remains the source of truth for writes.
 *  After write, we also update the local Supabase cache.
 * ═══════════════════════════════════════════════════════════ */

function airtableWriteOptions(method, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  return opts;
}

/**
 * Fetch partner records from Airtable to get name → record ID mapping.
 * Used for linked record fields in Tasks.
 */
export async function fetchPartners() {
  if (cache.partners && cache.partnersTimestamp && Date.now() - cache.partnersTimestamp < 5 * 60 * 1000) {
    return cache.partners;
  }
  try {
    const url = `${AIRTABLE_BASE}/${BASE_ID}/${encodeURIComponent(PARTNERS_TABLE)}?fields%5B%5D=Company`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Partner fetch failed: ${res.status}`);
    const data = await res.json();
    const map = {};
    (data.records || []).forEach(rec => {
      const name = rec.fields?.Company;
      if (name) map[name] = rec.id;
    });
    cache.partners = map;
    cache.partnersTimestamp = Date.now();
    return map;
  } catch (err) {
    console.error('[fetchPartners] Error:', err);
    return cache.partners || {};
  }
}

/**
 * Create a new Task in Airtable (then sync to Supabase).
 */
export async function createTask(taskData) {
  try {
    const fields = {};
    if (taskData.title) fields['Task Title'] = taskData.title;

    // Partner: resolve name to Airtable record ID (linked record field)
    if (taskData.partner) {
      const partnerMap = await fetchPartners();
      const partnerId = partnerMap[taskData.partner];
      if (partnerId) {
        fields['Partner'] = [partnerId]; // Linked record expects array of IDs
      }
    }

    if (taskData.status) fields['Status'] = taskData.status;
    if (taskData.priority) fields['Priority'] = taskData.priority;
    // Validate date before sending to Airtable (must be YYYY-MM-DD or empty)
    if (taskData.dueDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(taskData.dueDate)) {
        fields['Due Date'] = taskData.dueDate;
      }
      // Skip invalid dates silently rather than breaking the API call
    }
    if (taskData.description) fields['Description'] = taskData.description;
    if (taskData.displays && taskData.displays.length > 0) fields['Displays'] = taskData.displays;
    // Locations: resolve from displayId/jetId OR use direct Airtable record IDs
    if (taskData.locations && taskData.locations.length > 0) {
      const validLocIds = taskData.locations.filter(id => typeof id === 'string' && id.startsWith('rec'));
      if (validLocIds.length > 0) fields['Locations'] = validLocIds;
    }
    // Auto-resolve displayId → Airtable Location record ID (used by Chat AI task creation)
    if (!fields['Locations'] && taskData.displayId) {
      try {
        const { data: locData } = await supabase
          .from('airtable_displays')
          .select('id')
          .eq('display_id', taskData.displayId)
          .limit(1);
        if (locData && locData.length > 0 && locData[0].id?.startsWith('rec')) {
          fields['Locations'] = [locData[0].id];
        }
      } catch (e) { console.warn('[createTask] displayId→location resolve failed:', e.message); }
    }
    // Auto-resolve jetId → Airtable Location record ID
    if (!fields['Locations'] && taskData.jetId) {
      try {
        const { data: locData } = await supabase
          .from('airtable_displays')
          .select('id')
          .eq('jet_id', String(taskData.jetId))
          .limit(1);
        if (locData && locData.length > 0 && locData[0].id?.startsWith('rec')) {
          fields['Locations'] = [locData[0].id];
        }
      } catch (e) { console.warn('[createTask] jetId→location resolve failed:', e.message); }
    }
    // Responsible User is a Collaborator field – must send { email: "..." }
    if (taskData.assignedUserEmail) {
      fields['Responsible User'] = { email: taskData.assignedUserEmail };
    }

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${TASKS_TABLE}`;
    const response = await fetch(url, airtableWriteOptions('POST', { fields }));

    if (!response.ok) {
      const errText = await response.text();
      console.error('Airtable createTask error:', response.status, errText);
      // Parse Airtable error message for user-friendly display
      let errorMsg = 'Fehler beim Erstellen des Tasks';
      try {
        const errData = JSON.parse(errText);
        if (errData?.error?.message) errorMsg = errData.error.message;
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await response.json();

    // Sync to Supabase (fire-and-forget), pass partner name for display
    syncTaskToSupabase(data, taskData.partner);

    // Invalidate cache
    cache.allTasks = null;
    cache.allTasksTimestamp = null;
    return data;
  } catch (err) {
    console.error('createTask error:', err);
    throw err; // Re-throw so caller can display the error
  }
}

/**
 * Update an existing Task in Airtable.
 */
export async function updateTask(recordId, fields) {
  try {
    const url = `${AIRTABLE_BASE}/${BASE_ID}/${TASKS_TABLE}/${recordId}`;
    const response = await fetch(url, airtableWriteOptions('PATCH', { fields }));

    if (!response.ok) {
      const errText = await response.text();
      console.error('Airtable updateTask error:', response.status, errText);
      return null;
    }

    const data = await response.json();

    // Sync to Supabase (fire-and-forget)
    syncTaskToSupabase(data);

    // Invalidate cache
    cache.allTasks = null;
    cache.allTasksTimestamp = null;
    cache.tasks.clear();
    return data;
  } catch (err) {
    console.error('updateTask error:', err);
    return null;
  }
}

/**
 * Delete a Task from Airtable + Supabase.
 */
export async function deleteTask(recordId) {
  try {
    const url = `${AIRTABLE_BASE}/${BASE_ID}/${TASKS_TABLE}/${recordId}`;
    const response = await fetch(url, airtableWriteOptions('DELETE'));

    if (!response.ok) {
      const errText = await response.text();
      console.error('Airtable deleteTask error:', response.status, errText);
      return false;
    }

    // Also delete from Supabase
    supabase.from('tasks').delete().eq('airtable_id', recordId)
      .then(() => {})
      .catch(() => {});

    // Invalidate cache
    cache.allTasks = null;
    cache.allTasksTimestamp = null;
    cache.tasks.clear();
    return true;
  } catch (err) {
    console.error('deleteTask error:', err);
    return false;
  }
}

/**
 * Sync a single Airtable task record to Supabase (fire-and-forget).
 * Called after create/update to keep Supabase in sync.
 */
function syncTaskToSupabase(airtableRecord, partnerName) {
  if (!airtableRecord?.id) return;
  const f = airtableRecord.fields || {};
  const assigned = Array.isArray(f['Assigned'])
    ? f['Assigned'].map(a => typeof a === 'object' ? a.name : a).filter(Boolean)
    : [];

  // Resolve partner: use passed name, or try to extract from Airtable fields
  const resolvedPartner = partnerName || f['Company (from Partner)'] || f['Partner'] || f['Task Type'] || [];

  supabase.from('tasks').upsert({
    id: airtableRecord.id,
    airtable_id: airtableRecord.id,
    title: f['Task Title'] || null,
    task_type: resolvedPartner,
    status: f['Status'] || null,
    priority: f['Priority'] || null,
    due_date: f['Due Date'] || null,
    description: f['Description'] || null,
    created_time: f['Created time'] || null,
    responsible_user: f['Responsible User']?.name || f['Responsible User'] || null,
    assigned,
    created_by: f['Created by']?.name || f['Created by'] || null,
    display_ids: f['Display ID (from Displays )'] || [],
    location_names: f['Location Name (from Locations)'] || [],
    overdue: f['Overdue'] || null,
    completed_date: f['completed_task_date'] || null,
    completed_by: f['completed_task_by'] || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'airtable_id' })
    .then(() => {})
    .catch(err => console.error('[sync] Task sync error:', err));
}

/* ═══════════════════════════════════════════════════════════
 *  COMMUNICATION LOG – READ from Supabase, WRITE to Airtable
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch ALL communication records from Supabase.
 * Cached for 5 minutes.
 */
export async function fetchAllCommunications() {
  if (
    cache.allCommunications &&
    cache.allCommunicationsTimestamp &&
    Date.now() - cache.allCommunicationsTimestamp < CACHE_TTL
  ) {
    return cache.allCommunications;
  }

  // Request deduplication
  if (_inflight.allCommunications) return _inflight.allCommunications;

  _inflight.allCommunications = _fetchAllCommunicationsImpl();
  try {
    return await _inflight.allCommunications;
  } finally {
    _inflight.allCommunications = null;
  }
}

async function _fetchAllCommunicationsImpl() {
  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('communications')
        .select('*') // Full cache load — all fields needed for multi-component use
        .order('timestamp', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const communications = allRows.map(mapCommFromSupabase);

    cache.allCommunications = communications;
    cache.allCommunicationsTimestamp = Date.now();
    return communications;
  } catch (err) {
    console.error('Supabase fetchAllCommunications error:', err);
    return cache.allCommunications || [];
  }
}

/**
 * Fetch communication records for a specific Location.
 */
export async function fetchCommunicationsByLocation(locationRecordId) {
  try {
    const { data, error } = await supabase
      .from('communications')
      .select('*') // Mapped via mapCommFromSupabase — all fields needed
      .contains('location_ids', [locationRecordId])
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;
    return (data || []).map(mapCommFromSupabase);
  } catch (err) {
    console.error('Supabase fetchCommunicationsByLocation error:', err);
    return [];
  }
}

/**
 * Map Supabase communication row → component-compatible format.
 */
function mapCommFromSupabase(row) {
  return {
    id: row.airtable_id || row.id,
    channel: row.channel || '',
    direction: row.direction || '',
    subject: row.subject || '',
    message: row.message || '',
    timestamp: row.timestamp || '',
    status: row.status || '',
    recipientName: row.recipient_name || '',
    recipientContact: row.recipient_contact || '',
    sender: row.sender || '',
    externalId: row.external_id || '',
    locationIds: row.location_ids || [],
    locationNames: row.location_names || [],
    displayIds: row.display_ids || [],
    jetIds: row.jet_ids || [],
    relatedTask: row.related_task || [],
    attachments: [],  // Attachments stay in Airtable (binary data)
  };
}

/**
 * Create a new Communication Log entry in Airtable.
 */
export async function createCommunicationRecord(commData) {
  try {
    const fields = {};
    if (commData.channel) fields['Channel'] = commData.channel;
    if (commData.direction) fields['Direction'] = commData.direction;
    if (commData.subject) fields['Subject'] = commData.subject;
    if (commData.message) fields['Message'] = commData.message;
    if (commData.recipientName) fields['Recipient Name'] = commData.recipientName;
    if (commData.recipientContact) fields['Recipient Contact'] = commData.recipientContact;
    if (commData.sender) fields['Sender'] = commData.sender;
    if (commData.status) fields['Status'] = commData.status;
    if (commData.externalId) fields['External ID'] = commData.externalId;
    fields['Timestamp'] = commData.timestamp || new Date().toISOString();
    if (commData.locationIds && commData.locationIds.length > 0) {
      fields['Location'] = commData.locationIds;
    }
    if (commData.relatedTask && commData.relatedTask.length > 0) {
      fields['Related Task'] = commData.relatedTask;
    }

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${ACTIVITY_LOG_TABLE}`;
    const response = await fetch(url, airtableWriteOptions('POST', { fields }));

    if (!response.ok) {
      const errText = await response.text();
      console.error('createCommunicationRecord error:', response.status, errText);
      return null;
    }

    const data = await response.json();

    // Sync to Supabase immediately (fire-and-forget) so it appears instantly
    syncCommunicationToSupabase(data);

    cache.allCommunications = null;
    cache.allCommunicationsTimestamp = null;
    return data;
  } catch (err) {
    console.error('createCommunicationRecord error:', err);
    return null;
  }
}

/**
 * Sync a single Airtable communication record to Supabase (fire-and-forget).
 * Mirrors the mapping in sync-airtable.js → mapCommunication().
 */
function syncCommunicationToSupabase(airtableRecord) {
  if (!airtableRecord?.id) return;
  const f = airtableRecord.fields || {};

  supabase.from('communications').upsert({
    airtable_id: airtableRecord.id,
    channel: f['Channel'] || null,
    direction: f['Direction'] || null,
    subject: f['Subject'] || null,
    message: f['Message'] || null,
    timestamp: f['Timestamp'] || new Date().toISOString(),
    status: f['Status'] || null,
    recipient_name: f['Recipient Name'] || null,
    recipient_contact: f['Recipient Contact'] || null,
    sender: f['Sender'] || null,
    external_id: f['External ID'] || null,
    location_ids: f['Location'] || [],
    location_names: f['Location Name (from Location)'] || [],
    display_ids: f['Display ID (from Location)'] || [],
    jet_ids: f['JET ID (from Location)'] || [],
    related_task: f['Related Task'] || [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'airtable_id' })
    .then(() => {})
    .catch(err => console.error('[sync] Communication sync error:', err));
}

/* ═══════════════════════════════════════════════════════════
 *  HARDWARE INVENTORY – READ (from Supabase)
 * ═══════════════════════════════════════════════════════════ */

const HARDWARE_SWAP_TABLE_AT = 'tblzFHk0HhB4bNYJ4';
const DEINSTALL_TABLE_AT = 'tbltdxgzDeNz9d0ZC';

// Hardware cache entries
cache.hardware = new Map();         // displayLocationId → { ops, sim, display }
cache.hardwareTimestamp = new Map();
cache.leasing = new Map();          // displaySN → { chg, bank }
cache.leasingTimestamp = new Map();
cache.allOps = null;
cache.allOpsTimestamp = null;
cache.allLeasing = null;
cache.allLeasingTimestamp = null;
cache.allDisplayLocations = null;
cache.allDisplayLocationsTimestamp = null;
cache.allInstallationen = null;
cache.allInstallationenTimestamp = null;
cache.swaps = new Map();
cache.deinstalls = new Map();

/**
 * Fetch hardware set (OPS + SIM + Display) for a Live Display Location.
 * Links: hardware_ops.display_location_id → displayLocationId
 */
export async function fetchHardwareByLocationId(displayLocationId) {
  if (!displayLocationId) return null;

  const cacheKey = displayLocationId;
  const ts = cache.hardwareTimestamp.get(cacheKey);
  if (ts && Date.now() - ts < CACHE_TTL && cache.hardware.has(cacheKey)) {
    return cache.hardware.get(cacheKey);
  }

  try {
    // 1. Find OPS Player linked to this location
    const { data: opsData } = await supabase
      .from('hardware_ops')
      .select('*') // Mapped via mapOpsFromSupabase — all fields needed
      .eq('display_location_id', displayLocationId)
      .limit(5);

    const ops = (opsData || []).map(mapOpsFromSupabase);

    // 2. Find SIM cards linked to these OPS players
    const opsIds = ops.map(o => o.id).filter(Boolean);
    let sims = [];
    if (opsIds.length > 0) {
      const { data: simData } = await supabase
        .from('hardware_sim')
        .select('*') // Mapped via mapSimFromSupabase — all fields needed
        .in('ops_record_id', opsIds)
        .limit(20);
      sims = (simData || []).map(mapSimFromSupabase);
    }

    // 3. Find Displays linked to these OPS players
    //    (hardware_displays is empty — fallback handled by enrichment below)
    let displays = [];
    if (opsIds.length > 0) {
      const { data: dispData } = await supabase
        .from('hardware_displays')
        .select('*') // Mapped via mapDisplayFromSupabase — all fields needed
        .in('ops_record_id', opsIds)
        .limit(20);
      displays = (dispData || []).map(mapDisplayFromSupabase);
    }

    // 4. ENRICH: Cross-reference with nocodb_vorbereitet for real SIM data
    //    (hardware_sim has junk data — identical SIM IDs due to Airtable precision loss)
    const enrichedResult = await enrichHardwareWithNocoDB({ ops, sims, displays });

    cache.hardware.set(cacheKey, enrichedResult);
    cache.hardwareTimestamp.set(cacheKey, Date.now());
    return enrichedResult;
  } catch (err) {
    console.error('[fetchHardwareByLocationId] Error:', err);
    return null;
  }
}

/**
 * Fallback: Fetch hardware set by OPS number (from installation data).
 * Used when fetchHardwareByLocationId() returns empty results but
 * installation data has opsNr/simId.
 */
export async function fetchHardwareByOpsNr(opsNr) {
  if (!opsNr) return null;

  try {
    const { data: opsData } = await supabase
      .from('hardware_ops')
      .select('*') // Mapped via mapOpsFromSupabase — all fields needed
      .eq('ops_nr', String(opsNr))
      .limit(1);

    if (!opsData || opsData.length === 0) return null;

    const ops = opsData.map(mapOpsFromSupabase);
    const opsIds = ops.map(o => o.id).filter(Boolean);

    let sims = [];
    if (opsIds.length > 0) {
      const { data: simData } = await supabase
        .from('hardware_sim')
        .select('*') // Mapped via mapSimFromSupabase — all fields needed
        .in('ops_record_id', opsIds)
        .limit(10);
      sims = (simData || []).map(mapSimFromSupabase);
    }

    let displays = [];
    if (opsIds.length > 0) {
      const { data: dispData } = await supabase
        .from('hardware_displays')
        .select('*') // Mapped via mapDisplayFromSupabase — all fields needed
        .in('ops_record_id', opsIds)
        .limit(10);
      displays = (dispData || []).map(mapDisplayFromSupabase);
    }

    // Enrich with NocoDB data (real SIM IDs, venue IDs, customer numbers)
    return enrichHardwareWithNocoDB({ ops, sims, displays });
  } catch (err) {
    console.error('[fetchHardwareByOpsNr] Error:', err);
    return null;
  }
}

/**
 * HARDWARE ENRICHMENT: Cross-reference hardware data with NocoDB sources
 * to build a complete picture.
 *
 * Problem: hardware_sim has junk data (identical SIM IDs due to Airtable precision loss)
 *          hardware_displays is empty (0 rows)
 *          hardware_ops.sim_id is not individual
 *
 * Solution: nocodb_vorbereitet has the REAL data — individual SIM IDs, venue IDs, customer numbers
 *           nocodb_sim_kunden has activation dates and customer IDs
 *
 * @param {{ ops: Array, sims: Array, displays: Array }} hw - Raw hardware data
 * @returns {Promise<{ ops: Array, sims: Array, displays: Array, enrichment: Object }>}
 */
async function enrichHardwareWithNocoDB(hw) {
  if (!hw || !hw.ops || hw.ops.length === 0) return hw;

  try {
    const opsNrs = hw.ops.map(o => o.opsNr).filter(Boolean);
    if (opsNrs.length === 0) return hw;

    // Parallel: fetch NocoDB data for these OPS numbers
    const [nocoResult, simKundenResult] = await Promise.all([
      supabase
        .from('nocodb_vorbereitet')
        .select('ops_nr, venue_id, sim_id, kunden_nr, ops_sn, fertig, vorbereitet')
        .in('ops_nr', opsNrs),
      // We'll look up SIM customer data after we know the SIM IDs
      Promise.resolve(null),
    ]);

    const nocoData = nocoResult.data || [];
    const nocoByOps = new Map(nocoData.map(n => [String(n.ops_nr), n]));

    // Enrich OPS with NocoDB data
    const enrichedOps = hw.ops.map(ops => {
      const noco = nocoByOps.get(ops.opsNr);
      if (!noco) return ops;
      return {
        ...ops,
        // Override SIM ID with real value from NocoDB (if Airtable value looks like junk)
        simId: (ops.simIdImprecise || !ops.simId || ops.simId === '89882280000121950000')
          ? (noco.sim_id || ops.simId)
          : ops.simId,
        simIdImprecise: false, // NocoDB has the real value
        // Add enrichment fields
        nocoVenueId: noco.venue_id || '',
        nocoKundenNr: noco.kunden_nr || '',
        nocoOpsSn: noco.ops_sn || '',
        nocoFertig: noco.fertig || false,
        nocoVorbereitet: noco.vorbereitet || false,
        _enriched: true,
      };
    });

    // Build better SIM data from NocoDB
    const realSimIds = nocoData.map(n => n.sim_id).filter(Boolean);
    let enrichedSims = hw.sims;

    if (realSimIds.length > 0) {
      // Look up activation dates from nocodb_sim_kunden
      const { data: simKunden } = await supabase
        .from('nocodb_sim_kunden')
        .select('karten_nr, kunden_id, aktivierungsdatum')
        .in('karten_nr', realSimIds);

      const simKundenMap = new Map((simKunden || []).map(s => [s.karten_nr, s]));

      // Build proper SIM entries from NocoDB data
      enrichedSims = nocoData
        .filter(n => n.sim_id)
        .map(n => {
          const kundenInfo = simKundenMap.get(n.sim_id);
          // Check if there's a matching OPS for linking
          const linkedOps = enrichedOps.find(o => o.opsNr === String(n.ops_nr));
          return {
            id: `noco-sim-${n.ops_nr}`,
            simId: n.sim_id,
            simIdImprecise: false,
            activateDate: kundenInfo?.aktivierungsdatum || null,
            kundenId: kundenInfo?.kunden_id || n.kunden_nr || '',
            opsRecordId: linkedOps?.id || '',
            status: kundenInfo?.aktivierungsdatum ? 'active' : '',
            _source: 'nocodb',
          };
        });
    }

    return {
      ops: enrichedOps,
      sims: enrichedSims,
      displays: hw.displays,
      _enriched: true,
      _nocoMatches: nocoData.length,
    };
  } catch (err) {
    console.warn('[enrichHardwareWithNocoDB] Enrichment failed (non-critical):', err.message);
    return hw; // Return original data if enrichment fails
  }
}

/**
 * Fetch ALL OPS inventory (for Hardware Dashboard).
 * Cached for 1 minute.
 */
export async function fetchAllOpsInventory() {
  if (cache.allOps && cache.allOpsTimestamp && Date.now() - cache.allOpsTimestamp < CACHE_TTL) {
    return cache.allOps;
  }

  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('hardware_ops')
        .select('*') // Full cache load — all fields needed for multi-component use
        .order('ops_nr', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const ops = allRows.map(mapOpsFromSupabase);
    cache.allOps = ops;
    cache.allOpsTimestamp = Date.now();
    return ops;
  } catch (err) {
    console.error('[fetchAllOpsInventory] Error:', err);
    return cache.allOps || [];
  }
}

/**
 * Map OPS row from Supabase → component-compatible format.
 */
function mapOpsFromSupabase(row) {
  const simId = row.sim_id || '';
  // Detect SIM ID precision loss (ICCID stored as number in Airtable → trailing zeros)
  const simIdImprecise = simId.length >= 18 && /0{4,}$/.test(simId);
  return {
    id: row.id,
    opsNr: row.ops_nr || '',
    status: row.status || '',
    opsSn: row.ops_sn || '',
    hardwareType: row.hardware_type || '',
    navoriVenueId: row.navori_venue_id || '',
    simRecordId: row.sim_record_id || '',
    simId,
    simIdImprecise,
    displayRecordId: row.display_record_id || '',
    displaySn: row.display_sn || '',
    displayLocationId: row.display_location_id || '',
    locationOnlineStatus: row.location_online_status || '',
    partnerId: row.partner_id || '',
    note: row.note || '',
  };
}

function mapSimFromSupabase(row) {
  // SIM IDs (ICCID) are 19-20 digits but Airtable stores them as numbers,
  // causing JavaScript precision loss (only ~15-16 significant digits).
  // Detect and flag rounded values so the UI can show a warning instead of wrong data.
  let simId = row.sim_id || '';
  let simIdImprecise = false;
  if (simId && typeof simId === 'string' && simId.length >= 18) {
    // Rounded ICCIDs typically end in multiple zeros (e.g. 89882280000121950000)
    if (/0{4,}$/.test(simId)) {
      simIdImprecise = true;
    }
  }
  return {
    id: row.id,
    simId,
    simIdImprecise,
    activateDate: row.activate_date || null,
    opsRecordId: row.ops_record_id || '',
    status: row.status || '',
  };
}

function mapDisplayFromSupabase(row) {
  return {
    id: row.id,
    displaySerialNumber: row.display_serial_number || '',
    location: row.location || '',
    opsRecordId: row.ops_record_id || '',
    status: row.status || '',
  };
}

/**
 * Fetch ALL SIM inventory (for Hardware Dashboard cross-checks).
 * Cached for 1 minute.
 */
export async function fetchAllSimInventory() {
  if (cache.allSim && cache.allSimTimestamp && Date.now() - cache.allSimTimestamp < CACHE_TTL) {
    return cache.allSim;
  }
  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('hardware_sim')
        .select('*') // Full cache load — all fields needed for multi-component use
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const sims = allRows.map(mapSimFromSupabase);
    cache.allSim = sims;
    cache.allSimTimestamp = Date.now();
    return sims;
  } catch (err) {
    console.error('[fetchAllSimInventory] Error:', err);
    return cache.allSim || [];
  }
}

/**
 * Fetch ALL Display inventory (for Hardware Dashboard cross-checks).
 * Cached for 1 minute.
 */
export async function fetchAllDisplayInventory() {
  if (cache.allDisplayInv && cache.allDisplayInvTimestamp && Date.now() - cache.allDisplayInvTimestamp < CACHE_TTL) {
    return cache.allDisplayInv;
  }
  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('hardware_displays')
        .select('*') // Full cache load — all fields needed for multi-component use
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const displays = allRows.map(mapDisplayFromSupabase);
    cache.allDisplayInv = displays;
    cache.allDisplayInvTimestamp = Date.now();
    return displays;
  } catch (err) {
    console.error('[fetchAllDisplayInventory] Error:', err);
    return cache.allDisplayInv || [];
  }
}

/* ═══════════════════════════════════════════════════════════
 *  LEASING – READ (CHG Approval + Bank TESMA)
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch leasing data for a display by its serial number.
 * Matches: CHG Approval (display_sn) + Bank TESMA (serial_number)
 */
export async function fetchLeaseByDisplaySN(displaySN) {
  if (!displaySN) return null;

  const cacheKey = displaySN;
  const ts = cache.leasingTimestamp.get(cacheKey);
  if (ts && Date.now() - ts < CACHE_TTL && cache.leasing.has(cacheKey)) {
    return cache.leasing.get(cacheKey);
  }

  try {
    // CHG Approval
    const { data: chgData } = await supabase
      .from('chg_approvals')
      .select('*') // Mapped via mapChgFromSupabase — all fields needed
      .eq('display_sn', displaySN)
      .limit(1)
      .maybeSingle();

    // Bank TESMA
    const { data: bankData } = await supabase
      .from('bank_leasing')
      .select('*') // Mapped via mapBankFromSupabase — all fields needed
      .eq('serial_number', displaySN)
      .limit(1)
      .maybeSingle();

    const result = {
      chg: chgData ? mapChgFromSupabase(chgData) : null,
      bank: bankData ? mapBankFromSupabase(bankData) : null,
    };

    cache.leasing.set(cacheKey, result);
    cache.leasingTimestamp.set(cacheKey, Date.now());
    return result;
  } catch (err) {
    console.error('[fetchLeaseByDisplaySN] Error:', err);
    return null;
  }
}

/**
 * Fetch leasing data for a display by its JET ID.
 * Path: airtable_displays.jet_id → chg_approvals.jet_id_location
 * Also tries bank_leasing via the CHG display_sn (which is the display serial number).
 */
export async function fetchLeaseByJetId(jetId) {
  if (!jetId) return null;

  const cacheKey = `jet_${jetId}`;
  const ts = cache.leasingTimestamp.get(cacheKey);
  if (ts && Date.now() - ts < CACHE_TTL && cache.leasing.has(cacheKey)) {
    return cache.leasing.get(cacheKey);
  }

  try {
    // CHG Approval via jet_id_location
    const { data: chgData } = await supabase
      .from('chg_approvals')
      .select('*') // Mapped via mapChgFromSupabase — all fields needed
      .eq('jet_id_location', jetId)
      .limit(1)
      .maybeSingle();

    // Bank TESMA via display_sn from CHG (if found)
    let bankData = null;
    if (chgData?.display_sn) {
      const { data: bank } = await supabase
        .from('bank_leasing')
        .select('*') // Mapped via mapBankFromSupabase — all fields needed
        .eq('serial_number', chgData.display_sn)
        .limit(1)
        .maybeSingle();
      bankData = bank;
    }

    const result = {
      chg: chgData ? mapChgFromSupabase(chgData) : null,
      bank: bankData ? mapBankFromSupabase(bankData) : null,
    };

    cache.leasing.set(cacheKey, result);
    cache.leasingTimestamp.set(cacheKey, Date.now());
    return result;
  } catch (err) {
    console.error('[fetchLeaseByJetId] Error:', err);
    return null;
  }
}

/**
 * Fetch ALL leasing data (for Hardware Dashboard).
 */
export async function fetchAllLeasingData() {
  if (cache.allLeasing && cache.allLeasingTimestamp && Date.now() - cache.allLeasingTimestamp < CACHE_TTL) {
    return cache.allLeasing;
  }

  try {
    const [chgRes, bankRes] = await Promise.all([
      supabase.from('chg_approvals').select('*').order('rental_start', { ascending: false }).limit(2000), // Full cache load — all fields needed for multi-component use
      supabase.from('bank_leasing').select('*').order('rental_start', { ascending: false }).limit(2000), // Full cache load — all fields needed for multi-component use
    ]);

    const chg = (chgRes.data || []).map(mapChgFromSupabase);
    const bank = (bankRes.data || []).map(mapBankFromSupabase);

    const result = { chg, bank };
    cache.allLeasing = result;
    cache.allLeasingTimestamp = Date.now();
    return result;
  } catch (err) {
    console.error('[fetchAllLeasingData] Error:', err);
    return cache.allLeasing || { chg: [], bank: [] };
  }
}

function mapChgFromSupabase(row) {
  return {
    id: row.id,
    jetIdLocation: row.jet_id_location || '',
    assetId: row.asset_id || '',
    displaySn: row.display_sn || '',
    integratorInvoiceNo: row.integrator_invoice_no || '',
    chgCertificate: row.chg_certificate || '',
    invoiceDate: row.invoice_date || null,
    rentalStart: row.rental_start || null,
    rentalEnd: row.rental_end || null,
    paymentReleasedOn: row.payment_released_on || null,
    paymentReleasedBy: row.payment_released_by || '',
    status: row.status || '',
    installationId: row.installation_id || '',
    inspectionStatus: row.inspection_status || [],
    displayId: row.display_id || [],
    locationName: row.location_name || [],
    city: row.city || [],
    address: row.address || [],
  };
}

function mapBankFromSupabase(row) {
  return {
    id: row.id,
    assetId: row.asset_id || '',
    serialNumber: row.serial_number || '',
    assetClass: row.asset_class || '',
    designation: row.designation || '',
    contractStatus: row.contract_status || '',
    customer: row.customer || '',
    customerId: row.customer_id || null,
    rentalCertificate: row.rental_certificate || '',
    rentalStart: row.rental_start || null,
    rentalEndPlanned: row.rental_end_planned || null,
    rentalEndActual: row.rental_end_actual || null,
    monthlyPrice: row.monthly_price ? Number(row.monthly_price) : null,
    currency: row.currency || 'EUR',
    orderNumber: row.order_number || '',
    installationLocation: row.installation_location || '',
    costCenter: row.cost_center || '',
    city: row.city || '',
    manufacturer: row.manufacturer || '',
    lessor: row.lessor || '',
  };
}

/* ═══════════════════════════════════════════════════════════
 *  DISPLAY LOCATIONS (airtable_displays) — for Hardware matching
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch ALL display locations from airtable_displays.
 * Returns an array of { id, displayId, locationName, city, jetId, onlineStatus, liveSince, deinstallDate }.
 * Used for OPS → Location matching (OPS.displayLocationId === displayLocation.id).
 */
export async function fetchAllDisplayLocations() {
  if (cache.allDisplayLocations && cache.allDisplayLocationsTimestamp && Date.now() - cache.allDisplayLocationsTimestamp < CACHE_TTL) {
    return cache.allDisplayLocations;
  }

  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('airtable_displays')
        .select('id, display_id, location_name, city, jet_id, online_status, live_since, deinstall_date, street, street_number, postal_code, navori_venue_id')
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const locations = allRows.map(row => ({
      id: row.id,
      displayId: row.display_id || '',
      locationName: row.location_name || '',
      city: row.city || '',
      jetId: row.jet_id || '',
      onlineStatus: row.online_status || '',
      liveSince: row.live_since || null,
      deinstallDate: row.deinstall_date || null,
      street: row.street || '',
      streetNumber: row.street_number || '',
      postalCode: row.postal_code || '',
      navoriVenueId: row.navori_venue_id || '',
    }));

    cache.allDisplayLocations = locations;
    cache.allDisplayLocationsTimestamp = Date.now();
    return locations;
  } catch (err) {
    console.error('[fetchAllDisplayLocations] Error:', err);
    return cache.allDisplayLocations || [];
  }
}

/* ═══════════════════════════════════════════════════════════
 *  INSTALLATIONEN — for Hardware Timeline
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch ALL installations from Supabase.
 * Used for Hardware Timeline tab.
 */
export async function fetchAllInstallationen() {
  if (cache.allInstallationen && cache.allInstallationenTimestamp && Date.now() - cache.allInstallationenTimestamp < CACHE_TTL) {
    return cache.allInstallationen;
  }

  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('installationen')
        .select('*') // Full cache load — all fields needed for multi-component use
        .order('install_date', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const installations = allRows.map(mapInstallationFromSupabase);
    cache.allInstallationen = installations;
    cache.allInstallationenTimestamp = Date.now();
    return installations;
  } catch (err) {
    console.error('[fetchAllInstallationen] Error:', err);
    return cache.allInstallationen || [];
  }
}

function mapInstallationFromSupabase(row) {
  return {
    id: row.id,
    airtableId: row.airtable_id || row.id,
    displayIds: row.display_ids || [],
    installDate: row.install_date || null,
    status: row.status || '',
    installationType: row.installation_type || '',
    integrator: row.integrator || '',
    technicians: row.technicians || [],
    protocolUrl: row.protocol_url || '',
    protocolFilename: row.protocol_filename || '',
    screenType: row.screen_type || '',
    screenSize: row.screen_size || '',
    opsNr: row.ops_nr || '',
    simId: row.sim_id || '',
    installStart: row.install_start || null,
    installEnd: row.install_end || null,
    remarks: row.remarks || '',
    partnerName: row.partner_name || '',
    // Standort-Zuordnung (from enrichment)
    jetId: row.jet_id || '',
    city: row.city || '',
    locationName: row.location_name || '',
    street: row.street || '',
    streetNumber: row.street_number || '',
    postalCode: row.postal_code || '',
    akquiseLinks: row.akquise_links || [],
  };
}

/* ═══════════════════════════════════════════════════════════
 *  HARDWARE SWAPS – READ + WRITE
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch swap history for a display location.
 */
export async function fetchSwapsByLocationId(displayLocationId) {
  if (!displayLocationId) return [];

  if (cache.swaps.has(displayLocationId)) {
    return cache.swaps.get(displayLocationId);
  }

  try {
    const { data, error } = await supabase
      .from('hardware_swaps')
      .select('*') // Mapped via mapSwapFromSupabase — all fields needed
      .eq('display_location_id', displayLocationId)
      .order('swap_date', { ascending: false })
      .limit(50);

    if (error) throw error;
    const swaps = (data || []).map(mapSwapFromSupabase);
    cache.swaps.set(displayLocationId, swaps);
    return swaps;
  } catch (err) {
    console.error('[fetchSwapsByLocationId] Error:', err);
    return [];
  }
}

/**
 * Fetch ALL swaps (for Hardware Dashboard).
 */
export async function fetchAllSwaps() {
  try {
    const { data, error } = await supabase
      .from('hardware_swaps')
      .select('*') // Full cache load — all fields needed for multi-component use
      .order('swap_date', { ascending: false })
      .limit(2000);

    if (error) throw error;
    return (data || []).map(mapSwapFromSupabase);
  } catch (err) {
    console.error('[fetchAllSwaps] Error:', err);
    return [];
  }
}

function mapSwapFromSupabase(row) {
  return {
    id: row.id,
    swapId: row.swap_id || '',
    displayLocationId: row.display_location_id || '',
    swapType: row.swap_type || [],
    swapDate: row.swap_date || null,
    swapReason: row.swap_reason || '',
    partnerId: row.partner_id || '',
    technician: row.technician || '',
    oldHardwareIds: row.old_hardware_ids || [],
    newHardwareIds: row.new_hardware_ids || [],
    defectDescription: row.defect_description || '',
    status: row.status || '',
    locationName: row.location_name || '',
    city: row.city || '',
  };
}

/**
 * Create a new Hardware Swap in Airtable.
 * Follows the createTask pattern: POST to Airtable → fire-and-forget Supabase sync.
 */
export async function createHardwareSwap(swapData) {
  try {
    const fields = {};
    if (swapData.swapType) fields['Tausch-Typ'] = Array.isArray(swapData.swapType) ? swapData.swapType : [swapData.swapType];
    if (swapData.swapDate) fields['Tausch-Datum'] = swapData.swapDate;
    if (swapData.swapReason) fields['Tausch-Grund'] = swapData.swapReason;
    if (swapData.technician) fields['Techniker'] = swapData.technician;
    if (swapData.defectDescription) fields['Defekt-Beschreibung'] = swapData.defectDescription;
    if (swapData.status) fields['Status'] = swapData.status;

    // Linked record fields – expect Airtable record IDs
    if (swapData.displayLocationId) fields['Live Display Location'] = [swapData.displayLocationId];
    if (swapData.partnerId) fields['Partner'] = [swapData.partnerId];
    if (swapData.oldHardwareIds?.length) fields['ALTE Hardware'] = swapData.oldHardwareIds;
    if (swapData.newHardwareIds?.length) fields['NEUE Hardware'] = swapData.newHardwareIds;

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${HARDWARE_SWAP_TABLE_AT}`;
    const response = await fetch(url, airtableWriteOptions('POST', { fields }));

    if (!response.ok) {
      const errText = await response.text();
      console.error('[createHardwareSwap] Error:', response.status, errText);
      let errorMsg = 'Fehler beim Erstellen des Tausch-Auftrags';
      try { const e = JSON.parse(errText); if (e?.error?.message) errorMsg = e.error.message; } catch {}
      throw new Error(errorMsg);
    }

    const data = await response.json();

    // Fire-and-forget sync
    syncSwapToSupabase(data, swapData);

    // Invalidate caches
    cache.swaps.clear();
    cache.allOps = null;
    cache.allOpsTimestamp = null;
    return data;
  } catch (err) {
    console.error('[createHardwareSwap] Error:', err);
    throw err;
  }
}

function syncSwapToSupabase(airtableRecord, swapData) {
  if (!airtableRecord?.id) return;
  const f = airtableRecord.fields || {};
  supabase.from('hardware_swaps').upsert({
    id: airtableRecord.id,
    swap_id: f['Tausch-ID'] || null,
    display_location_id: swapData?.displayLocationId || null,
    swap_type: f['Tausch-Typ'] || [],
    swap_date: f['Tausch-Datum'] || null,
    swap_reason: f['Tausch-Grund'] || null,
    partner_id: swapData?.partnerId || null,
    technician: f['Techniker'] || null,
    old_hardware_ids: f['ALTE Hardware'] || [],
    new_hardware_ids: f['NEUE Hardware'] || [],
    defect_description: f['Defekt-Beschreibung'] || null,
    status: f['Status'] || 'Todo',
    location_name: swapData?.locationName || null,
    city: swapData?.city || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
    .then(() => {})
    .catch(err => console.error('[sync] Swap sync error:', err));
}

/* ═══════════════════════════════════════════════════════════
 *  DEINSTALLATIONS – READ + WRITE
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch deinstall history for a display location.
 */
export async function fetchDeinstallsByLocationId(displayLocationId) {
  if (!displayLocationId) return [];

  if (cache.deinstalls.has(displayLocationId)) {
    return cache.deinstalls.get(displayLocationId);
  }

  try {
    const { data, error } = await supabase
      .from('hardware_deinstalls')
      .select('*') // Mapped via mapDeinstallFromSupabase — all fields needed
      .eq('display_location_id', displayLocationId)
      .order('deinstall_date', { ascending: false })
      .limit(50);

    if (error) throw error;
    const deinstalls = (data || []).map(mapDeinstallFromSupabase);
    cache.deinstalls.set(displayLocationId, deinstalls);
    return deinstalls;
  } catch (err) {
    console.error('[fetchDeinstallsByLocationId] Error:', err);
    return [];
  }
}

/**
 * Fetch ALL deinstalls (for Hardware Dashboard).
 */
export async function fetchAllDeinstalls() {
  try {
    const { data, error } = await supabase
      .from('hardware_deinstalls')
      .select('*') // Full cache load — all fields needed for multi-component use
      .order('deinstall_date', { ascending: false })
      .limit(2000);

    if (error) throw error;
    return (data || []).map(mapDeinstallFromSupabase);
  } catch (err) {
    console.error('[fetchAllDeinstalls] Error:', err);
    return [];
  }
}

function mapDeinstallFromSupabase(row) {
  return {
    id: row.id,
    deinstallId: row.deinstall_id || '',
    displayLocationId: row.display_location_id || '',
    opsRecordId: row.ops_record_id || '',
    deinstallDate: row.deinstall_date || null,
    reason: row.reason || '',
    partnerId: row.partner_id || '',
    technician: row.technician || '',
    hardwareCondition: row.hardware_condition || '',
    conditionDescription: row.condition_description || '',
    status: row.status || '',
    locationName: row.location_name || '',
    city: row.city || '',
  };
}

/**
 * Create a new Deinstallation in Airtable.
 */
export async function createDeinstall(deinstallData) {
  try {
    const fields = {};
    if (deinstallData.deinstallDate) fields['Deinstallationsdatum'] = deinstallData.deinstallDate;
    if (deinstallData.reason) fields['Grund'] = deinstallData.reason;
    if (deinstallData.technician) fields['Techniker'] = deinstallData.technician;
    if (deinstallData.hardwareCondition) fields['Hardware-Zustand'] = deinstallData.hardwareCondition;
    if (deinstallData.conditionDescription) fields['Zustandsbeschreibung'] = deinstallData.conditionDescription;
    if (deinstallData.status) fields['Status'] = deinstallData.status;

    // Linked record fields
    if (deinstallData.displayLocationId) fields['Live Display Location'] = [deinstallData.displayLocationId];
    if (deinstallData.opsRecordId) fields['OPS-Nr / Hardware-Set'] = [deinstallData.opsRecordId];

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${DEINSTALL_TABLE_AT}`;
    const response = await fetch(url, airtableWriteOptions('POST', { fields }));

    if (!response.ok) {
      const errText = await response.text();
      console.error('[createDeinstall] Error:', response.status, errText);
      let errorMsg = 'Fehler beim Erstellen des Deinstallations-Auftrags';
      try { const e = JSON.parse(errText); if (e?.error?.message) errorMsg = e.error.message; } catch {}
      throw new Error(errorMsg);
    }

    const data = await response.json();

    // Fire-and-forget sync
    syncDeinstallToSupabase(data, deinstallData);

    // Invalidate caches
    cache.deinstalls.clear();
    cache.allOps = null;
    cache.allOpsTimestamp = null;
    return data;
  } catch (err) {
    console.error('[createDeinstall] Error:', err);
    throw err;
  }
}

function syncDeinstallToSupabase(airtableRecord, deinstallData) {
  if (!airtableRecord?.id) return;
  const f = airtableRecord.fields || {};
  supabase.from('hardware_deinstalls').upsert({
    id: airtableRecord.id,
    deinstall_id: f['Deinstallations-ID'] || null,
    display_location_id: deinstallData?.displayLocationId || null,
    ops_record_id: deinstallData?.opsRecordId || null,
    deinstall_date: f['Deinstallationsdatum'] || null,
    reason: f['Grund'] || null,
    partner_id: deinstallData?.partnerId || null,
    technician: f['Techniker'] || null,
    hardware_condition: f['Hardware-Zustand'] || null,
    condition_description: f['Zustandsbeschreibung'] || null,
    status: f['Status'] || 'Geplant',
    location_name: deinstallData?.locationName || null,
    city: deinstallData?.city || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
    .then(() => {})
    .catch(err => console.error('[sync] Deinstall sync error:', err));
}

/* ═══════════════════════════════════════════════════════════
 *  HARDWARE TRACKING – Reverse-Lookup & History
 * ═══════════════════════════════════════════════════════════ */

/**
 * Find where hardware (OPS-SN, Display-SN, SIM-ID) is currently deployed.
 * Searches ALL OPS records for matching serial numbers at DIFFERENT locations.
 * Used to show "Hardware jetzt bei: ..." for deinstalled displays.
 *
 * @param {{ opsSn?: string, displaySn?: string, simId?: string }} serials
 * @param {string} currentLocationId - Exclude this location from results
 * @returns {Promise<{ opsSn?: Object, displaySn?: Object, simId?: Object }>}
 *   Each key maps to { opsRecord, location } if found elsewhere, or null.
 */
export async function findHardwareReassignment(serials, currentLocationId) {
  const { opsSn, displaySn, simId } = serials || {};
  if (!opsSn && !displaySn && !simId) return {};

  try {
    // Load all OPS + all locations (both are cached)
    const [allOps, allLocations] = await Promise.all([
      fetchAllOpsInventory(),
      fetchAllDisplayLocations(),
    ]);

    const locationMap = {};
    allLocations.forEach((loc) => { locationMap[loc.id] = loc; });

    const result = {};

    // Find OPS-SN at a different location
    if (opsSn) {
      const match = allOps.find(
        (o) => o.opsSn === opsSn && o.displayLocationId && o.displayLocationId !== currentLocationId
      );
      result.opsSn = match
        ? { opsRecord: match, location: locationMap[match.displayLocationId] || null }
        : null;
    }

    // Find Display-SN at a different location
    if (displaySn) {
      const match = allOps.find(
        (o) => o.displaySn === displaySn && o.displayLocationId && o.displayLocationId !== currentLocationId
      );
      result.displaySn = match
        ? { opsRecord: match, location: locationMap[match.displayLocationId] || null }
        : null;
    }

    // Find SIM-ID at a different location
    if (simId) {
      const match = allOps.find(
        (o) => o.simId === simId && o.displayLocationId && o.displayLocationId !== currentLocationId
      );
      result.simId = match
        ? { opsRecord: match, location: locationMap[match.displayLocationId] || null }
        : null;
    }

    return result;
  } catch (err) {
    console.error('[findHardwareReassignment] Error:', err);
    return {};
  }
}

/**
 * Fetch complete movement history for a specific hardware serial number.
 * Combines: all OPS records with that SN + all swaps involving those OPS IDs.
 * Returns a timeline of locations the hardware has been at.
 *
 * @param {'opsSn'|'displaySn'|'simId'} snType - Which serial to search for
 * @param {string} snValue - The serial number value
 * @returns {Promise<Array<{ date: string, type: string, locationName: string, city: string, locationId: string, detail: string }>>}
 */
export async function fetchHardwareMovementHistory(snType, snValue) {
  if (!snValue) return [];

  try {
    const [allOps, allLocations, allSwaps] = await Promise.all([
      fetchAllOpsInventory(),
      fetchAllDisplayLocations(),
      fetchAllSwaps(),
    ]);

    const locationMap = {};
    allLocations.forEach((loc) => { locationMap[loc.id] = loc; });

    // Find all OPS records matching this serial
    let matchingOps;
    if (snType === 'opsSn') {
      matchingOps = allOps.filter((o) => o.opsSn === snValue);
    } else if (snType === 'displaySn') {
      matchingOps = allOps.filter((o) => o.displaySn === snValue);
    } else if (snType === 'simId') {
      matchingOps = allOps.filter((o) => o.simId === snValue);
    } else {
      return [];
    }

    const matchingOpsIds = new Set(matchingOps.map((o) => o.id));

    // Build timeline entries
    const timeline = [];

    // Current assignments (OPS → Location)
    matchingOps.forEach((ops) => {
      if (ops.displayLocationId) {
        const loc = locationMap[ops.displayLocationId];
        timeline.push({
          date: null, // No specific date for current assignment
          type: 'assignment',
          locationName: loc?.locationName || 'Unbekannt',
          city: loc?.city || '',
          locationId: ops.displayLocationId,
          status: ops.status,
          detail: `Aktuell installiert (OPS ${ops.opsNr || ops.opsSn})`,
          liveSince: loc?.liveSince || null,
        });
      }
    });

    // Swaps involving these OPS IDs
    allSwaps.forEach((swap) => {
      const oldMatch = (swap.oldHardwareIds || []).some((id) => matchingOpsIds.has(id));
      const newMatch = (swap.newHardwareIds || []).some((id) => matchingOpsIds.has(id));

      if (oldMatch || newMatch) {
        timeline.push({
          date: swap.swapDate,
          type: oldMatch ? 'removed' : 'installed',
          locationName: swap.locationName || 'Unbekannt',
          city: swap.city || '',
          locationId: swap.displayLocationId || '',
          status: swap.status,
          detail: oldMatch
            ? `Ausgebaut (${swap.swapReason || swap.swapType?.join(', ') || 'Tausch'})`
            : `Eingebaut (${swap.swapReason || swap.swapType?.join(', ') || 'Tausch'})`,
        });
      }
    });

    // Sort by date (most recent first), null dates (current) at top
    timeline.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return -1;
      if (!b.date) return 1;
      return new Date(b.date) - new Date(a.date);
    });

    return timeline;
  } catch (err) {
    console.error('[fetchHardwareMovementHistory] Error:', err);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════
 *  HARDWARE COMPONENT DETAIL — Single-record lookups
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch a single OPS record by Supabase ID.
 */
export async function fetchOpsById(opsId) {
  if (!opsId) return null;
  try {
    const { data, error } = await supabase.from('hardware_ops').select('*').eq('id', opsId).single(); // Mapped via mapOpsFromSupabase — all fields needed
    if (error) throw error;
    return data ? mapOpsFromSupabase(data) : null;
  } catch (err) {
    console.error('[fetchOpsById] Error:', err);
    return null;
  }
}

/**
 * Fetch a single SIM record by Supabase ID.
 */
export async function fetchSimById(simId) {
  if (!simId) return null;
  try {
    const { data, error } = await supabase.from('hardware_sim').select('*').eq('id', simId).single(); // Mapped via mapSimFromSupabase — all fields needed
    if (error) throw error;
    return data ? mapSimFromSupabase(data) : null;
  } catch (err) {
    console.error('[fetchSimById] Error:', err);
    return null;
  }
}

/**
 * Fetch a single Display record by Supabase ID.
 */
export async function fetchDisplayById(displayId) {
  if (!displayId) return null;
  try {
    const { data, error } = await supabase.from('hardware_displays').select('*').eq('id', displayId).single(); // Mapped via mapDisplayFromSupabase — all fields needed
    if (error) throw error;
    return data ? mapDisplayFromSupabase(data) : null;
  } catch (err) {
    console.error('[fetchDisplayById] Error:', err);
    return null;
  }
}

/**
 * Fetch swaps involving a specific OPS ID (appears in old or new hardware).
 */
export async function fetchSwapsByOpsId(opsId) {
  if (!opsId) return [];
  try {
    const { data, error } = await supabase
      .from('hardware_swaps')
      .select('*') // Mapped via mapSwapFromSupabase — all fields needed
      .or(`old_hardware_ids.cs.{${opsId}},new_hardware_ids.cs.{${opsId}}`)
      .order('swap_date', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []).map(mapSwapFromSupabase);
  } catch (err) {
    console.error('[fetchSwapsByOpsId] Error:', err);
    return [];
  }
}

/**
 * Fetch deinstalls for a specific OPS record ID.
 */
export async function fetchDeinstallsByOpsId(opsId) {
  if (!opsId) return [];
  try {
    const { data, error } = await supabase
      .from('hardware_deinstalls')
      .select('*') // Mapped via mapDeinstallFromSupabase — all fields needed
      .eq('ops_record_id', opsId)
      .order('deinstall_date', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []).map(mapDeinstallFromSupabase);
  } catch (err) {
    console.error('[fetchDeinstallsByOpsId] Error:', err);
    return [];
  }
}

/**
 * Orchestration: Fetch the full lifecycle for any hardware component.
 * Resolves OPS hub, related components, location, swaps, deinstalls, leasing.
 *
 * @param {'ops'|'sim'|'display'} componentType
 * @param {string} componentId - Supabase record ID
 * @returns {Promise<Object>} { component, opsRecord, relatedSims, relatedDisplays, location, swaps, deinstalls, leasing, timeline }
 */
export async function fetchComponentLifecycle(componentType, componentId) {
  if (!componentId) return null;

  try {
    let component = null;
    let opsRecord = null;

    // 1. Fetch the component itself
    if (componentType === 'ops') {
      component = await fetchOpsById(componentId);
      opsRecord = component;
    } else if (componentType === 'sim') {
      component = await fetchSimById(componentId);
      // Resolve OPS via opsRecordId
      if (component?.opsRecordId) {
        opsRecord = await fetchOpsById(component.opsRecordId);
      }
    } else if (componentType === 'display') {
      component = await fetchDisplayById(componentId);
      // Resolve OPS via opsRecordId
      if (component?.opsRecordId) {
        opsRecord = await fetchOpsById(component.opsRecordId);
      }
    }

    if (!component) return null;

    const opsId = opsRecord?.id;

    // 2. Fetch related components via OPS
    let relatedSims = [];
    let relatedDisplays = [];
    if (opsId) {
      const [simRes, dispRes] = await Promise.all([
        supabase.from('hardware_sim').select('*').eq('ops_record_id', opsId).limit(10), // Mapped via mapSimFromSupabase — all fields needed
        supabase.from('hardware_displays').select('*').eq('ops_record_id', opsId).limit(10), // Mapped via mapDisplayFromSupabase — all fields needed
      ]);
      relatedSims = (simRes.data || []).map(mapSimFromSupabase);
      relatedDisplays = (dispRes.data || []).map(mapDisplayFromSupabase);
    }

    // 3. Fetch location via displayLocationId on OPS
    let location = null;
    if (opsRecord?.displayLocationId) {
      const allLocations = await fetchAllDisplayLocations();
      location = allLocations.find(l => l.id === opsRecord.displayLocationId) || null;
    }

    // 4. Fetch swaps + deinstalls for the OPS
    let swaps = [];
    let deinstalls = [];
    if (opsId) {
      [swaps, deinstalls] = await Promise.all([
        fetchSwapsByOpsId(opsId),
        fetchDeinstallsByOpsId(opsId),
      ]);
    }

    // 5. Fetch leasing data
    let leasing = null;
    const jetId = location?.jetId;
    const displaySn = opsRecord?.displaySn || relatedDisplays[0]?.displaySerialNumber;
    if (jetId) {
      leasing = await fetchLeaseByJetId(jetId);
    } else if (displaySn) {
      leasing = await fetchLeaseByDisplaySN(displaySn);
    }

    // 6. Build unified timeline
    const timeline = [];

    // SIM activation
    for (const sim of relatedSims) {
      if (sim.activateDate) {
        timeline.push({
          date: sim.activateDate,
          type: 'sim_activation',
          label: 'SIM aktiviert',
          detail: `ICCID: ${sim.simIdImprecise ? '(ungenau)' : (sim.simId || '?')}`,
        });
      }
    }

    // Installation (if location has liveSince)
    if (location?.liveSince) {
      timeline.push({
        date: location.liveSince,
        type: 'installation',
        label: 'Installation',
        detail: `Standort: ${location.locationName || '?'} (${location.city || ''})`,
      });
    }

    // Swaps
    for (const swap of swaps) {
      const isOld = (swap.oldHardwareIds || []).includes(opsId);
      timeline.push({
        date: swap.swapDate,
        type: isOld ? 'swap_out' : 'swap_in',
        label: isOld ? 'Ausgebaut (Tausch)' : 'Eingebaut (Tausch)',
        detail: `${swap.swapReason || swap.swapType?.join(', ') || 'Tausch'} — ${swap.locationName || ''}`,
      });
    }

    // Deinstalls
    for (const deinst of deinstalls) {
      timeline.push({
        date: deinst.deinstallDate,
        type: 'deinstall',
        label: 'Deinstallation',
        detail: `${deinst.reason || ''} — ${deinst.locationName || ''}`,
      });
    }

    // Leasing start
    const leaseStart = leasing?.chg?.rentalStart || leasing?.bank?.rentalStart;
    if (leaseStart) {
      timeline.push({
        date: Array.isArray(leaseStart) ? leaseStart[0] : leaseStart,
        type: 'leasing_start',
        label: 'Leasing-Beginn',
        detail: leasing?.bank?.rentalCertificate || leasing?.chg?.chgCertificate || '',
      });
    }

    // Sort chronologically (newest first), nulls at end
    timeline.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    });

    return {
      component,
      componentType,
      opsRecord,
      relatedSims,
      relatedDisplays,
      location,
      swaps,
      deinstalls,
      leasing,
      timeline,
    };
  } catch (err) {
    console.error('[fetchComponentLifecycle] Error:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════
 *  ATTACHMENT CACHE – Resolve permanent Supabase Storage URLs
 *  Airtable attachment URLs expire after ~2 hours; this helper
 *  looks up cached permanent URLs from the attachment_cache table.
 * ═══════════════════════════════════════════════════════════ */

/**
 * Resolve attachment URLs by checking the attachment_cache table.
 * If a permanent Supabase Storage URL is cached, it replaces the
 * expiring Airtable URL. Otherwise the original URL is kept.
 *
 * @param {string} recordId   - Airtable record ID (e.g. "recXYZ123")
 * @param {string} fieldName  - Airtable field name (e.g. "images_akquise", "Installationsprotokoll")
 * @param {Array}  attachments - Array of attachment objects [{url, filename, ...}]
 * @returns {Promise<Array>}  Same array with urls replaced where cached
 */
export async function resolveAttachmentUrls(recordId, fieldName, attachments) {
  if (!attachments?.length) return attachments;

  try {
    const { data: cached } = await supabase
      .from('attachment_cache')
      .select('original_filename, public_url')
      .eq('airtable_record_id', recordId)
      .eq('airtable_field', fieldName);

    if (!cached?.length) return attachments;

    const cacheMap = new Map(cached.map(c => [c.original_filename, c.public_url]));

    return attachments.map(att => ({
      ...att,
      url: cacheMap.get(att.filename) || att.url,
      cached: cacheMap.has(att.filename),
    }));
  } catch {
    return attachments;
  }
}

/* ═══════════════════════════════════════════════════════════
 *  CACHE MANAGEMENT
 * ═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
 *  READ: AIRTABLE DISPLAYS (from Supabase airtable_displays table)
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch display record from airtable_displays by display_id.
 * Returns fields like online_status, screen_type, screen_size, sov_partner_ad, etc.
 */
export async function fetchAirtableDisplayByDisplayId(displayId) {
  if (!displayId) return null;
  try {
    const { data, error } = await supabase
      .from('airtable_displays')
      .select('*') // Full record needed — returned directly to components
      .eq('display_id', displayId)
      .maybeSingle();
    if (error) {
      console.warn('[airtableService] airtable_displays fetch error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[airtableService] airtable_displays not available:', err.message);
    return null;
  }
}

/**
 * Clear ALL in-memory and localStorage caches.
 * Used by triggerSyncAndReload to force fresh data from Supabase after Airtable sync.
 */
export function clearAirtableCache() {
  // Reset all in-memory timestamps and data
  cache.stammdaten.clear();
  cache.tasks.clear();
  cache.installation.clear();
  cache.allTasks = null;
  cache.allTasksTimestamp = null;
  cache.allStammdaten = null;
  cache.allStammdatenTimestamp = null;
  cache.allCommunications = null;
  cache.allCommunicationsTimestamp = null;
  cache.hardware.clear();
  cache.hardwareTimestamp.clear();
  cache.leasing.clear();
  cache.leasingTimestamp.clear();
  cache.allOps = null;
  cache.allOpsTimestamp = null;
  cache.allSim = null;
  cache.allSimTimestamp = null;
  cache.allDisplayInv = null;
  cache.allDisplayInvTimestamp = null;
  cache.allLeasing = null;
  cache.allLeasingTimestamp = null;
  cache.swaps.clear();
  cache.deinstalls.clear();
  cache.allAcquisition = null;
  cache.allAcquisitionTimestamp = null;
  cache.allDisplayLocations = null;
  cache.allDisplayLocationsTimestamp = null;
  cache.allInstallationen = null;
  cache.allInstallationenTimestamp = null;
  cache.allInstallationstermine = null;
  cache.allInstallationstermineTimestamp = null;
  cache.partners = null;
  cache.partnersTimestamp = null;
  // Clear localStorage persistence
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('jet_cache_'));
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
}

/**
 * Clear cache for a display (useful when refreshing)
 */
export function clearCache(displayId) {
  if (displayId) {
    cache.stammdaten.delete(displayId);
    cache.tasks.delete(displayId);
    cache.installation.delete(displayId);
  } else {
    cache.stammdaten.clear();
    cache.tasks.clear();
    cache.installation.clear();
    cache.allTasks = null;
    cache.allTasksTimestamp = null;
    cache.allStammdaten = null;
    cache.allStammdatenTimestamp = null;
    cache.allCommunications = null;
    cache.allCommunicationsTimestamp = null;
    // Hardware caches
    cache.hardware.clear();
    cache.hardwareTimestamp.clear();
    cache.leasing.clear();
    cache.leasingTimestamp.clear();
    cache.allOps = null;
    cache.allOpsTimestamp = null;
    cache.allLeasing = null;
    cache.allLeasingTimestamp = null;
    cache.swaps.clear();
    cache.deinstalls.clear();
    cache.allAcquisition = null;
    cache.allAcquisitionTimestamp = null;
    cache.allDisplayLocations = null;
    cache.allDisplayLocationsTimestamp = null;
    cache.allInstallationen = null;
    cache.allInstallationenTimestamp = null;
  }
}

/* ═══════════════════════════════════════════════════════════
 *  READ: ACQUISITION PIPELINE (from Supabase)
 * ═══════════════════════════════════════════════════════════ */

function mapAcquisitionFromSupabase(row) {
  return {
    id: row.airtable_id || row.id,
    akquiseId: row.akquise_id || '',
    leadStatus: row.lead_status || '',
    frequencyApproval: row.frequency_approval || '',
    installApproval: row.install_approval || '',
    approvalStatus: row.approval_status || '',
    acquisitionDate: row.acquisition_date || null,
    installationsStatus: row.installations_status || [],
    displayLocationStatus: row.display_location_status || [],
    city: Array.isArray(row.city) ? row.city.filter(Boolean) : (row.city ? [row.city] : []),
    locationName: row.location_name || '',
    street: row.street || '',
    streetNumber: row.street_number || '',
    postalCode: row.postal_code || '',
    jetId: row.jet_id || '',
    contactPerson: row.contact_person || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    acquisitionPartner: row.acquisition_partner || '',
    dvacWeek: row.dvac_week || null,
    schaufenster: row.schaufenster || '',
    hindernisse: row.hindernisse || '',
    mountType: row.mount_type || '',
    submittedBy: row.submitted_by || '',
    submittedAt: row.submitted_at || null,
    vertragVorhanden: row.vertrag_vorhanden || '',
    unterschriftsdatum: (row.unterschriftsdatum && typeof row.unterschriftsdatum === 'string' && row.unterschriftsdatum.startsWith('{')) ? null : (row.unterschriftsdatum || null),
    vertragsnummer: (row.vertragsnummer && typeof row.vertragsnummer === 'string' && row.vertragsnummer.startsWith('{')) ? null : (row.vertragsnummer || null),
    akquiseStorno: row.akquise_storno || false,
    postInstallStorno: row.post_install_storno || false,
    postInstallStornoGrund: row.post_install_storno_grund || [],
    readyForInstallation: row.ready_for_installation || false,
    createdAt: row.created_at || null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    // Extended fields - attachments
    vertragPdf: row.vertrag_pdf || [],
    images: row.images || [],
    fawDataAttachment: row.faw_data_attachment || [],
    installationsprotokoll: row.installationsprotokoll || [],
    // Comments
    akquiseKommentar: row.akquise_kommentar || '',
    kommentarInstallationen: row.kommentar_installationen || '',
    frequencyApprovalComment: row.frequency_approval_comment || '',
    // dVAC
    dvacMonth: row.dvac_month != null ? Number(row.dvac_month) : null,
    dvacDay: row.dvac_day != null ? Number(row.dvac_day) : null,
    // Location details
    hindernisseBeschreibung: row.hindernisse_beschreibung || '',
    fensterbreite: row.fensterbreite || '',
    steckdose: row.steckdose || '',
    // Booking fields (synced from Airtable)
    bookingStatus: row.booking_status || null,
    bookingToken: row.booking_token || null,
    bookingLinkSentAt: row.booking_link_sent_at || null,
  };
}

export async function fetchAllAcquisition() {
  // 1. Return from in-memory cache if fresh
  if (cache.allAcquisition && cache.allAcquisitionTimestamp && Date.now() - cache.allAcquisitionTimestamp < CACHE_TTL) {
    return cache.allAcquisition;
  }

  // 2. Request deduplication — if a fetch is already in flight, piggyback on it
  if (_inflight.allAcquisition) return _inflight.allAcquisition;

  _inflight.allAcquisition = _fetchAllAcquisitionImpl();
  try {
    return await _inflight.allAcquisition;
  } finally {
    _inflight.allAcquisition = null;
  }
}

async function _fetchAllAcquisitionImpl() {
  // 3. Try localStorage as instant fallback (show stale data while fetching fresh)
  const persisted = loadFromPersist('allAcquisition');
  if (persisted && !cache.allAcquisition) {
    cache.allAcquisition = persisted;
    cache.allAcquisitionTimestamp = Date.now() - CACHE_TTL + 10_000; // expire in 10s to trigger background refresh
  }

  try {
    // Strategy 1: Try proxy (bypasses RLS) — paginate with larger pages to avoid
    // PostgREST offset-pagination gaps (proxy allows up to 15000 rows for acquisition)
    let allRows = [];
    try {
      let offset = 0;
      const pageSize = 5000;
      const MAX_PAGES = 10; // safety limit
      let pageCount = 0;
      while (pageCount < MAX_PAGES) {
        const proxyRes = await fetch(`/api/supabase-proxy?table=acquisition&limit=${pageSize}&offset=${offset}&order=created_at.desc`);
        if (!proxyRes.ok) break;
        const page = await proxyRes.json();
        if (!page || page.length === 0) break;
        allRows = allRows.concat(page);
        pageCount++;
        if (page.length < pageSize) break;
        offset += pageSize;
      }
      // Proxy returned data successfully
    } catch (proxyErr) {
      console.warn('[fetchAllAcquisition] Proxy failed, trying direct Supabase:', proxyErr.message);
    }

    // Strategy 2: Fallback to direct Supabase (may return 0 due to RLS)
    if (allRows.length === 0) {
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('acquisition')
          .select('*') // Full cache load — all fields needed for multi-component use
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
    }

    // Deduplicate by airtable_id (or id fallback) — Supabase can have duplicate rows
    const seen = new Set();
    const deduped = [];
    for (const row of allRows) {
      const key = row.airtable_id || row.id;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      deduped.push(row);
    }
    if (deduped.length < allRows.length) {
      console.warn(`[fetchAllAcquisition] Removed ${allRows.length - deduped.length} duplicate rows (${allRows.length} → ${deduped.length})`);
    }

    const records = deduped.map(mapAcquisitionFromSupabase);
    cache.allAcquisition = records;
    cache.allAcquisitionTimestamp = Date.now();
    saveToPersist('allAcquisition', records);
    return records;
  } catch (err) {
    console.error('[fetchAllAcquisition] Error:', err);
    return cache.allAcquisition || loadFromPersist('allAcquisition') || [];
  }
}

/* ===============================================================
 *  READ: INSTALLATIONSTERMINE (from Supabase)
 * =============================================================== */

/**
 * Fetch ALL Installationstermine from Supabase.
 * Cached for 1 minute. Used for installation scheduling views.
 */
export async function fetchAllInstallationstermine() {
  if (
    cache.allInstallationstermine &&
    cache.allInstallationstermineTimestamp &&
    Date.now() - cache.allInstallationstermineTimestamp < CACHE_TTL
  ) {
    return cache.allInstallationstermine;
  }

  // Request deduplication
  if (_inflight.allInstallationstermine) return _inflight.allInstallationstermine;

  _inflight.allInstallationstermine = _fetchAllInstallationstermineImpl();
  try {
    return await _inflight.allInstallationstermine;
  } finally {
    _inflight.allInstallationstermine = null;
  }
}

async function _fetchAllInstallationstermineImpl() {
  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('installationstermine')
        .select('*') // Full cache load — all fields needed for multi-component use
        .order('installationsdatum', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const records = allRows.map(mapInstallationsterminFromSupabase);
    cache.allInstallationstermine = records;
    cache.allInstallationstermineTimestamp = Date.now();
    return records;
  } catch (err) {
    console.error('[fetchAllInstallationstermine] Error:', err);
    return cache.allInstallationstermine || [];
  }
}

/**
 * Map Supabase installationstermine row -> component-compatible format.
 */
function mapInstallationsterminFromSupabase(row) {
  return {
    id: row.id,
    airtableId: row.airtable_id || row.id,
    installDateId: row.install_date_id || null,
    installationsdatum: row.installationsdatum || null,
    erinnerungsdatum: row.erinnerungsdatum || null,
    installationszeit: row.installationszeit || '',
    grundNotiz: row.grund_notiz || '',
    naechsteSchritt: row.naechste_schritt || '',
    kwGeplant: row.kw_geplant || '',
    wochentag: row.wochentag || '',
    installationsdatumNurDatum: row.installationsdatum_nur_datum || '',
    terminstatus: row.terminstatus || '',
    jetIdLinks: row.jet_id_links || [],
    locationName: row.location_name || [],
    akquiseLinks: row.akquise_links || [],
    street: row.street || [],
    streetNumber: row.street_number || [],
    postalCode: row.postal_code || [],
    city: row.city || [],
    contactEmail: row.contact_email || [],
    stammdatenLinks: row.stammdaten_links || [],
    installationenLinks: row.installationen_links || [],
    statusInstallation: row.status_installation || [],
    // Partner / Integrator / Technician info (from linked Installationen & Akquise)
    integrator: row.integrator || [],
    technicians: row.technicians || [],
    installationsart: row.installationsart || [],
    aufbauDatum: row.aufbau_datum || [],
    abnahmePartner: row.abnahme_partner || [],
    acquisitionPartner: row.acquisition_partner || [],
    // Contact info from Stammdaten
    contactPerson: row.contact_person || [],
    contactPhone: row.contact_phone || [],
    // Audit
    createdAt: row.created_at || null,
    createdBy: row.created_by || null,
  };
}
