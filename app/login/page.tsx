"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(signIn, {
    error: null,
  });

  return (
    <div className="login-shell">
      <div className="login-card">
        <Logo variant="light" size={30} />

        <form
          action={formAction}
          className="panel"
          style={{ padding: 32, display: "flex", flexDirection: "column", gap: 22 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Accedi</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              Usa le stesse credenziali di Siderio Suite.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="email"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                style={{
                  height: 42,
                  padding: "0 13px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 14,
                  color: "var(--text)",
                  outline: "none",
                  background: "#fff",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="password"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                style={{
                  height: 42,
                  padding: "0 13px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 14,
                  color: "var(--text)",
                  outline: "none",
                  background: "#fff",
                }}
              />
            </div>
          </div>

          {state.error && (
            <div style={{ fontSize: 13, color: "var(--danger)", fontWeight: 600 }}>{state.error}</div>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              height: 42,
              border: "none",
              borderRadius: 10,
              background: "var(--dark)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>

        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
          Problemi di accesso? Contatta l&rsquo;amministratore di sistema.
        </div>
      </div>
    </div>
  );
}
