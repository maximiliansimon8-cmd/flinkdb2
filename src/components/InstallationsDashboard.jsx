import React, { useState, Suspense, lazy } from 'react';
import { Calendar, List, Loader2, Send, BarChart3 } from 'lucide-react';

const InstallationCalendar = lazy(() => import('./InstallationCalendar'));
const InstallationBookingsDashboard = lazy(() => import('./InstallationBookingsDashboard'));
const InstallationInviteManager = lazy(() => import('./InstallationInviteManager'));
const InstallationExecutiveDashboard = lazy(() => import('./InstallationExecutiveDashboard'));

const SUB_TABS = [
  { id: 'executive', label: 'Dashboard', icon: BarChart3 },
  { id: 'calendar', label: 'Routen-Kalender', icon: Calendar },
  { id: 'invite', label: 'Standorte einladen', icon: Send },
  { id: 'bookings', label: 'Buchungen', icon: List },
];

export default function InstallationsDashboard() {
  const [activeSubTab, setActiveSubTab] = useState('executive');

  return (
    <div className="space-y-4">
      {/* Sub-Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
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
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500">Lädt...</span>
        </div>
      }>
        {activeSubTab === 'executive' && <InstallationExecutiveDashboard />}
        {activeSubTab === 'calendar' && <InstallationCalendar />}
        {activeSubTab === 'invite' && <InstallationInviteManager />}
        {activeSubTab === 'bookings' && <InstallationBookingsDashboard />}
      </Suspense>
    </div>
  );
}
