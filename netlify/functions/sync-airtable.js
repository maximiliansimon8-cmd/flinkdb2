/**
 * Netlify Function: Full Data Sync → Supabase
 *
 * Syncs ALL data sources to Supabase (read cache):
 *   1. Airtable: Stammdaten, Tasks, Installationen, Activity Log
 *   2. Google Sheets: Display Heartbeat/Status data
 *
 * Can be triggered:
 *   - Manually via GET /api/sync (with sync-key header)
 *   - Scheduled via Netlify Scheduled Functions (every 15 min)
 *
 * Environment variables needed:
 *   - AIRTABLE_TOKEN
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SYNC_SECRET (optional, for manual trigger auth)
 */

import { logApiCall, logApiCalls, estimateAirtableCost } from './shared/apiLogger.js';

const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const STAMMDATEN_TABLE = 'tblLJ1S7OUhc2w5Jw';
const DISPLAYS_TABLE = 'tblS6cWN7uEhZHcie';   // "Live Display Locations" – the actual display records
const TASKS_TABLE = 'tblcKHWJg77mgIQ9l';
const INSTALLATIONEN_TABLE = 'tblKznpAOAMvEfX8u';
const ACTIVITY_LOG_TABLE = 'tblDk1dl4J3Ow3Qde';
const DAYN_SCREENS_TABLE = 'Dayn Screens';  // Airtable accepts table names
const OPS_INVENTORY_TABLE = 'tbl7szvfLUjsUvMkH';
const SIM_INVENTORY_TABLE = 'tblaV4UQX6hhcSDAj';
const DISPLAY_INVENTORY_TABLE = 'tblaMScl3j45Q4Dtc';
const CHG_APPROVAL_TABLE = 'tblvj4qjJpBVLbY7F';
const DEINSTALL_TABLE = 'tbltdxgzDeNz9d0ZC';
const HARDWARE_SWAP_TABLE = 'tblzFHk0HhB4bNYJ4';

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/export?format=csv&gid=0';

/**
 * Fetch all records from an Airtable table (paginated).
 */
async function fetchAllAirtable(token, tableId, fields) {
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let allRecords = [];
  let offset = null;

  do {
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&pageSize=100${offsetParam}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      console.error(`Airtable error: ${res.status}`);
      break;
    }
    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);

  return allRecords;
}

/**
 * Upsert records to Supabase via REST API (in batches of 500).
 */
async function upsertToSupabase(supabaseUrl, serviceKey, table, rows) {
  const batchSize = 500;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Supabase upsert error (${table}): ${res.status} ${errText.substring(0, 200)}`);
    } else {
      upserted += batch.length;
    }
  }

  return upserted;
}

/**
 * Remove Supabase records whose airtable_id is NOT in the given set.
 * This cleans up records that were deleted directly in Airtable.
 */
async function deleteOrphansFromSupabase(supabaseUrl, serviceKey, table, validAirtableIds) {
  if (!validAirtableIds.length) return 0;

  try {
    // Fetch all airtable_ids from Supabase
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=airtable_id`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });

    if (!res.ok) {
      console.error(`[sync] Failed to fetch ${table} airtable_ids: ${res.status}`);
      return 0;
    }

    const supabaseRows = await res.json();
    const supabaseIds = supabaseRows.map(r => r.airtable_id).filter(Boolean);
    const validSet = new Set(validAirtableIds);
    const orphanIds = supabaseIds.filter(id => !validSet.has(id));

    if (orphanIds.length === 0) return 0;

    // Delete orphans in batches
    let deleted = 0;
    const batchSize = 50;
    for (let i = 0; i < orphanIds.length; i += batchSize) {
      const batch = orphanIds.slice(i, i + batchSize);
      const idsParam = batch.map(id => `"${id}"`).join(',');
      const delRes = await fetch(
        `${supabaseUrl}/rest/v1/${table}?airtable_id=in.(${idsParam})`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          },
        }
      );
      if (delRes.ok) {
        deleted += batch.length;
      } else {
        console.error(`[sync] Delete orphans error (${table}): ${delRes.status}`);
      }
    }

    if (deleted > 0) {
      console.log(`[sync] Deleted ${deleted} orphaned records from ${table}`);
    }
    return deleted;
  } catch (err) {
    console.error(`[sync] deleteOrphans error (${table}):`, err.message);
    return 0;
  }
}

/**
 * Insert rows into Supabase (for heartbeats – append-only, no upsert).
 * Uses ON CONFLICT DO NOTHING via the Prefer header.
 */
async function insertToSupabase(supabaseUrl, serviceKey, table, rows) {
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Supabase insert error (${table}): ${res.status} ${errText.substring(0, 200)}`);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

/* ═══════════════════════════════════════════════
   MAP FUNCTIONS: Airtable → Supabase row
   ═══════════════════════════════════════════════ */

function mapStammdaten(rec) {
  const f = rec.fields;
  const jetId = Array.isArray(f['JET ID']) ? f['JET ID'][0] : (f['JET ID'] || null);
  return {
    id: rec.id, airtable_id: rec.id, jet_id: jetId,
    display_ids: Array.isArray(f['Display ID']) ? f['Display ID'] : [],
    location_name: f['Location Name'] || null,
    contact_person: f['Contact Person'] || null,
    contact_email: f['Contact Email'] || null,
    contact_phone: f['Contact Phone'] || null,
    location_email: f['Location Email'] || null,
    location_phone: f['Location Phone'] || null,
    legal_entity: f['Legal Entity'] || null,
    street: f['Street'] || null,
    street_number: f['Street Number'] || null,
    postal_code: f['Postal Code'] || null,
    city: f['City'] || null,
    lead_status: Array.isArray(f['Lead Status  (from Akquise)']) ? f['Lead Status  (from Akquise)'] : [],
    display_status: f['Status'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapDisplay(rec) {
  const f = rec.fields;
  // Helper: get first value from lookup array or scalar
  const first = (field) => {
    const v = f[field];
    return Array.isArray(v) ? (v[0] || null) : (v || null);
  };
  return {
    id: rec.id,
    airtable_id: rec.id,
    display_id: f['Display ID'] || null,
    display_table_id: f['Display Table ID'] || null,
    display_name: f['display_name'] || null,
    online_status: f['Online Status '] || null,         // Note: trailing space in Airtable field name!
    live_since: f['Live since'] || null,
    deinstall_date: f['deinstall_date'] || null,
    screen_type: f['Screen Type'] || null,
    screen_size: f['Screen Size '] || null,              // Note: trailing space!
    navori_venue_id: first('Navori Venue ID (from Installationen)'),
    location_name: first('Location Name'),
    city: first('City'),
    street: first('Street'),
    street_number: first('Street Number'),
    postal_code: first('Postal Code'),
    jet_id: first('JET ID (from JET ID)'),
    sov_partner_ad: f['SoV Partner Ad'] || null,
    created_at: f['Created'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapTask(rec) {
  const f = rec.fields;
  const assigned = Array.isArray(f['Assigned'])
    ? f['Assigned'].map(a => typeof a === 'object' ? a.name : a).filter(Boolean)
    : [];
  return {
    id: rec.id, airtable_id: rec.id,
    title: f['Task Title'] || null,
    // Partner: prefer lookup field "Company (from Partner)", fallback to legacy Task Type
    task_type: f['Company (from Partner)'] || f['Partner'] || f['Task Type'] || [],
    task_type_select: Array.isArray(f['Task Type']) ? f['Task Type'] : (f['Task Type'] ? [f['Task Type']] : []),
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
    completed_by: f['completed_task_by']?.name || f['completed_task_by'] || null,
    // New fields from lookups
    online_status: f['Online Status  (from Displays )'] || [],
    live_since: f['Live since (from Displays )'] || [],
    installation_status: f['Status Installation (from Installation)'] || [],
    integrator: f['Integrator (from Installation)'] || [],
    install_date: f['Aufbau Datum (from Installation)'] || [],
    display_serial_number: f['Display Serial Number (from Installation)'] || [],
    install_remarks: f['Allgemeine Bemerkungen (from Installation)'] || [],
    install_type: f['Installationsart (from Installation)'] || [],
    external_visibility: f['external_visiblity'] || false,
    nacharbeit_kommentar: f['Kommentar Nacharbeit'] || null,
    superchat: f['Superchat'] || false,
    status_changed_by: f['Status changed by']?.name || f['Status changed by'] || null,
    status_changed_date: f['Status changed date'] || null,
    jet_ids: f['JET ID (from Locations)'] || [],
    cities: f['City (from Locations)'] || [],
    attachments: Array.isArray(f['Attachments'])
      ? f['Attachments'].map(att => ({
          url: att.url || '',
          filename: att.filename || '',
          size: att.size || 0,
          type: att.type || '',
          id: att.id || '',
          thumbnails: att.thumbnails || null,
        }))
      : [],
    updated_at: new Date().toISOString(),
  };
}

function mapAcquisition(rec) {
  const f = rec.fields;
  const lookupFirst = (field) => Array.isArray(f[field]) ? f[field][0] || null : (f[field] || null);
  const lookupArray = (field) => Array.isArray(f[field]) ? f[field].filter(Boolean) : [];
  return {
    id: rec.id, airtable_id: rec.id,
    akquise_id: f['Akquise ID'] || null,
    lead_status: f['Lead_Status'] || null,
    frequency_approval: f['frequency_approval (previous FAW Check)'] || null,
    install_approval: f['install_approval'] || null,
    approval_status: f['approval_status'] || null,
    acquisition_date: f['Acquisition Date'] || null,
    installations_status: lookupArray('Installations Status'),
    display_location_status: lookupArray('Display Location Status'),
    city: lookupArray('City'),
    location_name: lookupFirst('Location Name_new'),
    street: lookupFirst('Street'),
    street_number: lookupFirst('Street Number'),
    postal_code: lookupFirst('Postal Code'),
    jet_id: lookupFirst('JET_ID'),
    contact_person: lookupFirst('Contact Person'),
    contact_email: lookupFirst('Contact Email'),
    contact_phone: lookupFirst('Contact Phone'),
    acquisition_partner: lookupFirst('Akquisition Partner Name (from Team)'),
    dvac_week: f['# dVAC / Woche 100% SoV'] || null,
    schaufenster: f['Schaufenster einsehbar'] || null,
    hindernisse: f['Hindernisse vorhanden'] || null,
    mount_type: f['Mount Type'] || null,
    submitted_by: f['Submitted By'] || null,
    submitted_at: f['Submitted At'] || null,
    vertrag_vorhanden: f['Vertrag PDF vorhanden'] || null,
    akquise_storno: f['Akquise Storno'] || false,
    post_install_storno: f['Post‑Install Storno'] || false,
    post_install_storno_grund: Array.isArray(f['Post‑Install Storno Grund']) ? f['Post‑Install Storno Grund'] : [],
    ready_for_installation: f['ready_for_installation'] || false,
    created_at: f['Created'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapDaynScreen(rec) {
  const f = rec.fields;
  const zipVal = f['zip_code'];
  const zip = (zipVal && typeof zipVal === 'object') ? zipVal.value : (zipVal || null);
  const streetVal = f['Street with Number'];
  const street = (streetVal && typeof streetVal === 'object') ? streetVal.value : (streetVal || null);
  return {
    id: rec.id,
    airtable_id: rec.id,
    dayn_screen_id: f['Dayn_Screen_ID'] || null,
    do_screen_id: f['DO_Screen_ID'] || null,
    screen_status: f['Screen Status'] || null,
    network: 'dayn',
    location_name: f['location_name'] || null,
    address: street || f['address'] || null,
    city: f['city'] || null,
    region: f['region'] || null,
    country: f['country'] || 'GER',
    zip_code: zip,
    venue_type: f['venue type'] || null,
    floor_cpm: f['floor CPM'] != null ? Number(f['floor CPM']) : null,
    screen_width_px: f['screen width (px)'] != null ? Number(f['screen width (px)']) : null,
    screen_height_px: f['screen height (px)'] != null ? Number(f['screen height (px)']) : null,
    latitude: f['latitude'] != null ? Number(f['latitude']) : null,
    longitude: f['longitude'] != null ? Number(f['longitude']) : null,
    screen_inch: f['Screen_Inch'] || null,
    screen_type: f['Screen_Type'] || null,
    max_video_length: f['Maximun video spot lenth (seconds)'] || null,
    min_video_length: f['Minimum video spot lenth (seconds)'] || null,
    static_duration: f['static duration (in seconds)'] || null,
    static_supported: f['static_supported (can your screens run images JPG/PNG)'] === 'TRUE' ? true : f['static_supported (can your screens run images JPG/PNG)'] === 'FALSE' ? false : null,
    video_supported: f['video_supported (can your screens run video?)'] === 'TRUE' ? true : f['video_supported (can your screens run video?)'] === 'FALSE' ? false : null,
    dvac_week: f['# dVAC / Woche 100% SoV'] != null ? Number(f['# dVAC / Woche 100% SoV']) : null,
    dvac_month: f['dVAC / Month'] != null ? Number(f['dVAC / Month']) : null,
    dvac_day: f['dVAC per Day'] != null ? Number(f['dVAC per Day']) : null,
    impressions_per_spot: f['Impressions per Spot'] != null ? Number(f['Impressions per Spot']) : null,
    install_year: f['install_year'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapInstallation(rec) {
  const f = rec.fields;
  const integrator = Array.isArray(f['Company (from Integrator)'])
    ? f['Company (from Integrator)'].join(', ')
    : (f['Company (from Integrator)'] || null);
  const technicians = Array.isArray(f['Name (from Technikers)'])
    ? f['Name (from Technikers)'] : [];
  const protocol = Array.isArray(f['Installationsprotokoll']) && f['Installationsprotokoll'][0]
    ? f['Installationsprotokoll'][0] : null;
  const displayIds = Array.isArray(f['Display Table ID (from Link to Display ID )'])
    ? f['Display Table ID (from Link to Display ID )'] : [];
  return {
    id: rec.id, airtable_id: rec.id,
    display_ids: displayIds,
    install_date: f['Aufbau Datum'] || null,
    status: f['Status Installation'] || null,
    installation_type: f['Installationsart'] || null,
    integrator, technicians,
    protocol_url: protocol?.url || null,
    protocol_filename: protocol?.filename || null,
    screen_type: f['Screen Art'] || null,
    screen_size: f['Screen Size'] || null,
    ops_nr: f['OPS Nr'] || null,
    sim_id: f['SIM-ID'] || null,
    install_start: f['Installationsstart'] || null,
    install_end: f['Installationsabschluss'] || null,
    remarks: f['Allgemeine Bemerkungen'] || null,
    partner_name: f['Abnahme Partner (Name)'] || null,
    updated_at: new Date().toISOString(),
  };
}

// ─── Hardware Inventory Mapping Functions ───

function mapOpsInventory(rec) {
  const f = rec.fields;
  const simIds = Array.isArray(f['SimID (from SimID)']) ? f['SimID (from SimID)'] : [];
  const displaySns = Array.isArray(f['display_serial_number (from display_inventory)'])
    ? f['display_serial_number (from display_inventory)'] : [];
  const onlineStatus = Array.isArray(f['Online Status  (from Live Display Locations)'])
    ? f['Online Status  (from Live Display Locations)'] : [];
  const simRecords = Array.isArray(f['SimID']) ? f['SimID'] : [];
  const displayRecords = Array.isArray(f['display_inventory']) ? f['display_inventory'] : [];
  const locationRecords = Array.isArray(f['Live Display Locations']) ? f['Live Display Locations'] : [];
  const partnerRecords = Array.isArray(f['Partner']) ? f['Partner'] : [];
  return {
    id: rec.id,
    ops_nr: f['OpsNr.'] || null,
    status: f['status'] || null,
    ops_sn: f['OPS-SN'] || null,
    hardware_type: f['ops_hardware_type'] || null,
    navori_venue_id: f['navori_venueID'] || null,
    sim_record_id: simRecords[0] || null,
    sim_id: simIds[0] || null,
    display_record_id: displayRecords[0] || null,
    display_sn: displaySns[0] || null,
    display_location_id: locationRecords[0] || null,
    location_online_status: onlineStatus[0] || null,
    partner_id: partnerRecords[0] || null,
    note: f['note'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapSimInventory(rec) {
  const f = rec.fields;
  const opsRecords = Array.isArray(f['OPS_Player_inventory 2']) ? f['OPS_Player_inventory 2'] : [];
  return {
    id: rec.id,
    sim_id: f['SimID'] ? String(f['SimID']) : null,
    activate_date: f['activate_date'] || null,
    ops_record_id: opsRecords[0] || null,
    status: f['status'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapDisplayInventory(rec) {
  const f = rec.fields;
  const opsRecords = Array.isArray(f['OPS_Player_inventory']) ? f['OPS_Player_inventory'] : [];
  return {
    id: rec.id,
    display_serial_number: f['display_serial_number'] ? String(f['display_serial_number']) : null,
    location: f['location'] || null,
    ops_record_id: opsRecords[0] || null,
    status: f['status'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapChgApproval(rec) {
  const f = rec.fields;
  const installRecords = Array.isArray(f['Installation']) ? f['Installation'] : [];
  const inspectionStatus = Array.isArray(f['Inspection Status']) ? f['Inspection Status'] : [];
  const displayIds = Array.isArray(f['DisplayID']) ? f['DisplayID'] : [];
  const locationNames = Array.isArray(f['Location Name']) ? f['Location Name'] : [];
  const cities = Array.isArray(f['City']) ? f['City'] : [];
  const addresses = Array.isArray(f['Address']) ? f['Address'] : [];
  return {
    id: rec.id,
    jet_id_location: f['JET ID Location'] || null,
    asset_id: f['Asset ID'] || null,
    display_sn: f['Display SN'] || null,
    integrator_invoice_no: f['Integrator Invoice No'] || null,
    chg_certificate: f['Installation certificate at the bank (CHG)'] || null,
    invoice_date: f['Invoice date'] || null,
    rental_start: f['Rental start date at the bank'] || null,
    rental_end: f['Rental end date at the bank'] || null,
    payment_released_on: f['Payment released on'] || null,
    payment_released_by: f['Payment released by'] || null,
    status: f['Status'] || null,
    installation_id: installRecords[0] || null,
    inspection_status: inspectionStatus,
    display_id: displayIds,
    location_name: locationNames,
    city: cities,
    address: addresses,
    created_at: f['created'] || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapHardwareSwap(rec) {
  const f = rec.fields;
  const locationRecords = Array.isArray(f['Live Display Location']) ? f['Live Display Location'] : [];
  const swapType = Array.isArray(f['Tausch-Typ']) ? f['Tausch-Typ'] : (f['Tausch-Typ'] ? [f['Tausch-Typ']] : []);
  const oldHw = Array.isArray(f['ALTE Hardware']) ? f['ALTE Hardware'] : [];
  const newHw = Array.isArray(f['NEUE Hardware']) ? f['NEUE Hardware'] : [];
  const partnerRecords = Array.isArray(f['Partner']) ? f['Partner'] : [];
  const locationNames = Array.isArray(f['Location Name (from Live Display Location)'])
    ? f['Location Name (from Live Display Location)'] : [];
  const cities = Array.isArray(f['City (from Live Display Location)'])
    ? f['City (from Live Display Location)'] : [];
  return {
    id: rec.id,
    swap_id: f['Tausch-ID'] ? String(f['Tausch-ID']) : null,
    display_location_id: locationRecords[0] || null,
    swap_type: swapType,
    swap_date: f['Tausch-Datum'] || null,
    swap_reason: f['Tausch-Grund'] || null,
    partner_id: partnerRecords[0] || null,
    technician: f['Techniker'] || null,
    old_hardware_ids: oldHw,
    new_hardware_ids: newHw,
    defect_description: f['Defekt-Beschreibung'] || null,
    status: f['Status'] || null,
    location_name: locationNames[0] || null,
    city: cities[0] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapDeinstall(rec) {
  const f = rec.fields;
  const locationRecords = Array.isArray(f['Live Display Location']) ? f['Live Display Location'] : [];
  const opsRecords = Array.isArray(f['OPS-Nr / Hardware-Set']) ? f['OPS-Nr / Hardware-Set'] : [];
  const partnerRecords = Array.isArray(f['Partner']) ? f['Partner'] : [];
  const locationNames = Array.isArray(f['Location Name (from Live Display Location)'])
    ? f['Location Name (from Live Display Location)'] : [];
  const cities = Array.isArray(f['City (from Live Display Location)'])
    ? f['City (from Live Display Location)'] : [];
  return {
    id: rec.id,
    deinstall_id: f['Deinstallations-ID'] ? String(f['Deinstallations-ID']) : null,
    display_location_id: locationRecords[0] || null,
    ops_record_id: opsRecords[0] || null,
    deinstall_date: f['Deinstallationsdatum'] || null,
    reason: f['Grund'] || null,
    partner_id: partnerRecords[0] || null,
    technician: f['Techniker'] || null,
    hardware_condition: f['Hardware-Zustand'] || null,
    condition_description: f['Zustandsbeschreibung'] || null,
    status: f['Status'] || null,
    location_name: locationNames[0] || null,
    city: cities[0] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapCommunication(rec) {
  const f = rec.fields;
  return {
    id: rec.id, airtable_id: rec.id,
    channel: f['Channel'] || null,
    direction: f['Direction'] || null,
    subject: f['Subject'] || null,
    message: f['Message'] || null,
    timestamp: f['Timestamp'] || null,
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
  };
}

/* ═══════════════════════════════════════════════
   DATE PARSER: German DD.MM.YYYY HH:MM → ISO 8601
   ═══════════════════════════════════════════════ */

function parseGermanDateToISO(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  // DD.MM.YYYY HH:MM
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, d, m, y, h, min] = match;
    const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +min));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  // DD.MM.YYYY (no time)
  const matchDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (matchDate) {
    const [, d, m, y] = matchDate;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  // ISO 8601
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}T/)) {
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/* ═══════════════════════════════════════════════
   CSV PARSER (simple, no external deps)
   ═══════════════════════════════════════════════ */

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += line[i];
    }
  }
  result.push(current.trim());
  return result;
}

/* ═══════════════════════════════════════════════
   MAIN HANDLER
   ═══════════════════════════════════════════════ */

export default async (request) => {
  const startTime = Date.now();

  // Auth check for manual trigger
  const syncSecret = process.env.SYNC_SECRET;
  if (syncSecret) {
    const providedKey = request.headers.get('x-sync-key') ||
      new URL(request.url).searchParams.get('key');
    if (providedKey !== syncSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!AIRTABLE_TOKEN || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = {};

  try {
    // ═══ 1. GOOGLE SHEETS → display_heartbeats ═══
    console.log('[sync] Fetching Google Sheets CSV...');
    try {
      const csvRes = await fetch(SHEET_CSV_URL, {
        headers: { 'User-Agent': 'JET-Dashboard-Sync/1.0' },
      });
      if (csvRes.ok) {
        const csvText = await csvRes.text();
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const colIdx = {};
        headers.forEach((h, i) => { colIdx[h] = i; });

        const heartbeatRows = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = parseCSVLine(line);
          const displayId = cols[colIdx['Display ID']] || '';
          const timestamp = cols[colIdx['Timestamp']] || '';
          if (!displayId || !timestamp) continue;

          const slashIdx = displayId.indexOf('/');
          const stableId = slashIdx >= 0 ? displayId.substring(0, slashIdx).trim() : displayId.trim();

          heartbeatRows.push({
            timestamp: timestamp || null,
            timestamp_parsed: parseGermanDateToISO(timestamp),
            display_id: stableId,
            raw_display_id: displayId,
            location_name: cols[colIdx['Location Name']] || null,
            serial_number: cols[colIdx['Serial Number']] || null,
            registration_date: cols[colIdx['Date']] || null,
            heartbeat: cols[colIdx['Status']] || null,
            is_alive: cols[colIdx['Is Alive']] || null,
            display_status: cols[colIdx['Display Status']] || null,
            last_online_date: cols[colIdx['Last Online Date']] || null,
            days_offline: cols[colIdx['Days Offline']] ? parseInt(cols[colIdx['Days Offline']]) || null : null,
          });
        }

        results.heartbeats = {
          fetched: heartbeatRows.length,
          inserted: await insertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'display_heartbeats', heartbeatRows),
        };
        console.log(`[sync] Heartbeats: ${results.heartbeats.fetched} fetched, ${results.heartbeats.inserted} inserted`);
      } else {
        console.error(`[sync] Google Sheets error: ${csvRes.status}`);
        results.heartbeats = { error: `HTTP ${csvRes.status}` };
      }
    } catch (sheetErr) {
      console.error('[sync] Sheets error:', sheetErr.message);
      results.heartbeats = { error: sheetErr.message };
    }

    // ═══ 2. AIRTABLE: Stammdaten ═══
    console.log('[sync] Fetching Stammdaten...');
    const stammdatenRecords = await fetchAllAirtable(AIRTABLE_TOKEN, STAMMDATEN_TABLE, [
      'JET ID', 'Display ID', 'Location Name', 'Contact Person',
      'Contact Email', 'Contact Phone', 'Location Email', 'Location Phone',
      'Legal Entity', 'Street', 'Street Number', 'Postal Code', 'City',
      'Lead Status  (from Akquise)', 'Status'
    ]);
    const stammdatenRows = stammdatenRecords.map(mapStammdaten);
    results.stammdaten = {
      fetched: stammdatenRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'stammdaten', stammdatenRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'stammdaten', stammdatenRecords.map(r => r.id)),
    };
    console.log(`[sync] Stammdaten: ${results.stammdaten.fetched} → ${results.stammdaten.upserted} upserted, ${results.stammdaten.deleted} orphans deleted`);

    // ═══ 2b. AIRTABLE: Live Display Locations (Displays) ═══
    console.log('[sync] Fetching Live Display Locations...');
    const displayRecords = await fetchAllAirtable(AIRTABLE_TOKEN, DISPLAYS_TABLE, [
      'Display ID', 'Display Table ID', 'display_name', 'Online Status ',
      'Live since', 'deinstall_date', 'Screen Type', 'Screen Size ',
      'Navori Venue ID (from Installationen)',
      'Location Name', 'City', 'Street', 'Street Number', 'Postal Code',
      'JET ID (from JET ID)', 'SoV Partner Ad',
    ]);
    const displayRows = displayRecords.map(mapDisplay);
    results.displays = {
      fetched: displayRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'airtable_displays', displayRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'airtable_displays', displayRecords.map(r => r.id)),
    };
    console.log(`[sync] Displays: ${results.displays.fetched} → ${results.displays.upserted} upserted, ${results.displays.deleted} orphans deleted`);

    // ═══ 3. AIRTABLE: Tasks (with expanded lookup fields) ═══
    console.log('[sync] Fetching Tasks...');
    const taskRecords = await fetchAllAirtable(AIRTABLE_TOKEN, TASKS_TABLE, [
      'Task Title', 'Task Type', 'Partner', 'Company (from Partner)', 'Status', 'Priority', 'Due Date',
      'Description', 'Created time', 'Responsible User', 'Assigned',
      'Created by', 'Display ID (from Displays )', 'Location Name (from Locations)',
      'Overdue', 'completed_task_date', 'completed_task_by', 'Attachments',
      // New: display & installation lookups
      'Online Status  (from Displays )', 'Live since (from Displays )',
      'Status Installation (from Installation)', 'Integrator (from Installation)',
      'Aufbau Datum (from Installation)', 'Display Serial Number (from Installation)',
      'Allgemeine Bemerkungen (from Installation)', 'Installationsart (from Installation)',
      // New: task meta
      'external_visiblity', 'Kommentar Nacharbeit', 'Superchat',
      'Status changed by', 'Status changed date',
      'JET ID (from Locations)', 'City (from Locations)',
    ]);
    const taskRows = taskRecords.map(mapTask);
    results.tasks = {
      fetched: taskRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'tasks', taskRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'tasks', taskRecords.map(r => r.id)),
    };
    console.log(`[sync] Tasks: ${results.tasks.fetched} → ${results.tasks.upserted} upserted, ${results.tasks.deleted} orphans deleted`);

    // ═══ 3b. AIRTABLE: Acquisition_DB ═══
    console.log('[sync] Fetching Acquisition_DB...');
    const acqRecords = await fetchAllAirtable(AIRTABLE_TOKEN, 'tblqFMBAeKQ1NbSI8', [
      'Akquise ID', 'Lead_Status', 'frequency_approval (previous FAW Check)',
      'install_approval', 'approval_status', 'Acquisition Date',
      'Installations Status', 'Display Location Status',
      'City', 'Location Name_new', 'Street', 'Street Number', 'Postal Code',
      'JET_ID', 'Contact Person', 'Contact Email', 'Contact Phone',
      'Akquisition Partner Name (from Team)',
      '# dVAC / Woche 100% SoV', 'Schaufenster einsehbar', 'Hindernisse vorhanden',
      'Mount Type', 'Submitted By', 'Submitted At',
      'Vertrag PDF vorhanden', 'Akquise Storno',
      'Post\u2011Install Storno', 'Post\u2011Install Storno Grund',
      'ready_for_installation',
    ]);
    const acqRows = acqRecords.map(mapAcquisition);
    results.acquisition = {
      fetched: acqRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'acquisition', acqRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'acquisition', acqRecords.map(r => r.id)),
    };
    console.log(`[sync] Acquisition: ${results.acquisition.fetched} → ${results.acquisition.upserted} upserted, ${results.acquisition.deleted} orphans deleted`);

    // ═══ 3b. AIRTABLE: Dayn Screens ═══
    console.log('[sync] Fetching Dayn Screens...');
    const daynRecords = await fetchAllAirtable(AIRTABLE_TOKEN, DAYN_SCREENS_TABLE, [
      'Dayn_Screen_ID', 'DO_Screen_ID', 'Screen Status', 'location_name',
      'address', 'city', 'region', 'country', 'zip_code', 'venue type',
      'floor CPM', 'screen width (px)', 'screen height (px)',
      'latitude', 'longitude', 'Screen_Inch', 'Screen_Type',
      'install_year', 'Street with Number',
      '# dVAC / Woche 100% SoV', 'dVAC / Month', 'dVAC per Day',
      'Impressions per Spot',
      'Maximun video spot lenth (seconds)', 'Minimum video spot lenth (seconds)',
      'static duration (in seconds)',
      'static_supported (can your screens run images JPG/PNG)',
      'video_supported (can your screens run video?)',
    ]);
    const daynRows = daynRecords.map(mapDaynScreen);
    results.dayn_screens = {
      fetched: daynRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'dayn_screens', daynRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'dayn_screens', daynRecords.map(r => r.id)),
    };
    console.log(`[sync] Dayn Screens: ${results.dayn_screens.fetched} → ${results.dayn_screens.upserted} upserted, ${results.dayn_screens.deleted} orphans deleted`);

    // ═══ 4. AIRTABLE: Installationen ═══
    console.log('[sync] Fetching Installationen...');
    const installRecords = await fetchAllAirtable(AIRTABLE_TOKEN, INSTALLATIONEN_TABLE, [
      'Aufbau Datum', 'Status Installation', 'Installationsart',
      'Company (from Integrator)', 'Name (from Technikers)',
      'Installationsprotokoll', 'Screen Art', 'Screen Size',
      'OPS Nr', 'SIM-ID', 'Installationsstart', 'Installationsabschluss',
      'Allgemeine Bemerkungen', 'Abnahme Partner (Name)',
      'Display Table ID (from Link to Display ID )'
    ]);
    const installRows = installRecords.map(mapInstallation);
    results.installationen = {
      fetched: installRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'installationen', installRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'installationen', installRecords.map(r => r.id)),
    };
    console.log(`[sync] Installationen: ${results.installationen.fetched} → ${results.installationen.upserted} upserted, ${results.installationen.deleted} orphans deleted`);

    // ═══ 5. HARDWARE: OPS Player Inventory ═══
    console.log('[sync] Fetching OPS Player Inventory...');
    const opsRecords = await fetchAllAirtable(AIRTABLE_TOKEN, OPS_INVENTORY_TABLE, [
      'OpsNr.', 'status', 'OPS-SN', 'ops_hardware_type', 'navori_venueID',
      'SimID', 'SimID (from SimID)', 'display_inventory',
      'display_serial_number (from display_inventory)',
      'Live Display Locations', 'Online Status  (from Live Display Locations)',
      'Partner', 'note',
    ]);
    const opsRows = opsRecords.map(mapOpsInventory);
    results.hardware_ops = {
      fetched: opsRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_ops', opsRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_ops', opsRecords.map(r => r.id)),
    };
    console.log(`[sync] OPS Inventory: ${results.hardware_ops.fetched} → ${results.hardware_ops.upserted} upserted, ${results.hardware_ops.deleted} orphans deleted`);

    // ═══ 6. HARDWARE: SIM Card Inventory ═══
    console.log('[sync] Fetching SIM Card Inventory...');
    const simRecords = await fetchAllAirtable(AIRTABLE_TOKEN, SIM_INVENTORY_TABLE, [
      'SimID', 'activate_date', 'OPS_Player_inventory 2',
    ]);
    const simRows = simRecords.map(mapSimInventory);
    results.hardware_sim = {
      fetched: simRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_sim', simRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_sim', simRecords.map(r => r.id)),
    };
    console.log(`[sync] SIM Inventory: ${results.hardware_sim.fetched} → ${results.hardware_sim.upserted} upserted, ${results.hardware_sim.deleted} orphans deleted`);

    // ═══ 7. HARDWARE: Display Inventory ═══
    console.log('[sync] Fetching Display Inventory...');
    const dispInvRecords = await fetchAllAirtable(AIRTABLE_TOKEN, DISPLAY_INVENTORY_TABLE, [
      'display_serial_number', 'location', 'OPS_Player_inventory',
    ]);
    const dispInvRows = dispInvRecords.map(mapDisplayInventory);
    results.hardware_displays = {
      fetched: dispInvRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_displays', dispInvRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_displays', dispInvRecords.map(r => r.id)),
    };
    console.log(`[sync] Display Inventory: ${results.hardware_displays.fetched} → ${results.hardware_displays.upserted} upserted, ${results.hardware_displays.deleted} orphans deleted`);

    // ═══ 8. HARDWARE: CHG Approval (Leasing) ═══
    console.log('[sync] Fetching CHG Approval...');
    const chgRecords = await fetchAllAirtable(AIRTABLE_TOKEN, CHG_APPROVAL_TABLE, [
      'JET ID Location', 'Asset ID', 'Display SN', 'Integrator Invoice No',
      'Installation certificate at the bank (CHG)', 'Invoice date',
      'Rental start date at the bank', 'Rental end date at the bank',
      'Payment released on', 'Payment released by', 'Status',
      'Installation', 'Inspection Status', 'DisplayID',
      'Location Name', 'City', 'Address', 'created',
    ]);
    const chgRows = chgRecords.map(mapChgApproval);
    results.chg_approvals = {
      fetched: chgRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'chg_approvals', chgRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'chg_approvals', chgRecords.map(r => r.id)),
    };
    console.log(`[sync] CHG Approval: ${results.chg_approvals.fetched} → ${results.chg_approvals.upserted} upserted, ${results.chg_approvals.deleted} orphans deleted`);

    // ═══ 9. HARDWARE: Hardware Swaps ═══
    console.log('[sync] Fetching Hardware Swaps...');
    try {
      const swapRecords = await fetchAllAirtable(AIRTABLE_TOKEN, HARDWARE_SWAP_TABLE, [
        'Tausch-ID', 'Live Display Location', 'Tausch-Typ', 'Tausch-Datum',
        'Tausch-Grund', 'Partner', 'Techniker', 'ALTE Hardware', 'NEUE Hardware',
        'Defekt-Beschreibung', 'Status',
        'Location Name (from Live Display Location)',
        'City (from Live Display Location)',
      ]);
      const swapRows = swapRecords.map(mapHardwareSwap);
      results.hardware_swaps = {
        fetched: swapRecords.length,
        upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_swaps', swapRows),
        deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_swaps', swapRecords.map(r => r.id)),
      };
      console.log(`[sync] Hardware Swaps: ${results.hardware_swaps.fetched} → ${results.hardware_swaps.upserted} upserted`);
    } catch (e) {
      console.warn('[sync] Hardware Swaps table not ready yet:', e.message);
      results.hardware_swaps = { fetched: 0, upserted: 0, error: e.message };
    }

    // ═══ 10. HARDWARE: Deinstallationen ═══
    console.log('[sync] Fetching Deinstallationen...');
    try {
      const deinstRecords = await fetchAllAirtable(AIRTABLE_TOKEN, DEINSTALL_TABLE, [
        'Deinstallations-ID', 'Live Display Location', 'OPS-Nr / Hardware-Set',
        'Deinstallationsdatum', 'Grund', 'Partner', 'Techniker',
        'Hardware-Zustand', 'Zustandsbeschreibung', 'Status',
        'Location Name (from Live Display Location)',
        'City (from Live Display Location)',
      ]);
      const deinstRows = deinstRecords.map(mapDeinstall);
      results.hardware_deinstalls = {
        fetched: deinstRecords.length,
        upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_deinstalls', deinstRows),
        deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_deinstalls', deinstRecords.map(r => r.id)),
      };
      console.log(`[sync] Deinstallationen: ${results.hardware_deinstalls.fetched} → ${results.hardware_deinstalls.upserted} upserted`);
    } catch (e) {
      console.warn('[sync] Deinstallationen table not ready yet:', e.message);
      results.hardware_deinstalls = { fetched: 0, upserted: 0, error: e.message };
    }

    // ═══ 11. AIRTABLE: Activity Log / Communications ═══
    console.log('[sync] Fetching Activity Log...');
    const commRecords = await fetchAllAirtable(AIRTABLE_TOKEN, ACTIVITY_LOG_TABLE, [
      'Channel', 'Direction', 'Subject', 'Message', 'Timestamp',
      'Status', 'Recipient Name', 'Recipient Contact', 'Sender',
      'External ID', 'Location', 'Location Name (from Location)',
      'Display ID (from Location)', 'JET ID (from Location)',
      'Related Task',
    ]);
    const commRows = commRecords.map(mapCommunication);
    results.communications = {
      fetched: commRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'communications', commRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'communications', commRecords.map(r => r.id)),
    };
    console.log(`[sync] Communications: ${results.communications.fetched} → ${results.communications.upserted} upserted, ${results.communications.deleted} orphans deleted`);

    const durationMs = Date.now() - startTime;
    console.log(`[sync] Complete in ${(durationMs / 1000).toFixed(1)}s`);

    // Summarize totals for API usage logging
    const tableKeys = Object.keys(results);
    const totalFetched = tableKeys.reduce((sum, k) => sum + (results[k]?.fetched || 0), 0);
    const totalUpserted = tableKeys.reduce((sum, k) => sum + (results[k]?.upserted || results[k]?.inserted || 0), 0);

    logApiCall({
      functionName: 'sync-airtable',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-all',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalFetched,
      estimatedCostCents: estimateAirtableCost(totalFetched),
      metadata: { tablesProcessed: tableKeys.length, totalRecords: totalFetched },
    });

    logApiCall({
      functionName: 'sync-airtable',
      service: 'supabase',
      method: 'POST',
      endpoint: '/upsert-all',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalUpserted,
    });

    return new Response(JSON.stringify({
      success: true,
      duration_ms: durationMs,
      results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sync] Error:', err);

    logApiCall({
      functionName: 'sync-airtable',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-all',
      durationMs: Date.now() - startTime,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      results,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Netlify Scheduled Function config
// Runs every 2 hours (saves credits; manual sync via trigger-sync.js button)
export const config = {
  schedule: '0 */2 * * *',
};
