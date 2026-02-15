# JET Dashboard V2 -- Data Dictionary

> **Generated:** 2026-02-13
> **Supabase Project:** `hvgjdosdejnwkuyivnrq.supabase.co`
> **Airtable Base:** `apppFUWK829K6B3R2`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Synced Tables (Airtable -> Supabase)](#synced-tables-airtable---supabase)
   - [airtable_displays](#table-airtable_displays)
   - [stammdaten](#table-stammdaten)
   - [tasks](#table-tasks)
   - [acquisition](#table-acquisition)
   - [dayn_screens](#table-dayn_screens)
   - [installationen](#table-installationen)
   - [communications](#table-communications)
   - [hardware_ops](#table-hardware_ops)
   - [hardware_sim](#table-hardware_sim)
   - [hardware_displays](#table-hardware_displays)
   - [chg_approvals](#table-chg_approvals)
   - [hardware_swaps](#table-hardware_swaps)
   - [hardware_deinstalls](#table-hardware_deinstalls)
3. [Synced Tables (Google Sheets -> Supabase)](#synced-tables-google-sheets---supabase)
   - [display_heartbeats](#table-display_heartbeats)
4. [Synced Tables (Vistar -> Supabase)](#synced-tables-vistar---supabase)
   - [vistar_venues](#table-vistar_venues)
   - [vistar_venue_health](#table-vistar_venue_health)
   - [vistar_networks](#table-vistar_networks)
   - [vistar_sync_log](#table-vistar_sync_log)
5. [Supabase-Only Tables](#supabase-only-tables)
   - [install_routen](#table-install_routen)
   - [install_bookings](#table-install_bookings)
   - [app_users](#table-app_users)
   - [groups](#table-groups)
   - [audit_log](#table-audit_log)
   - [bank_leasing](#table-bank_leasing)
   - [feedback_requests](#table-feedback_requests)
   - [agent_memory](#table-agent_memory)
   - [api_usage_log](#table-api_usage_log)
6. [Airtable Table IDs](#airtable-table-ids)
7. [API Endpoints](#api-endpoints)
8. [Attachment Fields](#attachment-fields)
9. [KPIs and Calculated Metrics](#kpis-and-calculated-metrics)
10. [Data Flow Diagrams](#data-flow-diagrams)

---

## Architecture Overview

```
                         +---------------------+
                         |     Airtable Base    |
                         | apppFUWK829K6B3R2   |
                         |  (12 tables)        |
                         +----------+----------+
                                    |
                    sync-airtable.js (scheduled every 2h)
                    trigger-sync-background.js (manual, batched)
                                    |
                                    v
+------------------+     +---------+---------+     +------------------+
|  Google Sheets   |---->|     Supabase       |<----|   Vistar SSP     |
|  (Navori CSV)    |     |  (PostgreSQL)      |     |   (Ad Revenue)   |
+------------------+     |  22+ tables        |     +------------------+
                         +---------+----------+
                                   |
                    Netlify Functions (API layer)
                                   |
                                   v
                         +---------+---------+
                         |   React Frontend   |
                         |  (Dashboard SPA)   |
                         +--------------------+
```

**Sync Frequencies:**
- **Airtable -> Supabase:** Every 2 hours (scheduled via `sync-airtable.js`), manual trigger via `trigger-sync-background.js` (batched, max 3 concurrent)
- **Google Sheets -> Supabase:** Every 2 hours (part of Airtable sync)
- **Vistar -> Supabase:** Daily at 03:00 UTC (90-day window via `vistar-sync-scheduled.js`), manual via `vistar-sync.js`
- **Bank Leasing:** Manual import via XLSX upload or Make.com webhook

---

## Synced Tables (Airtable -> Supabase)

### Table: `airtable_displays`

**Source:** Airtable
**Airtable Table:** `tblS6cWN7uEhZHcie` ("Live Display Locations")
**Sync:** Every 2h via sync-airtable / trigger-sync-background
**Upsert Key:** `id` (Airtable record ID)

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| airtable_id | text | (record ID) | Duplicate of id for orphan cleanup | Sync |
| display_id | text | Display ID | Human-readable display identifier (e.g. "DO-001") | Dashboard, Detail |
| display_table_id | text | Display Table ID | Internal table reference ID | Linking |
| display_name | text | display_name | Friendly display name | Dashboard |
| online_status | text | Online Status  | Current status: Online/Warning/Critical/Permanent Offline (NOTE: trailing space in Airtable field name!) | Dashboard, KPIs |
| live_since | text | Live since | Date when display went live | Detail, KPIs |
| deinstall_date | text | deinstall_date | Date of deinstallation (null if still active) | Filtering |
| screen_type | text | Screen Type | Type of screen hardware | Detail |
| screen_size | text | Screen Size  | Physical screen size (NOTE: trailing space in Airtable field name!) | Detail |
| navori_venue_id | text | Navori Venue ID (from Installationen) | Navori CMS venue ID (lookup from Installation) | Vistar linking |
| location_name | text | Location Name | Name of the restaurant/location (lookup) | Dashboard, Search |
| city | text | City | City name (lookup) | Filtering, KPIs |
| street | text | Street | Street name (lookup) | Detail |
| street_number | text | Street Number | House number (lookup) | Detail |
| postal_code | text | Postal Code | ZIP code (lookup) | Detail |
| jet_id | text | JET ID (from JET ID) | JET location identifier (lookup) | Cross-referencing |
| sov_partner_ad | text | SoV Partner Ad | Share of Voice partner advertisement status | Revenue |
| created_at | text | Created | Record creation timestamp | Sorting |
| updated_at | timestamptz | -- | Last sync timestamp (auto-set) | Cache management |

---

### Table: `stammdaten`

**Source:** Airtable
**Airtable Table:** `tblLJ1S7OUhc2w5Jw` ("Stammdaten" / Master Data)
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| airtable_id | text | (record ID) | For orphan cleanup | Sync |
| jet_id | text | JET ID | JET location identifier (lookup, first value) | Cross-referencing |
| display_ids | jsonb | Display ID | Array of linked display IDs | Linking |
| location_name | text | Location Name | Restaurant/location name | Dashboard, Detail |
| contact_person | text | Contact Person | Primary contact name | CRM, Detail |
| contact_email | text | Contact Email | Primary contact email | CRM, Detail |
| contact_phone | text | Contact Phone | Primary contact phone | CRM, Detail |
| location_email | text | Location Email | Location-specific email | CRM |
| location_phone | text | Location Phone | Location-specific phone | CRM |
| legal_entity | text | Legal Entity | Legal entity of the location | Contracts |
| street | text | Street | Street name | Detail |
| street_number | text | Street Number | House number | Detail |
| postal_code | text | Postal Code | ZIP code | Detail |
| city | text | City | City name | Filtering |
| lead_status | jsonb | Lead Status  (from Akquise) | Lead statuses from linked Akquise records (array, NOTE: double space in field name) | Pipeline |
| display_status | text | Status | Overall location status | Filtering |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `tasks`

**Source:** Airtable
**Airtable Table:** `tblcKHWJg77mgIQ9l` ("Tasks")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| airtable_id | text | (record ID) | For orphan cleanup | Sync |
| title | text | Task Title | Task title/description | Task list, Chat |
| task_type | jsonb | Company (from Partner) / Partner / Task Type | Partner/company name(s). Priority: Company lookup > Partner > Task Type | Filtering, KPIs |
| task_type_select | jsonb | Task Type | Original Task Type select values (array) | Filtering |
| status | text | Status | Task status: New/In Progress/Done/etc. | KPIs, Filtering |
| priority | text | Priority | Priority level: Low/Medium/High/Urgent | Sorting, KPIs |
| due_date | text | Due Date | Task due date (ISO format) | Calendar, Overdue |
| description | text | Description | Full task description text | Detail, Chat |
| created_time | text | Created time | Auto-generated creation timestamp | Sorting |
| responsible_user | text | Responsible User | Responsible user name (collaborator field) | Assignment |
| assigned | jsonb | Assigned | Array of assigned user names (collaborator field) | Assignment |
| created_by | text | Created by | Creator user name (collaborator field) | Audit |
| display_ids | jsonb | Display ID (from Displays ) | Linked display IDs (lookup, NOTE: trailing space) | Cross-referencing |
| location_names | jsonb | Location Name (from Locations) | Linked location names (lookup) | Search, Filtering |
| overdue | text | Overdue | Overdue flag/value (formula field) | KPIs |
| completed_date | text | completed_task_date | Date task was completed | KPIs |
| completed_by | text | completed_task_by | User who completed the task | Audit |
| online_status | jsonb | Online Status  (from Displays ) | Display online status (lookup) | Context |
| live_since | jsonb | Live since (from Displays ) | Display live-since dates (lookup) | Context |
| installation_status | jsonb | Status Installation (from Installation) | Installation status (lookup) | Context |
| integrator | jsonb | Integrator (from Installation) | Integrator company (lookup) | Context |
| install_date | jsonb | Aufbau Datum (from Installation) | Installation dates (lookup) | Context |
| display_serial_number | jsonb | Display Serial Number (from Installation) | Serial numbers (lookup) | Context |
| install_remarks | jsonb | Allgemeine Bemerkungen (from Installation) | Installation remarks (lookup) | Context |
| install_type | jsonb | Installationsart (from Installation) | Installation type (lookup) | Context |
| external_visibility | boolean | external_visiblity | Whether task is visible to external partners (NOTE: typo in field name) | Permissions |
| nacharbeit_kommentar | text | Kommentar Nacharbeit | Rework/follow-up comment | Detail |
| superchat | boolean | Superchat | Whether Superchat integration is active | Communication |
| status_changed_by | text | Status changed by | User who last changed task status | Audit |
| status_changed_date | text | Status changed date | Date of last status change | Audit |
| jet_ids | jsonb | JET ID (from Locations) | JET IDs (lookup) | Cross-referencing |
| cities | jsonb | City (from Locations) | Cities (lookup) | Filtering |
| attachments | jsonb | Attachments | File attachments (see Attachment Fields section) | Detail |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `acquisition`

**Source:** Airtable
**Airtable Table:** `tblqFMBAeKQ1NbSI8` ("Acquisition_DB")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| airtable_id | text | (record ID) | For orphan cleanup | Sync |
| akquise_id | text | Akquise ID | Unique acquisition identifier | Linking |
| lead_status | text | Lead_Status | Current lead status: New Lead/Contacted/Approved/Frequency Check/Ready for Install/Gewonnen/Storno/etc. | Pipeline KPIs |
| frequency_approval | text | frequency_approval (previous FAW Check) | Frequency approval status | Pipeline |
| install_approval | text | install_approval | Installation approval status | Pipeline |
| approval_status | text | approval_status | General approval status | Pipeline |
| acquisition_date | text | Acquisition Date | Date of acquisition | KPIs |
| installations_status | jsonb | Installations Status | Installation status(es) from linked records (lookup, array) | Pipeline |
| display_location_status | jsonb | Display Location Status | Display location status(es) (lookup, array) | Pipeline |
| city | jsonb | City | City name(s) (lookup, array) | Filtering, KPIs |
| location_name | text | Location Name_new | Restaurant/location name (lookup, first value) | Dashboard |
| street | text | Street | Street name (lookup, first value) | Detail |
| street_number | text | Street Number | House number (lookup, first value) | Detail |
| postal_code | text | Postal Code | ZIP code (lookup, first value) | KPIs (PLZ analysis) |
| jet_id | text | JET_ID | JET location ID (lookup, first value) | Cross-referencing |
| contact_person | text | Contact Person | Contact name (lookup, first value) | CRM |
| contact_email | text | Contact Email | Contact email (lookup, first value) | CRM |
| contact_phone | text | Contact Phone | Contact phone (lookup, first value) | CRM, Install Booker |
| acquisition_partner | text | Akquisition Partner Name (from Team) | Acquisition partner/team name (lookup, first value) | KPIs |
| dvac_week | numeric | # dVAC / Woche 100% SoV | Daily verified ad contacts per week at 100% SoV | Revenue |
| schaufenster | text | Schaufenster einsehbar | Window visibility (Ja/Nein) | Detail |
| hindernisse | text | Hindernisse vorhanden | Obstacles present (Ja/Nein) | Detail |
| mount_type | text | Mount Type | Screen mount type | Detail |
| submitted_by | text | Submitted By | Who submitted the acquisition | Audit |
| submitted_at | text | Submitted At | When acquisition was submitted | Audit |
| vertrag_vorhanden | text | Vertrag PDF vorhanden | Whether contract PDF exists | Contracts |
| akquise_storno | boolean | Akquise Storno | Whether acquisition was cancelled pre-installation | KPIs (Storno) |
| post_install_storno | boolean | Post-Install Storno | Whether cancelled post-installation (churn) | KPIs (Storno) |
| post_install_storno_grund | jsonb | Post-Install Storno Grund | Reason(s) for post-install cancellation (array) | KPIs |
| ready_for_installation | boolean | ready_for_installation | Whether location is ready for installation | Install Booker |
| created_at | text | Created | Record creation timestamp | Sorting |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `dayn_screens`

**Source:** Airtable
**Airtable Table:** `Dayn Screens` (referenced by name, not ID)
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| airtable_id | text | (record ID) | For orphan cleanup | Sync |
| dayn_screen_id | text | Dayn_Screen_ID | Dayn network screen identifier | Linking |
| do_screen_id | text | DO_Screen_ID | DO (Digital Out-of-Home) screen ID | Linking |
| screen_status | text | Screen Status | Current screen status | Dashboard |
| network | text | -- | Always 'dayn' (hardcoded) | Filtering |
| location_name | text | location_name | Location name | Dashboard |
| address | text | Street with Number / address | Full street address | Detail |
| city | text | city | City name | Filtering |
| region | text | region | Region | Filtering |
| country | text | country | Country code (default: 'GER') | Filtering |
| zip_code | text | zip_code | ZIP code (handles object format: {value: "..."}) | Filtering |
| venue_type | text | venue type | Venue type classification | Filtering |
| floor_cpm | numeric | floor CPM | Floor CPM rate | Revenue |
| screen_width_px | integer | screen width (px) | Screen width in pixels | Tech specs |
| screen_height_px | integer | screen height (px) | Screen height in pixels | Tech specs |
| latitude | numeric | latitude | GPS latitude | Map |
| longitude | numeric | longitude | GPS longitude | Map |
| screen_inch | text | Screen_Inch | Screen diagonal in inches | Tech specs |
| screen_type | text | Screen_Type | Screen technology type | Tech specs |
| max_video_length | text | Maximun video spot lenth (seconds) | Max video spot duration (NOTE: typo in Airtable) | Ad specs |
| min_video_length | text | Minimum video spot lenth (seconds) | Min video spot duration (NOTE: typo in Airtable) | Ad specs |
| static_duration | text | static duration (in seconds) | Static image display duration | Ad specs |
| static_supported | boolean | static_supported (can your screens run images JPG/PNG) | Whether static images are supported | Ad specs |
| video_supported | boolean | video_supported (can your screens run video?) | Whether video is supported | Ad specs |
| dvac_week | numeric | # dVAC / Woche 100% SoV | Daily verified ad contacts per week | Revenue |
| dvac_month | numeric | dVAC / Month | Daily verified ad contacts per month | Revenue |
| dvac_day | numeric | dVAC per Day | Daily verified ad contacts per day | Revenue |
| impressions_per_spot | numeric | Impressions per Spot | Impressions per ad spot | Revenue |
| install_year | text | install_year | Year of installation | Detail |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `installationen`

**Source:** Airtable
**Airtable Table:** `tblKznpAOAMvEfX8u` ("Installationen")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| airtable_id | text | (record ID) | For orphan cleanup | Sync |
| display_ids | jsonb | Display Table ID (from Link to Display ID ) | Linked display table IDs (lookup, NOTE: trailing space) | Cross-referencing |
| install_date | text | Aufbau Datum | Installation date | KPIs, Calendar |
| status | text | Status Installation | Status: Installiert/Abgebrochen/In Planung/etc. | KPIs |
| installation_type | text | Installationsart | Installation type | Detail |
| integrator | text | Company (from Integrator) | Integrator company name (lookup, joined) | KPIs |
| technicians | jsonb | Name (from Technikers) | Technician names (lookup, array) | Detail |
| protocol_url | text | Installationsprotokoll | URL of first installation protocol attachment | Detail |
| protocol_filename | text | Installationsprotokoll | Filename of first protocol attachment | Detail |
| screen_type | text | Screen Art | Screen art/type | Detail |
| screen_size | text | Screen Size | Screen size | Detail |
| ops_nr | text | OPS Nr | OPS hardware number | Hardware linking |
| sim_id | text | SIM-ID | SIM card ID | Hardware linking |
| install_start | text | Installationsstart | Installation start time | Detail |
| install_end | text | Installationsabschluss | Installation end time | Detail |
| remarks | text | Allgemeine Bemerkungen | General remarks | Detail |
| partner_name | text | Abnahme Partner (Name) | Acceptance partner name | Detail |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `communications`

**Source:** Airtable
**Airtable Table:** `tblDk1dl4J3Ow3Qde` ("Activity Log")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| airtable_id | text | (record ID) | For orphan cleanup | Sync |
| channel | text | Channel | Communication channel (Email/WhatsApp/Phone/etc.) | Communication tab |
| direction | text | Direction | Inbound/Outbound | Communication tab |
| subject | text | Subject | Message subject | Communication tab |
| message | text | Message | Full message content | Communication tab |
| timestamp | text | Timestamp | Message timestamp | Sorting |
| status | text | Status | Message status (Sent/Delivered/Read/Failed) | Communication tab |
| recipient_name | text | Recipient Name | Recipient name | Communication tab |
| recipient_contact | text | Recipient Contact | Recipient phone/email | Communication tab |
| sender | text | Sender | Sender name | Communication tab |
| external_id | text | External ID | External system message ID (Superchat, etc.) | Deduplication |
| location_ids | jsonb | Location | Linked location record IDs (array) | Cross-referencing |
| location_names | jsonb | Location Name (from Location) | Location names (lookup, array) | Display |
| display_ids | jsonb | Display ID (from Location) | Display IDs (lookup, array) | Cross-referencing |
| jet_ids | jsonb | JET ID (from Location) | JET IDs (lookup, array) | Cross-referencing |
| related_task | jsonb | Related Task | Linked task record IDs (array) | Cross-referencing |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `hardware_ops`

**Source:** Airtable
**Airtable Table:** `tbl7szvfLUjsUvMkH` ("OPS Player Inventory")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| ops_nr | text | OpsNr. | OPS player number (human-readable ID) | Hardware mgmt |
| status | text | status | Device status (In Betrieb/Lager/Defekt/etc.) | Hardware KPIs |
| ops_sn | text | OPS-SN | OPS serial number | Hardware tracking |
| hardware_type | text | ops_hardware_type | Hardware type/model | Hardware mgmt |
| navori_venue_id | text | navori_venueID | Navori CMS venue ID | Vistar linking |
| sim_record_id | text | SimID | Linked SIM record ID (first value) | Hardware linking |
| sim_id | text | SimID (from SimID) | SIM identifier (lookup, first value) | Hardware linking |
| display_record_id | text | display_inventory | Linked display inventory record (first value) | Hardware linking |
| display_sn | text | display_serial_number (from display_inventory) | Display serial number (lookup, first value) | Hardware linking |
| display_location_id | text | Live Display Locations | Linked display location (first value) | Location linking |
| location_online_status | text | Online Status  (from Live Display Locations) | Online status from location (lookup, first, NOTE: double space) | Hardware dashboard |
| partner_id | text | Partner | Partner record ID (first value) | Partner linking |
| note | text | note | Notes | Detail |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `hardware_sim`

**Source:** Airtable
**Airtable Table:** `tblaV4UQX6hhcSDAj` ("SIM Inventory")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| sim_id | text | SimID | SIM card identifier | Hardware linking |
| activate_date | text | activate_date | SIM activation date | Hardware mgmt |
| ops_record_id | text | OPS_Player_inventory 2 | Linked OPS record ID (first value) | Hardware linking |
| status | text | status | SIM status | Hardware KPIs |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `hardware_displays`

**Source:** Airtable
**Airtable Table:** `tblaMScl3j45Q4Dtc` ("Display Inventory")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| display_serial_number | text | display_serial_number | Physical display serial number | Hardware tracking |
| location | text | location | Current location/status | Hardware mgmt |
| ops_record_id | text | OPS_Player_inventory | Linked OPS record ID (first value) | Hardware linking |
| status | text | status | Display status | Hardware KPIs |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `chg_approvals`

**Source:** Airtable
**Airtable Table:** `tblvj4qjJpBVLbY7F` ("CHG Approval" -- Bank Leasing Approvals)
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| jet_id_location | text | JET ID Location | JET location reference | Cross-referencing |
| asset_id | text | Asset ID | Bank leasing asset ID | Financial |
| display_sn | text | Display SN | Display serial number | Hardware linking |
| integrator_invoice_no | text | Integrator Invoice No | Integrator invoice reference | Financial |
| chg_certificate | text | Installation certificate at the bank (CHG) | Bank installation certificate | Compliance |
| invoice_date | text | Invoice date | Invoice date | Financial |
| rental_start | text | Rental start date at the bank | Bank rental start date | Financial |
| rental_end | text | Rental end date at the bank | Bank rental end date | Financial |
| payment_released_on | text | Payment released on | Payment release date | Financial |
| payment_released_by | text | Payment released by | Who released the payment | Financial |
| status | text | Status | Approval status | Compliance |
| installation_id | text | Installation | Linked installation record ID (first value) | Cross-referencing |
| inspection_status | jsonb | Inspection Status | Inspection status values (array) | Compliance |
| display_id | jsonb | DisplayID | Display IDs (lookup, array) | Cross-referencing |
| location_name | jsonb | Location Name | Location names (lookup, array) | Display |
| city | jsonb | City | Cities (lookup, array) | Filtering |
| address | jsonb | Address | Addresses (lookup, array) | Detail |
| created_at | text | created | Record creation timestamp | Sorting |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `hardware_swaps`

**Source:** Airtable
**Airtable Table:** `tblzFHk0HhB4bNYJ4` ("Hardware Swaps")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| swap_id | text | Tausch-ID | Human-readable swap identifier | Hardware mgmt |
| display_location_id | text | Live Display Location | Linked display location (first value) | Location linking |
| swap_type | jsonb | Tausch-Typ | Type(s) of swap (array) | Hardware mgmt |
| swap_date | text | Tausch-Datum | Swap date | Calendar |
| swap_reason | text | Tausch-Grund | Reason for swap | Hardware KPIs |
| partner_id | text | Partner | Partner record ID (first value) | Partner linking |
| technician | text | Techniker | Technician name | Detail |
| old_hardware_ids | jsonb | ALTE Hardware | Old hardware record IDs (array) | Hardware tracking |
| new_hardware_ids | jsonb | NEUE Hardware | New hardware record IDs (array) | Hardware tracking |
| defect_description | text | Defekt-Beschreibung | Description of defect | Detail |
| status | text | Status | Swap status | Hardware mgmt |
| location_name | text | Location Name (from Live Display Location) | Location name (lookup, first value) | Display |
| city | text | City (from Live Display Location) | City (lookup, first value) | Filtering |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `hardware_deinstalls`

**Source:** Airtable
**Airtable Table:** `tbltdxgzDeNz9d0ZC` ("Deinstallationen")
**Sync:** Every 2h via sync-airtable
**Upsert Key:** `id`

| Supabase Column | Type | Airtable Field | Description | Used In |
|----------------|------|----------------|-------------|---------|
| id | text (PK) | (record ID) | Airtable record ID | Everywhere |
| deinstall_id | text | Deinstallations-ID | Human-readable deinstallation ID | Hardware mgmt |
| display_location_id | text | Live Display Location | Linked display location (first value) | Location linking |
| ops_record_id | text | OPS-Nr / Hardware-Set | Linked OPS record (first value) | Hardware linking |
| deinstall_date | text | Deinstallationsdatum | Deinstallation date | KPIs |
| reason | text | Grund | Reason for deinstallation | KPIs |
| partner_id | text | Partner | Partner record ID (first value) | Partner linking |
| technician | text | Techniker | Technician name | Detail |
| hardware_condition | text | Hardware-Zustand | Hardware condition after removal | Hardware mgmt |
| condition_description | text | Zustandsbeschreibung | Detailed condition description | Detail |
| status | text | Status | Deinstallation status | Hardware mgmt |
| location_name | text | Location Name (from Live Display Location) | Location name (lookup, first value) | Display |
| city | text | City (from Live Display Location) | City (lookup, first value) | Filtering |
| updated_at | timestamptz | -- | Last sync timestamp | Cache management |

---

## Synced Tables (Google Sheets -> Supabase)

### Table: `display_heartbeats`

**Source:** Google Sheets (Navori CSV export)
**Sheet URL:** `docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s`
**Sync:** Every 2h (append-only, uses `Prefer: resolution=ignore-duplicates`)

| Supabase Column | Type | CSV Column | Description | Used In |
|----------------|------|------------|-------------|---------|
| timestamp | text | Timestamp | Raw timestamp string (German format: DD.MM.YYYY HH:MM) | Sorting |
| timestamp_parsed | timestamptz | Timestamp | Parsed ISO 8601 timestamp | Time queries |
| display_id | text | Display ID | Stable display ID (part before "/" if present) | Linking |
| raw_display_id | text | Display ID | Full raw display ID (may contain "/suffix") | Debug |
| location_name | text | Location Name | Location/venue name | Display |
| serial_number | text | Serial Number | Device serial number | Hardware |
| registration_date | text | Date | Registration/event date | Detail |
| heartbeat | text | Status | Heartbeat status value | Health KPIs |
| is_alive | text | Is Alive | Alive flag (Yes/No) | Health KPIs |
| display_status | text | Display Status | Display status label | Health KPIs |
| last_online_date | text | Last Online Date | Last time the display was online | Health KPIs |
| days_offline | integer | Days Offline | Number of days offline | Health KPIs, Alerts |

---

## Synced Tables (Vistar -> Supabase)

### Table: `vistar_venues`

**Source:** Vistar SSP API (Platform + Trafficking)
**Sync:** Daily at 03:00 UTC via vistar-sync-scheduled

| Supabase Column | Type | Source | Description | Used In |
|----------------|------|--------|-------------|---------|
| id | text (PK) | partner_venue_id | Vistar venue ID | Everywhere |
| partner_venue_id | text | partner_venue_id | Duplicate of id | Revenue linking |
| name | text | venue_name / venue | Venue/location name | Revenue dashboard |
| is_active | boolean | -- | Whether venue is actively requesting (auto-set) | Filtering |
| synced_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `vistar_venue_health`

**Source:** Vistar SSP API (Exchange Report)
**Sync:** Daily at 03:00 UTC (90-day window)
**Upsert Key:** `venue_id, report_date` (composite)

| Supabase Column | Type | Source | Description | Used In |
|----------------|------|--------|-------------|---------|
| venue_id | text | partner_venue_id / venue_id | Vistar venue ID | Revenue linking |
| report_date | date | date | Report date (YYYY-MM-DD) | Time series |
| is_requesting | boolean | calculated | Whether venue had spots > 0 | Health status |
| requested_spots | integer | spots | Number of ad spots requested/served | Revenue KPIs |
| spent_spots | integer | spots | Spots spent (same as requested) | Revenue KPIs |
| impressions | numeric | impressions | Ad impressions delivered | Revenue KPIs |
| partner_revenue | numeric | partner_revenue | Revenue earned (EUR, 2 decimal) | Revenue KPIs |
| partner_profit | numeric | partner_profit | Profit earned (EUR, 2 decimal) | Revenue KPIs |
| partner_ecpm | numeric | partner_eCPM | Effective CPM (averaged, 2 decimal) | Revenue KPIs |
| synced_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `vistar_networks`

**Source:** Vistar Platform API (/networks)
**Sync:** Manual via vistar-sync

| Supabase Column | Type | Source | Description | Used In |
|----------------|------|--------|-------------|---------|
| id | text (PK) | id | Vistar network ID | Revenue |
| name | text | name | Network name | Revenue dashboard |
| api_key | text | api_key | Network API key | Integration |
| raw_data | jsonb | (full record) | Complete raw network data | Debug |
| synced_at | timestamptz | -- | Last sync timestamp | Cache management |

---

### Table: `vistar_sync_log`

**Source:** Supabase-only (written by sync functions)

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| sync_type | text | Type: scheduled_90d / manual / etc. | Monitoring |
| status | text | success / error | Monitoring |
| records_synced | integer | Number of records synced | Monitoring |
| error_message | text | Error message (if failed) | Debugging |
| duration_ms | integer | Sync duration in milliseconds | Performance |
| started_at | timestamptz | Sync start time | Monitoring |
| completed_at | timestamptz | Sync completion time | Monitoring |

---

## Supabase-Only Tables

### Table: `install_routen`

**Source:** Supabase-only (managed via install-schedule API)
**Purpose:** Installation route schedules -- which cities on which dates

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| id | uuid (PK) | Auto-generated UUID | Everywhere |
| city | text | City name | Scheduling, Filtering |
| schedule_date | date | Scheduled installation date | Calendar |
| installer_team | text | Installer team name | Scheduling |
| max_capacity | integer | Maximum installations per day (default: 8) | Capacity check |
| time_slots | jsonb | Available time slots (JSON array, e.g. ["08:00","10:00",...,"22:00"]) | Booking |
| status | text | Route status: open / closed / completed | Filtering |
| notes | text | Internal notes | Detail |
| airtable_id | text | Optional Airtable record link (currently unused) | Future sync |
| created_at | timestamptz | Auto-generated creation time | Sorting |
| updated_at | timestamptz | Auto-updated modification time | Cache |

---

### Table: `install_bookings`

**Source:** Supabase-only (managed via install-booker-* APIs)
**Purpose:** Installation appointment bookings -- links Akquise records to time slots

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| id | uuid (PK) | Auto-generated UUID | Everywhere |
| booking_token | text (unique) | Unique token for public booking link (UUID format) | Booking page |
| akquise_airtable_id | text | Linked Airtable Akquise record ID | Cross-referencing |
| location_name | text | Restaurant/location name | Display |
| city | text | City name | Filtering, Route matching |
| contact_name | text | Contact person name | Communication |
| contact_phone | text | Contact phone number | WhatsApp messaging |
| jet_id | text | JET location ID | Cross-referencing |
| status | text | Booking status: pending/booked/confirmed/cancelled | Workflow |
| booked_date | date | Selected installation date | Calendar |
| booked_time | text | Selected time slot (e.g. "10:00") | Calendar |
| booked_end_time | text | Calculated end time (+1.5h, e.g. "11:30") | Calendar |
| route_id | uuid (FK) | Linked install_routen ID | Route matching |
| notes | text | Customer/internal notes | Detail |
| created_at | timestamptz | Auto-generated creation time | Expiry check (14 days) |
| updated_at | timestamptz | Auto-updated modification time | Cache |

---

### Table: `app_users`

**Source:** Supabase-only (managed via user-management API + authService.js)
**Purpose:** Application user profiles linked to Supabase Auth

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| id | uuid (PK) | Auto-generated UUID | Everywhere |
| auth_id | uuid | Linked Supabase Auth user ID | Authentication |
| name | text | User display name | UI, Audit |
| email | text | User email (unique) | Login, Contact |
| phone | text | User phone number | Contact |
| group_id | text (FK) | Linked group ID (e.g. "grp_admin") | Permissions |
| active | boolean | Whether account is active (default: true) | Login gate |
| last_login | timestamptz | Timestamp of last login | Admin view |
| created_at | timestamptz | Auto-generated creation time | Admin view |

---

### Table: `groups`

**Source:** Supabase-only (managed directly in database)
**Purpose:** Permission groups defining tab access and action permissions

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| id | text (PK) | Group ID (e.g. "grp_admin", "grp_operations") | Permissions |
| name | text | Group display name (e.g. "Admin", "Operations") | UI |
| description | text | Group description | Admin view |
| color | text | CSS color hex code (e.g. "#3b82f6") | UI badges |
| icon | text | Lucide icon name (e.g. "Shield", "Wrench") | UI |
| tabs | jsonb | Array of allowed tab IDs (e.g. ["displays", "tasks"]) | Tab access |
| actions | jsonb | Array of allowed action IDs (e.g. ["view", "create_task"]) | Action permissions |
| created_at | timestamptz | Auto-generated | Admin view |

**Default Groups:**
| Group ID | Name | Purpose |
|----------|------|---------|
| grp_admin | Admin | Full access to all tabs and actions |
| grp_operations | Operations | Display management and tasks |
| grp_sales | Sales | Overview and communication |
| grp_management | Management | Reports and dashboards |
| grp_tech | Tech | Technical tasks |
| grp_scheduling | Terminierung | Installation scheduling only |

**Tab IDs:**
`displays`, `displays.overview`, `displays.list`, `displays.cities`, `tasks`, `communication`, `installations`, `installations.calendar`, `installations.bookings`, `admin`

**Action IDs:**
`view`, `export`, `view_contacts`, `view_revenue`, `create_task`, `edit_task`, `delete_task`, `send_message`, `view_messages`, `manage_schedule`, `manage_bookings`, `send_booking_invite`, `manage_users`, `manage_groups`, `settings`

---

### Table: `audit_log`

**Source:** Supabase-only (written by authService.js, fire-and-forget)
**Purpose:** DSGVO-compliant activity log (permanent, no deletion)

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| id | uuid (PK) | Auto-generated | Everywhere |
| action | text | Action type (login/logout/login_failed/session_expired/password_changed/user_created/user_deleted/etc.) | Admin view |
| detail | text | Human-readable detail message (German) | Admin view |
| user_id | uuid | User who performed the action (null for failed logins) | Audit trail |
| user_name | text | User name at time of action | Audit trail |
| created_at | timestamptz | Auto-generated timestamp | Sorting |

---

### Table: `bank_leasing`

**Source:** Supabase-only (imported via bank-import API from TESMA/CHG-MERIDIAN XLSX)
**Purpose:** Bank leasing contract data for display hardware
**Upsert Key:** `asset_id`

| Supabase Column | Type | Source Field (DE) | Source Field (EN) | Description | Used In |
|----------------|------|-------------------|-------------------|-------------|---------|
| asset_id | text (PK) | Asset-ID | Asset ID | Unique asset identifier | Hardware KPIs |
| serial_number | text | Seriennummer | Serial Number | Device serial number | Hardware linking |
| asset_class | text | Assetklasse | Asset Class | Asset classification | Financial |
| designation | text | Bezeichnung | Designation | Asset description | Detail |
| contract_status | text | Vertragsstatus | Contract Status | Contract status | Financial |
| customer | text | Kunde | Customer | Customer name | Financial |
| customer_id | integer | Kunden ID | -- | Customer ID number | Financial |
| rental_certificate | text | Mietschein | Rental Certificate | Rental certificate number | Financial |
| rental_start | date | Mietbeginn | -- | Rental start date | Financial |
| rental_end_planned | date | Geplantes Mietende | -- | Planned rental end date | Financial |
| rental_end_actual | date | Tatsaechliches Mietende | -- | Actual rental end date | Financial |
| monthly_price | numeric | Mietpreis | -- | Monthly rental price (EUR) | Financial KPIs |
| currency | text | Waehrung | -- | Currency (default: EUR) | Financial |
| order_number | text | Bestellnummer | Order Number | Purchase order number | Financial |
| installation_location | text | Installationsort | -- | Installation location | Linking |
| cost_center | text | Kostenstelle | Cost Center | Cost center code | Financial |
| city | text | Werk | City | City/plant | Filtering |
| manufacturer | text | Hersteller | Manufacturer | Hardware manufacturer | Hardware |
| lessor_id | integer | Leasinggeber ID | -- | Lessor company ID | Financial |
| lessor | text | Leasinggeber | Lessor | Lessor company name | Financial |
| updated_at | timestamptz | -- | -- | Last import timestamp | Cache |

---

### Table: `feedback_requests`

**Source:** Supabase-only (written via chat-proxy API, feedback mode)
**Purpose:** Feature requests and bug reports from dashboard users

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| id | uuid (PK) | Auto-generated | Everywhere |
| user_id | text | User ID who submitted | Tracking |
| user_name | text | User name | Display |
| user_email | text | User email | Contact |
| type | text | Feedback type (feature_request / bug_report) | Categorization |
| title | text | Feedback title | Display |
| description | text | Detailed description | Detail |
| priority | text | Priority level (default: "medium") | Triage |
| status | text | Status (default: "open") | Workflow |
| created_at | timestamptz | Auto-generated | Sorting |

---

### Table: `agent_memory`

**Source:** Supabase-only (written via chat-proxy API, memory-save mode)
**Purpose:** AI agent (J.E.T.) learned insights and context for improving responses

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| id | uuid (PK) | Auto-generated | Everywhere |
| category | text | Memory category: insight/decision/preference/context/pin | Filtering |
| content | text | Memory content (max 500 chars) | Chat context |
| metadata | jsonb | Additional structured metadata | Chat context |
| relevance_score | integer | Relevance score 1-10 (higher = more important) | Sorting |
| active | boolean | Whether memory is active (default: true) | Filtering |
| created_by | text | User ID or name who triggered the memory | Audit |
| use_count | integer | Number of times memory was loaded | Decay logic |
| last_used_at | timestamptz | Last time memory was loaded for context | Sorting |
| created_at | timestamptz | Auto-generated | Sorting |

---

### Table: `api_usage_log`

**Source:** Supabase-only (written by apiLogger.js in all Netlify Functions)
**Purpose:** Track all external API calls for cost monitoring and debugging

| Supabase Column | Type | Description | Used In |
|----------------|------|-------------|---------|
| function_name | text | Netlify function name (e.g. "sync-airtable", "chat-proxy") | Monitoring |
| service | text | External service: airtable/supabase/anthropic/vistar/superchat/google-sheets | Cost tracking |
| method | text | HTTP method (GET/POST/PATCH/DELETE/STREAM) | Monitoring |
| endpoint | text | API endpoint path | Debugging |
| duration_ms | integer | Request duration in milliseconds | Performance |
| status_code | integer | HTTP response status code | Error tracking |
| success | boolean | Whether the call succeeded | Alerting |
| tokens_in | integer | Input tokens (Claude API only) | Cost tracking |
| tokens_out | integer | Output tokens (Claude API only) | Cost tracking |
| records_count | integer | Number of records processed | Monitoring |
| bytes_transferred | integer | Data size in bytes | Monitoring |
| estimated_cost_cents | numeric | Estimated cost in cents | Cost tracking |
| user_id | text | User who triggered the call | Audit |
| error_message | text | Error message (if failed) | Debugging |
| metadata | jsonb | Additional structured metadata | Debugging |
| created_at | timestamptz | Auto-generated | Time series |

---

## Airtable Table IDs

| Table Name | Table ID | Supabase Table | Description |
|-----------|----------|----------------|-------------|
| Stammdaten | `tblLJ1S7OUhc2w5Jw` | `stammdaten` | Master data / location records |
| Live Display Locations | `tblS6cWN7uEhZHcie` | `airtable_displays` | Active display records |
| Tasks | `tblcKHWJg77mgIQ9l` | `tasks` | Operational tasks |
| Acquisition_DB | `tblqFMBAeKQ1NbSI8` | `acquisition` | Acquisition pipeline |
| Dayn Screens | (by name) | `dayn_screens` | Dayn network screen inventory |
| Installationen | `tblKznpAOAMvEfX8u` | `installationen` | Installation records |
| Activity Log | `tblDk1dl4J3Ow3Qde` | `communications` | Communication log |
| OPS Player Inventory | `tbl7szvfLUjsUvMkH` | `hardware_ops` | OPS media player inventory |
| SIM Inventory | `tblaV4UQX6hhcSDAj` | `hardware_sim` | SIM card inventory |
| Display Inventory | `tblaMScl3j45Q4Dtc` | `hardware_displays` | Physical display inventory |
| CHG Approval | `tblvj4qjJpBVLbY7F` | `chg_approvals` | Bank leasing approvals |
| Hardware Swaps | `tblzFHk0HhB4bNYJ4` | `hardware_swaps` | Hardware swap records |
| Deinstallationen | `tbltdxgzDeNz9d0ZC` | `hardware_deinstalls` | Deinstallation records |

**All tables belong to Airtable Base:** `apppFUWK829K6B3R2`

---

## API Endpoints

### Sync Functions

| Endpoint | Method | Function | Purpose | Auth | Schedule |
|----------|--------|----------|---------|------|----------|
| (scheduled) | -- | `sync-airtable.js` | Full Airtable + Sheets -> Supabase sync (all 14 tables) | SYNC_SECRET | Every 2h (`0 */2 * * *`) |
| `/api/trigger-sync` | GET | `trigger-sync-background.js` | Manual sync trigger (batched, 3 concurrent max) | Open (CORS) | Manual |
| `/api/vistar-sync` | GET | `vistar-sync.js` | Manual Vistar sync (?type=all/networks/report, ?days=N) | Open (CORS) | Manual |
| (scheduled) | -- | `vistar-sync-scheduled.js` | Daily Vistar 90-day sync | -- | Daily 03:00 UTC |

### Data Proxies

| Endpoint | Method | Function | Purpose | Auth |
|----------|--------|----------|---------|------|
| `/api/sheets` | GET | `sheets-proxy.js` | Proxy Google Sheets CSV export (Navori heartbeats) | Origin CORS |
| `/api/vistar/*` | GET/POST | `vistar-proxy.js` | Proxy Vistar SSP APIs (report, networks) | Origin CORS |
| `/api/superchat/*` | * | `superchat-proxy.js` | Proxy Superchat REST API (WhatsApp messaging) | Origin CORS |

### Chat / AI

| Endpoint | Method | Function | Mode | Purpose | Auth |
|----------|--------|----------|------|---------|------|
| `/api/chat` | POST | `chat-proxy.js` | mode=chat | Stream Claude AI responses (Haiku 4.5) | Origin CORS |
| `/api/chat` | POST | `chat-proxy.js` | mode=feedback | Save feature request / bug report | Origin CORS |
| `/api/chat` | POST | `chat-proxy.js` | mode=memory-save | Save agent memory entry | Origin CORS |
| `/api/chat` | POST | `chat-proxy.js` | mode=memory-load | Load top 20 active memories | Origin CORS |

### User Management

| Endpoint | Method | Function | Purpose | Auth |
|----------|--------|----------|---------|------|
| `/api/users/add` | POST | `user-management.js` | Create new user (Auth + profile) | Origin CORS |
| `/api/users/update` | PATCH | `user-management.js` | Update user group | Origin CORS |
| `/api/users/delete` | DELETE | `user-management.js` | Delete user (Auth + profile) | Origin CORS |
| `/api/users/reset` | POST | `user-management.js` | Reset user password | Origin CORS |

### Installation Scheduling

| Endpoint | Method | Function | Purpose | Auth |
|----------|--------|----------|---------|------|
| `/api/install-schedule` | GET | `install-schedule.js` | List routes (?city=&from=&to=&status=) | Origin CORS / API Key |
| `/api/install-schedule` | POST | `install-schedule.js` | Create new route | Origin CORS / API Key |
| `/api/install-schedule/:id` | PATCH | `install-schedule.js` | Update route | Origin CORS / API Key |
| `/api/install-schedule/:id` | DELETE | `install-schedule.js` | Delete route | Origin CORS / API Key |

### Install Booker (Public Booking Flow)

| Endpoint | Method | Function | Purpose | Auth |
|----------|--------|----------|---------|------|
| `/api/install-booker/slots` | GET | `install-booker-slots.js` | Get available slots (?token=) | Public (token) |
| `/api/install-booker/book` | POST | `install-booker-book.js` | Book appointment {token, date, time} | Public (token) |
| `/api/install-booker/status` | GET | `install-booker-status.js` | Get booking status (?token=) | Public (token) |
| `/api/install-booker/invite` | POST | `install-booker-invite.js` | Send booking invite via WhatsApp | API Key (x-api-key) |
| `/api/install-booker/detail` | GET | `install-booker-detail.js` | Get Akquise detail (?bookingId= / ?city=) | JWT / API Key |

### Data Import

| Endpoint | Method | Function | Purpose | Auth |
|----------|--------|----------|---------|------|
| `/api/bank-import` | POST | `bank-import.js` | Import bank leasing XLSX data | Origin CORS |

---

## Attachment Fields

### Tasks: `attachments` (jsonb array)

Each attachment object contains:

```json
{
  "url": "https://dl.airtable.com/.../filename.jpg",
  "filename": "photo_2025.jpg",
  "size": 245760,
  "type": "image/jpeg",
  "id": "att...",
  "thumbnails": {
    "small": { "url": "...", "width": 36, "height": 36 },
    "large": { "url": "...", "width": 512, "height": 512 },
    "full": { "url": "...", "width": 1920, "height": 1080 }
  }
}
```

**NOTE:** Airtable attachment URLs are temporary (expire after ~2h). They are re-fetched on each sync.

### Installationen: `protocol_url` / `protocol_filename`

The first attachment from the `Installationsprotokoll` Airtable attachment field. Contains the installation protocol document (typically PDF or image).

### Acquisition (via install-booker-detail direct Airtable fetch)

When fetched directly from Airtable (not via sync), the following attachment fields are available:

| Field | Airtable Source | Description |
|-------|----------------|-------------|
| images | images_akquise | Acquisition photos (full Airtable attachment array) |
| vertragPdf | Vertrag (PDF) | Contract PDF documents |
| fawDataAttachment | FAW_data_attachment | Frequency approval data files |
| installationsprotokoll | Installationsprotokoll (from Installationen) | Installation protocols (lookup) |

---

## KPIs and Calculated Metrics

### Display Health KPIs (calculated in frontend from `airtable_displays` + `display_heartbeats`)

| KPI | Formula | Source Fields | Component |
|-----|---------|--------------|-----------|
| Total Displays | Count of active displays (no deinstall_date) | `airtable_displays.deinstall_date` | Overview |
| Online Count | Count where online_status = "Online" | `airtable_displays.online_status` | Overview |
| Warning Count | Count where online_status = "Warning" | `airtable_displays.online_status` | Overview |
| Critical Count | Count where online_status = "Critical" | `airtable_displays.online_status` | Overview |
| Permanent Offline | Count where online_status = "Permanent Offline" | `airtable_displays.online_status` | Overview |
| Health Rate | (Online / Total) * 100 | Calculated | Overview, Trend |
| New Displays (30d) | Count where live_since within last 30 days | `airtable_displays.live_since` | Overview |
| Days Offline | From heartbeat data | `display_heartbeats.days_offline` | Alerts |

### Task KPIs (calculated in frontend from `tasks`)

| KPI | Formula | Source Fields | Component |
|-----|---------|--------------|-----------|
| Open Tasks | Count where status not in (Done, Completed) | `tasks.status` | Task dashboard |
| Completed Tasks | Count where status in (Done, Completed) | `tasks.status` | Task dashboard |
| By Status | Group by status | `tasks.status` | Task dashboard |
| By Partner | Group by task_type | `tasks.task_type` | Task dashboard |
| By Priority | Group by priority | `tasks.priority` | Task dashboard |
| Overdue Tasks | Count where overdue flag is set | `tasks.overdue` | Alerts |
| Problem Categories | Auto-categorize tasks by title/description keywords | `tasks.title`, `tasks.description` | Chat, Analysis |
| Location Hotspots | Top 15 locations by open task count | `tasks.location_names` | Chat, Analysis |
| Partner Performance | Top 10 partners by overdue rate | `tasks.task_type`, `tasks.overdue` | Chat, Analysis |

### Acquisition / Pipeline KPIs (calculated in frontend from `acquisition`)

| KPI | Formula | Source Fields | Component |
|-----|---------|--------------|-----------|
| Total Pool | Count of all acquisition records | `acquisition.*` | Pipeline |
| Active Pipeline | Total - New Leads - Stornos | `acquisition.lead_status` | Pipeline |
| By Lead Status | Group by lead_status | `acquisition.lead_status` | Pipeline |
| By City | Group by city array values | `acquisition.city` | Pipeline |
| Ready for Install | Count where ready_for_installation = true | `acquisition.ready_for_installation` | Pipeline |
| With Contract | Count where vertrag_vorhanden is set | `acquisition.vertrag_vorhanden` | Pipeline |
| Storno Count | Count where akquise_storno = true | `acquisition.akquise_storno` | Pipeline |
| Post-Install Storno | Count where post_install_storno = true | `acquisition.post_install_storno` | Pipeline |
| Install Rate | installed / active pipeline * 100 | Calculated | Pipeline |
| By PLZ | Group by postal_code within city | `acquisition.postal_code`, `acquisition.city` | Pipeline |

### Rollout KPIs (calculated in frontend from `installationen` + `hardware_deinstalls`)

| KPI | Formula | Source Fields | Component |
|-----|---------|--------------|-----------|
| Total Installations | Count of all installation records | `installationen.*` | Rollout |
| Last 7/30/90 Days | Count by install_date within period | `installationen.install_date` | Rollout |
| By Status | Group by status (Installiert/Abgebrochen/In Planung) | `installationen.status` | Rollout |
| Top Integrators | Group by integrator, count | `installationen.integrator` | Rollout |
| Weekly Trend | Group by calendar week | `installationen.install_date` | Rollout |
| Net Installations (30d) | Installations - Deinstallations (last 30 days) | `installationen.install_date`, `hardware_deinstalls.deinstall_date` | Rollout |
| Deinstall Reasons | Group by reason | `hardware_deinstalls.reason` | Rollout |

### Hardware KPIs (calculated in frontend from hardware tables)

| KPI | Formula | Source Fields | Component |
|-----|---------|--------------|-----------|
| OPS Device Count | Count of hardware_ops | `hardware_ops.*` | Hardware tab |
| SIM Card Count | Count of hardware_sim | `hardware_sim.*` | Hardware tab |
| Bank Leasing Count | Count of chg_approvals | `chg_approvals.*` | Hardware tab |
| CHG Approval Status | Group by status | `chg_approvals.status` | Hardware tab |

### Revenue KPIs (calculated from `vistar_venue_health`)

| KPI | Formula | Source Fields | Component |
|-----|---------|--------------|-----------|
| Partner Revenue | Sum of partner_revenue by period | `vistar_venue_health.partner_revenue` | Revenue (requires permission) |
| Partner Profit | Sum of partner_profit by period | `vistar_venue_health.partner_profit` | Revenue |
| eCPM | Average of partner_ecpm | `vistar_venue_health.partner_ecpm` | Revenue |
| Impressions | Sum of impressions | `vistar_venue_health.impressions` | Revenue |
| Active Venues | Count where is_requesting = true | `vistar_venue_health.is_requesting` | Revenue |

---

## Data Flow Diagrams

### Airtable Sync Flow

```
Airtable Base (apppFUWK829K6B3R2)
  |
  |-- Stammdaten (tblLJ1S7OUhc2w5Jw)      --> stammdaten
  |-- Live Display Locations (tblS6cWN7...)  --> airtable_displays
  |-- Tasks (tblcKHWJg77mgIQ9l)             --> tasks
  |-- Acquisition_DB (tblqFMBAeKQ1NbSI8)    --> acquisition
  |-- Dayn Screens (by name)                 --> dayn_screens
  |-- Installationen (tblKznpAOAMvEfX8u)    --> installationen
  |-- Activity Log (tblDk1dl4J3Ow3Qde)      --> communications
  |-- OPS Inventory (tbl7szvfLUjsUvMkH)     --> hardware_ops
  |-- SIM Inventory (tblaV4UQX6hhcSDAj)     --> hardware_sim
  |-- Display Inventory (tblaMScl3j45Q4Dtc)  --> hardware_displays
  |-- CHG Approval (tblvj4qjJpBVLbY7F)      --> chg_approvals
  |-- Hardware Swaps (tblzFHk0HhB4bNYJ4)    --> hardware_swaps
  |-- Deinstallationen (tbltdxgzDeNz9d0ZC)   --> hardware_deinstalls
```

### Install Booker Flow

```
1. Airtable: Akquise record gets ready_for_installation = true
       |
2. Make.com automation fires
       |
3. POST /api/install-booker/invite
       |-- Check available routes in city (install_routen)
       |-- Generate booking_token (UUID)
       |-- Create pending booking (install_bookings)
       |-- Send WhatsApp via Superchat with booking link
       |-- Update Airtable Akquise with booking status
       |
4. Customer clicks booking link: /book?token=xxx
       |
5. GET /api/install-booker/slots?token=xxx
       |-- Validate token + check expiry (14 days)
       |-- Return available dates/times from install_routen
       |
6. POST /api/install-booker/book {token, date, time}
       |-- Validate slot availability
       |-- Update install_bookings: status=booked
       |-- Create Airtable Installation record
       |-- Send confirmation WhatsApp
       |-- Update Airtable Akquise approval status
```

### Vistar Revenue Flow

```
Vistar SSP Platform API
  |
  |-- /networks --> vistar_networks
  |-- /report (ssp_exchange, grouped by venue+date)
          |
          |--> vistar_venues (upsert venue records)
          |--> vistar_venue_health (daily aggregated metrics)
          |       - spots, impressions
          |       - partner_revenue, partner_profit
          |       - partner_ecpm (averaged)
          |
  |-- vistar_sync_log (sync metadata)
```

### Authentication Flow

```
User enters email + password
       |
Supabase Auth: signInWithPassword()
       |-- Returns JWT
       |
Fetch app_users + groups join
       |-- Get tabs, actions, color, icon
       |
Save to sessionStorage (dooh_user)
       |-- 8h activity timeout (DSGVO)
       |-- Touch on every interaction
       |
audit_log: write login event
```

---

## Environment Variables Required

| Variable | Used By | Purpose |
|----------|---------|---------|
| AIRTABLE_TOKEN | sync-airtable, trigger-sync, install-booker-* | Airtable API personal access token |
| SUPABASE_URL | All functions | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | All functions | Supabase service role key (bypasses RLS) |
| ANTHROPIC_API_KEY | chat-proxy | Claude AI API key |
| VISTAR_EMAIL | vistar-sync, vistar-proxy | Vistar SSP login email |
| VISTAR_PASSWORD | vistar-sync, vistar-proxy | Vistar SSP login password |
| SUPERCHAT_API_KEY | superchat-proxy, install-booker-book | Superchat REST API key |
| BOOKER_API_KEY | install-schedule, install-booker-* | API key for Make.com / external booking triggers |
| SYNC_SECRET | sync-airtable | Optional manual sync auth key |

---

## Airtable Field Name Quirks

Several Airtable fields have trailing spaces or unusual characters in their names. These are documented here for reference:

| Airtable Field | Issue | Affected Tables |
|---------------|-------|-----------------|
| `Online Status ` | Trailing space | Displays, OPS |
| `Screen Size ` | Trailing space | Displays |
| `Display ID (from Displays )` | Trailing space before `)` | Tasks |
| `Online Status  (from Displays )` | Double space + trailing space | Tasks |
| `Live since (from Displays )` | Trailing space before `)` | Tasks |
| `Lead Status  (from Akquise)` | Double space | Stammdaten |
| `Online Status  (from Live Display Locations)` | Double space | OPS |
| `Post-Install Storno` | Non-breaking hyphen (U+2011) | Acquisition |
| `Post-Install Storno Grund` | Non-breaking hyphen (U+2011) | Acquisition |
| `external_visiblity` | Typo (missing 'i' in visibility) | Tasks |
| `Maximun video spot lenth (seconds)` | Typo: "Maximun" + "lenth" | Dayn Screens |
| `Minimum video spot lenth (seconds)` | Typo: "lenth" | Dayn Screens |
