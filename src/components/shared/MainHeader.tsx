'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import useUserSession from '@/hooks/use-user-session';
import { Bell, Users, Mail, UserPlus, UserCheck, UserX, LogIn, Coins } from 'lucide-react';
import { database } from '@/lib/firebase';
import { ref, onValue, off, remove, update } from 'firebase/database';
import { FriendRequest, RoomInvitation, acceptFriendRequest, rejectFriendRequest } from '@/lib/firebase-service';
import { Badge } from '../ui/badge';
import Image from 'next/image';
import { PwaInstallBanner } from './PwaInstallBanner';


// Inlined SVG components to avoid lucide-react HMR issues
const Moon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const Sun = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const Heart = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5 2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

const Power = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 2v10" />
    <path d="M18.4 6.6a9 9 0 1 1-12.79 0" />
  </svg>
);


export function MainHeader() {
  const { theme, setTheme } = useTheme();
  const { user, setUser } = useUserSession();
  const pathname = usePathname();
  const router = useRouter();

  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [invitations, setInvitations] = useState<RoomInvitation[]>([]);
  
  const unreadCount = friendRequests.filter(r => !r.read).length + invitations.filter(i => !i.read).length;

  useEffect(() => {
    if (!user) return;

    const requestsRef = ref(database, `users/${user.name}/friendRequests`);
    const invitesRef = ref(database, `users/${user.name}/invitations`);
    const coinsRef = ref(database, `users/${user.name}/coins`);

    const requestsUnsub = onValue(requestsRef, (snapshot) => {
      setFriendRequests(snapshot.exists() ? Object.values(snapshot.val()) : []);
    });
    
    const invitesUnsub = onValue(invitesRef, (snapshot) => {
      setInvitations(snapshot.exists() ? Object.values(snapshot.val()) : []);
    });
    
    const coinsUnsub = onValue(coinsRef, (snapshot) => {
        const newCoins = snapshot.val();
        if (newCoins !== null) {
            setUser(prev => prev ? { ...prev, coins: newCoins } : null);
        }
    });

    return () => {
      requestsUnsub();
      invitesUnsub();
      coinsUnsub();
    };
  }, [user?.name, setUser]);
  
  const handleLogout = () => {
    setUser(null);
    router.push('/');
  };

  const handleAcceptRequest = async (senderName: string, reqId: string) => {
    if (!user) return;
    try {
        await acceptFriendRequest(senderName, user.name);
        console.log(`أصبحت الآن صديقًا لـ ${senderName}.`);
        // The listener will update the state automatically
    } catch(error: any) {
        console.error(error.message);
    }
  }

  const handleRejectRequest = async (senderName: string, reqId: string) => {
    if (!user) return;
    try {
        await rejectFriendRequest(senderName, user.name);
        console.log(`تم رفض طلب الصداقة من ${senderName}.`);
        // The listener will update the state automatically
    } catch(error: any) {
        console.error(error.message);
    }
  }

  const handleJoinRoom = (roomId: string, invId: string) => {
    if (!user) return;
    const inviteRef = ref(database, `users/${user.name}/invitations/${btoa(invId)}`);
    remove(inviteRef);
    router.push(`/rooms/${roomId}`);
  }

  const handleMarkAsRead = () => {
    if (!user || unreadCount === 0) return;

    const updates: { [key: string]: any } = {};
    friendRequests.forEach(req => {
        if(!req.read) updates[`/users/${user.name}/friendRequests/${btoa(req.id)}/read`] = true;
    });
    invitations.forEach(inv => {
        if(!inv.read) updates[`/users/${user.name}/invitations/${btoa(inv.id)}/read`] = true;
    });
    
    update(ref(database), updates);
  }

  const navLinks = [
    { href: '/lobby', label: 'الغرف' },
    { href: '/friends', label: 'الأصدقاء' },
    { href: '/profile', label: 'الملف الشخصي' },
  ];
  
  return (
    <header className="bg-card/50 backdrop-blur-lg border-b border-accent/20 sticky top-0 z-40">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        <Link
          href="/lobby"
          className="flex items-center gap-2"
          aria-label="Home"
        >
           <Image src="https://i.ibb.co/7J9rmdS0/1759934438802.jpg" alt="اصيل سينما Logo" width={40} height={40} className="rounded-full" />
          <span className="hidden sm:inline-block font-headline text-2xl font-bold text-foreground">
            اصيل سينما
          </span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4 rounded-full bg-background/50 p-1 border border-transparent">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-full px-4 py-2 text-sm sm:text-base font-medium transition-colors',
                pathname === link.href
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-card/80 backdrop-blur-lg"
            >
              <DropdownMenuItem onClick={() => setTheme('light')}>
                <Sun className="h-4 w-4 me-2" /> فاتح
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                <Moon className="h-4 w-4 me-2" /> داكن
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('romantic')}>
                <Heart className="h-4 w-4 me-2" /> رومانسي
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

           {user && (
            <DropdownMenu onOpenChange={(open) => open && handleMarkAsRead()}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card/80 backdrop-blur-lg w-80">
                <DropdownMenuLabel>الإشعارات</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {friendRequests.length === 0 && invitations.length === 0 ? (
                  <DropdownMenuItem disabled>لا توجد إشعارات جديدة</DropdownMenuItem>
                ) : (
                  <>
                    {invitations.map(inv => (
                      <React.Fragment key={inv.id}>
                        <DropdownMenuItem className="flex flex-col items-start gap-1">
                          <div className="flex items-center text-sm">
                            <Mail className="me-2 text-accent" />
                            <span><span className='font-bold'>{inv.senderName}</span> دعاك إلى <span className='font-bold'>{inv.roomName}</span></span>
                          </div>
                          <Button size="sm" className="w-full h-8" onClick={() => handleJoinRoom(inv.roomId, inv.id)}>
                            <LogIn className="me-2" />
                            انضمام
                          </Button>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </React.Fragment>
                    ))}
                    {friendRequests.map(req => (
                      <React.Fragment key={req.id}>
                        <DropdownMenuItem className="flex flex-col items-start gap-1">
                           <div className="flex items-center text-sm mb-2">
                             <UserPlus className="me-2 text-accent" />
                             <span>طلب صداقة من <span className='font-bold'>{req.senderName}</span></span>
                           </div>
                           <div className="flex w-full gap-2">
                            <Button size="sm" className="w-full h-8" onClick={() => handleAcceptRequest(req.senderName, req.id)}>
                                <UserCheck className="me-2"/> قبول
                            </Button>
                             <Button size="sm" variant="destructive" className="w-full h-8" onClick={() => handleRejectRequest(req.senderName, req.id)}>
                                <UserX className="me-2"/> رفض
                            </Button>
                           </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </React.Fragment>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
           )}
          
          <div className="flex items-center gap-3">
              {user && (
                <div className="hidden sm:flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-background/50 rounded-full px-3 py-1 border border-accent/20">
                        <Coins className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-sm text-foreground">
                            {user.coins?.toLocaleString() || 0}
                        </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      مرحباً،{' '}
                      <span className="font-bold text-foreground">{user.name}</span>
                    </div>
                </div>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="rounded-full"
                aria-label="تسجيل الخروج"
              >
                <Power className="h-5 w-5" />
              </Button>
          </div>
        </div>
      </div>
      <PwaInstallBanner />
    </header>
  );
}