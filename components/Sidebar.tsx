"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { Logo } from "./Logo";
import {
  SearchIcon,
  FileIcon,
  ArrowUpRightIcon,
  ClockIcon,
  BuildingIcon,
  GridIcon,
  GearIcon,
  MenuIcon,
  CloseIcon,
  MailIcon,
  NoteIcon,
  SparkIcon,
} from "./icons";

export type SidebarSection = "oggi" | "offerte" | "offerta";

function NavItem({
  href,
  icon,
  label,
  active,
  soonTag,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  soonTag?: string;
}) {
  const content = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        color: active ? "#fff" : "#6b6b6b",
        background: active ? "#242424" : "transparent",
      }}
    >
      {icon}
      <span>{label}</span>
      {soonTag && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.03em",
            background: "#2a2a2a",
            color: "#8a8a8a",
            padding: "2px 6px",
            borderRadius: 999,
          }}
        >
          {soonTag}
        </span>
      )}
    </div>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          color: "#7c7c7c",
          fontSize: 10,
          letterSpacing: "0.12em",
          fontWeight: 800,
          padding: "0 10px",
          margin: "0 0 8px",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{children}</div>
    </div>
  );
}

function SidebarNav({ active }: { active: SidebarSection }) {
  return (
    <>
      <NavGroup title="OGGI">
        <NavItem href="/oggi" icon={<SparkIcon size={16} />} label="Command Center" active={active === "oggi"} />
      </NavGroup>

      <NavGroup title="INGRESSO">
        <NavItem icon={<MailIcon size={16} />} label="Inbox commerciale" soonTag="IN ARRIVO" />
        <NavItem icon={<NoteIcon size={16} />} label="Richieste" soonTag="IN ARRIVO" />
      </NavGroup>

      <NavGroup title="COMMERCIALE">
        <NavItem
          href="/ricerca"
          icon={<FileIcon size={16} />}
          label="Offerte"
          active={active === "offerte" || active === "offerta"}
        />
        <NavItem icon={<ArrowUpRightIcon size={16} />} label="Follow-up" soonTag="IN ARRIVO" />
        <NavItem icon={<ClockIcon size={16} />} label="Attese" soonTag="IN ARRIVO" />
        <NavItem icon={<BuildingIcon size={16} />} label="Clienti" soonTag="IN ARRIVO" />
        <NavItem icon={<GridIcon size={16} />} label="Agenzie" soonTag="IN ARRIVO" />
        <NavItem icon={<GridIcon size={16} />} label="Pipeline" soonTag="IN ARRIVO" />
      </NavGroup>

      <NavGroup title="SISTEMA">
        <NavItem icon={<SearchIcon size={16} />} label="Storico AI" soonTag="IN ARRIVO" />
        <NavItem icon={<GearIcon size={16} />} label="Impostazioni" soonTag="IN ARRIVO" />
      </NavGroup>
    </>
  );
}

function UserFooter({ userLabel }: { userLabel: string }) {
  const initial = userLabel.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        paddingTop: 12,
        borderTop: "1px solid #2f2f2f",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#fff",
            color: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {initial}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{userLabel}</span>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          style={{
            background: "none",
            border: "none",
            color: "#8a8a8a",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            padding: "0 2px",
          }}
        >
          Esci
        </button>
      </form>
    </div>
  );
}

export function Sidebar({
  active,
  userLabel,
}: {
  active: SidebarSection;
  userLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Sidebar fissa, desktop */}
      <aside
        className="sidebar-desktop"
        style={{
          width: 250,
          flex: "none",
          background: "var(--dark)",
          color: "#fff",
          padding: "24px 18px",
          flexDirection: "column",
          gap: 26,
          minHeight: "100vh",
        }}
      >
        <div style={{ padding: "0 4px" }}>
          <Logo variant="dark" />
        </div>
        <SidebarNav active={active} />
        <div style={{ marginTop: "auto" }}>
          <UserFooter userLabel={userLabel} />
        </div>
      </aside>

      {/* Barra superiore, mobile */}
      <div
        className="topbar-mobile"
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--dark)",
          color: "#fff",
          padding: "14px 16px",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <Logo variant="dark" size={22} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Apri menu"
          style={{ background: "none", border: "none", color: "#fff", padding: 6, cursor: "pointer", display: "flex" }}
        >
          <MenuIcon size={22} />
        </button>
      </div>

      {/* Drawer mobile */}
      <div
        className={`drawer-overlay${open ? " open" : ""}`}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 30 }}
        onClick={() => setOpen(false)}
      >
        <aside
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "82%",
            maxWidth: 300,
            height: "100%",
            background: "var(--dark)",
            color: "#fff",
            padding: "20px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Logo variant="dark" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Chiudi menu"
              style={{ background: "none", border: "none", color: "#fff", padding: 6, cursor: "pointer", display: "flex" }}
            >
              <CloseIcon size={20} />
            </button>
          </div>
          <SidebarNav active={active} />
          <div style={{ marginTop: "auto" }}>
            <UserFooter userLabel={userLabel} />
          </div>
        </aside>
      </div>
    </>
  );
}
