'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import YouTube, { YouTubePlayer } from 'react-youtube';
import { Button } from '@/components/ui/button';
import {
  Play,
  Search,
  Film,
  Pause,
  Volume2,
  Settings,
  FastForward,
  Rewind,
} from 'lucide-react';
import { PlayerState } from './RoomClient';
import { Slider } from '../ui/slider';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { YouTubeVideo } from '@/ai/flows/youtube-search-flow';
import { getCachedState, setCachedState } from '@/lib/cache-utils';

interface PlayerProps {
  videoUrl: string;
  onSetVideo: (url: string, startTime?: number) => void;
  canControl: boolean;
  onSearchClick: () => void;
  playerState: PlayerState | null;
  onPlayerStateChange: (newState: Partial<PlayerState>) => void;
  onVideoEnded: () => void;
  videoDetails: YouTubeVideo | null;
  serverTimeOffset: number;
}

const SYNC_THRESHOLD = 3; // Seconds
const LOCAL_ACTION_COOLDOWN = 3000; // MS

const Player = ({
  videoUrl,
  onSetVideo,
  canControl,
  onSearchClick,
  playerState,
  onPlayerStateChange,
  onVideoEnded,
  videoDetails,
  serverTimeOffset,
}: PlayerProps) => {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [volume, setVolume] = useState(() => getCachedState('global', 'volume', 0.8));
  const [quality, setQuality] = useState(() => getCachedState('global', 'quality', 'auto'));
  const [feedback, setFeedback] = useState<{ type: string; visible: boolean }>({ type: '', visible: false });

  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const isReadyRef = useRef(false);
  const ignoreSyncUntilRef = useRef(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper: Get Synchronized Server Time
  const getServerTime = useCallback(() => Date.now() + serverTimeOffset, [serverTimeOffset]);

  // Helper: Calculate where the video SHOULD be right now
  const getExpectedTime = useCallback(() => {
    if (!playerState) return 0;
    const now = getServerTime();
    const elapsedSinceUpdate = (now - (playerState.timestamp || now)) / 1000;
    return playerState.isPlaying ? Math.max(0, playerState.seekTime + elapsedSinceUpdate) : playerState.seekTime;
  }, [playerState, getServerTime]);

  const triggerFeedback = (type: string) => {
    setFeedback({ type, visible: true });
    setTimeout(() => setFeedback(prev => ({ ...prev, visible: false })), 800);
  };

  const togglePlay = useCallback(async () => {
    if (!canControl || !ytPlayerRef.current || !isReadyRef.current) return;
    try {
      const isCurrentlyPlaying = ytPlayerRef.current.getPlayerState() === 1;
      const nextState = !isCurrentlyPlaying;
      const currentTime = ytPlayerRef.current.getCurrentTime();

      ignoreSyncUntilRef.current = Date.now() + LOCAL_ACTION_COOLDOWN;
      
      if (nextState) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();

      onPlayerStateChange({
        isPlaying: nextState,
        seekTime: currentTime,
        timestamp: getServerTime()
      });
      triggerFeedback(nextState ? 'play' : 'pause');
    } catch (e) { console.error("TogglePlay Error:", e); }
  }, [canControl, onPlayerStateChange, getServerTime]);

  const seekBy = useCallback((amount: number) => {
    if (!canControl || !ytPlayerRef.current || !isReadyRef.current) return;
    try {
      const currentTime = ytPlayerRef.current.getCurrentTime();
      const nextTime = Math.max(0, Math.min(duration, currentTime + amount));
      
      ignoreSyncUntilRef.current = Date.now() + LOCAL_ACTION_COOLDOWN;
      ytPlayerRef.current.seekTo(nextTime, true);
      
      onPlayerStateChange({
        seekTime: nextTime,
        timestamp: getServerTime()
      });
      triggerFeedback(amount > 0 ? 'forward' : 'backward');
    } catch (e) { console.error("Seek Error:", e); }
  }, [canControl, duration, onPlayerStateChange, getServerTime]);

  // Sync Effect
  useEffect(() => {
    if (!ytPlayerRef.current || !isReadyRef.current || !playerState) return;

    const syncInterval = setInterval(() => {
      if (Date.now() < ignoreSyncUntilRef.current) return;

      try {
        const expected = getExpectedTime();
        const actual = ytPlayerRef.current?.getCurrentTime() || 0;
        const drift = Math.abs(expected - actual);
        const playerStatus = ytPlayerRef.current?.getPlayerState();

        // 1. Sync Playback State
        if (playerState.isPlaying && playerStatus !== 1 && playerStatus !== 3) {
          ytPlayerRef.current.playVideo();
        } else if (!playerState.isPlaying && playerStatus === 1) {
          ytPlayerRef.current.pauseVideo();
        }

        // 2. Sync Timestamp (Hard jump if drift > threshold)
        if (drift > SYNC_THRESHOLD) {
          ytPlayerRef.current.seekTo(expected, true);
        } 
        // 3. Smooth Sync (Speed up/down slightly if drift is minor)
        else if (drift > 0.5 && playerState.isPlaying) {
          const rate = expected > actual ? 1.05 : 0.95;
          ytPlayerRef.current.setPlaybackRate(rate);
        } else {
          ytPlayerRef.current.setPlaybackRate(1);
        }

        setProgress(actual);
      } catch (e) { /* Ignore widget errors */ }
    }, 1000);

    return () => clearInterval(syncInterval);
  }, [playerState, getExpectedTime]);

  const onReady = (event: any) => {
    ytPlayerRef.current = event.target;
    isReadyRef.current = true;
    setDuration(event.target.getDuration());
    event.target.setVolume(volume * 100);
    
    // Initial Jump to current room time
    const startAt = getExpectedTime();
    event.target.seekTo(startAt, true);
    if (playerState?.isPlaying) event.target.playVideo();
  };

  const handleVolumeChange = (val: number[]) => {
    const v = val[0];
    setVolume(v);
    setCachedState('global', 'volume', v);
    if (ytPlayerRef.current) ytPlayerRef.current.setVolume(v * 100);
  };

  const videoId = useMemo(() => {
    if (!videoUrl) return null;
    const match = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/);
    return match ? match[1] : (videoUrl.length === 11 ? videoUrl : null);
  }, [videoUrl]);

  const formatTime = (s: number) => {
    const date = new Date(0);
    date.setSeconds(s);
    return date.toISOString().substring(s >= 3600 ? 11 : 14, 19);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (!canControl) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight') seekBy(10);
      if (e.key === 'ArrowLeft') seekBy(-10);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [canControl, togglePlay, seekBy]);

  return (
    <div 
      className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group"
      onMouseMove={() => { setShowControls(true); if(controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000); }}
    >
      {videoId ? (
        <YouTube
          videoId={videoId}
          opts={{
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              playsinline: 1,
            }
          }}
          onReady={onReady}
          onEnd={onVideoEnded}
          className="w-full h-full pointer-events-none"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
          <Film className="w-16 h-16 opacity-20" />
          <p>شاشة السينما تنتظر اختيار فيديو...</p>
          {canControl && <Button onClick={onSearchClick} variant="outline"><Search className="me-2"/>بحث عن فيديو</Button>}
        </div>
      )}

      {/* Feedback Overlay */}
      {feedback.visible && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="bg-black/40 p-6 rounded-full animate-in zoom-in duration-300">
            {feedback.type === 'play' && <Play className="w-12 h-12 text-white fill-white" />}
            {feedback.type === 'pause' && <Pause className="w-12 h-12 text-white fill-white" />}
            {feedback.type === 'forward' && <FastForward className="w-12 h-12 text-white" />}
            {feedback.type === 'backward' && <Rewind className="w-12 h-12 text-white" />}
          </div>
        </div>
      )}

      {/* Custom Controls */}
      {videoId && (
        <div className={cn("absolute inset-0 z-20 flex flex-col justify-between p-4 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-500", showControls ? "opacity-100" : "opacity-0")}>
          <div className="flex justify-between items-start">
            <div className="max-w-[70%] bg-black/40 px-3 py-1 rounded text-sm text-white truncate">
              {videoDetails?.title || "جاري التشغيل..."}
            </div>
          </div>

          <div className="flex items-center justify-center gap-8">
            {canControl && (
              <>
                <Button variant="ghost" size="icon" onClick={() => seekBy(-10)} className="text-white hover:bg-white/20"><Rewind /></Button>
                <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:bg-white/20 w-16 h-16">
                  {playerState?.isPlaying ? <Pause className="w-10 h-10 fill-white" /> : <Play className="w-10 h-10 fill-white" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => seekBy(10)} className="text-white hover:bg-white/20"><FastForward /></Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 text-white text-xs font-mono">
            <span>{formatTime(progress)}</span>
            <Slider 
              value={[progress]} 
              max={duration || 100} 
              onValueChange={(v) => { if(canControl) setProgress(v[0]); }}
              onValueCommit={(v) => { if(canControl) { ignoreSyncUntilRef.current = Date.now() + 2000; ytPlayerRef.current?.seekTo(v[0], true); onPlayerStateChange({ seekTime: v[0], timestamp: getServerTime() }); } }}
              className="flex-grow"
              disabled={!canControl}
            />
            <span>{formatTime(duration)}</span>
            
            <Popover>
              <PopoverTrigger asChild><Button variant="ghost" size="icon" className="text-white"><Volume2 className="w-4 h-4"/></Button></PopoverTrigger>
              <PopoverContent className="w-12 p-2 bg-black/80 border-none"><Slider orientation="vertical" value={[volume]} max={1} step={0.05} onValueChange={handleVolumeChange} className="h-24"/></PopoverContent>
            </Popover>
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;