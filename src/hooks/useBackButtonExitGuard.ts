'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export const BackButtonExitGuard = () => {
    const router = useRouter();
    const pathname = usePathname();
    const clickCount = useRef(0);
    const resetTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            // Prevent the default back behavior
            event.preventDefault();

            // Always push a new state to "catch" the next back button press
            window.history.pushState(null, '', window.location.href);

            // If it's not the root page, just navigate back normally
            // This allows back navigation within the app (e.g., from profile to lobby)
            if (pathname !== '/lobby' && pathname !== '/') {
                 router.back();
                 return;
            }

            // If on lobby or login page, handle exit logic
            clickCount.current += 1;

            if (resetTimeout.current) {
                clearTimeout(resetTimeout.current);
            }

            if (clickCount.current >= 3) {
                // Allow the native back action to proceed, which might exit the PWA
                window.history.back();
            } else {
                 console.log(`اضغط ${3 - clickCount.current} مرات أخرى للخروج`);
                 
                resetTimeout.current = setTimeout(() => {
                    clickCount.current = 0;
                }, 2000);
            }
        };

        // On initial load, and on every route change, push a state
        // so the first back button press is always caught.
        window.history.pushState(null, '', window.location.href);
        
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
            if (resetTimeout.current) {
                clearTimeout(resetTimeout.current);
            }
        };
    }, [pathname, router]);

    return null; // This is a side-effect component, it doesn't render anything
};
