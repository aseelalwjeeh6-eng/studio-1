'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import useUserSession from '@/hooks/use-user-session';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { loginUser, registerUser, AppUser, claimDailyLogin } from '@/lib/firebase-service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';
import { HeartIcon } from '@/components/icons/HeartIcon';


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
                className="h-12 bg-input/70 border-accent/30 focus:ring-accent text-center text-lg"
            />
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
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
        <form onSubmit={handleLogin} className="space-y-4">
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Input
                id="login-name"
                type="text"
                placeholder="ادخل اسمك..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-12 bg-input/70 border-accent/30 focus:ring-accent text-center text-lg"
            />
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" className="w-full h-12 text-lg bg-accent text-accent-foreground hover:bg-accent/90" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : 'دخول'}
            </Button>
        </form>
    );
};

const RegisterForm = ({ onRegisterSuccess }: { onRegisterSuccess: (user: AppUser) => void }) => {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [age, setAge] = useState<number | undefined>(undefined);
    const [gender, setGender] = useState<'male' | 'female' | undefined>(undefined);
    const [dob, setDob] = useState<Date | undefined>(undefined);
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
                age: age,
                gender: gender,
                dob: dob ? format(dob, 'yyyy-MM-dd') : undefined,
                avatarId: avatarId,
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
        <form onSubmit={handleRegister} className="space-y-4">
             {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Input id="reg-name" type="text" placeholder="الاسم (إلزامي)" value={name} onChange={(e) => setName(e.target.value)} required className="h-11"/>
            <Input id="reg-password" type="password" placeholder="كلمة المرور (إلزامي)" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11"/>
            
            <div className="grid grid-cols-2 gap-4">
                 <Input id="age" type="number" placeholder="العمر" value={age || ''} onChange={(e) => setAge(parseInt(e.target.value))} className="h-11" />
                 <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "h-11 justify-start text-left font-normal",
                          !dob && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="me-2 h-4 w-4" />
                        {dob ? format(dob, "PPP") : <span>تاريخ الميلاد</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dob}
                        onSelect={setDob}
                        initialFocus
                      />
                    </PopoverContent>
                </Popover>
            </div>

            <RadioGroup onValueChange={(value) => setGender(value as 'male' | 'female')} className="flex justify-center gap-4">
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="male" id="male" />
                    <Label htmlFor="male">ذكر</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="female" id="female" />
                    <Label htmlFor="female">أنثى</Label>
                </div>
            </RadioGroup>

            <div>
                <Label className="mb-2 block text-center text-muted-foreground">اختر صورة رمزية</Label>
                <div className="grid grid-cols-3 gap-4">
                    {avatarOptions.map(avatar => (
                        <div key={avatar.id} className={cn("rounded-full p-1 cursor-pointer", avatarId === avatar.id ? "bg-accent" : "")} onClick={() => setAvatarId(avatar.id)}>
                             <Image src={avatar.imageUrl} alt={avatar.description} width={80} height={80} className="rounded-full aspect-square object-cover" />
                        </div>
                    ))}
                </div>
            </div>

            <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading}>
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
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm bg-card/50 backdrop-blur-lg border-accent/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center">
            <Image src="https://i.ibb.co/7J9rmdS0/1759934438802.jpg" alt="اصيل سينما Logo" width={80} height={80} className="rounded-full" />
          </div>
          <CardTitle className="font-headline text-4xl text-foreground">اصيل سينما</CardTitle>
          <CardDescription className="text-muted-foreground text-lg px-2">
            شاهد مع أصدقائك، وتحدث مباشرة، في تجربة سينمائية فريدة.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">تسجيل الدخول</TabsTrigger>
                    <TabsTrigger value="register">إنشاء حساب</TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="pt-4">
                    <LoginForm onLoginSuccess={handleAuthSuccess} />
                </TabsContent>
                <TabsContent value="register" className="pt-4">
                    <RegisterForm onRegisterSuccess={handleAuthSuccess} />
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
