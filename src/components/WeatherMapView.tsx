import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CloudRain,
  CloudLightning,
  Wind,
  Radar,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RefreshCw,
  Layers,
  MapPin,
  Gauge
} from 'lucide-react';
import { CurrentWeather, LocationItem } from '../types';
import { RainDirection, sumPrecipitationWindow } from '../utils/rainAccum';

export type MapLayer = 'radar' | 'rain' | 'wind' | 'lightning';

type RainView = 'now' | 'accum';
type RainHours = 1 | 3 | 6 | 24;

interface WeatherMapViewProps {
  location: LocationItem | null;
  current: CurrentWeather | null;
  /** Layers to enable on first render (e.g. ['radar','lightning'] from the storm card). */
  initialLayers?: MapLayer[];
}

interface RadarFrame {
  time: number;
  path: string;
}

interface GridPoint {
  lat: number;
  lon: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
  lightningPotential: number;
  cape: number;
  /** Hourly precipitation (mm) starting from the current hour. */
  precipHourly: number[];
}

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const RAINVIEWER_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const GRID_RADIUS = 2; // 5x5 sample grid centred on the site
const GRID_SPAN_LAT = 0.35; // degrees
const GRID_SPAN_LON = 0.45; // degrees
const RADAR_SPEEDS = [
  { label: '0.5x', ms: 900 },
  { label: '1x', ms: 600 },
  { label: '2x', ms: 300 }
];
const RAIN_HOUR_OPTIONS: RainHours[] = [1, 3, 6, 24];

/** Colour ramp for instantaneous rain intensity (mm/h). */
function intensityColor(mmh: number): string {
  if (mmh >= 15) return '#7c3aed';
  if (mmh >= 6) return '#2563eb';
  if (mmh >= 2) return '#0ea5e9';
  return '#7dd3fc';
}

/** Colour ramp for accumulated rain (mm over the selected window). */
function accumulationColor(mm: number): string {
  if (mm >= 30) return '#7c3aed';
  if (mm >= 15) return '#2563eb';
  if (mm >= 5) return '#0ea5e9';
  if (mm >= 1) return '#38bdf8';
  return '#7dd3fc';
}

/** Colour ramp for wind speed (km/h). */
function windColor(kmh: number): string {
  if (kmh >= 60) return '#ef4444';
  if (kmh >= 45) return '#f97316';
  if (kmh >= 30) return '#facc15';
  if (kmh >= 18) return '#38bdf8';
  return '#22d3ee';
}

/** Colour ramp for lightning potential (J/kg). */
function lightningColor(lpi: number): string {
  if (lpi >= 1000) return '#dc2626';
  if (lpi >= 500) return '#f97316';
  if (lpi >= 100) return '#a855f7';
  return '#6366f1';
}

export const WeatherMapView: React.FC<WeatherMapViewProps> = ({ location, current, initialLayers }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarTileRef = useRef<L.TileLayer | null>(null);
  const siteMarkerRef = useRef<L.CircleMarker | null>(null);
  const windLayerRef = useRef<L.LayerGroup | null>(null);
  const rainLayerRef = useRef<L.LayerGroup | null>(null);
  const lightningLayerRef = useRef<L.LayerGroup | null>(null);
  const preloadBoundRef = useRef(false);

  const [activeLayers, setActiveLayers] = useState<Set<MapLayer>>(
    () => new Set<MapLayer>(initialLayers && initialLayers.length > 0 ? initialLayers : ['radar', 'wind'])
  );
  const [rainView, setRainView] = useState<RainView>('now');
  const [rainDirection, setRainDirection] = useState<RainDirection>('next');
  const [rainHours, setRainHours] = useState<RainHours>(3);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarHost, setRadarHost] = useState<string>('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [radarStatus, setRadarStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [gridStatus, setGridStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [grid, setGrid] = useState<GridPoint[]>([]);
  const [timeAxis, setTimeAxis] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const lat = location?.latitude ?? 0;
  const lon = location?.longitude ?? 0;
  const place = location?.name ?? 'Monitored Site';

  const toggleLayer = useCallback((layer: MapLayer) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------- Map setup
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lon],
      zoom: 9,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    windLayerRef.current = L.layerGroup().addTo(map);
    rainLayerRef.current = L.layerGroup();
    lightningLayerRef.current = L.layerGroup();

    // Leaflet needs a size recalculation once the container is laid out.
    const resize = () => map.invalidateSize();
    const t = setTimeout(resize, 120);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(containerRef.current);

    return () => {
      clearTimeout(t);
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      radarTileRef.current = null;
      siteMarkerRef.current = null;
      windLayerRef.current = null;
      rainLayerRef.current = null;
      lightningLayerRef.current = null;
      preloadBoundRef.current = false;
    };
    // Map is created once; recentring happens in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentre + keep the site marker in sync when the monitored location changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([lat, lon], map.getZoom(), { animate: true });
    if (!siteMarkerRef.current) {
      siteMarkerRef.current = L.circleMarker([lat, lon], {
        radius: 6,
        color: '#f59e0b',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.35
      })
        .bindTooltip(place, { direction: 'top' })
        .addTo(map);
    } else {
      siteMarkerRef.current.setLatLng([lat, lon]);
      siteMarkerRef.current.setTooltipContent(place);
    }
  }, [lat, lon, place]);

  // ------------------------------------------------------------- Radar frames
  const loadRadar = useCallback(async () => {
    setRadarStatus('loading');
    try {
      const res = await fetch(RAINVIEWER_INDEX, { cache: 'no-store' });
      if (!res.ok) throw new Error(`RainViewer ${res.status}`);
      const data = await res.json();
      const past: RadarFrame[] = (data?.radar?.past ?? []).map((f: any) => ({ time: f.time, path: f.path }));
      const nowcast: RadarFrame[] = (data?.radar?.nowcast ?? []).map((f: any) => ({ time: f.time, path: f.path }));
      const frames = [...past, ...nowcast];
      if (frames.length === 0) throw new Error('No radar frames');
      setRadarHost(data.host || 'https://tilecache.rainviewer.com');
      setRadarFrames(frames);
      setFrameIndex(Math.max(0, past.length - 1));
      setRadarStatus('ready');
      setLastUpdated(new Date().toISOString());
    } catch {
      setRadarStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadRadar();
    const interval = setInterval(() => void loadRadar(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadRadar]);

  /** Builds the a single frame's tile URL. */
  const frameTileUrl = useCallback(
    (frame: RadarFrame) => `${radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
    [radarHost]
  );

  // Apply the selected radar frame as the (single) active tile layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!activeLayers.has('radar') || radarFrames.length === 0 || !radarHost) {
      if (radarTileRef.current) {
        map.removeLayer(radarTileRef.current);
        radarTileRef.current = null;
      }
      return;
    }

    const frame = radarFrames[Math.min(frameIndex, radarFrames.length - 1)];
    if (radarTileRef.current) map.removeLayer(radarTileRef.current);
    radarTileRef.current = L.tileLayer(frameTileUrl(frame), {
      opacity: 0.72,
      tileSize: 256,
      attribution: 'Radar &copy; RainViewer',
      zIndex: 5,
      keepBuffer: 4,
      updateWhenZooming: false
    }).addTo(map);
  }, [activeLayers, radarFrames, radarHost, frameIndex, frameTileUrl]);

  /**
   * Warms the browser image cache for every radar frame across the current
   * viewport so the animation loop plays smoothly (no per-frame stutter). Bounded
   * and best-effort; runs once per viewport.
   */
  const preloadRadarFrames = useCallback(() => {
    const map = mapRef.current;
    if (!map || radarFrames.length < 2 || !radarHost) return;

    try {
      const bounds = map.getPixelBounds();
      const zoom = Math.round(map.getZoom());
      if (zoom < 6) return; // too many tiles when zoomed far out
      const min = bounds.min.divideBy(256).floor();
      const max = bounds.max.divideBy(256).floor();
      const tilesX = Math.min(4, Math.max(1, max.x - min.x + 1));
      const tilesY = Math.min(4, Math.max(1, max.y - min.y + 1));
      const cap = 140;
      let count = 0;
      for (let x = min.x; x < min.x + tilesX; x++) {
        for (let y = min.y; y < min.y + tilesY; y++) {
          for (const frame of radarFrames) {
            const url = `${radarHost}${frame.path}/256/${zoom}/${x}/${y}/2/1_1.png`;
            const img = new Image();
            img.decoding = 'async';
            img.src = url;
            if (++count >= cap) return;
          }
        }
      }
    } catch {
      /* preloading is purely an optimisation */
    }
  }, [radarFrames, radarHost]);

  // Kick off preloading shortly after full frames land, and refresh on pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || radarFrames.length < 2) return;

    const timer = setTimeout(preloadRadarFrames, 700);

    if (!preloadBoundRef.current) {
      preloadBoundRef.current = true;
      let moveTimer: ReturnType<typeof setTimeout> | null = null;
      const onMove = () => {
        if (moveTimer) clearTimeout(moveTimer);
        moveTimer = setTimeout(preloadRadarFrames, 600);
      };
      map.on('moveend', onMove);
      map.on('zoomend', onMove);
    } else {
      // Subsequent frame refreshes still re-warm the current viewport.
      preloadRadarFrames();
    }

    return () => clearTimeout(timer);
  }, [radarFrames, preloadRadarFrames]);

  // Animate frames while playing (speed controlled by the operator).
  useEffect(() => {
    if (!playing || radarFrames.length === 0) return;
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % radarFrames.length);
    }, RADAR_SPEEDS[speedIdx].ms);
    return () => clearInterval(id);
  }, [playing, radarFrames.length, speedIdx]);

  // ------------------------------------------------------------- Grid sampling
  const loadGrid = useCallback(async () => {
    setGridStatus('loading');
    try {
      const lats: number[] = [];
      const lons: number[] = [];
      for (let i = -GRID_RADIUS; i <= GRID_RADIUS; i++) {
        for (let j = -GRID_RADIUS; j <= GRID_RADIUS; j++) {
          lats.push(lat + (i * GRID_SPAN_LAT) / GRID_RADIUS);
          lons.push(lon + (j * GRID_SPAN_LON) / GRID_RADIUS);
        }
      }
      const url = new URL(OPEN_METEO);
      url.searchParams.set('latitude', lats.map((v) => v.toFixed(4)).join(','));
      url.searchParams.set('longitude', lons.map((v) => v.toFixed(4)).join(','));
      url.searchParams.set(
        'current',
        'precipitation,wind_speed_10m,wind_direction_10m,lightning_potential,cape,weather_code'
      );
      url.searchParams.set('hourly', 'precipitation');
      // Past hours let the rain layer show how much has already fallen; forward
      // hours cover accumulation forecasts.
      url.searchParams.set('past_hours', '24');
      url.searchParams.set('forecast_hours', '24');
      url.searchParams.set('timezone', 'auto');
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const json = await res.json();
      const arr: any[] = Array.isArray(json) ? json : [json];
      if (arr[0]?.hourly?.time) setTimeAxis(arr[0].hourly.time as string[]);
      const points: GridPoint[] = arr.map((entry: any, idx: number) => ({
        lat: Number(entry?.latitude ?? lats[idx]),
        lon: Number(entry?.longitude ?? lons[idx]),
        precipitation: Math.max(0, Number(entry?.current?.precipitation ?? 0)),
        windSpeed: Math.max(0, Number(entry?.current?.wind_speed_10m ?? 0)),
        windDirection: Number(entry?.current?.wind_direction_10m ?? 0),
        lightningPotential: Math.max(0, Number(entry?.current?.lightning_potential ?? 0)),
        cape: Math.max(0, Number(entry?.current?.cape ?? 0)),
        precipHourly: Array.isArray(entry?.hourly?.precipitation)
          ? entry.hourly.precipitation.map((v: unknown) => Math.max(0, Number(v) || 0))
          : []
      }));
      setGrid(points);
      setGridStatus('ready');
    } catch {
      setGridStatus('error');
    }
  }, [lat, lon]);

  useEffect(() => {
    void loadGrid();
    const interval = setInterval(() => void loadGrid(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadGrid]);

  // Index of the current hour in the hourly axis (start of accumulation windows).
  const startHourIdx = useMemo(() => {
    if (timeAxis.length === 0) return 0;
    const now = Date.now();
    let idx = 0;
    for (let i = 0; i < timeAxis.length; i++) {
      if (new Date(timeAxis[i]).getTime() <= now) idx = i;
      else break;
    }
    return idx;
  }, [timeAxis]);

  /**
   * Sums hourly precipitation over a window (see utils/rainAccum for the rules).
   */
  const accumulation = useCallback(
    (p: GridPoint, hours: number, direction: RainDirection): number =>
      sumPrecipitationWindow(p.precipHourly, startHourIdx, hours, direction),
    [startHourIdx]
  );

  // Render wind arrows from the sampled grid.
  useEffect(() => {
    const map = mapRef.current;
    const layer = windLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!activeLayers.has('wind')) {
      map.removeLayer(layer);
      return;
    }
    if (!map.hasLayer(layer)) layer.addTo(map);

    for (const p of grid) {
      const size = Math.min(34, Math.max(16, 14 + p.windSpeed * 0.35));
      const color = windColor(p.windSpeed);
      // Meteorological direction is where the wind blows FROM; the arrow points
      // where it is going (opposite).
      const rotation = p.windDirection + 180;
      const html = `<div style="transform:rotate(${rotation}deg);transform-origin:center;display:flex;align-items:center;justify-content:center;">
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 L12 20" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M12 2 L7 8 L12 6.5 L17 8 Z" fill="${color}"/>
        </svg></div>`;
      L.marker([p.lat, p.lon], {
        interactive: true,
        icon: L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        zIndexOffset: 200
      })
        .bindTooltip(`${Math.round(p.windSpeed)} km/h · ${Math.round(p.windDirection)}°`, { direction: 'top' })
        .addTo(layer);
    }
  }, [grid, activeLayers]);

  // Render the rain layer: instantaneous intensity, or accumulated mm over a window.
  useEffect(() => {
    const map = mapRef.current;
    const layer = rainLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!activeLayers.has('rain')) {
      map.removeLayer(layer);
      return;
    }
    if (!map.hasLayer(layer)) layer.addTo(map);

    const showAccum = rainView === 'accum';

    for (const p of grid) {
      if (!showAccum) {
        if (p.precipitation <= 0.05) continue;
        const color = intensityColor(p.precipitation);
        L.circleMarker([p.lat, p.lon], {
          radius: Math.min(26, 6 + p.precipitation * 3),
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: Math.min(0.6, 0.2 + p.precipitation * 0.05)
        })
          .bindTooltip(`${p.precipitation.toFixed(1)} mm/h now`, { direction: 'top' })
          .addTo(layer);
      } else {
        const total = accumulation(p, rainHours, rainDirection);
        if (total <= 0.05) continue;
        const color = accumulationColor(total);
        const when = rainDirection === 'past' ? `past ${rainHours}h` : `next ${rainHours}h`;
        L.circleMarker([p.lat, p.lon], {
          radius: Math.min(28, 6 + Math.sqrt(total) * 3.2),
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: Math.min(0.62, 0.22 + total * 0.02)
        })
          .bindTooltip(`${total.toFixed(1)} mm (${when})`, { direction: 'top' })
          .addTo(layer);
      }
    }
  }, [grid, activeLayers, rainView, rainDirection, rainHours, accumulation]);

  // Render lightning-potential circles from the sampled grid.
  useEffect(() => {
    const map = mapRef.current;
    const layer = lightningLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!activeLayers.has('lightning')) {
      map.removeLayer(layer);
      return;
    }
    if (!map.hasLayer(layer)) layer.addTo(map);

    for (const p of grid) {
      const score = Math.max(p.lightningPotential, p.cape);
      if (score <= 0) continue;
      const color = lightningColor(p.lightningPotential || p.cape);
      L.circleMarker([p.lat, p.lon], {
        radius: Math.min(30, 5 + Math.sqrt(score) * 0.6),
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.3
      })
        .bindTooltip(`LPI ${Math.round(p.lightningPotential)} J/kg · CAPE ${Math.round(p.cape)} J/kg`, {
          direction: 'top'
        })
        .addTo(layer);
    }
  }, [grid, activeLayers]);

  const frameLabel = useMemo(() => {
    if (radarFrames.length === 0) return '—';
    const frame = radarFrames[Math.min(frameIndex, radarFrames.length - 1)];
    return new Date(frame.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [radarFrames, frameIndex]);

  const layerButtons: { id: MapLayer; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'radar', label: 'Radar', icon: Radar },
    { id: 'rain', label: 'Rain', icon: CloudRain },
    { id: 'wind', label: 'Wind', icon: Wind },
    { id: 'lightning', label: 'Lightning', icon: CloudLightning }
  ];

  const step = (delta: number) => {
    if (radarFrames.length === 0) return;
    setPlaying(false);
    setFrameIndex((i) => (i + delta + radarFrames.length) % radarFrames.length);
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-500/10 to-amber-400/5 border border-amber-500/30 shadow-sm">
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-slate-100">Live Weather Map</h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3 h-3 text-amber-400" />
                {place}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {layerButtons.map(({ id, label, icon: Icon }) => {
              const active = activeLayers.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleLayer(id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all shadow-sm cursor-pointer ${
                    active
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:text-slate-100 hover:border-slate-600/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Radar timeline / loop controls */}
        {activeLayers.has('radar') && (
          <div className="space-y-2 bg-slate-950/70 border border-slate-800/80 rounded-xl px-3 py-2.5 shadow-sm">
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={radarFrames.length === 0}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700/80 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                aria-label="Previous radar frame"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                disabled={radarFrames.length === 0}
                className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-400/10 hover:from-amber-500/30 hover:to-amber-400/15 border border-amber-500/40 text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={radarFrames.length === 0}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700/80 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                aria-label="Next radar frame"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                min={0}
                max={Math.max(0, radarFrames.length - 1)}
                value={frameIndex}
                onChange={(e) => {
                  setPlaying(false);
                  setFrameIndex(Number(e.target.value));
                }}
                disabled={radarFrames.length === 0}
                className="flex-1 min-w-[130px] accent-amber-500"
                aria-label="Radar frame"
              />
              <span className="text-2xs font-mono text-slate-300 tabular-nums w-14 text-right">{frameLabel}</span>

              {/* Playback speed */}
              <button
                type="button"
                onClick={() => setSpeedIdx((i) => (i + 1) % RADAR_SPEEDS.length)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700/80 text-2xs font-mono text-slate-300 cursor-pointer shadow-sm"
                title="Radar loop speed"
              >
                <Gauge className="w-3 h-3 text-slate-400" />
                {RADAR_SPEEDS[speedIdx].label}
              </button>

              <button
                type="button"
                onClick={() => void loadRadar()}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700/80 text-slate-300 cursor-pointer shadow-sm"
                aria-label="Refresh radar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${radarStatus === 'loading' ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center justify-between text-2xs font-mono text-slate-500">
              <span>{radarStatus === 'ready' ? `${radarFrames.length} frames · past → nowcast` : 'Loading radar…'}</span>
              <span>{playing ? 'Playing' : 'Paused'}</span>
            </div>
          </div>
        )}

        {/* Rain view / accumulation window selector */}
        {activeLayers.has('rain') && (
          <div className="flex items-center gap-2 flex-wrap bg-slate-950/70 border border-slate-800/80 rounded-xl px-3 py-2 shadow-sm">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Rain:</span>
            <button
              type="button"
              onClick={() => setRainView('now')}
              className={`px-2 py-1 rounded-lg text-2xs font-mono border transition-all cursor-pointer ${
                rainView === 'now'
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:text-slate-100 hover:border-slate-600/80'
              }`}
              title="Instantaneous rain intensity"
            >
              Now
            </button>

            {/* Accumulation direction: already fallen vs forecast */}
            <div className="flex items-center rounded-lg overflow-hidden border border-slate-700/80 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setRainView('accum');
                  setRainDirection('past');
                }}
                className={`px-2 py-1 text-2xs font-mono transition-all cursor-pointer ${
                  rainView === 'accum' && rainDirection === 'past'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'bg-slate-800/80 text-slate-300 hover:text-slate-100'
                }`}
                title="Rain that has already fallen (last N hours)"
              >
                Past
              </button>
              <button
                type="button"
                onClick={() => {
                  setRainView('accum');
                  setRainDirection('next');
                }}
                className={`px-2 py-1 text-2xs font-mono border-l border-slate-700/80 transition-all cursor-pointer ${
                  rainView === 'accum' && rainDirection === 'next'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'bg-slate-800/80 text-slate-300 hover:text-slate-100'
                }`}
                title="Rain forecast (next N hours)"
              >
                Next
              </button>
            </div>

            {rainView === 'accum' &&
              RAIN_HOUR_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setRainHours(h)}
                  className={`px-2 py-1 rounded-lg text-2xs font-mono border transition-all cursor-pointer ${
                    rainHours === h
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:text-slate-100 hover:border-slate-600/80'
                  }`}
                >
                  {h}h
                </button>
              ))}
          </div>
        )}

        <div className="relative rounded-2xl overflow-hidden border border-slate-800/80 shadow-sm">
          <div ref={containerRef} className="h-[52vh] min-h-[340px] w-full bg-slate-950" />

          {/* Layer legend */}
          <div className="absolute bottom-2 left-2 z-[500] flex flex-col gap-1.5 bg-slate-950/90 border border-slate-800/80 rounded-xl px-2.5 py-2 text-[10px] font-mono text-slate-300 shadow-sm backdrop-blur">
            {activeLayers.has('wind') && (
              <div className="flex items-center gap-1.5">
                <Wind className="w-3 h-3 text-cyan-400" />
                <span>Wind arrows · colour = speed</span>
              </div>
            )}
            {activeLayers.has('rain') && (
              <div className="flex items-center gap-1.5">
                <CloudRain className="w-3 h-3 text-sky-400" />
                <span>
                  {rainView === 'now'
                    ? 'Rain now · size = mm/h'
                    : `${rainDirection === 'past' ? 'Fallen' : 'Forecast'} · ${rainDirection} ${rainHours}h`}
                </span>
              </div>
            )}
            {activeLayers.has('lightning') && (
              <div className="flex items-center gap-1.5">
                <CloudLightning className="w-3 h-3 text-purple-400" />
                <span>Storm energy · LPI / CAPE</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap text-2xs font-mono text-slate-400">
          <span>
            {radarStatus === 'error' && 'Radar feed unavailable — showing other layers.'}
            {radarStatus === 'ready' && activeLayers.has('radar') && `Radar: RainViewer · frame ${frameLabel}`}
            {gridStatus === 'error' && ' Wind/rain/lightning grid unavailable.'}
            {gridStatus === 'loading' && ' Sampling local grid…'}
          </span>
          <span>{lastUpdated ? `Radar refreshed ${new Date(lastUpdated).toLocaleTimeString()}` : ''}</span>
        </div>
      </div>

      {current && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="text-2xs font-mono uppercase text-slate-400">Wind (site)</div>
            <div className="text-lg font-bold text-slate-100">{Math.round(current.windSpeed)} km/h</div>
            <div className="text-2xs font-mono text-slate-500">
              {typeof current.windDirection === 'number' ? `${Math.round(current.windDirection)}°` : '—'}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="text-2xs font-mono uppercase text-slate-400">Rain (site)</div>
            <div className="text-lg font-bold text-slate-100">{current.rainAmount.toFixed(1)} mm/h</div>
            <div className="text-2xs font-mono text-slate-500">{Math.round(current.rainProbability)}% probability</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="text-2xs font-mono uppercase text-slate-400">Lightning (LPI)</div>
            <div className="text-lg font-bold text-slate-100">{Math.round(current.lightningPotential ?? 0)}</div>
            <div className="text-2xs font-mono text-slate-500">J/kg potential index</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="text-2xs font-mono uppercase text-slate-400">Storm energy (CAPE)</div>
            <div className="text-lg font-bold text-slate-100">{Math.round(current.cape ?? 0)}</div>
            <div className="text-2xs font-mono text-slate-500">J/kg</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherMapView;
