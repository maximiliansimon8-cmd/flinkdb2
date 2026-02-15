import React, { useState, useCallback, Suspense, lazy } from 'react';
import { Calendar, List, Loader2, Send, BarChart3, PhoneCall } from 'lucide-react';

const InstallationCalendar = lazy(() => import('./InstallationCalendar'));
const InstallationBookingsDashboard = lazy(() => import('./InstallationBookingsDashboard'));
const InstallationInviteManager = lazy(() => import('./InstallationInviteManager'));
const InstallationExecutiveDashboard = lazy(() => import('./InstallationExecutiveDashboard'));
const InstallationPhoneWorkbench = lazy(() => import('./InstallationPhoneWorkbench'));

const SUB_TABS = [
  { id: 'executive', label: 'Dashboard', icon: BarChart3 },
  { id: 'calendar', label: 'Routen-Kalender', icon: Calendar },
  { id: 'invite', label: 'Einladen', icon: Send },
  { id: 'phone', label: 'Telefon', icon: PhoneCall },
  { id: 'bookings', label: 'Buchungen', icon: List },
];

export default function InstallationsDashboard({ initialSection, onSectionChange }) {
  const [activeSubTab, setActiveSubTabRaw] = useState(initialSection || 'executive');
  const setActiveSubTab = useCallback((tab) => {
    setActiveSubTabRaw(tab);
    onSectionChange?.(tab);
  }, [onSectionChange]);

  return (
    <div className="space-y-4">
      {/* Sub-Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-Tab Content */}
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
          <span className="text-sm text-slate-500">Wird geladen...</span>
        </div>
      }>
        {activeSubTab === 'executive' && <InstallationExecutiveDashboard />}
        {activeSubTab === 'calendar' && <InstallationCalendar />}
        {activeSubTab === 'invite' && <InstallationInviteManager />}
        {activeSubTab === 'phone' && <InstallationPhoneWorkbench />}
        {activeSubTab === 'bookings' && <InstallationBookingsDashboard />}
      </Suspense>
    </div>
  );
}
