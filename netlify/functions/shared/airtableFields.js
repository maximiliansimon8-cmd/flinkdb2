/**
 * Shared Airtable Field Constants & Mapping Functions
 *
 * SINGLE SOURCE OF TRUTH for all Airtable field names, table IDs, and mapping logic.
 * Both sync-airtable.js and trigger-sync-background.js import from here.
 *
 * ⚠️  QUIRKS & GOTCHAS:
 * - Some fields have TRAILING SPACES: 'Online Status ' (not 'Online Status')
 * - Some fields have DOUBLE SPACES: 'Lead Status  (from Akquise)'
 * - 'Post‑Install Storno' uses NON-BREAKING HYPHEN U+2011 (not regular -)
 * - 'external_visiblity' is a TYPO in Airtable (missing 'i')
 * - 'Longtitude' in some tables is a TYPO (should be Longitude)
 * - 'Lega Entity Adress' in some tables has typos
 *
 * See AIRTABLE_FIELD_REFERENCE.md for full field documentation.
 */

// ═══════════════════════════════════════════════
//  BASE & TABLE IDs
// ═══════════════════════════════════════════════

export const AIRTABLE_BASE = 'apppFUWK829K6B3R2';

export const TABLES = {
  STAMMDATEN:         'tblLJ1S7OUhc2w5Jw',   // "JET Stammdaten"
  DISPLAYS:           'tblS6cWN7uEhZHcie',   // "Live Display Locations"
  TASKS:              'tblcKHWJg77mgIQ9l',   // "Tasks"
  INSTALLATIONEN:     'tblKznpAOAMvEfX8u',   // "Installationen"
  ACTIVITY_LOG:       'tblDk1dl4J3Ow3Qde',   // "activity_log" / Communications
  DAYN_SCREENS:       'Dayn Screens',         // Airtable also accepts table names
  OPS_INVENTORY:      'tbl7szvfLUjsUvMkH',   // "OPS_Player_inventory"
  SIM_INVENTORY:      'tblaV4UQX6hhcSDAj',   // "SIM_card_inventory"
  DISPLAY_INVENTORY:  'tblaMScl3j45Q4Dtc',   // "display_inventory"
  CHG_APPROVAL:       'tblvj4qjJpBVLbY7F',   // "CHG Approval"
  DEINSTALL:          'tbltdxgzDeNz9d0ZC',   // "Deinstallationen"
  HARDWARE_SWAP:      'tblzFHk0HhB4bNYJ4',   // "Hardware Swap"
  ACQUISITION:        'tblqFMBAeKQ1NbSI8',   // "Acquisition_DB"
  INSTALLATIONSTERMINE: 'tblZrFRRg3iKxlXFJ', // "Installationstermine"
};

// ═══════════════════════════════════════════════
//  AIRTABLE FIELD NAMES (per table)
//  These are the exact Airtable API field names.
// ═══════════════════════════════════════════════

/** JET Stammdaten fields */
export const STAMMDATEN_FIELDS = {
  JET_ID:              'JET ID',
  DISPLAY_ID:          'Display ID',
  LOCATION_NAME:       'Location Name',
  CONTACT_PERSON:      'Contact Person',
  CONTACT_EMAIL:       'Contact Email',
  CONTACT_PHONE:       'Contact Phone',
  LOCATION_EMAIL:      'Location Email',
  LOCATION_PHONE:      'Location Phone',
  LEGAL_ENTITY:        'Legal Entity',
  STREET:              'Street',
  STREET_NUMBER:       'Street Number',
  POSTAL_CODE:         'Postal Code',
  CITY:                'City',
  LEAD_STATUS_LOOKUP:  'Lead Status  (from Akquise)',  // ⚠️ DOUBLE SPACE!
  // REMOVED: 'Status' — does not exist in Airtable Stammdaten
};

/** Live Display Locations fields */
export const DISPLAY_FIELDS = {
  DISPLAY_ID:          'Display ID',
  DISPLAY_TABLE_ID:    'Display Table ID',
  DISPLAY_NAME:        'display_name',
  ONLINE_STATUS:       'Online Status ',          // ⚠️ TRAILING SPACE!
  LIVE_SINCE:          'Live since',
  DEINSTALL_DATE:      'deinstall_date',
  SCREEN_TYPE:         'Screen Type',
  SCREEN_SIZE:         'Screen Size ',             // ⚠️ TRAILING SPACE!
  NAVORI_VENUE_ID:     'Navori Venue ID (from Installationen)',
  LOCATION_NAME:       'Location Name',
  CITY:                'City',
  STREET:              'Street',
  STREET_NUMBER:       'Street Number',
  POSTAL_CODE:         'Postal Code',
  JET_ID_LOOKUP:       'JET ID (from JET ID)',
  SOV_PARTNER_AD:      'SoV Partner Ad',
  CREATED:             'Created',
};

/** Tasks fields */
export const TASK_FIELDS = {
  TITLE:                    'Task Title',
  TASK_TYPE:                'Task Type',
  PARTNER:                  'Partner',
  // REMOVED: 'Company (from Partner)' — does not exist in Airtable Tasks
  STATUS:                   'Status',
  PRIORITY:                 'Priority',
  DUE_DATE:                 'Due Date',
  DESCRIPTION:              'Description',
  CREATED_TIME:             'Created time',
  RESPONSIBLE_USER:         'Responsible User',
  ASSIGNED:                 'Assigned',
  CREATED_BY:               'Created by',
  DISPLAY_ID_LOOKUP:        'Display ID (from Displays )',   // ⚠️ trailing space before )
  LOCATION_NAME_LOOKUP:     'Location Name (from Locations)',
  OVERDUE:                  'Overdue',
  COMPLETED_DATE:           'completed_task_date',
  COMPLETED_BY:             'completed_task_by',
  ATTACHMENTS:              'Attachments',
  // Lookup fields from related tables
  ONLINE_STATUS_LOOKUP:     'Online Status  (from Displays )',  // ⚠️ double space + trailing space
  LIVE_SINCE_LOOKUP:        'Live since (from Displays )',       // ⚠️ trailing space before )
  INSTALL_STATUS_LOOKUP:    'Status Installation (from Installation)',
  INTEGRATOR_LOOKUP:        'Integrator (from Installation)',
  INSTALL_DATE_LOOKUP:      'Aufbau Datum (from Installation)',
  DISPLAY_SN_LOOKUP:        'Display Serial Number (from Installation)',
  INSTALL_REMARKS_LOOKUP:   'Allgemeine Bemerkungen (from Installation)',
  INSTALL_TYPE_LOOKUP:      'Installationsart (from Installation)',
  // Task meta
  EXTERNAL_VISIBILITY:      'external_visiblity',  // ⚠️ TYPO in Airtable!
  NACHARBEIT_KOMMENTAR:     'Kommentar Nacharbeit ',  // trailing space in Airtable
  SUPERCHAT:                'Superchat',
  STATUS_CHANGED_BY:        'Status changed by',
  STATUS_CHANGED_DATE:      'Status changed date ',   // trailing space in Airtable
  JET_ID_LOOKUP:            'JET ID (from Locations)',
  CITY_LOOKUP:              'City (from Locations)',
};

/** Acquisition_DB fields (used for sync) */
export const ACQUISITION_FIELDS = {
  AKQUISE_ID:               'Akquise ID',
  LEAD_STATUS:              'Lead_Status',
  FREQUENCY_APPROVAL:       'frequency_approval (previous FAW Check)',
  INSTALL_APPROVAL:         'install_approval',
  APPROVAL_STATUS:          'approval_status',
  ACQUISITION_DATE:         'Acquisition Date',
  INSTALLATIONS_STATUS:     'Installations Status',
  DISPLAY_LOCATION_STATUS:  'Display Location Status',
  CITY:                     'City',
  LOCATION_NAME:            'Location Name_new',
  STREET:                   'Street',
  STREET_NUMBER:            'Street Number',
  POSTAL_CODE:              'Postal Code',
  JET_ID:                   'JET_ID',
  CONTACT_PERSON:           'Contact Person',
  CONTACT_EMAIL:            'Contact Email',
  CONTACT_PHONE:            'Contact Phone',
  ACQUISITION_PARTNER:      'Akquisition Partner Name (from Team)',
  DVAC_WEEK:                '# dVAC / Woche 100% SoV',
  SCHAUFENSTER:             'Schaufenster einsehbar',
  HINDERNISSE:              'Hindernisse vorhanden',
  MOUNT_TYPE:               'Mount Type',
  SUBMITTED_BY:             'Submitted By',
  SUBMITTED_AT:             'Submitted At',
  VERTRAG_VORHANDEN:        'Vertrag PDF vorhanden',
  UNTERSCHRIFTSDATUM:       'Unterschriftsdatum',
  VERTRAGSNUMMER:           'Vertragsnummer',
  AKQUISE_STORNO:           'Akquise Storno',
  POST_INSTALL_STORNO:      'Post\u2011Install Storno',       // ⚠️ U+2011 non-breaking hyphen!
  POST_INSTALL_STORNO_GRUND: 'Post\u2011Install Storno Grund', // ⚠️ U+2011!
  READY_FOR_INSTALLATION:   'ready_for_installation',
  CREATED:                  'Created',
  LATITUDE:                 'Latitude',
  LONGITUDE:                'Longitude',
  // Extended fields (previously only in DETAIL)
  VERTRAG_PDF:              'Vertrag (PDF)',
  IMAGES:                   'images_akquise',
  FAW_DATA_ATTACHMENT:      'FAW_data_attachment',
  AKQUISE_KOMMENTAR:        'Akquise Kommentar',
  KOMMENTAR_INSTALLATIONEN: 'Kommentar aus Installationen',
  FREQUENCY_APPROVAL_COMMENT: 'frequency_approval_comment',
  // dVAC & Impressions
  DVAC_MONTH:               'dVAC / Month',
  DVAC_DAY:                 'dVAC per Day',
  // Location details
  HINDERNISSE_BESCHREIBUNG: 'Hindernisse Beschreibung',
  FENSTERBREITE:            'Fensterbreite ausreichend',
  STECKDOSE:                'Steckdose mit Strom 6-22 Uhr?',
  // Booking fields (set by install-booker-invite.js)
  // REMOVED: 'Booking Status', 'Booking Token', 'Booking Link Sent At'
  // → These fields come from linked Installationstermine, not Acquisition_DB directly
};

/**
 * Acquisition_DB DETAIL fields (superset of ACQUISITION_FIELDS)
 * Used by install-booker-detail.js for the full record view with
 * photos, PDFs, comments, coordinates, and installation lookups.
 */
export const ACQUISITION_DETAIL_FIELDS = {
  ...ACQUISITION_FIELDS,
  // Location details
  HINDERNISSE_BESCHREIBUNG: 'Hindernisse Beschreibung',
  FENSTERBREITE:            'Fensterbreite ausreichend',
  STECKDOSE:                'Steckdose mit Strom 6-22 Uhr?',
  // Comments
  AKQUISE_KOMMENTAR:        'Akquise Kommentar',
  AKQUISE_KOMMENTAR_UPDATE: 'Akquise Kommentar (from Acquisition Update)',
  KOMMENTAR_INSTALLATIONEN: 'Kommentar aus Installationen',
  FREQUENCY_APPROVAL_COMMENT: 'frequency_approval_comment',
  // Contract
  VERTRAG_PDF:              'Vertrag (PDF)',
  VERTRAGSNUMMER:           'Vertragsnummer',
  VERTRAGSPARTNER:          'Vertragspartner',
  VERTRAGSBEGINN:           'Vertragsbeginn',
  LAUFZEIT:                 'Laufzeit',
  UNTERSCHRIFTSDATUM:       'Unterschriftsdatum',
  // Attachments
  IMAGES:                   'images_akquise',
  FAW_DATA_ATTACHMENT:      'FAW_data_attachment',
  INSTALL_PROTOKOLL_LOOKUP: 'Installationsprotokoll (from Installationen)',
  // dVAC
  DVAC_MONTH:               'dVAC / Month',
  DVAC_DAY:                 'dVAC per Day',
  // Geo
  LATITUDE:                 'Latitude',
  LONGITUDE:                'Longitude',
  COORDINATES_LOOKUP:       'Koordinaten (from JET ID)',
  STREETVIEW_LOOKUP:        'Streetview Link (from JET ID)',
  // Installation lookups
  AUFBAU_DATUM:             'Aufbau Datum',
  INTEGRATOR_LOOKUP:        'Integrator (Installation)',
  DISPLAY_NAME_LOOKUP:      'display_name (from Displays)',
  DO_ID_LOOKUP:             'DO-ID (from Installationen)',
  LIVE_SINCE_LOOKUP:        'Live since (from Displays)',
  // Cancellation
  ABBRUCHGRUND:             'Abbruchgrund',
  EXCLUDE_REASON:           'Exclude Reason',
};

/** Installationen fields */
export const INSTALLATION_FIELDS = {
  INSTALL_DATE:             'Aufbau Datum',
  STATUS:                   'Status Installation',
  INSTALLATION_TYPE:        'Installationsart',
  INTEGRATOR_COMPANY:       'Company (from Integrator)',
  TECHNICIANS:              'Name (from Technikers)',
  PROTOCOL:                 'Installationsprotokoll',
  SCREEN_TYPE:              'Screen Art',
  SCREEN_SIZE:              'Screen Size',
  OPS_NR:                   'OPS Nr',
  SIM_ID:                   'SIM-ID',
  INSTALL_START:            'Installationsstart',
  INSTALL_END:              'Installationsabschluss',
  REMARKS:                  'Allgemeine Bemerkungen',
  PARTNER_NAME:             'Abnahme Partner (Name)',
  DISPLAY_TABLE_ID_LOOKUP:  'Display Table ID (from Link to Display ID )', // ⚠️ trailing space before )
  // Linked records & lookups for Standort-Zuordnung
  AKQUISE_LINK:             'Akquise',
  JET_ID_LOOKUP:            'JET ID (from Akquise)',
  LOCATION_NAME_LOOKUP:     'Location Name',
  CITY_LOOKUP:              'City',
  STREET_LOOKUP:            'Street',
  STREET_NUMBER_LOOKUP:     'Street Number',
  POSTAL_CODE_LOOKUP:       'Postal Code',
};

/** Dayn Screens fields */
export const DAYN_FIELDS = {
  DAYN_SCREEN_ID:     'Dayn_Screen_ID',
  DO_SCREEN_ID:       'DO_Screen_ID',
  SCREEN_STATUS:      'Screen Status',
  LOCATION_NAME:      'location_name',
  ADDRESS:            'address',
  CITY:               'city',
  REGION:             'region',
  COUNTRY:            'country',
  ZIP_CODE:           'zip_code',
  VENUE_TYPE:         'venue type',
  FLOOR_CPM:          'floor CPM',
  SCREEN_WIDTH:       'screen width (px)',
  SCREEN_HEIGHT:      'screen height (px)',
  LATITUDE:           'latitude',
  LONGITUDE:          'longitude',
  SCREEN_INCH:        'Screen_Inch',
  SCREEN_TYPE:        'Screen_Type',
  STREET_WITH_NUMBER: 'Street with Number',
  DVAC_WEEK:          '# dVAC / Woche 100% SoV',
  DVAC_MONTH:         'dVAC / Month',
  DVAC_DAY:           'dVAC per Day',
  IMPRESSIONS:        'Impressions per Spot',
  MAX_VIDEO_LENGTH:   'Maximun video spot lenth (seconds)',   // ⚠️ TYPO "Maximun" + "lenth"
  MIN_VIDEO_LENGTH:   'Minimum video spot lenth (seconds)',   // ⚠️ TYPO "lenth"
  STATIC_DURATION:    'static duration (in seconds)',
  STATIC_SUPPORTED:   'static_supported (can your screens run images JPG/PNG)',
  VIDEO_SUPPORTED:    'video_supported (can your screens run video?)',
  INSTALL_YEAR:       'install_year',
};

/** OPS Player Inventory fields */
export const OPS_FIELDS = {
  OPS_NR:                     'OpsNr.',
  STATUS:                     'status',
  OPS_SN:                     'OPS-SN',
  HARDWARE_TYPE:              'ops_hardware_type',
  NAVORI_VENUE_ID:            'navori_venueID',
  SIM_ID_LINK:                'SimID',
  SIM_ID_LOOKUP:              'SimID (from SimID)',
  DISPLAY_INVENTORY_LINK:     'display_inventory',
  DISPLAY_SN_LOOKUP:          'display_serial_number (from display_inventory)',
  DISPLAY_LOCATIONS_LINK:     'Live Display Locations',
  ONLINE_STATUS_LOOKUP:       'Online Status  (from Live Display Locations)', // ⚠️ double space!
  PARTNER:                    'Partner',
  NOTE:                       'note',
};

/** SIM Card Inventory fields */
export const SIM_FIELDS = {
  SIM_ID:           'SimID',
  ACTIVATE_DATE:    'activate_date',
  OPS_LINK:         'OPS_Player_inventory 2',
  // REMOVED: 'status' — field does not exist in current Airtable schema
};

/** Display Inventory fields */
export const DISPLAY_INV_FIELDS = {
  SERIAL_NUMBER:    'display_serial_number',
  LOCATION:         'location',
  OPS_LINK:         'OPS_Player_inventory',
  // REMOVED: 'status' — field does not exist in current Airtable schema
};

/** CHG Approval fields */
export const CHG_FIELDS = {
  JET_ID_LOCATION:      'JET ID Location',
  ASSET_ID:             'Asset ID',
  DISPLAY_SN:           'Display SN',
  INVOICE_NO:           'Integrator Invoice No',
  CHG_CERTIFICATE:      'Installation certificate at the bank (CHG)',
  INVOICE_DATE:         'Invoice date',
  RENTAL_START:         'Rental start date at the bank',
  RENTAL_END:           'Rental end date at the bank',
  PAYMENT_RELEASED_ON:  'Payment released on',
  PAYMENT_RELEASED_BY:  'Payment released by',
  STATUS:               'Status',
  INSTALLATION_LINK:    'Installation',
  INSPECTION_STATUS:    'Inspection Status',
  DISPLAY_ID:           'DisplayID',
  LOCATION_NAME:        'Location Name',
  CITY:                 'City',
  ADDRESS:              'Address',
  CREATED:              'created',
};

/** Hardware Swap fields */
export const SWAP_FIELDS = {
  // REMOVED: 'Tausch-ID' — field renamed to 'Name' in Airtable
  DISPLAY_LOCATION:     'Live Display Location',
  SWAP_TYPE:            'Tausch-Typ',
  SWAP_DATE:            'Tausch-Datum',
  SWAP_REASON:          'Tausch-Grund',
  PARTNER:              'Partner',
  TECHNICIAN:           'Techniker',
  OLD_HARDWARE:         'ALTE Hardware',
  NEW_HARDWARE:         'NEUE Hardware',
  DEFECT_DESCRIPTION:   'Defekt-Beschreibung',
  STATUS:               'Status',
  // REMOVED: 'Location Name (from Live Display Location)' — does not exist
  // REMOVED: 'City (from Live Display Location)' — does not exist
};

/** Deinstallationen fields */
export const DEINSTALL_FIELDS = {
  // REMOVED: 'Deinstallations-ID' — field renamed to 'Name' in Airtable
  DISPLAY_LOCATION:     'Live Display Location',
  OPS_HARDWARE_SET:     'OPS-Nr / Hardware-Set',
  DEINSTALL_DATE:       'Deinstallationsdatum',
  REASON:               'Grund',
  // REMOVED: 'Partner' — field renamed to 'Integrator' in Airtable
  TECHNICIAN:           'Techniker',
  HARDWARE_CONDITION:   'Hardware-Zustand',
  CONDITION_DESC:       'Zustandsbeschreibung',
  STATUS:               'Status',
  // REMOVED: 'Location Name (from Live Display Location)' — does not exist
  // REMOVED: 'City (from Live Display Location)' — does not exist
};

/** Installationstermine fields */
export const INSTALLATIONSTERMINE_FIELDS = {
  INSTALL_DATE_ID:          'Install_Date_ID',
  INSTALLATIONSDATUM:       'Installationsdatum',
  ERINNERUNGSDATUM:         'Erinnerungsdatum',
  INSTALLATIONSZEIT:        'Installationszeit',
  GRUND_NOTIZ:              'Grund /Notiz',
  NAECHSTE_SCHRITT:         'Nächste Schritt',
  KW_GEPLANT:               'KW Geplant',
  WOCHENTAG:                'Wochentag',
  INSTALLATIONSDATUM_NUR_DATUM: 'Installationsdatum (nur Datum)',
  TERMINSTATUS:             'Terminstatus',
  JET_ID:                   'JET ID',
  LOCATION_NAME:            'Location Name',
  AKQUISE:                  'Akquise',
  STREET:                   'Street_new (from Akquise)',
  STREET_NUMBER:            'Street Number_new (from Akquise)',
  POSTAL_CODE:              'Postal Code_new (from Akquise)',
  CITY:                     'City_new (from Akquise)',
  CONTACT_EMAIL:            'Contact Email (from Stammdaten)',
  STAMMDATEN:               'Stammdaten',
  INSTALLATIONEN:           'Installationen',
  STATUS_INSTALLATION:      'Status Installation (from Installationen)',
  // REMOVED: These lookup fields no longer exist in Airtable Installationstermine:
  // 'Company (from Integrator) (from Installationen)', 'Name (from Technikers) (from Installationen)',
  // 'Installationsart (from Installationen)', 'Aufbau Datum (from Installationen)',
  // 'Abnahme Partner (Name) (from Installationen)', 'Akquisition Partner Name (from Akquise)',
  // 'Contact Person (from Stammdaten)', 'Contact Phone (from Stammdaten)'
  // Audit fields
  CREATED:                  'Created',
  CREATED_BY:               'created by',  // ⚠️ lowercase in Airtable!
};

/** Activity Log / Communications fields */
export const COMMUNICATION_FIELDS = {
  CHANNEL:              'Channel',
  DIRECTION:            'Direction',
  SUBJECT:              'Subject',
  MESSAGE:              'Message',
  TIMESTAMP:            'Timestamp',
  STATUS:               'Status',
  RECIPIENT_NAME:       'Recipient Name',
  RECIPIENT_CONTACT:    'Recipient Contact',
  SENDER:               'Sender',
  EXTERNAL_ID:          'External ID',
  LOCATION_LINK:        'Location',
  LOCATION_NAME_LOOKUP: 'Location Name (from Location)',
  DISPLAY_ID_LOOKUP:    'Display ID (from Location)',
  JET_ID_LOOKUP:        'JET ID (from Location)',
  RELATED_TASK:         'Related Task',
};

// ═══════════════════════════════════════════════
//  FIELD FETCH LISTS (for Airtable API requests)
//  Use these arrays in fetchAllAirtable() calls
// ═══════════════════════════════════════════════

export const FETCH_FIELDS = {
  stammdaten: Object.values(STAMMDATEN_FIELDS),
  displays: Object.values(DISPLAY_FIELDS),
  tasks: Object.values(TASK_FIELDS),
  acquisition: Object.values(ACQUISITION_FIELDS),
  acquisitionDetail: Object.values(ACQUISITION_DETAIL_FIELDS),
  installationen: Object.values(INSTALLATION_FIELDS),
  daynScreens: Object.values(DAYN_FIELDS),
  opsInventory: Object.values(OPS_FIELDS),
  simInventory: Object.values(SIM_FIELDS),
  displayInventory: Object.values(DISPLAY_INV_FIELDS),
  chgApproval: Object.values(CHG_FIELDS),
  hardwareSwap: Object.values(SWAP_FIELDS),
  deinstall: Object.values(DEINSTALL_FIELDS),
  communications: Object.values(COMMUNICATION_FIELDS),
  installationstermine: Object.values(INSTALLATIONSTERMINE_FIELDS),
};

// ═══════════════════════════════════════════════
//  KNOWN FIELD VALUES
//  Documented real values from Airtable data
// ═══════════════════════════════════════════════

export const VALUES = {
  /** Lead_Status possible values */
  LEAD_STATUS: {
    WON_SIGNED:       'Won / Signed',
    NEW_LEAD:         'New Lead',
    QUALIFIED:        'Qualified',
    CONTACTED:        'Contacted',
    LOST:             'Lost',
    INTERESTED:       'Interested',
    IN_PROGRESS:      'In Progress',
    DISQUALIFIED:     'Disqualified',
    INFO_REQUIRED:    'Info Required',
    UNREACHABLE:      'Unreachable',
  },

  /** approval_status possible values */
  APPROVAL_STATUS: {
    ACCEPTED:         'Accepted',
    REJECTED:         'Rejected',
    IN_REVIEW:        'In review',
    INFO_REQUIRED:    'Info required',
  },

  /** Status Installation possible values */
  INSTALLATION_STATUS: {
    INSTALLIERT:      'Installiert',
    ABGEBROCHEN:      'Abgebrochen',
    GEPLANT:          'Geplant',
    NACHARBEIT:       'Nacharbeit erforderlich',
    STORNIERT:        'Storniert',
  },

  /** Online Status (Display) possible values */
  ONLINE_STATUS: {
    ONLINE:           'online',
    OFFLINE:          'offline',
  },

  /** Terminstatus possible values (Installationstermine) */
  TERMINSTATUS: {
    GEPLANT:        'Geplant',
    ABGESAGT:       'Abgesagt',
    VERSCHOBEN:     'Verschoben',
    NO_SHOW:        'No-Show',
    DURCHGEFUEHRT:  'Durchgeführt',
  },

  /** ready_for_installation values (checkbox → string!) */
  READY_FOR_INSTALL: {
    CHECKED:          'checked',   // ⚠️ String, not boolean true!
  },
};

// ═══════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═══════════════════════════════════════════════

/**
 * Unwrap a value: if it's an array, return first element; otherwise return as-is.
 * Useful for Airtable lookup fields that return single-item arrays.
 */
export function unwrap(val) {
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

/**
 * Get first element from a lookup field (array), or scalar if not array.
 */
export function first(fields, fieldName) {
  const v = fields[fieldName];
  return Array.isArray(v) ? (v[0] || null) : (v || null);
}

/**
 * Get lookup field as filtered array (removes falsy values).
 */
export function lookupArray(fields, fieldName) {
  const v = fields[fieldName];
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

/**
 * Check if ready_for_installation is truthy.
 * Airtable stores checkbox as "checked" string, not boolean.
 */
export function isReadyForInstall(value) {
  return value === true || value === 'checked' || value === 'true';
}

/**
 * Check if approval_status indicates approval.
 * Only "Accepted" counts as approved.
 */
export function isApproved(approvalStatus) {
  const s = (approvalStatus || '').toLowerCase();
  return s === 'accepted' || s === 'approved';
}

/**
 * Check if a record is Won/Signed and fully approved (ready for installation).
 */
export function isWonAndApproved(leadStatus, approvalStatus) {
  const ls = (leadStatus || '').toLowerCase();
  const isWon = ls === 'won / signed' || ls === 'won/signed';
  return isWon && isApproved(approvalStatus);
}

// ═══════════════════════════════════════════════
//  SUPABASE TABLE NAMES (target tables for sync)
// ═══════════════════════════════════════════════

export const SUPABASE_TABLES = {
  STAMMDATEN:       'stammdaten',
  DISPLAYS:         'airtable_displays',
  TASKS:            'tasks',
  INSTALLATIONEN:   'installationen',
  COMMUNICATIONS:   'communications',
  DAYN_SCREENS:     'dayn_screens',
  ACQUISITION:      'acquisition',
  HARDWARE_OPS:     'hardware_ops',
  HARDWARE_SIM:     'hardware_sim',
  HARDWARE_DISPLAYS: 'hardware_displays',
  CHG_APPROVALS:    'chg_approvals',
  HARDWARE_SWAPS:   'hardware_swaps',
  HARDWARE_DEINSTALLS: 'hardware_deinstalls',
  HEARTBEATS:       'display_heartbeats',
  INSTALLATIONSTERMINE: 'installationstermine',
};

// ═══════════════════════════════════════════════
//  GOOGLE SHEETS URL
// ═══════════════════════════════════════════════

// WICHTIG: /gviz/tq liefert LIVE-Daten, /export?format=csv nur einen gecachten Snapshot!
export const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/gviz/tq?tqx=out:csv&gid=0';
