'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { getAssetPath } from "@/lib/utils";

type Restaurant = {
  id: string;
  name: string;
  unique_name?: string;
  city?: string;
  address?: string;
  postal_code?: string;
  lat?: number;
  lon?: number;
  cuisines?: string;
  tags?: string;
};

type Meal = {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string;
  prep_time_minutes?: number | null;
  price: number;
  image_filename?: string | null;
  image_url?: string | null;
  updated_at?: string;
};

type ImageHit = { filename: string; url: string };

type AddressSuggestion = {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  result_type?: string;
};

const CUISINE_OPTIONS = [
  'American',
  'Burgers',
  'Chicken',
  'Chinese',
  'Indian',
  'Italian',
  'Japanese',
  'Kebab',
  'Mexican',
  'Pizza',
  'Poke',
  'Spanish',
  'Sushi',
  'Thai',
];

const TAG_OPTIONS = [
  'Popular',
  'New',
  'Top Rated',
  'Budget',
  'Premium',
  'Vegan',
  'Vegetarian',
  'Halal',
  'Gluten Free',
  'Desserts',
  'Healthy',
  'Spicy',
];

export default function RegisterMealPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const addressDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReady, setMapReady] = useState(() => !!(globalThis as any).L);
  const [locationNeedsConfirm, setLocationNeedsConfirm] = useState(false);
  const [confirmingLocation, setConfirmingLocation] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const pendingAddressHintRef = useRef<string | null>(null);
  const autoFillSearchFromPinRef = useRef(false);
  const [pendingResolvedLocation, setPendingResolvedLocation] = useState<{
    address: string;
    city: string;
    postal_code: string;
  } | null>(null);

  // View state: 'select' (default/empty), 'create' (form), 'manage' (details)
  const [view, setView] = useState<'select' | 'create' | 'manage'>('select');
  
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  const [meals, setMeals] = useState<Meal[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);

  const [newRestaurant, setNewRestaurant] = useState({
    name: '',
    address: '',
    city: '',
    postal_code: '',
    lat: '40.4168',
    lon: '-3.7038',
  });
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [loadingAddressSuggestions, setLoadingAddressSuggestions] = useState(false);
  const [addressFieldSuggestions, setAddressFieldSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressFieldSuggestions, setShowAddressFieldSuggestions] = useState(false);
  const [loadingAddressField, setLoadingAddressField] = useState(false);
  const addressFieldDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mealForm, setMealForm] = useState({
    name: '',
    description: '',
    prep_time_minutes: '',
    price: '',
    image_filename: '',
  });

  const [imageQuery, setImageQuery] = useState('');
  const [imageHits, setImageHits] = useState<ImageHit[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  const filteredRestaurants = useMemo(() => {
    const q = restaurantQuery.trim().toLowerCase();
    if (!q) return restaurants;
    return restaurants.filter((r) => (r.name || '').toLowerCase().includes(q));
  }, [restaurants, restaurantQuery]);

  useEffect(() => {
    fetch(`${API_BASE}/manage/restaurants?limit=200`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) setRestaurants(data.data || []);
      })
      .catch(() => {});
  }, [API_BASE]);

  useEffect(() => {
    if (view !== 'create') {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
      }
      mapRef.current = null;
      markerRef.current = null;
      return;
    }

    if (!mapReady) return;
    setTimeout(() => {
      if (!mapEl.current) return;
      if (mapRef.current) return;

      const L = (globalThis as any).L;
      if (!L) return;

      const lat = parseFloat(newRestaurant.lat) || 40.4168;
      const lon = parseFloat(newRestaurant.lon) || -3.7038;

      const map = L.map(mapEl.current, {
        center: [lat, lon],
        zoom: 13,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapRef.current = map;

      const marker = L.marker([lat, lon], { draggable: true }).addTo(map);
      markerRef.current = marker;

      marker.on('dragend', () => {
        const p = marker.getLatLng();
        setNewRestaurant((prev) => ({ ...prev, lat: String(p.lat), lon: String(p.lng) }));
        pendingAddressHintRef.current = null;
        autoFillSearchFromPinRef.current = true;
        setLocationNeedsConfirm(true);
        setConfirmError(null);
      });

      map.on('click', (e: any) => {
        const p = e?.latlng;
        if (!p) return;
        marker.setLatLng([p.lat, p.lng]);
        setNewRestaurant((prev) => ({ ...prev, lat: String(p.lat), lon: String(p.lng) }));
        pendingAddressHintRef.current = null;
        autoFillSearchFromPinRef.current = true;
        setLocationNeedsConfirm(true);
        setConfirmError(null);
      });

      setTimeout(() => map.invalidateSize(), 100);
    }, 100);
  }, [mapReady, view]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (view !== 'create') return;
    const lat = parseFloat(newRestaurant.lat);
    const lon = parseFloat(newRestaurant.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    markerRef.current.setLatLng([lat, lon]);
    mapRef.current.setView([lat, lon]);
  }, [newRestaurant.lat, newRestaurant.lon]);

  useEffect(() => {
    if (!selectedRestaurant?.id) {
        setMeals([]);
        setLoadingMeals(false);
        return;
    }
    setLoadingMeals(true);
    // Add a small delay to ensure previous state is cleared visually if clicking fast
    const t = setTimeout(() => {
        fetch(`${API_BASE}/manage/restaurants/${selectedRestaurant.id}/meals`)
        .then((r) => r.json())
        .then((data) => {
            if (data?.success) setMeals(data.data || []);
        })
        .finally(() => setLoadingMeals(false));
    }, 50);
    return () => clearTimeout(t);
  }, [API_BASE, selectedRestaurant?.id]);

  const createRestaurant = async () => {
    const payload = {
      name: newRestaurant.name,
      address: newRestaurant.address,
      city: newRestaurant.city,
      postal_code: newRestaurant.postal_code,
      lat: newRestaurant.lat ? parseFloat(newRestaurant.lat) : undefined,
      lon: newRestaurant.lon ? parseFloat(newRestaurant.lon) : undefined,
      cuisines: selectedCuisines.map((c) => c.toLowerCase()).join(','),
      tags: selectedTags.map((t) => t.toLowerCase()).join(','),
    };

    const res = await fetch(`${API_BASE}/manage/restaurants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data?.success) throw new Error(data?.error || 'Failed to create restaurant');

    const created: Restaurant = data.data;
    setRestaurants((prev) => [created, ...prev]);
    setSelectedRestaurant(created);
    setView('manage');
  };

  const addMeal = async () => {
    if (!selectedRestaurant?.id) return;
    const payload = {
      name: mealForm.name,
      description: mealForm.description,
      prep_time_minutes: mealForm.prep_time_minutes ? parseInt(mealForm.prep_time_minutes, 10) : null,
      price: parseFloat(mealForm.price),
      image_type: 'food',
      image_filename: mealForm.image_filename || null,
    };

    const res = await fetch(`${API_BASE}/manage/restaurants/${selectedRestaurant.id}/meals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data?.success) throw new Error(data?.error || 'Failed to add meal');

    setMeals((prev) => [data.data as Meal, ...prev]);
    setMealForm({ name: '', description: '', prep_time_minutes: '', price: '', image_filename: '' });
    setImageQuery('');
    setImageHits([]);
  };

  const deleteMeal = async (mealId: string) => {
    if (!selectedRestaurant?.id) return;
    const res = await fetch(`${API_BASE}/manage/restaurants/${selectedRestaurant.id}/meals/${mealId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!data?.success) throw new Error(data?.error || 'Failed to delete meal');
    setMeals((prev) => prev.filter((m) => m.id !== mealId));
  };

  const searchImages = async () => {
    const q = imageQuery.trim();
    setLoadingImages(true);
    try {
      const res = await fetch(
        `${API_BASE}/images/search?type=food&q=${encodeURIComponent(q)}&limit=24`
      );
      const data = await res.json();
      if (data?.success) setImageHits(data.data || []);
    } finally {
      setLoadingImages(false);
    }
  };

  const fetchAddressSuggestions = async (q: string) => {
    const query = q.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    setLoadingAddressSuggestions(true);
    try {
      const at = `${newRestaurant.lat},${newRestaurant.lon}`;
      const res = await fetch(`${API_BASE}/geocoding/autocomplete?q=${encodeURIComponent(query)}&at=${encodeURIComponent(at)}`);
      const data = await res.json();
      if (data?.success) {
        setAddressSuggestions(data.data || []);
        setShowAddressSuggestions(true);
      } else {
        setAddressSuggestions([]);
      }
    } catch {
      setAddressSuggestions([]);
    } finally {
      setLoadingAddressSuggestions(false);
    }
  };

  const onAddressQueryChange = (val: string) => {
    setAddressQuery(val);
    autoFillSearchFromPinRef.current = false;
    if (addressDebounce.current) clearTimeout(addressDebounce.current);
    addressDebounce.current = setTimeout(() => fetchAddressSuggestions(val), 250);
  };

  const applySuggestion = (s: AddressSuggestion) => {
    setAddressQuery(s.title || s.address);
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
    pendingAddressHintRef.current = s.address || s.title || null;
    setNewRestaurant((p) => ({ ...p, lat: String(s.latitude), lon: String(s.longitude) }));
    autoFillSearchFromPinRef.current = false;
    setLocationNeedsConfirm(true);
    setConfirmError(null);
  };

  const fetchAddressFieldSuggestions = async (q: string) => {
    const query = q.trim();
    if (query.length < 3) {
      setAddressFieldSuggestions([]);
      return;
    }
    setLoadingAddressField(true);
    try {
      const at = `${newRestaurant.lat},${newRestaurant.lon}`;
      const res = await fetch(`${API_BASE}/geocoding/autocomplete?q=${encodeURIComponent(query)}&at=${encodeURIComponent(at)}`);
      const data = await res.json();
      if (data?.success) {
        setAddressFieldSuggestions(data.data || []);
        setShowAddressFieldSuggestions(true);
      } else {
        setAddressFieldSuggestions([]);
      }
    } catch {
      setAddressFieldSuggestions([]);
    } finally {
      setLoadingAddressField(false);
    }
  };

  const onAddressFieldChange = (val: string) => {
    setNewRestaurant((p) => ({ ...p, address: val }));
    if (addressFieldDebounce.current) clearTimeout(addressFieldDebounce.current);
    addressFieldDebounce.current = setTimeout(() => fetchAddressFieldSuggestions(val), 250);
  };

  const applyAddressFieldSuggestion = async (s: AddressSuggestion) => {
    setShowAddressFieldSuggestions(false);
    setAddressFieldSuggestions([]);
    setNewRestaurant((p) => ({ ...p, lat: String(s.latitude), lon: String(s.longitude) }));
    
    try {
      const res = await fetch(`${API_BASE}/geocoding/reverse?lat=${s.latitude}&lon=${s.longitude}`);
      const data = await res.json();
      if (data?.success && data.data) {
        const a = data.data.address || {};
        const city = a.city || a.town || a.village || a.suburb || '';
        const postcode = a.postcode || '';
        const road = a.road || '';
        const house = a.house_number || '';
        const formatted = road
          ? `${house ? `${house} ` : ''}${road}${city ? `, ${city}` : ''}`
          : s.address || s.title;
        
        setNewRestaurant((p) => ({
          ...p,
          address: formatted,
          city,
          postal_code: postcode,
          lat: String(s.latitude),
          lon: String(s.longitude),
        }));
        setAddressQuery(formatted);
      } else {
        setNewRestaurant((p) => ({ ...p, address: s.address || s.title }));
      }
    } catch {
      setNewRestaurant((p) => ({ ...p, address: s.address || s.title }));
    }
  };

  const resolveCoordsPreview = async (lat: number, lon: number, updateSearchBar: boolean) => {
    setConfirmError(null);
    try {
      const res = await fetch(`${API_BASE}/geocoding/reverse?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data?.success && data.data) {
        const a = data.data.address || {};
        const city = a.city || a.town || a.village || a.suburb || '';
        const postcode = a.postcode || '';
        const road = a.road || '';
        const house = a.house_number || '';
        const formatted = road
          ? `${house ? `${house} ` : ''}${road}${city ? `, ${city}` : ''}`
          : data.data.display_name || pendingAddressHintRef.current || '';

        setPendingResolvedLocation({
          address: formatted || pendingAddressHintRef.current || '',
          city,
          postal_code: postcode,
        });
        if (updateSearchBar && formatted) setAddressQuery(formatted);
      }
    } catch {
      // ignore preview failures; confirm will show errors
    }
  };

  useEffect(() => {
    if (!locationNeedsConfirm) return;
    const lat = parseFloat(newRestaurant.lat);
    const lon = parseFloat(newRestaurant.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    if (reverseDebounce.current) clearTimeout(reverseDebounce.current);
    reverseDebounce.current = setTimeout(() => {
      const shouldUpdateSearch = autoFillSearchFromPinRef.current;
      resolveCoordsPreview(lat, lon, shouldUpdateSearch);
    }, 250);

    return () => {
      if (reverseDebounce.current) clearTimeout(reverseDebounce.current);
    };
  }, [locationNeedsConfirm, newRestaurant.lat, newRestaurant.lon]);

  const confirmLocation = async () => {
    const lat = parseFloat(newRestaurant.lat);
    const lon = parseFloat(newRestaurant.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    setConfirmingLocation(true);
    setConfirmError(null);
    try {
      if (!pendingResolvedLocation) {
        await resolveCoordsPreview(lat, lon, true);
      }

      const resolved = pendingResolvedLocation;
      if (!resolved || !resolved.address) {
        setConfirmError('Could not resolve address');
        return;
      }

      setNewRestaurant((p) => ({
        ...p,
        address: resolved.address || p.address,
        city: resolved.city || p.city,
        postal_code: resolved.postal_code || p.postal_code,
      }));
      setAddressQuery(resolved.address);
      setLocationNeedsConfirm(false);
      setPendingResolvedLocation(null);
      pendingAddressHintRef.current = null;
    } catch {
      setConfirmError('Could not resolve address');
    } finally {
      setConfirmingLocation(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f8fbfa] overflow-hidden">
      <link
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        rel="stylesheet"
      />
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        strategy="afterInteractive"
        onLoad={() => setMapReady(true)}
      />
      
      {/* Navbar aligned with main site */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-4">
            <Link href="/" className="text-black text-base font-normal">
            Never <span className="font-medium">Eats</span>
            </Link>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500 font-medium">Restaurant Dashboard</span>
        </div>
        <Link href="/search" className="text-sm font-medium text-gray-600 hover:text-black transition-colors">
          Browse restaurants →
        </Link>
      </nav>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col z-20">
          <div className="p-4 border-b border-gray-100">
            <button
                onClick={() => {
                    setView('create');
                    setSelectedRestaurant(null);
                }}
                className="w-full flex items-center justify-center gap-2 bg-black text-white px-4 py-3 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
            >
                <span>+ Create Restaurant</span>
            </button>
          </div>

          <div className="p-4">
            <div className="relative">
                <input
                  value={restaurantQuery}
                  onChange={(e) => setRestaurantQuery(e.target.value)}
                  placeholder="Search your restaurants..."
                  className="w-full h-10 pl-9 pr-4 rounded-lg bg-gray-50 border-none text-sm outline-none focus:ring-1 focus:ring-gray-200"
                />
                <img
                  src={getAssetPath("/search-icon.svg")}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40 z-10 pointer-events-none"
                  alt="search"
                />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
            {filteredRestaurants.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                    {restaurantQuery ? 'No matches found' : 'No restaurants yet'}
                </div>
            ) : (
                filteredRestaurants.map((r) => (
                <button
                    key={r.id}
                    onClick={() => {
                        setSelectedRestaurant(r);
                        setView('manage');
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                    selectedRestaurant?.id === r.id 
                        ? 'bg-[#38e07b]/10 border-l-4 border-[#38e07b]' 
                        : 'hover:bg-gray-50 border-l-4 border-transparent'
                    }`}
                >
                    <div className="font-medium text-gray-900 truncate text-[15px]">{r.name}</div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                    {(r.address || '').trim() || '—'}
                    </div>
                </button>
                ))
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative bg-[#f8fbfa]">
          <div className="max-w-5xl mx-auto p-8 lg:p-12">
            
            {/* Empty State */}
            {view === 'select' && !selectedRestaurant && (
                <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-500">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-medium text-gray-900 mb-2">Select a restaurant</h2>
                    <p className="max-w-sm mx-auto">
                        Choose a restaurant from the sidebar to manage its menu and details, or create a new one to get started.
                    </p>
                </div>
            )}

            {/* Create Mode */}
            {view === 'create' && (
                <div className="max-w-6xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-3xl font-light text-gray-900 mb-2">Register new restaurant</h1>
                        <p className="text-gray-500">Fill in the details to start accepting orders.</p>
                    </div>

                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name</label>
                                    <input
                                        value={newRestaurant.name}
                                        onChange={(e) => setNewRestaurant((p) => ({ ...p, name: e.target.value }))}
                                        placeholder="e.g. Burger King"
                                        className="w-full h-11 rounded-lg border border-gray-200 px-3 outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                                    />
                                </div>
                                <div className="relative">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                    <div className="relative">
                                        <input
                                            value={newRestaurant.address}
                                            onChange={(e) => onAddressFieldChange(e.target.value)}
                                            onFocus={() => addressFieldSuggestions.length > 0 && setShowAddressFieldSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowAddressFieldSuggestions(false), 150)}
                                            placeholder="Street Address"
                                            className="w-full h-11 rounded-lg border border-gray-200 px-3 outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                                        />
                                        {loadingAddressField && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-gray-300 border-t-black animate-spin" />
                                        )}
                                    </div>
                                    {showAddressFieldSuggestions && addressFieldSuggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-48 overflow-y-auto z-50">
                                            {addressFieldSuggestions.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    onMouseDown={() => applyAddressFieldSuggestion(s)}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-none"
                                                >
                                                    <div className="font-medium text-gray-900 truncate">{s.title}</div>
                                                    <div className="text-xs text-gray-500 truncate">{s.address}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                                        <input
                                            value={newRestaurant.city}
                                            onChange={(e) => setNewRestaurant((p) => ({ ...p, city: e.target.value }))}
                                            placeholder="City"
                                            className="w-full h-11 rounded-lg border border-gray-200 px-3 outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                                        <input
                                            value={newRestaurant.postal_code}
                                            onChange={(e) => setNewRestaurant((p) => ({ ...p, postal_code: e.target.value }))}
                                            placeholder="Code"
                                            className="w-full h-11 rounded-lg border border-gray-200 px-3 outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Map Section */}
                            <div className="h-[300px] bg-gray-50 rounded-xl relative overflow-hidden border border-gray-200">
                                <div ref={mapEl} className="absolute inset-0 z-0" />
                                
                                {/* Map Controls Overlay */}
                                <div className="absolute top-3 left-3 right-3 z-10">
                                    <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-sm border border-gray-200 p-2">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <input
                                                value={addressQuery}
                                                onChange={(e) => onAddressQueryChange(e.target.value)}
                                                onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
                                                placeholder="Search map location..."
                                                className="flex-1 bg-transparent text-sm outline-none"
                                            />
                                            {loadingAddressSuggestions && <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-black animate-spin" />}
                                        </div>
                                        
                                        {/* Suggestions Dropdown */}
                                        {showAddressSuggestions && addressSuggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-48 overflow-y-auto">
                                                {addressSuggestions.map((s, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => applySuggestion(s)}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-none"
                                                    >
                                                        <div className="font-medium text-gray-900 truncate">{s.title}</div>
                                                        <div className="text-xs text-gray-500 truncate">{s.address}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {locationNeedsConfirm && (
                                        <button
                                            onClick={() => confirmLocation()}
                                            disabled={confirmingLocation}
                                            className="mt-2 w-full bg-[#38e07b] text-black text-xs font-bold py-2 rounded-lg shadow-sm hover:opacity-90"
                                        >
                                            {confirmingLocation ? 'Confirming...' : 'Confirm Location'}
                                        </button>
                                    )}
                                    {confirmError && (
                                        <div className="mt-2 bg-red-50 text-red-600 text-xs py-2 px-3 rounded-lg border border-red-100">
                                            {confirmError}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Cuisines</label>
                                <div className="flex flex-wrap gap-2">
                                    {CUISINE_OPTIONS.map((c) => {
                                        const active = selectedCuisines.includes(c);
                                        return (
                                            <button
                                                key={c}
                                                onClick={() => setSelectedCuisines(prev => active ? prev.filter(x => x !== c) : [...prev, c])}
                                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                                    active ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                            >
                                                {c}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                                <div className="flex flex-wrap gap-2">
                                    {TAG_OPTIONS.map((t) => {
                                        const active = selectedTags.includes(t);
                                        return (
                                            <button
                                                key={t}
                                                onClick={() => setSelectedTags(prev => active ? prev.filter(x => x !== t) : [...prev, t])}
                                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                                    active ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                            >
                                                {t}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setView('select')}
                                className="px-6 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => createRestaurant().catch(e => alert(e.message))}
                                className="px-6 py-2.5 rounded-full text-sm font-bold bg-[#38e07b] text-black hover:opacity-90 shadow-sm"
                            >
                                Create Restaurant
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manage Mode */}
            {view === 'manage' && selectedRestaurant && (
                <div className="space-y-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-3xl font-light text-gray-900">{selectedRestaurant.name}</h1>
                            <p className="text-gray-500 mt-1 flex items-center gap-2">
                                <span>{selectedRestaurant.address}</span>
                                {selectedRestaurant.city && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                        <span>{selectedRestaurant.city}</span>
                                    </>
                                )}
                            </p>
                        </div>
                        <div className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">
                            ID: {selectedRestaurant.id}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Add Meal Column */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 sticky top-4">
                                <h3 className="font-semibold text-gray-900 mb-4">Add New Meal</h3>
                                <div className="space-y-3">
                                    <input
                                        value={mealForm.name}
                                        onChange={(e) => setMealForm((p) => ({ ...p, name: e.target.value }))}
                                        placeholder="Dish Name"
                                        className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-black focus:ring-0"
                                    />
                                    <textarea
                                        value={mealForm.description}
                                        onChange={(e) => setMealForm((p) => ({ ...p, description: e.target.value }))}
                                        placeholder="Description"
                                        rows={3}
                                        className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-black focus:ring-0 resize-none"
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            value={mealForm.price}
                                            onChange={(e) => setMealForm((p) => ({ ...p, price: e.target.value }))}
                                            placeholder="Price (€)"
                                            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-black"
                                        />
                                        <input
                                            value={mealForm.prep_time_minutes}
                                            onChange={(e) => setMealForm((p) => ({ ...p, prep_time_minutes: e.target.value }))}
                                            placeholder="Prep (min)"
                                            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-black"
                                        />
                                    </div>

                                    {/* Image Search */}
                                    <div className="pt-2 border-t border-gray-100 mt-2">
                                        <label className="text-xs font-medium text-gray-500 mb-2 block">Meal Image</label>
                                        <div className="flex gap-2 mb-2">
                                            <input
                                                value={imageQuery}
                                                onChange={(e) => setImageQuery(e.target.value)}
                                                placeholder="Search food photos..."
                                                className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm"
                                            />
                                            <button
                                                onClick={searchImages}
                                                className="h-9 px-3 bg-gray-100 rounded-lg text-xs font-semibold hover:bg-gray-200"
                                            >
                                                Find
                                            </button>
                                        </div>
                                        {imageHits.length > 0 && (
                                            <div className="grid grid-cols-4 gap-1 mb-2">
                                                {imageHits.slice(0, 4).map((hit) => (
                                                    <button
                                                        key={hit.filename}
                                                        onClick={() => setMealForm((p) => ({ ...p, image_filename: hit.filename }))}
                                                        className={`aspect-square rounded overflow-hidden border-2 ${
                                                            mealForm.image_filename === hit.filename ? 'border-[#38e07b]' : 'border-transparent'
                                                        }`}
                                                    >
                                                        <img src={hit.url} className="w-full h-full object-cover" alt="" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            if (!mealForm.name.trim()) {
                                                alert('Please enter a dish name');
                                                return;
                                            }
                                            if (!mealForm.price || isNaN(parseFloat(mealForm.price))) {
                                                alert('Please enter a valid price');
                                                return;
                                            }
                                            addMeal().catch(e => alert(e.message));
                                        }}
                                        className="w-full h-10 rounded-full bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors mt-2"
                                    >
                                        Add to Menu
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Menu List Column */}
                        <div className="lg:col-span-2">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-gray-900">Current Menu ({meals.length})</h3>
                                {loadingMeals && <span className="text-xs text-gray-400">Syncing...</span>}
                            </div>
                            
                            {meals.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 border-dashed">
                                    <p className="text-gray-500">No meals added yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {meals.map((m) => (
                                        <div key={m.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex gap-4 group hover:border-gray-200 transition-colors">
                                            <div 
                                                className="w-20 h-20 rounded-lg bg-gray-100 bg-cover bg-center shrink-0"
                                                style={{ backgroundImage: m.image_url ? `url(${m.image_url})` : undefined }}
                                            />
                                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                <div>
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-semibold text-gray-900 truncate pr-2">{m.name}</h4>
                                                        <span className="font-bold text-sm">€{Number(m.price).toFixed(2)}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 line-clamp-2 mt-1">{m.description}</p>
                                                </div>
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className="text-xs text-gray-400">
                                                        {m.prep_time_minutes ? `~${m.prep_time_minutes} min` : ''}
                                                    </span>
                                                    <button
                                                        onClick={() => deleteMeal(m.id).catch(e => alert(e.message))}
                                                        className="text-xs text-red-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-red-50"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}