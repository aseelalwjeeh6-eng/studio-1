'use client';

import { useState, useEffect } from 'react';
import { Gifts, Gift } from '@/lib/gifts';
import { cn } from '@/lib/utils';
import { Heart } from 'lucide-react';

interface GiftEvent {
    id: string;
    giftId: string;
    senderName: string;
    recipientName: string;
    timestamp: number;
}

interface GiftAnimationOverlayProps {
    latestGift: GiftEvent | undefined;
    currentUser: string;
}

export default function GiftAnimationOverlay({ latestGift, currentUser }: GiftAnimationOverlayProps) {
    const [activeGift, setActiveGift] = useState<Gift | null>(null);
    const [animationKey, setAnimationKey] = useState(0);

    useEffect(() => {
        if (!latestGift) return;

        const giftData = Gifts.find(g => g.id === latestGift.giftId);
        if (giftData) {
            setActiveGift(giftData);
            setAnimationKey(prev => prev + 1); // Re-trigger animation

            if (giftData.soundUrl) {
                try {
                    const audio = new Audio(giftData.soundUrl);
                    audio.play().catch(e => console.error("Error playing gift sound:", e));
                } catch (e) {
                    console.error("Failed to create Audio object for gift sound:", e);
                }
            }


            const timer = setTimeout(() => {
                setActiveGift(null);
            }, 4000); // Animation duration + buffer

            return () => clearTimeout(timer);
        }
    }, [latestGift]);

    if (!activeGift) {
        return null;
    }

    const isSender = latestGift?.senderName === currentUser;
    const isRecipient = latestGift?.recipientName === currentUser;

    return (
        <div 
            key={animationKey}
            className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/30"
            style={{ animation: 'gift-fade-in-out 4s ease-in-out' }}
        >
            <div 
                className={cn(
                    "text-8xl md:text-9xl",
                    activeGift.animation
                )}
                style={{ animation: `${activeGift.animation} 3s ease-out forwards 0.5s` }}
            >
                {activeGift.emoji}
            </div>
            <div 
                className="mt-8 text-center text-white text-xl md:text-2xl font-bold bg-black/50 px-6 py-3 rounded-lg"
                style={{ animation: `gift-fade-in-out 3s ease-in-out 0.2s`}}
            >
                <p>
                    <span className="text-accent">{latestGift?.senderName}</span>
                    <span className="mx-2">أرسل</span>
                    <span className="text-pink-400">{activeGift.name}</span>
                    <span className="mx-2">إلى</span>
                    <span className="text-accent">{latestGift?.recipientName}</span>
                </p>
                <p className="text-lg text-gray-300 italic mt-1">"{activeGift.message}"</p>
            </div>
        </div>
    );
}
