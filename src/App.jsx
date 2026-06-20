import React, { useState } from 'react';
import Header      from './components/Header.jsx';
import MapView     from './components/MapView.jsx';
import LocatePanel from './components/LocatePanel.jsx';
import RoutePanel  from './components/RoutePanel.jsx';

export default function App() {
  const [activeTab,       setActiveTab]       = useState('locate');
  const [userLocation,    setUserLocation]    = useState(null);
  const [routes,          setRoutes]          = useState(null);
  const [srcCoords,       setSrcCoords]       = useState(null);
  const [dstCoords,       setDstCoords]       = useState(null);
  const [activeRoute,     setActiveRoute]     = useState(0);
  const [highlightedStep, setHighlightedStep] = useState(null);
  const [locateTrigger,   setLocateTrigger]   = useState(0); // increments to trigger auto-locate

  // Navigation mode state
  const [navMode,  setNavMode]  = useState(false);
  const [navRoute, setNavRoute] = useState(null);
  const [srcName,  setSrcName]  = useState('');
  const [dstName,  setDstName]  = useState('');

  function handleLocationFound(data) { setUserLocation(data); }

  function handleRoutesFound(routeData, src, dst, activeIdx) {
    if (routeData) setRoutes(routeData);
    if (src)       { setSrcCoords(src); setSrcName(src.name || ''); }
    if (dst)       { setDstCoords(dst); setDstName(dst.name || ''); }
    if (activeIdx !== undefined) setActiveRoute(activeIdx);
  }

  // Called when the floating map button is clicked
  function handleQuickLocate() {
    setActiveTab('locate');
    setLocateTrigger(prev => prev + 1); // bump trigger so LocatePanel auto-fires
  }

  function handleStepClick(coord) { setHighlightedStep(coord); }

  function handleStartNav(routeIdx) {
    if (!routes || !srcCoords || !dstCoords) return;
    setActiveRoute(routeIdx);
    setNavRoute(routes[routeIdx]);
    setNavMode(true);
  }

  function handleSwitchNavRoute(routeIdx) {
    setActiveRoute(routeIdx);
    setNavRoute(routes[routeIdx]);
    setHighlightedStep(null);
  }

  function handleExitNav() {
    setNavMode(false);
    setNavRoute(null);
  }

  return (
    <>
      {!navMode && <Header />}
      <div className={`layout ${navMode ? 'layout-nav' : ''}`}>
        {!navMode && (
          <div className="sidebar">
            <div className="tabs">
              <button className={`tab ${activeTab === 'locate' ? 'active' : ''}`} onClick={() => setActiveTab('locate')}>
                📍 Locate Me
              </button>
              <button className={`tab ${activeTab === 'routes' ? 'active' : ''}`} onClick={() => setActiveTab('routes')}>
                🗺️ Route Planner
              </button>
            </div>
            {activeTab === 'locate' && (
              <div className="panel">
                <LocatePanel onLocationFound={handleLocationFound} triggerLocate={locateTrigger} />
              </div>
            )}
            {activeTab === 'routes' && (
              <div className="panel">
                <RoutePanel onRoutesFound={handleRoutesFound} onStepClick={handleStepClick} onStartNav={handleStartNav} />
              </div>
            )}
            <div className="sidebar-footer">
              ⚠️ Prototype · Safety data is simulated for demo &nbsp;|&nbsp; Built for Bharat 🇮🇳
            </div>
          </div>
        )}
        <MapView
          userLocation={userLocation}
          routes={routes}
          srcCoords={srcCoords}
          dstCoords={dstCoords}
          activeRoute={activeRoute}
          highlightedStep={highlightedStep}
          navMode={navMode}
          navRoute={navRoute}
          navSrc={srcCoords}
          navDst={dstCoords}
          srcName={srcName}
          dstName={dstName}
          onExitNav={handleExitNav}
          onSwitchNavRoute={handleSwitchNavRoute}
          onQuickLocate={handleQuickLocate}
        />
      </div>
    </>
  );
}
