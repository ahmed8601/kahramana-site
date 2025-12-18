'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import {
  ShoppingCart,
  X,
  Plus,
  Minus,
  Send,
  Search,
  Flame,
  Clock,
  User,
  Phone,
  Navigation,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Utensils,
  Truck,
} from 'lucide-react';

// ===============================
// CONFIG
// ===============================
const STORAGE_KEY = 'kahramana_cart_v1';
const STORAGE_VERSION = 1;

const HERO_VIDEO_SRC = '/hero/kahramana-hero.mp4'; // ضع الفيديو داخل public/hero/
const HERO_POSTER_SRC = 'https://i.imgur.com/VWCe9vK.jpg';

// واتساب مركزي واحد (من Netlify Env / .env.local)
const CENTRAL_WHATSAPP_NUMBER =
  (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, ''); // مثال: 97317131413

const BRANCHES = {
  central: { id: 'central', name: 'الطلبات (رقم مركزي)', phone: '17131413', delivery: 'حسب المنطقة' },
} as const;

type BranchId = keyof typeof BRANCHES;

const MENU_ITEMS = [
  { id: 1, category: 'main', name: 'القوزي العراقي الملكي', price: 12.5, weight: '1.5 كجم', image: HERO_POSTER_SRC, isFeatured: true, isSpicy: false },
  { id: 2, category: 'grill', name: 'كباب عراقي مشكل', price: 4.5, weight: '450 جرام', image: 'https://i.imgur.com/ZofCGKK.jpg', isFeatured: true, isSpicy: true },
  { id: 3, category: 'main', name: 'برياني دجاج بغدادي', price: 5.8, weight: '850 جرام', image: 'https://i.imgur.com/62ghngb.jpg', isFeatured: false, isSpicy: false },
  { id: 4, category: 'grill', name: 'سمك مسكوف عراقي', price: 8.9, weight: '1.2 كجم', image: 'https://i.imgur.com/aeCIQ6L.jpg', isFeatured: true, isSpicy: false },
] as const;

const DEFAULT_CUSTOMER = { name: '', phone: '', address: '', payment: 'BenefitPay' as 'BenefitPay' | 'Cash' };

const normalizeArabic = (t: string) =>
  (t || '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();

const digitsOnly = (s: string) => (s || '').replace(/\D/g, '');

const isValidBahrainPhone = (phone: string) => {
  const d = digitsOnly(phone);
  return d.length === 8 && /^[1-7]/.test(d);
};

// يحول رقم واتساب (8 أرقام بحريني) إلى wa.me مع كود الدولة
const toWhatsappBH = (bh8: string) => `973${digitsOnly(bh8)}`;

type ToastType = 'success' | 'error' | 'info';

export default function Page() {
  const menuRef = useRef<HTMLDivElement | null>(null);

  // UI State
  const [isMounted, setIsMounted] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<BranchId>('central');
  const [showBranchSelector, setShowBranchSelector] = useState(false); // لدينا رقم مركزي، لا داعي لإجبار المستخدم
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'main' | 'grill'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [customer, setCustomer] = useState(DEFAULT_CUSTOMER);
  const [formError, setFormError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  // “تتبع” بصري بسيط بعد الإرسال (ليس تتبع حقيقي)
  const [activeOrder, setActiveOrder] = useState<{ id: number; status: 1 | 2 | 3 } | null>(null);

  // Format
  const formatBHD = useMemo(
    () => new Intl.NumberFormat('ar-BH', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    []
  );

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const item = MENU_ITEMS.find((x) => x.id === Number(id));
        return item ? { ...item, quantity: Number(qty) } : null;
      })
      .filter(Boolean) as Array<(typeof MENU_ITEMS)[number] & { quantity: number }>;
  }, [cart]);

  const cartTotal = useMemo(() => cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((acc, i) => acc + i.quantity, 0), [cartItems]);

  const filteredMenu = useMemo(() => {
    const q = normalizeArabic(searchQuery);
    return MENU_ITEMS.filter(
      (item) =>
        (filter === 'all' || item.category === filter) &&
        (!q || normalizeArabic(item.name).includes(q))
    );
  }, [filter, searchQuery]);

  // ===============================
  // Persistence (اختياري + آمن)
  // ===============================
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.v === STORAGE_VERSION) {
          if (parsed?.cart && typeof parsed.cart === 'object') {
            const cleaned: Record<number, number> = {};
            Object.entries(parsed.cart).forEach(([id, qty]) => {
              const nId = Number(id);
              const nQty = Number(qty);
              if (MENU_ITEMS.some((x) => x.id === nId) && nQty > 0) cleaned[nId] = nQty;
            });
            setCart(cleaned);
          }
        }
      }
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    } finally {
      setIsMounted(true);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, cart }));
    } catch {
      // لو المتصفح يمنع التخزين، لا نكسر التجربة
    }
  }, [cart, isMounted]);

  useEffect(() => {
    if (cartItems.length === 0) setShowCheckoutForm(false);
  }, [cartItems.length]);

  // ===============================
  // Handlers
  // ===============================
  const addToCart = useCallback((itemId: number) => {
    setCart((prev) => {
      const next = { ...prev, [itemId]: (prev[itemId] || 0) + 1 };
      return next;
    });
    setIsCartOpen(true);
    setShowCheckoutForm(false);
    showToast('تمت الإضافة للسلة ✅', 'success');
  }, [showToast]);

  const updateQty = useCallback((itemId: number, delta: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const updated = (next[itemId] || 0) + delta;
      if (updated <= 0) delete next[itemId];
      else next[itemId] = updated;
      return next;
    });
  }, []);

  const scrollToMenu = useCallback(() => {
    menuRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const processOrder = useCallback(async () => {
    setFormError('');

    if (cartItems.length === 0) {
      setFormError('السلة فارغة. أضف صنف واحد على الأقل.');
      return;
    }

    if (!customer.name.trim() || !customer.address.trim() || !customer.phone.trim()) {
      setFormError('يرجى إدخال (الاسم، الهاتف، العنوان).');
      return;
    }

    if (!isValidBahrainPhone(customer.phone)) {
      setFormError('الرجاء إدخال رقم هاتف بحريني صحيح (8 أرقام).');
      return;
    }

    if (!CENTRAL_WHATSAPP_NUMBER) {
      setFormError('رقم واتساب غير مُعدّ. أضف NEXT_PUBLIC_WHATSAPP_NUMBER في إعدادات Netlify.');
      return;
    }

    setIsProcessing(true);

    try {
      const itemsText = cartItems
        .map((i) => `• ${i.name} (${i.weight}) ×${i.quantity} = ${formatBHD.format(i.price * i.quantity)} د.ب`)
        .join('\n');

      const time = new Date().toLocaleString('ar-BH', { timeZone: 'Asia/Bahrain' });

      const msg =
        `*طلب جديد - كهرمانة بغداد* 🧾\n` +
        `--------------------------\n` +
        `📅 *التاريخ:* ${time}\n` +
        `👤 *العميل:* ${customer.name}\n` +
        `📞 *الهاتف:* ${digitsOnly(customer.phone)}\n` +
        `📍 *العنوان:* ${customer.address}\n` +
        `🏧 *الدفع:* ${customer.payment === 'BenefitPay' ? 'بنفت بي' : 'نقداً'}\n` +
        `--------------------------\n` +
        `🛒 *الطلبات:*\n${itemsText}\n\n` +
        `💰 *الإجمالي:* ${formatBHD.format(cartTotal)} د.ب`;

      const wa = `https://wa.me/${CENTRAL_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
      window.open(wa, '_blank', 'noopener,noreferrer');

      // “تتبع” بصري بعد الإرسال
      setActiveOrder({ id: Math.floor(1000 + Math.random() * 9000), status: 1 });

      // Reset
      setCart({});
      setCustomer(DEFAULT_CUSTOMER);
      setIsCartOpen(false);
      setShowCheckoutForm(false);
      showToast('تم فتح واتساب لإرسال الطلب ✅', 'success');

      // تقدّم شكلي
      window.setTimeout(() => setActiveOrder((o) => (o ? { ...o, status: 2 } : null)), 2500);
      window.setTimeout(() => setActiveOrder((o) => (o ? { ...o, status: 3 } : null)), 6500);
    } catch {
      setFormError('حدث خطأ غير متوقع. حاول مرة أخرى.');
      showToast('حدث خطأ أثناء تجهيز الطلب', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [cartItems, cartTotal, customer, formatBHD, showToast]);

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-amber-500/30 font-sans" dir="rtl">
      <Head>
        <title>كهرمانة بغداد | المذاق العراقي الأصيل</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <meta property="og:title" content="كهرمانة بغداد - المذاق العراقي الأصيل" />
        <meta property="og:image" content={HERO_POSTER_SRC} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-24 right-6 z-[500] px-5 py-3 rounded-2xl text-xs font-black shadow-2xl border border-white/10 ${
            toast.type === 'success'
              ? 'bg-emerald-600'
              : toast.type === 'error'
              ? 'bg-red-600'
              : 'bg-neutral-800'
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}

      {/* Navbar */}
      <nav className="fixed top-0 w-full bg-black/80 backdrop-blur-xl z-[100] border-b border-white/5 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center font-black text-black shadow-lg shadow-amber-500/20">
            ك
          </div>

          <button
            onClick={scrollToMenu}
            className="hidden sm:inline-flex px-4 py-2 bg-neutral-900 border border-white/5 rounded-2xl hover:border-amber-500/50 transition-all text-[10px] font-black"
            aria-label="الانتقال إلى القائمة"
          >
            القائمة
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:relative sm:block">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
            <input
              type="text"
              placeholder="ماذا تشتهي اليوم؟"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-neutral-900/50 border border-white/10 rounded-full py-2 pr-10 pl-4 text-[10px] focus:border-amber-500 outline-none w-48 focus:w-64 transition-all"
              aria-label="بحث في القائمة"
            />
          </div>

          <button
            onClick={() => {
              setIsCartOpen(true);
              setShowCheckoutForm(false);
            }}
            className="relative p-3 bg-neutral-900 rounded-2xl border border-white/5"
            aria-label="فتح السلة"
          >
            <ShoppingCart className="w-6 h-6 text-amber-500" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="h-[44vh] relative flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-black/20 to-black/60 z-10" />

        <video
          className="absolute inset-0 w-full h-full object-cover opacity-35 scale-105"
          autoPlay
          muted
          loop
          playsInline
          poster={HERO_POSTER_SRC}
        >
          <source src={HERO_VIDEO_SRC} type="video/mp4" />
        </video>

        <div className="relative z-20 text-center px-6">
          <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter">كهرمانة بغداد</h1>
          <p className="text-amber-500 font-bold tracking-[0.28em] text-[9px] mt-2">المذاق العراقي الأصيل في البحرين</p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={scrollToMenu}
              className="px-8 py-4 bg-amber-600 text-black rounded-2xl font-black text-xs hover:bg-amber-500 transition-all shadow-xl shadow-amber-600/20"
            >
              اطلب الآن
            </button>
            <button
              onClick={() => setIsCartOpen(true)}
              className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs border border-white/10 hover:border-amber-500/40 transition-all"
            >
              السلة
            </button>
          </div>
        </div>
      </section>

      {/* Tracking (تصويري فقط) */}
      {activeOrder && (
        <section className="pt-6 px-6 max-w-7xl mx-auto">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-amber-500 p-4 rounded-2xl text-black">
                <Clock className="animate-pulse" />
              </div>
              <div>
                <h3 className="font-black text-lg">طلبك رقم #{activeOrder.id}</h3>
                <p className="text-xs text-neutral-400">تم فتح واتساب لإرسال الطلب — نتابع التجهيز</p>
              </div>
            </div>

            <div className="flex items-center gap-3 md:gap-8">
              <div className={`flex flex-col items-center ${activeOrder.status >= 1 ? 'opacity-100' : 'opacity-40'}`}>
                <CheckCircle2 className="w-6 h-6 mb-1 text-amber-500" />
                <span className="text-[8px] font-bold">تم الإرسال</span>
              </div>
              <div className="w-10 md:w-16 h-[1px] bg-white/10" />
              <div className={`flex flex-col items-center ${activeOrder.status >= 2 ? 'opacity-100' : 'opacity-40'}`}>
                <Utensils className={`w-6 h-6 mb-1 ${activeOrder.status >= 2 ? 'text-amber-500' : ''}`} />
                <span className="text-[8px] font-bold">في المطبخ</span>
              </div>
              <div className="w-10 md:w-16 h-[1px] bg-white/10" />
              <div className={`flex flex-col items-center ${activeOrder.status >= 3 ? 'opacity-100' : 'opacity-40'}`}>
                <Truck className={`w-6 h-6 mb-1 ${activeOrder.status >= 3 ? 'text-amber-500' : ''}`} />
                <span className="text-[8px] font-bold">مع السائق</span>
              </div>
            </div>

            <button onClick={() => setActiveOrder(null)} className="text-[10px] text-neutral-400 hover:text-white underline">
              إخفاء
            </button>
          </div>
        </section>
      )}

      {/* Menu */}
      <main ref={menuRef} className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
          {(['all', 'main', 'grill'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-8 py-3 rounded-2xl text-[9px] font-black tracking-widest transition-all whitespace-nowrap ${
                filter === c ? 'bg-amber-600 text-black shadow-lg shadow-amber-600/20' : 'bg-neutral-900 text-neutral-500 border border-white/5'
              }`}
              aria-label={`فلترة القائمة: ${c}`}
            >
              {c === 'all' ? 'القائمة الكاملة' : c === 'main' ? 'الأطباق الرئيسية' : 'مشاوينا الخاصة'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredMenu.map((item) => (
            <div
              key={item.id}
              className="bg-[#0f0f0f] rounded-[2.5rem] border border-white/5 overflow-hidden group hover:border-amber-500/20 transition-all duration-500"
            >
              <div className="h-64 relative bg-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={item.name} />
                {item.isFeatured && (
                  <div className="absolute top-5 right-5 bg-amber-500 text-black text-[8px] font-black px-3 py-1.5 rounded-full">
                    الأكثر طلباً
                  </div>
                )}
                {item.isSpicy && (
                  <div className="absolute top-5 left-5 bg-black/40 backdrop-blur-md p-2 rounded-xl">
                    <Flame className="w-4 h-4 text-red-500" />
                  </div>
                )}
              </div>

              <div className="p-8">
                <div className="flex justify-between items-center mb-6 gap-4">
                  <h3 className="text-lg font-black leading-tight">{item.name}</h3>
                  <span className="text-amber-500 font-black italic text-lg">
                    {formatBHD.format(item.price)} <span className="text-[10px]">د.ب</span>
                  </span>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                  <span className="text-[9px] text-neutral-500 font-bold flex items-center gap-2">
                    <Clock className="w-3 h-3" /> {item.weight}
                  </span>

                  <button
                    onClick={() => addToCart(item.id)}
                    className="px-6 py-3 bg-white text-black rounded-xl font-black text-[10px] hover:bg-amber-600 hover:text-white transition-all transform hover:-translate-y-1"
                    aria-label={`أضف ${item.name} للسلة`}
                  >
                    أضف للسلة
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[200] flex justify-end">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsCartOpen(false)}
            aria-hidden="true"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            className="relative w-full max-w-md bg-[#0a0a0a] h-full flex flex-col border-l border-white/5 shadow-2xl animate-slide-in"
          >
            <div className="p-8 border-b border-white/5 flex justify-between items-center">
              <h2 id="cart-title" className="text-xl font-black italic">
                حقيبة الطلبات
              </h2>
              <button onClick={() => setIsCartOpen(false)} className="p-2 bg-neutral-900 rounded-full hover:rotate-90 transition-all" aria-label="إغلاق السلة">
                <X />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {!showCheckoutForm ? (
                cartItems.length === 0 ? (
                  <div className="text-center py-20 opacity-30">
                    <ShoppingCart className="w-16 h-16 mx-auto mb-4" />
                    <p className="font-black italic text-xs">سلتك خالية حالياً</p>
                  </div>
                ) : (
                  cartItems.map((item) => (
                    <div key={item.id} className="flex gap-4 items-center bg-neutral-900/30 p-4 rounded-3xl border border-white/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} className="w-14 h-14 rounded-2xl object-cover" alt={item.name} />

                      <div className="flex-1">
                        <h4 className="font-bold text-[13px] leading-tight">{item.name}</h4>
                        <p className="text-amber-500 font-black text-[11px] mt-1">{formatBHD.format(item.price)} د.ب</p>
                      </div>

                      <div className="flex items-center gap-3 bg-black rounded-2xl p-2 px-3 border border-white/5">
                        <button onClick={() => updateQty(item.id, -1)} className="hover:text-red-500 transition-colors" aria-label="إنقاص الكمية">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-black text-xs min-w-[12px] text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="hover:text-emerald-500 transition-colors" aria-label="زيادة الكمية">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )
              ) : (
                <div className="space-y-6 animate-fade-in">
                  {formError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-200 text-[10px] font-bold flex items-center gap-3">
                      <AlertCircle className="w-4 h-4" /> {formError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="relative">
                      <User className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                      <input
                        value={customer.name}
                        onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                        type="text"
                        placeholder="الاسم الكامل"
                        className="w-full bg-neutral-900 border border-white/5 p-4 pr-12 rounded-2xl text-xs outline-none focus:border-amber-500 transition-all"
                        aria-label="الاسم الكامل"
                      />
                    </div>

                    <div className="relative">
                      <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                      <input
                        value={customer.phone}
                        onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                        type="tel"
                        inputMode="numeric"
                        placeholder="رقم الهاتف (8 أرقام)"
                        className="w-full bg-neutral-900 border border-white/5 p-4 pr-12 rounded-2xl text-xs outline-none focus:border-amber-500 transition-all"
                        aria-label="رقم الهاتف"
                      />
                    </div>

                    <div className="relative">
                      <Navigation className="absolute right-4 top-5 w-4 h-4 text-neutral-600" />
                      <textarea
                        value={customer.address}
                        onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))}
                        placeholder="العنوان (المنطقة، المجمع، الشارع...)"
                        className="w-full bg-neutral-900 border border-white/5 p-4 pr-12 rounded-2xl text-xs h-32 outline-none focus:border-amber-500 transition-all resize-none"
                        aria-label="العنوان"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(['BenefitPay', 'Cash'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setCustomer((c) => ({ ...c, payment: m }))}
                        className={`py-4 rounded-2xl text-[9px] font-black tracking-widest border transition-all ${
                          customer.payment === m ? 'bg-amber-600 border-amber-600 text-black' : 'bg-neutral-900 border-white/5 text-neutral-500'
                        }`}
                        aria-label={`طريقة الدفع: ${m}`}
                      >
                        {m === 'BenefitPay' ? 'بنفت بي' : 'الدفع نقداً'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="p-8 bg-neutral-900 border-t border-white/10 rounded-t-[3rem] shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-neutral-500 font-bold text-[10px] tracking-widest uppercase">المجموع النهائي</span>
                  <span className="text-2xl font-black text-amber-500 italic">
                    {formatBHD.format(cartTotal)} <span className="text-[10px]">د.ب</span>
                  </span>
                </div>

                {!showCheckoutForm ? (
                  <button
                    onClick={() => setShowCheckoutForm(true)}
                    className="w-full py-6 bg-white text-black rounded-[2rem] font-black text-sm hover:bg-amber-500 hover:text-white transition-all shadow-xl"
                    aria-label="متابعة الطلب"
                  >
                    متابعة الطلب
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowCheckoutForm(false);
                        setFormError('');
                      }}
                      className="px-6 bg-neutral-800 rounded-3xl hover:bg-amber-500/10 transition-all"
                      aria-label="رجوع"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>

                    <button
                      disabled={isProcessing}
                      onClick={processOrder}
                      className="flex-1 py-6 bg-emerald-600 rounded-[2rem] font-black text-sm flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all disabled:opacity-50"
                      aria-label="تأكيد الطلب عبر واتساب"
                    >
                      {isProcessing ? 'جاري التحضير...' : 'تأكيد الطلب'} <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Branch Selector (اختياري) */}
      {showBranchSelector && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-6 backdrop-blur-3xl animate-fade-in">
          <div className="max-w-xl w-full text-center">
            <h2 className="text-3xl font-black mb-10 italic">أهلاً بك في كهرمانة بغداد</h2>
            <button
              onClick={() => {
                setSelectedBranch('central');
                setShowBranchSelector(false);
              }}
              className="p-8 rounded-[2rem] bg-neutral-900 border border-white/5 hover:border-amber-500 transition-all text-right w-full"
            >
              <h4 className="text-xl font-black mb-2 text-amber-500">الطلبات (رقم مركزي)</h4>
              <p className="text-[10px] text-neutral-400 font-bold">واتساب: {BRANCHES.central.phone}</p>
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        .animate-slide-in { animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}
