/**
 * The Vault with no project open (split out of Vault.tsx, 2026-11-10).
 *
 * It lists the projects whose Vaults the person can open (2026-11-06, by the founder: Vault "should be accessible all
 * the time, not just from within the project, but on the left rail"), read from the one project list the ⌘K palette
 * and Projects read (GET /api/c2c/projects), and after them the governed artifacts of those projects.
 *
 * One client at a time (P-107 item 3, 2026-11-08: "No cross-sponsor library view for a CRO. With no project open, the
 * Vault first asks which sponsor; every view is inside one sponsor."). A CRO is one organisation working for several
 * clients, and this page listed every client's projects and governed artifacts together. Now, when the person's
 * projects belong to more than one client, the page asks which client and shows nothing else until one is chosen;
 * then the projects and the governed artifacts are that client's only. The server decides: it refuses the listing
 * with CLIENT_REQUIRED and names the clients to choose from. The project list is a second sign of the same fact, so a
 * listing that could not be read never leaves two clients' projects in one list.
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { publishShellProject } from '../shellProject';
import { usePaletteProjects, type PaletteProject, type PaletteProjectsRead } from '../paletteProjects';
import type { OrganizationArtifactsRead } from './VaultOrganizationArtifacts';
import { NO_CLIENT, clientsToChooseFrom, type VaultClient } from './VaultLibraryResults';

/** The clients the listed projects belong to, by name, with "no client" last. */
export function clientsOfProjects(projects: readonly PaletteProject[]): VaultClient[] {
  const named = new Map<number, VaultClient>();
  for (const p of projects) if (p.client) named.set(p.client.id, p.client);
  const sorted = [...named.values()].sort((a, b) => a.name.localeCompare(b.name));
  return projects.some((p) => !p.client) ? [...sorted, NO_CLIENT] : sorted;
}

const ofClient = (p: PaletteProject, client: VaultClient) => (client.id === 'none' ? !p.client : p.client?.id === client.id);

/** The projects' Vaults, one row each; a row opens that project and its Vault, as the rail's Vault does inside a project. */
function ProjectVaults({ read, client, onNav }: { read: PaletteProjectsRead; client: VaultClient | null; onNav?: (id: string) => void }) {
  const open = (p: PaletteProject) => {
    publishShellProject({ id: p.id, title: p.title, ...(p.code ? { code: p.code } : {}), ...(p.ws ? { ws: p.ws } : {}), ...(p.status ? { status: p.status } : {}) });
    onNav?.('vault');
  };
  if (read.state !== 'ready') {
    return read.state === 'failed'
      ? <p role="alert" className="scaf-note">Your projects could not be read, so their Vaults are not listed. Open one from Projects.</p>
      : <p role="status" className="scaf-note">Reading your projects…</p>;
  }
  const projects = client ? read.projects.filter((p) => ofClient(p, client)) : read.projects;
  if (projects.length === 0) {
    return (
      <p className="scaf-note">
        {client
          ? `None of the projects listed belong to ${client.id === 'none' ? 'no client' : client.name}. Open one from Projects.`
          : 'You have no projects yet. A Vault belongs to a project: create one with New project in Projects.'}
      </p>
    );
  }
  return (
    <section className="pj-sec vd-org" aria-labelledby="vault-project-list-h" data-testid="vault-project-list">
      <div className="pj-sec-h">
        <h2 id="vault-project-list-h">Your projects' Vaults</h2>
        <span className="sec-sub">{projects.length === 1 ? '1 project' : `${projects.length} projects`}</span>
      </div>
      <div className="ctable">
        {projects.map((p) => (
          <div key={p.id} className="ct-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <span className="ct-strong">{p.title}</span>
            <button type="button" className="btn ghost small" onClick={() => open(p)} aria-label={`Open the Vault of ${p.title}`}>
              Open its Vault
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The question asked first: which client. Nothing of any client is shown beside it. */
function ClientChoice({ clients, onChoose }: { clients: readonly VaultClient[]; onChoose: (c: VaultClient) => void }) {
  return (
    <>
      <EmptyState
        icon={I.folder}
        title="Choose a client"
        hint="Your projects belong to more than one client. The Vault shows one client's projects and records at a time, so choose whose to open."
      />
      {clients.length === 0 ? (
        <p role="alert" className="scaf-note">The clients could not be listed. Open a project from Projects to reach its Vault.</p>
      ) : (
        <section className="pj-sec vd-org" aria-labelledby="vault-client-list-h" data-testid="vault-client-choice">
          <div className="pj-sec-h">
            <h2 id="vault-client-list-h">Clients</h2>
            <span className="sec-sub">{clients.length} to choose from</span>
          </div>
          <div className="ctable">
            {clients.map((c) => (
              <div key={String(c.id)} className="ct-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <span className="ct-strong">{c.id === 'none' ? 'Projects with no client' : c.name}</span>
                <button type="button" className="btn ghost small" onClick={() => onChoose(c)}
                  aria-label={c.id === 'none' ? 'Show the Vaults of projects with no client' : `Show the Vaults of ${c.name}`}>
                  Show its Vaults
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function VaultProjectChoice({ onNav, artifacts, client, onClient, children }: {
  onNav?: (id: string) => void;
  /** The governed-artifacts read: refused with CLIENT_REQUIRED until a client is chosen, when the projects span more than one. */
  artifacts: Pick<OrganizationArtifactsRead, 'loading' | 'code' | 'meta'>;
  /** The client chosen, or null when none has been. */
  client: VaultClient | null;
  onClient: (client: VaultClient | null) => void;
  /** The governed artifacts listing, shown only once the page is inside one client. */
  children: React.ReactNode;
}) {
  const read = usePaletteProjects(true);
  /* Whether a client must be chosen is known once the listing has answered. A later re-read of the same listing (Try
     again) keeps what is on screen; asking again for a client waits for the answer again. */
  const [answered, setAnswered] = React.useState(false);
  React.useEffect(() => { if (!artifacts.loading) setAnswered(true); }, [artifacts.loading]);
  const choose = (next: VaultClient | null) => { setAnswered(false); onClient(next); };
  if (client) {
    return (
      <>
        <div className="scaf-note vd-client" role="status" data-testid="vault-client-chosen">
          <span>Showing {client.id === 'none' ? 'projects with no client' : <strong>{client.name}</strong>} only.</span>
          <button type="button" className="btn ghost small" onClick={() => choose(null)}>Change client</button>
        </div>
        <ProjectVaults read={read} client={client} onNav={onNav} />
        {children}
      </>
    );
  }
  /* Nothing is listed before the listing and the projects have answered. A project list that could not be read
     leaves the listing's answer to decide. */
  if (!answered || read.state === 'reading') return <p role="status" className="scaf-note">Reading your projects…</p>;
  const refused = clientsToChooseFrom(artifacts);
  const listed = read.state === 'ready' ? clientsOfProjects(read.projects) : [];
  if (refused !== null || listed.length > 1) {
    return <ClientChoice clients={refused?.length ? refused : listed.length > 1 ? listed : []} onChoose={choose} />;
  }
  return (
    <>
      <EmptyState
        icon={I.folder}
        title="Choose a project's Vault"
        hint="Each project keeps its own governed document tree: its CTD, eSTAR, IVDR or TMF spine. Open one below. The governed artifacts of every project you can open are listed after them."
      />
      <ProjectVaults read={read} client={null} onNav={onNav} />
      {children}
    </>
  );
}
