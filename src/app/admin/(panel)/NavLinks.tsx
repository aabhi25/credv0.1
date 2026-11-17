"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/programs", label: "Programs" },
  { href: "/admin/applicants", label: "Applicants" },
  { href: "/admin/bureaus", label: "Bureaus" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
      {links.map(({ href, label }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors ${
              active ? "border-gold-400 text-white" : "border-transparent text-navy-200 hover:text-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
