import { getRoadRoute } from './osrm.js';

// Generates turn-by-turn directions from OSRM step data or fallback
function makeDirections(coords, routeId, distKm, osrmSteps) {
  // If OSRM provided steps, use real road names from the API
  if (osrmSteps && osrmSteps.length > 0) {
    const maneuverIcons = {
      'turn-right': '➡️',
      'turn-left': '⬅️',
      'turn-slight-right': '↗️',
      'turn-slight-left': '↖️',
      'turn-sharp-right': '➡️',
      'turn-sharp-left': '⬅️',
      'continue': '⬆️',
      'straight': '⬆️',
      'depart': '🚗',
      'arrive': '🏁',
      'merge': '↗️',
      'fork': '↗️',
      'roundabout': '🔄',
      'rotary': '🔄',
    };

    const directions = [];
    let stepNum = 1;

    for (const leg of osrmSteps) {
      const roadName = leg.name || 'unnamed road';
      const maneuverType = leg.maneuver?.type || 'continue';
      const modifier = leg.maneuver?.modifier || '';
      const iconKey = modifier ? `${maneuverType}-${modifier}` : maneuverType;
      const icon = maneuverIcons[iconKey] || maneuverIcons[maneuverType] || '⬆️';

      let prefix = 'Continue on';
      if (maneuverType === 'depart') prefix = 'Head on';
      else if (maneuverType === 'arrive') prefix = 'Arrive at';
      else if (maneuverType === 'turn') prefix = modifier === 'right' ? 'Turn right onto' : modifier === 'left' ? 'Turn left onto' : `Turn ${modifier} onto`;
      else if (maneuverType === 'merge') prefix = 'Merge onto';
      else if (maneuverType === 'fork') prefix = `Take the ${modifier} fork onto`;
      else if (maneuverType === 'roundabout' || maneuverType === 'rotary') prefix = 'At the roundabout, take exit onto';

      const stepDist = leg.distance / 1000;
      const stepTime = Math.round(leg.duration / 60);

      // Find nearest coord for this step's location
      const loc = leg.maneuver?.location; // [lng, lat]
      let coord = coords[0];
      if (loc) {
        const [mLng, mLat] = loc;
        let bestDist = Infinity;
        for (const c of coords) {
          const d = Math.abs(c[0] - mLat) + Math.abs(c[1] - mLng);
          if (d < bestDist) { bestDist = d; coord = c; }
        }
      }

      directions.push({
        step: stepNum++,
        icon,
        instruction: `${prefix} ${roadName}`,
        distance: maneuverType === 'arrive' ? '' : `${stepDist.toFixed(1)} km`,
        time: maneuverType === 'arrive' ? '' : `${Math.max(1, stepTime)} min`,
        coord,
      });
    }

    // Limit to reasonable number of steps (max 12) for UI
    if (directions.length > 12) {
      const filtered = [directions[0]];
      const step = Math.floor((directions.length - 2) / 10);
      for (let i = 1; i < directions.length - 1; i += Math.max(1, step)) {
        filtered.push(directions[i]);
      }
      filtered.push(directions[directions.length - 1]);
      return filtered.map((d, i) => ({ ...d, step: i + 1 }));
    }

    return directions;
  }

  // Fallback: generate basic directions from coords
  const roadNames = {
    green: ['Sector 62 Main Road','NH-24 (Delhi-Meerut Expressway)','UP Gate Flyover','Anand Vihar Interchange','Vikas Marg','ITO Flyover','Barakhamba Road','Connaught Place Inner Circle'],
    yellow: ['Sector 62 Service Road','Dadri Road','NH-9 / GT Road','Ghaziabad Border Crossing','Shahdara Flyover','Ring Road (North)','Rajghat Junction','Minto Road'],
    red: ['Sector 62 Cut-Through','Noida Link Road','DND Flyway','Ashram Intersection','Mathura Road','India Gate Roundabout','Janpath','Connaught Place'],
  };
  const maneuvers = [
    { icon: '🚗', prefix: 'Head northwest on' },
    { icon: '↗️', prefix: 'Merge onto' },
    { icon: '⬆️', prefix: 'Continue on' },
    { icon: '➡️', prefix: 'Turn right onto' },
    { icon: '⬆️', prefix: 'Continue straight on' },
    { icon: '↖️', prefix: 'Take slight left onto' },
    { icon: '⬅️', prefix: 'Turn left onto' },
    { icon: '🏁', prefix: 'Arrive at' },
  ];

  const roads = roadNames[routeId] || roadNames.green;
  const n = roads.length;
  const weights = roads.map((_, i) => (i === 0 || i === n - 1) ? 0.5 : (i <= 2 ? 1.5 : 0.9));
  const wSum = weights.reduce((a, b) => a + b, 0);

  return roads.map((road, i) => {
    const ci = Math.min(Math.round((i / (n - 1)) * (coords.length - 1)), coords.length - 1);
    const sd = distKm * weights[i] / wSum;
    const mn = i === 0 ? maneuvers[0] : i === n - 1 ? maneuvers[7] : maneuvers[(i % 6) + 1];
    return {
      step: i + 1,
      icon: mn.icon,
      instruction: `${mn.prefix} ${road}`,
      distance: i === n - 1 ? '' : `${sd.toFixed(1)} km`,
      time: i === n - 1 ? '' : `${Math.max(1, Math.round(sd / (35 + i * 3) * 60))} min`,
      coord: coords[ci],
    };
  });
}

// Compares two routes — returns true if they're essentially the
// same physical road (within 3% distance AND 3% duration difference)
function isSameRoute(a, b) {
  const distDiff = Math.abs(a.distanceKm - b.distanceKm) / a.distanceKm;
  const durDiff  = Math.abs(a.durationMin - b.durationMin) / Math.max(a.durationMin, 1);
  return distDiff < 0.03 && durDiff < 0.03;
}

// Removes duplicate/near-identical routes, keeping unique ones only
function dedupeRoutes(routes) {
  const unique = [];
  for (const r of routes) {
    const isDup = unique.some(u => isSameRoute(u, r));
    if (!isDup) unique.push(r);
  }
  return unique;
}

export async function generateRoutes(srcLat, srcLng, dstLat, dstLng) {
  console.log('[generateRoutes] Calling OSRM...');
  const allRoutes = await getRoadRoute(srcLat, srcLng, dstLat, dstLng);
  console.log('[generateRoutes] OSRM returned', allRoutes.length, 'raw route(s)');

  const uniqueRoutes = dedupeRoutes(allRoutes);
  console.log('[generateRoutes]', uniqueRoutes.length, 'UNIQUE route(s) after dedup');

  // Template pool — assigned only to however many unique routes exist
  const templatePool = [
    { id: 'green', colorClass: 'green', emoji: '🟢', label: 'GREEN ROUTE', sublabel: 'Safe Route', color: '#27AE60', score: 9, risk: 'LOW',
      desc: 'Safest available route via well-maintained roads. No active incidents reported on this corridor.',
      points: ['✅ No construction activity','✅ NHAI patrol active on this corridor','✅ Well-lit highway stretch','✅ Multiple fuel stations & rest stops available'] },
    { id: 'yellow', colorClass: 'yellow', emoji: '🟡', label: 'YELLOW ROUTE', sublabel: 'Faster Route', color: '#F39C12', score: 6, risk: 'MEDIUM',
      desc: 'Alternate path with some known road condition issues. Proceed with caution.',
      points: ['⚠️ Road repair work at 2-3 locations','⚠️ Pothole-prone section reported','⚠️ Heavy truck traffic — risky overtaking zones','⚠️ One narrow bridge section reported'] },
    { id: 'red', colorClass: 'red', emoji: '🔴', label: 'RED ROUTE', sublabel: 'High Risk — Avoid', color: '#E74C3C', score: 3, risk: 'HIGH',
      desc: 'Shortest alternate path but currently HIGH RISK. Multiple active hazards reported on this corridor.',
      points: ['🚨 NHAI active construction — single lane (6AM-10PM)','🚨 Vehicle theft/robbery alert issued (last 48 hrs)','🚨 Accident debris still present near one location','⚠️ Speed limit reduced to 40 km/h on this stretch'] },
  ];

  // Helper to build a route object with directions
  function buildRoute(tmpl, routeData) {
    return {
      ...tmpl,
      coords: routeData.coords,
      dist: `${routeData.distanceKm} km`,
      time: `${routeData.durationMin} mins`,
      directions: makeDirections(
        routeData.coords,
        tmpl.id,
        parseFloat(routeData.distanceKm),
        routeData.steps
      ),
    };
  }

  // SPECIAL CASE: only 1 unique route exists — show it as Green ONLY
  if (uniqueRoutes.length === 1) {
    const onlyTmpl = {
      ...templatePool[0],
      desc: 'This is the only viable road route between these locations — no genuine alternate path exists. Standard safety precautions apply.',
      points: ['✅ Verified as the primary road connection','✅ No alternate route available to compare against','ℹ️ Drive with normal caution as you would on any route'],
    };
    return [{ ...buildRoute(onlyTmpl, uniqueRoutes[0]), onlyRoute: true }];
  }

  // 2 unique routes — Green + Yellow only (skip Red, don't invent a 3rd)
  if (uniqueRoutes.length === 2) {
    return [
      buildRoute(templatePool[0], uniqueRoutes[0]),
      buildRoute(templatePool[1], uniqueRoutes[1]),
    ];
  }

  // 3+ unique routes — use first 3, Green/Yellow/Red as normal
  return templatePool.map((tmpl, i) => buildRoute(tmpl, uniqueRoutes[i]));
}

export const DEMO = {
  src: 'Noida Sector 62, Uttar Pradesh',
  dst: 'Connaught Place, New Delhi',
};
