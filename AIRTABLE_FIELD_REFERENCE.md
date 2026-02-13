# Airtable Field Reference — JET Dashboard V2

> **Quelle:** Vollständige CSV-Exporte aus allen Airtable-Tabellen (2026-02-13)
> **Base ID:** `apppFUWK829K6B3R2`

---

## 1. Akquise / Acquisition Table (`tblqFMBAeKQ1NbSI8`)

### Felder (aus CSV "Acquisition_DB-All won _ Signed")

| Airtable Field | Typ | Beispielwerte |
|---|---|---|
| `Akquise ID` | Autonumber | 1, 2, 3... |
| `Lead_Status` | Single Select | **"Won / Signed"**, "New", "Baulich ungeeignet", "Kein Interesse", "Später wiederkommen", "Inbound Lead \| Contract sent", "Interessiert/ Später wiederkommen", "Inbound Lead \| Re-Check (waiting for more Data)", "Inbound Lead \| Ungeeignet / abgelehnt", "Planned", "Interessiert" |
| `approval_status` | Single Select | **"Accepted"**, **"Rejected"**, "In review", "Info required", "not tarted" (sic), "" |
| `ready_for_installation` | Checkbox | "checked" oder leer |
| `Installations Status` | Lookup (Text[]) | "Installiert", "Abgebrochen - Vorort", "Aufbau evtl. Möglich - Offene Punkte (zu klären intern)", "Installiert - Nacharbeit notwendig", "Terminiert", "Abbruch - telefonisch vorab" |
| `Display Location Status` | Lookup (Text[]) | "Live", "Deinstalled", "To be Deinstalled" |
| `Location Name_new` | Text | "Mc Donald's Hauptbahnhof" |
| `City` | Lookup (Text[]) | "Frankfurt", "Düsseldorf", "Köln", "München", "Hamburg", "Berlin" |
| `Street` | Text | "Kaiserstraße" |
| `Street Number` | Text | "42" |
| `Postal Code` | Text | "60329" |
| `JET_ID` | Linked Record | rec... |
| `Contact Person` | Text | |
| `Contact Email` | Email | |
| `Contact Phone` | Phone | |
| `Mount Type` | Single Select | "Bodenmontage", "Wandmontage", "Deckenmontage", "Sonstiges" |
| `Schaufenster einsehbar` | Checkbox/Text | |
| `Hindernisse vorhanden` | Checkbox/Text | |
| `Hindernisse Beschreibung` | Long Text | |
| `Fensterbreite ausreichend` | Checkbox/Text | |
| `Steckdose mit Strom 6-22 Uhr?` | Checkbox/Text | |
| `Akquise Kommentar` | Long Text | |
| `Akquise Kommentar (from Acquisition Update)` | Lookup | |
| `Kommentar aus Installationen` | Lookup | |
| `frequency_approval_comment` | Text | |
| `frequency_approval (previous FAW Check)` | Text | |
| `install_approval` | Text | |
| `Vertrag (PDF)` | Attachment | Array von {url, filename, size} |
| `Vertrag PDF vorhanden` | Checkbox | |
| `Vertragsnummer` | Text | |
| `Vertragspartner` | Text | |
| `Vertragsbeginn` | Date | |
| `Laufzeit` | Text | |
| `Unterschriftsdatum` | Date | |
| `images_akquise` | Attachment | Array von {url, filename, thumbnails} |
| `FAW_data_attachment` | Attachment | |
| `Installationsprotokoll (from Installationen)` | Lookup (Attachment) | |
| `Akquisition Partner Name (from Team)` | Lookup | |
| `Submitted By` | Collaborator | |
| `Submitted At` | DateTime | |
| `Acquisition Date` | Date | |
| `# dVAC / Woche 100% SoV` | Number | |
| `dVAC / Month` | Number | |
| `dVAC per Day` | Number | |
| `Latitude` | Number | |
| `Longitude` | Number | |
| `Koordinaten (from JET ID)` | Lookup | |
| `Streetview Link (from JET ID)` | Lookup | |
| `Aufbau Datum` | Lookup (Date) | |
| `Integrator (Installation)` | Lookup | "e-Systems", "MediaAV", "DAYNMEDIA GmbH" |
| `display_name (from Displays)` | Lookup | |
| `DO-ID (from Installationen)` | Lookup | |
| `Live since (from Displays)` | Lookup | |
| `Abbruchgrund` | Text | |
| `Exclude Reason` | Text | |
| `Akquise Storno` | Checkbox | |
| `Post‑Install Storno` | Checkbox | ⚠️ Non-breaking Hyphen U+2011 |
| `Post‑Install Storno Grund` | Multiple Select | ⚠️ Non-breaking Hyphen U+2011 |

### Aufbaubereit-Logik
```
Aufbaubereit = Lead_Status == "Won / Signed"
            && approval_status == "Accepted"
            && Installations Status == "" (leer)
            && Vertrag (PDF) vorhanden
```
Aktuell ~43 von 797 "Won / Signed" Records.

---

## 2. JET Stammdaten Table

### Felder (aus CSV "JET Stammdaten-Grid view", 20.102 Records)

| Airtable Field | Typ | Beispielwerte |
|---|---|---|
| `JET SEARCH` | Formula/Text | |
| `Location` | Text | |
| `JET ID` | Text | "JET-FFM-0001" |
| `Location Categories` | Multiple Select | |
| `Lead Status  (from Akquise)` | Lookup | ⚠️ DOPPELTES LEERZEICHEN vor "(from" |
| `Location Name` | Text | |
| `Legal Entity` | Text | |
| `Lega Entity Adress` | Text | ⚠️ Typo "Lega" statt "Legal" |
| `Contact Person` | Text | |
| `Location Email` | Email | |
| `Contact Email` | Email | |
| `Location Phone` | Phone | |
| `Contact Phone` | Phone | |
| `Formatted Germany Mobile Phone` | Formula | |
| `JET Chain` | Text | |
| `Street` | Text | |
| `Street Number` | Text | |
| `Postal Code` | Text | |
| `City` | Text | |
| `Restaurant Website` | URL | |
| `Weischer 30m Frequency` | Number | |
| `Latitude` | Number | |
| `Longitude` | Number | |
| `Koordinaten` | Formula | |
| `Streetview Link` | URL | |
| `Image Link` | URL | |
| `Related Tasks` | Linked Record | |
| `Attachments` | Attachment | |
| `Zur Akquise freigegeben?` | Checkbox | |
| `Akquise Freigabedatum` | Date | |
| `Akquise Freigegeben von` | Text | |
| `Location Search` | Formula | |
| `Akquise` | Linked Record | |
| `recordID` | Formula | |
| `Installationen` | Linked Record | |
| `recordID (from Installationen)` | Lookup | |
| `Displays` | Linked Record | |
| `Display ID` | Lookup | |
| `OPS NR (from Displays)` | Lookup | |
| `OPS-SN (from OPS_Player_inventory) (from Displays)` | Lookup | |
| `Installationstermine` | Linked Record | |
| `Count (Installationen)` | Count | |
| `Created By` | Collaborator | |
| `Status Installation (from Installationen)` | Lookup | |
| `regular_close_time_weekdays` | Text | |
| `closed_days` | Text | |
| `weekend_close_time` | Text | |
| `regular_open_time` | Text | |
| `regular_close_time_weekdend` | Text | ⚠️ Typo "weekdend" |
| `Brands_listed` | Text | |
| `Created` | Created Time | |
| `Online Status  (from Displays)` | Lookup | ⚠️ DOPPELTES LEERZEICHEN |
| `Live since (from Displays)` | Lookup | |
| `CHG Approval` | Linked Record | |
| `Vertrag (PDF) (from Akquise)` | Lookup | |
| `Tasks` | Linked Record | |
| `superchat_id` | Text | |
| `date_first_online` | Date | |
| `imported` | Checkbox | |

### Lead Status Werte (aus Stammdaten-Lookup in Akquise)
| Wert | Anzahl |
|---|---|
| (leer) | 9.863 |
| "New" | 8.831 |
| "Won / Signed" | 791 |
| "Baulich ungeeignet" | 168 |
| "Kein Interesse" | 146 |
| "Später wiederkommen" | 106 |
| "Inbound Lead \| Contract sent" | 60 |
| "Interessiert/ Später wiederkommen" | 48 |
| "Inbound Lead \| Re-Check (waiting for more Data)" | 38 |
| "Inbound Lead \| Ungeeignet / abgelehnt" | 25 |
| "Planned" | 19 |
| "Interessiert" | 2 |

---

## 3. Installationen Table (1.065 Records)

### Felder (aus CSV "Installationen-Grid view")

| Airtable Field | Typ | Beispielwerte |
|---|---|---|
| `Installation ID` | Autonumber | |
| `Technikers` | Linked Record | |
| `JET ID` | Linked Record | |
| `Install Number` | Text | |
| `DO-ID` | Text | "DO-FFM-0001" |
| `City Code` | Text | "FFM", "DUS" |
| `Aufbau Jahr` | Number | 2024, 2025 |
| `Link to Display ID` | Linked Record | |
| `Country` | Text | "DE" |
| `Screen Art` | Single Select | **"WD"** (663x), "" (47x) |
| `Screen Size` | Text | |
| `Aufbau Datum` | Date | |
| `Unit Index` | Number | |
| `Integrator` | Single Select | **"e-Systems"** (530x), **"MediaAV"** (135x), **"DAYNMEDIA GmbH"** (44x) |
| `Status Installation` | Single Select | **"Installiert"** (407x), **"Abgebrochen - Vorort"** (237x), **"Aufbau evtl. Möglich - Offene Punkte (zu klären intern)"** (61x), "Installiert - Nacharbeit notwendig" (3x), "Terminiert" (1x), "Abbruch - telefonisch vorab" (1x) |
| `installed_email_sent` | Checkbox | |
| `Suche Location` | Formula | |
| `Akquise` | Linked Record | |
| `JET ID (from Akquise)` | Lookup | |
| `Location Name` | Lookup | |
| `Street`, `Street Number`, `Postal Code`, `City` | Lookup | |
| `Geplanter Aufbau (extern)` | Date | |
| `Techniker 1 Name` | Text | |
| `E-Mail (from Technikers)` | Lookup | |
| `Techniker 2 Name` | Text | |
| `Installationsprotokoll` | Attachment | |
| `Display Serial Number` | Text | |
| `Abbruchgrund` | Text | |
| `Allgemeine Bemerkungen` | Long Text | |
| `Installationsart` | Single Select | "Bodenmontage" (237x), "Sonstiges" (37x), **"Wandmontage"** (28x), "Deckenmontage" (12x), "" (396x) |
| `SIM eingesteckt` | Checkbox | |
| `LTE aktiv` | Checkbox | |
| `Serveranbindung` | Checkbox | |
| `Folie entfernt` | Checkbox | |
| `Handout` | Checkbox | |
| `Eigentum Sticker` | Checkbox | |
| `Installationsstart` | DateTime | |
| `Installationsabschluss` | DateTime | |
| `Fotos – Außenansicht` | Attachment | |
| `Fotos - Seriennummer Display / OPS` | Attachment | |
| `Fotos – Standort vorher` | Attachment | |
| `Fotos – Front 1m/3m` | Attachment | |
| `Fotos – Rückseite 1m/3m` | Attachment | |
| `Fotos – Schaufenster 1m/3m` | Attachment | |
| `Fotos – SIM Karte` | Attachment | |
| `Fotos – LTE/Server` | Attachment | |
| `Display ID` | Lookup | |
| `Display` | Linked Record | |
| `Abnahme Partner (Name)` | Text | |
| `Abnahme Partner (Unterschrift)` | Attachment | |
| `Techniker Unterschrift` | Attachment | |
| `Integrator Nachprüfung erforderlich` | Checkbox | |
| `Freigabe Installation` | Checkbox | |
| `Freigabe CHG?` | Checkbox | |
| `Freigabe-Datum CHG` | Date | |
| `Rechnungsnummer Integrator/ CHG` | Text | |
| `Abrechnungsdatum Integrator` | Date | |
| `Erstellt am` | Created Time | |
| `Created by` | Collaborator | |
| `Last modified by` | Collaborator | |
| `Zuletzt geändert` | Last Modified Time | |
| `Streetview Link (from JET ID)` | Lookup | |
| `City (link)` | Linked Record | |
| `Installationstermine` | Linked Record | |
| `recordID` | Formula | |
| `OPS Nr` | Lookup | |
| `Navori Venue ID` | Lookup | |
| `SIM-ID` | Lookup | |
| `Install targets per Week` | Number | |
| `Installations-KW/Jahr` | Formula | |
| `Tasks` | Linked Record | |
| `CHG Approval` | Linked Record | |
| `Installation inspection` | Linked Record | |
| `Inspection Status` | Lookup | |

---

## 4. Live Display Locations Table (530 Records)

### Felder (aus CSV "Live Display Locations-Grid view")

| Airtable Field | Typ | Beispielwerte |
|---|---|---|
| `display_name` | Text | |
| `Display Table ID` | Formula | |
| `JET ID` | Linked Record | |
| `superchat_id` | Text | |
| `superchat_id_text` | Formula | |
| `Created` | Created Time | |
| `Installationen` | Linked Record | |
| `Akquise Link` | Linked Record | |
| `Display ID` | Text | "JET-DO-0001" |
| `VAC / Woche (from Akquise Link)` | Lookup | |
| `Location Name` | Lookup | |
| `Street`, `Street Number`, `Postal Code`, `City` | Lookup/Text | |
| `Street & Number` | Formula | |
| `adress_combined` | Formula | |
| `City count` | Count | |
| `Online Status ` | Single Select | ⚠️ TRAILING SPACE! **"Live"** (361x), **"Deinstalled"** (47x), **"To be Deinstalled"** (4x) |
| `Search Location` | Formula | |
| `Live since` | Date | |
| `Restaurant Werbemittel erstellt & hochgeladen` | Checkbox | |
| `Passpartout ` | Checkbox | ⚠️ TRAILING SPACE |
| `screen_network_category` | Text | |
| `Screen Type` | Single Select | "WD" (412x) |
| `Screen Size ` | Text | ⚠️ TRAILING SPACE |
| `screen_width_px` | Number | |
| `screen_height_px` | Number | |
| `rtb_venue_type` | Text | |
| `Attachments` | Attachment | |
| `Latitude` | Number | |
| `Longtitude` | Number | ⚠️ Typo "Longtitude" statt "Longitude" |
| `Tasks` | Linked Record | |
| `Email` | Lookup | |
| `Contact email` | Lookup | |
| `External Display Image (from Installationen)` | Lookup | |
| `Navori Venue ID (from Installationen)` | Lookup | |
| `Location Categories` | Lookup | |
| `OPS NR` | Lookup | |
| `OPS_Player_inventory` | Linked Record | |
| `Contact Person` | Lookup | |
| `Contact Phone` | Lookup | |
| `blacklisted_brands` | Text | |
| `Status On/Off` | Linked Record | |
| `deinstall_date` | Date | |
| `OPS-SN` | Lookup | |
| `Deinstallations` | Linked Record | |
| `Hardware-Tausch` | Linked Record | |

---

## 5. Installationstermine Table (353 Records)

### Felder (aus CSV "Installationstermine-Grid view")

| Airtable Field | Typ | Beispielwerte |
|---|---|---|
| `Install_Date_ID` | Autonumber | |
| `Installationsdatum` | DateTime | |
| `Erinnerungsdatum` | Date | |
| `Installationszeit` | Text | |
| `Grund /Notiz` | Long Text | |
| `Nächste Schritt` | Text | |
| `KW Geplant` | Formula | |
| `Wochentag` | Formula | |
| `Installationsdatum (nur Datum)` | Formula | |
| `Terminstatus` | Single Select | **"Geplant"** (233x), **"Abgesagt"** (32x), **"Verschoben"** (17x), **"No-Show"** (6x), **"Durchgeführt"** (2x) |
| `JET ID` | Linked Record | |
| `Location Name` | Lookup | |
| `Akquise` | Linked Record | |
| `Street_new (from Akquise)` | Lookup | |
| `Street Number_new (from Akquise)` | Lookup | |
| `Postal Code_new (from Akquise)` | Lookup | |
| `City_new (from Akquise)` | Lookup | |
| `Contact Email (from Stammdaten)` | Lookup | |
| `Stammdaten` | Linked Record | |
| `Installationen` | Linked Record | |
| `Status Installation (from Installationen)` | Lookup | |

---

## 6. Tasks Table (7.948 Records)

### Felder (aus CSV "Tasks-Grid view")

| Airtable Field | Typ | Beispielwerte |
|---|---|---|
| `Task Title` | Text | |
| `Task Type` | Single Select | **"Content / Account Management (intern)"** (419x), "Internal check / Account Management (intern)" (351x), "Lieferando / Account Management (external)" (331x), "Installation / Hardware (external)" (107x), "Deinstallation / Hardware (external)" (48x), "Maintenance / Hardware (external)" (36x), "Acquisition / (intern)" (11x), "Inspection / Hardware (external)" (10x), "Acquisition / (external)" (5x) |
| `Status` | Single Select | **"Completed"** (1.150x), **"New"** (174x), **"In Progress"** (41x), **"Follow Up"** (7x), **"On Hold"** (5x), **"In Review"** (2x) |
| `Priority` | Single Select | **"High"** (458x), **"Urgent"** (132x), **"Medium"** (118x), **"Low"** (6x), "" (665x) |
| `Due Date` | Date | |
| `Partner` | Linked Record | |
| `Description` | Long Text | |

---

## 7. Hardware Tables

### OPS_Player_inventory (299 Records)

| Airtable Field | Typ |
|---|---|
| `OpsNr.` | Text |
| `status` | Single Select |
| `Live Display Locations` | Linked Record |
| `Online Status  (from Live Display Locations)` | Lookup |
| `OPS-SN` | Text |
| `ops_hardware_type` | Text |
| `navori_venueID` | Text |
| `SimID` | Linked Record |
| `SimID (from SimID)` | Lookup |
| `JET ID` | Linked Record |
| `Location` | Linked Record |
| `note` | Text |
| `display_inventory` | Linked Record |
| `Partner` | Linked Record |
| `recordID` | Formula |

### SIM_card_inventory (301 Records)

| Airtable Field | Typ |
|---|---|
| `SimID` | Text |
| `activate_date` | Date |
| `OPS_Player_inventory` | Linked Record |

### display_inventory (0 Records)

| Airtable Field | Typ |
|---|---|
| `display_serial_number` | Text |
| `location` | Linked Record |
| `OPS_Player_inventory` | Linked Record |

---

## 8. Navori Outages Uptime (2 Records)

| Airtable Field | Typ |
|---|---|
| `do_id_text` | Text |
| `offline_since` | DateTime |
| `resolved_at` | DateTime |
| `open` | Checkbox |
| `escalated` | Checkbox |
| `downtime_min` | Number |
| `needs_escalation` | Checkbox |

---

## 9. activity_log / Communications (6 Records)

| Airtable Field | Typ |
|---|---|
| `Index` | Number |
| `Location` | Linked Record |
| `Location Name (from Location)` | Lookup |
| `Display ID (from Location)` | Lookup |
| `JET ID (from Location)` | Lookup |
| `Channel` | Single Select |
| `Direction` | Single Select |
| `Subject` | Text |
| `Message` | Long Text |
| `Timestamp` | DateTime |
| `Status` | Single Select |
| `Recipient Name` | Text |
| `Recipient Contact` | Text |
| `Sender` | Text |
| `Related Task` | Linked Record |
| `External ID` | Text |
| `Attachments` | Attachment |

---

## ⚠️ Bekannte Airtable-Eigenheiten

### Felder mit Trailing Space
- `Online Status ` (Live Display Locations) — Leerzeichen am Ende!
- `Passpartout ` — Leerzeichen am Ende!
- `Screen Size ` — Leerzeichen am Ende!

### Felder mit Double Space
- `Lead Status  (from Akquise)` (Stammdaten) — ZWEI Leerzeichen!
- `Online Status  (from Displays)` (Stammdaten) — ZWEI Leerzeichen!

### Felder mit Non-Breaking Hyphen (U+2011)
- `Post‑Install Storno` — U+2011 statt normaler Hyphen!
- `Post‑Install Storno Grund` — U+2011!

### Typos in Airtable-Feldnamen
- `Lega Entity Adress` → sollte "Legal Entity Address" sein
- `regular_close_time_weekdend` → sollte "weekdays" oder "weekend" sein
- `Longtitude` → sollte "Longitude" sein
- `not tarted` (approval_status Wert) → sollte "not started" sein

---

## 🔍 Audit-Ergebnisse: Bekannte Probleme

### HOCH — Muss gefixt werden

1. **`AcquisitionDashboard.jsx:84-85`** — `recordIsApproved()` nutzt Ausschluss-Logik mit deutschen Werten ("abgelehnt") aber echte approval_status-Werte sind Englisch ("Rejected"). Records mit "Rejected", "In review", "Info required" werden fälschlicherweise als "approved" gezählt.

2. **`install-booker-detail.js:382`** — City-Filter nutzt `Lead_Status='Ready for Install'` — diesen Wert gibt es NICHT in Airtable. Nur die `all=ready` Route (Zeile 454) nutzt korrekt `'Won / Signed'`.

3. **`install-booker-detail.js:375,382`** — Filter nutzt `ready_for_installation=TRUE()` — real ist es "checked" (Text), kein Boolean-Checkbox.

### MITTEL — Sollte geprüft werden

4. **`install-booker-book.js:218-220`** — Schreibt `'Booking Status'`, `'Booking Date'`, `'Booking Time'` in Akquise-Tabelle — diese Felder existieren möglicherweise nicht (wurden evtl. manuell angelegt).

5. **`install-booker-status.js:156-160`** — Status-Werte `'Termin bestätigt'`, `'Abgeschlossen'` existieren nicht als `Status Installation` Options. Echte Werte: "Installiert", "Abgebrochen - Vorort", "Aufbau evtl. Möglich...", "Terminiert".

6. **`sync-airtable.js:334`** — `ready_for_installation` wird als `|| false` gemappt, Supabase-Spalte ist BOOLEAN, aber Airtable-Wert ist "checked" (String).

7. **`LocationDetailTab.jsx:543`** — `ApprovalIndicator` prüft auf `'approved'` statt `'accepted'`.

### NIEDRIG — Kosmetisch

8. **`Displays ` Feld** (mit Trailing Space) — Write in `airtableService.js` nutzt `'Displays'` ohne Space.
9. **`Post‑Install Storno`** — Non-Breaking Hyphen in Feldnamen muss exakt übereinstimmen.
