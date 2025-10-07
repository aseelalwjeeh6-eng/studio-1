'use client';

import { useState } from 'react';
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

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

  const handleItemClick = (item: PlaylistItem) => {
    if (canControl) {
      setSelectedItemId(selectedItemId === item.id ? null : item.id);
    }
  };

  return (
    <ScrollArea className="h-96">
        {items.length > 0 ? (
        <div className="space-y-2 p-1">
            {items.map((item) => {
            const isPlaying = item.videoId === currentVideoId;
            const isSelected = item.id === selectedItemId;

            return (
              <div key={item.id}
                className={cn(
                  "p-2 rounded-lg transition-colors cursor-pointer",
                  isSelected ? "bg-primary/20" : (isPlaying ? "bg-accent/30" : "bg-secondary/50")
                )}
                onClick={() => handleItemClick(item)}
              >
                <div className="flex items-center gap-3">
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
                </div>

                {isSelected && canControl && (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" className="w-full" onClick={() => onPlay(item.videoId)}>
                      <Play className="me-2" />
                      تشغيل
                    </Button>
                    <Button variant="destructive" size="sm" className="w-full" onClick={() => onRemove(item.id)}>
                      <Trash2 className="me-2" />
                      حذف
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
