// Compatibility shim for lucide-react missing icon exports
import * as icons from './node_modules/lucide-react/dist/esm/lucide-react.js';

export * from './node_modules/lucide-react/dist/esm/lucide-react.js';

// Provide fallbacks for icons that some lucide versions don't export
export const FilePdf = icons.File || icons.FileIcon || (() => null);
export const FilePresentation = icons.File || icons.FileIcon || (() => null);
// Lucide v0.4xx uses PanelLeft/PanelLeftClose; older builds used Sidebar variants.
export const LayoutSidebarClose =
	icons.PanelLeftClose || icons.SidebarClose || icons.PanelLeft || icons.Sidebar || (() => null);
export const LayoutSidebar = icons.PanelLeft || icons.Sidebar || icons.Layout || (() => null);
export const LayoutSidebarIcon = icons.PanelLeft || icons.Sidebar || icons.Layout || (() => null);
