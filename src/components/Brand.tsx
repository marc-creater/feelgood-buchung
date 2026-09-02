import Link from "next/link";

export function Brand({ sub = "Massage · Yoga · Pilates", small = false }: { sub?: string; small?: boolean }) {
  return (
    <header className="brand">
      <h1 style={small ? { fontSize: 24 } : undefined}><Link href="/">{(process.env.STUDIO_NAME || "Feelgood").toUpperCase()}</Link></h1>
      <p>{sub}</p>
    </header>
  );
}

export function Crumbs({ step }: { step: number }) {
  return (
    <div className="crumbs" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => <span key={i} className={i <= step ? "on" : ""} />)}
    </div>
  );
}
