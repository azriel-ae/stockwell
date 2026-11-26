"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  Database,
  LayoutDashboard,
  ListTree,
  Menu,
  Package,
  Settings,
  Tags,
  Truck,
  X,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{
    size?: number | string;
    className?: string;
    strokeWidth?: number | string;
  }>;
}

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Inventory",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/categories", label: "Categories", icon: Tags },
      { href: "/suppliers", label: "Suppliers", icon: Truck },
      { href: "/movements", label: "Stock movements", icon: ListTree },
    ],
  },
  {
    title: "Analytics",
    items: [{ href: "/reports", label: "Reports", icon: BarChart3 }],
  },
  {
    title: "System",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/connection", label: "Drivebase connection", icon: Database },
    ],
  },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-softsage/90 text-charcoal">
        <Boxes size={16} strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-white">Stockwell</p>
        <p className="text-[10px] text-white/50">Know your stock. Stay in control.</p>
      </div>
    </div>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
        active
          ? "bg-white/10 font-medium text-white"
          : "text-white/60 hover:bg-white/5 hover:text-white/90"
      }`}
    >
      {active ? (
        <span className="absolute top-1.5 bottom-1.5 left-0 w-[2.5px] rounded-full bg-softsage" />
      ) : null}
      <Icon size={15} strokeWidth={1.8} />
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col bg-charcoal md:flex">
      <div className="px-4 py-5">
        <BrandMark />
      </div>
      <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-[0.14em] text-white/35 uppercase">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <p className="flex items-center gap-1.5 text-[10px] text-white/40">
          <Database size={11} /> Powered by Drivebase
        </p>
      </div>
    </aside>
  );
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-40 bg-charcoal md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <BrandMark />
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-1.5 text-white/70 hover:bg-white/10"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open ? (
        <nav className="space-y-4 border-t border-white/10 px-3 pb-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-[0.14em] text-white/35 uppercase">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
