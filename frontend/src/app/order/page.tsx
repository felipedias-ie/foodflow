'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';

type OrderItem = { id: string; name: string; price: number; quantity: number; image?: string; description?: string; prep_time_minutes?: number };

type Order = {
  id: string;
  status: string;
  created_at: string;
  restaurant_id: string;
  restaurant: { lat: number; lon: number };
  delivery: { lat: number; lon: number; address: string };
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  route: { distance?: string; duration?: string; duration_seconds?: number | null; eta_updated_at?: string; polyline?: string };
};

type Restaurant = {
    id: string;
    name: string;
    address: string;
    city: string;
    banner_url?: string;
    logo_url?: string;
};

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function formatSeconds(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8fbfa] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-[#38e07b] border-t-transparent" /></div>}>
      <OrderContent />
    </Suspense>
  );
}

function OrderContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('id');
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';

  const [order, setOrder] = useState<Order | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if ((globalThis as any).L) setMapReady(true);
  }, []);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) {
            setOrder(data.data);
            return fetch(`${API_BASE}/restaurants/${data.data.restaurant_id}`);
        }
        return null;
      })
      .then((r) => r ? r.json() : null)
      .then((data) => {
        if (data?.success) setRestaurant(data.data);
      })
      .finally(() => setLoading(false));
  }, [API_BASE, orderId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingSeconds = useMemo(() => {
    if (!order?.route?.duration_seconds || !order?.created_at) return null;
    
    const maxPrepTime = order.items.reduce((max, item) => Math.max(max, item.prep_time_minutes || 0), 0);
    const PREP_TIME_SEC = (maxPrepTime || 15) * 60;
    const PICKUP_TIME_SEC = 2 * 60;
    const DRIVE_TIME_SEC = order.route?.duration_seconds || 15 * 60;

    const created = Date.parse(order.created_at);
    if (!Number.isFinite(created)) return null;
    
    // Milestones
    const prepEndsAt = created + 10000 + PREP_TIME_SEC * 1000; // +10s confirm buffer
    const pickupEndsAt = prepEndsAt + PICKUP_TIME_SEC * 1000;
    const deliveryEndsAt = pickupEndsAt + DRIVE_TIME_SEC * 1000;

    const remainingPrep = Math.max(0, Math.floor((prepEndsAt - now) / 1000));
    const remainingPickup = Math.max(0, Math.floor((pickupEndsAt - now) / 1000));
    const remainingTotal = Math.max(0, Math.floor((deliveryEndsAt - now) / 1000));

    return { total: remainingTotal, prep: remainingPrep, pickup: remainingPickup };
  }, [now, order?.created_at, order?.route?.duration_seconds, order?.items]);

  const refreshEta = async () => {
    if (!orderId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/refresh-eta`, { method: 'POST' });
      const data = await res.json();
      if (data?.success) {
        setOrder((prev) => (prev ? { ...prev, route: { ...prev.route, ...data.data.route } } : prev));
      }
    } finally {
      setRefreshing(false);
    }
  };

  const simulatedStatusIndex = useMemo(() => {
    if (!order?.created_at) return 0;
    
    // Simulate order progress based on time
    const created = new Date(order.created_at).getTime();
    const elapsedSeconds = (now - created) / 1000;
    
    const maxPrepTime = order.items.reduce((max, item) => Math.max(max, item.prep_time_minutes || 0), 0);
    const PREP_TIME_SEC = (maxPrepTime || 15) * 60;
    const PICKUP_TIME_SEC = 2 * 60;
    const DRIVE_TIME_SEC = order.route?.duration_seconds || 15 * 60; 

    if (elapsedSeconds < 10) return 0; // PLACED
    if (elapsedSeconds < 10 + PREP_TIME_SEC) return 1; // PREPARING
    if (elapsedSeconds < 10 + PREP_TIME_SEC + PICKUP_TIME_SEC) return 2; // PICKING_UP
    if (elapsedSeconds < 10 + PREP_TIME_SEC + PICKUP_TIME_SEC + DRIVE_TIME_SEC) return 3; // ON_THE_WAY
    
    return 4; // DELIVERED
  }, [now, order?.created_at, order?.route?.duration_seconds, order?.items]);

  useEffect(() => {
    if (!mapReady || !order || !mapEl.current) return;
    if (mapRef.current) return;

    const L = (globalThis as any).L;
    if (!L) return;

    const restPos: [number, number] = [order.restaurant.lat, order.restaurant.lon];
    const delPos: [number, number] = [order.delivery.lat, order.delivery.lon];

    const map = L.map(mapEl.current, { zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;

    const restaurantIcon = L.divIcon({
      className: '',
      html: '<div style="background:#38e07b;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3)"><svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    const deliveryIcon = L.divIcon({
      className: '',
      html: '<div style="background:#ef4444;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3)"><svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    L.marker(restPos, { icon: restaurantIcon }).addTo(map).bindPopup(restaurant?.name || 'Restaurant');
    L.marker(delPos, { icon: deliveryIcon }).addTo(map).bindPopup('Delivery');

    if (order.route?.polyline) {
      const coords = decodePolyline(order.route.polyline);
      const polyline = L.polyline(coords, { color: '#38e07b', weight: 6, opacity: 0.9 }).addTo(map);
      
      // Shift bounds to the right by padding top-left significantly
      // The map is large, so we push the content to the right 50%
      map.fitBounds(polyline.getBounds(), {
        paddingTopLeft: [500, 50],
        paddingBottomRight: [50, 50]
      });
    } else {
      map.fitBounds([restPos, delPos], {
        paddingTopLeft: [500, 50],
        paddingBottomRight: [50, 50]
      });
    }

    setTimeout(() => map.invalidateSize(), 100);
  }, [mapReady, order, restaurant]);

  if (!orderId) return null;
  if (loading) return null;
  if (!order) return null;

  return (
    <div className="min-h-screen bg-[#f8fbfa] flex flex-col">
      <link href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" rel="stylesheet" />
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        strategy="afterInteractive"
        onLoad={() => setMapReady(true)}
      />
      
      {/* Standard Header */}
      <nav className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-4">
            <Link href="/" className="text-black text-lg font-bold">
            Never <span className="text-[#38e07b]">Eats</span>
            </Link>
        </div>
        <Link href={`/restaurant?id=${encodeURIComponent(order.restaurant_id)}`} className="text-sm font-medium text-gray-600 hover:text-black transition-colors">
          Back to menu →
        </Link>
      </nav>

      {/* Main Layout */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Map + Status Card */}
        <div className="lg:col-span-2 relative h-[600px] lg:h-[800px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100 group">
            {/* Map */}
            <div ref={mapEl} className="absolute inset-0 z-0" />
            
            {/* Status Card Overlay */}
            <div className="absolute top-6 left-6 z-400 w-80 bg-white/60 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 overflow-hidden">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Estimated Arrival</div>
                            <div className="text-3xl font-extrabold text-gray-900 font-mono tracking-tight">
                                {simulatedStatusIndex >= 4 ? 'Arrived' : (remainingSeconds?.total ? formatSeconds(remainingSeconds.total) : '--')}
                            </div>
                        </div>
                        <button 
                            onClick={refreshEta} 
                            className={`text-xs font-bold px-4 py-2 rounded-full ${refreshing ? 'bg-gray-100 text-gray-400' : 'bg-[#38e07b]/20 text-[#2da85c] hover:bg-[#38e07b]/30'} transition-colors`}
                        >
                            {refreshing ? 'Updating...' : 'Refresh'}
                        </button>
                    </div>

                    {/* Timeline */}
                    <div className="relative pl-2 space-y-7">
                        {/* Vertical Line - Centered on 24px dots (left 19px) */}
                        <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-gray-300/50" />
                        
                        {[
                        { label: 'Order confirmed', status: 'PLACED' },
                        { label: 'Preparing your order', status: 'PREPARING', timer: remainingSeconds?.prep },
                        { label: 'Picking up order', status: 'PICKING_UP' },
                        { label: 'Heading to you', status: 'ON_THE_WAY' },
                        { label: 'Arrived', status: 'DELIVERED' },
                        ].map((step, idx) => {
                        const isActive = idx === simulatedStatusIndex;
                        const isCompleted = idx < simulatedStatusIndex;
                        
                        return (
                            <div key={idx} className="flex items-center gap-5 relative z-10">
                                <div className={`
                                    w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-500
                                    ${isCompleted ? 'border-[#38e07b] bg-[#38e07b]' : isActive ? 'border-[#38e07b] bg-white ring-4 ring-[#38e07b]/20' : 'border-gray-300 bg-white'}
                                `}>
                                    {isCompleted && (
                                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className={`text-[15px] font-medium transition-colors ${isActive || isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                                        {step.label}
                                    </div>
                                    {isActive && step.timer !== undefined && step.timer > 0 && idx === 1 && (
                                        <div className="text-xs font-mono text-[#38e07b] mt-0.5 animate-pulse">
                                            Done in {formatSeconds(step.timer)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                        })}
                    </div>
                </div>
            </div>
        </div>

        {/* Right Column: Restaurant Info & Order Details */}
        <div className="lg:col-span-1 space-y-6">
            {/* Restaurant Info Card */}
            {restaurant && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="relative h-32 bg-gray-900">
                        {restaurant.banner_url ? (
                            <img src={restaurant.banner_url} className="w-full h-full object-cover opacity-80" alt="" />
                        ) : (
                            <div className="w-full h-full bg-linear-to-r from-gray-800 to-black" />
                        )}
                        <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 text-white flex items-center gap-3">
                            {restaurant.logo_url && (
                                <img src={restaurant.logo_url} className="w-12 h-12 rounded-lg border-2 border-white bg-white shadow-sm object-cover" alt="" />
                            )}
                            <div className="min-w-0">
                                <h2 className="font-bold text-lg leading-tight truncate">{restaurant.name}</h2>
                                <p className="text-white/80 text-xs truncate">{restaurant.address}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Order Details Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sticky top-6">
                <h3 className="font-bold text-gray-900 text-lg mb-4">Order Details</h3>
                <div className="space-y-6">
                    {order.items.map((item) => (
                        <div key={item.id} className="flex gap-4">
                            {/* Food Image */}
                            <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0 overflow-hidden border border-gray-100">
                                {item.image ? (
                                    <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex gap-2 font-medium text-gray-900 text-sm">
                                        <span>{item.quantity}x</span>
                                        <span className="truncate">{item.name}</span>
                                    </div>
                                    <span className="text-gray-900 text-sm font-semibold whitespace-nowrap">€{(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                                {item.description && (
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="border-t border-gray-100 mt-6 pt-4 space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                        <span>Subtotal</span>
                        <span>€{Number(order.subtotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                        <span>Delivery fee</span>
                        <span>€{Number(order.delivery_fee).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-100 mt-2">
                        <span>Total</span>
                        <span>€{Number(order.total).toFixed(2)}</span>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center">
                    Order ID: <span className="font-mono">{order.id.slice(0, 8)}</span>
                </div>
            </div>
        </div>

      </main>
    </div>
  );
}
