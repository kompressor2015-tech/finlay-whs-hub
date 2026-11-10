import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getCurrentUser, onSignedOut, signOut, type WhsUser } from './services/auth.ts';
import { loadHomeData } from './services/home.ts';
import { emptyHomeData, type HomeData } from './utils/homeData.ts';
import { sampleHomeData } from './data/sampleHome.ts';
import { useIsPhone } from './hooks/useIsPhone.ts';
import { useRoute } from './hooks/useRoute.ts';
import { LoginScreen } from './components/LoginScreen.tsx';
import { DesktopApp } from './components/DesktopApp.tsx';
import { PhoneApp } from './components/PhoneApp.tsx';

const SAMPLE_KEY = 'whsSampleData';

function readSample(): boolean {
  try {
    return sessionStorage.getItem(SAMPLE_KEY) === '1' || new URLSearchParams(window.location.search).has('sample');
  } catch {
    return false;
  }
}

export default function App() {
  const [user, setUser] = useState<WhsUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [realData, setRealData] = useState<HomeData>(emptyHomeData);
  const [sample, setSample] = useState(readSample);
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

  useEffect(() => {
    if (!user) return;
    loadHomeData().then(setRealData);
  }, [user]);

  const changeSample = useCallback((on: boolean) => {
    setSample(on);
    try {
      if (on) sessionStorage.setItem(SAMPLE_KEY, '1');
      else sessionStorage.removeItem(SAMPLE_KEY);
    } catch {
      // storage unavailable
    }
  }, []);

  const data = useMemo(() => (sample ? sampleHomeData() : realData), [sample, realData]);

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
        sample={sample}
        onSampleChange={changeSample}
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
      sample={sample}
      onSampleChange={changeSample}
      onSignOut={handleSignOut}
      onPhoneLayout={narrow ? () => setUseFull(false) : undefined}
    />
  );
}
