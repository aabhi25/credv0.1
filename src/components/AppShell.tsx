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
  PanelLeft,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { Logo } from "./Logo";

// Icons and colours are referenced by name because server layouts can't pass components to client components.
const ICONS = {
  dashboard: Gauge,
  programs: SlidersHorizontal,
  applicants: Users,
  bureaus: Landmark,
  organizations: Building2,
  superadmins: ShieldCheck,
} satisfies Record<string, LucideIcon>;

const TILE_COLORS = {
  navy: "bg-navy-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  color: keyof typeof TILE_COLORS;
  /** Extra path prefixes that should highlight this item. */
  match?: string[];
};

export type NavSection = { title: string; items: NavItem[] };

type Props = {
  sections: NavSection[];
  /** Section home such as /admin; only highlighted on an exact match. */
  home: string;
  subtitle: string;
  badge?: string;
  userLabel: string;
  logout: () => Promise<void>;
  defaultCollapsed: boolean;
  children: React.ReactNode;
};

function Tile({ item, size = "sm" }: { item: NavItem; size?: "sm" | "lg" }) {
  const Icon = ICONS[item.icon];
  return (
    <span
      className={`flex shrink-0 items-center justify-center text-white ${TILE_COLORS[item.color]} ${
        size === "lg" ? "h-9 w-9 rounded-xl" : "h-6 w-6 rounded-md shadow-sm shadow-black/30"
      }`}
    >
      <Icon className={size === "lg" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />
    </span>
  );
}

export function AppShell({ sections, home, subtitle, badge, userLabel, logout, defaultCollapsed, children }: Props) {
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

  const isActive = (item: NavItem) => {
    const prefixes = [...(item.href === home ? [] : [item.href]), ...(item.match ?? [])];
    return pathname === item.href || prefixes.some((p) => pathname.startsWith(`${p}/`));
  };

  let current: { section: string; item: NavItem } | null = null;
  for (const s of sections) {
    const item = s.items.find(isActive);
    if (item) current = { section: s.title, item };
  }

  const sidebar = (compact: boolean, onClose?: () => void) => {
    let index = 0;
    return (
      <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-navy-900 via-navy-950 to-[#03070f] text-navy-200">
        {/* Slow-drifting glow for depth */}
        <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 animate-glow-drift rounded-full bg-[radial-gradient(circle,rgba(61,90,153,0.45),transparent_65%)] blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(212,178,106,0.08),transparent_65%)] blur-2xl" />

        <div className={`relative flex h-14 shrink-0 items-center ${compact ? "justify-center px-2" : "justify-between px-4"}`}>
          <Logo subtitle={subtitle} compact={compact} size="sm" />
          {onClose && (
            <button onClick={onClose} className="rounded-md p-1.5 text-navy-200 hover:bg-white/10 hover:text-white" aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {badge && !compact && (
          <div className="relative px-4">
            <span className="rounded bg-gold-400/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gold-400 ring-1 ring-gold-400/25">
              {badge}
            </span>
          </div>
        )}

        <nav className="relative flex-1 overflow-y-auto px-2.5 pb-4">
          {sections.map((section) => (
            <div key={section.title} className="mt-4">
              {compact ? (
                <div className="mx-auto mb-2 h-px w-5 bg-white/10" />
              ) : (
                <div
                  className="mb-1 animate-nav-in px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-navy-300/60"
                  style={{ animationDelay: `${index++ * 35}ms` }}
                >
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={compact ? item.label : undefined}
                      style={{ animationDelay: `${index++ * 35}ms` }}
                      className={`group relative flex animate-nav-in items-center gap-2.5 rounded-md py-1.5 text-[13px] transition-all duration-200 ${
                        compact ? "justify-center px-1.5" : "px-2 hover:translate-x-0.5"
                      } ${active ? "bg-white/[0.08] font-medium text-white" : "hover:bg-white/[0.04] hover:text-white"}`}
                    >
                      {active && (
                        <span className="absolute inset-y-1.5 -left-2.5 w-[3px] origin-center animate-indicator-in rounded-r-full bg-gold-400" />
                      )}
                      <span className={`transition-transform duration-200 ${active ? "" : "group-hover:scale-105"}`}>
                        <Tile item={item} />
                      </span>
                      {!compact && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative border-t border-white/[0.06] p-2.5">
          <div className={`flex items-center gap-2.5 rounded-md px-1.5 py-1 ${compact ? "flex-col" : ""}`}>
            <span
              title={compact ? userLabel : undefined}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-navy-100"
            >
              <UserRound className="h-3.5 w-3.5" />
            </span>
            {!compact && <span className="min-w-0 flex-1 truncate text-[13px] text-navy-100">{userLabel}</span>}
            <form action={logout}>
              <button title="Sign out" className="rounded-md p-1.5 text-navy-300 transition-colors hover:bg-white/10 hover:text-white">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden shadow-[1px_0_0_rgba(15,23,42,0.08)] transition-[width] duration-300 ease-out lg:block ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        {sidebar(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-60 max-w-[85vw] animate-drawer-in shadow-2xl">
            {sidebar(false, () => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-300 ease-out ${collapsed ? "lg:pl-16" : "lg:pl-56"}`}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-300 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-300 lg:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
          {current && (
            <div key={current.item.href} className="flex min-w-0 animate-fade-in items-center gap-2.5">
              <Tile item={current.item} size="lg" />
              <div className="min-w-0 leading-tight">
                <div className="text-[11px] text-slate-500">{current.section}</div>
                <h1 className="truncate text-base font-semibold text-slate-900">{current.item.label}</h1>
              </div>
            </div>
          )}
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
