import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getCurrentUser, onSignedOut, signOut, type WhsUser } from './services/auth.ts';
import { loadHomeRaw } from './services/home.ts';
import { emptyHomeData } from './utils/homeData.ts';
import { buildHomeData, type HomeRaw } from './utils/homeBuild.ts';
import { SiteScopeProvider, useSiteScope } from './hooks/useSiteScope.tsx';
import { useIsPhone } from './hooks/useIsPhone.ts';
import { useRoute } from './hooks/useRoute.ts';
import { LoginScreen } from './components/LoginScreen.tsx';
import { DesktopApp } from './components/DesktopApp.tsx';
import { PhoneApp } from './components/PhoneApp.tsx';

export default function App() {
  return (
    <SiteScopeProvider>
      <AppInner />
    </SiteScopeProvider>
  );
}

function AppInner() {
  const [user, setUser] = useState<WhsUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [raw, setRaw] = useState<HomeRaw | null>(null);
  const { site } = useSiteScope();
  const { route } = useRoute();
  const { narrow, showPhone, setUseFull } = useIsPhone();

  useEffect(() => {
    let live = true;
    getCurrentUser().then(u => {
      if (!live) return;
      setUser(u);
      setChecking(false);
    });
    const stop = onSignedOut(() => setUser(null));
    return () => {
      live = false;
      stop();
    };
  }, []);

  // Reload the home screen's numbers each time someone comes back to it.
  useEffect(() => {
    if (!user || route.name !== 'home') return;
    loadHomeRaw().then(setRaw);
  }, [user, route.name]);

  // The numbers follow the site switcher without another trip to the server
  const data = useMemo(() => (raw && user ? buildHomeData(raw, user.id, site) : emptyHomeData()), [raw, user, site]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setUser(null);
    window.location.hash = '#/';
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading
      </div>
    );
  }

  if (!user) return <LoginScreen onSignedIn={setUser} />;

  if (showPhone) {
    return (
      <PhoneApp
        user={user}
        data={data}
        route={route}
        onSignOut={handleSignOut}
        onFullVersion={() => setUseFull(true)}
      />
    );
  }

  return (
    <DesktopApp
      user={user}
      data={data}
      route={route}
      onSignOut={handleSignOut}
      onPhoneLayout={narrow ? () => setUseFull(false) : undefined}
    />
  );
}
