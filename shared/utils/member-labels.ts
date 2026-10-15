/**
 * How a person is named where someone must choose between people.
 *
 * A member picker that shows names alone cannot tell two people apart when
 * they share one. The demo organisation has two "JM Smith" accounts, and the
 * Task form's "Assign to" showed two identical chips, the protocol review's
 * reviewer list showed "JM Smith · admin" twice, and the task board, RBM and
 * assign-review selects did the same (W1/D2, 2026-09-29;
 * docs/evidence/W1/2026-10-05-same-name-members/). Whichever was picked, the
 * record named someone, and the person choosing could not know who.
 *
 * The rule: a name nobody else in the list holds is shown as it is. A name two
 * or more members hold is shown with the address beside it, which is unique
 * per account. Names are compared trimmed and case-insensitively. A member
 * with no name is shown by address. One implementation, used by the server
 * (GET /api/task-management/assignees `label`) and by the reviewer picker,
 * whose list comes from another endpoint.
 */
export interface NamedMember {
  id: string | number;
  name?: string | null;
  email?: string | null;
}

const key = (name: string) => name.trim().toLowerCase();

/** id → the label to show for it, unique within `members` whenever addresses are. */
export function memberLabels(members: readonly NamedMember[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const m of members) {
    const n = (m.name ?? '').trim();
    if (n) counts.set(key(n), (counts.get(key(n)) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const m of members) {
    const n = (m.name ?? '').trim();
    const email = (m.email ?? '').trim();
    let label: string;
    if (!n) label = email || String(m.id);
    else if ((counts.get(key(n)) ?? 0) > 1 && email) label = `${n} · ${email}`;
    else label = n;
    labels.set(String(m.id), label);
  }
  return labels;
}
