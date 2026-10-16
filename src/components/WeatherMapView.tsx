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
  RefreshCw,
  Layers,
  MapPin
} from 'lucide-react';
import { CurrentWeather, LocationItem } from '../types';

type MapLayer = 'radar' | 'rain' | 'wind' | 'lightning';

interface WeatherMapViewProps {
  location: LocationItem | null;
  current: CurrentWeather | null;
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
}

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const RAINVIEWER_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const GRID_RADIUS = 2; // 5x5 sample grid centred on the site
const GRID_SPAN_LAT = 0.35; // degrees
const GRID_SPAN_LON = 0.45; // degrees

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

export const WeatherMapView: React.FC<WeatherMapViewProps> = ({ location, current }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarTileRef = useRef<L.TileLayer | null>(null);
  const siteMarkerRef = useRef<L.CircleMarker | null>(null);
  const windLayerRef = useRef<L.LayerGroup | null>(null);
  const rainLayerRef = useRef<L.LayerGroup | null>(null);
  const lightningLayerRef = useRef<L.LayerGroup | null>(null);

  const [activeLayers, setActiveLayers] = useState<Set<MapLayer>>(() => new Set<MapLayer>(['radar', 'wind']));
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarHost, setRadarHost] = useState<string>('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [radarStatus, setRadarStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [gridStatus, setGridStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [grid, setGrid] = useState<GridPoint[]>([]);
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

    // Site marker (canvas-based, so no default-icon asset issues under bundlers).
    siteMarkerRef.current = L.circleMarker([lat, lon], {
      radius: 6,
      color: '#f59e0b',
      weight: 2,
      fillColor: '#f59e0b',
      fillOpacity: 0.35
    })
      .bindTooltip(place, { direction: 'top' })
      .addTo(map);

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
    };
    // Map is created once; recentring happens in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentre when the monitored location changes.
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
      // Start on the most recent observed frame (index of last "past" frame).
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

  // Apply the selected radar frame as a tile layer.
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
    const url = `${radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    if (radarTileRef.current) map.removeLayer(radarTileRef.current);
    radarTileRef.current = L.tileLayer(url, {
      opacity: 0.7,
      tileSize: 256,
      attribution: 'Radar &copy; RainViewer',
      zIndex: 5
    }).addTo(map);
  }, [activeLayers, radarFrames, radarHost, frameIndex]);

  // Animate frames while playing.
  useEffect(() => {
    if (!playing || radarFrames.length === 0) return;
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % radarFrames.length);
    }, 600);
    return () => clearInterval(id);
  }, [playing, radarFrames.length]);

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
      url.searchParams.set('timezone', 'auto');
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const json = await res.json();
      const arr: any[] = Array.isArray(json) ? json : [json];
      const points: GridPoint[] = arr.map((entry: any, idx: number) => ({
        lat: Number(entry?.latitude ?? lats[idx]),
        lon: Number(entry?.longitude ?? lons[idx]),
        precipitation: Math.max(0, Number(entry?.current?.precipitation ?? 0)),
        windSpeed: Math.max(0, Number(entry?.current?.wind_speed_10m ?? 0)),
        windDirection: Number(entry?.current?.wind_direction_10m ?? 0),
        lightningPotential: Math.max(0, Number(entry?.current?.lightning_potential ?? 0)),
        cape: Math.max(0, Number(entry?.current?.cape ?? 0))
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

  // Render rain-intensity circles from the sampled grid.
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

    for (const p of grid) {
      if (p.precipitation <= 0.05) continue;
      const radius = Math.min(26, 6 + p.precipitation * 3);
      L.circleMarker([p.lat, p.lon], {
        radius,
        color: '#38bdf8',
        weight: 1,
        fillColor: '#0ea5e9',
        fillOpacity: Math.min(0.6, 0.2 + p.precipitation * 0.05)
      })
        .bindTooltip(`${p.precipitation.toFixed(1)} mm/h rain`, { direction: 'top' })
        .addTo(layer);
    }
  }, [grid, activeLayers]);

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
      const radius = Math.min(30, 5 + Math.sqrt(score) * 0.6);
      L.circleMarker([p.lat, p.lon], {
        radius,
        color: lightningColor(p.lightningPotential || p.cape),
        weight: 1.5,
        fillColor: lightningColor(p.lightningPotential || p.cape),
        fillOpacity: 0.3
      })
        .bindTooltip(
          `LPI ${Math.round(p.lightningPotential)} J/kg · CAPE ${Math.round(p.cape)} J/kg`,
          { direction: 'top' }
        )
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

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">Live Weather Map</h3>
              <p className="text-2xs font-mono text-slate-400 flex items-center gap-1">
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
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Radar timeline (only meaningful while the radar layer is on). */}
        {activeLayers.has('radar') && (
          <div className="flex items-center gap-3 flex-wrap bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              disabled={radarFrames.length === 0}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 disabled:opacity-40 cursor-pointer"
              aria-label={playing ? 'Pause radar animation' : 'Play radar animation'}
            >
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
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
              className="flex-1 min-w-[140px] accent-amber-500"
              aria-label="Radar frame"
            />
            <span className="text-2xs font-mono text-slate-300 tabular-nums w-16 text-right">{frameLabel}</span>
            <button
              type="button"
              onClick={() => void loadRadar()}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 cursor-pointer"
              aria-label="Refresh radar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${radarStatus === 'loading' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        <div className="relative rounded-xl overflow-hidden border border-slate-800">
          <div ref={containerRef} className="h-[52vh] min-h-[340px] w-full bg-slate-950" />

          {/* Layer legend */}
          <div className="absolute bottom-2 left-2 z-[500] flex flex-col gap-1.5 bg-slate-950/85 border border-slate-800 rounded-lg px-2.5 py-2 text-[10px] font-mono text-slate-300">
            {activeLayers.has('wind') && (
              <div className="flex items-center gap-1.5">
                <Wind className="w-3 h-3 text-cyan-400" />
                <span>Wind arrows · colour = speed</span>
              </div>
            )}
            {activeLayers.has('rain') && (
              <div className="flex items-center gap-1.5">
                <CloudRain className="w-3 h-3 text-sky-400" />
                <span>Rain circles · size = mm/h</span>
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
