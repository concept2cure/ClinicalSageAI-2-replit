/**
 * QualityRoute — mounts the Quality system / SOP register surface.
 *
 * Mirrors IntelligenceRoute / CmcRoute: imports the scoped stylesheet and
 * re-exports the App. Route-agnostic — the host (ZenApp) decides the mount and
 * passes the AnA + navigation handlers.
 *
 * @module client/src/concept2cure/quality/QualityRoute
 */

import * as React from 'react';
import { QualityApp, type QualityAppProps } from './App';
import './app.css';

export type QualityRouteProps = QualityAppProps;

export default function QualityRoute(props: QualityRouteProps = {}) {
  return <QualityApp {...props} />;
}
