import React, { useState, useEffect, useRef } from 'react';
import { reverseGeocode } from '../utils/nominatim.js';
import { findNearestThana } from '../utils/overpass.js';

const ACCURACY_GOOD_ENOUGH = 30;   // meters — stop early if this accurate
const MAX_WATCH_TIME       = 8000; // ms — give up improving after 8 sec

export default function LocatePanel({ onLocationFound, triggerLocate }) {
  const [loading,   setLoading]   = useState(false);
  const [loadMsg,   setLoadMsg]   = useState('');
  const [accuracy,  setAccuracy]  = useState(null);
  const [error,     setError]     = useState('');
  const [locData,   setLocData]   = useState(null);
  const [copied,    setCopied]    = useState(false);

  const watchIdRef    = useRef(null);
  const bestReadingRef = useRef(null);
  const timeoutRef    = useRef(null);

  useEffect(() => {
    if (triggerLocate && triggerLocate > 0) {
      handleLocate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerLocate]);

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleLocate() {
    setLoading(true); setError(''); setLocData(null);
    setAccuracy(null);
    bestReadingRef.current = null;
    setLoadMsg('📡 Acquiring GPS signal…');

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setLoading(false); return;
    }

    // Clear any previous watch
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        console.log('[GPS] Reading received — accuracy:', acc.toFixed(0), 'm');
        setAccuracy(Math.round(acc));

        // Keep the most accurate (lowest accuracy value) reading so far
        if (!bestReadingRef.current || acc < bestReadingRef.current.coords.accuracy) {
          bestReadingRef.current = pos;
        }

        setLoadMsg(`📡 Improving accuracy… (current: ±${Math.round(acc)}m)`);

        // Good enough — finalize immediately
        if (acc <= ACCURACY_GOOD_ENOUGH) {
          finalizeLocation();
        }
      },
      (err) => {
        const msgs = {
          1: 'Location access denied. Please allow location permission in your browser settings.',
          2: 'Location unavailable. Try again.',
          3: 'Request timed out. Try again.',
        };
        setError('❌ ' + (msgs[err.code] || err.message));
        setLoading(false);
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    // Safety timeout — use best reading we have even if not "good enough"
    timeoutRef.current = setTimeout(() => {
      if (bestReadingRef.current) {
        console.log('[GPS] Timeout reached — using best available reading');
        finalizeLocation();
      } else {
        setError('❌ Could not get a GPS fix. Please check your location settings and try again.');
        setLoading(false);
      }
    }, MAX_WATCH_TIME);
  }

  async function finalizeLocation() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearTimeout(timeoutRef.current);

    const pos = bestReadingRef.current;
    if (!pos) { setLoading(false); return; }

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const finalAccuracy = Math.round(pos.coords.accuracy);

    try {
      setLoadMsg('🗺️ Reverse geocoding location…');
      const addr = await reverseGeocode(lat, lng);

      setLoadMsg('🚔 Finding nearest police station…');
      const thana = await findNearestThana(lat, lng);

      const data = {
        lat, lng, ...addr, thana, accuracy: finalAccuracy,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      };
      setLocData(data);
      onLocationFound(data);
    } catch (e) {
      setError('❌ Could not fetch location details. Check your internet and try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function buildMsg(d) {
    return `🚨 EMERGENCY LOCATION DETAILS\n━━━━━━━━━━━━━━━━━━━━━\n🛣️ Road/Highway: ${d.road}\n🏘️ Locality: ${d.suburb}\n🏛️ District: ${d.district}, ${d.state}\n🚔 Nearest Police Station: ${d.thana.name} (~${d.thana.distance})\n📌 GPS: ${d.lat.toFixed(5)}°N, ${d.lng.toFixed(5)}°E (±${d.accuracy}m)\n🕐 Recorded: ${d.time}\n━━━━━━━━━━━━━━━━━━━━━\n(Shared via Suraksha Navigator — Team Alpha)`;
  }

  function handleCopy() {
    if (!locData) return;
    navigator.clipboard.writeText(buildMsg(locData)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = buildMsg(locData);
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    });
  }

  function handleWhatsApp() {
    if (!locData) return;
    window.open('https://wa.me/?text=' + encodeURIComponent(buildMsg(locData)), '_blank');
  }

  return (
    <div>
      <div className="stat-chips">
        <span className="stat-chip">🛣️ Road No.</span>
        <span className="stat-chip">🚔 Nearest Thana</span>
        <span className="stat-chip">🏘️ Locality</span>
      </div>

      <button className="btn btn-primary" onClick={handleLocate} disabled={loading}>
        {loading ? '⏳ Locating…' : '📍 Locate Me Now'}
      </button>

      {loading && (
        <div className="spinner-wrap">
          <div className="spinner" />
          <div className="spinner-text">{loadMsg}</div>
          {accuracy !== null && (
            <div style={{ fontSize: 11, color: accuracy <= 30 ? '#27AE60' : accuracy <= 100 ? '#F39C12' : '#E74C3C', fontWeight: 700 }}>
              Signal accuracy: ±{accuracy}m {accuracy <= 30 ? '✅ Good' : accuracy <= 100 ? '⚠️ Improving' : '🔄 Refining...'}
            </div>
          )}
        </div>
      )}

      {error && <div className="msg msg-error" style={{ marginTop: 12 }}>{error}</div>}

      {locData && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-header">
            <span>📍 YOUR LOCATION</span>
            <div className="live-badge"><div className="live-dot" />LIVE</div>
          </div>
          <div className="card-body">
            {[
              { icon: '🛣️', label: 'Road / Highway',         val: locData.road,            cls: 'green'  },
              { icon: '🏘️', label: 'Locality / Suburb',      val: locData.suburb,          cls: ''       },
              { icon: '🏛️', label: 'District',               val: locData.district,        cls: ''       },
              { icon: '🗺️', label: 'State',                  val: locData.state,           cls: ''       },
              { icon: '🚔', label: 'Nearest Police Station', val: `${locData.thana.name}${locData.thana.distance !== '—' ? ' · ' + locData.thana.distance : ''}`, cls: 'blue' },
              { icon: '📌', label: 'GPS Coordinates',        val: `${locData.lat.toFixed(4)}°N, ${locData.lng.toFixed(4)}°E (±${locData.accuracy}m)`, cls: '' },
              { icon: '🕐', label: 'Recorded At',            val: locData.time,            cls: ''       },
            ].map((row) => (
              <div className="loc-row" key={row.label}>
                <div className="loc-icon">{row.icon}</div>
                <div>
                  <div className="loc-label">{row.label}</div>
                  <div className={`loc-value ${row.cls}`}>{row.val}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="share-row">
            <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
              {copied ? '✅ Copied!' : '📋 Copy Details'}
            </button>
            <button className="btn btn-whatsapp btn-sm" onClick={handleWhatsApp}>
              💬 WhatsApp Share
            </button>
          </div>
        </div>
      )}

      {!locData && !loading && (
        <div className="msg msg-info" style={{ marginTop: 12 }}>
          🔒 Tap "Locate Me Now" to get your complete location details. We take a few readings to ensure accuracy before showing results.
        </div>
      )}
    </div>
  );
}
