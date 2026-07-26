import PageHeader from "../components/layout/PageHeader";

const CATEGORIES = [
  {
    title: "Insurance",
    description: "Life, homeowners, auto, and health coverage in one place.",
    links: [
      ["Insurance overview", "/insurance"],
      ["Homeowners", "/insurance/homeowners"],
      ["Auto", "/insurance/auto"],
      ["Health", "/insurance/health"],
    ],
  },
  {
    title: "Property & Mortgages",
    description: "See properties, loans, equity, and coverage relationships.",
    links: [["Property", "/property"], ["Mortgages", "/mortgage"]],
  },
  {
    title: "Banking",
    description: "Organize household accounts and liquidity records.",
    links: [["Banking", "/banking"]],
  },
  {
    title: "Retirement",
    description: "Review retirement accounts and long-term readiness.",
    links: [["Retirement", "/retirement"], ["College planning", "/college-planning"]],
  },
  {
    title: "Estate & Warranties",
    description: "Keep continuity documents and important protections findable.",
    links: [["Estate records", "/estate"], ["Warranties", "/warranties"]],
  },
];

export default function FinancialLifePage({ onNavigate }) {
  return (
    <div style={{ display: "grid", gap: "24px", maxWidth: "1180px", margin: "0 auto" }}>
      <PageHeader
        eyebrow="Household overview"
        title="My Financial Life"
        subtitle="Choose a category in plain language. Your existing records and analysis remain in their original modules."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "16px" }}>
        {CATEGORIES.map((category) => (
          <section key={category.title} style={{ padding: "24px", border: "1px solid #e2e8f0", borderRadius: "20px", background: "#fff", boxShadow: "0 8px 24px rgba(15,23,42,.05)" }}>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>{category.title}</h2>
            <p style={{ color: "#475569", lineHeight: 1.7 }}>{category.description}</p>
            <div style={{ display: "grid", gap: "8px" }}>
              {category.links.map(([label, path]) => (
                <button key={path} type="button" onClick={() => onNavigate?.(path)} style={{ minHeight: "44px", padding: "10px 12px", textAlign: "left", border: "1px solid #cbd5e1", borderRadius: "10px", background: "#f8fafc", color: "#1d4ed8", cursor: "pointer", fontWeight: 700 }}>
                  {label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
