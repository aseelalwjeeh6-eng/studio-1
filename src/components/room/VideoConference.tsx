'use client';

import {
  GridLayout,
  ParticipantTile,
  useParticipants,
  RoomAudioRenderer,
  useLocalParticipant,
} from '@livekit/components-react';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';

export default function VideoConference() {
  const allParticipants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  // تحصين مصفوفة المشاركين لضمان عدم وجود قيم undefined
  const participants = useMemo(() => {
    const list = Array.isArray(allParticipants) ? [...allParticipants] : [];
    if (localParticipant) {
      // التأكد من عدم تكرار المشارك المحلي إذا كان موجوداً بالفعل في القائمة
      const exists = list.some(p => p.identity === localParticipant.identity);
      if (!exists) {
        list.unshift(localParticipant);
      }
    }
    return list;
  }, [allParticipants, localParticipant]);

  // التحقق من الجاهزية قبل الرندر لتجنب أخطاء undefined.length
  if (!participants || participants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-black/20 rounded-lg backdrop-blur-sm">
        <Loader2 className="w-10 h-10 animate-spin text-accent mb-4" />
        <p className="text-muted-foreground font-headline text-lg">جاري تهيئة قاعة الفيديو...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <RoomAudioRenderer />
      <GridLayout participants={participants} className="h-full w-full">
        <ParticipantTile />
      </GridLayout>
    </div>
  );
}
