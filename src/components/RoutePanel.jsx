import React, { useState, useRef, useEffect } from 'react';
import { forwardGeocode, reverseGeocodeToLabel } from '../utils/nominatim.js';
import { searchPlaces } from '../utils/autocomplete.js';
import { generateRoutes, DEMO } from '../utils/mockRoutes.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default function RoutePanel({ onRoutesFound, onStepClick, onStartNav }) {
  const [src, setSrc] = useState('');
  const [dst, setDst] = useState('');
  const [srcCoordsCache, setSrcCoordsCache] = useState(null);
  const [dstCoordsCache, setDstCoordsCache] = useState(null);

  const [srcSuggestions, setSrcSuggestions] = useState([]);
  const [dstSuggestions, setDstSuggestions] = useState([]);
  const [showSrcSuggestions, setShowSrcSuggestions] = useState(false);
  const [showDstSuggestions, setShowDstSuggestions] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);

  const [loading,    setLoading]    = useState(false);
  const [loadMsg,    setLoadMsg]    = useState('');
  const [error,      setError]      = useState('');
  const [routes,     setRoutes]     = useState(null);
  const [active,     setActive]     = useState(0);
  const [showDirs,   setShowDirs]   = useState(false);
  const [activeStep, setActiveStep] = useState(-1);

  const srcDebounce = useRef(null);
  const dstDebounce = useRef(null);
  const srcBoxRef = useRef(null);
  const dstBoxRef = useRef(null);

  // ── Debounced autocomplete for SOURCE field ──
  function handleSrcChange(value) {
    setSrc(value);
    setSrcCoordsCache(null);
    clearTimeout(srcDebounce.current);
    if (value.trim().length < 3) { setSrcSuggestions([]); setShowSrcSuggestions(false); return; }
    srcDebounce.current = setTimeout(async () => {
      const results = await searchPlaces(value);
      setSrcSuggestions(results);
      setShowSrcSuggestions(true);
    }, 400);
  }

  // ── Debounced autocomplete for DESTINATION field ──
  function handleDstChange(value) {
    setDst(value);
    setDstCoordsCache(null);
    clearTimeout(dstDebounce.current);
    if (value.trim().length < 3) { setDstSuggestions([]); setShowDstSuggestions(false); return; }
    dstDebounce.current = setTimeout(async () => {
      const results = await searchPlaces(value);
      setDstSuggestions(results);
      setShowDstSuggestions(true);
    }, 400);
  }

  function pickSrcSuggestion(item) {
    setSrc(item.label);
    setSrcCoordsCache({ lat: item.lat, lng: item.lng, name: item.label });
    setShowSrcSuggestions(false);
    setSrcSuggestions([]);
  }

  function pickDstSuggestion(item) {
    setDst(item.label);
    setDstCoordsCache({ lat: item.lat, lng: item.lng, name: item.label });
    setShowDstSuggestions(false);
    setDstSuggestions([]);
  }

  // ── "Use My Current Location" button ──
  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('⚠️ Geolocation not supported by your browser.');
      return;
    }
    setLocatingMe(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const label = await reverseGeocodeToLabel(lat, lng);
          setSrc(label);
          setSrcCoordsCache({ lat, lng, name: label });
          setShowSrcSuggestions(false);
        } catch (e) {
          setError('❌ Could not fetch your location name. Try typing manually.');
        } finally {
          setLocatingMe(false);
        }
      },
      (err) => {
        setLocatingMe(false);
        const msgs = { 1: 'Location access denied. Allow permission and try again.', 2: 'Location unavailable.', 3: 'Request timed out.' };
        setError('❌ ' + (msgs[err.code] || err.message));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ── Close suggestion dropdowns when clicking outside ──
  useEffect(() => {
    function handleClickOutside(e) {
      if (srcBoxRef.current && !srcBoxRef.current.contains(e.target)) setShowSrcSuggestions(false);
      if (dstBoxRef.current && !dstBoxRef.current.contains(e.target)) setShowDstSuggestions(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function fillDemo() {
    setSrc(DEMO.src); setDst(DEMO.dst);
    setSrcCoordsCache(null); setDstCoordsCache(null);
    setError(''); setRoutes(null); setShowDirs(false);
  }

  async function handleFind() {
    if (!src.trim() || !dst.trim()) { setError('⚠️ Please enter both source and destination.'); return; }
    if (src.trim().toLowerCase() === dst.trim().toLowerCase()) { setError('⚠️ Source and destination cannot be the same.'); return; }

    setLoading(true); setError(''); setRoutes(null); setShowDirs(false);
    setShowSrcSuggestions(false); setShowDstSuggestions(false);

    try {
      let srcCoords = srcCoordsCache;
      if (!srcCoords) {
        setLoadMsg('🔍 Geocoding source location…');
        srcCoords = await forwardGeocode(src.trim());
        await sleep(1100);
      }

      let dstCoords = dstCoordsCache;
      if (!dstCoords) {
        setLoadMsg('🔍 Geocoding destination…');
        dstCoords = await forwardGeocode(dst.trim());
        await sleep(400);
      }

      setLoadMsg('🛣️ Calculating road-snapped routes…');
      const result = await generateRoutes(srcCoords.lat, srcCoords.lng, dstCoords.lat, dstCoords.lng);

      setRoutes(result);
      setActive(0);
      onRoutesFound(result, srcCoords, dstCoords);
    } catch (e) {
      setError('❌ ' + e.message);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function selectRoute(i) {
    setActive(i);
    setShowDirs(false);
    setActiveStep(-1);
    onRoutesFound(routes, null, null, i);
    if (onStepClick) onStepClick(null);
  }

  function handleStepClick(step, idx) {
    setActiveStep(idx);
    if (onStepClick && step.coord) onStepClick(step.coord);
  }

  function handleToggleDirs() {
    setShowDirs(!showDirs);
    setActiveStep(-1);
    if (onStepClick) onStepClick(null);
  }

  return (
    <div>
      {/* SOURCE FIELD with autocomplete + use-my-location */}
      <div className="input-group" ref={srcBoxRef} style={{ position: 'relative' }}>
        <label className="input-label">📍 From (Source)</label>
        <div style={{ position: 'relative' }}>
          <input
            className="input-field"
            value={src}
            onChange={e => handleSrcChange(e.target.value)}
            onFocus={() => srcSuggestions.length > 0 && setShowSrcSuggestions(true)}
            placeholder="e.g. Noida Sector 62"
            onKeyDown={e => e.key === 'Enter' && handleFind()}
            style={{ paddingRight: 40 }}
          />
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locatingMe}
            title="Use my current location"
            className="loc-btn"
          >
            {locatingMe ? '⏳' : '🎯'}
          </button>
        </div>
        {showSrcSuggestions && srcSuggestions.length > 0 && (
          <div className="suggestions-dropdown">
            {srcSuggestions.map((item, i) => (
              <div key={i} className="suggestion-item" onClick={() => pickSrcSuggestion(item)}>
                📍 <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#6C757D', marginTop: 4 }}>
          🎯 Tap the target icon to use your current location
        </div>
      </div>

      {/* DESTINATION FIELD with autocomplete */}
      <div className="input-group" ref={dstBoxRef} style={{ position: 'relative' }}>
        <label className="input-label">🏁 To (Destination)</label>
        <input
          className="input-field"
          value={dst}
          onChange={e => handleDstChange(e.target.value)}
          onFocus={() => dstSuggestions.length > 0 && setShowDstSuggestions(true)}
          placeholder="e.g. Connaught Place, Delhi"
          onKeyDown={e => e.key === 'Enter' && handleFind()}
        />
        {showDstSuggestions && dstSuggestions.length > 0 && (
          <div className="suggestions-dropdown">
            {dstSuggestions.map((item, i) => (
              <div key={i} className="suggestion-item" onClick={() => pickDstSuggestion(item)}>
                📍 <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row-btns" style={{ marginBottom: 12, marginTop: 4 }}>
        <button className="btn btn-demo btn-sm" onClick={fillDemo}>🎯 Demo Route</button>
        <button className="btn btn-primary btn-sm" onClick={handleFind} disabled={loading}>
          {loading ? '⏳ Analyzing…' : '🚀 Find Routes'}
        </button>
      </div>

      {loading && <div className="spinner-wrap"><div className="spinner" /><div className="spinner-text">{loadMsg}</div></div>}
      {error && <div className="msg msg-error">{error}</div>}

      {routes && (
        <div>
          <div className="section-title">🤖 AI Safety Analysis</div>
          {routes.length === 1 && (
            <div className="msg msg-info" style={{ marginBottom: 10 }}>
              ℹ️ Only one road route exists between these locations — no genuine alternate path was found, so we're showing it as the Green (Safe) route. This is more accurate than inventing fake alternate routes.
            </div>
          )}
          {routes.length === 2 && (
            <div className="msg msg-info" style={{ marginBottom: 10 }}>
              ℹ️ 2 distinct road routes found between these locations.
            </div>
          )}
          {routes.map((r, i) => (
            <div key={r.id}>
              <div className={`route-card ${r.colorClass} ${i === active ? 'active' : ''}`}
                onClick={() => selectRoute(i)}>
                <div className="route-header">
                  <span className={`route-label ${r.colorClass}`}>{r.emoji} {r.label}</span>
                  <span className={`risk-badge risk-${r.risk}`}>{r.risk} RISK</span>
                </div>
                <div className="route-meta">
                  <span>⏱️ {r.time}</span><span>📏 {r.dist}</span>
                </div>
                <div className="score-bar">
                  <div className="score-label">Safety Score: {r.score}/10</div>
                  <div className="score-track"><div className="score-fill" style={{ width: `${r.score * 10}%`, background: r.color }} /></div>
                </div>
                <div className="route-desc">{r.desc}</div>
                <div className="route-items">
                  {r.points.map((pt, j) => <div key={j} className="route-item">{pt}</div>)}
                </div>
                {i === active && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button className="btn btn-nav" style={{ flex: 1 }}
                      onClick={e => { e.stopPropagation(); handleToggleDirs(); }}>
                      {showDirs ? '✖️ Hide Directions' : '🧭 Directions'}
                    </button>
                    <button className="btn btn-start-nav" style={{ flex: 1 }}
                      onClick={e => { e.stopPropagation(); if (onStartNav) onStartNav(i); }}>
                      🗺️ Start Navigation
                    </button>
                  </div>
                )}
              </div>

              {/* DIRECTIONS PANEL */}
              {i === active && showDirs && r.directions && (
                <div className="directions-panel">
                  <div className="dirs-header">
                    <div className="dirs-title">🧭 TURN-BY-TURN DIRECTIONS</div>
                    <div className="dirs-subtitle">{r.emoji} {r.sublabel} · {r.dist} · {r.time}</div>
                  </div>
                  <div className="dirs-steps">
                    {r.directions.map((step, si) => (
                      <div key={si}
                        className={`dir-step ${si === activeStep ? 'dir-step-active' : ''}`}
                        onClick={() => handleStepClick(step, si)}>
                        <div className="dir-step-left">
                          <div className={`dir-step-num ${r.colorClass}`}>{step.step}</div>
                          {si < r.directions.length - 1 && <div className={`dir-connector ${r.colorClass}`} />}
                        </div>
                        <div className="dir-step-icon">{step.icon}</div>
                        <div className="dir-step-body">
                          <div className="dir-step-instruction">{step.instruction}</div>
                          {step.distance && (
                            <div className="dir-step-meta">
                              <span>📏 {step.distance}</span>
                              <span>⏱️ {step.time}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="dirs-footer">
                    💡 Click any step to see it on the map
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="msg msg-warning" style={{ fontSize: 11 }}>
            ℹ️ Safety data is simulated for demo. Production version uses live NHAI data + community reports + Gemini AI.
          </div>
        </div>
      )}

      {!routes && !loading && (
        <div className="empty-state">
          <div className="empty-icon">🗺️</div>
          <p className="empty-text">
            Enter source & destination to get <strong>3 safety-classified routes</strong> — Green, Yellow & Red.
            <br/><br/>
            Try <strong>Demo Route</strong>, or tap 🎯 to use your current location.
          </p>
        </div>
      )}
    </div>
  );
}
