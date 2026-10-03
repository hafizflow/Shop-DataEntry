import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { TabBar, type Tab } from './components/TabBar';
import { ScanBarcode } from 'lucide-react';
import { StatusPill } from './components/StatusPill';
import { Bi } from './components/Bi';
import { Toaster, toast } from './components/Toast';
import { ScanScreen } from './features/scan/ScanScreen';
import { startAutoSync } from './data/autoSync';
import { queue } from './data/productRepo';
import { getDetector } from './scanner/detector';
import { env } from './lib/env';
import { setBilingual, t, tt } from './lib/i18n';

const ProductsScreen = lazy(() => import('./features/products/ProductsScreen').then((m) => ({ default: m.ProductsScreen })));
const AccountScreen = lazy(() => import('./features/account/AccountScreen').then((m) => ({ default: m.AccountScreen })));

function Shell() {
  const { role } = useAuth();
  const [tab, setTab] = useState<Tab>('scan');
  setBilingual(role !== 'owner'); // staff see Bangla beside English; the owner sees English only
  useEffect(() => {
    const stop = startAutoSync();
    const off = queue.onNotice((n) => toast(tt(n.key, n.params), 'error'));
    void getDetector().catch(() => { /* the scanner screen shows its own error */ }); // warm the scanner in the background
    return () => { stop(); off(); };
  }, []);
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg"><ScanBarcode className="size-6" aria-hidden /></span>
          <h1 className="truncate text-base font-bold leading-tight"><Bi k="app.name" stack /></h1>
        </div>
        <StatusPill />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={null}>
          {tab === 'scan' && <ScanScreen />}
          {tab === 'products' && <ProductsScreen />}
          {tab === 'account' && <AccountScreen />}
        </Suspense>
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center text-muted">…</div>;
  return user ? <Shell /> : <LoginScreen />;
}

export default function App() {
  if (!env.configured) return <p className="p-6 font-medium text-danger">{t('config.missing')}</p>;
  return (
    <AuthProvider>
      <Gate />
      <Toaster />
    </AuthProvider>
  );
}
