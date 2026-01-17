// /client/src/modules/Vault.jsx

const quickStats = [
  { label: 'Compliance-ready templates', value: '42', detail: '21 CFR Part 11 aligned' },
  { label: 'Median retrieval time', value: '4.2s', detail: 'Global indexed search' },
  { label: 'Audit trail coverage', value: '100%', detail: 'Immutable activity log' },
  { label: 'Field-ready workflows', value: '8', detail: 'Mobile + offline kits' },
];

const fieldCapabilities = [
  {
    title: 'Offline capture kits',
    description: 'Collect site documents and signatures offline with auto-sync upon reconnection.',
  },
  {
    title: 'Guided checklists',
    description: 'Role-based visit checklists surface missing documents before audits.',
  },
  {
    title: 'Rapid indexing',
    description: 'AI-assisted tagging auto-classifies content by study, site, and region.',
  },
  {
    title: 'Mobile vault review',
    description: 'Review, annotate, and approve documents from mobile or tablet.',
  },
];

const veevaComparison = [
  {
    title: 'Field usability',
    vault: 'Offline-ready workflows with mobile capture and instant sync.',
    veeva: 'Primarily online workflows; offline support requires add-ons.',
  },
  {
    title: 'Speed to insight',
    vault: 'Predictive search and AI tagging reduce time to find critical files.',
    veeva: 'Keyword-heavy search can require manual taxonomy upkeep.',
  },
  {
    title: 'Compliance confidence',
    vault: 'Built-in audit trails and validation status badges in every folder.',
    veeva: 'Strong audit trails, but validation details are often separate.',
  },
  {
    title: 'Deployment agility',
    vault: 'Modular configuration with prebuilt regulatory playbooks.',
    veeva: 'Robust but longer implementation cycles for custom workflows.',
  },
];

const nextMilestones = [
  {
    title: 'Field intake scanning',
    status: 'In design',
    detail: 'Smart capture with auto-QC for image clarity and metadata.',
  },
  {
    title: 'Study readiness score',
    status: 'Prototype',
    detail: 'Confidence scoring for document completeness by milestone.',
  },
  {
    title: 'Vault-to-CRA handoff',
    status: 'Planned',
    detail: 'One-click handoff with tracked acknowledgements.',
  },
];

const Vault = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-6 rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              TrialSage Vault™
            </span>
            <h1 className="text-3xl font-semibold text-slate-900">
              Field-ready document control with enterprise-grade compliance
            </h1>
            <p className="text-base text-slate-600">
              Modernize how teams capture, manage, and validate clinical documents in the field.
              Vault now pairs mobile usability with audit-ready governance to outpace legacy DMS
              workflows.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              type="button"
            >
              Launch Vault Workspace
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              type="button"
            >
              Upload Field Documents
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              type="button"
            >
              View Compliance Status
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {quickStats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {stat.label}
              </p>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-3xl font-semibold text-slate-900">{stat.value}</span>
                <span className="text-sm text-slate-500">{stat.detail}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Built for field usability</h2>
            <p className="text-sm text-slate-600">
              Reduce site visit friction with workflows that mirror the realities of onsite work.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {fieldCapabilities.map((capability) => (
              <div key={capability.title} className="rounded-xl border border-slate-100 p-5">
                <h3 className="text-sm font-semibold text-slate-900">{capability.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{capability.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-slate-900">
              Vault vs. Veeva: practical differences
            </h2>
            <p className="text-sm text-slate-600">
              Focused on day-to-day usability for clinical operations and site teams.
            </p>
          </div>
          <div className="mt-6 grid gap-4">
            {veevaComparison.map((item) => (
              <div
                key={item.title}
                className="grid gap-4 rounded-xl border border-slate-100 p-5 md:grid-cols-3"
              >
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">Vault:</span> {item.vault}
                </div>
                <div className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">Veeva:</span> {item.veeva}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Roadmap toward field excellence</h2>
            <p className="text-sm text-slate-600">
              Delivery plan for the next iterations of Vault modernization.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {nextMilestones.map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-100 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {item.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Vault;
