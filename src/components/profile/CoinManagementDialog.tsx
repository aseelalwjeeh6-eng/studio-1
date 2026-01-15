'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, AppUser, Transaction, transferCoins, purchaseCoins } from '@/lib/firebase-service';
import useUserSession from '@/hooks/use-user-session';
import { CoinPackages } from '@/lib/gifts';
import { Coins, History, Send, ShoppingCart, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

const BuyCoinsTab = ({ onPurchase }: { onPurchase: (packageId: string, coins: number) => Promise<void> }) => {
    const [isPurchasing, setIsPurchasing] = useState<string | null>(null);

    const handlePurchase = async (pkg: typeof CoinPackages[0]) => {
        setIsPurchasing(pkg.id);
        try {
            await onPurchase(pkg.id, pkg.coins);
        } catch (e: any) {
            console.error(e.message);
        } finally {
            setIsPurchasing(null);
        }
    };
    
    return (
        <div className="grid grid-cols-2 gap-4">
            {CoinPackages.map(pkg => (
                <div key={pkg.id} className="p-4 border rounded-lg text-center flex flex-col items-center bg-secondary/30 relative">
                    {pkg.saving && <div className="absolute -top-3 bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full text-xs">توفير {pkg.saving}</div>}
                    <Coins className="w-8 h-8 text-amber-400 mb-2" />
                    <p className="font-bold text-lg">{pkg.description}</p>
                    <p className="text-muted-foreground text-sm">${pkg.price}</p>
                    <Button onClick={() => handlePurchase(pkg)} disabled={!!isPurchasing} className="mt-4 w-full">
                        {isPurchasing === pkg.id ? <Loader2 className="animate-spin" /> : 'شراء (محاكاة)'}
                    </Button>
                </div>
            ))}
        </div>
    );
};

const TransferCoinsTab = ({ user, onTransfer }: { user: User, onTransfer: (recipient: string, amount: number) => Promise<void> }) => {
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isTransferring, setIsTransferring] = useState(false);

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!recipient || !amount || amount <= 0) {
            setError('الرجاء إدخال اسم صديق ومبلغ صحيح.');
            return;
        }
        setError('');
        setSuccess('');
        setIsTransferring(true);
        try {
            await onTransfer(recipient, amount);
            setSuccess(`تم تحويل ${amount} كوينز بنجاح إلى ${recipient}.`);
            setRecipient('');
            setAmount('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsTransferring(false);
        }
    };

    return (
        <form onSubmit={handleTransfer} className="space-y-4 text-center">
            <h3 className="text-lg font-semibold">تحويل الكوينزات إلى صديق</h3>
            <p className="text-sm text-muted-foreground">ملاحظة: يتم تطبيق رسوم تحويل بنسبة 10%.</p>
            <Input 
                placeholder="اسم الصديق" 
                value={recipient} 
                onChange={(e) => setRecipient(e.target.value)}
                className="text-center"
            />
            <Input 
                type="number"
                placeholder="المبلغ" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value ? parseInt(e.target.value) : '')}
                className="text-center"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-500">{success}</p>}
            <Button type="submit" className="w-full" disabled={isTransferring}>
                 {isTransferring ? <Loader2 className="animate-spin" /> : <Send className="me-2" />}
                تحويل
            </Button>
        </form>
    );
};

const HistoryTab = ({ transactions }: { transactions: Transaction[] }) => {
    if (transactions.length === 0) {
        return <p className="text-center text-muted-foreground py-8">لا يوجد معاملات لعرضها.</p>;
    }
    return (
        <ScrollArea className="h-80">
            <div className="space-y-3">
                {transactions.sort((a,b) => b.timestamp - a.timestamp).map(tx => (
                    <div key={tx.id} className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg">
                        <div>
                            <p className="font-semibold">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true, locale: ar })}
                            </p>
                        </div>
                        <p className={cn(
                            "font-bold text-lg",
                            tx.amount > 0 ? "text-green-500" : "text-red-500"
                        )}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                        </p>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );
}

export default function CoinManagementDialog({ isOpen, onOpenChange, user: initialUser }: { isOpen: boolean; onOpenChange: (open: boolean) => void; user: User }) {
    const { user, setUser } = useUserSession();
    const [fullUser, setFullUser] = useState<AppUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const handleTransfer = async (recipient: string, amount: number) => {
        if (!user) return;
        const newBalance = await transferCoins(user.name, recipient, amount);
        setUser(prev => prev ? { ...prev, coins: newBalance } : null);
    };

    const handlePurchase = async (packageId: string, coinsToAdd: number) => {
        if (!user) return;
        const newBalance = await purchaseCoins(user.name, packageId, coinsToAdd);
        setUser(prev => prev ? { ...prev, coins: newBalance } : null);
    };

    if (!user) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl">
                        <Coins className="text-amber-400" />
                        إدارة الكوينزات
                    </DialogTitle>
                    <DialogDescription>
                        رصيدك الحالي: <span className="font-bold text-accent">{user.coins?.toLocaleString() || 0}</span> كوينز
                    </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="buy" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="buy"><ShoppingCart className="me-2" /> شراء</TabsTrigger>
                        <TabsTrigger value="transfer"><Send className="me-2" /> تحويل</TabsTrigger>
                        <TabsTrigger value="history"><History className="me-2" /> السجل</TabsTrigger>
                    </TabsList>
                    <TabsContent value="buy" className="pt-4">
                        <BuyCoinsTab onPurchase={handlePurchase} />
                    </TabsContent>
                    <TabsContent value="transfer" className="pt-4">
                        <TransferCoinsTab user={user} onTransfer={handleTransfer} />
                    </TabsContent>
                    <TabsContent value="history" className="pt-4">
                        <HistoryTab transactions={fullUser?.transactions ? Object.values(fullUser.transactions) : []} />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
