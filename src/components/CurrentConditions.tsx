import React from 'react';
import {
  Wind,
  Droplets,
  CloudRain,
  Sun,
  Gauge,
  Thermometer,
  CloudLightning,
  Cloud,
  Eye
} from 'lucide-react';
import { CurrentWeather } from '../types';

interface CurrentConditionsProps {
  weather: CurrentWeather | null;
  tempUnit?: 'C' | 'F';
  windUnit?: 'km/h' | 'mph' | 'm/s';
}

export const CurrentConditions: React.FC<CurrentConditionsProps> = ({
  weather,
  tempUnit = 'C',
  windUnit = 'km/h'
}) => {
  if (!weather) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 font-mono text-sm">
        Weather data unavailable. Run check to fetch live conditions.
      </div>
    );
  }

  const formatTemp = (celsius: number) => {
    if (typeof celsius !== 'number' || isNaN(celsius)) return '—';
    if (tempUnit === 'F') return `${Math.round((celsius * 9) / 5 + 32)}°F`;
    return `${Math.round(celsius)}°C`;
  };

  const formatWind = (kmh: number) => {
    if (typeof kmh !== 'number' || isNaN(kmh)) return '—';
    if (windUnit === 'mph') return `${Math.round(kmh * 0.621371)} mph`;
    if (windUnit === 'm/s') return `${(kmh / 3.6).toFixed(1)} m/s`;
    return `${Math.round(kmh)} km/h`;
  };

  const getWeatherIcon = (code: number) => {
    if (code >= 95) return CloudLightning;
    if (code >= 51 && code <= 82) return CloudRain;
    if (code === 0 || code === 1) return Sun;
    return Cloud;
  };

  const WeatherIcon = getWeatherIcon(weather.weatherCode);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <WeatherIcon className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
            CURRENT ONSITE CONDITIONS
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {weather.weatherDescription}
        </span>
      </div>

      {/* Grid of Key Construction Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Wind Gusts (Dominant Construction Factor) */}
        <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/90 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Wind Gusts</span>
            <Wind className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {formatWind(weather.windGusts)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            Peak instantaneous
          </div>
        </div>

        {/* 2. Sustained Wind */}
        <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/90">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Sustained Wind</span>
            <Wind className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {formatWind(weather.windSpeed)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            10-meter height
          </div>
        </div>

        {/* 3. Rain Probability & Amount */}
        <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/90">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Precipitation</span>
            <CloudRain className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {Math.round(weather.rainProbability)}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            Rate: {weather.rainAmount.toFixed(1)} mm/h
          </div>
        </div>

        {/* 4. Temperature & Feels Like */}
        <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/90">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Temperature</span>
            <Thermometer className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {formatTemp(weather.temperature)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            Feels like: {formatTemp(weather.feelsLike)}
          </div>
        </div>

        {/* 5. Solar UV Radiation */}
        <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/90">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">UV Radiation</span>
            <Sun className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {weather.uvIndex.toFixed(1)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            {weather.uvIndex >= 11
              ? 'Extreme'
              : weather.uvIndex >= 8
              ? 'Very High'
              : weather.uvIndex >= 6
              ? 'High'
              : weather.uvIndex >= 3
              ? 'Moderate'
              : 'Low'}
          </div>
        </div>

        {/* 6. Humidity & Pressure */}
        <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/90">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Humidity / Press</span>
            <Droplets className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {Math.round(weather.humidity)}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            {Math.round(weather.pressure)} hPa
          </div>
        </div>
      </div>
    </div>
  );
};
