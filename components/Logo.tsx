export function Logo({
  variant = "dark",
  size = 26,
}: {
  variant?: "dark" | "light";
  size?: number;
}) {
  const textColor = variant === "dark" ? "#ffffff" : "var(--text)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        <rect width="100" height="100" rx="24" fill="#6c5ce7" />
        <text
          x="50"
          y="53"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-inter), Arial, Helvetica, sans-serif"
          fontWeight={700}
          fontSize={58}
          fill="#ffffff"
        >
          S
        </text>
      </svg>
      <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em", color: textColor }}>
        Sales AI
      </span>
    </div>
  );
}
