
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Gifts, Gift, GiftCategory } from '@/lib/gifts';
import useUserSession from '@/hooks/use-user-session';
import { cn } from '@/lib/utils';
import { Coins, Loader2, Send } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SeatedMember } from './RoomClient';

interface GiftShopDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    recipientName: string;
    onSendGift: (recipientName: string, giftId: string) => Promise<void>;
    seatedMembers: SeatedMember[];
}

const categories: { id: GiftCategory; name: string }[] = [
    { id: 'economic', name: 'اقتصادية' },
    { id: 'medium', name: 'متوسطة' },
    { id: 'luxury', name: 'فاخرة' },
    { id: 'legendary', name: 'أسطورية' },
    { id: 'exclusive', name: 'حصرية' },
];

export default function GiftShopDialog({ isOpen, onOpenChange, recipientName, onSendGift, seatedMembers }: GiftShopDialogProps) {
    const { user } = useUserSession();
    const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [internalRecipient, setInternalRecipient] = useState(recipientName);

    useEffect(() => {
        if (isOpen) {
            setInternalRecipient(recipientName);
            setError('');
        }
    }, [recipientName, isOpen]);

    const handleSend = async () => {
        if (!selectedGift || !user || !internalRecipient) return;
        
        setError('');
        setIsSending(true);
        try {
            await onSendGift(internalRecipient, selectedGift.id);
            setSelectedGift(null);
            onOpenChange(false);
        } catch (e: any) {
            setError(e.message);
            console.error("Failed to send gift:", e);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
                    <DialogHeader className="p-6 pb-4 border-b">
                        <DialogTitle className="text-2xl">متجر الهدايا</DialogTitle>
                         {internalRecipient ? (
                            <DialogDescription>
                                <span>إرسال هدية إلى <span className="font-bold text-accent">{internalRecipient}</span></span>
                            </DialogDescription>
                         ) : (
                            <DialogDescription>اختر مستلمًا من القائمة أدناه.</DialogDescription>
                         )}

                        {!recipientName && seatedMembers.length > 0 && (
                            <Select onValueChange={setInternalRecipient} defaultValue={internalRecipient}>
                                <SelectTrigger className="w-full mt-2 bg-input">
                                    <SelectValue placeholder="اختر مستلم الهدية..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {seatedMembers.filter(m => m.name !== user?.name).map(member => (
                                        <SelectItem key={member.name} value={member.name}>
                                            {member.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        
                        <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                            <Coins className="text-amber-400" />
                            <span>رصيدك: <span className="font-bold text-foreground">{user?.coins?.toLocaleString() || 0}</span></span>
                        </div>
                    </DialogHeader>
                    <Tabs defaultValue="economic" className="flex-grow flex flex-col min-h-0">
                        <div className="px-6 border-b">
                            <ScrollArea className="w-full">
                                <TabsList>
                                    {categories.map(cat => (
                                        <TabsTrigger key={cat.id} value={cat.id}>{cat.name}</TabsTrigger>
                                    ))}
                                </TabsList>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </div>
                        <div className="flex-grow overflow-y-auto">
                            {categories.map(cat => (
                                <TabsContent key={cat.id} value={cat.id} className="mt-0">
                                    <ScrollArea className="h-full">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-6">
                                            {Gifts.filter(g => g.category === cat.id).map(gift => (
                                                <div 
                                                    key={gift.id}
                                                    onClick={() => {
                                                        if (!internalRecipient) {
                                                            setError("الرجاء اختيار مستلم للهدية أولاً.");
                                                            return;
                                                        }
                                                        if((user?.coins || 0) >= gift.cost) {
                                                            setSelectedGift(gift)
                                                        } else {
                                                            setError("ليس لديك كوينزات كافية لهذه الهدية.")
                                                        }
                                                    }}
                                                    className="p-3 border rounded-lg flex flex-col items-center justify-between text-center cursor-pointer hover:bg-secondary/50 transition-colors"
                                                >
                                                    <div className="text-5xl mb-2">{gift.emoji}</div>
                                                    <p className="font-semibold text-sm">{gift.name}</p>
                                                    <div className="flex items-center gap-1 text-xs text-amber-400 font-bold">
                                                        <Coins className="w-3 h-3" />
                                                        <span>{gift.cost.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </TabsContent>
                            ))}
                        </div>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {selectedGift && (
                <AlertDialog open={!!selectedGift} onOpenChange={(open) => !open && setSelectedGift(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>تأكيد إرسال الهدية</AlertDialogTitle>
                            <AlertDialogDescription>
                                هل أنت متأكد من أنك تريد إرسال هدية "{selectedGift.name}" إلى {internalRecipient} مقابل {selectedGift.cost.toLocaleString()} كوينز؟
                            </AlertDialogDescription>
                             {error && <p className="text-sm text-destructive">{error}</p>}
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isSending}>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={handleSend} disabled={isSending || !internalRecipient}>
                                {isSending ? <Loader2 className="animate-spin" /> : "نعم، إرسال"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </>
    );
}
