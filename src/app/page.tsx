
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { HeartIcon } from '@/components/icons/HeartIcon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import useUserSession from '@/hooks/use-user-session';
import { Loader2, CheckCircle, Calendar as CalendarIcon, User, KeyRound } from 'lucide-react';
import { registerUser, loginUser } from '@/lib/firebase-service';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AppUser } from '@/lib/firebase-service';
import toast from 'react-hot-toast';


const LoginForm = () => {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { setUser } = useUserSession();
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !password.trim()) {
            toast.error("الرجاء إدخال الاسم وكلمة المرور.");
            return;
        }
        setIsLoading(true);
        try {
            const loggedInUser = await loginUser(name.trim(), password);
            setUser(loggedInUser);
            router.push('/lobby');
        } catch (error: any) {
            toast.error(error.message || "فشل تسجيل الدخول. يرجى التحقق من بياناتك.");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
                <Input
                    id="login-name"
                    type="text"
                    placeholder="الاسم"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-12 bg-input/70 border-accent/30 focus:ring-accent"
                />
            </div>
            <div className="space-y-2">
                <Input
                    id="login-password"
                    type="password"
                    placeholder="كلمة المرور"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 bg-input/70 border-accent/30 focus:ring-accent"
                />
            </div>
            <Button type="submit" className="w-full h-12 text-lg bg-accent text-accent-foreground hover:bg-accent/90" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : 'دخول'}
            </Button>
        </form>
    );
};

const RegisterForm = () => {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [age, setAge] = useState<number | undefined>();
    const [gender, setGender] = useState<'male' | 'female' | undefined>();
    const [dob, setDob] = useState<Date | undefined>();
    const [selectedAvatarId, setSelectedAvatarId] = useState<string>('avatar1');
    const [isLoading, setIsLoading] = useState(false);
    const { setUser } = useUserSession();
    const router = useRouter();

    const avatarPlaceholders = PlaceHolderImages.filter(p => p.id.startsWith('avatar')).slice(0, 6);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error("كلمتا المرور غير متطابقتين.");
            return;
        }
        if (!name.trim() || !password.trim()) {
            toast.error("الاسم وكلمة المرور حقول إلزامية.");
            return;
        }

        setIsLoading(true);

        const newUser: AppUser = {
            name: name.trim(),
            password,
            age,
            gender,
            dob: dob ? format(dob, 'yyyy-MM-dd') : undefined,
            avatarId: selectedAvatarId,
        };

        try {
            const registeredUser = await registerUser(newUser);
            setUser(registeredUser);
            router.push('/lobby');
        } catch (error: any) {
            toast.error(error.message || "فشل إنشاء الحساب.");
            setIsLoading(false);
        }
    };

    return (
         <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
                <Input id="register-name" type="text" placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} required className="h-11 bg-input/70" />
            </div>
             <div className="flex gap-2">
                <Input id="register-password" type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11 bg-input/70" />
                <Input id="confirm-password" type="password" placeholder="تأكيد كلمة المرور" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="h-11 bg-input/70" />
             </div>
             <div className="flex gap-2">
                 <Input id="age" type="number" placeholder="العمر" value={age || ''} onChange={(e) => setAge(parseInt(e.target.value, 10))} className="h-11 bg-input/70" />
                 <Select onValueChange={(value: 'male' | 'female') => setGender(value)}>
                    <SelectTrigger className="h-11 bg-input/70">
                        <SelectValue placeholder="الجنس" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="male">ذكر</SelectItem>
                        <SelectItem value="female">أنثى</SelectItem>
                    </SelectContent>
                </Select>
             </div>
             <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal h-11 bg-input/70", !dob && "text-muted-foreground")}
                    >
                        <CalendarIcon className="me-2 h-4 w-4" />
                        {dob ? format(dob, "PPP") : <span>تاريخ الميلاد</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dob} onSelect={setDob} initialFocus />
                </PopoverContent>
            </Popover>

             <div className="space-y-2 text-center">
                <p className="text-sm text-muted-foreground">اختر صورتك الرمزية</p>
                <div className="flex justify-center gap-2 sm:gap-3">
                    {avatarPlaceholders.map((avatar) => {
                        const isSelected = selectedAvatarId === avatar.id;
                        return (
                             <div key={avatar.id} className="relative cursor-pointer group" onClick={() => setSelectedAvatarId(avatar.id)}>
                                <Image
                                    src={avatar.imageUrl}
                                    alt={avatar.description}
                                    width={56}
                                    height={56}
                                    className={cn("rounded-full aspect-square object-cover border-4 transition-all duration-200", isSelected ? "border-accent ring-2 ring-accent/50" : "border-transparent group-hover:border-accent/50 scale-95 group-hover:scale-100")}
                                    data-ai-hint={avatar.imageHint}
                                />
                                {isSelected && (
                                    <div className="absolute -top-1 -right-1 bg-accent rounded-full p-0.5 text-accent-foreground">
                                        <CheckCircle className="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : 'إنشاء حساب'}
            </Button>
         </form>
    );
};


export default function LoginPage() {
  const { user, isLoaded } = useUserSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && user?.name) {
      router.push('/lobby');
    }
  }, [isLoaded, user, router]);

  if (!isLoaded || user?.name) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md bg-card/50 backdrop-blur-lg border-accent/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <HeartIcon className="h-20 w-20 text-accent" />
          </div>
          <CardTitle className="font-headline text-4xl text-foreground">اصيل سينما</CardTitle>
          <CardDescription className="text-muted-foreground text-lg">
            مكان خاص للعشاق
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">
                        <KeyRound className="me-2"/>
                        تسجيل الدخول
                    </TabsTrigger>
                    <TabsTrigger value="register">
                        <User className="me-2"/>
                        إنشاء حساب
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="pt-4">
                    <LoginForm />
                </TabsContent>
                <TabsContent value="register" className="pt-4">
                    <RegisterForm />
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
