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
  navy: "bg-navy-700",
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
        size === "lg" ? "h-10 w-10 rounded-xl" : "h-7 w-7 rounded-lg"
      }`}
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
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

  const sidebar = (compact: boolean, onClose?: () => void) => (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className={`flex h-16 shrink-0 items-center ${compact ? "justify-center px-2" : "justify-between px-4"}`}>
        <Logo subtitle={subtitle} compact={compact} tone="light" />
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {badge && !compact && (
        <div className="px-4 pb-1">
          <span className="rounded-md bg-gold-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold-500">
            {badge}
          </span>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.title} className="mt-4">
            {compact ? (
              <div className="mx-auto mb-2 h-px w-6 bg-slate-200" />
            ) : (
              <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{section.title}</div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={compact ? item.label : undefined}
                    className={`flex items-center gap-2.5 rounded-lg py-1.5 text-sm transition-colors ${
                      compact ? "justify-center px-1.5" : "px-2"
                    } ${active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <Tile item={item} />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className={`flex items-center gap-2.5 ${compact ? "flex-col" : ""}`}>
          <span
            title={compact ? userLabel : undefined}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-white"
          >
            <UserRound className="h-4 w-4" />
          </span>
          {!compact && <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{userLabel}</span>}
          <form action={logout}>
            <button title="Sign out" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block ${collapsed ? "w-[68px]" : "w-60"}`}
      >
        {sidebar(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 max-w-[85vw] shadow-xl">{sidebar(false, () => setMobileOpen(false))}</aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[68px]" : "lg:pl-60"}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          {current && (
            <div className="flex min-w-0 items-center gap-3">
              <Tile item={current.item} size="lg" />
              <div className="min-w-0 leading-tight">
                <div className="text-xs text-slate-500">{current.section}</div>
                <h1 className="truncate text-lg font-semibold text-slate-900">{current.item.label}</h1>
              </div>
            </div>
          )}
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
