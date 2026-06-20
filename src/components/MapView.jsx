import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { haversine } from '../utils/haversine.js';
import { getAllModeEstimates, formatDuration, calculateETA } from '../utils/travelModes.js';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILES  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

function makeIcon(emoji, bg) {
  return L.divIcon({
    html: `<div style="background:${bg};width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid white">${emoji}</div>`,
    className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -20],
  });
}

function makeNavPin() {
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:#EA4335;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(234,67,53,.6);border:3px solid white"><div style="width:10px;height:10px;background:white;border-radius:50%;transform:rotate(45deg)"></div></div></div>`,
    className: '', iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -42],
  });
}

function makeBlueLocation() {
  return L.divIcon({
    html: `<div style="position:relative;width:22px;height:22px"><div style="position:absolute;inset:0;background:rgba(66,133,244,0.25);border-radius:50%;animation:locPulse 2s infinite"></div><div style="position:absolute;top:4px;left:4px;width:14px;height:14px;background:#4285F4;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(66,133,244,.6)"></div></div>`,
    className: '', iconSize: [22, 22], iconAnchor: [11, 11],
  });
}

function makeNavVehicleIcon(angle) {
  return L.divIcon({
    html: `
      <div style="position:relative;width:36px;height:36px;transform:rotate(${angle}deg);transition:transform 0.2s linear;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;background:rgba(66,133,244,0.3);border-radius:50%;animation:locPulse 1.5s infinite"></div>
        <svg viewBox="0 0 24 24" width="28" height="28" style="filter:drop-shadow(0px 2px 4px rgba(0,0,0,0.5))">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#4285F4" stroke="white" stroke-width="1.8" />
        </svg>
      </div>
    `,
    className: '', iconSize: [36, 36], iconAnchor: [18, 18],
  });
}

function renderTurnIcon(icon) {
  switch (icon) {
    case '⬅️':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      );
    case '➡️':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
        </svg>
      );
    case '⬆️':
    case '🚗':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
        </svg>
      );
    case '↗️':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style={{ transform: 'rotate(45deg)' }}>
          <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
        </svg>
      );
    case '↖️':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style={{ transform: 'rotate(-45deg)' }}>
          <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z" />
        </svg>
      );
    case '🏁':
      return (
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z" />
        </svg>
      );
    default:
      return <span>🧭</span>;
  }
}

export default function MapView({
  userLocation, routes, srcCoords, dstCoords, activeRoute,
  highlightedStep, navMode, navRoute, navSrc, navDst, srcName, dstName, onExitNav, onSwitchNavRoute, onQuickLocate
}) {
  const mapRef      = useRef(null);
  const mapInst     = useRef(null);
  const tileRef     = useRef(null);
  const routeLines  = useRef([]);
  const userMarker  = useRef(null);
  const srcMarker   = useRef(null);
  const dstMarker   = useRef(null);
  const stepMarker  = useRef(null);
  const navLayers   = useRef([]);
  const vehicleMarker = useRef(null);
  const isDark      = useRef(false);
  const thanaMarker   = useRef(null);

  // Navigation Simulator State
  const [navStepIdx, setNavStepIdx]     = useState(0);
  const [simulating, setSimulating]     = useState(false);
  const [simCoordIdx, setSimCoordIdx]   = useState(0);
  const [voiceMuted, setVoiceMuted]     = useState(false);
  const [simSpeed, setSimSpeed]         = useState(1); // 1x, 2x, 4x
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  const [modeEstimates, setModeEstimates] = useState(null);
  const [activeMode, setActiveMode] = useState('car');

  useEffect(() => {
    if (!srcCoords || !dstCoords || !navRoute) return;
    async function loadEstimates() {
      const carRouteData = {
        coords: navRoute.coords,
        distanceKm: parseFloat(navRoute.dist),
        durationMin: parseInt(navRoute.time),
      };
      const estimates = await getAllModeEstimates(
        srcCoords.lat, srcCoords.lng, dstCoords.lat, dstCoords.lng, carRouteData
      );
      setModeEstimates(estimates);
      setActiveMode('car');
    }
    loadEstimates();
  }, [srcCoords, dstCoords, navRoute]);

  useEffect(() => {
    setSimCoordIdx(0);
    setNavStepIdx(0);
    setSimulating(false);
  }, [activeMode]);

  // Init map
  useEffect(() => {
    if (mapInst.current) return;
    const m = L.map(mapRef.current, { zoomControl: false }).setView([20.5937, 78.9629], 5);
    L.control.zoom({ position: 'topright' }).addTo(m);
    tileRef.current = L.tileLayer(LIGHT_TILES, { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(m);
    mapInst.current = m;
    setTimeout(() => m.invalidateSize(), 100);
  }, []);

  // Switch tiles for nav mode
  useEffect(() => {
    if (!mapInst.current) return;
    const wantDark = !!navMode;
    if (wantDark === isDark.current) return;
    isDark.current = wantDark;
    mapInst.current.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(wantDark ? DARK_TILES : LIGHT_TILES, {
      attribution: wantDark ? '© CartoDB © OpenStreetMap' : '© OpenStreetMap', maxZoom: 19,
    }).addTo(mapInst.current);
    setTimeout(() => mapInst.current.invalidateSize(), 50);
  }, [navMode]);

  // User location marker
  useEffect(() => {
    if (!mapInst.current || !userLocation) return;
    if (userMarker.current) mapInst.current.removeLayer(userMarker.current);
    if (thanaMarker.current) mapInst.current.removeLayer(thanaMarker.current);

    const thanaName = userLocation.thana?.name || '';
    const thanaDist = userLocation.thana?.distance || '';
    const thanaText = thanaName ? `<br>🚔 <b>Nearest Thana:</b> ${thanaName} (${thanaDist})` : '';

    userMarker.current = L.marker([userLocation.lat, userLocation.lng], { icon: makeIcon('📍', '#1A6B3C') })
      .addTo(mapInst.current)
      .bindPopup(`<b>Your Location</b><br>${userLocation.road || ''}${thanaText}`);

    if (userLocation.thana && userLocation.thana.lat && userLocation.thana.lng) {
      thanaMarker.current = L.marker([userLocation.thana.lat, userLocation.thana.lng], {
        icon: makeIcon('🚔', '#4285F4')
      }).addTo(mapInst.current)
        .bindPopup(`<b>🚔 Nearest Police Station</b><br>${userLocation.thana.name}<br>Distance: ${userLocation.thana.distance}`);

      const bounds = L.latLngBounds([
        [userLocation.lat, userLocation.lng],
        [userLocation.thana.lat, userLocation.thana.lng]
      ]);
      mapInst.current.fitBounds(bounds, { padding: [50, 50] });
    } else {
      mapInst.current.setView([userLocation.lat, userLocation.lng], 15);
    }

    userMarker.current.openPopup();
  }, [userLocation]);

  // Draw normal routes (non-nav mode)
  useEffect(() => {
    if (!mapInst.current || !routes || !srcCoords || !dstCoords || navMode) return;
    routeLines.current.forEach(l => mapInst.current.removeLayer(l));
    routeLines.current = [];
    if (srcMarker.current) mapInst.current.removeLayer(srcMarker.current);
    if (dstMarker.current) mapInst.current.removeLayer(dstMarker.current);
    if (userMarker.current) { mapInst.current.removeLayer(userMarker.current); userMarker.current = null; }
    if (thanaMarker.current) { mapInst.current.removeLayer(thanaMarker.current); thanaMarker.current = null; }

    routes.forEach((r, i) => {
      const line = L.polyline(r.coords, {
        color: r.color, weight: i === activeRoute ? 7 : 4, opacity: i === activeRoute ? 0.9 : 0.5,
      }).addTo(mapInst.current);
      line.bindPopup(`<b>${r.emoji} ${r.label}</b><br>${r.sublabel} · ${r.dist} · ${r.time}`);
      if (i === activeRoute) line.bringToFront();
      routeLines.current.push(line);
    });

    srcMarker.current = L.marker([srcCoords.lat, srcCoords.lng], { icon: makeIcon('🟢', '#1A6B3C') })
      .addTo(mapInst.current).bindPopup('<b>📍 Source</b>');
    dstMarker.current = L.marker([dstCoords.lat, dstCoords.lng], { icon: makeIcon('🏁', '#E74C3C') })
      .addTo(mapInst.current).bindPopup('<b>🏁 Destination</b>');
    const allPts = routes.flatMap(r => r.coords);
    mapInst.current.fitBounds(L.latLngBounds(allPts), { padding: [30, 30] });
  }, [routes, srcCoords, dstCoords, navMode]);

  // Route highlighting
  useEffect(() => {
    if (!routes || navMode) return;
    routeLines.current.forEach((line, i) => {
      line.setStyle({ weight: i === activeRoute ? 7 : 4, opacity: i === activeRoute ? 0.9 : 0.45 });
      if (i === activeRoute) line.bringToFront();
    });
  }, [activeRoute]);

  // Step highlight marker
  useEffect(() => {
    if (!mapInst.current) return;
    if (stepMarker.current) { mapInst.current.removeLayer(stepMarker.current); stepMarker.current = null; }
    if (!highlightedStep || navMode) return;
    const [lat, lng] = highlightedStep;
    stepMarker.current = L.circleMarker([lat, lng], {
      radius: 10, fillColor: '#1A6B3C', color: 'white', weight: 3, fillOpacity: 0.9,
    }).addTo(mapInst.current).bindPopup('<b>🧭 Direction Step</b>').openPopup();
    mapInst.current.setView([lat, lng], 14, { animate: true });
  }, [highlightedStep]);

  const selected = modeEstimates?.find(m => m.mode === activeMode);

  // Map step index lookup
  const stepIndices = useMemo(() => {
    if (!navRoute || !navRoute.directions) return [];
    const coords = (selected && !selected.isEstimate) ? selected.coords : navRoute.coords;
    return navRoute.directions.map((step) => {
      const idx = coords.findIndex(c => c[0] === step.coord[0] && c[1] === step.coord[1]);
      return idx !== -1 ? idx : 0;
    });
  }, [navRoute, selected]);

  // Text to Speech logic
  const speakInstruction = (text) => {
    if (voiceMuted || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN'; // Elegant Indian accent for local feel
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech synthesis failed:', e);
    }
  };

  const triggerStepSpeech = (stepIdx) => {
    if (!navRoute || !navRoute.directions || !navRoute.directions[stepIdx]) return;
    const step = navRoute.directions[stepIdx];
    let msg = step.instruction;
    if (step.distance && stepIdx < navRoute.directions.length - 1) {
      msg = `In ${step.distance}, ${step.instruction}`;
    }
    speakInstruction(msg);
  };

  // Travel angle calculation
  const getTravelAngle = (idx) => {
    const coords = (selected && !selected.isEstimate) ? selected.coords : (navRoute ? navRoute.coords : []);
    if (coords.length < 2) return 0;
    const p1 = coords[idx] || coords[0];
    const p2 = coords[idx + 1] || coords[idx] || coords[0];
    if (!p1 || !p2) return 0;
    const dy = p2[0] - p1[0];
    const dx = p2[1] - p1[1];
    return Math.atan2(dx, dy) * 180 / Math.PI;
  };

  // Start Navigation Setup
  useEffect(() => {
    if (navMode && navRoute && navRoute.directions) {
      setNavStepIdx(0);
      setSimCoordIdx(0);
      setSimulating(false);
      setTimeout(() => {
        triggerStepSpeech(0);
      }, 700);
    }
  }, [navMode, navRoute]);

  // Simulation play interval
  useEffect(() => {
    if (!simulating || !navMode || !navRoute) return;
    const coords = (selected && !selected.isEstimate) ? selected.coords : navRoute.coords;
    const intervalTime = Math.max(300, 1500 / simSpeed);
    const interval = setInterval(() => {
      setSimCoordIdx(prev => {
        if (prev >= coords.length - 1) {
          setSimulating(false);
          speakInstruction("You have arrived at your destination.");
          return prev;
        }
        return prev + 1;
      });
    }, intervalTime);
    return () => clearInterval(interval);
  }, [simulating, navMode, navRoute, simSpeed, selected]);

  // Update step indices dynamically based on simulation coordinate position
  useEffect(() => {
    if (!navRoute || !navRoute.directions) return;
    let currentStep = 0;
    for (let i = 0; i < stepIndices.length; i++) {
      if (simCoordIdx >= stepIndices[i]) {
        currentStep = i;
      }
    }
    if (currentStep !== navStepIdx) {
      setNavStepIdx(currentStep);
      triggerStepSpeech(currentStep);
    }
  }, [simCoordIdx, stepIndices, navRoute]);

  // Navigation markers and centering
  useEffect(() => {
    if (!mapInst.current) return;
    // Clear previous nav layers
    navLayers.current.forEach(l => mapInst.current.removeLayer(l));
    navLayers.current = [];

    if (vehicleMarker.current) {
      mapInst.current.removeLayer(vehicleMarker.current);
      vehicleMarker.current = null;
    }

    if (!navMode || !navRoute || !navSrc || !navDst) return;

    // Hide normal route layers
    routeLines.current.forEach(l => l.setStyle({ opacity: 0, weight: 0 }));
    if (srcMarker.current) srcMarker.current.setOpacity(0);
    if (dstMarker.current) dstMarker.current.setOpacity(0);
    if (userMarker.current) { mapInst.current.removeLayer(userMarker.current); userMarker.current = null; }
    if (thanaMarker.current) { mapInst.current.removeLayer(thanaMarker.current); thanaMarker.current = null; }

    // ── RENDER ALTERNATIVE ROUTES (GRAYED OUT & CLICKABLE) ──
    if (routes) {
      routes.forEach((r, idx) => {
        if (r.id === navRoute.id) return; // skip active route
        // Render alternative route in semi-transparent light gray dashed polyline
        const altLine = L.polyline(r.coords, {
          color: '#7F8C8D', weight: 5, opacity: 0.55, lineCap: 'round', lineJoin: 'round', dashArray: '4, 10'
        }).addTo(mapInst.current);
        
        altLine.bindPopup(`<b>${r.emoji} Switch to ${r.label}</b><br>${r.sublabel} · ${r.dist} · ${r.time}`);
        
        // When clicked, trigger parent switch route function
        altLine.on('click', () => {
          if (onSwitchNavRoute) {
            onSwitchNavRoute(idx);
          }
        });

        navLayers.current.push(altLine);
      });
    }

    const coords = (selected && !selected.isEstimate) ? selected.coords : navRoute.coords;

    // Glow line (wider, semi-transparent)
    const glow = L.polyline(coords, {
      color: '#4285F4', weight: 14, opacity: 0.22, lineCap: 'round', lineJoin: 'round',
    }).addTo(mapInst.current);
    navLayers.current.push(glow);

    // Main route line (bright blue)
    const mainLine = L.polyline(coords, {
      color: '#4285F4', weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
    }).addTo(mapInst.current);
    navLayers.current.push(mainLine);

    // White waypoint dots at direction steps
    if (navRoute.directions) {
      navRoute.directions.forEach((step, i) => {
        if (i === 0 || i === navRoute.directions.length - 1) return; // skip src/dst
        const dot = L.circleMarker(step.coord, {
          radius: 5, fillColor: 'white', color: '#4285F4', weight: 2.5, fillOpacity: 1,
        }).addTo(mapInst.current);
        dot.bindPopup(`<b>Step ${step.step}</b><br>${step.instruction}`);
        navLayers.current.push(dot);
      });
    }

    // Destination marker (red pin)
    const dstM = L.marker([navDst.lat, navDst.lng], { icon: makeNavPin(), zIndexOffset: 1000 })
      .addTo(mapInst.current);
    navLayers.current.push(dstM);

    // Fit bounds initially
    mapInst.current.fitBounds(L.latLngBounds(coords), { padding: [80, 80] });
  }, [navMode, navRoute, navSrc, navDst, routes, onSwitchNavRoute, selected]);

  // Update vehicle position marker dynamically
  useEffect(() => {
    if (!mapInst.current || !navMode || !navRoute) return;

    const coords = (selected && !selected.isEstimate) ? selected.coords : navRoute.coords;
    const currentCoord = coords[simCoordIdx] || coords[0];
    const angle = getTravelAngle(simCoordIdx);

    if (vehicleMarker.current) {
      vehicleMarker.current.setLatLng(currentCoord);
      vehicleMarker.current.setIcon(makeNavVehicleIcon(angle));
    } else {
      vehicleMarker.current = L.marker(currentCoord, {
        icon: makeNavVehicleIcon(angle),
        zIndexOffset: 2000
      }).addTo(mapInst.current);
    }

    mapInst.current.setView(currentCoord, 16, { animate: true });
  }, [simCoordIdx, navMode, navRoute, selected]);

  // Clean up speech on unmount or navigate exit
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  // Compute travel angle
  const currentAngle = getTravelAngle(simCoordIdx);

  // Compute transport times and remaining stats for bottom bar
  const coordsForPct = (selected && !selected.isEstimate) ? selected.coords : (navRoute ? navRoute.coords : []);
  const pct = coordsForPct.length > 1 ? simCoordIdx / (coordsForPct.length - 1) : 0;

  const activeDistance = selected ? selected.distanceKm : (navRoute ? parseFloat(navRoute.dist) : 0);
  const remainingDist = (activeDistance * (1 - pct)).toFixed(1);

  const activeDuration = selected ? selected.durationMin : (navRoute ? parseInt(navRoute.time) : 0);
  const remainingTimeMinutes = Math.ceil(activeDuration * (1 - pct));
  const remainingTimeStr = formatDuration(remainingTimeMinutes);

  const carTime = remainingTimeStr;

  // Get ETA
  const etaTimeStr = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + remainingTimeMinutes);
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes} ${ampm}`;
  }, [remainingTimeMinutes]);

  // Compute distance to next turn
  const distanceToNextTurn = useMemo(() => {
    if (!navRoute || !navRoute.coords || navStepIdx >= navRoute.directions.length - 1) return 0;
    const nextIdx = stepIndices[navStepIdx + 1];
    if (nextIdx === undefined || nextIdx <= simCoordIdx) return 0;

    const coords = (selected && !selected.isEstimate) ? selected.coords : navRoute.coords;
    let distSum = 0;
    for (let i = simCoordIdx; i < nextIdx; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      if (p1 && p2) {
        distSum += haversine(p1[0], p1[1], p2[0], p2[1]);
      }
    }
    return distSum;
  }, [navRoute, simCoordIdx, navStepIdx, stepIndices, selected]);

  const formattedDistanceToNextTurn = useMemo(() => {
    if (distanceToNextTurn < 0.1) {
      return `${Math.round(distanceToNextTurn * 1000)} m`;
    }
    return `${distanceToNextTurn.toFixed(1)} km`;
  }, [distanceToNextTurn]);

  // Action helpers
  const handleNextStep = () => {
    if (!navRoute || navStepIdx >= navRoute.directions.length - 1) return;
    const nextIdx = navStepIdx + 1;
    const nextCoordIdx = stepIndices[nextIdx];
    setSimCoordIdx(nextCoordIdx);
  };

  const handlePrevStep = () => {
    if (!navRoute || navStepIdx <= 0) return;
    const prevIdx = navStepIdx - 1;
    const prevCoordIdx = stepIndices[prevIdx];
    setSimCoordIdx(prevCoordIdx);
  };

  const toggleSpeed = () => {
    setSimSpeed(prev => prev === 1 ? 2 : prev === 2 ? 4 : 1);
  };

  const currentStepObject = navRoute && navRoute.directions ? navRoute.directions[navStepIdx] : null;

  return (
    <div className={`map-wrap ${navMode ? 'map-wrap-nav' : ''}`}>
      <div ref={mapRef} className="map-container" style={{ width: '100%', height: '100%' }} />

      {/* Floating Quick-Locate Button */}
      {!navMode && (
        <button
          className="floating-locate-btn"
          onClick={onQuickLocate}
          title="Find my location"
        >
          🎯
        </button>
      )}

      {/* Floating Emergency Action Logo */}
      {!navMode && (
        <button
          className="emergency-map-logo"
          onClick={() => setShowEmergencyModal(true)}
          title="Emergency Help & Contacts"
        >
          🚨 <span>EMERGENCY</span>
        </button>
      )}

      {/* Emergency Helpline Modal */}
      {showEmergencyModal && (
        <div className="emergency-modal-backdrop" onClick={() => setShowEmergencyModal(false)}>
          <div className="emergency-modal" onClick={e => e.stopPropagation()}>
            <div className="emergency-modal-header">
              <span>🚨 Emergency Contacts</span>
              <button className="emergency-modal-close" onClick={() => setShowEmergencyModal(false)}>✖</button>
            </div>
            <div className="emergency-modal-body">
              {[
                { name: 'National Emergency Number', num: '112' },
                { name: 'Police Helpline', num: '112 / 100' },
                { name: 'Women Helpline', num: '1091' },
                { name: 'Ambulance Support', num: '102' },
                { name: 'Fire Control', num: '101' },
              ].map(item => (
                <div key={item.name} className="emergency-contact-item">
                  <div className="emergency-contact-info">
                    <span className="emergency-contact-name">{item.name}</span>
                    <span className="emergency-contact-number">Dial: {item.num}</span>
                  </div>
                  <a href={`tel:${item.num.split(' ')[0]}`} className="btn-emergency-call">
                    📞 Call
                  </a>
                </div>
              ))}
            </div>
            <div className="emergency-modal-footer">
              <span style={{ fontSize: 11, color: '#7f8c8d' }}>Aap Ki Suraksha Hamara Sankalp</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowEmergencyModal(false); if (onQuickLocate) onQuickLocate(); }}>
                📍 Get Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Normal mode legend */}
      {routes && !navMode && (
        <div className="map-legend">
          <div className="legend-title">🗺️ Route Safety</div>
          {routes.some(r => r.colorClass === 'green') && (
            <div className="legend-row"><div className="legend-line" style={{ background: '#27AE60' }} /><span>Green — Safe Route</span></div>
          )}
          {routes.some(r => r.colorClass === 'yellow') && (
            <div className="legend-row"><div className="legend-line" style={{ background: '#F39C12' }} /><span>Yellow — Moderate Risk</span></div>
          )}
          {routes.some(r => r.colorClass === 'red') && (
            <div className="legend-row"><div className="legend-line" style={{ background: '#E74C3C' }} /><span>Red — High Risk</span></div>
          )}
          {routes.length === 1 && (
            <div style={{ fontSize: 10, color: '#6C757D', marginTop: 4 }}>Only 1 route exists</div>
          )}
        </div>
      )}

      {/* ── GOOGLE MAPS NAVIGATION HUD OVERLAYS ── */}
      {navMode && navRoute && (
        <>
          {/* Top HUD Banner showing Current Step instructions */}
          <div className="nav-hud-top">
            <div className="nav-hud-top-left">
              <div className="nav-hud-turn-icon">
                {currentStepObject && renderTurnIcon(currentStepObject.icon)}
              </div>
              {navStepIdx < navRoute.directions.length - 1 && (
                <div className="nav-hud-turn-dist">
                  In {formattedDistanceToNextTurn}
                </div>
              )}
            </div>
            <div className="nav-hud-top-center">
              <div className="nav-hud-instruction">
                {currentStepObject ? currentStepObject.instruction : 'Start heading to destination'}
              </div>
              <div className="nav-hud-sub-instruction">
                {navStepIdx < navRoute.directions.length - 1 
                  ? `Then: ${navRoute.directions[navStepIdx + 1]?.instruction || ''}` 
                  : 'Arriving at destination'}
              </div>
            </div>
            <div className="nav-hud-top-right">
              {/* Voice button */}
              <button 
                className={`nav-hud-btn ${voiceMuted ? 'muted' : ''}`} 
                onClick={() => {
                  setVoiceMuted(!voiceMuted);
                  if (voiceMuted && currentStepObject) {
                    // Speak instantly on unmute
                    setTimeout(() => speakInstruction(currentStepObject.instruction), 100);
                  }
                }}
                title={voiceMuted ? "Unmute Voice Guidance" : "Mute Voice Guidance"}
              >
                {voiceMuted ? '🔇' : '🔊'}
              </button>
            </div>
          </div>

          {/* Controls Overlay (Floating on right) */}
          <div className="nav-controls-overlay">
            <button className="nav-control-btn speed-btn" onClick={toggleSpeed} title="Simulation Speed">
              🏃 {simSpeed}x
            </button>
            <button 
              className="nav-control-btn play-btn" 
              onClick={() => setSimulating(!simulating)}
              title={simulating ? "Pause Simulation" : "Start Simulation"}
            >
              {simulating ? '⏸️' : '▶️'}
            </button>
            <button 
              className="nav-control-btn prev-btn" 
              onClick={handlePrevStep} 
              disabled={navStepIdx === 0}
              title="Previous Step"
            >
              ⏮️
            </button>
            <button 
              className="nav-control-btn next-btn" 
              onClick={handleNextStep} 
              disabled={navStepIdx === navRoute.directions.length - 1}
              title="Next Step"
            >
              ⏭️
            </button>
          </div>

          {/* Bottom Google Maps Stats HUD */}
          <div className="nav-bottom-hud">
            {/* Travel stats */}
            <div className="nav-hud-stats-row">
              <div className="nav-hud-time">{carTime}</div>
              <div className="nav-hud-dot"></div>
              <div className="nav-hud-distance">{remainingDist} km</div>
              <div className="nav-hud-dot"></div>
              <div className="nav-hud-eta">ETA {etaTimeStr}</div>
            </div>

            {/* Sub-modes bar */}
            <div className="nav-hud-modes-row">
              {modeEstimates ? (
                modeEstimates.map((m) => {
                  const currentDurationMin = Math.ceil(m.durationMin * (1 - pct));
                  return (
                    <div
                      key={m.mode}
                      className={`nav-hud-mode ${activeMode === m.mode ? 'active' : ''}`}
                      onClick={() => setActiveMode(m.mode)}
                    >
                      <span className="mode-ico">{m.icon}</span>
                      <span className="mode-t">
                        {formatDuration(currentDurationMin)}
                        {m.isEstimate && <small className="est-tag"> · Est.</small>}
                      </span>
                    </div>
                  );
                })
              ) : (
                <>
                  <div className="nav-hud-mode active">
                    <span className="mode-ico">🚗</span>
                    <span className="mode-t">{carTime}</span>
                  </div>
                  <div className="nav-hud-mode">
                    <span className="mode-ico">🏍️</span>
                    <span className="mode-t">Loading...</span>
                  </div>
                  <div className="nav-hud-mode">
                    <span className="mode-ico">🚌</span>
                    <span className="mode-t">Loading...</span>
                  </div>
                  <div className="nav-hud-mode">
                    <span className="mode-ico">🚶</span>
                    <span className="mode-t">Loading...</span>
                  </div>
                </>
              )}
            </div>

            {/* Exit/Control Row */}
            <div className="nav-hud-actions-row">
              <div className="nav-hud-route-switchers">
                {routes && routes.map((r, i) => (
                  <button 
                    key={r.id} 
                    className={`nav-hud-route-pill ${r.colorClass} ${r.id === navRoute.id ? 'active' : ''}`}
                    onClick={() => {
                      if (r.id !== navRoute.id && onSwitchNavRoute) {
                        onSwitchNavRoute(i);
                      }
                    }}
                    title={`Switch to ${r.label}`}
                  >
                    <span className="pill-dot"></span>
                    <span className="pill-text">{r.colorClass.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              <button className="nav-hud-exit-btn" onClick={onExitNav}>
                ❌ End
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
