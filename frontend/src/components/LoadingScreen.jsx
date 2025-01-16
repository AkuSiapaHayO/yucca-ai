import React from 'react';

const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="flex flex-col items-center">
        {/* Add your Yucca logo or any other image */}
        <img 
          src="/assets/yucca-logo.png" 
          alt="Yucca AI" 
          className="w-32 h-32 mb-4"
        />
        {/* Loading spinner */}
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        {/* Loading text */}
        <p className="mt-4 text-lg text-gray-600">Loading Yucca AI...</p>
      </div>
    </div>
  );
};

export default LoadingScreen;