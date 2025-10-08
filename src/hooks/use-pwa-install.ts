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

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const DISMISS_KEY = 'pwaInstallDismissedTimestamp';
const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000;

export const usePWAInstall = () => {
  const [canInstall, setCanInstall] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      setCanInstall(true);
      
      const dismissedTimestamp = localStorage.getItem(DISMISS_KEY);
      if (dismissedTimestamp) {
        const timeSinceDismiss = Date.now() - parseInt(dismissedTimestamp, 10);
        if (timeSinceDismiss > TWENTY_FOUR_HOURS_IN_MS) {
          setShowInstallPrompt(true);
        } else {
          setShowInstallPrompt(false);
        }
      } else {
        setShowInstallPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      deferredPrompt = null;
      setCanInstall(false);
      setShowInstallPrompt(false);
      localStorage.removeItem(DISMISS_KEY);
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Initial check in case the event was already fired and captured
    if (deferredPrompt) {
       handleBeforeInstallPrompt(deferredPrompt);
    }

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
      // The 'appinstalled' event will handle hiding the banner.
    } else {
      console.log('User dismissed the install prompt');
      // If the user dismisses the native prompt, we should also treat it as a dismissal.
      dismissInstallPrompt();
    }
  }, []);

  const dismissInstallPrompt = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowInstallPrompt(false);
  }, []);

  return { showInstallPrompt, installPWA, dismissInstallPrompt };
};
