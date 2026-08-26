import Link from "next/link";
import { signOut } from "@/app/actions";
import {
  SearchIcon,
  FileIcon,
  ArrowUpRightIcon,
  ClockIcon,
  BuildingIcon,
  GridIcon,
  GearIcon,
} from "./icons";

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

export function Sidebar({
  active,
  userLabel,
}: {
  active: "cerca" | "offerta";
  userLabel: string;
}) {
  const initial = userLabel.trim().charAt(0).toUpperCase() || "?";

  return (
    <aside
      style={{
        width: 250,
        flex: "none",
        background: "var(--dark)",
        color: "#fff",
        padding: "24px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 26,
        minHeight: "100vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
        <span style={{ fontWeight: 800, letterSpacing: "0.08em", fontSize: 16 }}>SIDERIO</span>
        <span
          style={{
            fontSize: 10,
            background: "rgba(255,255,255,.12)",
            color: "#ddd",
            padding: "4px 8px",
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          SALES AI
        </span>
      </div>

      <NavGroup title="OPERATIVO">
        <NavItem
          href="/ricerca"
          icon={<SearchIcon size={16} />}
          label="Cerca offerta"
          active={active === "cerca" || active === "offerta"}
        />
        <NavItem icon={<FileIcon size={16} />} label="Offerte" soonTag="FASE 3" />
        <NavItem icon={<ArrowUpRightIcon size={16} />} label="Follow-up" soonTag="FASE 3" />
        <NavItem icon={<ClockIcon size={16} />} label="Attese" soonTag="FASE 3" />
      </NavGroup>

      <NavGroup title="COMMERCIALE">
        <NavItem icon={<BuildingIcon size={16} />} label="Clienti" soonTag="FASE 3" />
        <NavItem icon={<GridIcon size={16} />} label="Pipeline" soonTag="FASE 3" />
      </NavGroup>

      <NavGroup title="SISTEMA">
        <NavItem icon={<ClockIcon size={16} />} label="Storico valutazioni" soonTag="FASE 2" />
        <NavItem icon={<GearIcon size={16} />} label="Impostazioni" />
      </NavGroup>

      <div
        style={{
          marginTop: "auto",
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
    </aside>
  );
}
