'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HeartIcon } from '@/components/icons/HeartIcon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import useUserSession from '@/hooks/use-user-session';
import { Loader2 } from 'lucide-react';
import { upsertUser, AppUser } from '@/lib/firebase-service';


export default function LoginPage() {
  const { user, setUser, isLoaded } = useUserSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && user?.name) {
      router.push('/lobby');
    }
  }, [isLoaded, user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
        console.error("الرجاء إدخال الاسم.");
        return;
    }
    setIsLoading(true);
    try {
        const loggedInUser = await upsertUser({ name: name.trim() });
        setUser(loggedInUser);
        router.push('/lobby');
    } catch (error: any) {
        console.error(error.message || "فشل تسجيل الدخول.");
        setIsLoading(false);
    }
  };


  if (!isLoaded || user?.name) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm bg-card/50 backdrop-blur-lg border-accent/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <HeartIcon className="h-20 w-20 text-accent" />
          </div>
          <CardTitle className="font-headline text-4xl text-foreground">اصيل سينما</CardTitle>
          <CardDescription className="text-muted-foreground text-lg">
            مكان للعشاق
          </CardDescription>
        </CardHeader>
        <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
                 <Input
                    id="login-name"
                    type="text"
                    placeholder="ادخل اسمك..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-12 bg-input/70 border-accent/30 focus:ring-accent text-center text-lg"
                />
                <Button type="submit" className="w-full h-12 text-lg bg-accent text-accent-foreground hover:bg-accent/90" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : 'دخول'}
                </Button>
            </form>
        </CardContent>
      </Card>
    </div>
  );
}
