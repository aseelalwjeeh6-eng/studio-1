'use client';

import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ListMusic, Play, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlaylistItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
}

interface PlaylistProps {
  items: PlaylistItem[];
  canControl: boolean;
  onPlay: (videoId: string) => void;
  onRemove: (itemId: string) => void;
  currentVideoUrl: string;
}

const Playlist = ({ items, canControl, onPlay, onRemove, currentVideoUrl }: PlaylistProps) => {

  const getYoutubeVideoId = (url: string) => {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname === 'youtu.be') {
            return urlObj.searchParams.get('v') || urlObj.pathname.slice(1);
        }
    } catch (e) {
        // Not a full URL, might just be an ID
        if (url.match(/^[a-zA-Z0-9_-]{11}$/)) {
            return url;
        }
    }
    return url;
  }

  const currentVideoId = getYoutubeVideoId(currentVideoUrl);

  return (
    <ScrollArea className="h-96">
        {items.length > 0 ? (
        <div className="space-y-2 p-1">
            {items.map((item) => {
            const isPlaying = item.videoId === currentVideoId;
            return (
                <div
                key={item.id}
                className={cn(
                    "flex items-center gap-3 p-2 rounded-lg transition-colors",
                    isPlaying ? "bg-accent/30" : "bg-secondary/50"
                )}
                >
                <Image
                    src={item.thumbnail}
                    alt={item.title}
                    width={80}
                    height={45}
                    className="rounded-md aspect-video object-cover"
                />
                <div className="flex-grow overflow-hidden">
                    <p className="text-sm font-semibold truncate text-foreground">{item.title}</p>
                </div>
                {canControl && (
                    <div className="flex items-center gap-1">
                    {!isPlaying && (
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => onPlay(item.videoId)}>
                            <Play className="w-4 h-4" />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => onRemove(item.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                    </div>
                )}
                </div>
            );
            })}
        </div>
        ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground text-center p-4">
            <p>قائمة التشغيل فارغة. <br/> ابحث عن فيديو وأضفه إلى الطابور!</p>
        </div>
        )}
    </ScrollArea>
  );
};

export default Playlist;
