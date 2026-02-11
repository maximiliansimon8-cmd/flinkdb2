/**
 * Data Service – JET Germany DOOH Dashboard
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
};

const CACHE_TTL = 1 * 60 * 1000; // 1 minute – other teams work on Airtable, keep data fresh

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
      .select('*')
      .contains('display_ids', [displayId])
      .limit(1)
      .single();

    if (error || !data) {
      // Fallback: try text search if contains doesn't match
      const { data: data2 } = await supabase
        .from('stammdaten')
        .select('*')
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

  try {
    // Supabase returns max 1000 rows by default, we need pagination
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('stammdaten')
        .select('*')
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
    console.log(`[fetchAllStammdaten] Loaded ${locations.length} locations from Supabase`);
    return locations;
  } catch (err) {
    console.error('Supabase fetchAllStammdaten error:', err);
    return cache.allStammdaten || [];
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
      .select('*')
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

  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
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
    console.log(`[fetchAllTasks] Loaded ${tasks.length} tasks from Supabase`);
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
  return {
    id: row.airtable_id || row.id,
    title: row.title || '',
    type: row.task_type || [],
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
      .select('*')
      .contains('display_ids', [displayId])
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      cache.installation.set(displayId, null);
      return null;
    }

    const result = {
      installDate: data.install_date || null,
      status: data.status || '',
      installationType: data.installation_type || '',
      integrator: data.integrator || '',
      technicians: data.technicians || [],
      protocol: data.protocol_url ? [{
        url: data.protocol_url,
        filename: data.protocol_filename || 'Protokoll.pdf',
      }] : [],
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
 * Create a new Task in Airtable (then sync to Supabase).
 */
export async function createTask(taskData) {
  try {
    const fields = {};
    if (taskData.title) fields['Task Title'] = taskData.title;
    if (taskData.type && taskData.type.length > 0) fields['Task Type'] = taskData.type;
    if (taskData.status) fields['Status'] = taskData.status;
    if (taskData.priority) fields['Priority'] = taskData.priority;
    if (taskData.dueDate) fields['Due Date'] = taskData.dueDate;
    if (taskData.description) fields['Description'] = taskData.description;
    if (taskData.displays && taskData.displays.length > 0) fields['Displays'] = taskData.displays;
    if (taskData.locations && taskData.locations.length > 0) fields['Locations'] = taskData.locations;
    if (taskData.assignedUserName) fields['Responsible User'] = taskData.assignedUserName;

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${TASKS_TABLE}`;
    const response = await fetch(url, airtableWriteOptions('POST', { fields }));

    if (!response.ok) {
      const errText = await response.text();
      console.error('Airtable createTask error:', response.status, errText);
      return null;
    }

    const data = await response.json();

    // Sync to Supabase (fire-and-forget)
    syncTaskToSupabase(data);

    // Invalidate cache
    cache.allTasks = null;
    cache.allTasksTimestamp = null;
    return data;
  } catch (err) {
    console.error('createTask error:', err);
    return null;
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
function syncTaskToSupabase(airtableRecord) {
  if (!airtableRecord?.id) return;
  const f = airtableRecord.fields || {};
  const assigned = Array.isArray(f['Assigned'])
    ? f['Assigned'].map(a => typeof a === 'object' ? a.name : a).filter(Boolean)
    : [];

  supabase.from('tasks').upsert({
    id: airtableRecord.id,
    airtable_id: airtableRecord.id,
    title: f['Task Title'] || null,
    task_type: f['Task Type'] || [],
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
    .then(() => console.log('[sync] Task synced to Supabase:', airtableRecord.id))
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

  try {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('communications')
        .select('*')
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
    console.log(`[fetchAllCommunications] Loaded ${communications.length} from Supabase`);
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
      .select('*')
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
    .then(() => console.log('[sync] Communication synced to Supabase:', airtableRecord.id))
    .catch(err => console.error('[sync] Communication sync error:', err));
}

/* ═══════════════════════════════════════════════════════════
 *  CACHE MANAGEMENT
 * ═══════════════════════════════════════════════════════════ */

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
  }
}
