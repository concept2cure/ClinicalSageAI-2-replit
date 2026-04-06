import React, { useEffect } from 'react';

const NotFound = () => {
 // Automatically redirect to dashboard when this component loads
 useEffect(() => {
 // Use window.location.href for immediate redirection
 window.location.href = '/dashboard';
 }, []);

 return (
 <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white">
 <div className="max-w-lg flex flex-col items-center text-center">
 <div className="w-16 h-16 border-4 border-pink-600 border-t-transparent rounded-full animate-spin mb-8"></div>
 <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">Redirecting...</h2>
 <p className="mt-6 text-base leading-7 text-gray-600">Taking you to the dashboard...</p>
 </div>
 </div>
 );
};

export default NotFound;
