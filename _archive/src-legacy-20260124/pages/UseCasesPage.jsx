import UseCaseGallery from '@/components/UseCaseGallery';

export default function UseCasesPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-4 text-gray-900">
        Who Uses LumenTrialGuide.AI—and Why It Matters
      </h1>
      <p className="text-base text-gray-600 mb-6 max-w-2xl">
        Our platform is used by leaders who carry real responsibility—scientific, ethical,
        regulatory, and financial. From biotech founders to program leads and IRBs, these are the
        people who can't afford to guess. They need evidence. Strategy. Confidence. And clarity.
        Here's how LumenTrialGuide.AI supports them.
      </p>
      <UseCaseGallery />

      <div className="mt-12 text-center">
        <p className="text-lg font-semibold mb-4">Ready to transform your clinical trial design?</p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
          Schedule a Demo
        </button>
      </div>
    </div>
  );
}
