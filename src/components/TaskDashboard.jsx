import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardList,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  CircleDot,
  Pause,
  Search,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  Filter,
  BarChart3,
  TrendingUp,
  Users,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus,
  Edit3,
  Trash2,
  X,
  Phone,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { fetchAllTasks, createTask, updateTask, deleteTask } from '../utils/airtableService';
import TaskCreateModal from './TaskCreateModal';
import TaskEditModal from './TaskEditModal';
import StimmcheckModal from './StimmcheckModal';

/* ──────────────────────── constants ──────────────────────── */

const STATUS_CONFIG = {
  'New':         { color: '#007AFF', bg: '#007AFF/15', label: 'New', icon: CircleDot },
  'In Progress': { color: '#FF9500', bg: '#FF9500/15', label: 'In Progress', icon: Clock },
  'Follow Up':   { color: '#a855f7', bg: '#a855f7/15', label: 'Follow Up', icon: ArrowUpRight },
  'On Hold':     { color: '#64748b', bg: '#64748b/15', label: 'On Hold', icon: Pause },
  'In Review':   { color: '#06b6d4', bg: '#06b6d4/15', label: 'In Review', icon: Search },
  'Completed':   { color: '#34C759', bg: '#34C759/15', label: 'Completed', icon: CheckCircle2 },
};

const STATUS_ORDER = ['New', 'In Progress', 'Follow Up', 'On Hold', 'In Review', 'Completed'];

const PRIORITY_COLORS = {
  'Urgent': '#FF3B30',
  'High': '#FF3B30',
  'Medium': '#FF9500',
  'Low': '#34C759',
};

const PIE_COLORS = ['#007AFF', '#FF9500', '#a855f7', '#64748b', '#06b6d4', '#34C759'];

/* ──────────────────────── helper ──────────────────────── */

function formatDate(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

/* ──────────────────────── main component ──────────────────────── */

export default function TaskDashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Task list
  const [sortField, setSortField] = useState('createdTime');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [expandedTask, setExpandedTask] = useState(null);
  const PAGE_SIZE = 25;

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Stimmcheck modal
  const [stimmcheckTask, setStimmcheckTask] = useState(null);

  // Success toast
  const [successMsg, setSuccessMsg] = useState(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllTasks();
      setTasks(data);
    } catch (err) {
      console.error('[TaskDashboard] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  /* ──── Task CRUD handlers ──── */

  const [createError, setCreateError] = useState(null);

  const handleCreateTask = useCallback(async (taskData) => {
    setModalLoading(true);
    setCreateError(null);
    try {
      const result = await createTask(taskData);
      if (result) {
        // Optimistic insert: add the new task to the local list immediately
        // so it appears without waiting for Supabase sync
        const newTask = {
          id: result.id,
          title: taskData.title || '',
          partner: taskData.partner || '',
          status: taskData.status || 'New',
          priority: taskData.priority || 'Medium',
          dueDate: taskData.dueDate || null,
          description: taskData.description || '',
          createdTime: new Date().toISOString(),
          responsibleUser: taskData.assignedUserName || '',
          assigned: taskData.assignedUserName ? [taskData.assignedUserName] : [],
          createdBy: '',
          displayIds: [],
          locationNames: [],
          overdue: '',
          completedDate: null,
        };
        setTasks(prev => [newTask, ...prev]);

        setShowCreateModal(false);
        setCreateError(null);

        // Show success toast
        setSuccessMsg(`Task "${taskData.title}" erfolgreich erstellt`);
        setTimeout(() => setSuccessMsg(null), 4000);

        // Background: reload from Supabase after a short delay
        // so the full data (display IDs, location names etc.) gets populated
        setTimeout(() => {
          loadTasks().catch(() => {});
        }, 3000);
      } else {
        setCreateError('Task konnte nicht erstellt werden. Bitte versuche es erneut.');
      }
    } catch (err) {
      console.error('[TaskDashboard] Create task error:', err);
      setCreateError(err.message || 'Fehler beim Erstellen des Tasks');
    } finally {
      setModalLoading(false);
    }
  }, [loadTasks]);

  const handleUpdateTask = useCallback(async (recordId, fields) => {
    setModalLoading(true);
    try {
      const result = await updateTask(recordId, fields);
      if (result) {
        setEditingTask(null);
        await loadTasks();
      }
    } catch (err) {
      console.error('Update task error:', err);
    } finally {
      setModalLoading(false);
    }
  }, [loadTasks]);

  const handleDeleteTask = useCallback(async (recordId) => {
    setModalLoading(true);
    try {
      const success = await deleteTask(recordId);
      if (success) {
        setEditingTask(null);
        setExpandedTask(null);
        await loadTasks();
      }
    } catch (err) {
      console.error('Delete task error:', err);
    } finally {
      setModalLoading(false);
    }
  }, [loadTasks]);

  const handleQuickStatus = useCallback(async (e, taskId, newStatus) => {
    e.stopPropagation();
    try {
      await updateTask(taskId, { 'Status': newStatus });
      await loadTasks();
    } catch (err) {
      console.error('Quick status error:', err);
    }
  }, [loadTasks]);

  /* ──── Derived data ──── */

  // Unique values for filter dropdowns
  const allAssignees = useMemo(() => {
    const names = new Set();
    tasks.forEach(t => {
      if (t.createdBy) names.add(t.createdBy);
      t.assigned.forEach(a => names.add(a));
    });
    return [...names].sort();
  }, [tasks]);

  const allPartners = useMemo(() => {
    const partners = new Set();
    tasks.forEach(t => {
      if (t.partner) partners.add(t.partner);
    });
    return [...partners].sort();
  }, [tasks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (partnerFilter !== 'all' && t.partner !== partnerFilter) return false;
      if (assigneeFilter !== 'all') {
        const all = [...t.assigned, t.createdBy];
        if (!all.includes(assigneeFilter)) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) &&
            !t.description.toLowerCase().includes(q) &&
            !(t.displayIds || []).some(d => d.toLowerCase().includes(q)) &&
            !(t.locationNames || []).some(l => l.toLowerCase().includes(q))) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, statusFilter, partnerFilter, assigneeFilter, searchQuery]);

  // Sorted tasks
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    sorted.sort((a, b) => {
      let va = a[sortField] || '';
      let vb = b[sortField] || '';
      if (sortField === 'createdTime' || sortField === 'dueDate') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredTasks, sortField, sortDir]);

  const pagedTasks = useMemo(() => {
    return sortedTasks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [sortedTasks, page]);

  const totalPages = Math.ceil(sortedTasks.length / PAGE_SIZE);

  /* ──── KPI computations ──── */
  const kpis = useMemo(() => {
    const total = tasks.length;
    const open = tasks.filter(t => t.status === 'New').length;
    const inProgress = tasks.filter(t => t.status === 'In Progress').length;
    const completed = tasks.filter(t => t.status === 'Completed').length;
    const followUp = tasks.filter(t => t.status === 'Follow Up').length;
    const onHold = tasks.filter(t => t.status === 'On Hold').length;
    const inReview = tasks.filter(t => t.status === 'In Review').length;

    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const created7 = tasks.filter(t => t.createdTime && new Date(t.createdTime) >= d7).length;
    const created30 = tasks.filter(t => t.createdTime && new Date(t.createdTime) >= d30).length;
    const completedFn = (since) => tasks.filter(t => {
      const cd = t.completedDate || (t.status === 'Completed' ? t.createdTime : null);
      return cd && new Date(cd) >= since;
    }).length;
    const completed7 = completedFn(d7);
    const completed30 = completedFn(d30);
    const created90 = tasks.filter(t => t.createdTime && new Date(t.createdTime) >= d90).length;
    const completed90 = completedFn(d90);

    // Avg per week (last 30 days → ~4.3 weeks)
    const weeksIn30 = 30 / 7;
    const avgCreatedPerWeek = created30 > 0 ? (created30 / weeksIn30).toFixed(1) : '0';
    const avgCompletedPerWeek = completed30 > 0 ? (completed30 / weeksIn30).toFixed(1) : '0';

    // Velocity: completed vs created ratio (last 30 days)
    const velocity30 = created30 > 0 ? ((completed30 / created30) * 100).toFixed(0) : '–';

    // Overdue tasks (Due Date in the past, not completed)
    const overdue = tasks.filter(t =>
      t.dueDate && new Date(t.dueDate) < now && t.status !== 'Completed'
    ).length;

    // Due this week
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dueThisWeek = tasks.filter(t =>
      t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= weekEnd && t.status !== 'Completed'
    ).length;

    // Avg time to complete (for tasks completed in last 90d with both created & completed dates)
    const completionTimes = tasks
      .filter(t => t.status === 'Completed' && t.createdTime && t.completedDate)
      .map(t => {
        const created = new Date(t.createdTime);
        const done = new Date(t.completedDate);
        return (done - created) / (1000 * 60 * 60 * 24); // days
      })
      .filter(d => d >= 0 && d < 365);
    const avgCompletionDays = completionTimes.length > 0
      ? (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1)
      : null;

    // Completion rate
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

    // Backlog trend: net open last 7d vs previous 7d
    const created14to7 = tasks.filter(t => t.createdTime && new Date(t.createdTime) >= d14 && new Date(t.createdTime) < d7).length;
    const completed14to7 = tasks.filter(t => {
      const cd = t.completedDate || (t.status === 'Completed' ? t.createdTime : null);
      return cd && new Date(cd) >= d14 && new Date(cd) < d7;
    }).length;
    const netThisWeek = created7 - completed7;
    const netLastWeek = created14to7 - completed14to7;
    const backlogTrend = netThisWeek - netLastWeek; // positive = growing backlog

    // Unassigned open tasks
    const unassigned = tasks.filter(t =>
      t.status !== 'Completed' && t.assigned.length === 0
    ).length;

    return {
      total, open, inProgress, completed, followUp, onHold, inReview,
      created7, completed7, created30, completed30, created90, completed90,
      avgCreatedPerWeek, avgCompletedPerWeek, velocity30,
      overdue, dueThisWeek,
      avgCompletionDays, completionRate,
      backlogTrend, netThisWeek, netLastWeek,
      unassigned,
    };
  }, [tasks]);

  /* ──── Chart data ──── */

  // Status distribution for pie chart
  const statusDistribution = useMemo(() => {
    return STATUS_ORDER.map(status => ({
      name: status,
      value: tasks.filter(t => t.status === status).length,
      color: STATUS_CONFIG[status]?.color || '#64748b',
    })).filter(d => d.value > 0);
  }, [tasks]);

  // Tasks by assignee (stacked bar)
  const tasksByAssignee = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      const people = t.assigned.length > 0 ? t.assigned : (t.createdBy ? [t.createdBy] : ['(Nicht zugewiesen)']);
      people.forEach(person => {
        if (!map[person]) map[person] = { name: person };
        STATUS_ORDER.forEach(s => { if (!map[person][s]) map[person][s] = 0; });
        if (map[person][t.status] !== undefined) map[person][t.status]++;
      });
    });
    return Object.values(map)
      .sort((a, b) => {
        const totalA = STATUS_ORDER.reduce((sum, s) => sum + (a[s] || 0), 0);
        const totalB = STATUS_ORDER.reduce((sum, s) => sum + (b[s] || 0), 0);
        return totalB - totalA;
      })
      .slice(0, 15);
  }, [tasks]);

  // Tasks per day (created timeline)
  const tasksTimeline = useMemo(() => {
    const map = {};
    const now = new Date();
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    tasks.forEach(t => {
      if (!t.createdTime) return;
      const d = new Date(t.createdTime);
      if (d < d90) return;
      const key = d.toISOString().split('T')[0];
      if (!map[key]) map[key] = { date: key, created: 0, completed: 0 };
      map[key].created++;
      if (t.status === 'Completed') map[key].completed++;
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [tasks]);

  // Weekly velocity (created vs completed per calendar week)
  const weeklyVelocity = useMemo(() => {
    const weeks = {};
    const now = new Date();
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Helper: get ISO week number
    const getWeekKey = (date) => {
      const d = new Date(date);
      const dayOfWeek = d.getDay() || 7;
      d.setDate(d.getDate() + 4 - dayOfWeek);
      const yearStart = new Date(d.getFullYear(), 0, 1);
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `KW${String(weekNo).padStart(2, '0')}`;
    };

    tasks.forEach(t => {
      if (!t.createdTime) return;
      const d = new Date(t.createdTime);
      if (d < d90) return;
      const wk = getWeekKey(d);
      if (!weeks[wk]) weeks[wk] = { week: wk, created: 0, completed: 0 };
      weeks[wk].created++;
    });

    // Count completions by their completion date
    tasks.forEach(t => {
      const cd = t.completedDate || (t.status === 'Completed' ? t.createdTime : null);
      if (!cd) return;
      const d = new Date(cd);
      if (d < d90) return;
      const wk = getWeekKey(d);
      if (!weeks[wk]) weeks[wk] = { week: wk, created: 0, completed: 0 };
      weeks[wk].completed++;
    });

    return Object.values(weeks)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map(w => ({ ...w, net: w.created - w.completed }));
  }, [tasks]);

  /* ──── Sort handler ──── */
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={12} className="opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  /* ──── Custom tooltip ──── */
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface-primary border border-white/60 rounded-xl px-3 py-2 text-xs shadow-lg shadow-black/5">
        <div className="text-text-primary font-medium mb-1">{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
            <span className="text-text-secondary">{p.name}:</span>
            <span className="text-text-primary">{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  /* ──────────────────────── Render ──────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 size={32} className="text-[#007AFF] animate-spin mx-auto mb-3" />
          <div className="text-text-secondary text-sm">Tasks werden geladen...</div>
          <div className="text-text-muted text-xs mt-1">Airtable API Abfrage</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle size={32} className="text-[#FF3B30] mx-auto mb-3" />
          <div className="text-text-primary text-sm mb-2">Fehler beim Laden der Tasks</div>
          <div className="text-text-muted text-xs mb-4">{error}</div>
          <button onClick={loadTasks} className="inline-flex items-center gap-2 px-4 py-2 bg-surface-primary border border-border-secondary rounded-lg text-xs text-text-secondary hover:border-[#007AFF]">
            <RefreshCw size={14} /> Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Title & Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <ClipboardList size={20} className="text-[#007AFF]" />
            Task Dashboard
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Zentrale Übersicht aller Aufgaben im Rahmen des JET DooH Projekts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#007AFF] text-white rounded-lg text-xs font-medium hover:bg-[#2563eb] transition-colors shadow-sm"
          >
            <Plus size={12} /> Neuer Task
          </button>
          <button
            onClick={loadTasks}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-primary border border-border-secondary rounded-lg text-xs text-text-secondary hover:border-[#007AFF] transition-colors"
          >
            <RefreshCw size={12} /> Aktualisieren
          </button>
        </div>
      </div>

      {/* ═══════ SUCCESS TOAST ═══════ */}
      {successMsg && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#34C759]/10 border border-[#34C759]/30 rounded-xl animate-fade-in">
          <CheckCircle2 size={16} className="text-[#34C759] shrink-0" />
          <span className="text-xs font-medium text-[#34C759]">{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="ml-auto text-[#34C759]/60 hover:text-[#34C759] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ═══════ HERO SUMMARY ═══════ */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5">
          {/* Left: Total + Progress */}
          <div className="flex-1">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-3xl font-bold text-text-primary">{kpis.total.toLocaleString('de-DE')}</span>
              <span className="text-sm text-text-muted">Tasks gesamt</span>
            </div>
            {/* Stacked progress bar */}
            <div className="w-full h-3 bg-surface-tertiary/60 rounded-full overflow-hidden flex mb-2">
              {kpis.total > 0 && <>
                <div style={{ width: `${(kpis.completed / kpis.total) * 100}%`, backgroundColor: '#34C759' }} title={`Completed: ${kpis.completed}`} />
                <div style={{ width: `${(kpis.inProgress / kpis.total) * 100}%`, backgroundColor: '#FF9500' }} title={`In Progress: ${kpis.inProgress}`} />
                <div style={{ width: `${(kpis.followUp / kpis.total) * 100}%`, backgroundColor: '#a855f7' }} title={`Follow Up: ${kpis.followUp}`} />
                <div style={{ width: `${(kpis.open / kpis.total) * 100}%`, backgroundColor: '#007AFF' }} title={`New: ${kpis.open}`} />
                <div style={{ width: `${(kpis.onHold / kpis.total) * 100}%`, backgroundColor: '#64748b' }} title={`On Hold: ${kpis.onHold}`} />
              </>}
            </div>
            {/* Legend under bar */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[
                { label: 'Completed', value: kpis.completed, color: '#34C759' },
                { label: 'In Progress', value: kpis.inProgress, color: '#FF9500' },
                { label: 'Follow Up', value: kpis.followUp, color: '#a855f7' },
                { label: 'New', value: kpis.open, color: '#007AFF' },
                { label: 'On Hold', value: kpis.onHold, color: '#64748b' },
              ].filter(s => s.value > 0).map(s => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-text-secondary">{s.label}</span>
                  <span className="text-xs font-medium" style={{ color: s.color }}>
                    {s.value} ({kpis.total > 0 ? ((s.value / kpis.total) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Quick stats */}
          <div className="flex gap-4 lg:gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#34C759]">{kpis.completionRate}%</div>
              <div className="text-xs text-text-muted">Abgeschlossen</div>
            </div>
            <div className="w-px bg-surface-tertiary" />
            <div className="text-center">
              <div className={`text-2xl font-bold ${Number(kpis.velocity30) >= 100 ? 'text-[#34C759]' : Number(kpis.velocity30) >= 70 ? 'text-[#FF9500]' : 'text-[#FF3B30]'}`}>
                {kpis.velocity30}{kpis.velocity30 !== '–' ? '%' : ''}
              </div>
              <div className="text-xs text-text-muted">Velocity 30T</div>
            </div>
            <div className="w-px bg-surface-tertiary" />
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">{kpis.avgCompletionDays ? `${kpis.avgCompletionDays}d` : '–'}</div>
              <div className="text-xs text-text-muted">⌀ Durchlaufzeit</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ STATUS CARDS (clickable, with % share) ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { key: 'New', label: 'Open', value: kpis.open, color: '#007AFF', icon: CircleDot },
          { key: 'In Progress', label: 'In Progress', value: kpis.inProgress, color: '#FF9500', icon: Clock },
          { key: 'Follow Up', label: 'Follow Up', value: kpis.followUp, color: '#a855f7', icon: ArrowUpRight },
          { key: 'On Hold', label: 'On Hold', value: kpis.onHold, color: '#64748b', icon: Pause },
          { key: 'overdue', label: 'Überfällig', value: kpis.overdue, color: '#FF3B30', icon: AlertCircle },
          { key: 'dueThisWeek', label: 'Fällig 7 Tage', value: kpis.dueThisWeek, color: '#06b6d4', icon: Calendar },
          { key: 'unassigned', label: 'Nicht zugewiesen', value: kpis.unassigned, color: '#FF9500', icon: Users },
        ].map(card => {
          const CardIcon = card.icon;
          const pct = kpis.total > 0 ? ((card.value / kpis.total) * 100).toFixed(1) : '0';
          const isStatus = ['New', 'In Progress', 'Follow Up', 'On Hold'].includes(card.key);
          const isActive = isStatus && statusFilter === card.key;
          return (
            <div
              key={card.key}
              onClick={isStatus ? () => setStatusFilter(statusFilter === card.key ? 'all' : card.key) : undefined}
              className={`bg-surface-primary border rounded-lg p-3 shadow-card transition-all ${
                isActive ? 'ring-1' : 'border-border-secondary'
              } ${isStatus ? 'cursor-pointer hover:bg-surface-secondary' : ''}`}
              style={isActive ? { borderColor: card.color, boxShadow: `0 0 0 1px ${card.color}30` } : {}}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <CardIcon size={12} style={{ color: card.color }} />
                  <span className="text-xs text-text-muted">{card.label}</span>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${card.color}15`, color: card.color }}>
                  {pct}%
                </span>
              </div>
              <div className="text-xl font-bold" style={{ color: card.color }}>
                {card.value.toLocaleString('de-DE')}
              </div>
              {/* Mini bar showing proportion */}
              <div className="w-full h-1 bg-surface-tertiary/60 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Number(pct))}%`, backgroundColor: card.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══════ PERFORMANCE METRICS ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard icon={TrendingUp} iconColor="#007AFF" label="⌀ Erstellt / Woche" value={kpis.avgCreatedPerWeek} sub="Letzte 30 Tage" />
        <MetricCard icon={CheckCircle2} iconColor="#34C759" label="⌀ Erledigt / Woche" value={kpis.avgCompletedPerWeek} sub="Letzte 30 Tage" />
        <MetricCard
          icon={ArrowUpRight}
          iconColor={Number(kpis.velocity30) >= 100 ? '#34C759' : Number(kpis.velocity30) >= 70 ? '#FF9500' : '#FF3B30'}
          label="Velocity (30T)"
          value={`${kpis.velocity30}${kpis.velocity30 !== '–' ? '%' : ''}`}
          valueColor={Number(kpis.velocity30) >= 100 ? '#34C759' : Number(kpis.velocity30) >= 70 ? '#FF9500' : '#FF3B30'}
          sub="Erledigt vs. Erstellt"
        />
        <MetricCard icon={Clock} iconColor="#a855f7" label="⌀ Bearbeitungszeit" value={kpis.avgCompletionDays ? `${kpis.avgCompletionDays}d` : '–'} sub="Tage bis erledigt" />
        <MetricCard
          icon={kpis.backlogTrend <= 0 ? ArrowDownRight : ArrowUpRight}
          iconColor={kpis.backlogTrend <= 0 ? '#34C759' : '#FF3B30'}
          label="Backlog Trend"
          value={`${kpis.backlogTrend > 0 ? '+' : ''}${kpis.backlogTrend}`}
          valueColor={kpis.backlogTrend <= 0 ? '#34C759' : '#FF3B30'}
          sub={`Woche: ${kpis.netThisWeek > 0 ? '+' : ''}${kpis.netThisWeek} netto`}
        />
        <div className="bg-surface-primary border border-border-secondary rounded-lg p-3 shadow-card">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded bg-[#06b6d4]/10 flex items-center justify-center">
              <BarChart3 size={12} className="text-[#06b6d4]" />
            </div>
            <div className="text-xs text-text-muted">30 Tage Bilanz</div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-[#007AFF]">+{kpis.created30}</span>
            <span className="text-xs text-text-muted">/</span>
            <span className="text-sm font-bold text-[#34C759]">-{kpis.completed30}</span>
          </div>
          <div className="text-xs text-text-muted">Erstellt / Erledigt</div>
        </div>
      </div>

      {/* ───── Charts Row ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Status Distribution Pie */}
        <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-[#007AFF]" />
            Status Verteilung
          </h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tasks by Assignee (Stacked Bar) */}
        <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <Users size={14} className="text-[#007AFF]" />
            Aufgaben nach Verantwortlichen
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Wie viele Aufgaben pro Teammitglied aktiv sind – inkl. offener, laufender und erledigter Tasks
          </p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasksByAssignee} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip />} />
                {STATUS_ORDER.filter(s => s !== 'Completed').map((status, i) => (
                  <Bar key={status} dataKey={status} stackId="a" fill={STATUS_CONFIG[status]?.color || '#64748b'} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ───── Weekly Velocity Chart ───── */}
      {weeklyVelocity.length > 0 && (
        <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-4">
          <h3 className="text-sm font-medium text-text-primary mb-1 flex items-center gap-2">
            <TrendingUp size={14} className="text-[#007AFF]" />
            Wöchentliche Velocity
            <span className="text-xs text-text-muted font-normal">(Erstellt vs. Erledigt pro Kalenderwoche)</span>
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Grüne Balken = mehr erledigt als erstellt (Backlog schrumpft) · Rote Balken = Backlog wächst
          </p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyVelocity} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} width={35} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>}
                  iconSize={8}
                />
                <Bar dataKey="created" fill="#007AFF" radius={[3, 3, 0, 0]} name="Erstellt" />
                <Bar dataKey="completed" fill="#34C759" radius={[3, 3, 0, 0]} name="Erledigt" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ───── Timeline Charts (Daily) ───── */}
      {tasksTimeline.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* New Tasks per Day */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-4">
            <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
              <TrendingUp size={14} className="text-[#007AFF]" />
              Neue Tasks pro Tag
              <span className="text-xs text-text-muted font-normal">(90 Tage)</span>
            </h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tasksTimeline} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(d) => {
                      const dt = new Date(d);
                      return `${dt.getDate()}.${dt.getMonth() + 1}`;
                    }}
                    interval={Math.max(0, Math.floor(tasksTimeline.length / 12))}
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="created" fill="#007AFF" radius={[2, 2, 0, 0]} name="Erstellt" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Completed Tasks per Day */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-4">
            <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-[#34C759]" />
              Erledigte Tasks pro Tag
              <span className="text-xs text-text-muted font-normal">(90 Tage)</span>
            </h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tasksTimeline} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(d) => {
                      const dt = new Date(d);
                      return `${dt.getDate()}.${dt.getMonth() + 1}`;
                    }}
                    interval={Math.max(0, Math.floor(tasksTimeline.length / 12))}
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="completed" fill="#34C759" radius={[2, 2, 0, 0]} name="Erledigt" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ───── Filters ───── */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-[#007AFF]" />
          <h3 className="text-sm font-medium text-text-primary">Task-Liste</h3>
          <span className="text-xs text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
            {filteredTasks.length} von {tasks.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Suche nach Task, Display ID, Location..."
              className="w-full pl-9 pr-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF]"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF]"
          >
            <option value="all">Alle Status</option>
            {STATUS_ORDER.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Partner filter */}
          <select
            value={partnerFilter}
            onChange={(e) => { setPartnerFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF]"
          >
            <option value="all">Alle Partner</option>
            {allPartners.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Assignee filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => { setAssigneeFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF]"
          >
            <option value="all">Alle Verantwortlichen</option>
            {allAssignees.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {(statusFilter !== 'all' || partnerFilter !== 'all' || assigneeFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => { setStatusFilter('all'); setPartnerFilter('all'); setAssigneeFilter('all'); setSearchQuery(''); setPage(0); }}
              className="px-3 py-2 text-xs text-[#FF3B30] hover:text-[#f87171] transition-colors"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {/* ───── Task Table ───── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-secondary">
                <th className="text-left py-2 px-3 text-text-muted font-medium cursor-pointer hover:text-text-secondary" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">Status <SortIcon field="status" /></div>
                </th>
                <th className="text-left py-2 px-3 text-text-muted font-medium cursor-pointer hover:text-text-secondary" onClick={() => handleSort('title')}>
                  <div className="flex items-center gap-1">Task <SortIcon field="title" /></div>
                </th>
                <th className="text-left py-2 px-3 text-text-muted font-medium cursor-pointer hover:text-text-secondary" onClick={() => handleSort('priority')}>
                  <div className="flex items-center gap-1">Priorität <SortIcon field="priority" /></div>
                </th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Verantwortlich</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Display / Location</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium cursor-pointer hover:text-text-secondary" onClick={() => handleSort('dueDate')}>
                  <div className="flex items-center gap-1">Fällig <SortIcon field="dueDate" /></div>
                </th>
                <th className="text-left py-2 px-3 text-text-muted font-medium cursor-pointer hover:text-text-secondary" onClick={() => handleSort('createdTime')}>
                  <div className="flex items-center gap-1">Erstellt <SortIcon field="createdTime" /></div>
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedTasks.map((task) => {
                const sc = STATUS_CONFIG[task.status] || { color: '#64748b', label: task.status };
                const isExpanded = expandedTask === task.id;
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'Completed';

                return (
                  <React.Fragment key={task.id}>
                  <tr
                      className="border-b border-border-secondary/40 hover:bg-surface-secondary/80 cursor-pointer transition-colors"
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    >
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${sc.color}20`, color: sc.color }}
                        >
                          {sc.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-text-primary font-medium max-w-[300px] truncate">{task.title}</div>
                        {task.partner && (
                          <div className="mt-0.5">
                            <span className="text-xs text-[#007AFF] bg-[#007AFF]/5 px-1.5 py-0.5 rounded">
                              {task.partner}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {task.priority && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${PRIORITY_COLORS[task.priority] || '#64748b'}20`,
                              color: PRIORITY_COLORS[task.priority] || '#64748b',
                            }}
                          >
                            {task.priority}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-text-secondary">
                          {task.assigned.length > 0 ? task.assigned.join(', ') : task.createdBy || '–'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="max-w-[200px]">
                          {(task.displayIds || []).length > 0 ? (
                            <div className="text-text-secondary truncate text-xs">
                              {task.displayIds.slice(0, 2).join(', ')}
                              {task.displayIds.length > 2 && ` +${task.displayIds.length - 2}`}
                            </div>
                          ) : (
                            <span className="text-text-muted">–</span>
                          )}
                          {(task.locationNames || []).length > 0 && (
                            <div className="text-xs text-text-muted truncate">
                              {task.locationNames[0]}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={isOverdue ? 'text-[#FF3B30] font-medium' : 'text-text-secondary'}>
                          {formatDate(task.dueDate)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary">
                        {formatDate(task.createdTime)}
                      </td>
                    </tr>
                    {/* Expanded details */}
                    {isExpanded && (
                      <tr className="bg-surface-secondary/40">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-text-muted uppercase mb-1">Beschreibung</div>
                              <div className="text-xs text-text-secondary whitespace-pre-wrap">
                                {task.description || '– Keine Beschreibung –'}
                              </div>
                            </div>
                            <div className="space-y-2">
                              {task.createdBy && (
                                <div>
                                  <span className="text-xs text-text-muted">Erstellt von: </span>
                                  <span className="text-xs text-text-secondary">{task.createdBy}</span>
                                </div>
                              )}
                              {task.completedDate && (
                                <div>
                                  <span className="text-xs text-text-muted">Erledigt am: </span>
                                  <span className="text-xs text-text-secondary">{formatDate(task.completedDate)}</span>
                                </div>
                              )}
                              {task.assigned.length > 0 && (
                                <div>
                                  <span className="text-xs text-text-muted">Zugewiesen: </span>
                                  <span className="text-xs text-text-secondary">{task.assigned.join(', ')}</span>
                                </div>
                              )}
                              {task.displayIds?.length > 0 && (
                                <div>
                                  <span className="text-xs text-text-muted">Displays: </span>
                                  <span className="text-xs text-text-secondary">{task.displayIds.join(', ')}</span>
                                </div>
                              )}

                              {/* ─── Extended Fields ─── */}
                              {/* Audit Trail */}
                              {(task.statusChangedBy || task.statusChangedDate) && (
                                <div className="pt-1 border-t border-border-secondary/40">
                                  <span className="text-xs text-text-muted">Status geändert: </span>
                                  <span className="text-xs text-text-secondary">
                                    {task.statusChangedBy || '–'}
                                    {task.statusChangedDate && ` am ${formatDate(task.statusChangedDate)}`}
                                  </span>
                                </div>
                              )}

                              {/* Installation Info */}
                              {(task.integrator || task.installDate) && (
                                <div className="pt-1 border-t border-border-secondary/40">
                                  <div className="text-xs text-text-muted uppercase mb-0.5">Installation</div>
                                  {task.integrator && (
                                    <div><span className="text-xs text-text-muted">Integrator: </span><span className="text-xs text-text-secondary">{task.integrator}</span></div>
                                  )}
                                  {task.installDate && (
                                    <div><span className="text-xs text-text-muted">Aufbau: </span><span className="text-xs text-text-secondary">{formatDate(task.installDate)}</span></div>
                                  )}
                                  {task.installRemarks && (
                                    <div><span className="text-xs text-text-muted">Bemerkungen: </span><span className="text-xs text-text-secondary">{task.installRemarks}</span></div>
                                  )}
                                </div>
                              )}

                              {/* Visibility + Superchat */}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {task.externalVisibility && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20">
                                    👁 Extern sichtbar
                                  </span>
                                )}
                                {task.superchat && (
                                  <a href={typeof task.superchat === 'string' ? task.superchat : '#'} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-status-online/10 text-status-online border border-status-online/20 hover:bg-status-online/10 transition-colors">
                                    💬 Superchat
                                  </a>
                                )}
                              </div>
                            </div>

                          {/* Nacharbeit Kommentar */}
                          {task.nacharbeitKommentar && (
                            <div className="col-span-1 md:col-span-2 mt-2 pt-2 border-t border-border-secondary/40">
                              <div className="text-xs text-text-muted uppercase mb-1">Nacharbeit / Follow-Up</div>
                              <div className="text-xs text-text-secondary whitespace-pre-wrap bg-status-warning/10/50 rounded-lg p-2 border border-amber-100">
                                {task.nacharbeitKommentar}
                              </div>
                            </div>
                          )}
                          </div>

                          {/* Quick Actions */}
                          <div className="mt-3 pt-3 border-t border-border-secondary/40 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-text-muted mr-1">Status ändern:</span>
                            {STATUS_ORDER.filter(s => s !== task.status).map(status => {
                              const sc2 = STATUS_CONFIG[status];
                              return (
                                <button
                                  key={status}
                                  onClick={(e) => handleQuickStatus(e, task.id, status)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all hover:scale-105"
                                  style={{ backgroundColor: `${sc2.color}15`, color: sc2.color, border: `1px solid ${sc2.color}30` }}
                                >
                                  {status}
                                </button>
                              );
                            })}
                            <div className="ml-auto flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStimmcheckTask(task);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200/60 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors"
                              >
                                <Phone size={10} /> Stimmcheck
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTask(task); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#007AFF]/10 text-[#007AFF] rounded-lg text-xs font-medium hover:bg-[#007AFF]/20 transition-colors"
                              >
                                <Edit3 size={10} /> Bearbeiten
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-secondary">
            <div className="text-xs text-text-muted">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedTasks.length)} von {sortedTasks.length}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-1 text-xs rounded bg-surface-secondary/80 border border-border-secondary text-text-secondary disabled:opacity-30 hover:border-[#007AFF]"
              >
                ← Zurück
              </button>
              <span className="px-2 py-1 text-xs text-text-muted">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-2 py-1 text-xs rounded bg-surface-secondary/80 border border-border-secondary text-text-secondary disabled:opacity-30 hover:border-[#007AFF]"
              >
                Weiter →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ MODALS ═══════ */}
      <TaskCreateModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreateError(null); }}
        onSave={handleCreateTask}
        loading={modalLoading}
        error={createError}
      />
      <TaskEditModal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleUpdateTask}
        onDelete={handleDeleteTask}
        task={editingTask}
        loading={modalLoading}
      />
      <StimmcheckModal
        isOpen={!!stimmcheckTask}
        onClose={() => setStimmcheckTask(null)}
        locationName={
          stimmcheckTask?.locationNames?.[0] ||
          stimmcheckTask?.partner ||
          stimmcheckTask?.title ||
          ''
        }
        locationAddress={
          stimmcheckTask?.displayIds?.[0]
            ? `Display: ${stimmcheckTask.displayIds[0]}`
            : ''
        }
        onSuccess={(entry) => {
          setSuccessMsg(
            `Stimmcheck geplant: ${entry.locationName} am ${new Date(entry.scheduledDate).toLocaleDateString('de-DE')} um ${entry.scheduledTime} Uhr`
          );
          setTimeout(() => setSuccessMsg(null), 5000);
        }}
      />
    </div>
  );
}

/* ──────────────────────── Sub-components ──────────────────────── */

function MetricCard({ icon: Icon, iconColor, label, value, valueColor, sub }) {
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-lg p-3 shadow-card">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: `${iconColor}15` }}>
          <Icon size={12} style={{ color: iconColor }} />
        </div>
        <div className="text-xs text-text-muted">{label}</div>
      </div>
      <div className="text-lg font-bold" style={{ color: valueColor || '#0f172a' }}>{value}</div>
      {sub && <div className="text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

