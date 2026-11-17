"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Building2,
  Gauge,
  Landmark,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { Logo } from "./Logo";

// Icons are referenced by name because server layouts can't pass components to client components.
const ICONS = {
  dashboard: Gauge,
  programs: SlidersHorizontal,
  applicants: Users,
  bureaus: Landmark,
  organizations: Building2,
  superadmins: ShieldCheck,
} satisfies Record<string, LucideIcon>;

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Extra path prefixes that should highlight this item. */
  match?: string[];
};

type Props = {
  nav: NavItem[];
  subtitle: string;
  badge?: string;
  userLabel: string;
  logout: () => Promise<void>;
  defaultCollapsed: boolean;
  children: React.ReactNode;
};

export function AppShell({ nav, subtitle, badge, userLabel, logout, defaultCollapsed, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the page changes.
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  // The first item is the section home (e.g. /admin), so it only matches exactly, plus any extra prefixes.
  const isActive = (item: NavItem) => {
    const prefixes = [...(item.href === nav[0].href ? [] : [item.href]), ...(item.match ?? [])];
    return pathname === item.href || prefixes.some((p) => pathname.startsWith(`${p}/`));
  };

  const sidebar = (compact: boolean, onClose?: () => void) => (
    <div className="flex h-full flex-col bg-navy-900">
      <div className={`flex h-16 shrink-0 items-center border-b border-white/10 ${compact ? "justify-center px-2" : "justify-between px-4"}`}>
        <Logo subtitle={subtitle} compact={compact} />
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-2 text-navy-200 hover:bg-white/10 hover:text-white" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {badge && !compact && (
        <div className="px-4 pt-4">
          <span className="rounded-md bg-gold-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold-400 ring-1 ring-gold-400/30">
            {badge}
          </span>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={compact ? item.label : undefined}
              className={`group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                compact ? "justify-center px-2" : "px-3"
              } ${active ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white"}`}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold-400" />}
              <Icon className={`h-5 w-5 shrink-0 ${active ? "text-gold-400" : ""}`} />
              {!compact && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-white/10 px-3 py-3">
        {!compact && <div className="truncate px-3 pb-1 text-xs text-navy-300">{userLabel}</div>}
        <form action={logout}>
          <button
            title={compact ? "Sign out" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-navy-200 hover:bg-white/5 hover:text-white ${
              compact ? "justify-center px-2" : "px-3"
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!compact && "Sign out"}
          </button>
        </form>
        {!onClose && (
          <button
            onClick={toggleCollapsed}
            title={compact ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-navy-200 hover:bg-white/5 hover:text-white ${
              compact ? "justify-center px-2" : "px-3"
            }`}
          >
            {compact ? <PanelLeftOpen className="h-5 w-5 shrink-0" /> : <PanelLeftClose className="h-5 w-5 shrink-0" />}
            {!compact && "Collapse"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block ${collapsed ? "w-[72px]" : "w-64"}`}
      >
        {sidebar(collapsed)}
      </aside>

      {/* Mobile top bar and drawer */}
      <div className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-navy-900 px-4 lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate text-sm font-semibold text-white">{subtitle}</span>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">{sidebar(false, () => setMobileOpen(false))}</aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
