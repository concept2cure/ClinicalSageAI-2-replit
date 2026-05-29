/**
 * SubmissionRoute — mounts the submission gateway workstream domain shell.
 *
 * Mirrors TaskingRoute: imports the MDX base stylesheet (shell chrome —
 * .rail / .topbar / .tabbar / .ana-seam) first, then the submission overlay
 * (which itself pulls in the biopharma bp-* surface primitives). Route-agnostic
 * — ZenApp owns the nav=submission-gateway trigger.
 *
 * This is the agency-transmission layer (transmittals, ACK chains, pre-flight
 * findings over FDA ESG / EMA CESP / EUDAMED / PMDA), distinct from the
 * package + section + readiness management the 'submissions' layoutMode owns.
 *
 * @module client/src/concept2cure/submission/SubmissionRoute
 */

import * as React from 'react';
import { SubmissionApp, type SubmissionAppProps } from './App';
import '../mdx/app.css';
import './app.css';

export type SubmissionRouteProps = SubmissionAppProps;

export default function SubmissionRoute(props: SubmissionRouteProps = {}) {
  return <SubmissionApp {...props} />;
}
