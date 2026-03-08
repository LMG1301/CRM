"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Kanban,
  Users,
  Building2,
  BarChart3,
  Upload,
  Menu,
  X,
  Zap,
  Bot,
  Settings,
  FileBarChart,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Pipeline", href: "/pipeline", icon: Kanban },
  { label: "Prospects", href: "/prospects", icon: Users },
  { label: "Entreprises", href: "/entreprises", icon: Building2 },
  { label: "Stats", href: "/stats", icon: BarChart3 },
  { label: "Rapports", href: "/reports", icon: FileBarChart },
  { label: "Contenus", href: "/contenus", icon: FileText },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Assistant IA", href: "/assistant", icon: Bot },
  { label: "Parametres", href: "/settings", icon: Settings },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent">
        <Zap className="h-4.5 w-4.5 text-white" />
      </div>
      <span className="text-lg font-bold tracking-tight text-white">
        Boost CRM
      </span>
    </div>
  );
}

function NavLink({
  item,
  isActive,
  onClick,
}: {
  item: (typeof navItems)[number];
  isActive: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/50 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-brand md:flex">
      <div className="flex h-16 items-center border-b border-white/10 px-4">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={isActive(item.href)}
          />
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="text-xs text-white/30">v1.0.0</p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-14 items-center border-b border-white/10 bg-brand px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-64 border-r border-white/10 bg-brand p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
            <Logo />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Button>
          </div>

          <nav className="flex flex-col gap-1 p-4">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                onClick={() => setOpen(false)}
              />
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="ml-3">
        <Logo />
      </div>
    </div>
  );
}
