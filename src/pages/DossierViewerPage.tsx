import DossierViewer from '@/components/dossier/DossierViewer';

export default function DossierViewerPage() {
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Protocol Intelligence Dossier</h1>
      <p className="text-muted-foreground mb-8">
        Access and manage your saved protocol intelligence reports, historical data, and analysis
        insights.
      </p>

      <DossierViewer />
    </div>
  );
}
