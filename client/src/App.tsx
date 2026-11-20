import { ReactNode, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Shell, PublicShell } from './components/Shell';
import { Skeleton } from './components/ui';
import Landing from './pages/Landing';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Cases = lazy(() => import('./pages/Cases'));
const CaseNew = lazy(() => import('./pages/CaseNew'));
const CaseDetail = lazy(() => import('./pages/CaseDetail'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const Shadow = lazy(() => import('./pages/Shadow'));
const Owner = lazy(() => import('./pages/Owner'));
const Fairness = lazy(() => import('./pages/Fairness'));
const Settings = lazy(() => import('./pages/Settings'));
const InvestVerify = lazy(() => import('./pages/InvestVerify'));
const Invest = lazy(() => import('./pages/Invest'));
const InvestCase = lazy(() => import('./pages/InvestCase'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Repayments = lazy(() => import('./pages/Repayments'));
const Structure = lazy(() => import('./pages/Structure'));
const About = lazy(() => import('./pages/About'));
const Stub = lazy(() => import('./pages/Stub'));

function Loading() {
  return (
    <div className="space-y-3 max-w-3xl">
      <Skeleton h={34} w="40%" />
      <Skeleton h={18} w="70%" />
      <Skeleton h={180} />
    </div>
  );
}

function Guard({ roles, children }: { roles?: ('lender' | 'investor')[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'investor' ? '/portfolio' : '/dashboard'} replace />;
  return <>{children}</>;
}

const staff: 'lender'[] = ['lender'];

export function App() {
  const { user } = useAuth();
  const inShell = (el: ReactNode, roles?: ('lender' | 'investor')[]) => (
    <Guard roles={roles}>
      <Shell>
        <Suspense fallback={<Loading />}>{el}</Suspense>
      </Shell>
    </Guard>
  );
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/owner/:token"
        element={
          <PublicShell>
            <Suspense fallback={<Loading />}>
              <Owner />
            </Suspense>
          </PublicShell>
        }
      />
      <Route path="/dashboard" element={inShell(<Dashboard />, staff)} />
      <Route path="/cases" element={inShell(<Cases />, staff)} />
      <Route path="/apply" element={<PublicShell><Suspense fallback={<Loading />}><CaseNew /></Suspense></PublicShell>} />
      <Route path="/cases/new" element={<Navigate to="/apply" replace />} />
      <Route path="/cases/:id" element={inShell(<CaseDetail />, staff)} />
      <Route path="/cases/:id/field-visit" element={inShell(<Stub kind="field_visit" />, staff)} />
      <Route path="/cases/:id/counterparty" element={inShell(<Stub kind="counterparty" />, staff)} />
      <Route path="/watchlist" element={inShell(<Watchlist />, staff)} />
      <Route path="/repayments" element={inShell(<Repayments />, staff)} />
      <Route path="/shadow" element={inShell(<Shadow />, staff)} />
      <Route path="/fairness" element={inShell(<Fairness />, staff)} />
      <Route path="/settings" element={inShell(<Settings />, staff)} />
      <Route path="/structure" element={inShell(<Structure />)} />
      <Route path="/about" element={user ? inShell(<About />) : <PublicShell><Suspense fallback={<Loading />}><div className="px-4 md:px-10 py-6 max-w-5xl"><About /></div></Suspense></PublicShell>} />
      <Route path="/invest" element={inShell(<Invest />, ['investor'])} />
      <Route path="/invest/verify" element={inShell(<InvestVerify />, ['investor'])} />
      <Route path="/invest/:caseId" element={inShell(<InvestCase />, ['investor'])} />
      <Route path="/portfolio" element={inShell(<Portfolio />, ['investor'])} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
