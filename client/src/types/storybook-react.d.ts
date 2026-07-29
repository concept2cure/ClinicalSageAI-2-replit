/**
 * Ambient shim for `@storybook/react`.
 *
 * Storybook v10 ships an exports-only package (no top-level `main`/`types`),
 * and its real type entry transitively imports `storybook/internal/*`, which is
 * likewise exports-mapped. Neither resolves under this project's classic
 * `moduleResolution: "node"` setting. This shim provides the `Meta`/`StoryObj`
 * type surface that `*.stories.tsx` authoring files consume, mirroring the
 * existing third-party shim convention (see `html2pdf.d.ts`).
 */
declare module '@storybook/react' {
  /** Metadata to configure the stories for a component. */
  export type Meta<TCmpOrArgs = unknown> = {
    title?: string;
    component?: TCmpOrArgs extends (...args: any[]) => any ? TCmpOrArgs : unknown;
    parameters?: Record<string, unknown>;
    tags?: string[];
    argTypes?: Record<string, unknown>;
    args?: Record<string, unknown>;
    decorators?: unknown[];
    [key: string]: unknown;
  };

  /** A single story definition. */
  export type StoryObj<TMetaOrCmpOrArgs = unknown> = {
    args?: Record<string, unknown>;
    argTypes?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    render?: (...args: any[]) => unknown;
    play?: (...args: any[]) => unknown | Promise<unknown>;
    name?: string;
    [key: string]: unknown;
  };
}
