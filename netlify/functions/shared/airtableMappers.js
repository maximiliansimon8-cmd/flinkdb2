/**
 * Shared Airtable → Supabase Mapper Functions
 *
 * SINGLE SOURCE OF TRUTH for all record transformation logic.
 * Used by both sync-airtable.js and trigger-sync-background.js.
 *
 * Each mapper takes an Airtable record { id, fields } and returns
 * a flat object ready for Supabase upsert.
 */

import {
  STAMMDATEN_FIELDS as SF,
  DISPLAY_FIELDS as DF,
  TASK_FIELDS as TF,
  ACQUISITION_FIELDS as AF,
  ACQUISITION_DETAIL_FIELDS as ADF,
  INSTALLATION_FIELDS as IF_,
  DAYN_FIELDS as DN,
  OPS_FIELDS as OF_,
  SIM_FIELDS as SM,
  DISPLAY_INV_FIELDS as DI,
  CHG_FIELDS as CH,
  SWAP_FIELDS as SW,
  DEINSTALL_FIELDS as DE,
  COMMUNICATION_FIELDS as CF,
  unwrap,
} from './airtableFields.js';

// ═══════════════════════════════════════════════
//  HELPER: safe array/lookup access
// ═══════════════════════════════════════════════

/** Get first value from lookup array or scalar */
function first(fields, fieldName) {
  const v = fields[fieldName];
  return Array.isArray(v) ? (v[0] || null) : (v || null);
}

/** Get lookup field as filtered array */
function lookupArray(fields, fieldName) {
  const v = fields[fieldName];
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

/** Safely ensure array */
function ensureArray(v) {
  return Array.isArray(v) ? v : (v ? [v] : []);
}

// ═══════════════════════════════════════════════
//  MAPPER FUNCTIONS
// ═══════════════════════════════════════════════

export function mapStammdaten(rec) {
  const f = rec.fields;
  const jetId = Array.isArray(f[SF.JET_ID]) ? f[SF.JET_ID][0] : (f[SF.JET_ID] || null);
  return {
    id: rec.id, airtable_id: rec.id, jet_id: jetId,
    display_ids: ensureArray(f[SF.DISPLAY_ID]),
    location_name: f[SF.LOCATION_NAME] || null,
    contact_person: f[SF.CONTACT_PERSON] || null,
    contact_email: f[SF.CONTACT_EMAIL] || null,
    contact_phone: f[SF.CONTACT_PHONE] || null,
    location_email: f[SF.LOCATION_EMAIL] || null,
    location_phone: f[SF.LOCATION_PHONE] || null,
    legal_entity: f[SF.LEGAL_ENTITY] || null,
    street: f[SF.STREET] || null,
    street_number: f[SF.STREET_NUMBER] || null,
    postal_code: f[SF.POSTAL_CODE] || null,
    city: f[SF.CITY] || null,
    lead_status: ensureArray(f[SF.LEAD_STATUS_LOOKUP]),
    display_status: f[SF.STATUS] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapDisplay(rec) {
  const f = rec.fields;
  return {
    id: rec.id, airtable_id: rec.id,
    display_id: f[DF.DISPLAY_ID] || null,
    display_table_id: f[DF.DISPLAY_TABLE_ID] || null,
    display_name: f[DF.DISPLAY_NAME] || null,
    online_status: f[DF.ONLINE_STATUS] || null,         // ⚠️ trailing space in field name
    live_since: f[DF.LIVE_SINCE] || null,
    deinstall_date: f[DF.DEINSTALL_DATE] || null,
    screen_type: f[DF.SCREEN_TYPE] || null,
    screen_size: f[DF.SCREEN_SIZE] || null,              // ⚠️ trailing space in field name
    navori_venue_id: first(f, DF.NAVORI_VENUE_ID),
    location_name: first(f, DF.LOCATION_NAME),
    city: first(f, DF.CITY),
    street: first(f, DF.STREET),
    street_number: first(f, DF.STREET_NUMBER),
    postal_code: first(f, DF.POSTAL_CODE),
    jet_id: first(f, DF.JET_ID_LOOKUP),
    sov_partner_ad: f[DF.SOV_PARTNER_AD] || null,
    created_at: f[DF.CREATED] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapTask(rec) {
  const f = rec.fields;
  const assigned = Array.isArray(f[TF.ASSIGNED])
    ? f[TF.ASSIGNED].map(a => typeof a === 'object' ? a.name : a).filter(Boolean)
    : [];
  return {
    id: rec.id, airtable_id: rec.id,
    title: f[TF.TITLE] || null,
    task_type: f[TF.COMPANY_FROM_PARTNER] || f[TF.PARTNER] || f[TF.TASK_TYPE] || [],
    task_type_select: ensureArray(f[TF.TASK_TYPE]),
    status: f[TF.STATUS] || null,
    priority: f[TF.PRIORITY] || null,
    due_date: f[TF.DUE_DATE] || null,
    description: f[TF.DESCRIPTION] || null,
    created_time: f[TF.CREATED_TIME] || null,
    responsible_user: f[TF.RESPONSIBLE_USER]?.name || f[TF.RESPONSIBLE_USER] || null,
    assigned,
    created_by: f[TF.CREATED_BY]?.name || f[TF.CREATED_BY] || null,
    display_ids: f[TF.DISPLAY_ID_LOOKUP] || [],
    location_names: f[TF.LOCATION_NAME_LOOKUP] || [],
    overdue: f[TF.OVERDUE] || null,
    completed_date: f[TF.COMPLETED_DATE] || null,
    completed_by: f[TF.COMPLETED_BY]?.name || f[TF.COMPLETED_BY] || null,
    // Lookup fields
    online_status: f[TF.ONLINE_STATUS_LOOKUP] || [],
    live_since: f[TF.LIVE_SINCE_LOOKUP] || [],
    installation_status: f[TF.INSTALL_STATUS_LOOKUP] || [],
    integrator: f[TF.INTEGRATOR_LOOKUP] || [],
    install_date: f[TF.INSTALL_DATE_LOOKUP] || [],
    display_serial_number: f[TF.DISPLAY_SN_LOOKUP] || [],
    install_remarks: f[TF.INSTALL_REMARKS_LOOKUP] || [],
    install_type: f[TF.INSTALL_TYPE_LOOKUP] || [],
    // Task meta
    external_visibility: f[TF.EXTERNAL_VISIBILITY] || false,
    nacharbeit_kommentar: f[TF.NACHARBEIT_KOMMENTAR] || null,
    // Superchat: Airtable stores as URL string, Supabase column may be BOOLEAN or TEXT.
    // Cast to string so it works with TEXT column; cast to boolean-safe for BOOLEAN column.
    superchat: f[TF.SUPERCHAT] ? String(f[TF.SUPERCHAT]) : null,
    status_changed_by: f[TF.STATUS_CHANGED_BY]?.name || f[TF.STATUS_CHANGED_BY] || null,
    status_changed_date: f[TF.STATUS_CHANGED_DATE] || null,
    jet_ids: f[TF.JET_ID_LOOKUP] || [],
    cities: f[TF.CITY_LOOKUP] || [],
    // Attachments: JSONB column — must exist in Supabase tasks table.
    // Run sql/fix-tasks-missing-columns.sql if this column is missing.
    attachments: Array.isArray(f[TF.ATTACHMENTS])
      ? f[TF.ATTACHMENTS].map(att => ({
          url: att.url || '', filename: att.filename || '',
          size: att.size || 0, type: att.type || '', id: att.id || '',
          thumbnails: att.thumbnails || null,
        }))
      : [],
    updated_at: new Date().toISOString(),
  };
}

export function mapAcquisition(rec) {
  const f = rec.fields;
  return {
    id: rec.id, airtable_id: rec.id,
    akquise_id: f[AF.AKQUISE_ID] || null,
    lead_status: f[AF.LEAD_STATUS] || null,
    frequency_approval: f[AF.FREQUENCY_APPROVAL] || null,
    install_approval: f[AF.INSTALL_APPROVAL] || null,
    approval_status: f[AF.APPROVAL_STATUS] || null,
    acquisition_date: f[AF.ACQUISITION_DATE] || null,
    installations_status: lookupArray(f, AF.INSTALLATIONS_STATUS),
    display_location_status: lookupArray(f, AF.DISPLAY_LOCATION_STATUS),
    city: lookupArray(f, AF.CITY),
    location_name: first(f, AF.LOCATION_NAME),
    street: first(f, AF.STREET),
    street_number: first(f, AF.STREET_NUMBER),
    postal_code: first(f, AF.POSTAL_CODE),
    jet_id: first(f, AF.JET_ID),
    contact_person: first(f, AF.CONTACT_PERSON),
    contact_email: first(f, AF.CONTACT_EMAIL),
    contact_phone: first(f, AF.CONTACT_PHONE),
    acquisition_partner: first(f, AF.ACQUISITION_PARTNER),
    dvac_week: f[AF.DVAC_WEEK] || null,
    schaufenster: f[AF.SCHAUFENSTER] || null,
    hindernisse: f[AF.HINDERNISSE] || null,
    mount_type: f[AF.MOUNT_TYPE] || null,
    submitted_by: f[AF.SUBMITTED_BY] || null,
    submitted_at: f[AF.SUBMITTED_AT] || null,
    vertrag_vorhanden: f[AF.VERTRAG_VORHANDEN] || null,
    akquise_storno: f[AF.AKQUISE_STORNO] || false,
    post_install_storno: f[AF.POST_INSTALL_STORNO] || false,
    post_install_storno_grund: ensureArray(f[AF.POST_INSTALL_STORNO_GRUND]),
    ready_for_installation: f[AF.READY_FOR_INSTALLATION] || false,
    created_at: f[AF.CREATED] || null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Transform Akquise record for detail view (install-booker-detail.js).
 * Returns a richer object with photos, PDFs, comments, coordinates.
 */
export function transformAkquiseDetail(record) {
  const f = record.fields || {};
  const u = unwrap;
  return {
    id: record.id,
    akquiseId: u(f[ADF.AKQUISE_ID]),
    locationName: u(f[ADF.LOCATION_NAME]),
    city: u(f[ADF.CITY]),
    street: u(f[ADF.STREET]),
    streetNumber: u(f[ADF.STREET_NUMBER]),
    postalCode: u(f[ADF.POSTAL_CODE]),
    jetId: u(f[ADF.JET_ID]),

    contactPerson: u(f[ADF.CONTACT_PERSON]),
    contactPhone: u(f[ADF.CONTACT_PHONE]),
    contactEmail: u(f[ADF.CONTACT_EMAIL]),

    leadStatus: u(f[ADF.LEAD_STATUS]),
    frequencyApproval: u(f[ADF.FREQUENCY_APPROVAL]),
    installApproval: u(f[ADF.INSTALL_APPROVAL]),
    approvalStatus: u(f[ADF.APPROVAL_STATUS]),
    readyForInstallation: u(f[ADF.READY_FOR_INSTALLATION]),

    mountType: u(f[ADF.MOUNT_TYPE]),
    schaufenster: u(f[ADF.SCHAUFENSTER]),
    hindernisse: u(f[ADF.HINDERNISSE]),
    hindernisseBeschreibung: u(f[ADF.HINDERNISSE_BESCHREIBUNG]),
    fensterbreiteAusreichend: u(f[ADF.FENSTERBREITE]),
    steckdoseMitStrom: u(f[ADF.STECKDOSE]),

    akquiseKommentar: u(f[ADF.AKQUISE_KOMMENTAR]),
    akquiseKommentarUpdate: u(f[ADF.AKQUISE_KOMMENTAR_UPDATE]),
    kommentarAusInstallationen: u(f[ADF.KOMMENTAR_INSTALLATIONEN]),
    frequencyApprovalComment: u(f[ADF.FREQUENCY_APPROVAL_COMMENT]),

    vertragPdfVorhanden: u(f[ADF.VERTRAG_VORHANDEN]),
    vertragsnummer: u(f[ADF.VERTRAGSNUMMER]),
    vertragspartner: u(f[ADF.VERTRAGSPARTNER]),
    vertragsbeginn: u(f[ADF.VERTRAGSBEGINN]),
    laufzeit: u(f[ADF.LAUFZEIT]),
    unterschriftsdatum: u(f[ADF.UNTERSCHRIFTSDATUM]),

    acquisitionPartner: u(f[ADF.ACQUISITION_PARTNER]),
    submittedBy: u(f[ADF.SUBMITTED_BY]),
    submittedAt: u(f[ADF.SUBMITTED_AT]),
    acquisitionDate: u(f[ADF.ACQUISITION_DATE]),

    dvacWeek: u(f[ADF.DVAC_WEEK]),
    dvacMonth: u(f[ADF.DVAC_MONTH]),
    dvacPerDay: u(f[ADF.DVAC_DAY]),

    // Attachments — keep as full arrays
    images: f[ADF.IMAGES] || [],
    vertragPdf: f[ADF.VERTRAG_PDF] || [],
    fawDataAttachment: f[ADF.FAW_DATA_ATTACHMENT] || [],
    installationsprotokoll: f[ADF.INSTALL_PROTOKOLL_LOOKUP] || [],

    streetviewLink: u(f[ADF.STREETVIEW_LOOKUP]),
    latitude: u(f[ADF.LATITUDE]),
    longitude: u(f[ADF.LONGITUDE]),
    coordinates: u(f[ADF.COORDINATES_LOOKUP]),

    installationsDatum: u(f[ADF.AUFBAU_DATUM]),
    integratorName: u(f[ADF.INTEGRATOR_LOOKUP]),
    displayName: u(f[ADF.DISPLAY_NAME_LOOKUP]),
    doId: u(f[ADF.DO_ID_LOOKUP]),
    liveSince: u(f[ADF.LIVE_SINCE_LOOKUP]),

    installationsStatus: u(f[ADF.INSTALLATIONS_STATUS]),
    displayLocationStatus: u(f[ADF.DISPLAY_LOCATION_STATUS]),
    abbruchgrund: u(f[ADF.ABBRUCHGRUND]),
    excludeReason: u(f[ADF.EXCLUDE_REASON]),
    akquiseStorno: u(f[ADF.AKQUISE_STORNO]),
    postInstallStorno: u(f[ADF.POST_INSTALL_STORNO]),
    postInstallStornoGrund: f[ADF.POST_INSTALL_STORNO_GRUND] || [],
  };
}

export function mapDaynScreen(rec) {
  const f = rec.fields;
  const zipVal = f[DN.ZIP_CODE];
  const zip = (zipVal && typeof zipVal === 'object') ? zipVal.value : (zipVal || null);
  const streetVal = f[DN.STREET_WITH_NUMBER];
  const street = (streetVal && typeof streetVal === 'object') ? streetVal.value : (streetVal || null);
  return {
    id: rec.id, airtable_id: rec.id,
    dayn_screen_id: f[DN.DAYN_SCREEN_ID] || null,
    do_screen_id: f[DN.DO_SCREEN_ID] || null,
    screen_status: f[DN.SCREEN_STATUS] || null,
    network: 'dayn',
    location_name: f[DN.LOCATION_NAME] || null,
    address: street || f[DN.ADDRESS] || null,
    city: f[DN.CITY] || null,
    region: f[DN.REGION] || null,
    country: f[DN.COUNTRY] || 'GER',
    zip_code: zip,
    venue_type: f[DN.VENUE_TYPE] || null,
    floor_cpm: f[DN.FLOOR_CPM] != null ? Number(f[DN.FLOOR_CPM]) : null,
    screen_width_px: f[DN.SCREEN_WIDTH] != null ? Number(f[DN.SCREEN_WIDTH]) : null,
    screen_height_px: f[DN.SCREEN_HEIGHT] != null ? Number(f[DN.SCREEN_HEIGHT]) : null,
    latitude: f[DN.LATITUDE] != null ? Number(f[DN.LATITUDE]) : null,
    longitude: f[DN.LONGITUDE] != null ? Number(f[DN.LONGITUDE]) : null,
    screen_inch: f[DN.SCREEN_INCH] || null,
    screen_type: f[DN.SCREEN_TYPE] || null,
    max_video_length: f[DN.MAX_VIDEO_LENGTH] || null,
    min_video_length: f[DN.MIN_VIDEO_LENGTH] || null,
    static_duration: f[DN.STATIC_DURATION] || null,
    static_supported: f[DN.STATIC_SUPPORTED] === 'TRUE' ? true : f[DN.STATIC_SUPPORTED] === 'FALSE' ? false : null,
    video_supported: f[DN.VIDEO_SUPPORTED] === 'TRUE' ? true : f[DN.VIDEO_SUPPORTED] === 'FALSE' ? false : null,
    dvac_week: f[DN.DVAC_WEEK] != null ? Number(f[DN.DVAC_WEEK]) : null,
    dvac_month: f[DN.DVAC_MONTH] != null ? Number(f[DN.DVAC_MONTH]) : null,
    dvac_day: f[DN.DVAC_DAY] != null ? Number(f[DN.DVAC_DAY]) : null,
    impressions_per_spot: f[DN.IMPRESSIONS] != null ? Number(f[DN.IMPRESSIONS]) : null,
    install_year: f[DN.INSTALL_YEAR] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapInstallation(rec) {
  const f = rec.fields;
  const integrator = Array.isArray(f[IF_.INTEGRATOR_COMPANY])
    ? f[IF_.INTEGRATOR_COMPANY].join(', ')
    : (f[IF_.INTEGRATOR_COMPANY] || null);
  const technicians = ensureArray(f[IF_.TECHNICIANS]);
  const protocol = Array.isArray(f[IF_.PROTOCOL]) && f[IF_.PROTOCOL][0]
    ? f[IF_.PROTOCOL][0] : null;
  const displayIds = ensureArray(f[IF_.DISPLAY_TABLE_ID_LOOKUP]);
  return {
    id: rec.id, airtable_id: rec.id,
    display_ids: displayIds,
    install_date: f[IF_.INSTALL_DATE] || null,
    status: f[IF_.STATUS] || null,
    installation_type: f[IF_.INSTALLATION_TYPE] || null,
    integrator, technicians,
    protocol_url: protocol?.url || null,
    protocol_filename: protocol?.filename || null,
    screen_type: f[IF_.SCREEN_TYPE] || null,
    screen_size: f[IF_.SCREEN_SIZE] || null,
    ops_nr: f[IF_.OPS_NR] || null,
    sim_id: f[IF_.SIM_ID] || null,
    install_start: f[IF_.INSTALL_START] || null,
    install_end: f[IF_.INSTALL_END] || null,
    remarks: f[IF_.REMARKS] || null,
    partner_name: f[IF_.PARTNER_NAME] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapOpsInventory(rec) {
  const f = rec.fields;
  const simIds = ensureArray(f[OF_.SIM_ID_LOOKUP]);
  const displaySns = ensureArray(f[OF_.DISPLAY_SN_LOOKUP]);
  const onlineStatus = ensureArray(f[OF_.ONLINE_STATUS_LOOKUP]);
  const simRecords = ensureArray(f[OF_.SIM_ID_LINK]);
  const displayRecords = ensureArray(f[OF_.DISPLAY_INVENTORY_LINK]);
  const locationRecords = ensureArray(f[OF_.DISPLAY_LOCATIONS_LINK]);
  const partnerRecords = ensureArray(f[OF_.PARTNER]);
  return {
    id: rec.id,
    ops_nr: f[OF_.OPS_NR] || null,
    status: f[OF_.STATUS] || null,
    ops_sn: f[OF_.OPS_SN] || null,
    hardware_type: f[OF_.HARDWARE_TYPE] || null,
    navori_venue_id: f[OF_.NAVORI_VENUE_ID] || null,
    sim_record_id: simRecords[0] || null,
    sim_id: simIds[0] || null,
    display_record_id: displayRecords[0] || null,
    display_sn: displaySns[0] || null,
    display_location_id: locationRecords[0] || null,
    location_online_status: onlineStatus[0] || null,
    partner_id: partnerRecords[0] || null,
    note: f[OF_.NOTE] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapSimInventory(rec) {
  const f = rec.fields;
  const opsRecords = ensureArray(f[SM.OPS_LINK]);
  return {
    id: rec.id,
    sim_id: f[SM.SIM_ID] ? String(f[SM.SIM_ID]) : null,
    activate_date: f[SM.ACTIVATE_DATE] || null,
    ops_record_id: opsRecords[0] || null,
    status: f[SM.STATUS] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapDisplayInventory(rec) {
  const f = rec.fields;
  const opsRecords = ensureArray(f[DI.OPS_LINK]);
  return {
    id: rec.id,
    display_serial_number: f[DI.SERIAL_NUMBER] ? String(f[DI.SERIAL_NUMBER]) : null,
    location: f[DI.LOCATION] || null,
    ops_record_id: opsRecords[0] || null,
    status: f[DI.STATUS] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapChgApproval(rec) {
  const f = rec.fields;
  const installRecords = ensureArray(f[CH.INSTALLATION_LINK]);
  return {
    id: rec.id,
    jet_id_location: f[CH.JET_ID_LOCATION] || null,
    asset_id: f[CH.ASSET_ID] || null,
    display_sn: f[CH.DISPLAY_SN] || null,
    integrator_invoice_no: f[CH.INVOICE_NO] || null,
    chg_certificate: f[CH.CHG_CERTIFICATE] || null,
    invoice_date: f[CH.INVOICE_DATE] || null,
    rental_start: f[CH.RENTAL_START] || null,
    rental_end: f[CH.RENTAL_END] || null,
    payment_released_on: f[CH.PAYMENT_RELEASED_ON] || null,
    payment_released_by: f[CH.PAYMENT_RELEASED_BY] || null,
    status: f[CH.STATUS] || null,
    installation_id: installRecords[0] || null,
    inspection_status: ensureArray(f[CH.INSPECTION_STATUS]),
    display_id: ensureArray(f[CH.DISPLAY_ID]),
    location_name: ensureArray(f[CH.LOCATION_NAME]),
    city: ensureArray(f[CH.CITY]),
    address: ensureArray(f[CH.ADDRESS]),
    created_at: f[CH.CREATED] || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function mapHardwareSwap(rec) {
  const f = rec.fields;
  const locationRecords = ensureArray(f[SW.DISPLAY_LOCATION]);
  const swapType = ensureArray(f[SW.SWAP_TYPE]);
  const oldHw = ensureArray(f[SW.OLD_HARDWARE]);
  const newHw = ensureArray(f[SW.NEW_HARDWARE]);
  const partnerRecords = ensureArray(f[SW.PARTNER]);
  const locationNames = ensureArray(f[SW.LOCATION_NAME_LOOKUP]);
  const cities = ensureArray(f[SW.CITY_LOOKUP]);
  return {
    id: rec.id,
    swap_id: f[SW.SWAP_ID] ? String(f[SW.SWAP_ID]) : null,
    display_location_id: locationRecords[0] || null,
    swap_type: swapType,
    swap_date: f[SW.SWAP_DATE] || null,
    swap_reason: f[SW.SWAP_REASON] || null,
    partner_id: partnerRecords[0] || null,
    technician: f[SW.TECHNICIAN] || null,
    old_hardware_ids: oldHw,
    new_hardware_ids: newHw,
    defect_description: f[SW.DEFECT_DESCRIPTION] || null,
    status: f[SW.STATUS] || null,
    location_name: locationNames[0] || null,
    city: cities[0] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapDeinstall(rec) {
  const f = rec.fields;
  const locationRecords = ensureArray(f[DE.DISPLAY_LOCATION]);
  const opsRecords = ensureArray(f[DE.OPS_HARDWARE_SET]);
  const partnerRecords = ensureArray(f[DE.PARTNER]);
  const locationNames = ensureArray(f[DE.LOCATION_NAME_LOOKUP]);
  const cities = ensureArray(f[DE.CITY_LOOKUP]);
  return {
    id: rec.id,
    deinstall_id: f[DE.DEINSTALL_ID] ? String(f[DE.DEINSTALL_ID]) : null,
    display_location_id: locationRecords[0] || null,
    ops_record_id: opsRecords[0] || null,
    deinstall_date: f[DE.DEINSTALL_DATE] || null,
    reason: f[DE.REASON] || null,
    partner_id: partnerRecords[0] || null,
    technician: f[DE.TECHNICIAN] || null,
    hardware_condition: f[DE.HARDWARE_CONDITION] || null,
    condition_description: f[DE.CONDITION_DESC] || null,
    status: f[DE.STATUS] || null,
    location_name: locationNames[0] || null,
    city: cities[0] || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapCommunication(rec) {
  const f = rec.fields;
  return {
    id: rec.id, airtable_id: rec.id,
    channel: f[CF.CHANNEL] || null,
    direction: f[CF.DIRECTION] || null,
    subject: f[CF.SUBJECT] || null,
    message: f[CF.MESSAGE] || null,
    timestamp: f[CF.TIMESTAMP] || null,
    status: f[CF.STATUS] || null,
    recipient_name: f[CF.RECIPIENT_NAME] || null,
    recipient_contact: f[CF.RECIPIENT_CONTACT] || null,
    sender: f[CF.SENDER] || null,
    external_id: f[CF.EXTERNAL_ID] || null,
    location_ids: f[CF.LOCATION_LINK] || [],
    location_names: f[CF.LOCATION_NAME_LOOKUP] || [],
    display_ids: f[CF.DISPLAY_ID_LOOKUP] || [],
    jet_ids: f[CF.JET_ID_LOOKUP] || [],
    related_task: f[CF.RELATED_TASK] || [],
    updated_at: new Date().toISOString(),
  };
}
