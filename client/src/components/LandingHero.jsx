import React from 'react';
import { Link } from 'wouter';

const LandingHero = () => {
  return (
    <div className="relative bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Concept2Cure<span className="text-blue-600">.AI</span> Enterprise Portal
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            AI-powered regulatory document management for clinical research professionals
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/client-portal">
              <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md font-medium transition-colors duration-150">
                Enter Client Portal
              </button>
            </Link>
            <Link to="/dashboard">
              <button className="px-8 py-3 bg-white hover:bg-gray-100 text-blue-600 border border-blue-600 rounded-lg shadow-sm font-medium transition-colors duration-150">
                View Dashboard
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingHero;
