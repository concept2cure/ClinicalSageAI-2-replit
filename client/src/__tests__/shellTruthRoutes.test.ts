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
    const app = read('client/src/App.jsx');
    expect(app).toContain('<Route path="/sign-in">{() => <Redirect to="/concept2cure/login" />}</Route>');
    expect(app).toContain('<Route path="/auth">{() => <Redirect to="/concept2cure/login" />}</Route>');
    expect(app).toContain('<Route path="/login">{() => <Redirect to="/concept2cure/login" />}</Route>');
    expect(app).toContain('<Route path="/concept2cure">');
    expect(app).toContain('<Route path="/concept2cure/*">');
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

  it('keeps Zen workspace orchestration via ProjectWorkspaceShell', () => {
    const zenApp = read('client/src/concept2cure/ZenApp.tsx');
    expect(zenApp).toContain('ProjectWorkspaceShell');
    expect(zenApp).toContain("layoutMode === 'regulatory-workspace'");
  });
});
