import fs from 'fs';
import path from 'path';

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

const read = (relativePath: string) =>
  fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');

describe('stage 5 shell truth route smoke', () => {
  it('keeps main.tsx as the browser entrypoint', () => {
    const html = read('client/index.html');
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it('keeps login aliases and concept2cure entry mounted in App shell', () => {
    // After the App.jsx refactor, the explicit /concept2cure and
    // /concept2cure/* Routes were replaced by a catch-all <Route>
    // that delegates every other path to ZenRouter (which owns the
    // /concept2cure routing internally). The contract this test
    // enforces remains: login aliases redirect to the canonical
    // /concept2cure/login, and the shell mounts ZenRouter as a
    // catch-all for non-auth paths.
    const app = read('client/src/App.jsx');
    expect(app).toContain('<Route path="/sign-in">{() => <Redirect to="/concept2cure/login" />}</Route>');
    expect(app).toContain('<Route path="/auth">{() => <Redirect to="/concept2cure/login" />}</Route>');
    expect(app).toContain('<Route path="/login">{() => <Redirect to="/concept2cure/login" />}</Route>');
    expect(app).toContain('<ZenRouter />');
  });

  it('fences legacy /client-portal routes to canonical shell', () => {
    const app = read('client/src/App.jsx');
    expect(app).toContain('<Route path="/client-portal">');
    expect(app).toContain('<Route path="/client-portal/:rest*">');
    expect(app).toContain('{() => <Redirect to="/concept2cure" />}');
  });

  it('routes app paths through ZenRouter into the persistent ui-v2 shell', () => {
    // Phase 7 deleted the legacy ZenApp shell: /, /concept2cure and every
    // surface/project deep link are owned by the ui-v2 fast path, which
    // renders ProtectedZenApp (the v2 shell) OUTSIDE the location-keyed
    // transition Switch so the shell persists across in-app navigations.
    const router = read('client/src/concept2cure/router/ZenRouter.tsx');
    expect(router).toContain("location.startsWith('/concept2cure')");
    expect(router).toContain('<ProtectedZenApp />');
    expect(router).not.toContain("from '../ZenApp'");
  });

  it('keeps the regulatory workspace surface registered in the v2 renderer map', () => {
    // ZenApp's layoutMode switch is gone; the workspace surface is now a
    // SURFACE_VIEWS registration resolved from the shared registry id.
    const views = read('client/src/concept2cure/v2/surfaceViews.ts');
    expect(views).toContain("'regulatory-workspace'");
  });
});
