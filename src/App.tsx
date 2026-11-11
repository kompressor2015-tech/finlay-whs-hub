import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getCurrentUser, onSignedOut, signOut, type WhsUser } from './services/auth.ts';
import { loadHomeData } from './services/home.ts';
import { emptyHomeData, type HomeData } from './utils/homeData.ts';
import { useIsPhone } from './hooks/useIsPhone.ts';
import { useRoute } from './hooks/useRoute.ts';
import { LoginScreen } from './components/LoginScreen.tsx';
import { DesktopApp } from './components/DesktopApp.tsx';
import { PhoneApp } from './components/PhoneApp.tsx';

export default function App() {
  const [user, setUser] = useState<WhsUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<HomeData>(emptyHomeData);
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
    loadHomeData(user.id).then(setData);
  }, [user, route.name]);

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
