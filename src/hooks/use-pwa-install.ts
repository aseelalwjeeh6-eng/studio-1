'use client';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Store the prompt event in a global variable to persist across component mounts/unmounts
let deferredPrompt: BeforeInstallPromptEvent | null = null;

export const usePWAInstall = () => {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      // Use localStorage to persist the ability to show the prompt
      localStorage.setItem('canInstallPWA', 'true');
      setCanInstall(true);
      console.log('beforeinstallprompt event fired and captured.');
    };

    const handleAppInstalled = () => {
      console.log('PWA was installed');
      deferredPrompt = null;
      localStorage.removeItem('canInstallPWA');
      setCanInstall(false);
    };
    
    // Check localStorage on initial load
    if (localStorage.getItem('canInstallPWA') === 'true' && deferredPrompt) {
        setCanInstall(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installPWA = useCallback(async () => {
    if (!deferredPrompt) {
        console.log('Installation prompt not available.');
        return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      // The 'appinstalled' event will handle cleanup
    } else {
      console.log('User dismissed the install prompt');
      // Keep canInstall true so the user can try again later
    }
  }, []);

  return { canInstall, installPWA };
};
