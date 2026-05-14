import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../utils/format';

const navItems = [
  { to: '/', label: 'My Dashboard', icon: '📊', exact: true },
  { to: '/projects', label: 'Projects', icon: '📁' },
  { to: '/clients', label: 'Clients & Activity', icon: '👥' },
  { to: '/advice', label: 'Advice Guru', icon: '🧠' },
];

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const { user } = useAuth();
  const isBDM = ['bdm', 'exec_pa'].includes(user?.role);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={onClose} />}
      <aside className={`
        fixed inset-y-0 left-0 z-30 bg-black text-white flex flex-col
        transform transition-all duration-200
        md:relative md:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
        ${collapsed ? 'md:w-16 w-64' : 'w-64'}
      `}>
        {/* Header: logo + collapse toggle */}
        <div className={`flex items-center border-b border-gray-800 ${collapsed ? 'justify-center px-2 py-4' : 'px-5 py-4 gap-3'}`}>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <img
                src="/logo-white.png"
                alt="Elitez Events"
                className="h-10 w-auto object-contain"
                onError={e => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <div style={{ display: 'none' }}>
                <div className="text-sm font-black tracking-widest text-white">ELITEZ EVENTS</div>
                <div className="text-xs text-gray-400">Personal Dashboard</div>
              </div>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors shrink-0 text-base font-bold"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-hidden">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                 ${isActive ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                 ${collapsed ? 'justify-center' : ''}`
              }
            >
              <span className="text-lg leading-none shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}

          {isBDM && (
            <>
              {collapsed
                ? <div className="border-t border-gray-800 my-2" />
                : <div className="pt-4 pb-1 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Lead</div>
              }
              <NavLink
                to="/team"
                onClick={onClose}
                title={collapsed ? 'Team Overview' : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                   ${isActive ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                   ${collapsed ? 'justify-center' : ''}`
                }
              >
                <span className="text-lg leading-none shrink-0">🏆</span>
                {!collapsed && <span className="truncate">Team Overview</span>}
              </NavLink>
              {user?.role === 'bdm' && (
                <NavLink
                  to="/team-management"
                  onClick={onClose}
                  title={collapsed ? 'Team Management' : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                     ${isActive ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                     ${collapsed ? 'justify-center' : ''}`
                  }
                >
                  <span className="text-lg leading-none shrink-0">⚙️</span>
                  {!collapsed && <span className="truncate">Team Management</span>}
                </NavLink>
              )}
            </>
          )}
        </nav>

        {/* User info */}
        <div className={`px-3 py-3 border-t border-gray-800 ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <div className="text-lg" title={`${user?.name} — ${ROLE_LABELS[user?.role]}`}>👤</div>
          ) : (
            <div className="px-1">
              <div className="text-xs font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-gray-400">{ROLE_LABELS[user?.role]}</div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
