import React, { useState, useEffect } from 'react';

function DebugInfo() {
  const [isVisible, setIsVisible] = useState(false);
  const [info, setInfo] = useState({
    browserInfo: {},
    apiStatus: 'Checking...',
    wsStatus: 'Checking...',
    loadTime: 0,
    routeInfo: '',
    libraryVersions: {},
  });

  useEffect(() => {
    // Only calculate and show once the component is toggled visible
    if (!isVisible) return;

    const startTime = performance.now();

    // Browser info
    const browserInfo = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio,
    };

    // Current route info
    const routeInfo = window.location.pathname + window.location.search;

    // Load times
    const loadTime = Math.round(performance.now() - startTime);

    // Check API status
    fetch('/status/system', { method: 'GET' })
      .then(response => {
        if (response.ok) {
          return response.json().then(data => {
            setInfo(prev => ({
              ...prev,
              apiStatus: `OK - ${data.services.express} (Express)`,
            }));
          });
        } else {
          setInfo(prev => ({
            ...prev,
            apiStatus: `Error: ${response.status}`,
          }));
        }
      })
      .catch(error => {
        setInfo(prev => ({
          ...prev,
          apiStatus: `Error: ${error.message}`,
        }));
      });

    // Check WebSocket status
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const testSocket = new WebSocket(`${proto}://${location.host}/ws/qc`);

      testSocket.onopen = () => {
        setInfo(prev => ({ ...prev, wsStatus: 'Connected' }));
        testSocket.close();
      };

      testSocket.onerror = () => {
        setInfo(prev => ({ ...prev, wsStatus: 'Failed to connect' }));
      };
    } catch (err) {
      setInfo(prev => ({ ...prev, wsStatus: `Error: ${err.message}` }));
    }

    // Set collected info
    setInfo(prev => ({
      ...prev,
      browserInfo,
      routeInfo,
      loadTime,
      libraryVersions: {
        React: React.version,
      },
    }));
  }, [isVisible]);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          bottom: '10px',
          left: '10px',
          padding: '5px',
          fontSize: '12px',
          zIndex: 10000,
          opacity: 0.5,
          background: '#333',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
        }}
      >
        Debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        width: '80%',
        maxWidth: '600px',
        maxHeight: '80%',
        overflow: 'auto',
        background: 'rgba(0,0,0,0.85)',
        color: '#00ff00',
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: '15px',
        borderRadius: '5px',
        zIndex: 10000,
        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#fff' }}>TrialSage Debug Console</h3>
        <button
          onClick={() => setIsVisible(false)}
          style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer' }}
        >
          Close
        </button>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>API Status:</strong>
        <span style={{ color: info.apiStatus.startsWith('OK') ? '#00ff00' : '#ff5555' }}>
          {info.apiStatus}
        </span>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>WebSocket:</strong>
        <span style={{ color: info.wsStatus === 'Connected' ? '#00ff00' : '#ff5555' }}>
          {info.wsStatus}
        </span>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Current Route:</strong> {info.routeInfo}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Libraries:</strong>
        <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
          {Object.entries(info.libraryVersions).map(([lib, version]) => (
            <li key={lib}>
              {lib}: {version}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Browser:</strong>
        <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
          {Object.entries(info.browserInfo).map(([key, value]) => (
            <li key={key}>
              {key}: {value?.toString()}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <strong>Load Time:</strong> {info.loadTime}ms
      </div>

      <div style={{ marginTop: '15px' }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#555',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            marginRight: '10px',
          }}
        >
          Reload Page
        </button>

        <button
          onClick={() => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
          }}
          style={{
            background: '#555',
            border: 'none',
            color: 'white',
            padding: '5px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
          }}
        >
          Clear Storage & Reload
        </button>
      </div>
    </div>
  );
}

export default DebugInfo;
