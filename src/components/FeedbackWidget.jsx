/**
 * FeedbackWidget — Right-click bug/feedback reporter
 *
 * Adds a custom context menu overlay on the entire app.
 * When the user right-clicks anywhere, a context menu appears with:
 *   - Bug melden
 *   - Feedback geben
 *   - Screenshot + Notiz
 *   - Standard-Menu anzeigen (re-opens native context menu)
 *
 * Selecting an option opens a modal that:
 *   - Auto-captures URL, viewport, user agent, timestamp, click position
 *   - Lets user set type, priority, and description
 *   - Shows a red dot at the click position for developer reference
 *   - Stores everything in Supabase `feedback_requests` table
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bug,
  Lightbulb,
  Camera,
  Menu,
  X,
  Send,
  MapPin,
  Monitor,
  Clock,
  Globe,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { supabase } from '../utils/authService';
import { getCurrentUser } from '../utils/authService';

/* ─── Type Config ─── */

const TYPES = {
  bug: { label: 'Bug melden', icon: Bug, color: '#FF3B30', dbValue: 'bug' },
  feedback: { label: 'Feedback geben', icon: Lightbulb, color: '#FF9500', dbValue: 'feedback' },
  screenshot: { label: 'Screenshot + Notiz', icon: Camera, color: '#007AFF', dbValue: 'feature' },
};

const PRIORITIES = [
  { value: 'low', label: 'Niedrig', color: '#64748b' },
  { value: 'medium', label: 'Mittel', color: '#007AFF' },
  { value: 'high', label: 'Hoch', color: '#FF9500' },
  { value: 'critical', label: 'Kritisch', color: '#FF3B30' },
];

/* ─── Helpers ─── */

function getPageContext() {
  const raw = window.location.hash.replace('#', '');
  const [mainHash, subHash] = raw.split('/');
  const title = document.title;

  // Try to detect active tab/component name from hash or page title
  const tabNames = {
    overview: 'Overview',
    'displays-list': 'Displays',
    tasks: 'Tasks',
    communication: 'Kommunikation',
    admin: 'Admin',
    programmatic: 'Programmatic',
    hardware: 'Hardware',
    acquisition: 'Akquise',
    map: 'Karte',
    contacts: 'Kontakte',
    cities: 'Staedte',
    activities: 'Aktivitaeten',
    installations: 'Installationen',
    'akquise-app': 'Akquise App',
  };

  const mainName = tabNames[mainHash] || mainHash || 'Unknown';
  const component = subHash ? `${mainName} > ${subHash}` : mainName;

  // Try to find any visible search/filter inputs
  const searchInputs = document.querySelectorAll('input[type="text"], input[type="search"]');
  const activeFilters = [];
  searchInputs.forEach((input) => {
    if (input.value && input.value.trim()) {
      const label = input.placeholder || input.getAttribute('aria-label') || 'Filter';
      activeFilters.push({ label, value: input.value.trim() });
    }
  });

  return {
    url: window.location.href,
    component,
    pageTitle: title,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    activeFilters: activeFilters.length > 0 ? activeFilters : null,
    hash: raw,
  };
}

function getElementAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;

  // Walk up to find a meaningful component name
  let current = el;
  const classes = [];
  const tags = [];
  for (let i = 0; i < 5 && current; i++) {
    if (current.className && typeof current.className === 'string') {
      classes.push(current.className.split(' ').slice(0, 3).join(' '));
    }
    tags.push(current.tagName?.toLowerCase() || '');
    current = current.parentElement;
  }

  return {
    tag: el.tagName?.toLowerCase(),
    text: (el.textContent || '').slice(0, 100),
    path: tags.reverse().join(' > '),
    nearestClasses: classes[0] || '',
  };
}

/* ─── Context Menu Component ─── */

function ContextMenu({ x, y, onSelect, onClose }) {
  const menuRef = useRef(null);

  // Position the menu so it doesn't overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    if (x > maxX) menuRef.current.style.left = `${maxX}px`;
    if (y > maxY) menuRef.current.style.top = `${maxY}px`;
  }, [x, y]);

  const items = [
    { id: 'bug', icon: Bug, label: 'Bug melden', emoji: '', color: '#FF3B30' },
    { id: 'feedback', icon: Lightbulb, label: 'Feedback geben', emoji: '', color: '#FF9500' },
    { id: 'screenshot', icon: Camera, label: 'Screenshot + Notiz', emoji: '', color: '#007AFF' },
    { id: 'divider' },
    { id: 'native', icon: Menu, label: 'Standard-Menu anzeigen', emoji: '', color: '#64748b' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[9999] bg-surface-primary border border-border-secondary/80 rounded-xl shadow-2xl shadow-black/10 py-1.5 min-w-[220px] animate-fade-in"
        style={{ left: x, top: y }}
      >
        {items.map((item) => {
          if (item.id === 'divider') {
            return <div key="divider" className="my-1.5 border-t border-border-secondary" />;
          }
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-text-primary hover:bg-surface-secondary/80 transition-colors group"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ backgroundColor: item.color + '12' }}
              >
                <Icon size={14} style={{ color: item.color }} />
              </div>
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ─── Click Position Marker ─── */

function ClickMarker({ x, y }) {
  return (
    <div
      className="fixed z-[9997] pointer-events-none"
      style={{ left: x - 12, top: y - 12 }}
    >
      <div className="relative">
        {/* Outer pulse ring */}
        <div
          className="absolute inset-0 w-6 h-6 rounded-full border-2 border-red-400 animate-ping"
          style={{ animationDuration: '1.5s' }}
        />
        {/* Inner dot */}
        <div className="w-6 h-6 rounded-full bg-status-offline/30 border-2 border-status-offline flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-status-offline" />
        </div>
      </div>
    </div>
  );
}

/* ─── Feedback Modal ─── */

function FeedbackModal({ type, clickX, clickY, context, onClose, onSubmitted }) {
  const typeConfig = TYPES[type] || TYPES.feedback;
  const [priority, setPriority] = useState('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const descRef = useRef(null);

  // Auto-focus description field
  useEffect(() => {
    setTimeout(() => descRef.current?.focus(), 100);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim() && !title.trim()) {
      setError('Bitte eine Beschreibung eingeben');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const user = getCurrentUser();
      const elementInfo = getElementAtPoint(clickX, clickY);

      const record = {
        user_id: user?.id || user?.email || 'anonymous',
        user_name: user?.name || 'Unbekannt',
        user_email: user?.email || null,
        type: typeConfig.dbValue,
        title: title.trim() || `${typeConfig.label} - ${context.component}`,
        description: description.trim(),
        priority,
        status: 'open',
        click_x: clickX,
        click_y: clickY,
        url: context.url,
        component: context.component,
        viewport_width: context.viewportWidth,
        viewport_height: context.viewportHeight,
        user_agent: context.userAgent,
        context_data: {
          timestamp: context.timestamp,
          hash: context.hash,
          pageTitle: context.pageTitle,
          activeFilters: context.activeFilters,
          elementAtClick: elementInfo,
          screenWidth: window.screen?.width,
          screenHeight: window.screen?.height,
          devicePixelRatio: window.devicePixelRatio,
        },
      };

      const { error: sbError } = await supabase
        .from('feedback_requests')
        .insert([record]);

      if (sbError) throw sbError;

      // Post to Slack (fire-and-forget, don't block on failure)
      try {
        fetch('/.netlify/functions/slack-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: typeConfig.dbValue,
            title: record.title,
            description: record.description,
            priority,
            userName: record.user_name,
            component: context.component,
            url: context.url,
          }),
        }).catch(() => {}); // silent fail — Supabase is the source of truth
      } catch (_) { /* ignore */ }

      setSubmitted(true);
      if (onSubmitted) onSubmitted();

      // Auto-close after 1.5s
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      console.error('[FeedbackWidget] Submit error:', err);
      setError('Fehler beim Senden. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20">
        <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-emerald-500" />
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-1">Gesendet!</h3>
          <p className="text-sm text-text-muted">Danke fuer dein Feedback. Wir kuemmern uns darum.</p>
        </div>
      </div>
    );
  }

  const TypeIcon = typeConfig.icon;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20">
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: typeConfig.color + '15' }}
            >
              <TypeIcon size={18} style={{ color: typeConfig.color }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{typeConfig.label}</h3>
              <p className="text-xs text-text-muted">{context.component} - {context.hash || 'root'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-secondary/60 text-text-muted hover:text-text-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-status-offline/10/80 border border-status-offline/20/60 text-xs text-status-offline">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Context Info (collapsed by default) */}
          <details className="group">
            <summary className="flex items-center gap-2 text-xs text-text-muted cursor-pointer hover:text-text-primary transition-colors select-none">
              <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
              Erfasster Kontext
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2 p-3 bg-surface-secondary/80 rounded-xl border border-border-secondary/40">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Globe size={10} />
                <span className="font-mono truncate">{context.url}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Monitor size={10} />
                <span className="font-mono">{context.viewportWidth} x {context.viewportHeight}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <MapPin size={10} />
                <span className="font-mono">Klick: ({clickX}, {clickY})</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Clock size={10} />
                <span className="font-mono">
                  {new Date(context.timestamp).toLocaleString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
              {context.activeFilters && context.activeFilters.length > 0 && (
                <div className="col-span-2 flex items-center gap-1.5 text-xs text-text-muted">
                  <span className="font-medium">Filter:</span>
                  {context.activeFilters.map((f, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-accent-light text-accent rounded text-xs">
                      {f.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </details>

          {/* Title */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Titel (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`z.B. Button funktioniert nicht auf ${context.component}...`}
              className="w-full bg-surface-secondary/80 border border-border-secondary rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-accent/10 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-text-muted block mb-1.5">Beschreibung *</label>
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError(''); }}
              placeholder="Was ist passiert? Was hast du erwartet?"
              rows={4}
              className="w-full bg-surface-secondary/80 border border-border-secondary rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-accent/10 transition-all resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-text-muted block mb-2">Prioritaet</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                    priority === p.value
                      ? 'shadow-sm scale-[1.02]'
                      : 'hover:scale-[1.01] opacity-60 hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: priority === p.value ? p.color + '12' : 'transparent',
                    borderColor: priority === p.value ? p.color + '40' : '#e2e8f040',
                    color: priority === p.value ? p.color : '#64748b',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-primary border border-border-secondary text-text-secondary hover:bg-surface-secondary transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: typeConfig.color }}
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {submitting ? 'Sende...' : 'Absenden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Widget ─── */

export default function FeedbackWidget() {
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
  const [modal, setModal] = useState(null); // { type, clickX, clickY, context }
  const [clickMarker, setClickMarker] = useState(null); // { x, y }
  const nativeMenuRef = useRef(false);

  // Handle right-click globally
  const handleContextMenu = useCallback((e) => {
    // If native menu was requested, allow it once
    if (nativeMenuRef.current) {
      nativeMenuRef.current = false;
      return;
    }

    // Don't intercept right-clicks on inputs/textareas (allow normal browser behavior)
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return;
    }

    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
    setClickMarker({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [handleContextMenu]);

  // Close context menu on escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (modal) {
          setModal(null);
          setClickMarker(null);
        } else if (contextMenu) {
          setContextMenu(null);
          setClickMarker(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu, modal]);

  const handleMenuSelect = useCallback((id) => {
    if (id === 'native') {
      // Close custom menu and re-trigger native context menu
      setContextMenu(null);
      setClickMarker(null);
      nativeMenuRef.current = true;
      // Dispatch a new contextmenu event at the same position
      const el = document.elementFromPoint(contextMenu.x, contextMenu.y);
      if (el) {
        const evt = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: contextMenu.x,
          clientY: contextMenu.y,
          button: 2,
        });
        el.dispatchEvent(evt);
      }
      return;
    }

    // Capture context at the moment of selection
    const context = getPageContext();
    setModal({
      type: id,
      clickX: contextMenu.x,
      clickY: contextMenu.y,
      context,
    });
    setContextMenu(null);
  }, [contextMenu]);

  const handleCloseMenu = useCallback(() => {
    setContextMenu(null);
    setClickMarker(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModal(null);
    setClickMarker(null);
  }, []);

  return (
    <>
      {/* Click position marker */}
      {clickMarker && (modal || contextMenu) && (
        <ClickMarker x={clickMarker.x} y={clickMarker.y} />
      )}

      {/* Context menu */}
      {contextMenu && !modal && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={handleMenuSelect}
          onClose={handleCloseMenu}
        />
      )}

      {/* Feedback modal */}
      {modal && (
        <FeedbackModal
          type={modal.type}
          clickX={modal.clickX}
          clickY={modal.clickY}
          context={modal.context}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}
