import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../lib/database';
import { eventBus } from '../ui/ToastSystem';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import {
  FileText,
  Upload,
  Search,
  Folder,
  File,
  Wand2,
  Plus,
  ExternalLink,
} from 'lucide-react';

function extFromName(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.csv')) return 'csv';
  return 'bin';
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function VaultDocumentBrowser({
  tenantId: tenantIdProp,
  onSelectFile,
  onFileAction,
  onOpenDoc,
  compact = false,
}) {
  const tenantId = tenantIdProp || 'org_acme';
  const [activeTab, setActiveTab] = useState('vault');
  const [vaultFiles, setVaultFiles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [lastSeedStatus, setLastSeedStatus] = useState(null);

  const fileInputRef = useRef(null);

  const refreshVault = useCallback(async () => {
    try {
      const rows = await db.getVaultFiles(tenantId);
      setVaultFiles(rows);
    } catch {
      setVaultFiles([]);
    }
  }, [tenantId]);

  const refreshTemplates = useCallback(async () => {
    try {
      const rows = await db.getSmartTemplates(tenantId, { search: templateSearch });
      setTemplates(rows);
    } catch {
      setTemplates([]);
    }
  }, [tenantId, templateSearch]);

  useEffect(() => {
    refreshVault();
  }, [refreshVault]);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  const filteredVaultFiles = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return vaultFiles;
    return vaultFiles.filter((f) => {
      return (
        String(f.name || '').toLowerCase().includes(q) ||
        String(f.folder || '').toLowerCase().includes(q) ||
        String(f.path || '').toLowerCase().includes(q)
      );
    });
  }, [vaultFiles, search]);

  const toast = useCallback((title, message, variant = 'default') => {
    eventBus.emit({
      type: 'SHOW_TOAST',
      payload: {
        title,
        message,
        variant: variant === 'danger' ? 'danger' : 'default',
      },
    });
  }, []);

  const seedDemo = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await db.seedDemoWorkspace(tenantId);
      setLastSeedStatus(result);
      await Promise.all([refreshVault(), refreshTemplates()]);
      toast(
        result?.alreadySeeded ? 'Demo workspace already seeded' : 'Demo workspace seeded',
        'Projects + VAULT + 250 Smart Templates are ready to use.'
      );
    } catch (e) {
      toast('Failed to seed demo workspace', String(e?.message || e), 'danger');
    } finally {
      setIsBusy(false);
    }
  }, [refreshTemplates, refreshVault, tenantId, toast]);

  const ingestFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []).filter(Boolean);
      if (!files.length) return;

      setIsBusy(true);
      try {
        for (const f of files) {
          const type = extFromName(f.name);
          const vaultId = `vault-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          let preview;
          let linkedDoc;

          if (type === 'docx') {
            const mammothMod = await import('mammoth');
            const mammoth = mammothMod?.default || mammothMod;
            const arrayBuffer = await f.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer });
            const html = String(result?.value || '');
            const text = stripHtml(html);
            preview = { kind: 'html', value: html.slice(0, 75000) };
            linkedDoc = await db.createDocumentFromUpload({
              tenantId,
              title: f.name.replace(/\.docx$/i, ''),
              content: text.slice(0, 120000),
              html: html.slice(0, 200000),
              sourceVaultFileId: vaultId,
            });
          } else if (type === 'xlsx') {
            const XLSX = await import('xlsx');
            const arrayBuffer = await f.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const first = workbook.SheetNames?.[0];
            const sheet = first ? workbook.Sheets[first] : null;
            const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1 }) : [];
            const previewRows = Array.isArray(rows) ? rows.slice(0, 30) : [];
            preview = { kind: 'json', value: JSON.stringify({ sheet: first, rows: previewRows }, null, 2) };
            linkedDoc = await db.createDocumentFromUpload({
              tenantId,
              title: f.name.replace(/\.(xlsx|xls)$/i, ''),
              content:
                `Spreadsheet preview (first sheet: ${first || '—'})\n\n${previewRows
                  .map((r) => (Array.isArray(r) ? r.join('\t') : String(r)))
                  .join('\n')}`.slice(0, 120000),
              sourceVaultFileId: vaultId,
            });
          } else if (type === 'pdf') {
            preview = { kind: 'text', value: 'PDF uploaded (preview/extraction not yet enabled in this demo build).' };
          }

          const record = await db.addVaultFile(
            {
              id: vaultId,
              name: f.name,
              type,
              folder: 'Uploads',
              section: 'module1',
              path: `/Uploads/${f.name}`,
              sizeBytes: f.size,
              uploadedAt: new Date().toISOString(),
              source: 'upload',
              preview,
              linkedDocId: linkedDoc?.id,
            },
            tenantId
          );

          // Compatibility with the existing VaultBrowser page behavior
          if (onSelectFile) onSelectFile(record);

          if (linkedDoc?.id && onOpenDoc) {
            onOpenDoc(linkedDoc.id);
          }
        }

        await Promise.all([refreshVault(), refreshTemplates()]);
        toast('Upload complete', 'Files are now available in VAULT and can be opened as drafts.');
      } catch (e) {
        toast('Upload failed', String(e?.message || e), 'danger');
      } finally {
        setIsBusy(false);
      }
    },
    [onOpenDoc, onSelectFile, refreshTemplates, refreshVault, tenantId, toast]
  );

  const handleUseTemplate = useCallback(
    async (template) => {
      if (!template) return;
      setIsBusy(true);
      try {
        const doc = await db.createDocumentFromUpload({
          tenantId,
          title: template.name,
          content:
            `TEMPLATE: ${template.name}\nMODULE: ${template.module}\n\nStart writing here. Drag SmartTags from the Data Room to insert traceable tokens.`,
        });

        toast('Draft created', `Created a draft from ${template.module}.`);
        if (onOpenDoc) onOpenDoc(doc.id);
      } catch (e) {
        toast('Failed to create from template', String(e?.message || e), 'danger');
      } finally {
        setIsBusy(false);
      }
    },
    [onOpenDoc, tenantId, toast]
  );

  const headerClass = compact ? 'p-3' : 'p-4';

  return (
    <div className={compact ? 'h-full w-full' : 'p-4'}>
      <Card className="h-full">
        <CardHeader className={headerClass}>
          <CardTitle className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <Folder className="h-5 w-5" />
              VAULT + Intake
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={seedDemo} disabled={isBusy}>
                <Wand2 className="h-4 w-4 mr-2" />
                Seed Demo
              </Button>
              {!compact && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open('/ectd-co-author', '_self')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Co-Author
                </Button>
              )}
            </div>
          </CardTitle>
          {lastSeedStatus && !compact && (
            <div className="text-xs text-gray-500">
              {lastSeedStatus.alreadySeeded
                ? 'Demo data already existed for this tenant.'
                : 'Demo data created for this tenant.'}
            </div>
          )}
        </CardHeader>
        <CardContent className={compact ? 'p-3 pt-0' : 'p-4 pt-0'}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="vault">Vault</TabsTrigger>
              <TabsTrigger value="uploads">Upload</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>

            <TabsContent value="vault" className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search VAULT..."
                    className="pl-8"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={refreshVault} disabled={isBusy}>
                  Refresh
                </Button>
              </div>

              <div className={compact ? 'max-h-[420px] overflow-auto' : 'max-h-[520px] overflow-auto'}>
                {filteredVaultFiles.length === 0 ? (
                  <div className="text-sm text-gray-500 p-3 border rounded">
                    No files yet. Use the Upload tab or click Seed Demo.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredVaultFiles.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-start justify-between gap-3 p-3 border rounded hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <File className="h-4 w-4 text-gray-500" />
                            <div className="font-medium text-sm truncate">{f.name}</div>
                            <Badge variant="outline" className="text-[10px]">
                              {String(f.type || '').toUpperCase()}
                            </Badge>
                            {f.linkedDocId && (
                              <Badge variant="secondary" className="text-[10px]">
                                Draft Ready
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 truncate">
                            {f.path || f.folder} · {formatBytes(f.sizeBytes)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onSelectFile?.(f)}
                          >
                            Select
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onFileAction?.('send-to-coauthor', f)}
                          >
                            Send
                          </Button>
                          {f.linkedDocId && onOpenDoc && (
                            <Button size="sm" onClick={() => onOpenDoc(f.linkedDocId)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Open Draft
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="uploads" className="space-y-3">
              <div className="border rounded p-3 bg-gray-50">
                <div className="text-sm font-medium">Upload PDF / Word / Excel</div>
                <div className="text-xs text-gray-600 mt-1">
                  DOCX/XLSX are converted into an editable draft document. PDFs are stored as a VAULT record.
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => ingestFiles(e.target.files)}
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    className="inline-flex items-center"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose Files
                  </Button>
                  <Button size="sm" variant="outline" onClick={refreshVault} disabled={isBusy}>
                    Refresh
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="templates" className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search Smart Templates..."
                    className="pl-8"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={refreshTemplates} disabled={isBusy}>
                  Refresh
                </Button>
              </div>

              <div className={compact ? 'max-h-[420px] overflow-auto' : 'max-h-[520px] overflow-auto'}>
                {templates.length === 0 ? (
                  <div className="text-sm text-gray-500 p-3 border rounded">
                    No templates yet. Click Seed Demo to generate hundreds of Smart Templates.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.slice(0, compact ? 60 : 120).map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-3 p-3 border rounded">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{t.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            <Badge variant="outline" className="text-[10px] mr-2">
                              {t.category}
                            </Badge>
                            <span className="font-mono text-[11px]">{t.module}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => handleUseTemplate(t)} disabled={isBusy}>
                            <Plus className="h-4 w-4 mr-2" />
                            Use
                          </Button>
                        </div>
                      </div>
                    ))}
                    {templates.length > (compact ? 60 : 120) && (
                      <div className="text-xs text-gray-500">
                        Showing {compact ? 60 : 120} of {templates.length}. Refine search to narrow.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
