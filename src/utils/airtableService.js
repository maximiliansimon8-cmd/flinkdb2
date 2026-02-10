/**
 * Airtable Service – fetches JET Stammdaten, Tasks, and Installation data
 * for a given Display ID.
 *
 * In development: uses Vite dev proxy at /api/airtable (no token needed client-side)
 * In production: calls Airtable API directly with embedded token (internal dashboard)
 */

const BASE_ID = 'apppFUWK829K6B3R2';
const STAMMDATEN_TABLE = 'tblLJ1S7OUhc2w5Jw';
const TASKS_TABLE = 'tblcKHWJg77mgIQ9l';
const INSTALLATIONEN_TABLE = 'tblKznpAOAMvEfX8u';
const ACTIVITY_LOG_TABLE = 'tblDk1dl4J3Ow3Qde';

const AIRTABLE_TOKEN = '***REMOVED_AIRTABLE_PAT***';

// In development use the Vite proxy, in production call Airtable directly
const isDev = import.meta.env.DEV;
const AIRTABLE_BASE = isDev ? '/api/airtable' : `https://api.airtable.com/v0`;

/**
 * Helper to build fetch options – adds Authorization header in production
 */
function airtableFetchOptions() {
  if (isDev) return {};
  return {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    },
  };
}

// Simple in-memory cache to avoid repeated fetches for the same display
const cache = {
  stammdaten: new Map(),
  tasks: new Map(),
  installation: new Map(),
  allTasks: null,
  allTasksTimestamp: null,
  allCommunications: null,
  allCommunicationsTimestamp: null,
  allStammdaten: null,
  allStammdatenTimestamp: null,
};

/**
 * Fetch JET Stammdaten record matching a given Display ID.
 * The Airtable "Display ID" field is a lookup that stores arrays like ["DO-GER-BER-WD-55-618-26"].
 * We use FIND() to match within the lookup values.
 */
export async function fetchStammdatenByDisplayId(displayId) {
  if (cache.stammdaten.has(displayId)) {
    return cache.stammdaten.get(displayId);
  }

  try {
    // Use FIND to search within the lookup array values
    const formula = encodeURIComponent(`FIND("${displayId}", ARRAYJOIN({Display ID}, ","))`);
    const fields = [
      'JET ID',
      'Display ID',
      'Location Name',
      'Contact Person',
      'Contact Email',
      'Contact Phone',
      'Location Email',
      'Location Phone',
      'Legal Entity',
      'Street',
      'Street Number',
      'Postal Code',
      'City',
      'Lead Status  (from Akquise)',
    ].map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${STAMMDATEN_TABLE}?filterByFormula=${formula}&${fields}&maxRecords=1`;
    const response = await fetch(url, airtableFetchOptions());

    if (!response.ok) {
      console.error('Airtable Stammdaten error:', response.status);
      return null;
    }

    const data = await response.json();
    const record = data.records?.[0]?.fields || null;
    cache.stammdaten.set(displayId, record);
    return record;
  } catch (err) {
    console.error('Airtable Stammdaten fetch error:', err);
    return null;
  }
}

/**
 * Fetch ALL Stammdaten (locations) from Airtable.
 * Cached for 5 minutes. Used for location selectors, communication dashboard etc.
 * Returns minimal fields for listing: id, name, contact info, JET IDs, Display IDs.
 */
export async function fetchAllStammdaten() {
  if (
    cache.allStammdaten &&
    cache.allStammdatenTimestamp &&
    Date.now() - cache.allStammdatenTimestamp < 5 * 60 * 1000
  ) {
    return cache.allStammdaten;
  }

  try {
    const fields = [
      'JET ID',
      'Display ID',
      'Location Name',
      'Contact Person',
      'Contact Email',
      'Contact Phone',
      'Location Email',
      'Location Phone',
      'Legal Entity',
      'Street',
      'Street Number',
      'Postal Code',
      'City',
      'Lead Status  (from Akquise)',
    ].map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const sort = 'sort[0][field]=Location+Name&sort[0][direction]=asc';
    let allRecords = [];
    let offset = null;
    let pageCount = 0;

    do {
      pageCount++;
      const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
      const url = `${AIRTABLE_BASE}/${BASE_ID}/${STAMMDATEN_TABLE}?${fields}&${sort}&pageSize=100${offsetParam}`;
      console.log(`[fetchAllStammdaten] Page ${pageCount}`);
      const response = await fetch(url, airtableFetchOptions());

      if (!response.ok) {
        console.error('Airtable AllStammdaten error:', response.status);
        break;
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);

    const locations = allRecords.map((r) => ({
      id: r.id,
      name: r.fields['Location Name'] || '',
      jetIds: r.fields['JET ID'] || [],
      displayIds: r.fields['Display ID'] || [],
      contactPerson: r.fields['Contact Person'] || '',
      contactEmail: r.fields['Contact Email'] || '',
      contactPhone: r.fields['Contact Phone'] || '',
      locationEmail: r.fields['Location Email'] || '',
      locationPhone: r.fields['Location Phone'] || '',
      legalEntity: r.fields['Legal Entity'] || '',
      street: r.fields['Street'] || '',
      streetNumber: r.fields['Street Number'] || '',
      postalCode: r.fields['Postal Code'] || '',
      city: r.fields['City'] || '',
      leadStatus: r.fields['Lead Status  (from Akquise)'] || [],
    }));

    cache.allStammdaten = locations;
    cache.allStammdatenTimestamp = Date.now();
    return locations;
  } catch (err) {
    console.error('Airtable fetchAllStammdaten error:', err);
    return [];
  }
}

/**
 * Fetch Tasks linked to a given Display ID.
 * The Airtable "Display ID (from Displays )" field is a lookup returning arrays.
 * Returns tasks sorted by Created time descending (newest first).
 */
export async function fetchTasksByDisplayId(displayId) {
  if (cache.tasks.has(displayId)) {
    return cache.tasks.get(displayId);
  }

  try {
    const formula = encodeURIComponent(`FIND("${displayId}", ARRAYJOIN({Display ID (from Displays )}, ","))`);
    const fields = [
      'Task Title',
      'Task Type',
      'Status',
      'Priority',
      'Due Date',
      'Description',
      'Created time',
      'Responsible User',
      'Assigned',
      'Created by',
    ].map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const sort = 'sort[0][field]=Created+time&sort[0][direction]=desc';

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${TASKS_TABLE}?filterByFormula=${formula}&${fields}&${sort}&maxRecords=50`;
    const response = await fetch(url, airtableFetchOptions());

    if (!response.ok) {
      console.error('Airtable Tasks error:', response.status);
      return [];
    }

    const data = await response.json();
    const tasks = (data.records || []).map((r) => {
      const assigned = r.fields['Assigned'];
      const assignedNames = Array.isArray(assigned)
        ? assigned.map((a) => a.name).filter(Boolean)
        : [];

      return {
        id: r.id,
        title: r.fields['Task Title'] || '',
        type: r.fields['Task Type'] || [],
        status: r.fields['Status'] || '',
        priority: r.fields['Priority'] || '',
        dueDate: r.fields['Due Date'] || null,
        description: r.fields['Description'] || '',
        createdTime: r.fields['Created time'] || '',
        responsibleUser: r.fields['Responsible User']?.name || '',
        assigned: assignedNames,
        createdBy: r.fields['Created by']?.name || '',
      };
    });

    cache.tasks.set(displayId, tasks);
    return tasks;
  } catch (err) {
    console.error('Airtable Tasks fetch error:', err);
    return [];
  }
}

/**
 * Fetch Installation record for a given Display ID.
 * Uses "Display Table ID (from Link to Display ID )" lookup field.
 * Returns install date, integrator, technician, PDF protocol, etc.
 */
export async function fetchInstallationByDisplayId(displayId) {
  if (cache.installation.has(displayId)) {
    return cache.installation.get(displayId);
  }

  try {
    const formula = encodeURIComponent(
      `FIND("${displayId}", ARRAYJOIN({Display Table ID (from Link to Display ID )}, ","))`
    );
    const fields = [
      'Aufbau Datum',
      'Status Installation',
      'Installationsart',
      'Company (from Integrator)',
      'Name (from Technikers)',
      'Installationsprotokoll',
      'Screen Art',
      'Screen Size',
      'OPS Nr',
      'SIM-ID',
      'Installationsstart',
      'Installationsabschluss',
      'Allgemeine Bemerkungen',
      'Abnahme Partner (Name)',
      'DO-ID',
    ].map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${INSTALLATIONEN_TABLE}?filterByFormula=${formula}&${fields}&maxRecords=1`;
    const response = await fetch(url, airtableFetchOptions());

    if (!response.ok) {
      console.error('Airtable Installation error:', response.status);
      return null;
    }

    const data = await response.json();
    const record = data.records?.[0]?.fields || null;

    if (record) {
      // Normalize the data
      const result = {
        installDate: record['Aufbau Datum'] || null,
        status: record['Status Installation'] || '',
        installationType: record['Installationsart'] || '',
        integrator: Array.isArray(record['Company (from Integrator)'])
          ? record['Company (from Integrator)'].join(', ')
          : record['Company (from Integrator)'] || '',
        technicians: Array.isArray(record['Name (from Technikers)'])
          ? record['Name (from Technikers)']
          : [],
        protocol: Array.isArray(record['Installationsprotokoll'])
          ? record['Installationsprotokoll']
          : [],
        screenType: record['Screen Art'] || '',
        screenSize: record['Screen Size'] || '',
        opsNr: record['OPS Nr'] || '',
        simId: record['SIM-ID'] || '',
        installStart: record['Installationsstart'] || null,
        installEnd: record['Installationsabschluss'] || null,
        remarks: record['Allgemeine Bemerkungen'] || '',
        partnerName: record['Abnahme Partner (Name)'] || '',
      };
      cache.installation.set(displayId, result);
      return result;
    }

    cache.installation.set(displayId, null);
    return null;
  } catch (err) {
    console.error('Airtable Installation fetch error:', err);
    return null;
  }
}

/**
 * Fetch ALL tasks from Airtable (for the Task Dashboard).
 * Paginates through all records using Airtable's offset mechanism.
 * Returns an array of normalized task objects.
 */
export async function fetchAllTasks() {
  if (cache.allTasks && cache.allTasksTimestamp && Date.now() - cache.allTasksTimestamp < 5 * 60 * 1000) {
    return cache.allTasks;
  }

  try {
    const fields = [
      'Task Title',
      'Task Type',
      'Status',
      'Priority',
      'Due Date',
      'Description',
      'Created time',
      'Assigned',
      'Created by',
      'Display ID (from Displays )',
      'Location Name (from Locations)',
      'Overdue',
      'completed_task_date',
      'completed_task_by',
    ].map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const sort = 'sort[0][field]=Created+time&sort[0][direction]=desc';
    let allRecords = [];
    let offset = null;
    let pageCount = 0;

    do {
      pageCount++;
      const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
      const url = `${AIRTABLE_BASE}/${BASE_ID}/${TASKS_TABLE}?${fields}&${sort}&pageSize=100${offsetParam}`;
      console.log(`[fetchAllTasks] Page ${pageCount}, fetching:`, url.substring(0, 120) + '...');
      const response = await fetch(url, airtableFetchOptions());

      if (!response.ok) {
        const errText = await response.text();
        console.error('Airtable All Tasks error:', response.status, errText);
        break;
      }

      const data = await response.json();
      console.log(`[fetchAllTasks] Page ${pageCount}: got ${data.records?.length || 0} records, offset: ${data.offset ? 'yes' : 'no'}`);
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);

    const tasks = allRecords.map((r) => {
      const assigned = r.fields['Assigned'];
      const assignedNames = Array.isArray(assigned)
        ? assigned.map((a) => (typeof a === 'object' ? a.name : a)).filter(Boolean)
        : [];

      return {
        id: r.id,
        title: r.fields['Task Title'] || '',
        type: r.fields['Task Type'] || [],
        status: r.fields['Status'] || '',
        priority: r.fields['Priority'] || '',
        dueDate: r.fields['Due Date'] || null,
        description: r.fields['Description'] || '',
        createdTime: r.fields['Created time'] || '',
        assigned: assignedNames,
        createdBy: r.fields['Created by']?.name || r.fields['Created by'] || '',
        displayIds: r.fields['Display ID (from Displays )'] || [],
        locationNames: r.fields['Location Name (from Locations)'] || [],
        overdue: r.fields['Overdue'] || '',
        completedDate: r.fields['completed_task_date'] || null,
        completedBy: r.fields['completed_task_by'] || '',
      };
    });

    cache.allTasks = tasks;
    cache.allTasksTimestamp = Date.now();
    return tasks;
  } catch (err) {
    console.error('Airtable All Tasks fetch error:', err);
    return [];
  }
}

/**
 * Helper to build fetch options for write operations (POST/PATCH/DELETE)
 */
function airtableWriteOptions(method, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (!isDev) {
    opts.headers.Authorization = `Bearer ${AIRTABLE_TOKEN}`;
  }
  if (body) {
    opts.body = JSON.stringify(body);
  }
  return opts;
}

/**
 * Create a new Task in Airtable.
 * @param {Object} taskData – { title, type, status, priority, dueDate, description, displays, locations, assignedUserName }
 * @returns {Object|null} – The created record or null on error
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
    // Displays is a linked record field – pass an array of record IDs
    if (taskData.displays && taskData.displays.length > 0) fields['Displays'] = taskData.displays;
    // Locations is a linked record field (to Stammdaten) – pass an array of record IDs
    if (taskData.locations && taskData.locations.length > 0) fields['Locations'] = taskData.locations;
    // Assigned user name – stored as text for reference
    if (taskData.assignedUserName) fields['Responsible User'] = taskData.assignedUserName;

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${TASKS_TABLE}`;
    const response = await fetch(url, airtableWriteOptions('POST', { fields }));

    if (!response.ok) {
      const errText = await response.text();
      console.error('Airtable createTask error:', response.status, errText);
      return null;
    }

    const data = await response.json();
    // Invalidate cache
    cache.allTasks = null;
    cache.allTasksTimestamp = null;
    return data;
  } catch (err) {
    console.error('Airtable createTask error:', err);
    return null;
  }
}

/**
 * Update an existing Task in Airtable.
 * @param {string} recordId – Airtable record ID (e.g. "recXXXXXXXX")
 * @param {Object} fields – Object with field names/values to update
 * @returns {Object|null} – The updated record or null on error
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
    // Invalidate cache
    cache.allTasks = null;
    cache.allTasksTimestamp = null;
    cache.tasks.clear();
    return data;
  } catch (err) {
    console.error('Airtable updateTask error:', err);
    return null;
  }
}

/**
 * Delete a Task from Airtable.
 * @param {string} recordId – Airtable record ID
 * @returns {boolean} – true if successfully deleted
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

    // Invalidate cache
    cache.allTasks = null;
    cache.allTasksTimestamp = null;
    cache.tasks.clear();
    return true;
  } catch (err) {
    console.error('Airtable deleteTask error:', err);
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
 *  Communication Log (Activity Log) – CRUD
 * ═══════════════════════════════════════════════════════════ */

/**
 * Fetch ALL communication records from the Activity Log table.
 * Paginates through all records. Cached for 5 minutes.
 */
export async function fetchAllCommunications() {
  if (
    cache.allCommunications &&
    cache.allCommunicationsTimestamp &&
    Date.now() - cache.allCommunicationsTimestamp < 5 * 60 * 1000
  ) {
    return cache.allCommunications;
  }

  try {
    const fields = [
      'Channel',
      'Direction',
      'Subject',
      'Message',
      'Timestamp',
      'Status',
      'Recipient Name',
      'Recipient Contact',
      'Sender',
      'External ID',
      'Location',
      'Location Name (from Location)',
      'Display ID (from Location)',
      'JET ID (from Location)',
      'Related Task',
      'Attachments',
    ].map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const sort = 'sort[0][field]=Timestamp&sort[0][direction]=desc';
    let allRecords = [];
    let offset = null;
    let pageCount = 0;

    do {
      pageCount++;
      const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
      const url = `${AIRTABLE_BASE}/${BASE_ID}/${ACTIVITY_LOG_TABLE}?${fields}&${sort}&pageSize=100${offsetParam}`;
      console.log(`[fetchAllCommunications] Page ${pageCount}`);
      const response = await fetch(url, airtableFetchOptions());

      if (!response.ok) {
        const errText = await response.text();
        console.error('Airtable Communications error:', response.status, errText);
        break;
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);

    const communications = allRecords.map((r) => ({
      id: r.id,
      channel: r.fields['Channel'] || '',
      direction: r.fields['Direction'] || '',
      subject: r.fields['Subject'] || '',
      message: r.fields['Message'] || '',
      timestamp: r.fields['Timestamp'] || '',
      status: r.fields['Status'] || '',
      recipientName: r.fields['Recipient Name'] || '',
      recipientContact: r.fields['Recipient Contact'] || '',
      sender: r.fields['Sender'] || '',
      externalId: r.fields['External ID'] || '',
      locationIds: r.fields['Location'] || [],
      locationNames: r.fields['Location Name (from Location)'] || [],
      displayIds: r.fields['Display ID (from Location)'] || [],
      jetIds: r.fields['JET ID (from Location)'] || [],
      relatedTask: r.fields['Related Task'] || [],
      attachments: r.fields['Attachments'] || [],
    }));

    cache.allCommunications = communications;
    cache.allCommunicationsTimestamp = Date.now();
    return communications;
  } catch (err) {
    console.error('Airtable fetchAllCommunications error:', err);
    return [];
  }
}

/**
 * Fetch communication records for a specific Location (by Airtable record ID).
 * @param {string} locationRecordId – Airtable record ID of the Location
 */
export async function fetchCommunicationsByLocation(locationRecordId) {
  try {
    const formula = encodeURIComponent(`FIND("${locationRecordId}", ARRAYJOIN(RECORD_ID(Location), ","))`);
    const fields = [
      'Channel',
      'Direction',
      'Subject',
      'Message',
      'Timestamp',
      'Status',
      'Recipient Name',
      'Recipient Contact',
      'Sender',
      'External ID',
      'Location Name (from Location)',
      'Related Task',
      'Attachments',
    ].map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');

    const sort = 'sort[0][field]=Timestamp&sort[0][direction]=desc';
    const url = `${AIRTABLE_BASE}/${BASE_ID}/${ACTIVITY_LOG_TABLE}?filterByFormula=${formula}&${fields}&${sort}&maxRecords=100`;
    const response = await fetch(url, airtableFetchOptions());

    if (!response.ok) {
      console.error('Airtable Communications by Location error:', response.status);
      return [];
    }

    const data = await response.json();
    return (data.records || []).map((r) => ({
      id: r.id,
      channel: r.fields['Channel'] || '',
      direction: r.fields['Direction'] || '',
      subject: r.fields['Subject'] || '',
      message: r.fields['Message'] || '',
      timestamp: r.fields['Timestamp'] || '',
      status: r.fields['Status'] || '',
      recipientName: r.fields['Recipient Name'] || '',
      recipientContact: r.fields['Recipient Contact'] || '',
      sender: r.fields['Sender'] || '',
      externalId: r.fields['External ID'] || '',
      locationNames: r.fields['Location Name (from Location)'] || [],
      relatedTask: r.fields['Related Task'] || [],
      attachments: r.fields['Attachments'] || [],
    }));
  } catch (err) {
    console.error('Airtable fetchCommunicationsByLocation error:', err);
    return [];
  }
}

/**
 * Create a new Communication Log entry in Airtable.
 * @param {Object} commData – { channel, direction, subject, message, recipientName,
 *                              recipientContact, sender, status, locationIds, externalId }
 * @returns {Object|null} – The created record or null on error
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
    // Timestamp – use current time if not provided
    fields['Timestamp'] = commData.timestamp || new Date().toISOString();
    // Location is a linked record field – pass array of record IDs
    if (commData.locationIds && commData.locationIds.length > 0) {
      fields['Location'] = commData.locationIds;
    }
    // Related Task is a linked record field
    if (commData.relatedTask && commData.relatedTask.length > 0) {
      fields['Related Task'] = commData.relatedTask;
    }

    const url = `${AIRTABLE_BASE}/${BASE_ID}/${ACTIVITY_LOG_TABLE}`;
    const response = await fetch(url, airtableWriteOptions('POST', { fields }));

    if (!response.ok) {
      const errText = await response.text();
      console.error('Airtable createCommunicationRecord error:', response.status, errText);
      return null;
    }

    const data = await response.json();
    // Invalidate cache
    cache.allCommunications = null;
    cache.allCommunicationsTimestamp = null;
    return data;
  } catch (err) {
    console.error('Airtable createCommunicationRecord error:', err);
    return null;
  }
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
    cache.allCommunications = null;
    cache.allCommunicationsTimestamp = null;
  }
}
