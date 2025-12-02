import React, { useState } from 'react';

export default function AppStub() {
  const [currentView, setCurrentView] = useState('landing');
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 rounded shadow bg-white">
        <h1 className="text-2xl font-bold mb-2">CANDEL Overtime App — Dev Stub</h1>
        <p className="text-sm text-gray-600">Dev stub component to allow the app to compile while we fix App.jsx.</p>
        <div className="mt-4">
          <button onClick={() => setCurrentView('landing')} className="px-3 py-2 bg-blue-600 text-white rounded mr-2">Landing</button>
          <button onClick={() => setCurrentView('admin')} className="px-3 py-2 bg-gray-200 rounded">Admin</button>
        </div>
        <div className="mt-4 text-sm text-gray-700">Current view: {currentView}</div>
      </div>
    </div>
  );
}
