'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Globe, Building2, Users,
  ClipboardList, Clock, Settings, LogOut,
  Shield, ChevronRight, Menu, X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';

interface NavItem {
  label: string;
  href:  string;
  icon:  React.ElementType;
  badge?: number;
  adminOnly?: boolean;
  comingSoon?: boolean;
}

const NAV_MAIN: NavItem[] = [
  { label: 'Overview',      href: '/overview',      icon: LayoutDashboard },
  { label: 'Sites',         href: '/sites',          icon: Globe },
  { label: 'Organisations', href: '/organisations',  icon: Building2,    adminOnly: true },
  { label: 'Users',         href: '/users',          icon: Users,        adminOnly: true },
];

const NAV_SYSTEM: NavItem[] = [
  { label: 'Provisioning jobs', href: '/jobs',     icon: ClipboardList, adminOnly: true },
  { label: 'Activity log',      href: '/activity', icon: Clock },
  { label: 'Settings',          href: '/settings', icon: Settings },
];

interface ShellProps {
  children: React.ReactNode;
  user: { email: string; role: string; initials: string };
}

export function DashboardShell({ children, user }: ShellProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user.role === 'internal_admin';

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const navLink = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return null;

    if (item.comingSoon) {
      return (
        <div
          key={item.href}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 cursor-not-allowed"
          title="Coming soon"
        >
          <item.icon size={16} className="flex-shrink-0" />
          <span className="flex-1">{item.label}</span>
          <span className="text-xs text-slate-300 italic">soon</span>
        </div>
      );
    }

    const active = pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
          active
            ? 'bg-brand-50 text-brand-700 font-medium'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <item.icon size={16} className="flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="text-xs bg-brand-500 text-white rounded-full px-1.5 py-px leading-none">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const sidebar = (
    <aside className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
        <img
          src="/logo.svg"
          alt="ArmoredPress"
          className="h-8 w-auto"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto ap-scroll">
        <p className="px-3 py-1 text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
          Main
        </p>
        {NAV_MAIN.map(navLink)}

        <p className="px-3 py-1 text-xs font-medium text-slate-400 uppercase tracking-wider mt-4 mb-1">
          System
        </p>
        {NAV_SYSTEM.map(navLink)}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-slate-100">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
          <div className="w-7 h-7 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-800 truncate">{user.email}</p>
            <p className="text-xs text-slate-400">{user.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-slate-700 transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-[220px] flex-shrink-0">
        {sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[220px] z-50">
            {sidebar}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-13 flex items-center justify-between px-5 bg-white border-b border-slate-200 flex-shrink-0">
          <button
            className="md:hidden text-slate-500 hover:text-slate-800"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {/* Global search placeholder */}
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:border-slate-300 text-xs transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Search…
              <kbd className="ml-1 text-slate-300 font-mono text-xs">⌘K</kbd>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto ap-scroll bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 bg-white">
      <div>
        <h1 className="text-base font-semibold text-slate-900">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action && <div className="ml-4">{action}</div>}
    </div>
  );
}
