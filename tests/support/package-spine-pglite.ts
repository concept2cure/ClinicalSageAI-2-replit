/**
 * The PGlite database the package-spine end-to-end suites run the real route
 * against. Its own module, importing nothing of the application, so a suite's
 * vi.mock('../server/db') factory can import it without importing the router
 * through it.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

export const pg = new PGlite();
export const drizzleDb = drizzle(pg);
