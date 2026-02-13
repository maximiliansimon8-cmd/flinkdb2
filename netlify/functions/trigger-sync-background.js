/**
 * Netlify Function: Manual Sync Trigger
 *
 * A lightweight HTTP-callable function that runs the same sync logic
 * as sync-airtable.js (which is a scheduled function and can't be called via HTTP).
 *
 * Usage: GET /api/trigger-sync
 */

import { logApiCall, logApiCalls, estimateAirtableCost } from './shared/apiLogger.js';
import {
  AIRTABLE_BASE, TABLES, FETCH_FIELDS, SHEET_CSV_URL,
} from './shared/airtableFields.js';

// Local aliases for backward compat
const STAMMDATEN_TABLE = TABLES.STAMMDATEN;
const DISPLAYS_TABLE = TABLES.DISPLAYS;
const DAYN_SCREENS_TABLE = TABLES.DAYN_SCREENS;
const TASKS_TABLE = TABLES.TASKS;
const INSTALLATIONEN_TABLE = TABLES.INSTALLATIONEN;
const ACTIVITY_LOG_TABLE = TABLES.ACTIVITY_LOG;
const OPS_INVENTORY_TABLE = TABLES.OPS_INVENTORY;
const SIM_INVENTORY_TABLE = TABLES.SIM_INVENTORY;
const DISPLAY_INVENTORY_TABLE = TABLES.DISPLAY_INVENTORY;
const CHG_APPROVAL_TABLE = TABLES.CHG_APPROVAL;
const DEINSTALL_TABLE = TABLES.DEINSTALL;
const HARDWARE_SWAP_TABLE = TABLES.HARDWARE_SWAP;

async function fetchAllAirtable(token, tableId, fields) {
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let allRecords = [];
  let offset = null;
  let retryCount = 0;
  do {
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&pageSize=100${offsetParam}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    // Handle Airtable rate limiting (429) with exponential backoff
    if (res.status === 429) {
      retryCount++;
      const waitMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
      console.warn(`[trigger-sync] Rate limited on ${tableId}, waiting ${waitMs}ms (retry ${retryCount})...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue; // retry same page
    }
    // Reset retry count on successful request
    retryCount = 0;
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Airtable error for table ${tableId}: ${res.status} ${errText.substring(0, 300)}`);
      throw new Error(`Airtable ${tableId}: ${res.status} — ${errText.substring(0, 200)}`);
    }
    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  return allRecords;
}

async function deleteOrphansFromSupabase(supabaseUrl, serviceKey, table, validAirtableIds, idColumn = 'airtable_id') {
  if (!validAirtableIds.length) return 0;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${idColumn}`, {
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
    });
    if (!res.ok) return 0;
    const supabaseRows = await res.json();
    const supabaseIds = supabaseRows.map(r => r[idColumn]).filter(Boolean);
    const validSet = new Set(validAirtableIds);
    const orphanIds = supabaseIds.filter(id => !validSet.has(id));
    if (orphanIds.length === 0) return 0;
    let deleted = 0;
    const batchSize = 50;
    for (let i = 0; i < orphanIds.length; i += batchSize) {
      const batch = orphanIds.slice(i, i + batchSize);
      const idsParam = batch.map(id => `"${id}"`).join(',');
      const delRes = await fetch(`${supabaseUrl}/rest/v1/${table}?${idColumn}=in.(${idsParam})`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
      });
      if (delRes.ok) deleted += batch.length;
    }
    return deleted;
  } catch (err) {
    console.error(`[trigger-sync] deleteOrphans error (${table}):`, err.message);
    return 0;
  }
}

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

function mapDisplay(rec) {
  const f = rec.fields;
  const first = (field) => {
    const v = f[field];
    return Array.isArray(v) ? (v[0] || null) : (v || null);
  };
  return {
    id: rec.id, airtable_id: rec.id,
    display_id: f['Display ID'] || null,
    display_table_id: f['Display Table ID'] || null,
    display_name: f['display_name'] || null,
    online_status: f['Online Status '] || null,         // trailing space!
    live_since: f['Live since'] || null,
    deinstall_date: f['deinstall_date'] || null,
    screen_type: f['Screen Type'] || null,
    screen_size: f['Screen Size '] || null,              // trailing space!
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
    post_install_storno: f['Post\u2011Install Storno'] || false,
    post_install_storno_grund: Array.isArray(f['Post\u2011Install Storno Grund']) ? f['Post\u2011Install Storno Grund'] : [],
    ready_for_installation: f['ready_for_installation'] || false,
    created_at: f['Created'] || null,
    updated_at: new Date().toISOString(),
  };
}

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

function mapTask(rec) {
  const f = rec.fields;
  const assigned = Array.isArray(f['Assigned'])
    ? f['Assigned'].map(a => typeof a === 'object' ? a.name : a).filter(Boolean)
    : [];
  return {
    id: rec.id, airtable_id: rec.id,
    title: f['Task Title'] || null,
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
          url: att.url || '', filename: att.filename || '',
          size: att.size || 0, type: att.type || '', id: att.id || '',
          thumbnails: att.thumbnails || null,
        }))
      : [],
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
    swap_type: swapType, swap_date: f['Tausch-Datum'] || null,
    swap_reason: f['Tausch-Grund'] || null,
    partner_id: partnerRecords[0] || null, technician: f['Techniker'] || null,
    old_hardware_ids: oldHw, new_hardware_ids: newHw,
    defect_description: f['Defekt-Beschreibung'] || null,
    status: f['Status'] || null,
    location_name: locationNames[0] || null, city: cities[0] || null,
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
    partner_id: partnerRecords[0] || null, technician: f['Techniker'] || null,
    hardware_condition: f['Hardware-Zustand'] || null,
    condition_description: f['Zustandsbeschreibung'] || null,
    status: f['Status'] || null,
    location_name: locationNames[0] || null, city: cities[0] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapCommunication(rec) {
  const f = rec.fields;
  return {
    id: rec.id, airtable_id: rec.id,
    channel: f['Channel'] || null, direction: f['Direction'] || null,
    subject: f['Subject'] || null, message: f['Message'] || null,
    timestamp: f['Timestamp'] || null, status: f['Status'] || null,
    recipient_name: f['Recipient Name'] || null,
    recipient_contact: f['Recipient Contact'] || null,
    sender: f['Sender'] || null, external_id: f['External ID'] || null,
    location_ids: f['Location'] || [],
    location_names: f['Location Name (from Location)'] || [],
    display_ids: f['Display ID (from Location)'] || [],
    jet_ids: f['JET ID (from Location)'] || [],
    related_task: f['Related Task'] || [],
    updated_at: new Date().toISOString(),
  };
}

function parseGermanDateToISO(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, d, m, y, h, min] = match;
    const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +min));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  const matchDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (matchDate) {
    const [, d, m, y] = matchDate;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}T/)) {
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += line[i]; }
  }
  result.push(current.trim());
  return result;
}

/* ─── Individual sync functions (each returns {name, result}) ─── */

async function syncDisplays(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, DISPLAYS_TABLE, FETCH_FIELDS.displays);
  const rows = records.map(mapDisplay);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'airtable_displays', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'airtable_displays', records.map(r => r.id));
  console.log(`[trigger-sync] Displays: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'displays', fetched: records.length, upserted, deleted };
}

async function syncAcquisition(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, TABLES.ACQUISITION, FETCH_FIELDS.acquisition);
  const rows = records.map(mapAcquisition);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'acquisition', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'acquisition', records.map(r => r.id));
  console.log(`[trigger-sync] Acquisition: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'acquisition', fetched: records.length, upserted, deleted };
}

async function syncDaynScreens(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, DAYN_SCREENS_TABLE, FETCH_FIELDS.daynScreens);
  const rows = records.map(mapDaynScreen);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'dayn_screens', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'dayn_screens', records.map(r => r.id));
  console.log(`[trigger-sync] Dayn Screens: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'dayn_screens', fetched: records.length, upserted, deleted };
}

async function syncOps(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, OPS_INVENTORY_TABLE, FETCH_FIELDS.opsInventory);
  const rows = records.map(rec => {
    const f = rec.fields;
    const simIds = Array.isArray(f['SimID (from SimID)']) ? f['SimID (from SimID)'] : [];
    const displaySns = Array.isArray(f['display_serial_number (from display_inventory)']) ? f['display_serial_number (from display_inventory)'] : [];
    const onlineStatus = Array.isArray(f['Online Status  (from Live Display Locations)']) ? f['Online Status  (from Live Display Locations)'] : [];
    const simRecs = Array.isArray(f['SimID']) ? f['SimID'] : [];
    const dispRecs = Array.isArray(f['display_inventory']) ? f['display_inventory'] : [];
    const locRecs = Array.isArray(f['Live Display Locations']) ? f['Live Display Locations'] : [];
    const partRecs = Array.isArray(f['Partner']) ? f['Partner'] : [];
    return {
      id: rec.id, ops_nr: f['OpsNr.'] || null, status: f['status'] || null,
      ops_sn: f['OPS-SN'] || null, hardware_type: f['ops_hardware_type'] || null,
      navori_venue_id: f['navori_venueID'] || null,
      sim_record_id: simRecs[0] || null, sim_id: simIds[0] || null,
      display_record_id: dispRecs[0] || null, display_sn: displaySns[0] || null,
      display_location_id: locRecs[0] || null, location_online_status: onlineStatus[0] || null,
      partner_id: partRecs[0] || null, note: f['note'] || null,
      updated_at: new Date().toISOString(),
    };
  });
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_ops', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_ops', records.map(r => r.id), 'id');
  console.log(`[trigger-sync] OPS: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_ops', fetched: records.length, upserted, deleted };
}

async function syncSim(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, SIM_INVENTORY_TABLE, FETCH_FIELDS.simInventory);
  const rows = records.map(rec => {
    const f = rec.fields;
    const opsRecs = Array.isArray(f['OPS_Player_inventory 2']) ? f['OPS_Player_inventory 2'] : [];
    return { id: rec.id, sim_id: f['SimID'] ? String(f['SimID']) : null, activate_date: f['activate_date'] || null, ops_record_id: opsRecs[0] || null, status: f['status'] || null, updated_at: new Date().toISOString() };
  });
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_sim', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_sim', records.map(r => r.id), 'id');
  console.log(`[trigger-sync] SIM: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_sim', fetched: records.length, upserted, deleted };
}

async function syncDisplayInventory(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, DISPLAY_INVENTORY_TABLE, FETCH_FIELDS.displayInventory);
  const rows = records.map(rec => {
    const f = rec.fields;
    const opsRecs = Array.isArray(f['OPS_Player_inventory']) ? f['OPS_Player_inventory'] : [];
    return { id: rec.id, display_serial_number: f['display_serial_number'] ? String(f['display_serial_number']) : null, location: f['location'] || null, ops_record_id: opsRecs[0] || null, status: f['status'] || null, updated_at: new Date().toISOString() };
  });
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_displays', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_displays', records.map(r => r.id), 'id');
  console.log(`[trigger-sync] Display Inv: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_displays', fetched: records.length, upserted, deleted };
}

async function syncChg(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, CHG_APPROVAL_TABLE, FETCH_FIELDS.chgApproval);
  // CHG Approval table only contains records for leased displays (not all 313).
  // 44 records is expected if only ~44 locations have active leasing agreements.
  // No filter is applied — this fetches ALL records from the CHG table.
  console.log(`[trigger-sync] CHG: Fetched ${records.length} records from Airtable table ${CHG_APPROVAL_TABLE}`);
  const rows = records.map(rec => {
    const f = rec.fields;
    const instRecs = Array.isArray(f['Installation']) ? f['Installation'] : [];
    return {
      id: rec.id, jet_id_location: f['JET ID Location'] || null,
      asset_id: f['Asset ID'] || null, display_sn: f['Display SN'] || null,
      integrator_invoice_no: f['Integrator Invoice No'] || null,
      chg_certificate: f['Installation certificate at the bank (CHG)'] || null,
      invoice_date: f['Invoice date'] || null,
      rental_start: f['Rental start date at the bank'] || null,
      rental_end: f['Rental end date at the bank'] || null,
      payment_released_on: f['Payment released on'] || null,
      payment_released_by: f['Payment released by'] || null,
      status: f['Status'] || null, installation_id: instRecs[0] || null,
      inspection_status: Array.isArray(f['Inspection Status']) ? f['Inspection Status'] : [],
      display_id: Array.isArray(f['DisplayID']) ? f['DisplayID'] : [],
      location_name: Array.isArray(f['Location Name']) ? f['Location Name'] : [],
      city: Array.isArray(f['City']) ? f['City'] : [],
      address: Array.isArray(f['Address']) ? f['Address'] : [],
      created_at: f['created'] || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'chg_approvals', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'chg_approvals', records.map(r => r.id), 'id');
  console.log(`[trigger-sync] CHG: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'chg_approvals', fetched: records.length, upserted, deleted };
}

async function syncStammdaten(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, STAMMDATEN_TABLE, FETCH_FIELDS.stammdaten);
  const rows = records.map(mapStammdaten);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'stammdaten', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'stammdaten', records.map(r => r.id));
  console.log(`[trigger-sync] Stammdaten: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'stammdaten', fetched: records.length, upserted, deleted };
}

async function syncTasks(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, TASKS_TABLE, FETCH_FIELDS.tasks);
  const rows = records.map(mapTask);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'tasks', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'tasks', records.map(r => r.id));
  console.log(`[trigger-sync] Tasks: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'tasks', fetched: records.length, upserted, deleted };
}

async function syncInstallationen(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, INSTALLATIONEN_TABLE, FETCH_FIELDS.installationen);
  const rows = records.map(mapInstallation);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'installationen', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'installationen', records.map(r => r.id));
  console.log(`[trigger-sync] Installationen: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'installationen', fetched: records.length, upserted, deleted };
}

async function syncSwaps(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, HARDWARE_SWAP_TABLE, FETCH_FIELDS.hardwareSwap);
  const rows = records.map(mapHardwareSwap);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_swaps', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_swaps', records.map(r => r.id), 'id');
  console.log(`[trigger-sync] Swaps: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_swaps', fetched: records.length, upserted, deleted };
}

async function syncDeinstalls(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, DEINSTALL_TABLE, FETCH_FIELDS.deinstall);
  const rows = records.map(mapDeinstall);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_deinstalls', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_deinstalls', records.map(r => r.id), 'id');
  console.log(`[trigger-sync] Deinstalls: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_deinstalls', fetched: records.length, upserted, deleted };
}

async function syncCommunications(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, ACTIVITY_LOG_TABLE, FETCH_FIELDS.communications);
  const rows = records.map(mapCommunication);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'communications', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'communications', records.map(r => r.id));
  console.log(`[trigger-sync] Communications: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'communications', fetched: records.length, upserted, deleted };
}

async function syncHeartbeats(supabaseUrl, serviceKey) {
  const csvRes = await fetch(SHEET_CSV_URL, {
    headers: { 'User-Agent': 'JET-Dashboard-Sync/1.0' },
  });
  if (!csvRes.ok) throw new Error(`HTTP ${csvRes.status}`);
  const csvText = await csvRes.text();
  const lines = csvText.split('\n');
  const csvHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const colIdx = {};
  csvHeaders.forEach((h, i) => { colIdx[h] = i; });
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
  const inserted = await insertToSupabase(supabaseUrl, serviceKey, 'display_heartbeats', heartbeatRows);
  console.log(`[trigger-sync] Heartbeats: ${heartbeatRows.length} → ${inserted} inserted`);
  return { name: 'heartbeats', fetched: heartbeatRows.length, inserted };
}

/* ─── Main Handler ─── */

export default async (request) => {
  const startTime = Date.now();

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!AIRTABLE_TOKEN || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500, headers });
  }

  try {
    // Run syncs in batches of 3 to avoid Airtable's 5 req/s rate limit.
    // Previously all 14 tables ran in parallel, causing massive 429s that
    // starved smaller tables (hardware_ops, hardware_sim, etc.) of data.
    console.log('[trigger-sync] Starting batched sync of all 14 tables (max 3 concurrent)...');

    const batches = [
      // Batch 1: Core display tables
      [
        () => syncDisplays(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncAcquisition(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncDaynScreens(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
      // Batch 2: Hardware inventory tables
      [
        () => syncOps(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncSim(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncDisplayInventory(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
      // Batch 3: Approvals, stammdaten, tasks
      [
        () => syncChg(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncStammdaten(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncTasks(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
      // Batch 4: Installations, swaps, deinstalls
      [
        () => syncInstallationen(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncSwaps(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncDeinstalls(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
      // Batch 5: Communications + heartbeats (heartbeats use Google Sheets, not Airtable)
      [
        () => syncCommunications(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncHeartbeats(SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
    ];

    const allSettled = [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[trigger-sync] Starting batch ${i + 1}/${batches.length} (${batch.length} tables)...`);
      const batchResults = await Promise.allSettled(batch.map(fn => fn()));
      allSettled.push(...batchResults);
      // Pause between batches to let Airtable rate limits reset
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const results = {};
    for (const r of allSettled) {
      if (r.status === 'fulfilled') {
        const { name, ...rest } = r.value;
        results[name] = rest;
      } else {
        const errMsg = r.reason?.message || String(r.reason);
        console.error('[trigger-sync] Job failed:', errMsg);
        results[`error_${Object.keys(results).length}`] = { error: errMsg };
      }
    }

    const succeeded = allSettled.filter(r => r.status === 'fulfilled').length;
    const failed = allSettled.filter(r => r.status === 'rejected').length;
    const durationMs = Date.now() - startTime;

    console.log(`[trigger-sync] Done in ${durationMs}ms — ${succeeded} succeeded, ${failed} failed`);

    // Summarize totals for API usage logging
    const totalFetched = Object.values(results).reduce((sum, r) => sum + (r?.fetched || 0), 0);
    const totalUpserted = Object.values(results).reduce((sum, r) => sum + (r?.upserted || r?.inserted || 0), 0);

    logApiCall({
      functionName: 'trigger-sync-background',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-all',
      durationMs,
      statusCode: 200,
      success: failed === 0,
      recordsCount: totalFetched,
      estimatedCostCents: estimateAirtableCost(totalFetched),
      metadata: { tablesProcessed: succeeded, tablesFailed: failed, totalRecords: totalFetched },
    });

    logApiCall({
      functionName: 'trigger-sync-background',
      service: 'supabase',
      method: 'POST',
      endpoint: '/upsert-all',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalUpserted,
    });

    return new Response(JSON.stringify({
      success: failed === 0,
      duration_ms: durationMs,
      tables_synced: succeeded,
      tables_failed: failed,
      results,
    }), { status: 200, headers });
  } catch (err) {
    console.error('[trigger-sync] Error:', err);

    logApiCall({
      functionName: 'trigger-sync-background',
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
    }), { status: 500, headers });
  }
};
