/**
 * AuthoringRoute — mounts the Phase 9 Universal Authoring shell.
 *
 * Mirrors BiopharmaRoute / IntelligenceRoute: imports the stylesheet,
 * re-exports the App. Route-agnostic — the host (ZenApp) decides the mount
 * and the nav=artifacts trigger.
 *
 * @module client/src/concept2cure/authoring/AuthoringRoute
 */

import * as React from 'react';
import { AuthoringApp, type AuthoringAppProps } from './App';
import './app.css';

export type AuthoringRouteProps = AuthoringAppProps;

export default function AuthoringRoute(props: AuthoringRouteProps = {}) {
  return <AuthoringApp {...props} />;
}
