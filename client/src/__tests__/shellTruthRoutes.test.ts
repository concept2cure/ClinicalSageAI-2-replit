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

  it('routes project-scoped paths through ZenRouter into ProtectedZenApp', () => {
    const router = read('client/src/concept2cure/router/ZenRouter.tsx');
    expect(router).toContain('<Route path="/concept2cure/project/:projectId/:rest*">');
    expect(router).toContain('<Route path="/concept2cure/project/:projectId">');
    expect(router).toContain('<ProtectedZenApp />');
  });

  it('keeps Zen workspace orchestration on the regulatory-workspace layoutMode', () => {
    // ProjectWorkspaceShell was inlined into ZenApp during the design
    // refactor; the workspace surface is now selected by layoutMode
    // rather than a wrapper component. The contract this test
    // enforces — "the workspace path is selected by a known
    // layoutMode value" — is intact.
    const zenApp = read('client/src/concept2cure/ZenApp.tsx');
    expect(zenApp).toContain("layoutMode === 'regulatory-workspace'");
  });
});
