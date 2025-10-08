'use client';

import { usePWAInstall } from "@/hooks/use-pwa-install";
import { Button } from "../ui/button";
import { ArrowDownToLine, Smartphone, X } from "lucide-react";
import Image from "next/image";

export function PwaInstallBanner() {
    const { showInstallPrompt, installPWA, dismissInstallPrompt } = usePWAInstall();

    if (!showInstallPrompt) {
        return null;
    }

    return (
        <div className="bg-gradient-to-r from-primary/80 to-accent/80 backdrop-blur-md text-primary-foreground p-3 flex items-center justify-between gap-4">
             <div className="flex items-center gap-4">
                <Image src="https://i.ibb.co/7J9rmdS0/1759934438802.jpg" alt="App Logo" width={48} height={48} className="rounded-lg shadow-md hidden sm:block" />
                <div>
                    <h3 className="font-bold text-base sm:text-lg">ثبّت أصيل سينما</h3>
                    <p className="text-xs sm:text-sm text-primary-foreground/90">احصل على تجربة أفضل وأسرع على جهازك.</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button 
                    onClick={installPWA}
                    size="sm"
                    className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 h-9 sm:h-10"
                >
                    <ArrowDownToLine className="me-2" />
                    تثبيت
                </Button>
                <Button 
                    onClick={dismissInstallPrompt}
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-full hover:bg-black/20"
                >
                    <X />
                </Button>
            </div>
        </div>
    );
}
