'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
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

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8fbfa] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-[#38e07b] border-t-transparent" /></div>}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get('restaurant_id');

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';

  const [basketId, setBasketId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [placing, setPlacing] = useState(false);

  const [delivery, setDelivery] = useState({
    address: '',
    lat: '',
    lon: '',
  });

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
    const saved = localStorage.getItem('userLocation');
    if (!saved) return;
    try {
      const loc = JSON.parse(saved) as { lat: number; lon: number; address: string };
      setDelivery({
        address: loc.address || '',
        lat: String(loc.lat ?? ''),
        lon: String(loc.lon ?? ''),
      });
    } catch {}
  }, []);

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

  const subtotal = useMemo(() => cart.reduce((sum, i) => sum + i.price * i.quantity, 0), [cart]);
  const deliveryFee = 2.99;
  const total = subtotal + deliveryFee;

  const placeOrder = async () => {
    if (!restaurantId || !basketId) return;
    const lat = parseFloat(delivery.lat);
    const lon = parseFloat(delivery.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      alert('Please provide delivery latitude/longitude.');
      return;
    }
    if (cart.length === 0) {
      alert('Your basket is empty.');
      return;
    }

    setPlacing(true);
    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            basket_id: basketId,
            restaurant_id: restaurantId,
            delivery_fee: deliveryFee,
            delivery: { address: delivery.address, lat, lon },
            items: cart.map((c) => ({
              id: c.id,
              name: c.name,
              price: c.price,
              quantity: c.quantity,
              image: c.image,
              description: c.description
            })),
          }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Order failed');

      router.push(`/order?id=${encodeURIComponent(data.data.id)}`);
    } catch (e: any) {
      alert(e?.message || 'Order failed');
    } finally {
      setPlacing(false);
    }
  };

  if (!restaurantId) {
    return (
      <div className="min-h-screen bg-[#f8fbfa] flex items-center justify-center">
        <div className="text-gray-700">
          Missing restaurant. <Link className="text-[#38e07b] font-semibold" href="/search">Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fbfa] px-4 sm:px-8 lg:px-20 py-8">
      <header className="max-w-3xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Never <span className="text-[#38e07b]">Eats</span>
        </Link>
        <Link href={`/restaurant?id=${encodeURIComponent(restaurantId)}`} className="text-sm font-medium text-gray-700 hover:text-gray-900">
          ← Back to menu
        </Link>
      </header>

      <main className="max-w-3xl mx-auto mt-8 grid grid-cols-1 gap-6">
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>

          <div className="mt-6">
            <h2 className="font-semibold text-gray-900 mb-3">Delivery address</h2>
            <input
              value={delivery.address}
              onChange={(e) => setDelivery((p) => ({ ...p, address: e.target.value }))}
              placeholder="Enter your delivery address"
              className="w-full h-11 rounded-lg border border-gray-200 px-3 outline-none focus:border-[#38e07b]"
            />
            <input type="hidden" value={delivery.lat} />
            <input type="hidden" value={delivery.lon} />
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900">Your basket</h2>
          {cart.length === 0 ? (
            <p className="text-sm text-gray-600 mt-3">Basket is empty.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {cart.map((i) => (
                <div key={i.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <div
                    className="w-12 h-12 rounded-lg bg-gray-200 bg-cover bg-center shrink-0"
                    style={{ backgroundImage: i.image ? `url(${i.image})` : undefined }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-gray-900 truncate">{i.name}</div>
                      <div className="font-bold text-gray-900">€{(i.price * i.quantity).toFixed(2)}</div>
                    </div>
                    <div className="text-sm text-gray-600">{i.quantity} × €{i.price.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 border-t border-gray-200 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">€{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-gray-600">Delivery fee</span>
              <span className="font-medium text-gray-900">€{deliveryFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t border-gray-200 text-base font-bold">
              <span>Total</span>
              <span>€{total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={placeOrder}
            disabled={placing}
            className="mt-5 w-full h-12 rounded-full bg-[#38e07b] text-gray-900 font-bold hover:opacity-90 disabled:opacity-60"
          >
            {placing ? 'Placing order…' : 'Place order'}
          </button>
        </section>
      </main>
    </div>
  );
}

