'use client';

import {
  GridLayout,
  ParticipantTile,
  useTracks,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Loader2, Video } from 'lucide-react';

export default function VideoConference() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlyPinned: false },
  );

  if (!tracks) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-black/20 rounded-lg backdrop-blur-sm p-8 text-center">
        <div className="relative mb-4">
            <Video className="w-12 h-12 text-accent/20" />
            <Loader2 className="w-12 h-12 animate-spin text-accent absolute top-0 left-0" />
        </div>
        <p className="text-muted-foreground font-headline text-lg">جاري الاتصال بقاعة الفيديو...</p>
        <p className="text-xs text-muted-foreground/60 mt-2">تأكد من السماح بصلاحيات الكاميرا والميكروفون</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[400px] bg-black/40 rounded-lg overflow-hidden border border-white/5">
      <RoomAudioRenderer />
      <GridLayout tracks={tracks} className="h-full w-full p-2 gap-2">
        <ParticipantTile />
      </GridLayout>
    </div>
  );
}