import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../utils/format';

const navItems = [
  { to: '/', label: 'My Dashboard', icon: '📊', exact: true },
  { to: '/projects', label: 'Projects', icon: '📁' },
  { to: '/clients', label: 'Clients & Activity', icon: '👥' },
];

const bdmItems = [
  { to: '/team', label: 'Team Overview', icon: '🏆' },
  { to: '/team-management', label: 'Team Management', icon: '⚙️' },
];

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={onClose} />}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-black text-white flex flex-col transform transition-transform duration-200
        md:relative md:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-center px-5 py-4 border-b border-gray-800">
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

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                 ${isActive ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {['bdm', 'exec_pa'].includes(user?.role) && (
            <>
              <div className="pt-4 pb-1 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Lead</div>
              <NavLink
                to="/team"
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                   ${isActive ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`
                }
              >
                <span>🏆</span>
                Team Overview
              </NavLink>
              {user?.role === 'bdm' && (
                <NavLink
                  to="/team-management"
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                     ${isActive ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`
                  }
                >
                  <span>⚙️</span>
                  Team Management
                </NavLink>
              )}
            </>
          )}
        </nav>

        <div className="px-4 py-3 border-t border-gray-800">
          <div className="text-xs font-medium text-white">{user?.name}</div>
          <div className="text-xs text-gray-400">{ROLE_LABELS[user?.role]}</div>
        </div>
      </aside>
    </>
  );
}
