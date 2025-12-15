'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type CartItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  quantity: number;
};

type BasketEntry = {
  restaurant_id: string;
  item_count: number;
  total: number;
  items: CartItem[];
};

type RestaurantInfo = { id: string; name: string; logo_url?: string };

interface Restaurant {
  id: string;
  name: string;
  unique_name: string;
  address: string;
  distance_m: number;
  eta_minutes: [number, number];
  rating_star: number;
  rating_count: number;
  logo_url: string;
  banner_url: string;
  cuisines: string;
  is_delivery: boolean;
}

interface MealHit {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string | null;
}

interface AddressSuggestion {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  result_type?: string;
}

async function getBasketId() {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'noctx';
  ctx.textBaseline = 'top';
  ctx.font = '16px Arial';
  ctx.fillStyle = '#111';
  ctx.fillText('FoodFlow • Never Eats • basket', 2, 2);
  ctx.fillStyle = '#38e07b';
  ctx.fillRect(10, 30, 120, 20);
  ctx.fillStyle = '#000';
  ctx.fillText(navigator.userAgent, 2, 55);
  const data = new TextEncoder().encode(canvas.toDataURL());
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 32);
}

function readBasketEntries(basketId: string): BasketEntry[] {
  const prefix = `basket:${basketId}:`;
  const out: BasketEntry[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;

      const restaurantId = key.slice(prefix.length);
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let items: CartItem[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) items = parsed as CartItem[];
      } catch {
        continue;
      }

      const item_count = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      if (item_count <= 0) continue;

      const total = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
      out.push({ restaurant_id: restaurantId, item_count, total: Math.round(total * 100) / 100, items });
    }
  } catch {
    return [];
  }

  out.sort((a, b) => b.item_count - a.item_count);
  return out;
}

const CUISINE_FILTERS = ['All', 'Pizza', 'Sushi', 'Burgers', 'Chinese', 'Mexican', 'Indian', 'Thai'];

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCuisine, setSelectedCuisine] = useState('All');
  const [query, setQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; address: string } | null>(null);
  const userLocationRef = useRef(userLocation);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  const [mealHits, setMealHits] = useState<MealHit[]>([]);
  const [loadingMealHits, setLoadingMealHits] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [loadingAddressSuggestions, setLoadingAddressSuggestions] = useState(false);
  const addressDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressDropdownRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [basketId, setBasketId] = useState<string | null>(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [basketEntries, setBasketEntries] = useState<BasketEntry[]>([]);
  const [basketRestaurants, setBasketRestaurants] = useState<Record<string, RestaurantInfo>>({});
  const basketDropdownRef = useRef<HTMLDivElement>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';

  useEffect(() => {
    getBasketId()
      .then((h) => setBasketId(h))
      .catch(() => setBasketId('fallback'));
  }, []);

  useEffect(() => {
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const address = searchParams.get('address');

    if (lat && lon) {
      const location = { lat: parseFloat(lat), lon: parseFloat(lon), address: address || '' };
      setUserLocation(location);
      localStorage.setItem('userLocation', JSON.stringify(location));
      setAddressQuery(location.address || '');
    } else {
      // Try localStorage first
      const saved = localStorage.getItem('userLocation');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setUserLocation(parsed);
          setAddressQuery(parsed?.address || '');
          return;
        } catch {}
      }
      
      // Fall back to browser geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              address: 'Current Location',
            };
            setUserLocation(location);
            localStorage.setItem('userLocation', JSON.stringify(location));
            setAddressQuery(location.address || '');
          },
          () => {
            // Geolocation failed, use Madrid default
            const loc = { lat: 40.4168, lon: -3.7038, address: 'Madrid Centro' };
            setUserLocation(loc);
            setAddressQuery(loc.address);
          }
        );
      } else {
        const loc = { lat: 40.4168, lon: -3.7038, address: 'Madrid Centro' };
        setUserLocation(loc);
        setAddressQuery(loc.address);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(event.target as Node)) {
        setShowAddressSuggestions(false);
      }
      if (basketDropdownRef.current && !basketDropdownRef.current.contains(event.target as Node)) {
        setBasketOpen(false);
      }
    };

    if (showAddressSuggestions || basketOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [basketOpen, showAddressSuggestions]);

  const fetchAddressSuggestions = async (q: string) => {
    const query = q.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    setLoadingAddressSuggestions(true);
    try {
      const at = userLocation ? `${userLocation.lat},${userLocation.lon}` : '40.4168,-3.7038';
      const res = await fetch(`${API_BASE}/geocoding/autocomplete?q=${encodeURIComponent(query)}&at=${encodeURIComponent(at)}`);
      const data = await res.json();
      if (data?.success) {
        setAddressSuggestions(data.data || []);
        setShowAddressSuggestions(true);
      } else {
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      }
    } catch {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
    } finally {
      setLoadingAddressSuggestions(false);
    }
  };

  const onAddressChange = (val: string) => {
    setAddressQuery(val);
    if (addressDebounce.current) clearTimeout(addressDebounce.current);
    addressDebounce.current = setTimeout(() => fetchAddressSuggestions(val), 250);
  };

  const applyAddressSuggestion = (s: AddressSuggestion) => {
    const next = { lat: s.latitude, lon: s.longitude, address: s.title || s.address || '' };
    setUserLocation(next);
    setAddressQuery(next.address);
    localStorage.setItem('userLocation', JSON.stringify(next));
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);

    const qs = new URLSearchParams();
    qs.set('lat', String(next.lat));
    qs.set('lon', String(next.lon));
    if (next.address) qs.set('address', next.address);
    router.replace(`/search?${qs.toString()}`);
  };

  const refreshBasket = () => {
    if (!basketId) return;
    const entries = readBasketEntries(basketId);
    setBasketEntries(entries);
  };

  useEffect(() => {
    if (!basketId) return;
    refreshBasket();
  }, [basketId]);

  useEffect(() => {
    if (!basketOpen) return;
    refreshBasket();
  }, [basketOpen]);

  useEffect(() => {
    const ids = Array.from(new Set(basketEntries.map((e) => e.restaurant_id)));
    const missing = ids.filter((id) => !basketRestaurants[id]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map((id) =>
        fetch(`${API_BASE}/restaurants/${encodeURIComponent(id)}`)
          .then((r) => r.json())
          .then((d) => (d?.success ? (d.data as RestaurantInfo) : null))
          .catch(() => null)
      )
    ).then((results) => {
      const next: Record<string, RestaurantInfo> = {};
      for (const r of results) {
        if (r?.id) next[r.id] = r;
      }
      if (Object.keys(next).length > 0) setBasketRestaurants((prev) => ({ ...prev, ...next }));
    });
  }, [API_BASE, basketEntries, basketRestaurants]);

  useEffect(() => {
    if (!userLocation) return;
    const t = setTimeout(() => {
      fetchRestaurants();
    }, 300);
    return () => clearTimeout(t);
  }, [userLocation, selectedCuisine, query]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMealHits([]);
      return;
    }

    const t = setTimeout(async () => {
      setLoadingMealHits(true);
      try {
        const res = await fetch(`${API_BASE}/meals/search?q=${encodeURIComponent(q)}&limit=12`);
        const data = await res.json();
        if (data?.success) setMealHits(data.data || []);
      } catch {
        setMealHits([]);
      } finally {
        setLoadingMealHits(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [API_BASE, query]);

  const fetchRestaurants = async () => {
    if (!userLocation) return;
    setLoading(true);

    try {
      let url: string;
      if (selectedCuisine === 'All') {
        if (query.trim().length > 0) {
           url = `${API_BASE}/restaurants/search?q=${encodeURIComponent(query.trim())}&limit=30`;
        } else {
           url = `${API_BASE}/restaurants/nearby?lat=${userLocation.lat}&lon=${userLocation.lon}&limit=30`;
        }
      } else {
        url = `${API_BASE}/restaurants/cuisine/${selectedCuisine.toLowerCase()}?lat=${userLocation.lat}&lon=${userLocation.lon}&limit=30`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setRestaurants(data.data);
      }
    } catch (error) {
      console.error('Error fetching restaurants:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatEta = (eta: [number, number]) => {
    return `${eta[0]}-${eta[1]} min`;
  };

  const filteredRestaurants = restaurants; // Filtering is now done server-side for search

  return (
    <div className="min-h-screen bg-[#f8fbfa]">
      <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between h-[72px]">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-normal tracking-tight text-black no-underline">
            Never <span className="font-medium">Eats</span>
          </Link>
          <div className="hidden lg:flex items-center bg-gray-100 rounded-full p-1 ml-4">
            <button className="bg-white shadow-sm px-4 py-2 rounded-full text-sm font-medium transition-colors text-black">
              Delivery
            </button>
            <button className="px-4 py-2 rounded-full text-sm font-medium text-gray-600 hover:text-black transition-colors">
              Pickup
            </button>
          </div>
          <div
            ref={addressDropdownRef}
            className="hidden xl:flex items-center gap-2 px-4 py-3 bg-gray-100 rounded-full min-w-[300px] cursor-pointer hover:bg-gray-200 transition-colors relative"
            onClick={() => {
              setShowAddressSuggestions(true);
              addressInputRef.current?.focus();
            }}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <input
              ref={addressInputRef}
              value={addressQuery}
              onChange={(e) => onAddressChange(e.target.value)}
              onFocus={() => {
                setAddressQuery('');
                if (addressSuggestions.length > 0) setShowAddressSuggestions(true);
              }}
              onBlur={() => {
                setTimeout(() => {
                  setAddressQuery(userLocationRef.current?.address || '');
                }, 200);
              }}
              placeholder="Select location"
              className="bg-transparent text-sm font-medium truncate flex-1 outline-none min-w-[150px] placeholder-gray-500"
            />
            
            {showAddressSuggestions && addressSuggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-2 w-[360px] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                {addressSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onMouseDown={() => applyAddressSuggestion(s)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-none"
                  >
                    <div className="text-sm font-medium text-gray-900 truncate">{s.title}</div>
                    <div className="text-xs text-gray-500 truncate">{s.address}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 max-w-3xl px-8 hidden md:block">
          <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </span>
            <input
              className="w-full bg-gray-100 border-none rounded-full py-2.5 pl-12 pr-4 focus:ring-2 focus:ring-black transition-all outline-none text-base placeholder-gray-500"
              placeholder="Search Never Eats"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/orders"
            className="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="font-medium text-sm text-black">Orders</span>
          </Link>
          <div ref={basketDropdownRef} className="relative">
            <button
              onClick={() => setBasketOpen((v) => !v)}
              className="bg-black text-white flex items-center gap-2 px-4 py-2.5 rounded-full hover:opacity-80 transition-opacity relative"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              <span className="font-medium text-sm">Cart</span>
            </button>

            {basketOpen && (
              <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="font-semibold text-gray-900">Your baskets</div>
                  <Link href="/orders" className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={() => setBasketOpen(false)}>
                    Orders →
                  </Link>
                </div>

                {basketEntries.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-600">No items in your basket yet.</div>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto">
                    {basketEntries.map((b) => {
                      const r = basketRestaurants[b.restaurant_id];
                      const lat = userLocation?.lat;
                      const lon = userLocation?.lon;
                      const restaurantHref =
                        lat != null && lon != null
                          ? `/restaurant?id=${encodeURIComponent(b.restaurant_id)}&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`
                          : `/restaurant?id=${encodeURIComponent(b.restaurant_id)}`;
                      const checkoutHref = `/checkout?restaurant_id=${encodeURIComponent(b.restaurant_id)}`;

                      return (
                        <div key={b.restaurant_id} className="px-4 py-3 border-b border-gray-50 last:border-none">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-3">
                              {r?.logo_url ? (
                                <img src={r.logo_url} className="w-9 h-9 rounded-lg border border-gray-200 object-cover" alt="" />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200" />
                              )}
                              <div className="min-w-0">
                                <div className="font-medium text-gray-900 truncate">{r?.name || `Restaurant ${b.restaurant_id}`}</div>
                                <div className="text-xs text-gray-500">
                                  {b.item_count} item{b.item_count === 1 ? '' : 's'} · €{b.total.toFixed(2)}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <Link
                                href={restaurantHref}
                                className="h-9 px-3 inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-900 text-xs font-semibold hover:bg-gray-200"
                                onClick={() => setBasketOpen(false)}
                              >
                                View
                              </Link>
                              <Link
                                href={checkoutHref}
                                className="h-9 px-3 inline-flex items-center justify-center rounded-full bg-[#38e07b] text-gray-900 text-xs font-bold hover:opacity-90"
                                onClick={() => setBasketOpen(false)}
                              >
                                Checkout
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-20 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {filteredRestaurants.length} restaurants near you
          </h1>
          <p className="text-[#51946c]">Order from the best local restaurants</p>
        </div>

        {(query.trim().length >= 2 || mealHits.length > 0) && (
          <div className="mb-8">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold text-gray-900">Meals matching “{query.trim()}”</h2>
              {loadingMealHits && <span className="text-sm text-gray-500">Searching…</span>}
            </div>
            {mealHits.length === 0 ? (
              <p className="text-sm text-gray-500">No meals found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {mealHits.map((m) => (
                  <Link
                    key={`${m.restaurant_id}:${m.id}`}
                    href={`/restaurant?id=${m.restaurant_id}&lat=${userLocation?.lat}&lon=${userLocation?.lon}`}
                    className="flex gap-4 p-4 rounded-lg bg-white border border-gray-200 hover:shadow-sm transition-shadow"
                  >
                    <div
                      className="w-20 h-20 rounded-lg bg-gray-100 bg-cover bg-center shrink-0"
                      style={{ backgroundImage: m.image_url ? `url(${m.image_url})` : undefined }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-gray-900 truncate">{m.name}</div>
                        <div className="font-bold text-gray-900">€{Number(m.price).toFixed(2)}</div>
                      </div>
                      {m.description && <div className="text-sm text-gray-600 line-clamp-2">{m.description}</div>}
                      <div className="text-xs text-gray-500 mt-1">Open restaurant →</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 overflow-x-auto pb-4 mb-6 scrollbar-hide">
          {CUISINE_FILTERS.map((cuisine) => (
            <button
              key={cuisine}
              onClick={() => setSelectedCuisine(cuisine)}
              className={`flex h-10 shrink-0 items-center justify-center px-4 rounded-full text-sm font-medium transition-colors ${
                selectedCuisine === cuisine
                  ? 'bg-[#38e07b] text-gray-900'
                  : 'bg-[#38e07b]/10 text-gray-700 hover:bg-[#38e07b]/20'
              }`}
            >
              {cuisine}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-gray-200 rounded-lg aspect-video mb-3" />
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">No restaurants found</p>
            <p className="text-gray-400">Try a different cuisine or location</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRestaurants.map((restaurant) => (
              <Link
                key={restaurant.id}
                href={`/restaurant?id=${restaurant.id}&lat=${userLocation?.lat}&lon=${userLocation?.lon}`}
                className="group cursor-pointer"
              >
                <div className="relative w-full">
                  <div
                    className="w-full aspect-video bg-cover bg-center rounded-lg overflow-hidden transform transition-transform duration-300 group-hover:scale-[1.02]"
                    style={{
                      backgroundImage: restaurant.banner_url
                        ? `url(${restaurant.banner_url})`
                        : 'linear-gradient(135deg, #38e07b 0%, #2cb862 100%)',
                    }}
                  >
                    {!restaurant.banner_url && (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-white text-4xl font-bold">
                          {restaurant.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  {restaurant.logo_url && (
                    <img 
                      src={restaurant.logo_url} 
                      alt=""
                      className="absolute top-2 left-2 w-10 h-10 rounded-lg border-2 border-white shadow-md object-cover bg-white"
                    />
                  )}
                  <div className="absolute bottom-2 right-2 flex items-center justify-center rounded-full bg-white px-2.5 py-1 shadow-sm">
                    <p className="text-gray-900 text-sm font-medium">
                      {formatEta(restaurant.eta_minutes)}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-900 text-lg font-bold leading-tight truncate">
                      {restaurant.name}
                    </p>
                    {restaurant.rating_star && (
                      <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#38e07b]/10 px-2 py-0.5">
                        <span className="text-[#38e07b] text-sm">★</span>
                        <span className="text-sm font-semibold">{restaurant.rating_star}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[#51946c] text-sm mt-1">
                    {restaurant.cuisines?.split(',').slice(0, 2).join(' · ')} · {formatDistance(restaurant.distance_m)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#f8fbfa] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#38e07b] border-t-transparent" />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SearchContent />
    </Suspense>
  );
}