import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Database, AlertTriangle, CheckCircle2, Search, RefreshCw,
  Loader2, Monitor, WifiOff, HardDrive, BarChart3, Link2Off, Eye,
  ChevronDown,
} from 'lucide-react';
import { fetchAllOpsInventory } from '../utils/airtableService';

/* ──────────────────────── helpers ──────────────────────── */

function normalizeSerial(id) {
  return id ? id.replace(/\s+/g, '') : '';
}

/* ──────────────────────── KPI Card ──────────────────────── */

function KpiCard({ label, value, icon: Icon, color, subtitle, onClick, active }) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface-primary border rounded-2xl p-4 shadow-card transition-all ${
        onClick ? 'cursor-pointer hover:bg-surface-secondary' : ''
      } ${active ? 'border-blue-400 ring-1 ring-blue-400/30' : 'border-border-secondary'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}12` }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-text-primary font-mono">{value}</div>
      {subtitle && <div className="text-xs text-text-muted mt-1">{subtitle}</div>}
    </div>
  );
}

/* ──────────────────────── Category Card (Overview) ──────────────────────── */

function CategoryCard({ icon: Icon, color, title, count, total, description, onClick }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div
      onClick={onClick}
      className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-card cursor-pointer hover:bg-surface-secondary transition-all"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div>
          <div className="text-sm font-semibold text-text-primary">{title}</div>
          <div className="text-xs text-text-muted">{description}</div>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-bold font-mono" style={{ color }}>{count}</div>
        <div className="text-xs text-text-muted">{pct}% von {total}</div>
      </div>
    </div>
  );
}

/* ──────────────────────── MAIN COMPONENT ──────────────────────── */

export default function DataQualityDashboard({ comparisonData, rawData }) {
  const [opsData, setOpsData] = useState([]);
  const [opsLoading, setOpsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSection, setActiveSection] = useState('uebersicht');

  /* Load OPS data */
  const loadOps = useCallback(async () => {
    setOpsLoading(true);
    try {
      const ops = await fetchAllOpsInventory();
      setOpsData(ops || []);
    } catch (err) {
      console.error('[DataQuality] OPS load error:', err);
    } finally {
      setOpsLoading(false);
    }
  }, []);

  useEffect(() => { loadOps(); }, [loadOps]);

  /* ── Core matching analysis ── */
  const analysis = useMemo(() => {
    if (!comparisonData?.airtable?.locationMap) return null;

    const { locationMap, activeDisplayIds } = comparisonData.airtable;
    const vistarVenues = comparisonData.vistarVenues || [];

    // 1. Build Live displays from Airtable (active = not deinstalled, status contains "Live")
    const liveDisplays = [];
    for (const [displayId, info] of locationMap.entries()) {
      if (!activeDisplayIds.has(displayId)) continue;
      if (info.status && /live/i.test(info.status)) {
        liveDisplays.push({ displayId, ...info });
      }
    }

    // 2. Navori lookup (by normalized serialNumber + by displayId)
    const navoriBySerial = new Set();
    const navoriByDisplayId = new Set();
    if (rawData?.displays) {
      for (const d of rawData.displays) {
        if (d.serialNumber) navoriBySerial.add(normalizeSerial(d.serialNumber));
        if (d.displayId) navoriByDisplayId.add(d.displayId);
      }
    }

    // 3. Vistar lookup (by partner_venue_id + by displayId extracted from name)
    const vistarByVenueId = new Set();
    const vistarByDisplayId = new Set();
    for (const v of vistarVenues) {
      if (v.partner_venue_id) vistarByVenueId.add(normalizeSerial(v.partner_venue_id));
      if (v.id) vistarByVenueId.add(normalizeSerial(v.id));
      if (v.name) {
        const doId = v.name.split('|')[0]?.trim();
        if (doId && /^[A-Z]{2}-/.test(doId)) vistarByDisplayId.add(doId);
      }
    }

    // 4. Classify each Live display (mutually exclusive categories!)
    const matchedAll3 = [];        // In all 3 systems
    const missingInVistar = [];     // In Navori but NOT Vistar
    const missingInNavori = [];     // In Vistar but NOT Navori
    const missingInBoth = [];       // In neither Navori nor Vistar
    const missingVenueId = [];      // No venue_id → matching impossible

    for (const d of liveDisplays) {
      const venueId = d.navoriVenueId || '';
      const normVenueId = normalizeSerial(venueId);
      const hasVenueId = venueId.length > 0;

      const inNavori = navoriByDisplayId.has(d.displayId) ||
        (hasVenueId && navoriBySerial.has(normVenueId));

      // Vistar: match on partner_venue_id only (not id, which is Vistar internal)
      const inVistar = (hasVenueId && vistarByVenueId.has(normVenueId)) ||
        vistarByDisplayId.has(d.displayId);

      if (!hasVenueId) {
        missingVenueId.push(d);
      }

      // Mutually exclusive classification
      if (inNavori && inVistar) {
        matchedAll3.push(d);
      } else if (!inNavori && !inVistar) {
        missingInBoth.push(d);
      } else if (!inVistar) {
        missingInVistar.push(d);
      } else {
        missingInNavori.push(d);
      }
    }

    // Also check: DAYN coverage
    const daynScreens = comparisonData.dayn?.screens || [];
    const daynByDisplayId = new Set(daynScreens.map(s => s.do_screen_id).filter(Boolean));
    const missingInDayn = liveDisplays.filter(d => !daynByDisplayId.has(d.displayId));

    // Check: Vistar venues without matching Airtable display (orphan venues)
    const airtableDisplayIds = new Set(liveDisplays.map(d => d.displayId));
    const vistarOrphans = vistarVenues.filter(v => {
      const doId = v.name ? v.name.split('|')[0]?.trim() : '';
      const hasDoId = doId && /^[A-Z]{2}-/.test(doId);
      return v.is_active && hasDoId && !airtableDisplayIds.has(doId);
    });

    return {
      totalLive: liveDisplays.length,
      matchedAll3,
      missingInVistar,
      missingInNavori,
      missingInBoth,
      missingVenueId,
      missingInDayn,
      vistarOrphans,
      daynTotal: daynScreens.length,
      vistarTotal: vistarVenues.filter(v => v.is_active).length,
      liveDisplays,
    };
  }, [comparisonData, rawData]);

  /* ── OPS matching ── */
  const opsAnalysis = useMemo(() => {
    if (!analysis || opsData.length === 0) return { displaysWithoutOps: [], opsWithoutDisplay: [], duplicateOpsLocations: [] };

    // Build set of location IDs that OPS are linked to
    const opsLocationIds = new Set();
    for (const ops of opsData) {
      if (ops.displayLocationId) opsLocationIds.add(ops.displayLocationId);
    }

    // OPS without a display_location_id (any status except explicitly deinstalled/defect in warehouse)
    const opsWithoutDisplay = opsData.filter(ops =>
      !ops.displayLocationId && ops.status && !['deinstalled', 'defect'].includes(ops.status.toLowerCase()),
    );

    // Count of OPS per location (for duplicates detection)
    const opsCountByLocation = {};
    for (const ops of opsData) {
      if (ops.displayLocationId) {
        opsCountByLocation[ops.displayLocationId] = (opsCountByLocation[ops.displayLocationId] || 0) + 1;
      }
    }
    const duplicateOpsLocations = Object.entries(opsCountByLocation)
      .filter(([, count]) => count > 1)
      .map(([locId, count]) => {
        const allOps = opsData.filter(o => o.displayLocationId === locId);
        return {
          locationId: locId,
          count,
          opsNr: allOps.map(o => o.opsNr).filter(Boolean).join(', '),
          locationOnlineStatus: allOps[0]?.locationOnlineStatus,
          statuses: allOps.map(o => o.status).filter(Boolean).join(', '),
        };
      });

    return { opsWithoutDisplay, duplicateOpsLocations };
  }, [analysis, opsData]);

  /* ── Loading state ── */
  if (!comparisonData || !rawData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        <span className="ml-2 text-sm text-text-muted">Warte auf Daten...</span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex items-center justify-center py-20">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
        <span className="ml-2 text-sm text-text-muted">Keine Airtable-Display-Daten vorhanden</span>
      </div>
    );
  }

  const matchPct = analysis.totalLive > 0 ? Math.round((analysis.matchedAll3.length / analysis.totalLive) * 100) : 0;
  const totalIssues = analysis.missingInVistar.length + analysis.missingInNavori.length + analysis.missingInBoth.length + analysis.missingVenueId.length;

  /* ── Sub-section tabs ── */
  const sections = [
    { id: 'uebersicht', label: 'Übersicht', icon: Eye, count: null },
    { id: 'missing-both', label: 'Fehlt überall', icon: AlertTriangle, count: analysis.missingInBoth.length },
    { id: 'missing-vistar', label: 'Fehlt in Vistar', icon: BarChart3, count: analysis.missingInVistar.length },
    { id: 'missing-navori', label: 'Fehlt in Navori', icon: WifiOff, count: analysis.missingInNavori.length },
    { id: 'no-venue-id', label: 'Ohne Venue-ID', icon: Link2Off, count: analysis.missingVenueId.length },
    { id: 'missing-dayn', label: 'Fehlt in DAYN', icon: Monitor, count: analysis.missingInDayn.length },
    { id: 'ops-issues', label: 'OPS Probleme', icon: HardDrive, count: opsAnalysis.opsWithoutDisplay.length + opsAnalysis.duplicateOpsLocations.length },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
            <Database size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Datenqualität</h2>
            <p className="text-xs text-text-muted">Cross-System Abgleich: Airtable / Navori / Vistar / OPS</p>
          </div>
        </div>
        <button
          onClick={loadOps}
          disabled={opsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-secondary bg-surface-primary text-xs text-text-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={opsLoading ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Live Displays"
          value={analysis.totalLive}
          icon={Monitor}
          color="#007AFF"
          subtitle="Airtable Master"
        />
        <KpiCard
          label="Vollständig"
          value={analysis.matchedAll3.length}
          icon={CheckCircle2}
          color="#34C759"
          subtitle={`${matchPct}% in allen 3 Quellen`}
        />
        <KpiCard
          label="Fehlt überall"
          value={analysis.missingInBoth.length}
          icon={AlertTriangle}
          color="#FF3B30"
          subtitle="Weder Navori noch Vistar"
          onClick={() => setActiveSection('missing-both')}
          active={activeSection === 'missing-both'}
        />
        <KpiCard
          label="Fehlt in Vistar"
          value={analysis.missingInVistar.length}
          icon={BarChart3}
          color="#FF3B30"
          subtitle="Umsatzverlust"
          onClick={() => setActiveSection('missing-vistar')}
          active={activeSection === 'missing-vistar'}
        />
        <KpiCard
          label="Fehlt in Navori"
          value={analysis.missingInNavori.length}
          icon={WifiOff}
          color="#FF9500"
          subtitle="Nicht überwacht"
          onClick={() => setActiveSection('missing-navori')}
          active={activeSection === 'missing-navori'}
        />
        <KpiCard
          label="Ohne Venue-ID"
          value={analysis.missingVenueId.length}
          icon={Link2Off}
          color="#AF52DE"
          subtitle="Kein Matching möglich"
          onClick={() => setActiveSection('no-venue-id')}
          active={activeSection === 'no-venue-id'}
        />
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-0 bg-surface-primary border border-border-secondary rounded-xl p-1 overflow-x-auto">
        {sections.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveSection(tab.id); setSearchTerm(''); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-surface-primary shadow-sm text-text-primary border border-border-secondary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={13} />
              {tab.label}
              {tab.count != null && (
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-surface-secondary text-text-secondary' : 'bg-transparent text-text-muted'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Section Content ── */}

      {/* Übersicht — Kontrollzentrale */}
      {activeSection === 'uebersicht' && (
        <div className="space-y-4">
          {/* Quality Bar */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Gesamt-Datenqualität</h3>
              <span className="text-xs font-mono text-text-muted">{analysis.matchedAll3.length} / {analysis.totalLive} vollständig</span>
            </div>
            <div className="h-6 bg-surface-secondary rounded-full overflow-hidden flex mb-3">
              {analysis.totalLive > 0 && (
                <>
                  <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(analysis.matchedAll3.length / analysis.totalLive) * 100}%` }} title={`Vollständig: ${analysis.matchedAll3.length}`} />
                  <div className="bg-status-offline h-full transition-all" style={{ width: `${(analysis.missingInBoth.length / analysis.totalLive) * 100}%` }} title={`Fehlt überall: ${analysis.missingInBoth.length}`} />
                  <div className="bg-red-300 h-full transition-all" style={{ width: `${(analysis.missingInVistar.length / analysis.totalLive) * 100}%` }} title={`Nur Vistar fehlt: ${analysis.missingInVistar.length}`} />
                  <div className="bg-amber-400 h-full transition-all" style={{ width: `${(analysis.missingInNavori.length / analysis.totalLive) * 100}%` }} title={`Nur Navori fehlt: ${analysis.missingInNavori.length}`} />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Vollständig ({analysis.matchedAll3.length})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-status-offline" /> Fehlt überall ({analysis.missingInBoth.length})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-300" /> Nur Vistar fehlt ({analysis.missingInVistar.length})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Nur Navori fehlt ({analysis.missingInNavori.length})</span>
            </div>
          </div>

          {/* Nacharbeit-Matrix: Prioritäten */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Nacharbeit-Prioritäten</h3>
            <div className="space-y-2">
              {[
                { label: 'Displays fehlen in Navori + Vistar', count: analysis.missingInBoth.length, color: '#FF3B30', prio: 'KRITISCH', desc: 'Kein Monitoring, kein Revenue', section: 'missing-both' },
                { label: 'Displays ohne Venue-ID', count: analysis.missingVenueId.length, color: '#AF52DE', prio: 'HOCH', desc: 'Matching unmöglich — Venue-ID in Airtable pflegen', section: 'no-venue-id' },
                { label: 'Displays fehlen in Vistar', count: analysis.missingInVistar.length, color: '#FF3B30', prio: 'HOCH', desc: 'Programmatic Revenue geht verloren', section: 'missing-vistar' },
                { label: 'Displays fehlen in Navori', count: analysis.missingInNavori.length, color: '#FF9500', prio: 'MITTEL', desc: 'Kein CMS-Heartbeat, nicht überwacht', section: 'missing-navori' },
                { label: 'Displays fehlen in DAYN', count: analysis.missingInDayn.length, color: '#06b6d4', prio: 'NIEDRIG', desc: `${analysis.daynTotal} DAYN-Screens vorhanden`, section: 'missing-dayn' },
                { label: 'OPS ohne Standort-Zuordnung', count: opsAnalysis.opsWithoutDisplay.length, color: '#64748b', prio: 'MITTEL', desc: 'Hardware nicht zugeordnet', section: 'ops-issues' },
                { label: 'Standorte mit mehreren OPS', count: opsAnalysis.duplicateOpsLocations.length, color: '#64748b', prio: 'NIEDRIG', desc: 'Prüfen ob Swap/Tausch läuft', section: 'ops-issues' },
                { label: 'Vistar-Venues ohne Airtable-Display', count: analysis.vistarOrphans.length, color: '#a855f7', prio: 'MITTEL', desc: 'Verwaiste Vistar-Einträge', section: 'uebersicht' },
              ]
                .filter(row => row.count > 0)
                .map((row, i) => (
                  <div
                    key={i}
                    onClick={() => row.section !== 'uebersicht' && setActiveSection(row.section)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      row.section !== 'uebersicht' ? 'cursor-pointer hover:bg-surface-secondary' : ''
                    } ${row.prio === 'KRITISCH' ? 'border-status-offline/20 bg-status-offline/10/50' : 'border-border-secondary bg-surface-primary/40'}`}
                  >
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ backgroundColor: `${row.color}15`, color: row.color }}
                    >
                      {row.prio}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-primary truncate">{row.label}</div>
                      <div className="text-xs text-text-muted truncate">{row.desc}</div>
                    </div>
                    <div className="text-lg font-bold font-mono shrink-0" style={{ color: row.color }}>{row.count}</div>
                  </div>
                ))}
              {totalIssues === 0 && (
                <div className="text-center py-8">
                  <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-2" />
                  <div className="text-sm font-medium text-emerald-600">Alle Displays vollständig erfasst</div>
                </div>
              )}
            </div>
          </div>

          {/* Datenquellen-Status */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Datenquellen-Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: 'Airtable', count: analysis.totalLive, label: 'Live Displays', ok: analysis.totalLive > 0 },
                { name: 'Navori', count: rawData?.displays?.length || 0, label: 'Heartbeats', ok: (rawData?.displays?.length || 0) > 0 },
                { name: 'Vistar', count: analysis.vistarTotal, label: 'Aktive Venues', ok: analysis.vistarTotal > 0 },
                { name: 'DAYN', count: analysis.daynTotal, label: 'Screens', ok: analysis.daynTotal > 0 },
              ].map(src => (
                <div key={src.name} className={`p-3 rounded-xl border ${src.ok ? 'border-emerald-200 bg-emerald-50/30' : 'border-status-offline/20 bg-status-offline/10/30'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${src.ok ? 'bg-emerald-500' : 'bg-status-offline'}`} />
                    <span className="text-xs font-semibold text-text-primary">{src.name}</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-text-primary">{src.count}</div>
                  <div className="text-xs text-text-muted">{src.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Category Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CategoryCard
              icon={AlertTriangle} color="#FF3B30"
              title="Fehlt in Navori + Vistar"
              count={analysis.missingInBoth.length}
              total={analysis.totalLive}
              description="Weder überwacht noch monetarisiert — höchste Prio"
              onClick={() => setActiveSection('missing-both')}
            />
            <CategoryCard
              icon={BarChart3} color="#FF3B30"
              title="Nur in Vistar fehlend"
              count={analysis.missingInVistar.length}
              total={analysis.totalLive}
              description="Navori OK, aber kein Programmatic Revenue"
              onClick={() => setActiveSection('missing-vistar')}
            />
            <CategoryCard
              icon={WifiOff} color="#FF9500"
              title="Nur in Navori fehlend"
              count={analysis.missingInNavori.length}
              total={analysis.totalLive}
              description="Vistar OK, aber kein CMS-Heartbeat"
              onClick={() => setActiveSection('missing-navori')}
            />
            <CategoryCard
              icon={Link2Off} color="#AF52DE"
              title="Ohne Venue-ID"
              count={analysis.missingVenueId.length}
              total={analysis.totalLive}
              description="navori_venue_id fehlt — Matching unmöglich"
              onClick={() => setActiveSection('no-venue-id')}
            />
            <CategoryCard
              icon={Monitor} color="#06b6d4"
              title="Fehlt in DAYN"
              count={analysis.missingInDayn.length}
              total={analysis.totalLive}
              description={`${analysis.daynTotal} DAYN-Screens existieren`}
              onClick={() => setActiveSection('missing-dayn')}
            />
            <CategoryCard
              icon={HardDrive} color="#64748b"
              title="OPS Probleme"
              count={opsAnalysis.opsWithoutDisplay.length + opsAnalysis.duplicateOpsLocations.length}
              total={opsData.length}
              description="OPS ohne Zuordnung oder Duplikate"
              onClick={() => setActiveSection('ops-issues')}
            />
          </div>
        </div>
      )}

      {/* Mismatch Tables */}
      {/* Fehlt überall */}
      {activeSection === 'missing-both' && (
        <MismatchTable
          title="Fehlt in Navori UND Vistar"
          subtitle="Höchste Priorität — Live-Displays die weder überwacht noch monetarisiert werden"
          items={analysis.missingInBoth}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          columns={[
            { key: 'displayId', label: 'Display-ID', mono: true },
            { key: 'locationName', label: 'Standort' },
            { key: 'city', label: 'Stadt' },
            { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'jetId', label: 'JET-ID', mono: true },
            { key: 'navoriVenueId', label: 'Venue-ID', mono: true, truncate: true },
            { key: 'liveSince', label: 'Live seit', render: (d) => fmtDate(d.liveSince) },
          ]}
        />
      )}

      {activeSection === 'missing-vistar' && (
        <MismatchTable
          title="Fehlend in Vistar"
          subtitle="Live-Displays ohne Vistar-SSP Zuordnung — kein Programmatic Revenue"
          items={analysis.missingInVistar}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          columns={[
            { key: 'displayId', label: 'Display-ID', mono: true },
            { key: 'locationName', label: 'Standort' },
            { key: 'city', label: 'Stadt' },
            { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'jetId', label: 'JET-ID', mono: true },
            { key: 'navoriVenueId', label: 'Venue-ID', mono: true, truncate: true },
          ]}
        />
      )}

      {activeSection === 'missing-navori' && (
        <MismatchTable
          title="Fehlend in Navori"
          subtitle="Live-Displays ohne Navori CMS-Heartbeat — nicht überwacht"
          items={analysis.missingInNavori}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          columns={[
            { key: 'displayId', label: 'Display-ID', mono: true },
            { key: 'locationName', label: 'Standort' },
            { key: 'city', label: 'Stadt' },
            { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'navoriVenueId', label: 'Venue-ID', mono: true, truncate: true },
          ]}
        />
      )}

      {activeSection === 'no-venue-id' && (
        <MismatchTable
          title="Ohne Venue-ID"
          subtitle="navori_venue_id ist leer — Display kann weder Navori noch Vistar zugeordnet werden"
          items={analysis.missingVenueId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          columns={[
            { key: 'displayId', label: 'Display-ID', mono: true },
            { key: 'locationName', label: 'Standort' },
            { key: 'city', label: 'Stadt' },
            { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'liveSince', label: 'Live seit', render: (d) => fmtDate(d.liveSince) },
          ]}
        />
      )}

      {/* Fehlt in DAYN */}
      {activeSection === 'missing-dayn' && (
        <MismatchTable
          title="Fehlt in DAYN"
          subtitle={`Live-Displays ohne DAYN-Screen Zuordnung — ${analysis.daynTotal} DAYN-Screens existieren`}
          items={analysis.missingInDayn}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          columns={[
            { key: 'displayId', label: 'Display-ID', mono: true },
            { key: 'locationName', label: 'Standort' },
            { key: 'city', label: 'Stadt' },
            { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'jetId', label: 'JET-ID', mono: true },
          ]}
        />
      )}

      {activeSection === 'ops-issues' && (
        <div className="space-y-4">
          {opsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              <span className="ml-2 text-xs text-text-muted">Lade OPS-Daten...</span>
            </div>
          ) : (
            <>
              {opsAnalysis.opsWithoutDisplay.length > 0 && (
                <MismatchTable
                  title={`Aktive OPS ohne Display-Zuordnung (${opsAnalysis.opsWithoutDisplay.length})`}
                  subtitle="OPS-Player mit Status 'active' aber ohne verknüpften Standort"
                  items={opsAnalysis.opsWithoutDisplay}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  columns={[
                    { key: 'opsNr', label: 'OPS-Nr', mono: true },
                    { key: 'opsSn', label: 'OPS-SN', mono: true },
                    { key: 'hardwareType', label: 'Hardware-Typ' },
                    { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
                  ]}
                />
              )}
              {opsAnalysis.duplicateOpsLocations.length > 0 && (
                <MismatchTable
                  title={`Standorte mit mehreren OPS (${opsAnalysis.duplicateOpsLocations.length})`}
                  subtitle="Standorte mit mehr als einem verknüpften OPS-Player"
                  items={opsAnalysis.duplicateOpsLocations}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  columns={[
                    { key: 'opsNr', label: 'OPS-Nr (erster)', mono: true },
                    { key: 'count', label: 'Anzahl OPS', render: (d) => <span className="text-status-warning font-bold">{d.count}x</span> },
                    { key: 'locationOnlineStatus', label: 'Online-Status' },
                    { key: 'locationId', label: 'Location-ID', mono: true, truncate: true },
                  ]}
                />
              )}
              {opsAnalysis.opsWithoutDisplay.length === 0 && opsAnalysis.duplicateOpsLocations.length === 0 && (
                <div className="bg-surface-primary border border-border-secondary rounded-2xl p-12 text-center">
                  <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
                  <div className="text-sm font-medium text-text-secondary">Keine OPS-Probleme gefunden</div>
                  <div className="text-xs text-text-muted mt-1">Alle aktiven OPS-Player sind korrekt zugeordnet</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── Mismatch Table ──────────────────────── */

function MismatchTable({ title, subtitle, items, columns, searchTerm, onSearchChange }) {
  const filtered = useMemo(() => {
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item =>
      columns.some(col => {
        const val = item[col.key];
        return val && String(val).toLowerCase().includes(term);
      }),
    );
  }, [items, searchTerm, columns]);

  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-secondary/40">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-secondary/40">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Display-ID, Standort suchen..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-secondary bg-surface-primary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <span className="text-xs text-text-muted font-mono">{filtered.length} Ergebnisse</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center">
          <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-2" />
          <div className="text-xs text-text-muted">Keine Einträge</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-secondary/40">
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((item, idx) => (
                <tr key={item.displayId || item.opsNr || idx} className="border-b border-border-secondary/60 hover:bg-surface-secondary/40 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 ${col.mono ? 'font-mono' : ''} ${col.truncate ? 'max-w-[140px] truncate' : ''} text-text-primary`}
                    >
                      {col.render ? col.render(item) : (item[col.key] || '–')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div className="px-4 py-2.5 text-center text-xs text-text-muted border-t border-border-secondary/40">
              Zeige 100 von {filtered.length} Einträgen
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── Status Badge ──────────────────────── */

function StatusBadge({ status }) {
  if (!status) return <span className="text-text-muted">–</span>;
  const isLive = /live/i.test(status);
  const isDeinstalled = /deinstall/i.test(status);
  const color = isLive ? '#34C759' : isDeinstalled ? '#f97316' : '#64748b';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}33` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

/* ──────────────────────── Date Helper ──────────────────────── */

function fmtDate(d) {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
}
