import React, { useState } from 'react';
import { MapPin, Plus, Check, Trash2, Search, X, Star } from 'lucide-react';
import { LocationItem } from '../types';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: LocationItem[];
  currentLocation: LocationItem | null;
  onSelectLocation: (loc: LocationItem) => void;
  onLocationAdded: () => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  locations,
  currentLocation,
  onSelectLocation,
  onLocationAdded
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // Custom coordinate input state
  const [customName, setCustomName] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');
  const [customTimezone, setCustomTimezone] = useState('auto');

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/locations/search?query=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddLocation = async (name: string, latitude: number, longitude: number, timezone?: string) => {
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          latitude,
          longitude,
          timezone: timezone || 'auto'
        })
      });
      if (res.ok) {
        onLocationAdded();
        setSearchQuery('');
        setSearchResults([]);
        setIsAddingCustom(false);
      }
    } catch (err) {
      console.error('Failed to add location:', err);
    }
  };

  const handleDeleteLocation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Remove this saved construction site location?')) return;
    try {
      const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onLocationAdded();
      }
    } catch (err) {
      console.error('Failed to delete location:', err);
    }
  };

  const handleSetDefault = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/locations/${id}/default`, { method: 'POST' });
      if (res.ok) {
        onLocationAdded();
      }
    } catch (err) {
      console.error('Failed to set default location:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-200">
              CONSTRUCTION SITES & LOCATIONS
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Active Saved Locations List */}
          <div>
            <h4 className="text-xs font-mono font-bold uppercase text-slate-400 mb-2">
              SAVED SITE LOCATIONS
            </h4>
            <div className="space-y-2">
              {locations.map((loc) => {
                const isSelected = currentLocation?.id === loc.id;
                return (
                  <div
                    key={loc.id}
                    onClick={() => {
                      onSelectLocation(loc);
                      onClose();
                    }}
                    className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                      isSelected
                        ? 'bg-amber-950/20 border-amber-500/50'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-200 truncate">{loc.name}</span>
                        {loc.isDefault && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">
                        {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)} · {loc.timezone}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!loc.isDefault && (
                        <button
                          onClick={(e) => handleSetDefault(loc.id, e)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors"
                          title="Set as Default Site"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {locations.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteLocation(loc.id, e)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 transition-colors"
                          title="Delete Location"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Site Section */}
          <div className="pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-mono font-bold uppercase text-slate-400">
                ADD NEW CONSTRUCTION SITE
              </h4>
              <button
                onClick={() => setIsAddingCustom(!isAddingCustom)}
                className="text-xs font-mono text-amber-400 hover:text-amber-300"
              >
                {isAddingCustom ? 'Search by City/Place' : '+ Add by Coordinates'}
              </button>
            </div>

            {!isAddingCustom ? (
              /* Search by city */
              <div>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search city, suburb or landmark..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                    {searchResults.map((r, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded bg-slate-950 border border-slate-800 hover:border-amber-500/50 flex items-center justify-between text-xs font-mono transition-colors"
                      >
                        <div>
                          <div className="font-bold text-slate-200">
                            {r.name}, {r.admin1 || ''} {r.country || ''}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const fullName = `${r.name}, ${r.admin1 || r.country || ''}`;
                            handleAddLocation(fullName, r.latitude, r.longitude, r.timezone);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-slate-300 font-bold transition-colors"
                        >
                          Add Site
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Custom Coordinates Form */
              <div className="space-y-3 text-xs font-mono">
                <div>
                  <label className="text-slate-400 block mb-1">Site / Project Name:</label>
                  <input
                    type="text"
                    placeholder="e.g. North Tower Construction Site"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Latitude:</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="-34.9285"
                      value={customLat}
                      onChange={(e) => setCustomLat(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Longitude:</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="138.6007"
                      value={customLon}
                      onChange={(e) => setCustomLon(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const lat = parseFloat(customLat);
                    const lon = parseFloat(customLon);
                    if (!customName || isNaN(lat) || isNaN(lon)) {
                      alert('Please provide valid site name and coordinates.');
                      return;
                    }
                    handleAddLocation(customName, lat, lon, customTimezone);
                  }}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-xs font-mono transition-colors"
                >
                  Save Coordinates Location
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
