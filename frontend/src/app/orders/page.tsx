'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type OrderItem = { id: string; name: string; price: number; quantity: number; image?: string; description?: string; prep_time_minutes?: number };

type Order = {
  id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  basket_id?: string;
  restaurant_id: string;
  delivery?: { lat?: number; lon?: number; address?: string };
  items: OrderItem[];
  subtotal?: number;
  delivery_fee?: number;
  total?: number;
};

type Restaurant = { id: string; name: string; address?: string; city?: string; logo_url?: string };

function formatDate(iso?: string) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString();
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

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8fbfa] flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#38e07b] border-t-transparent" />
        </div>
      }
    >
      <OrdersContent />
    </Suspense>
  );
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get('restaurant_id') || '';

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';

  const [basketId, setBasketId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Record<string, Restaurant>>({});
  const [loading, setLoading] = useState(true);

  const mode = restaurantId ? 'business' : 'customer';

  useEffect(() => {
    if (mode !== 'customer') return;
    getBasketId()
      .then((h) => setBasketId(h))
      .catch(() => setBasketId('fallback'));
  }, [mode]);

  useEffect(() => {
    setLoading(true);
    setOrders([]);

    const qs = new URLSearchParams();
    if (mode === 'business') qs.set('restaurant_id', restaurantId);
    if (mode === 'customer' && basketId) qs.set('basket_id', basketId);

    const url = `${API_BASE}/orders?${qs.toString()}`;
    if (mode === 'customer' && !basketId) return;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) setOrders((data.data || []) as Order[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [API_BASE, basketId, mode, restaurantId]);

  useEffect(() => {
    const ids = Array.from(new Set((orders || []).map((o) => o.restaurant_id).filter(Boolean)));
    const missing = ids.filter((id) => !restaurants[id]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map((id) =>
        fetch(`${API_BASE}/restaurants/${encodeURIComponent(id)}`)
          .then((r) => r.json())
          .then((d) => (d?.success ? (d.data as Restaurant) : null))
          .catch(() => null)
      )
    ).then((results) => {
      const next: Record<string, Restaurant> = {};
      for (const r of results) {
        if (r?.id) next[r.id] = r;
      }
      if (Object.keys(next).length > 0) setRestaurants((prev) => ({ ...prev, ...next }));
    });
  }, [API_BASE, orders, restaurants]);

  const title = mode === 'business' ? 'Restaurant orders' : 'My orders';
  const subtitle = mode === 'business' ? `Restaurant ID: ${restaurantId}` : basketId ? `Customer basket: ${basketId}` : '';

  const totalCount = orders.length;
  const totalRevenue = useMemo(() => {
    if (mode !== 'business') return null;
    const sum = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [mode, orders]);

  return (
    <div className="min-h-screen bg-[#f8fbfa] px-4 sm:px-8 lg:px-20 py-8">
      <header className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Never <span className="text-[#38e07b]">Eats</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/search" className="text-sm font-medium text-gray-700 hover:text-gray-900">
            Restaurants
          </Link>
          <Link href="/register-meal" className="text-sm font-medium text-gray-700 hover:text-gray-900">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto mt-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <div className="text-sm text-gray-500 mt-1">{subtitle}</div>}
          </div>
          {mode === 'business' && totalRevenue !== null && (
            <div className="text-sm text-gray-700">
              <span className="font-semibold">{totalCount}</span> orders · <span className="font-semibold">€{totalRevenue.toFixed(2)}</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="mt-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#38e07b] border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-10 bg-white border border-gray-200 rounded-xl p-6 text-gray-700">
            No orders yet.
            {mode === 'customer' && <div className="text-sm text-gray-500 mt-1">Place an order and it will show up here automatically.</div>}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4">
            {orders.map((o) => {
              const rest = restaurants[o.restaurant_id];
              const itemCount = (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
              return (
                <div key={o.id} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        {rest?.logo_url && <img src={rest.logo_url} className="w-10 h-10 rounded-lg border border-gray-200 object-cover" alt="" />}
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{rest?.name || `Restaurant ${o.restaurant_id}`}</div>
                          <div className="text-sm text-gray-500">
                            {formatDate(o.created_at)} · {itemCount} item{itemCount === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                      {mode === 'business' && o.delivery?.address && (
                        <div className="text-sm text-gray-600 mt-3">
                          Deliver to: <span className="font-medium">{o.delivery.address}</span>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800">
                          {String(o.status || '').toUpperCase() || 'UNKNOWN'}
                        </span>
                        {typeof o.total !== 'undefined' && o.total !== null && (
                          <span className="inline-flex items-center rounded-full bg-[#38e07b]/15 px-3 py-1 text-xs font-semibold text-gray-900">
                            €{Number(o.total).toFixed(2)}
                          </span>
                        )}
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-mono text-gray-600">
                          {o.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <Link
                        href={`/order?id=${encodeURIComponent(o.id)}`}
                        className="h-10 px-4 inline-flex items-center justify-center rounded-full bg-[#38e07b] text-gray-900 font-bold text-sm hover:opacity-90"
                      >
                        View
                      </Link>
                      <div className="text-xs text-gray-400">Full order details</div>
                    </div>
                  </div>

                  {o.items?.length ? (
                    <div className="mt-4 border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {o.items.slice(0, 4).map((it) => (
                        <div key={it.id} className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg bg-gray-100 bg-cover bg-center shrink-0"
                            style={{ backgroundImage: it.image ? `url(${it.image})` : undefined }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {it.quantity}× {it.name}
                            </div>
                            <div className="text-xs text-gray-500">€{Number(it.price).toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                      {o.items.length > 4 && <div className="text-sm text-gray-500">+ {o.items.length - 4} more…</div>}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

