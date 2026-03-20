/**
 * Client Branding & Template Settings — Account-level customization
 *
 * Allows organizations to configure:
 *   - Company logo upload (used in all generated documents)
 *   - Letterhead template (PDF headers/footers)
 *   - Brand colors and typography
 *   - Custom document templates for eCTD CoAuthor, Report Canvas, AnA
 *   - Template placeholder management
 *
 * @module concept2cure/components/settings/ClientBrandingSettings
 */

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  Upload,
  Image,
  FileText,
  Palette,
  Plus,
  Trash2,
  Edit3,
  Copy,
  CheckCircle2,
  Eye,
  Save,
  X,
  Loader2,
  Building2,
  Type,
  Paintbrush,
  Layout,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface BrandingSettings {
  organizationId: number;
  companyName: string;
  logoUrl: string | null;
  letterheadUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  headerHtml: string | null;
  footerHtml: string | null;
  watermarkText: string | null;
}

interface ClientTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  fileType: string;
  content: string | null;
  placeholders: Record<string, string>;
  isActive: boolean;
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

type SettingsTab = 'branding' | 'templates' | 'letterhead';

const CATEGORY_LABELS: Record<string, string> = {
  cover_letter: 'Cover Letter',
  csr_section: 'CSR Section',
  protocol: 'Protocol',
  ib: 'Investigator Brochure',
  clinical_overview: 'Clinical Overview',
  submission_letter: 'Submission Letter',
  regulatory_correspondence: 'Regulatory Correspondence',
  custom: 'Custom',
};

// ── Component ────────────────────────────────────────────────────────────────

const ClientBrandingSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>('branding');
  const [editingTemplate, setEditingTemplate] = useState<ClientTemplate | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Fetch branding settings
  const { data: branding, isLoading: brandingLoading } = useQuery<BrandingSettings>({
    queryKey: ['client-branding'],
    queryFn: async () => {
      const res = await fetch('/api/client-branding/settings');
      if (!res.ok) throw new Error('Failed to fetch branding');
      return res.json();
    },
  });

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<ClientTemplate[]>({
    queryKey: ['client-templates'],
    queryFn: async () => {
      const res = await fetch('/api/client-branding/templates');
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Update branding
  const updateBranding = useMutation({
    mutationFn: async (data: Partial<BrandingSettings>) => {
      const res = await fetch('/api/client-branding/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-branding'] }),
  });

  // Upload logo
  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await fetch('/api/client-branding/upload-logo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                logoBase64: reader.result,
                fileName: file.name,
              }),
            });
            if (!res.ok) throw new Error('Upload failed');
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-branding'] }),
  });

  // Create template
  const createTemplate = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/client-branding/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-templates'] });
      setShowNewTemplate(false);
    },
  });

  // Delete template
  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/client-branding/templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-templates'] }),
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadLogo.mutate(file);
  };

  const tabs: { key: SettingsTab; label: string; icon: React.ElementType }[] = [
    { key: 'branding', label: 'Brand Identity', icon: Palette },
    { key: 'templates', label: 'Document Templates', icon: FileText },
    { key: 'letterhead', label: 'Letterhead & Headers', icon: Layout },
  ];

  if (brandingLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Building2 className="w-5 h-5 text-blue-500" />
          <h1 className="text-base font-semibold text-zinc-900">Brand & Template Settings</h1>
        </div>
        <p className="text-xs text-zinc-500">
          Configure your organization's branding, document templates, and letterhead for use across all generated documents.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex items-center gap-4">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 pb-2 text-xs font-medium border-b-2 transition-colors',
                  activeTab === t.key
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-400 hover:text-zinc-600',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Brand Identity Tab ── */}
      {activeTab === 'branding' && branding && (
        <div className="space-y-6">
          {/* Logo upload */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
              <Image className="w-4 h-4 text-blue-500" />
              Company Logo
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-zinc-200 flex items-center justify-center bg-zinc-50 overflow-hidden">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <Upload className="w-6 h-6 text-zinc-300" />
                )}
              </div>
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadLogo.isPending}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadLogo.isPending ? 'Uploading...' : branding.logoUrl ? 'Replace Logo' : 'Upload Logo'}
                </button>
                <p className="text-[10px] text-zinc-400 mt-1">PNG, JPEG, or SVG. Max 2MB. Used in all generated documents.</p>
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
              <Paintbrush className="w-4 h-4 text-violet-500" />
              Brand Colors
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: 'primaryColor', label: 'Primary' },
                { key: 'secondaryColor', label: 'Secondary' },
                { key: 'accentColor', label: 'Accent' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">{label}</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={(branding as Record<string, string>)[key] || '#1e40af'}
                      onChange={e => updateBranding.mutate({ [key]: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={(branding as Record<string, string>)[key] || ''}
                      onChange={e => updateBranding.mutate({ [key]: e.target.value })}
                      className="flex-1 text-xs px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
              <Type className="w-4 h-4 text-emerald-500" />
              Typography
            </h3>
            <div>
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Font Family</label>
              <select
                value={branding.fontFamily}
                onChange={e => updateBranding.mutate({ fontFamily: e.target.value })}
                className="w-full mt-1 text-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="Inter, sans-serif">Inter (Default)</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="'Calibri', sans-serif">Calibri</option>
                <option value="'Georgia', serif">Georgia</option>
                <option value="'Helvetica Neue', sans-serif">Helvetica Neue</option>
              </select>
            </div>
          </div>

          {/* Watermark */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Watermark</h3>
            <input
              type="text"
              value={branding.watermarkText || ''}
              onChange={e => updateBranding.mutate({ watermarkText: e.target.value || null })}
              placeholder="e.g., CONFIDENTIAL, DRAFT, COMPANY PROPRIETARY"
              className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <p className="text-[10px] text-zinc-400 mt-1">Applied as a diagonal watermark on all exported PDFs.</p>
          </div>
        </div>
      )}

      {/* ── Templates Tab ── */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Custom templates used by AnA, eCTD CoAuthor, and the Document Editor when generating or exporting documents.
            </p>
            <button
              onClick={() => setShowNewTemplate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
              New Template
            </button>
          </div>

          {/* Template list */}
          <div className="space-y-2">
            {templates.map(tmpl => (
              <div key={tmpl.id} className="bg-white rounded-xl border p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-zinc-800">{tmpl.name}</h4>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
                      {CATEGORY_LABELS[tmpl.category] || tmpl.category}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                      {tmpl.fileType.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{tmpl.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-400">
                    <span>Used {tmpl.usageCount} times</span>
                    <span>&middot;</span>
                    <span>{Object.keys(tmpl.placeholders).length} placeholders</span>
                    <span>&middot;</span>
                    <span>Updated {new Date(tmpl.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingTemplate(tmpl)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
                    title="Edit"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTemplate.mutate(tmpl.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {templates.length === 0 && !templatesLoading && (
              <div className="text-center py-8 bg-white rounded-xl border">
                <FileText className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
                <p className="text-xs text-zinc-500">No custom templates yet</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Create templates that match your organization's document standards.</p>
              </div>
            )}
          </div>

          {/* New template form */}
          {showNewTemplate && (
            <NewTemplateForm
              onCreate={(data) => createTemplate.mutate(data)}
              onCancel={() => setShowNewTemplate(false)}
              isPending={createTemplate.isPending}
            />
          )}
        </div>
      )}

      {/* ── Letterhead Tab ── */}
      {activeTab === 'letterhead' && branding && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
              <Layout className="w-4 h-4 text-blue-500" />
              Document Header
            </h3>
            <p className="text-xs text-zinc-500 mb-3">
              Custom HTML for document headers. Uses your brand colors and logo automatically.
              Available variables: {'{{companyName}}'}, {'{{logoUrl}}'}, {'{{primaryColor}}'}, {'{{date}}'}.
            </p>
            <textarea
              value={branding.headerHtml || ''}
              onChange={e => updateBranding.mutate({ headerHtml: e.target.value || null })}
              placeholder="<div>Custom header HTML...</div>"
              rows={4}
              className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none font-mono"
            />
          </div>

          <div className="bg-white rounded-xl border p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Document Footer</h3>
            <p className="text-xs text-zinc-500 mb-3">
              Custom HTML for document footers. Common uses: page numbers, confidentiality notices, company info.
            </p>
            <textarea
              value={branding.footerHtml || ''}
              onChange={e => updateBranding.mutate({ footerHtml: e.target.value || null })}
              placeholder="<div>{{companyName}} — Confidential | Page {{pageNumber}}</div>"
              rows={3}
              className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none font-mono"
            />
          </div>

          {/* Preview */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-5 py-3 border-b bg-zinc-50/50 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-700">Preview</span>
            </div>
            <div className="p-6" style={{ fontFamily: branding.fontFamily }}>
              {/* Header preview */}
              <div className="border-b-2 pb-3 mb-4" style={{ borderColor: branding.primaryColor }}>
                <div className="flex items-center gap-3">
                  {branding.logoUrl && (
                    <img src={branding.logoUrl} alt="Logo" className="h-8" />
                  )}
                  <div>
                    <div className="text-sm font-bold" style={{ color: branding.primaryColor }}>
                      {branding.companyName}
                    </div>
                    <div className="text-[10px] text-zinc-400">123 Biotech Parkway, Cambridge, MA</div>
                  </div>
                </div>
              </div>
              {/* Body preview */}
              <div className="space-y-2 text-xs text-zinc-600 mb-8">
                <p>March 20, 2026</p>
                <p>Subject: IND Application — ProductName (Indication)</p>
                <p className="text-zinc-400 italic">[ Document body content will appear here ]</p>
              </div>
              {/* Footer preview */}
              <div className="border-t pt-2 text-[9px] text-zinc-400 flex justify-between">
                <span>{branding.companyName} — Confidential</span>
                <span>Page 1 of 1</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── New Template Form ────────────────────────────────────────────────────────

function NewTemplateForm({
  onCreate,
  onCancel,
  isPending,
}: {
  onCreate: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');
  const [content, setContent] = useState('');

  return (
    <div className="bg-white rounded-xl border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-800">New Template</h4>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-zinc-500 uppercase">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., FDA Cover Letter"
            className="w-full mt-1 text-xs px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-zinc-500 uppercase">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full mt-1 text-xs px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] font-medium text-zinc-500 uppercase">Description</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Brief description of this template"
          className="w-full mt-1 text-xs px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="text-[10px] font-medium text-zinc-500 uppercase">Template Content (HTML)</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="<div>Your template HTML with {{placeholders}}...</div>"
          rows={6}
          className="w-full mt-1 text-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none font-mono"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onCreate({ name, description, category, content, fileType: 'html' })}
          disabled={!name.trim() || isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          Create Template
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default ClientBrandingSettings;
