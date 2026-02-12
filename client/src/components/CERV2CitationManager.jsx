/**
 * CERV2CitationManager — Phase 9 P3
 *
 * Manages regulatory citations / references for the submission.
 * Citation types: standard, guidance, regulation, literature, mdr
 * Auto-detects known regulatory URLs.
 * Links citations to sections.
 */
import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookOpen, Plus, X, Link2, ExternalLink, Tag } from 'lucide-react';

const CITATION_TYPES = [
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  {
    value: 'guidance',
    label: 'Guidance',
    color: 'bg-purple-100 text-purple-700 border-purple-300',
  },
  { value: 'regulation', label: 'Regulation', color: 'bg-red-100 text-red-700 border-red-300' },
  {
    value: 'literature',
    label: 'Literature',
    color: 'bg-green-100 text-green-700 border-green-300',
  },
  { value: 'mdr', label: 'MDR/EU', color: 'bg-amber-100 text-amber-700 border-amber-300' },
];

/** Well-known regulatory standard URL patterns */
const STANDARD_URLS = {
  'iec 60601': 'https://www.iso.org/standard/65529.html',
  'iso 10993': 'https://www.iso.org/standard/68936.html',
  'iso 13485': 'https://www.iso.org/standard/59752.html',
  'iso 14971': 'https://www.iso.org/standard/72704.html',
  'iso 14155': 'https://www.iso.org/standard/71690.html',
  'iec 62304': 'https://www.iso.org/standard/38421.html',
  'iec 62366': 'https://www.iso.org/standard/63179.html',
  '21 cfr 820': 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820',
  'mdr 2017/745': 'https://eur-lex.europa.eu/eli/reg/2017/745/oj',
  'meddev 2.7/1': 'https://ec.europa.eu/docsroom/documents/17522/',
};

function autoDetectUrl(title) {
  const lower = title.toLowerCase();
  for (const [key, url] of Object.entries(STANDARD_URLS)) {
    if (lower.includes(key)) return url;
  }
  return '';
}

function getTypeConfig(type) {
  return CITATION_TYPES.find(t => t.value === type) || CITATION_TYPES[0];
}

let nextId = 1;

/**
 * Props:
 *   citations — [{ id, title, type, url, sections }]
 *   onCitationsChange — update citations array
 *   outline — for section linking
 *   activeSectionId
 *   visible / onToggle
 */
export default function CERV2CitationManager({
  citations,
  onCitationsChange,
  outline,
  activeSectionId,
  visible,
  onToggle,
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('standard');
  const [newUrl, setNewUrl] = useState('');

  const handleAdd = useCallback(() => {
    if (!newTitle.trim()) return;
    const url = newUrl.trim() || autoDetectUrl(newTitle);
    const citation = {
      id: `cit_${nextId++}`,
      title: newTitle.trim(),
      type: newType,
      url,
      sections: activeSectionId ? [activeSectionId] : [],
    };
    onCitationsChange([...citations, citation]);
    setNewTitle('');
    setNewUrl('');
    setAdding(false);
  }, [newTitle, newType, newUrl, activeSectionId, citations, onCitationsChange]);

  const removeCitation = id => {
    onCitationsChange(citations.filter(c => c.id !== id));
  };

  const toggleSectionLink = (citId, sectionId) => {
    onCitationsChange(
      citations.map(c => {
        if (c.id !== citId) return c;
        const sections = c.sections.includes(sectionId)
          ? c.sections.filter(s => s !== sectionId)
          : [...c.sections, sectionId];
        return { ...c, sections };
      })
    );
  };

  const sectionCitations = citations.filter(c => c.sections.includes(activeSectionId));

  // Collapsed
  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-slate-50 transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-slate-700">Citations</span>
        {citations.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {citations.length}
          </Badge>
        )}
      </button>
    );
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-slate-600" />
          <span className="font-semibold text-sm text-slate-800">Citations & References</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {citations.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="h-7 text-xs gap-1"
            disabled={adding}
          >
            <Plus className="w-3 h-3" /> Add
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 px-2 text-xs">
            Close
          </Button>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="p-3 border-b bg-blue-50/50 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-[10px] text-slate-500">Title / Reference</Label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="e.g. IEC 60601-1:2005+A1:2012"
                className="h-7 text-xs mt-0.5"
                autoFocus
              />
            </div>
            <div className="w-28">
              <Label className="text-[10px] text-slate-500">Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-7 text-xs mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CITATION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-slate-500">
              URL (optional — auto-detected for known standards)
            </Label>
            <Input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://..."
              className="h-7 text-xs mt-0.5"
            />
          </div>
          <div className="flex gap-1.5 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdding(false)}
              className="h-6 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newTitle.trim()}
              className="h-6 text-xs"
            >
              Add Citation
            </Button>
          </div>
        </div>
      )}

      {/* Active section citations */}
      {activeSectionId && sectionCitations.length > 0 && (
        <div className="px-3 py-2 border-b bg-slate-50/50">
          <p className="text-[10px] text-slate-500 mb-1">
            Linked to current section ({sectionCitations.length}):
          </p>
          <div className="flex flex-wrap gap-1">
            {sectionCitations.map(c => {
              const cfg = getTypeConfig(c.type);
              return (
                <Badge key={c.id} className={`text-[9px] px-1.5 py-0 ${cfg.color}`}>
                  {c.title.length > 30 ? c.title.slice(0, 30) + '...' : c.title}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* All citations */}
      <ScrollArea className="max-h-48">
        <div className="p-2 space-y-1">
          {citations.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No citations added yet.</p>
          )}

          {citations.map(c => {
            const cfg = getTypeConfig(c.type);
            const isLinked = c.sections.includes(activeSectionId);
            return (
              <div
                key={c.id}
                className="border rounded-md p-2 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[9px] px-1 py-0 ${cfg.color}`}>{cfg.label}</Badge>
                      <p className="text-xs font-medium text-slate-700 truncate">{c.title}</p>
                    </div>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5 mt-0.5"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        {c.url.length > 50 ? c.url.slice(0, 50) + '...' : c.url}
                      </a>
                    )}
                    {c.sections.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Link2 className="w-2.5 h-2.5 text-slate-400" />
                        <span className="text-[10px] text-slate-400">
                          {c.sections.length} section{c.sections.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {activeSectionId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-1.5 text-[10px] ${isLinked ? 'text-blue-600' : 'text-slate-400'}`}
                        onClick={() => toggleSectionLink(c.id, activeSectionId)}
                        title={isLinked ? 'Unlink from section' : 'Link to section'}
                      >
                        <Link2 className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-red-400 hover:text-red-600"
                      onClick={() => removeCitation(c.id)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
