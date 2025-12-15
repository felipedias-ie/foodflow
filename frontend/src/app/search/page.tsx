'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

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

const CUISINE_FILTERS = ['All', 'Pizza', 'Sushi', 'Burgers', 'Chinese', 'Mexican', 'Indian', 'Thai'];

function SearchContent() {
  const searchParams = useSearchParams();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCuisine, setSelectedCuisine] = useState('All');
  const [query, setQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; address: string } | null>(null);
  const [mealHits, setMealHits] = useState<MealHit[]>([]);
  const [loadingMealHits, setLoadingMealHits] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';

  useEffect(() => {
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const address = searchParams.get('address');

    if (lat && lon) {
      const location = { lat: parseFloat(lat), lon: parseFloat(lon), address: address || '' };
      setUserLocation(location);
      localStorage.setItem('userLocation', JSON.stringify(location));
    } else {
      // Try localStorage first
      const saved = localStorage.getItem('userLocation');
      if (saved) {
        try {
          setUserLocation(JSON.parse(saved));
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
          },
          () => {
            // Geolocation failed, use Madrid default
            setUserLocation({ lat: 40.4168, lon: -3.7038, address: 'Madrid Centro' });
          }
        );
      } else {
        setUserLocation({ lat: 40.4168, lon: -3.7038, address: 'Madrid Centro' });
      }
    }
  }, [searchParams]);

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
      <header className="sticky top-0 z-10 border-b border-[#38e07b]/20 bg-[#f8fbfa]/80 backdrop-blur-sm px-4 sm:px-8 lg:px-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">
              Never <span className="text-[#38e07b]">Eats</span>
            </span>
          </Link>

          <div className="flex-1 max-w-md mx-8">
            <div className="flex items-center gap-2 bg-[#38e07b]/10 rounded-full px-4 py-2">
              <svg className="w-5 h-5 text-[#51946c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search food or restaurants..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#51946c]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm bg-[#38e07b]/10 px-4 py-2 rounded-full">
            <svg className="w-5 h-5 text-[#51946c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-gray-700 truncate max-w-[200px]">
              {userLocation?.address || 'Madrid'}
            </span>
          </div>
        </div>
      </header>

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

