'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import useUserSession from '@/hooks/use-user-session';
import { Loader2, Eye, EyeOff, User, Lock, Sparkles } from 'lucide-react';
import { loginUser, registerUser, AppUser, claimDailyLogin } from '@/lib/firebase-service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const PasswordInput = ({ value, onChange }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => {
    const [showPassword, setShowPassword] = useState(false);
    return (
        <div className="relative">
            <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="كلمة المرور..."
                value={value}
                onChange={onChange}
                required
                className="h-12 bg-card/50 border-white/10 focus:border-accent/50 text-center text-lg pl-10 transition-all duration-300"
            />
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-accent"
                onClick={() => setShowPassword(prev => !prev)}
            >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </Button>
        </div>
    );
};

const LoginForm = ({ onLoginSuccess }: { onLoginSuccess: (user: AppUser) => void }) => {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name.trim() || !password.trim()) {
            setError("الرجاء إدخال الاسم وكلمة المرور.");
            return;
        }
        setIsLoading(true);
        try {
            const loggedInUser = await loginUser(name.trim(), password);
            const dailyLoginResult = await claimDailyLogin(loggedInUser.name);
            if (dailyLoginResult.success && dailyLoginResult.newBalance) {
                console.log(dailyLoginResult.message);
                loggedInUser.coins = dailyLoginResult.newBalance;
            }
            onLoginSuccess(loggedInUser);
        } catch (error: any) {
            setError(error.message || "فشل تسجيل الدخول.");
            console.error(error.message || "فشل تسجيل الدخول.");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleLogin} className="space-y-5">
            {error && <p className="text-sm text-destructive text-center bg-destructive/10 py-2 rounded-lg">{error}</p>}
            <div className="relative">
                <Input
                    id="login-name"
                    type="text"
                    placeholder="اسم المستخدم..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-12 bg-card/50 border-white/10 focus:border-accent/50 text-center text-lg pl-10 transition-all duration-300"
                />
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            </div>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" className="w-full h-12 text-lg bg-gradient-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent shadow-lg shadow-accent/20 transition-all duration-300" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : 'دخول'}
            </Button>
        </form>
    );
};

const RegisterForm = ({ onRegisterSuccess }: { onRegisterSuccess: (user: AppUser) => void }) => {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [avatarId, setAvatarId] = useState('avatar1');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    const avatarOptions = PlaceHolderImages.filter(p => p.id.startsWith('avatar')).slice(0, 6);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name.trim() || !password.trim()) {
            setError("الاسم وكلمة المرور حقول إلزامية.");
            return;
        }
        setIsLoading(true);
        try {
            const newUser: Omit<AppUser, 'password'> & { password?: string } = {
                name: name.trim(),
                password: password,
                avatarId: avatarId,
                // age, gender, dob removed as requested
            };
            const registeredUser = await registerUser(newUser);
            onRegisterSuccess(registeredUser);
        } catch (error: any) {
            setError(error.message || "فشل إنشاء الحساب.");
            console.error(error.message || "فشل إنشاء الحساب.");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleRegister} className="space-y-5">
            {error && <p className="text-sm text-destructive text-center bg-destructive/10 py-2 rounded-lg">{error}</p>}
            <div className="relative">
                <Input
                    id="reg-name"
                    type="text"
                    placeholder="الاسم (إلزامي)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-12 bg-card/50 border-white/10 focus:border-accent/50 text-center text-lg pl-10 transition-all duration-300"
                />
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            </div>
            <div className="relative">
                <Input
                    id="reg-password"
                    type="password"
                    placeholder="كلمة المرور (إلزامي)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 bg-card/50 border-white/10 focus:border-accent/50 text-center text-lg pl-10 transition-all duration-300"
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            </div>

            {/* اختيار الصورة الرمزية بتصميم فخم */}
            <div className="pt-2">
                <p className="text-center text-muted-foreground mb-3 flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span>اختر صورك الرمزية</span>
                    <Sparkles className="w-4 h-4 text-accent" />
                </p>
                <div className="grid grid-cols-3 gap-4 justify-items-center">
                    {avatarOptions.map(avatar => (
                        <div
                            key={avatar.id}
                            className={cn(
                                "relative rounded-full p-1 cursor-pointer transition-all duration-300 transform hover:scale-105",
                                avatarId === avatar.id ? "bg-gradient-to-r from-accent to-pink-500 shadow-lg shadow-accent/40" : "bg-white/10 hover:bg-white/20"
                            )}
                            onClick={() => setAvatarId(avatar.id)}
                        >
                            <Image src={avatar.imageUrl} alt={avatar.description} width={80} height={80} className="rounded-full aspect-square object-cover border-2 border-background" />
                        </div>
                    ))}
                </div>
            </div>

            <Button type="submit" className="w-full h-12 text-lg bg-gradient-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent shadow-lg shadow-accent/20 transition-all duration-300" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : 'إنشاء حساب'}
            </Button>
        </form>
    );
}

export default function LoginPage() {
    const { user, setUser, isLoaded } = useUserSession();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && user?.name) {
            router.push('/lobby');
        }
    }, [isLoaded, user, router]);

    const handleAuthSuccess = (authenticatedUser: AppUser) => {
        setUser({
            name: authenticatedUser.name,
            avatarId: authenticatedUser.avatarId,
            coins: authenticatedUser.coins,
        });
        router.push('/lobby');
    };

    if (!isLoaded || user?.name) {
        return (
            <div className="flex h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/5">
                <Loader2 className="h-16 w-16 animate-spin text-accent" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-background via-background to-accent/10 p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent/20 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl"></div>
            </div>
            <Card className="w-full max-w-md bg-card/40 backdrop-blur-xl border-white/20 shadow-2xl shadow-black/30 transition-all duration-500">
                <CardHeader className="text-center space-y-3">
                    <div className="mx-auto mb-2 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-tr from-accent/20 to-pink-500/20 p-1 shadow-xl">
                        <Image src="https://i.ibb.co/7J9rmdS0/1759934438802.jpg" alt="اصيل سينما Logo" width={90} height={90} className="rounded-full" />
                    </div>
                    <CardTitle className="font-headline text-5xl text-foreground tracking-tight bg-gradient-to-l from-white to-gray-300 bg-clip-text text-transparent">اصيل سينما</CardTitle>
                    <CardDescription className="text-muted-foreground text-lg px-2 leading-relaxed">
                        شاهد مع أصدقائك، وتحدث مباشرة، في تجربة سينمائية فريدة.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="login" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-white/5 p-1 rounded-xl">
                            <TabsTrigger value="login" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-lg transition-all">تسجيل الدخول</TabsTrigger>
                            <TabsTrigger value="register" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground rounded-lg transition-all">إنشاء حساب</TabsTrigger>
                        </TabsList>
                        <TabsContent value="login" className="pt-5">
                            <LoginForm onLoginSuccess={handleAuthSuccess} />
                        </TabsContent>
                        <TabsContent value="register" className="pt-5">
                            <RegisterForm onRegisterSuccess={handleAuthSuccess} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
