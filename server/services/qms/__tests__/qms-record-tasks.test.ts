/**
 * A supplier's next audit and re-approval, and an internal audit's planned
 * date, are each one open task that ends when the record says it was done.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../tasking/source-task', () => ({ replaceSourceTask: vi.fn(async () => 'scheduled') }));

import { internalAuditTaskPlan, supplierTaskPlans, SUPPLIER_REMIND_DAYS } from '../qms-record-tasks';

const SUPPLIER = {
  id: 9, supplier_name: 'Acme Biologics', supplier_code: 'ACM', approval_status: 'approved',
  next_audit_date: '2026-12-01', reapproval_date: '2027-03-01',
};
const AUDIT = { id: 4, audit_number: 'IA-2026-04', scope: 'Document control', status: 'planned', planned_date: '2026-11-20', auditor_lead_id: 12 };

describe('Quality record tasks', () => {
  it("owes a supplier's next audit and re-approval, with 30 days notice", () => {
    const [audit, reapproval] = supplierTaskPlans(SUPPLIER, [], 42);
    expect(audit.sourceEntityId).toBe('qms-supplier-audit:9');
    expect(audit.next).toMatchObject({
      title: 'Supplier audit due: Acme Biologics (ACM)', assigneeId: 42, dueDate: new Date('2026-12-01T00:00:00Z'),
      metadata: { due: '2026-12-01', remindDaysBefore: SUPPLIER_REMIND_DAYS },
    });
    expect(reapproval.sourceEntityId).toBe('qms-supplier-reapproval:9');
    expect(reapproval.next?.title).toBe('Supplier re-approval due: Acme Biologics (ACM)');
    expect(audit.same({ due: '2026-12-01' })).toBe(true);
  });

  it('completes the audit task when an update records the audit, even with the next date unmoved', () => {
    const [audit, reapproval] = supplierTaskPlans(SUPPLIER, ['lastAuditDate'], 42);
    expect(audit.closeAs).toBe('completed');
    expect(audit.same({ due: '2026-12-01' })).toBe(false);
    expect(reapproval.closeAs).toBe('cancelled');
    expect(reapproval.same({ due: '2027-03-01' })).toBe(true);
  });

  it('owes nothing for a revoked supplier', () => {
    expect(supplierTaskPlans({ ...SUPPLIER, approval_status: 'revoked' }, [], 42).map((p) => p.next)).toEqual([null, null]);
  });

  it("owes a planned audit's start to its lead auditor, and ends the task once it starts or is cancelled", () => {
    const plan = internalAuditTaskPlan(AUDIT, 42);
    expect(plan.next).toMatchObject({ title: 'Internal audit IA-2026-04 is planned for 2026-11-20', assigneeId: 12 });
    const started = internalAuditTaskPlan({ ...AUDIT, status: 'in_progress' }, 42);
    expect([started.next, started.closeAs]).toEqual([null, 'completed']);
    const cancelled = internalAuditTaskPlan({ ...AUDIT, status: 'cancelled' }, 42);
    expect([cancelled.next, cancelled.closeAs]).toEqual([null, 'cancelled']);
    expect(internalAuditTaskPlan({ ...AUDIT, planned_date: '2026-12-04' }, 42).closeAs).toBe('cancelled');
  });
});
