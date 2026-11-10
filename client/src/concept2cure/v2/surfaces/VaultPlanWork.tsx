/**
 * The plan work that feeds a Vault binder folder (S6 step 3, the founder 2026-11-06: "the full IND
 * pyramid … inside of Vault").
 *
 * Reads the project's pyramid once (GET /api/v1/pyramids/by-project/:id, the read the project's
 * Plan step uses) and lists, under the open binder heading, the tasks whose document bindings fall
 * in it, with their recorded status. Read only: a status is changed in the Plan, where its
 * owner and dates are. A read that fails says so; it is never shown as "no tasks".
 */
import React, { useMemo } from 'react';
import { useLiveData } from '../dataConnect';
import { PY_STATUS } from '../fixtures/pyramid-data';
import { projectPyramidPath, type ProjectPyramidRead } from './PyramidProject';
import { planTasksForFolder } from './vaultFolders';

export function VaultPlanWork({ projectId, treeFolderId, onOpenPlan }: {
  projectId: string;
  treeFolderId: string;
  /** Opens the project's Plan step. */
  onOpenPlan?: () => void;
}) {
  const read = useLiveData<ProjectPyramidRead>(projectPyramidPath(projectId), [projectId]);
  const tasks = useMemo(
    () => planTasksForFolder(treeFolderId, read.data?.pyramid?.tasks ?? [], read.data?.statuses ?? {}),
    [treeFolderId, read.data],
  );
  if (!treeFolderId.startsWith('cab-bn:') || read.loading) return null;
  if (read.error) {
    return <div className="scaf-note" role="status" data-testid="vault-plan-work">The plan could not be read, so the work feeding this folder is not shown.</div>;
  }
  if (!read.data?.type || tasks.length === 0) return null;
  return (
    <section className="vd-d-filing" aria-label="Plan work for this folder" data-testid="vault-plan-work">
      <div className="vd-d-seclbl">Plan work for this folder · {read.data.label ?? read.data.type}</div>
      {tasks.map((t) => (
        <div key={t.id} className="vd-d-filing-row" data-testid="vault-plan-task">
          <span className="k">{PY_STATUS[t.status]?.l ?? t.status}</span>
          <span className="v">{t.name} <span className="vd-sub-part">· {t.codes.join(', ')}</span></span>
        </div>
      ))}
      {onOpenPlan ? (
        <div className="vd-d-filing-acts">
          <button type="button" className="sp-ask" onClick={onOpenPlan}>Open the plan</button>
        </div>
      ) : null}
    </section>
  );
}
