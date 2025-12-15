'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Restaurant {
  id: string;
  name: string;
  unique_name: string;
  address: string;
  postal_code: string;
  city: string;
  lat: number;
  lon: number;
  rating_star: number;
  rating_count: number;
  logo_url: string;
  banner_url: string;
  cuisines: string;
  tags: string;
  is_delivery: boolean;
  is_collection: boolean;
  is_open_now_delivery: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
}

interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface MenuData {
  phone_number?: string;
  description?: string;
  menu_structure: Array<{ category_name: string; items: MenuItem[] }>;
}

function RestaurantContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get('id');
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [menuInfo, setMenuInfo] = useState<{ phone?: string; description?: string }>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [eta, setEta] = useState<[number, number] | null>(null);
  const [basketId, setBasketId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';

  const getCanvasHash = async () => {
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
  };

  useEffect(() => {
    getCanvasHash()
      .then((h) => setBasketId(h))
      .catch(() => setBasketId('fallback'));
  }, []);

  useEffect(() => {
    if (restaurantId) {
      fetchRestaurantDetails();
    } else {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || !basketId) return;
    const key = `basket:${basketId}:${restaurantId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as CartItem[];
        if (Array.isArray(parsed)) setCart(parsed);
        return;
      } catch {}
    }

    fetch(`${API_BASE}/baskets/${basketId}?restaurant_id=${encodeURIComponent(restaurantId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data.data?.items) setCart(data.data.items);
      })
      .catch(() => {});
  }, [API_BASE, basketId, restaurantId]);

  useEffect(() => {
    if (!restaurantId || !basketId) return;
    const key = `basket:${basketId}:${restaurantId}`;
    localStorage.setItem(key, JSON.stringify(cart));

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/baskets/${basketId}?restaurant_id=${encodeURIComponent(restaurantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart }),
      }).catch(() => {});
    }, 350);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [API_BASE, basketId, cart, restaurantId]);

  const fetchRestaurantDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/restaurants/${restaurantId}`);
      const data = await response.json();

      if (data.success) {
        setRestaurant(data.data);
        
        const userLat = searchParams.get('lat');
        const userLon = searchParams.get('lon');
        if (userLat && userLon && data.data.lat && data.data.lon) {
          const dist = haversineDistance(
            parseFloat(userLat), parseFloat(userLon),
            data.data.lat, data.data.lon
          );
          const etaLow = Math.round(10 + dist / 280);
          const etaHigh = Math.round(10 + dist / 190);
          setEta([etaLow, etaHigh]);
        }

        await fetchMenu();
      }
    } catch (error) {
      console.error('Error fetching restaurant:', error);
    } finally {
      setLoading(false);
    }
  };

  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const fetchMenu = async () => {
    try {
      const response = await fetch(`${API_BASE}/restaurants/${restaurantId}/menu`);
      const data = await response.json();
      
      if (data.success && data.data) {
        const menuData = data.data as MenuData;
        
        setMenuInfo({
          phone: menuData.phone_number,
          description: menuData.description,
        });
        
        if (menuData.menu_structure) {
          const categories: MenuCategory[] = menuData.menu_structure.map((cat, idx) => ({
            id: `cat-${idx}`,
            name: cat.category_name,
            items: cat.items || [],
          }));
          
          setMenuCategories(categories);
          if (categories.length > 0) {
            setActiveCategory(categories[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching menu:', error);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(i => i.id === itemId ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0);
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = 2.99;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fbfa] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#38e07b] border-t-transparent" />
      </div>
    );
  }

  if (!restaurantId || !restaurant) {
    return (
      <div className="min-h-screen bg-[#f8fbfa] flex flex-col items-center justify-center gap-4">
        <p className="text-xl text-gray-600">Restaurant not found</p>
        <Link href="/search" className="text-[#38e07b] hover:underline">
          ← Back to search
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fbfa]">
      <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-[#f8fbfa]/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold text-gray-900">
                Never <span className="text-[#38e07b]">Eats</span>
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/search" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                Restaurants
              </Link>
            </nav>
          </div>
          <button className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2 hover:bg-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {cart.length > 0 && (
              <span className="text-sm font-medium">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
            )}
          </button>
        </div>
      </header>

      <main>
        <section className="w-full">
          <div
            className="w-full bg-center bg-no-repeat bg-cover flex flex-col justify-end overflow-hidden min-h-[280px] md:min-h-[360px]"
            style={{
              backgroundImage: restaurant.banner_url
                ? `linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.6)), url(${restaurant.banner_url})`
                : 'linear-gradient(135deg, #38e07b 0%, #2cb862 100%)',
            }}
          />
          <div className="flex justify-center -mt-16 sm:-mt-20">
            <div className="flex flex-wrap justify-between items-start gap-4 p-6 sm:p-8 bg-white rounded-lg shadow-lg w-full max-w-4xl mx-4">
              <div className="flex gap-4">
                {restaurant.logo_url && (
                  <img 
                    src={restaurant.logo_url} 
                    alt={restaurant.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover border border-gray-200"
                  />
                )}
                <div className="flex flex-col gap-1">
                  <h1 className="text-gray-900 text-2xl sm:text-3xl font-bold leading-tight">
                    {restaurant.name}
                  </h1>
                  <p className="text-gray-600 text-sm sm:text-base">
                    <span className="text-[#38e07b] font-bold">★</span> {restaurant.rating_star || 'N/A'}
                    {restaurant.rating_count && ` (${restaurant.rating_count})`}
                    {restaurant.cuisines && ` • ${restaurant.cuisines.split(',').slice(0, 2).join(', ')}`}
                    {eta && ` • ${eta[0]}-${eta[1]} min`}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {restaurant.address}, {restaurant.city}
                  </p>
                  {menuInfo.phone && (
                    <p className="text-gray-500 text-sm flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {menuInfo.phone}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <svg className="w-5 h-5 text-[#38e07b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Delivery: €{deliveryFee.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
          {menuInfo.description && (
            <div className="max-w-4xl mx-auto px-4 mt-4">
              <p className="text-gray-600 text-sm">{menuInfo.description}</p>
            </div>
          )}
        </section>

        <div className="flex justify-center py-5">
          <div className="flex w-full max-w-7xl px-4 sm:px-6 lg:px-8 gap-8">
            <aside className="hidden md:block w-56 shrink-0">
              <div className="sticky top-28">
                <h3 className="px-3 pb-4 text-lg font-bold text-gray-900">Categories</h3>
                <nav className="flex flex-col gap-1">
                  {menuCategories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => {
                        setActiveCategory(category.id);
                        document.getElementById(category.id)?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`text-left rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                        activeCategory === category.id
                          ? 'bg-[#38e07b]/20 text-gray-900 font-bold'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            <div className="flex-1 min-w-0">
              <div className="md:hidden flex gap-3 p-1 pb-6 overflow-x-auto">
                {menuCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setActiveCategory(category.id);
                      document.getElementById(category.id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`flex h-10 shrink-0 items-center justify-center px-4 rounded-full text-sm font-medium ${
                      activeCategory === category.id
                        ? 'bg-[#38e07b]/20 text-gray-900 font-bold'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              {menuCategories.map((category) => (
                <div key={category.id} id={category.id} className="scroll-mt-24 mb-10">
                  <h2 className="text-gray-900 text-2xl font-bold leading-tight px-1 pb-4 pt-5">
                    {category.name}
                  </h2>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {category.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-4 p-4 rounded-lg bg-white border border-transparent hover:border-gray-200 cursor-pointer transition-all hover:shadow-md"
                      >
                        <div className="flex-1 flex flex-col gap-1">
                          <h3 className="font-bold text-gray-900">{item.name}</h3>
                          <p className="text-sm text-gray-600 grow line-clamp-2">
                            {item.description}
                          </p>
                          <p className="font-bold text-gray-800 mt-2">
                            €{typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                          </p>
                        </div>
                        <div className="relative">
                          <div
                            className="w-28 h-28 bg-cover bg-center rounded-lg bg-gray-100"
                            style={{
                              backgroundImage: item.image ? `url(${item.image})` : undefined,
                            }}
                          >
                            {!item.image && (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => addToCart(item)}
                            className="absolute -bottom-2 -right-2 flex items-center justify-center w-9 h-9 bg-white rounded-full border border-gray-200 shadow-md hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-[#38e07b] text-2xl font-bold leading-none">+</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <aside className="hidden xl:block w-80 shrink-0">
              <div className="sticky top-28 border border-gray-200 rounded-lg bg-white p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Your Basket</h3>
                
                {cart.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4">Your basket is empty</p>
                ) : (
                  <>
                    <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
                      {cart.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                          <div
                            className="w-12 h-12 bg-cover bg-center rounded-md bg-gray-200 shrink-0"
                            style={{
                              backgroundImage: item.image ? `url(${item.image})` : undefined,
                            }}
                          >
                            {!item.image && (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                            <p className="text-sm text-[#38e07b] font-bold">€{(item.price * item.quantity).toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateQuantity(item.id, -1)}
                              className="w-6 h-6 rounded-full border border-gray-300 text-gray-500 text-sm flex items-center justify-center hover:bg-gray-100"
                            >
                              -
                            </button>
                            <span className="font-bold w-5 text-center text-sm">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, 1)}
                              className="w-6 h-6 rounded-full border border-gray-300 text-gray-500 text-sm flex items-center justify-center hover:bg-gray-100"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="border-t border-gray-200 mt-4 pt-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <p className="text-gray-600">Subtotal</p>
                        <p className="font-medium text-gray-800">€{cartTotal.toFixed(2)}</p>
                      </div>
                      <div className="flex justify-between">
                        <p className="text-gray-600">Delivery Fee</p>
                        <p className="font-medium text-gray-800">€{deliveryFee.toFixed(2)}</p>
                      </div>
                      <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-200">
                        <p className="text-gray-900">Total</p>
                        <p className="text-gray-900">€{(cartTotal + deliveryFee).toFixed(2)}</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        if (!restaurantId) return;
                        router.push(`/checkout?restaurant_id=${encodeURIComponent(restaurantId)}`);
                      }}
                      className="w-full mt-4 flex items-center justify-center rounded-full h-12 px-6 bg-[#38e07b] text-gray-900 text-base font-bold hover:opacity-90 transition-opacity"
                    >
                      Go to Checkout
                    </button>
                  </>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>

      {cart.length > 0 && (
        <div className="xl:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
          <button
            onClick={() => {
              if (!restaurantId) return;
              router.push(`/checkout?restaurant_id=${encodeURIComponent(restaurantId)}`);
            }}
            className="w-full flex items-center justify-between rounded-full h-14 px-6 bg-[#38e07b] text-gray-900 font-bold hover:opacity-90 transition-opacity"
          >
            <span>View Basket • {cart.reduce((s, i) => s + i.quantity, 0)} items</span>
            <span>€{(cartTotal + deliveryFee).toFixed(2)}</span>
          </button>
        </div>
      )}
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

export default function RestaurantPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RestaurantContent />
    </Suspense>
  );
}
