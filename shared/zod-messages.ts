/**
 * The one place the product sets zod's default wording (2026-11-11).
 *
 * A value that was not sent reads "Required". zod 3 said so; zod 4 says "Invalid input: expected string, received
 * undefined", and about twenty routes hand the first issue's message to the screen as it is (organisation profile,
 * setup, legal holds, company documents), so the zod 4 move changed what a person reads. This restores the plain
 * word for that one case and nothing else: a message a schema states itself always wins, and a value of the wrong
 * type keeps zod's sentence, which names the type.
 *
 * Imported for its effect by the server (server/index.ts), the browser (client/src/main.tsx) and the test setup
 * (tests/setup.ts). zod reads this configuration when it builds an issue, so schemas made earlier are covered.
 */
import { z } from 'zod';

export const REQUIRED_MESSAGE = 'Required';

z.config({
  // A missing string or number is an invalid_type issue; a missing enum or literal is invalid_value.
  customError: (issue) =>
    issue.input === undefined && (issue.code === 'invalid_type' || issue.code === 'invalid_value') ? REQUIRED_MESSAGE : undefined,
});
