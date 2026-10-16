import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Check, Trash2, Search, X, Star, AlertCircle } from 'lucide-react';
import { LocationItem } from '../types';
import { useToast } from './ToastProvider';
import { apiFetch } from '../utils/api';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: LocationItem[];
  currentLocation: LocationItem | null;
  onSelectLocation: (loc: LocationItem) => void;
  onLocationAdded: () => void;
}

const LocationModalComponent: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  locations,
  currentLocation,
  onSelectLocation,
  onLocationAdded
}) => {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Custom coordinate input state
  const [customName, setCustomName] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');
  const [customTimezone, setCustomTimezone] = useState('auto');

  // Confirmation state for deleting
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch(`/api/locations/search?query=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleAddLocation = async (name: string, latitude: number, longitude: number, timezone?: string) => {
    setFormError(null);
    try {
      const res = await apiFetch('/api/locations', {
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
        toast.success(`Monitored site added: ${name}`);
        onLocationAdded();
        setSearchQuery('');
        setSearchResults([]);
        setIsAddingCustom(false);
        setCustomName('');
        setCustomLat('');
        setCustomLon('');
      } else {
        const err = await res.json();
        setFormError(err.error || 'Failed to add location.');
      }
    } catch {
      setFormError('Connection error while adding site location.');
    }
  };

  const handleDeleteLocation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/locations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.info('Location removed.');
        setDeletingId(null);
        onLocationAdded();
      } else {
        toast.error('Cannot remove active or default location.');
      }
    } catch {
      toast.error('Failed to delete location.');
    }
  };

  const handleSetDefault = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/locations/${id}/default`, { method: 'POST' });
      if (res.ok) {
        toast.success('Default monitored site updated.');
        onLocationAdded();
      }
    } catch {
      toast.error('Failed to update default location.');
    }
  };

  const handleCustomSubmit = () => {
    setFormError(null);
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);

    if (!customName.trim()) {
      setFormError('Please enter a site name.');
      return;
    }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setFormError('Latitude must be between -90 and +90.');
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setFormError('Longitude must be between -180 and +180.');
      return;
    }

    handleAddLocation(customName.trim(), lat, lon, customTimezone);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-modal-in duration-150">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MapPin className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-100">
                MONITORED CONSTRUCTION SITES
              </h3>
              <p className="text-2xs text-slate-400">
                Switch or add microclimate telemetry coordinate locations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close location modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {formError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{formError}</span>
            </div>
          )}

          {/* Saved Locations List */}
          <div>
            <div className="text-xs font-mono font-semibold uppercase text-slate-400 mb-2">
              Saved Monitored Sites ({locations.length})
            </div>
            <div className="space-y-2">
              {locations.map((loc) => {
                const isSelected = currentLocation?.id === loc.id;
                const isConfirmingDelete = deletingId === loc.id;

                return (
                  <div
                    key={loc.id}
                    onClick={() => {
                      onSelectLocation(loc);
                      onClose();
                    }}
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-sm'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-amber-400 ring-2 ring-amber-400/20' : 'bg-slate-600'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-200">{loc.name}</span>
                          {loc.isDefault && (
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-2xs font-mono text-slate-500 mt-0.5">
                          {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)} · {loc.timezone}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {!loc.isDefault && (
                        <button
                          type="button"
                          onClick={(e) => handleSetDefault(loc.id, e)}
                          title="Set as Default Site"
                          className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}

                      {locations.length > 1 && !loc.isDefault && (
                        isConfirmingDelete ? (
                          <div className="flex items-center gap-1 bg-red-950 border border-red-800 rounded px-1.5 py-0.5">
                            <span className="text-2xs text-red-300 font-mono">Delete?</span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteLocation(loc.id, e)}
                              className="text-xs text-red-400 font-bold hover:underline"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingId(null)}
                              className="text-xs text-slate-400 hover:underline"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeletingId(loc.id)}
                            title="Remove Site"
                            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}

                      {isSelected && <Check className="w-4 h-4 text-amber-400 ml-1 shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Site Section */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase text-slate-400">
                Add Construction Site
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCustom(!isAddingCustom);
                  setFormError(null);
                }}
                className="text-2xs font-mono text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {isAddingCustom ? 'Search by City Name' : 'Enter Lat/Long Coordinates'}
              </button>
            </div>

            {!isAddingCustom ? (
              /* City Geocoding Search (Debounced 350ms) */
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search city, suburb, or site landmark (e.g. Brisbane, Sydney)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto bg-slate-950/80 rounded-lg border border-slate-800 p-2">
                    {searchResults.map((r, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-md hover:bg-slate-900 border border-transparent hover:border-slate-800 flex items-center justify-between text-xs font-mono transition-colors"
                      >
                        <div>
                          <div className="font-bold text-slate-200">
                            {r.name}, {r.admin1 || ''} {r.country || ''}
                          </div>
                          <div className="text-2xs text-slate-500">
                            {r.latitude.toFixed(3)}, {r.longitude.toFixed(3)} · {r.timezone || 'auto'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const fullName = `${r.name}, ${r.admin1 || r.country || ''}`;
                            handleAddLocation(fullName, r.latitude, r.longitude, r.timezone);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 font-bold text-2xs transition-colors cursor-pointer"
                        >
                          Add Site
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Custom Coordinates Input */
              <div className="space-y-3 text-xs font-mono bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="text-slate-400 block mb-1">Site / Project Title:</label>
                  <input
                    type="text"
                    placeholder="e.g. Adelaide Pier 4 Crane Site"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Latitude (-90 to +90):</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="-34.9285"
                      value={customLat}
                      onChange={(e) => setCustomLat(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Longitude (-180 to +180):</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="138.6007"
                      value={customLon}
                      onChange={(e) => setCustomLon(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCustomSubmit}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs font-mono transition-colors shadow-sm cursor-pointer"
                >
                  Save Coordinates Monitored Site
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const LocationModal = React.memo(LocationModalComponent);
