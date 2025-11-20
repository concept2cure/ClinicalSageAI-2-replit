import React, { useEffect, useState } from 'react';
import axiosWithToken from '../utils/axiosWithToken';
import { FileText, Download, Eye, Diff, Loader2, ShieldCheck } from 'lucide-react';
import ReactDiffViewer from '../lightweight-wrappers.js';
import toast, { Toaster } from 'react-hot-toast';
import Layout from '../components/Layout';
import VersionsTour from '../components/VersionsTour';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '../lightweight-wrappers.js';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '../lightweight-wrappers.js';
import SortableItem from '../components/SortableItem';

// Sample data for development purposes
const sampleVersions = [
  {
    version_id: 'v1',
    drug_name: 'Etozamide',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    draft_text:
      '# Etozamide Module 3.2\n\n## 1. Drug Substance\n\nThe drug substance Etozamide is a white to off-white crystalline powder with the chemical name N-(4-ethoxyphenyl)-2-(4-methylphenoxy)acetamide.\n\n### 1.1 Nomenclature\n- Chemical Name: N-(4-ethoxyphenyl)-2-(4-methylphenoxy)acetamide\n- CAS Registry Number: 123456-78-9\n- Molecular Formula: C17H19NO3\n- Molecular Weight: 285.34 g/mol',
    version: '1.0',
  },
  {
    version_id: 'v2',
    drug_name: 'Etozamide',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    draft_text:
      '# Etozamide Module 3.2\n\n## 1. Drug Substance\n\nThe drug substance Etozamide is a white to off-white crystalline powder with the chemical name N-(4-ethoxyphenyl)-2-(4-methylphenoxy)acetamide.\n\n### 1.1 Nomenclature\n- Chemical Name: N-(4-ethoxyphenyl)-2-(4-methylphenoxy)acetamide\n- CAS Registry Number: 123456-78-9\n- Molecular Formula: C17H19NO3\n- Molecular Weight: 285.34 g/mol\n\n### 1.2 Structure\nThe chemical structure of Etozamide is represented below:\n[Structure diagram would be inserted here]\n\n### 1.3 Physicochemical Properties\n- Appearance: White to off-white crystalline powder\n- Solubility: Practically insoluble in water, freely soluble in methanol and ethanol',
    version: '1.1',
  },
  {
    version_id: 'v3',
    drug_name: 'Etozamide',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    draft_text:
      '# Etozamide Module 3.2\n\n## 1. Drug Substance\n\nThe drug substance Etozamide is a white to off-white crystalline powder with the chemical name N-(4-ethoxyphenyl)-2-(4-methylphenoxy)acetamide.\n\n### 1.1 Nomenclature\n- Chemical Name: N-(4-ethoxyphenyl)-2-(4-methylphenoxy)acetamide\n- CAS Registry Number: 123456-78-9\n- Molecular Formula: C17H19NO3\n- Molecular Weight: 285.34 g/mol\n\n### 1.2 Structure\nThe chemical structure of Etozamide is represented below:\n[Structure diagram would be inserted here]\n\n### 1.3 Physicochemical Properties\n- Appearance: White to off-white crystalline powder\n- Solubility: Practically insoluble in water, freely soluble in methanol and ethanol\n- Melting Point: 155-158°C\n- pKa: 4.2\n- Partition Coefficient (logP): 3.4\n\n## 2. Manufacturing Process\n\n### 2.1 Manufacturers\nThe drug substance is manufactured by PharmaCo, Inc. at their facility located at 123 Manufacturing Lane, Chemical City, State, Country.',
    version: '1.2',
  },
];

export default function VersionsPage() {
  const [versions, setVersions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [compare, setCompare] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    toast.dismiss();
    toast('🔒 This session is secured and auditable.', {
      icon: <ShieldCheck className="text-blue-600 w-4 h-4" />,
      position: 'top-center',
      duration: 4000,
    });

    const fetchVersions = async () => {
      try {
        // Try to get data from the API
        const res = await axiosWithToken.get('/api/versions');
        setVersions(res.data);
      } catch (err) {
        console.error('Error fetching versions:', err);

        // Fallback to sample data if API fails
        setVersions(sampleVersions);

        // Still show a toast that it's using demo data
        toast('📄 Using demo document data', {
          position: 'top-center',
          duration: 3000,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchVersions();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = versions.findIndex(v => v.version_id === active.id);
      const newIndex = versions.findIndex(v => v.version_id === over?.id);
      const reordered = arrayMove(versions, oldIndex, newIndex);
      setVersions(reordered);
      toast.success('Document order updated');
    }
  };

  const handleDownload = (type: string) => {
    toast.success(`${type.toUpperCase()} download triggered`);
  };

  return (
    <Layout>
      <Toaster position="top-center" />
      <VersionsTour />
      <div className="min-h-screen bg-white py-12 px-6 max-w-5xl mx-auto">
        <h1 id="version-header" className="text-3xl font-bold text-blue-800 mb-8">
          Document Vault View
        </h1>
        {loading ? (
          <div className="flex justify-center items-center py-20 text-blue-600">
            <Loader2 className="animate-spin w-6 h-6 mr-2" /> Loading documents...
          </div>
        ) : error ? (
          <p className="text-red-500 text-sm text-center">{error}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={versions.map(v => v.version_id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {versions.map((v, index) => (
                  <SortableItem
                    key={v.version_id}
                    id={v.version_id}
                    data={v}
                    index={index}
                    onView={() => setSelected(v)}
                    onCompare={() => setCompare({ current: v, previous: versions[index - 1] })}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {selected && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start pt-20 z-50">
            <div className="bg-white w-full max-w-4xl p-6 rounded shadow-lg relative">
              <button
                className="absolute top-4 right-4 text-gray-500 hover:text-black"
                onClick={() => setSelected(null)}
              >
                ✕
              </button>
              <h2 className="text-xl font-bold text-blue-800 mb-4">
                {selected.drug_name} – Full Module 3.2
              </h2>
              <pre className="whitespace-pre-wrap text-sm text-gray-800 max-h-[75vh] overflow-auto border p-4 rounded">
                {selected.draft_text}
              </pre>
            </div>
          </div>
        )}

        {compare && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-start pt-10 z-50">
            <div className="bg-white w-full max-w-6xl p-6 rounded shadow-xl relative">
              <button
                className="absolute top-4 right-4 text-gray-500 hover:text-black"
                onClick={() => setCompare(null)}
              >
                ✕
              </button>
              <h2 className="text-xl font-bold text-blue-800 mb-4">
                Compare: {compare.current.drug_name}
              </h2>
              <ReactDiffViewer
                oldValue={compare.previous.draft_text}
                newValue={compare.current.draft_text}
                splitView={true}
                showDiffOnly={false}
                styles={{ variables: { light: { diffViewerBackground: '#f9fafb' } } }}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
