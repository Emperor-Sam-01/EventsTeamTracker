import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/', label: 'My Dashboard', icon: '📊', exact: true },
  { to: '/projects', label: 'Projects', icon: '📁' },
  { to: '/clients', label: 'Clients', icon: '👥' },
  { to: '/meeting', label: 'Weekly Meeting', icon: '📅' },
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
        fixed inset-y-0 left-0 z-30 w-64 bg-brand-900 text-white flex flex-col transform transition-transform duration-200
        md:relative md:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-brand-800">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-sm font-black text-white">E</div>
          <div>
            <div className="text-sm font-black tracking-widest leading-tight text-white">ELITEZ EVENTS</div>
            <div className="text-xs text-brand-300">Team Tracker</div>
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
                 ${isActive ? 'bg-brand-700 text-white' : 'text-brand-200 hover:bg-brand-800 hover:text-white'}`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {['bdm', 'exec_pa'].includes(user?.role) && (
            <>
              <div className="pt-4 pb-1 px-3 text-xs font-semibold text-brand-400 uppercase tracking-wider">Team Lead</div>
              {bdmItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                     ${isActive ? 'bg-brand-700 text-white' : 'text-brand-200 hover:bg-brand-800 hover:text-white'}`
                  }
                >
                  <span>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="px-4 py-3 border-t border-brand-800">
          <div className="text-xs text-brand-400">{user?.name}</div>
          <div className="text-xs text-brand-500 capitalize">{user?.role?.toUpperCase()}</div>
        </div>
      </aside>
    </>
  );
}
