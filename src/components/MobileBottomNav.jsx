import { useCallback, useRef, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Monitor,
  Target,
  HardDrive,
  Radio,
  Sparkles,
} from 'lucide-react';

function formatBadge(badge) {
  if (typeof badge !== 'number') return '';
  return badge > 99 ? '99+' : badge;
}

const NAV_ITEMS = [
  { id: 'mobile-home', label: 'Home', icon: LayoutDashboard },
  { id: 'mobile-displays', label: 'Displays', icon: Monitor },
  { id: 'mobile-rollout', label: 'Rollout', icon: Target },
  { id: 'mobile-hardware', label: 'Hardware', icon: HardDrive },
  { id: 'mobile-live', label: 'Live', icon: Radio },
];

export default function MobileBottomNav({ activeTab, onTabChange, badges = {}, onJETPress }) {
  const [pressedTab, setPressedTab] = useState(null);
  const pressTimerRef = useRef(null);

  const handleTap = useCallback((tabId) => {
    if (navigator.vibrate) navigator.vibrate(8);
    onTabChange(tabId);
  }, [onTabChange]);

  const handleTouchStart = useCallback((tabId) => {
    setPressedTab(tabId);
    pressTimerRef.current = setTimeout(() => setPressedTab(null), 300);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    setTimeout(() => setPressedTab(null), 150);
  }, []);

  const handleJETTap = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
    onJETPress?.();
  }, [onJETPress]);

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    };
  }, []);

  return (
    <>
      {/* ─── Floating J.E.T. Button (above nav bar) ─── */}
      {onJETPress && (
        <button
          onClick={handleJETTap}
          className="
            fixed z-50 left-1/2 -translate-x-1/2
            w-14 h-14 rounded-full
            bg-gradient-to-br from-violet-500 to-indigo-600
            flex items-center justify-center
            shadow-lg shadow-violet-500/30
            active:scale-90 transition-transform duration-150
            qr-fab-pulse
          "
          style={{
            bottom: 'calc(68px + max(env(safe-area-inset-bottom, 0px), 8px))',
            '--tw-shadow-color': 'rgba(139, 92, 246, 0.3)',
          }}
          aria-label="J.E.T. Assistant oeffnen"
        >
          <Sparkles size={24} className="text-white" strokeWidth={2.2} />
          {/* Pulsing ring */}
          <div className="absolute inset-0 rounded-full border-2 border-violet-400/40 qr-fab-ring" />
        </button>
      )}

      {/* ─── Bottom Navigation ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 mobile-bottom-nav">
        <div className="absolute inset-0 bg-white/80 backdrop-blur-2xl border-t border-slate-200/60" />

        <div className="relative flex items-stretch justify-around px-1 safe-bottom" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isPressed = pressedTab === item.id;
            const badge = badges[item.id];

            return (
              <button
                key={item.id}
                onClick={() => handleTap(item.id)}
                onTouchStart={() => handleTouchStart(item.id)}
                onTouchEnd={handleTouchEnd}
                className={`
                  relative flex flex-col items-center justify-center gap-0.5
                  w-full pt-2 pb-1
                  transition-all duration-200 ease-out
                  active:scale-90
                  ${isPressed ? 'scale-90' : ''}
                `}
                aria-label={item.label}
                role="tab"
                aria-selected={isActive}
              >
                <div className={`
                  relative flex items-center justify-center
                  w-10 h-7 rounded-full
                  transition-all duration-300 ease-out
                  ${isActive
                    ? 'bg-blue-500/12'
                    : 'bg-transparent'
                  }
                `}>
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.2 : 1.6}
                    className={`
                      transition-all duration-300
                      ${isActive
                        ? 'text-blue-600'
                        : 'text-slate-400'
                      }
                    `}
                  />

                  {badge != null && badge !== 0 && (
                    <span className={`
                      absolute -top-1 -right-1 flex items-center justify-center
                      rounded-full text-[9px] font-bold text-white bg-red-500 mobile-badge-pop
                      ${typeof badge === 'number'
                        ? 'min-w-[16px] h-[16px] px-1'
                        : 'w-2.5 h-2.5'
                      }
                    `}>
                      {formatBadge(badge)}
                    </span>
                  )}
                </div>

                <span className={`
                  text-[10px] font-semibold leading-tight
                  transition-all duration-300
                  ${isActive
                    ? 'text-blue-600'
                    : 'text-slate-400'
                  }
                `}>
                  {item.label}
                </span>

                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-blue-500 mobile-indicator-slide" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
