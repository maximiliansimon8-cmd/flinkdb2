/**
 * INDA Export Excel Parser
 * Parses .xlsx files from INDA FAW tool containing dVAC frequency data
 * with hourly breakdowns (24h x 7 days) for Gesamt/Kfz/ÖPNV/Fußgänger.
 *
 * Expected Excel format:
 * - 4 Sheets: "dVAC-Basis - Gesamt", "dVAC-Basis - Kfz", "dVAC-Basis - ÖPNV", "dVAC-Basis - Fußgänger"
 * - Each sheet: Row 0 = header (Stunde, Mo, Di, ..., So), Rows 1-24 = hourly values
 * - Row 25 col 8 = weekly total (dVAC Wochenwert)
 * - Sheet 1, cols L/M (11/12): Metadata (Schaltung, Version, VAC-ID)
 * - Filename contains GKZ: dVAC_920202_5674834_...xlsx
 */
import * as XLSX from 'xlsx';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const SHEET_MAPPING = {
  'dVAC-Basis - Gesamt': { hourlyKey: 'hourlyGesamt', dvacKey: 'dvacGesamt' },
  'dVAC-Basis - Kfz': { hourlyKey: 'hourlyKfz', dvacKey: 'dvacKfz' },
  'dVAC-Basis - ÖPNV': { hourlyKey: 'hourlyOepnv', dvacKey: 'dvacOepnv' },
  'dVAC-Basis - Fußgänger': { hourlyKey: 'hourlyFussgaenger', dvacKey: 'dvacFussgaenger' },
};

/**
 * Parse an INDA export .xlsx file
 * @param {File} file - The uploaded .xlsx file
 * @returns {Promise<ParsedIndaData>}
 *
 * @typedef {Object} ParsedIndaData
 * @property {string} gkz - Gemeindekennziffer from filename
 * @property {string} schaltung - e.g. "10/60"
 * @property {number} sovFactor - Share of Voice factor
 * @property {string} vacId - VAC ID
 * @property {string} indaVersion - INDA version string
 * @property {string} dataSource - Source description
 * @property {number} dvacGesamt - Weekly total d/VAC
 * @property {number} dvacKfz - Weekly Kfz d/VAC
 * @property {number} dvacOepnv - Weekly ÖPNV d/VAC
 * @property {number} dvacFussgaenger - Weekly Fußgänger d/VAC
 * @property {Object|null} hourlyGesamt - {Mo:[24], Di:[24], ...}
 * @property {Object|null} hourlyKfz
 * @property {Object|null} hourlyOepnv
 * @property {Object|null} hourlyFussgaenger
 */
export function parseIndaExport(file) {
  return new Promise((resolve, reject) => {
    // Extract GKZ from filename: dVAC_920202_5674834_...xlsx
    const filenameMatch = file.name.match(/dVAC_(\d+)_/);
    const gkz = filenameMatch?.[1] ?? '';

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const result = {
          gkz,
          schaltung: '10/60',
          sovFactor: 6,
          vacId: '',
          indaVersion: '',
          dataSource: 'INDA Export',
          dvacGesamt: 0,
          dvacKfz: 0,
          dvacOepnv: 0,
          dvacFussgaenger: 0,
          hourlyGesamt: null,
          hourlyKfz: null,
          hourlyOepnv: null,
          hourlyFussgaenger: null,
        };

        // 1. Extract metadata from first sheet, columns L/M (c=11/12)
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (firstSheet) {
          for (let r = 0; r <= 10; r++) {
            const cellL = firstSheet[XLSX.utils.encode_cell({ r, c: 11 })];
            const cellM = firstSheet[XLSX.utils.encode_cell({ r, c: 12 })];
            if (!cellL?.v || !cellM?.v) continue;
            const label = String(cellL.v);
            const value = String(cellM.v);

            if (label === 'Schaltung') {
              result.schaltung = value;
              const parts = value.match(/(\d+)\s*\/\s*(\d+)/);
              if (parts) {
                result.sovFactor = Number(parts[2]) / Number(parts[1]);
              }
            }
            if (label.includes('Version')) {
              result.indaVersion = value;
              result.dataSource = `INDA Export (Version ${value})`;
            }
            if (label.includes('Datum') || label.includes('vacid')) {
              const match = value.match(/\/\s*(\d+)/);
              if (match) result.vacId = match[1];
            }
          }
        }

        // 2. Parse each sheet for hourly data + weekly totals
        for (const [sheetName, mapping] of Object.entries(SHEET_MAPPING)) {
          const ws = workbook.Sheets[sheetName];
          if (!ws) continue;

          // Parse hourly values: 7 columns (days) x 24 rows (hours)
          const hourly = {};
          for (let col = 1; col <= 7; col++) {
            const dayCell = ws[XLSX.utils.encode_cell({ r: 0, c: col })];
            const dayName = dayCell?.v ? String(dayCell.v).trim() : DAYS[col - 1];
            // Normalize day name to our standard
            const normalizedDay = DAYS.find(d => dayName.startsWith(d)) || DAYS[col - 1];
            const values = [];
            for (let row = 1; row <= 24; row++) {
              const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
              values.push(cell?.v != null ? Number(cell.v) : 0);
            }
            hourly[normalizedDay] = values;
          }
          result[mapping.hourlyKey] = hourly;

          // Weekly total from row 25, col 8 (or calculate from hourly data)
          const sumCell = ws[XLSX.utils.encode_cell({ r: 25, c: 8 })];
          if (sumCell?.v != null) {
            result[mapping.dvacKey] = Number(sumCell.v);
          } else {
            // Calculate from hourly data
            let total = 0;
            for (const day of Object.values(hourly)) {
              total += day.reduce((a, b) => a + b, 0);
            }
            result[mapping.dvacKey] = Math.round(total * 100) / 100;
          }
        }

        resolve(result);
      } catch (err) {
        reject(new Error(`Excel-Parsing fehlgeschlagen: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Calculate dVAC derived values
 * @param {number} dvacWoche - Weekly d/VAC
 * @param {number} sovFactor - Share of Voice factor
 * @returns {Object} Calculated values
 */
export function calculateDvacMetrics(dvacWoche, sovFactor = 6) {
  const dvacTag = dvacWoche / 7;
  const dvacMonat = dvacTag * 30;
  const impressionsWoche = dvacWoche * sovFactor;
  const impressionsTag = impressionsWoche / 7;
  const impressionsMonat = impressionsTag * 30;

  return {
    dvacTag: Math.round(dvacTag * 100) / 100,
    dvacMonat: Math.round(dvacMonat * 100) / 100,
    impressionsWoche: Math.round(impressionsWoche),
    impressionsTag: Math.round(impressionsTag),
    impressionsMonat: Math.round(impressionsMonat),
  };
}

/**
 * Get heatmap color class based on value relative to max
 * @param {number} val - Current value
 * @param {Object} hourlyData - Full hourly data object
 * @returns {string} Tailwind CSS classes
 */
export function heatColor(val, hourlyData) {
  if (!hourlyData || val === 0) return '';
  let max = 0;
  for (const day of DAYS) {
    for (const v of (hourlyData[day] ?? [])) {
      if (v > max) max = v;
    }
  }
  if (max === 0) return '';
  const ratio = val / max;
  if (ratio > 0.75) return 'text-red-700 font-semibold bg-red-50';
  if (ratio > 0.5) return 'text-orange-700 bg-orange-50/50';
  if (ratio > 0.25) return 'text-yellow-700';
  return '';
}

/**
 * Format number for German locale
 * @param {number} val
 * @param {number} decimals
 * @returns {string}
 */
export function fmtNum(val, decimals = 0) {
  if (val == null || isNaN(val)) return '–';
  return val.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Day labels */
export { DAYS };
