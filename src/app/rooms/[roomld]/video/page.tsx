
'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function GhostRoomPage() {
  const router = useRouter();
  const params = useParams();
  
  useEffect(() => {
    // Redirect to the correctly spelled route if this ghost path is accessed
    const roomId = params.roomld;
    if (roomId) {
      router.replace(`/rooms/${roomId}`);
    } else {
      router.replace('/lobby');
    }
  }, [params, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center animate-pulse">
        <p className="text-muted-foreground">جاري التصحيح والتحويل...</p>
      </div>
    </div>
  );
}
