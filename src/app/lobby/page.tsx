'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, LogIn, Loader2, Users, Clapperboard } from 'lucide-react';
import useUserSession from '@/hooks/use-user-session';
import { database } from '@/lib/firebase';
import { ref, onValue, goOnline } from 'firebase/database';
import { createRoom } from '@/lib/firebase-service';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';

interface RoomData {
  id: string;
  name?: string;
  host: string;
  memberCount: number;
  backgroundUrl?: string;
  avatarUrl?: string;
  isPrivate?: boolean;
}

export default function LobbyPage() {
  const [roomId, setRoomId] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [userHostedRoom, setUserHostedRoom] = useState<RoomData | null>(null);
  const [isLoadingHostedRoom, setIsLoadingHostedRoom] = useState(true);

  const router = useRouter();
  const { isLoaded, user } = useUserSession();

  useEffect(() => {
    if (isLoaded && !user) {
      router.push('/');
    }

    if (isLoaded && user) {
      goOnline(database);
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    const roomsRef = ref(database, 'rooms');

    const unsub = onValue(roomsRef, (snapshot) => {
      const roomsData = snapshot.val();
      let hostedRoom: RoomData | null = null;

      if (roomsData && user) {
        Object.keys(roomsData).forEach((key) => {
          const room = roomsData[key];
          const memberCount = room.members ? Object.keys(room.members).length : 0;

          const roomDetails: RoomData = {
            id: key,
            name: room.name,
            host: room.host,
            memberCount,
            backgroundUrl: room.backgroundUrl,
            avatarUrl: room.avatarUrl,
            isPrivate: room.isPrivate || false,
          };

          if (room.host === user.name) {
            hostedRoom = roomDetails;
          }
        });
      }

      setUserHostedRoom(hostedRoom);
      setIsLoadingHostedRoom(false);
    });

    return () => unsub();
  }, [user]);

  const handleCreateRoom = async () => {
    if (!user || isCreatingRoom || userHostedRoom) return;

    setIsCreatingRoom(true);

    try {
      const newRoom = await createRoom({ hostName: user.name });
      router.push(`/rooms/${newRoom.id}`);
    } catch (error) {
      console.error('Failed to create room:', error);
      console.error('فشل في إنشاء الغرفة.');
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();

    if (roomId.trim()) {
      router.push(`/rooms/${roomId.trim()}`);
    }
  };

  if (!isLoaded || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center py-12 min-h-[calc(100vh-80px)]">
      <div className="w-full max-w-4xl space-y-8 z-10">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-headline font-bold text-foreground drop-shadow-lg">
            ردهة السينما
          </h1>
          <p className="mt-4 text-lg text-muted-foreground drop-shadow-md">
            قم بإنشاء غرفة جديدة أو انضم إلى أصدقائك.
          </p>
        </div>

        <div className="grid gap-8">
          <div className="space-y-8">
            {isLoadingHostedRoom ? (
              <Card className="bg-card/50 backdrop-blur-lg border-accent/20 h-[220px] flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-accent" />
              </Card>
            ) : userHostedRoom ? (
              <Card className="bg-card/50 backdrop-blur-lg border-accent/20 group relative overflow-hidden h-[220px]">
                <Image
                  src={
                    userHostedRoom.backgroundUrl ||
                    userHostedRoom.avatarUrl ||
                    PlaceHolderImages.find((p) => p.id === 'room-bg-1')?.imageUrl ||
                    ''
                  }
                  alt={userHostedRoom.name || ''}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />

                <div className="relative flex flex-col justify-end h-full p-6">
                  <CardHeader className="p-0">
                    <CardTitle className="text-2xl text-white drop-shadow-lg">
                      {userHostedRoom.name}
                    </CardTitle>

                    <CardDescription className="text-gray-300 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span style={{ direction: 'ltr' }}>
                        {userHostedRoom.memberCount > 0 ? userHostedRoom.memberCount : ''}
                      </span>
                      {userHostedRoom.memberCount > 0
                        ? userHostedRoom.memberCount !== 1
                          ? 'أعضاء'
                          : 'عضو'
                        : 'فارغة'}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-0 mt-4">
                    <Button
                      onClick={() => router.push(`/rooms/${userHostedRoom.id}`)}
                      className="h-12 text-lg w-full"
                    >
                      <LogIn className="me-2 h-5 w-5" />
                      العودة إلى غرفتي
                    </Button>
                  </CardContent>
                </div>
              </Card>
            ) : (
              <Card className="bg-card/50 backdrop-blur-lg border-accent/20 h-[220px] flex flex-col justify-center">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PlusCircle className="text-accent" />
                    <span>إنشاء غرفة جديدة</span>
                  </CardTitle>
                  <CardDescription>
                    ابدأ غرفة مشاهدة جديدة وادعُ أصدقائك.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <Button
                    onClick={handleCreateRoom}
                    className="h-12 text-lg w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isCreatingRoom}
                  >
                    {isCreatingRoom ? (
                      <Loader2 className="me-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Clapperboard className="me-2 h-5 w-5" />
                    )}
                    إنشاء غرفة
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card/50 backdrop-blur-lg border-accent/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogIn className="text-accent" />
                  <span>الانضمام إلى غرفة</span>
                </CardTitle>
                <CardDescription>
                  لديك رمز غرفة؟ أدخله أدناه للانضمام فورًا.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleJoinRoom} className="flex flex-col sm:flex-row gap-4">
                  <Input
                    type="text"
                    placeholder="أدخل رمز الغرفة..."
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.replace(/[^0-9]/g, ''))}
                    className="h-12 text-center text-lg bg-input/70 border-accent/30 focus:ring-accent flex-grow"
                    required
                  />

                  <Button type="submit" className="h-12 text-lg">
                    <LogIn className="me-2 h-5 w-5" />
                    دخول
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
