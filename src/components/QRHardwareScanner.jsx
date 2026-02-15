import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X, Search, Camera, Keyboard, ChevronDown, ChevronRight,
  Cpu, CreditCard, Monitor, MapPin, Clock, Trash2,
  AlertCircle, CheckCircle2, Wifi, WifiOff, ScanLine,
  RotateCcw, Loader2, History, Copy, ExternalLink,
} from 'lucide-react';
import { supabase } from '../utils/authService';

/* ═══════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════ */

const HISTORY_KEY = 'qr_scan_history';
const MAX_HISTORY = 10;

/* ═══════════════════════════════════════════════════
   HARDWARE SEARCH
   ═══════════════════════════════════════════════════ */

async function searchHardware(query) {
  const normalized = query.trim().replace(/\s+/g, '');
  if (!normalized) return null;

  const [opsResult, simResult, displayResult, locationResult] = await Promise.all([
    supabase
      .from('hardware_ops')
      .select('*')
      .or(`ops_nr.ilike.%${normalized}%,display_location_id.ilike.%${normalized}%,sim_id.ilike.%${normalized}%,navori_venue_id.ilike.%${normalized}%`),
    supabase
      .from('hardware_sim')
      .select('*')
      .or(`sim_id.ilike.%${normalized}%,ops_record_id.ilike.%${normalized}%`),
    supabase
      .from('hardware_displays')
      .select('*')
      .or(`display_serial_number.ilike.%${normalized}%,location.ilike.%${normalized}%,ops_record_id.ilike.%${normalized}%`),
    supabase
      .from('airtable_displays')
      .select('display_id, location_name, jet_id, online_status, screen_type, city, district, sov_partner_ad')
      .or(`display_id.ilike.%${normalized}%,jet_id.ilike.%${normalized}%,location_name.ilike.%${normalized}%`),
  ]);

  return {
    ops: opsResult.data || [],
    sim: simResult.data || [],
    displays: displayResult.data || [],
    locations: locationResult.data || [],
    errors: [opsResult.error, simResult.error, displayResult.error, locationResult.error].filter(Boolean),
  };
}

/* ═══════════════════════════════════════════════════
   SCAN HISTORY HELPERS
   ═══════════════════════════════════════════════════ */

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveToHistory(query, resultCount) {
  const history = loadHistory();
  const entry = { query, resultCount, timestamp: Date.now() };
  // Remove duplicate
  const filtered = history.filter(h => h.query !== query);
  filtered.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

/* ═══════════════════════════════════════════════════
   RESULT CARDS
   ═══════════════════════════════════════════════════ */

function StatusBadge({ status, color }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: `${color}18`, color }}
    >
      {status}
    </span>
  );
}

function ResultCard({ type, icon: Icon, color, title, subtitle, badges, details, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen || false);

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm shadow-black/[0.03] mobile-card-enter">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left active:bg-slate-50/60 transition-colors"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}15` }}
        >
          <Icon size={20} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
              {type}
            </span>
            {badges?.map((b, i) => (
              <StatusBadge key={i} status={b.label} color={b.color} />
            ))}
          </div>
          <div className="font-mono text-sm font-semibold text-slate-800 truncate mt-0.5">{title}</div>
          {subtitle && <div className="text-xs text-slate-400 truncate">{subtitle}</div>}
        </div>
        <ChevronRight
          size={16}
          className={`text-slate-300 transition-transform duration-200 shrink-0 ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && details && (
        <div className="border-t border-slate-100/80 bg-slate-50/40 px-4 py-3 space-y-2">
          {details.map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider w-28 shrink-0 pt-0.5">
                {d.label}
              </span>
              <span className={`text-sm text-slate-700 break-all ${d.mono ? 'font-mono' : ''}`}>
                {d.value || '\u2013'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   OPS RESULT
   ═══════════════════════════════════════════════════ */

function OpsResultCard({ ops, isOnly }) {
  const statusColor = (ops.status || '').toLowerCase().includes('active') ? '#22c55e'
    : (ops.status || '').toLowerCase().includes('defect') ? '#ef4444'
    : '#64748b';

  return (
    <ResultCard
      type="OPS Player"
      icon={Cpu}
      color="#3b82f6"
      title={ops.ops_nr || ops.id || 'Unbekannt'}
      subtitle={ops.display_location_id ? `Standort: ${ops.display_location_id}` : null}
      badges={ops.status ? [{ label: ops.status, color: statusColor }] : []}
      defaultOpen={isOnly}
      details={[
        { label: 'OPS Nr.', value: ops.ops_nr, mono: true },
        { label: 'Status', value: ops.status },
        { label: 'Standort ID', value: ops.display_location_id, mono: true },
        { label: 'SIM ID', value: ops.sim_id, mono: true },
        { label: 'Navori Venue', value: ops.navori_venue_id, mono: true },
        { label: 'Erstellt', value: ops.created_at ? new Date(ops.created_at).toLocaleDateString('de-DE') : null },
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════
   SIM RESULT
   ═══════════════════════════════════════════════════ */

function SimResultCard({ sim, isOnly }) {
  return (
    <ResultCard
      type="SIM Karte"
      icon={CreditCard}
      color="#8b5cf6"
      title={sim.sim_id || sim.id || 'Unbekannt'}
      subtitle={sim.ops_record_id ? `OPS: ${sim.ops_record_id}` : null}
      badges={sim.activate_date ? [{ label: 'Aktiviert', color: '#22c55e' }] : [{ label: 'Nicht aktiviert', color: '#64748b' }]}
      defaultOpen={isOnly}
      details={[
        { label: 'SIM ID', value: sim.sim_id, mono: true },
        { label: 'OPS Record', value: sim.ops_record_id, mono: true },
        { label: 'Aktiviert', value: sim.activate_date ? new Date(sim.activate_date).toLocaleDateString('de-DE') : 'Nein' },
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════
   DISPLAY RESULT
   ═══════════════════════════════════════════════════ */

function DisplayResultCard({ display, isOnly }) {
  return (
    <ResultCard
      type="Display"
      icon={Monitor}
      color="#f59e0b"
      title={display.display_serial_number || display.id || 'Unbekannt'}
      subtitle={display.location || null}
      defaultOpen={isOnly}
      details={[
        { label: 'Seriennummer', value: display.display_serial_number, mono: true },
        { label: 'Standort', value: display.location },
        { label: 'OPS Record', value: display.ops_record_id, mono: true },
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════
   LOCATION / AIRTABLE_DISPLAYS RESULT
   ═══════════════════════════════════════════════════ */

function LocationResultCard({ loc, isOnly }) {
  const isOnline = (loc.online_status || '').toLowerCase().includes('live') ||
                   (loc.online_status || '').toLowerCase().includes('online');
  const statusColor = isOnline ? '#22c55e' : '#ef4444';

  return (
    <ResultCard
      type="Standort"
      icon={MapPin}
      color="#10b981"
      title={loc.display_id || loc.jet_id || 'Unbekannt'}
      subtitle={loc.location_name || null}
      badges={[
        loc.online_status ? { label: loc.online_status, color: statusColor } : null,
        loc.screen_type ? { label: loc.screen_type, color: '#6366f1' } : null,
      ].filter(Boolean)}
      defaultOpen={isOnly}
      details={[
        { label: 'Display ID', value: loc.display_id, mono: true },
        { label: 'JET ID', value: loc.jet_id, mono: true },
        { label: 'Standort', value: loc.location_name },
        { label: 'Stadt', value: loc.city },
        { label: 'Bezirk', value: loc.district },
        { label: 'Screen', value: loc.screen_type },
        { label: 'SOV Partner', value: loc.sov_partner_ad },
        { label: 'Status', value: loc.online_status },
      ]}
    />
  );
}

/* ═══════════════════════════════════════════════════
   CAMERA SCANNER
   ═══════════════════════════════════════════════════ */

function CameraScanner({ onScan, onError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [barcodeDetectorSupported, setBarcodeDetectorSupported] = useState(false);

  useEffect(() => {
    // Check BarcodeDetector API support
    const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    setBarcodeDetectorSupported(supported);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        setHasCamera(true);
      }
    } catch (err) {
      console.warn('[QRScanner] Camera error:', err);
      setHasCamera(false);
      onError?.('Kamera nicht verfuegbar. Bitte Berechtigung erteilen oder manuell eingeben.');
    }
  }, [onError]);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  // Start scanning loop using BarcodeDetector
  useEffect(() => {
    if (!scanning || !barcodeDetectorSupported || !videoRef.current) return;

    const detector = new window.BarcodeDetector({
      formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'data_matrix'],
    });

    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const value = barcodes[0].rawValue;
          if (value) {
            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
            stopCamera();
            onScan(value);
          }
        }
      } catch {
        // Detection frame error — ignore
      }
    }, 250);

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [scanning, barcodeDetectorSupported, onScan, stopCamera]);

  // Fallback: Use canvas-based scanning with html5-qrcode if BarcodeDetector not available
  // For now, we rely on BarcodeDetector + manual input fallback
  useEffect(() => {
    if (!scanning || barcodeDetectorSupported) return;
    // No native BarcodeDetector — show message but keep camera as visual guide
    // Users can still manually type the code they see
  }, [scanning, barcodeDetectorSupported]);

  // Auto-start camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasCamera) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <AlertCircle size={28} className="text-red-400" />
        </div>
        <p className="text-sm font-medium text-slate-700 mb-1">Kamera nicht verfuegbar</p>
        <p className="text-xs text-slate-400 max-w-[260px]">
          Bitte erlaube den Kamera-Zugriff in deinen Browser-Einstellungen oder nutze die manuelle Eingabe.
        </p>
        <button
          onClick={startCamera}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium active:bg-blue-600 transition-colors"
        >
          <RotateCcw size={14} />
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: '4/3' }}>
      {/* Video Feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover rounded-2xl"
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Scan Overlay */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        {/* Darkened border areas */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Transparent scan window */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56">
          {/* Cut-out (transparent) */}
          <div className="absolute inset-0 rounded-2xl" style={{
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }} />

          {/* Animated corner brackets */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-blue-400 rounded-tl-xl qr-corner-animate" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-blue-400 rounded-tr-xl qr-corner-animate" style={{ animationDelay: '0.1s' }} />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-blue-400 rounded-bl-xl qr-corner-animate" style={{ animationDelay: '0.2s' }} />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-blue-400 rounded-br-xl qr-corner-animate" style={{ animationDelay: '0.3s' }} />

          {/* Scan line animation */}
          <div className="absolute left-3 right-3 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent qr-scan-line" />
        </div>
      </div>

      {/* Status indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[11px] font-medium text-white/90">
          {barcodeDetectorSupported ? 'Scanne...' : 'Kamera aktiv - manuelle Eingabe empfohlen'}
        </span>
      </div>

      {/* Restart button if stopped */}
      {!scanning && hasCamera && (
        <button
          onClick={startCamera}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-500 text-white font-medium text-sm shadow-lg active:bg-blue-600 transition-colors"
        >
          <Camera size={18} />
          Scanner starten
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function QRHardwareScanner({ onClose }) {
  const [mode, setMode] = useState('camera'); // 'camera' | 'manual'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [scannedValue, setScannedValue] = useState(null);
  const inputRef = useRef(null);
  const contentRef = useRef(null);

  // Touch-to-close gesture
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  const handleTouchStart = useCallback((e) => {
    // Only if scrolled to top
    if (contentRef.current && contentRef.current.scrollTop > 5) return;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchStartY.current) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) {
      setDragOffset(Math.min(diff * 0.6, 200));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragOffset > 100) {
      onClose();
    }
    setDragOffset(0);
    touchStartY.current = 0;
  }, [dragOffset, onClose]);

  // Execute search
  const doSearch = useCallback(async (q) => {
    const term = (q || '').trim();
    if (!term) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await searchHardware(term);
      setResults(res);

      // Count total results
      const total = (res.ops?.length || 0) + (res.sim?.length || 0) +
                    (res.displays?.length || 0) + (res.locations?.length || 0);

      // Save to history
      saveToHistory(term, total);
      setHistory(loadHistory());

      // Haptic on result
      if (total > 0 && navigator.vibrate) navigator.vibrate(30);

      if (res.errors?.length) {
        console.warn('[QRScanner] Search errors:', res.errors);
      }
    } catch (err) {
      console.error('[QRScanner] Search failed:', err);
      setError('Suche fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle scan from camera
  const handleCameraScan = useCallback((value) => {
    setScannedValue(value);
    setQuery(value);
    setMode('manual'); // Switch to show results
    doSearch(value);
  }, [doSearch]);

  // Handle manual search
  const handleManualSearch = useCallback(() => {
    if (query.trim()) {
      setScannedValue(query.trim());
      doSearch(query.trim());
    }
  }, [query, doSearch]);

  // Handle history tap
  const handleHistoryTap = useCallback((q) => {
    setQuery(q);
    setScannedValue(q);
    doSearch(q);
  }, [doSearch]);

  // Handle clear
  const handleClear = useCallback(() => {
    setQuery('');
    setResults(null);
    setError(null);
    setScannedValue(null);
  }, []);

  // Total results count
  const totalResults = useMemo(() => {
    if (!results) return 0;
    return (results.ops?.length || 0) + (results.sim?.length || 0) +
           (results.displays?.length || 0) + (results.locations?.length || 0);
  }, [results]);

  // Focus input when switching to manual
  useEffect(() => {
    if (mode === 'manual' && inputRef.current && !scannedValue) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [mode, scannedValue]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{
        transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        transition: dragOffset === 0 ? 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        style={{ opacity: dragOffset > 0 ? 1 - dragOffset / 300 : 1 }}
      />

      {/* Main Sheet */}
      <div className="relative mt-auto flex flex-col bg-[#f8fafc] rounded-t-3xl overflow-hidden qr-scanner-slide-up"
        style={{ maxHeight: '92vh' }}
      >
        {/* Drag Handle */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-9 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Hardware Scanner</h2>
            <p className="text-xs text-slate-400">QR-Code scannen oder ID eingeben</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:bg-slate-200 transition-colors"
          >
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex mx-5 mb-4 p-1 rounded-xl bg-slate-100/80">
          <button
            onClick={() => { setMode('camera'); handleClear(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              mode === 'camera'
                ? 'bg-white text-blue-600 shadow-sm shadow-black/[0.06]'
                : 'text-slate-400'
            }`}
          >
            <Camera size={16} />
            Kamera
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              mode === 'manual'
                ? 'bg-white text-blue-600 shadow-sm shadow-black/[0.06]'
                : 'text-slate-400'
            }`}
          >
            <Keyboard size={16} />
            Eingabe
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8"
          style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Camera View */}
          {mode === 'camera' && !scannedValue && (
            <div className="mb-4">
              <CameraScanner
                onScan={handleCameraScan}
                onError={setCameraError}
              />
              {cameraError && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50/80 border border-amber-200/50">
                  <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-xs text-amber-700">{cameraError}</span>
                </div>
              )}

              {/* Supported formats note */}
              <div className="mt-3 text-center">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                  QR-Code, Code128, EAN-13, Data Matrix
                </span>
              </div>
            </div>
          )}

          {/* Manual Input */}
          {(mode === 'manual' || scannedValue) && (
            <div className="mb-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                    placeholder="OPS-Nr., Seriennummer, SIM ID..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/80 border border-slate-200/60 text-sm font-mono text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all"
                  />
                  {query && (
                    <button
                      onClick={handleClear}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X size={14} className="text-slate-300" />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleManualSearch}
                  disabled={!query.trim() || loading}
                  className="px-5 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm active:bg-blue-600 disabled:opacity-40 disabled:active:bg-blue-500 transition-all flex items-center gap-2 shrink-0"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Suchen
                </button>
              </div>

              {/* Scanned value indicator */}
              {scannedValue && mode === 'manual' && (
                <div className="mt-2 flex items-center gap-2">
                  <ScanLine size={12} className="text-green-500" />
                  <span className="text-[11px] text-green-600 font-medium">Gescannt</span>
                  <button
                    onClick={() => { setMode('camera'); handleClear(); }}
                    className="ml-auto text-[11px] text-blue-500 font-medium"
                  >
                    Erneut scannen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center py-12">
              <Loader2 size={28} className="text-blue-500 animate-spin mb-3" />
              <span className="text-sm text-slate-400 font-medium">Hardware wird gesucht...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50/80 border border-red-200/50 mb-4">
              <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">{error}</p>
                <button
                  onClick={() => doSearch(query)}
                  className="mt-2 text-xs text-red-500 font-medium underline"
                >
                  Erneut versuchen
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {results && !loading && (
            <div className="space-y-3">
              {/* Results Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {totalResults} {totalResults === 1 ? 'Ergebnis' : 'Ergebnisse'}
                </span>
                {scannedValue && (
                  <span className="text-xs text-slate-400 font-mono truncate max-w-[180px]">
                    {scannedValue}
                  </span>
                )}
              </div>

              {/* No Results */}
              {totalResults === 0 && (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Search size={24} className="text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">Kein Ergebnis</p>
                  <p className="text-xs text-slate-400 max-w-[240px]">
                    Keine Hardware mit "{scannedValue || query}" gefunden. Versuche eine andere ID oder Seriennummer.
                  </p>
                </div>
              )}

              {/* OPS Results */}
              {results.ops?.length > 0 && (
                <div className="space-y-2">
                  {results.ops.length > 1 && (
                    <h3 className="text-[10px] font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu size={12} />
                      OPS Player ({results.ops.length})
                    </h3>
                  )}
                  {results.ops.map((ops, i) => (
                    <OpsResultCard key={ops.id || i} ops={ops} isOnly={totalResults === 1} />
                  ))}
                </div>
              )}

              {/* SIM Results */}
              {results.sim?.length > 0 && (
                <div className="space-y-2">
                  {results.sim.length > 1 && (
                    <h3 className="text-[10px] font-bold text-purple-500 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard size={12} />
                      SIM Karten ({results.sim.length})
                    </h3>
                  )}
                  {results.sim.map((sim, i) => (
                    <SimResultCard key={sim.id || i} sim={sim} isOnly={totalResults === 1} />
                  ))}
                </div>
              )}

              {/* Display Results */}
              {results.displays?.length > 0 && (
                <div className="space-y-2">
                  {results.displays.length > 1 && (
                    <h3 className="text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Monitor size={12} />
                      Displays ({results.displays.length})
                    </h3>
                  )}
                  {results.displays.map((d, i) => (
                    <DisplayResultCard key={d.id || i} display={d} isOnly={totalResults === 1} />
                  ))}
                </div>
              )}

              {/* Location Results */}
              {results.locations?.length > 0 && (
                <div className="space-y-2">
                  {results.locations.length > 1 && (
                    <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin size={12} />
                      Standorte ({results.locations.length})
                    </h3>
                  )}
                  {results.locations.map((loc, i) => (
                    <LocationResultCard key={loc.display_id || i} loc={loc} isOnly={totalResults === 1} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Scan History */}
          {!loading && !results && history.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <History size={12} />
                  Letzte Scans
                </h3>
                <button
                  onClick={() => { clearHistory(); setHistory([]); }}
                  className="text-[10px] text-slate-400 font-medium active:text-red-500 transition-colors"
                >
                  Alle loeschen
                </button>
              </div>

              <div className="space-y-1.5">
                {history.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => handleHistoryTap(item.query)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/50 border border-slate-100/60 active:bg-slate-50 transition-colors text-left"
                  >
                    <Clock size={14} className="text-slate-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-mono font-medium text-slate-700 truncate block">{item.query}</span>
                      <span className="text-[10px] text-slate-400">
                        {item.resultCount} {item.resultCount === 1 ? 'Treffer' : 'Treffer'}
                        {' \u00b7 '}
                        {new Date(item.timestamp).toLocaleString('de-DE', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty state: no history, no results, manual mode */}
          {!loading && !results && history.length === 0 && mode === 'manual' && (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <Search size={24} className="text-blue-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600 mb-1">Hardware suchen</p>
              <p className="text-xs text-slate-400 max-w-[260px]">
                Gib eine OPS-Nr., Seriennummer, SIM-ID oder Display-ID ein, um die zugehoerige Hardware zu finden.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
