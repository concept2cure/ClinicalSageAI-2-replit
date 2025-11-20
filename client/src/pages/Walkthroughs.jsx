import React from 'react';
import EnhancedVideoWalkthroughs from '@/components/EnhancedVideoWalkthroughs';
import { Button } from '@/components/ui/button';

export default function Walkthroughs() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <div className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center text-white mb-20">
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6">See TrialSage in Action</h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto mb-10">
            Watch detailed walkthroughs of our platform's core capabilities and discover how
            TrialSage transforms clinical development.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => (window.location.href = '/contact')}
            >
              Book a Live Demo
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-gray-600 text-white hover:bg-gray-800"
              onClick={() =>
                document.getElementById('walkthroughs').scrollIntoView({ behavior: 'smooth' })
              }
            >
              Browse Walkthroughs
            </Button>
          </div>
        </div>

        <div id="walkthroughs">
          <EnhancedVideoWalkthroughs />
        </div>

        <div className="mt-20 text-center text-white">
          <h2 className="text-3xl font-bold mb-6">Ready to Experience TrialSage?</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-10">
            Book a customized demonstration with our team and see how TrialSage can transform your
            clinical development process.
          </p>
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8"
            onClick={() => (window.location.href = '/contact')}
          >
            Request a Demo
          </Button>
        </div>
      </div>
    </div>
  );
}
