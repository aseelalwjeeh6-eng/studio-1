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
            // Only apply this logic on the root/login page
            if (pathname === '/') {
                event.preventDefault();

                clickCount.current += 1;

                if (resetTimeout.current) {
                    clearTimeout(resetTimeout.current);
                }

                if (clickCount.current >= 3) {
                    // Allow the native back action to proceed, which might exit the PWA
                    window.history.back();
                } else {
                     console.log(`اضغط ${3 - clickCount.current} مرات أخرى للخروج`);
                     
                     // Push a state to "catch" the back button press
                     window.history.pushState(null, '', window.location.href);

                    resetTimeout.current = setTimeout(() => {
                        clickCount.current = 0;
                    }, 2000);
                }
            } else {
                 // For other pages, allow normal back navigation
                router.back();
            }
        };

        // On initial load, push a state so the first back button press is caught
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
