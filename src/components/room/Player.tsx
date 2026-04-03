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
  FastForward,
  Rewind,
  AlertCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { PlayerState } from './RoomClient';
import { Slider } from '../ui/slider';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
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

const SYNC_THRESHOLD = 3.5; 
const LOCAL_ACTION_COOLDOWN = 3500; 
const CONTROLS_HIDE_TIMEOUT = 5000; 

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
  const [videoError, setVideoError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'play' | 'pause' | 'forward' | 'backward' | '', visible: boolean }>({ type: '', visible: false });

  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const isReadyRef = useRef(false);
  const ignoreSyncUntilRef = useRef(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastClickRef = useRef<number>(0);

  const getServerTime = useCallback(() => Date.now() + serverTimeOffset, [serverTimeOffset]);

  const getExpectedTime = useCallback(() => {
    if (!playerState) return 0;
    const now = getServerTime();
    const elapsedSinceUpdate = (now - (playerState.timestamp || now)) / 1000;
    const speed = playerState.playbackRate || 1;
    const actualElapsed = elapsedSinceUpdate * speed;
    return playerState.isPlaying ? Math.max(0, playerState.seekTime + actualElapsed) : playerState.seekTime;
  }, [playerState, getServerTime]);

  const triggerFeedback = (type: 'play' | 'pause' | 'forward' | 'backward') => {
    setFeedback({ type, visible: true });
    setTimeout(() => setFeedback(prev => ({ ...prev, visible: false })), 800);
  };

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_TIMEOUT);
  }, []);

  const togglePlay = useCallback(async () => {
    if (!canControl || !ytPlayerRef.current || !isReadyRef.current) return;
    try {
      if (typeof ytPlayerRef.current.getPlayerState !== 'function') return;
      const playerStatus = await ytPlayerRef.current.getPlayerState();
      const isCurrentlyPlaying = playerStatus === 1;
      const nextState = !isCurrentlyPlaying;
      
      const currentTime = typeof ytPlayerRef.current.getCurrentTime === 'function' 
        ? await ytPlayerRef.current.getCurrentTime() 
        : playerState?.seekTime || 0;

      ignoreSyncUntilRef.current = Date.now() + LOCAL_ACTION_COOLDOWN;
      
      if (nextState) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();

      onPlayerStateChange({
        isPlaying: nextState,
        seekTime: currentTime,
        timestamp: getServerTime()
      });
      triggerFeedback(nextState ? 'play' : 'pause');
      resetControlsTimeout();
    } catch (e) { console.error("TogglePlay Error:", e); }
  }, [canControl, onPlayerStateChange, getServerTime, resetControlsTimeout, playerState]);

  const seekBy = useCallback(async (amount: number) => {
    if (!canControl || !ytPlayerRef.current || !isReadyRef.current) return;
    try {
      if (typeof ytPlayerRef.current.getCurrentTime !== 'function') return;
      const currentTime = await ytPlayerRef.current.getCurrentTime();
      const nextTime = Math.max(0, Math.min(duration, currentTime + amount));
      
      ignoreSyncUntilRef.current = Date.now() + LOCAL_ACTION_COOLDOWN;
      ytPlayerRef.current.seekTo(nextTime, true);
      
      onPlayerStateChange({
        seekTime: nextTime,
        timestamp: getServerTime()
      });
      triggerFeedback(amount > 0 ? 'forward' : 'backward');
      resetControlsTimeout();
    } catch (e) { console.error("Seek Error:", e); }
  }, [canControl, duration, onPlayerStateChange, getServerTime, resetControlsTimeout]);

  const handleVolumeChange = (val: number[]) => {
    const v = val[0];
    setVolume(v);
    setCachedState('global', 'volume', v);
    if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
        try { ytPlayerRef.current.setVolume(v * 100); } catch(e) {}
    }
    resetControlsTimeout();
  };

  const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const clickDelay = now - lastClickRef.current;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : (e as any).touches[0].clientX;
    const x = clientX - rect.left;
    const width = rect.width;

    if (clickDelay < 300) {
      if (canControl) {
        if (x < width * 0.4) seekBy(-10);
        else if (x > width * 0.6) seekBy(10);
        else resetControlsTimeout();
      } else {
        resetControlsTimeout();
      }
      lastClickRef.current = 0;
    } else {
      resetControlsTimeout();
      lastClickRef.current = now;
    }
  };

  useEffect(() => {
    if (!ytPlayerRef.current || !isReadyRef.current || !playerState) return;

    const syncInterval = setInterval(async () => {
      if (Date.now() < ignoreSyncUntilRef.current) return;

      try {
        if (!ytPlayerRef.current || typeof ytPlayerRef.current.getPlayerState !== 'function') return;
        
        const expected = getExpectedTime();
        const actual = await ytPlayerRef.current.getCurrentTime() || 0;
        const drift = Math.abs(expected - actual);
        const playerStatus = await ytPlayerRef.current.getPlayerState();

        if (playerStatus === 3) return;

        if (playerState.isPlaying && playerStatus !== 1 && playerStatus !== 3) {
          try { ytPlayerRef.current.playVideo(); } catch(e) {}
        } else if (!playerState.isPlaying && playerStatus === 1) {
          try { ytPlayerRef.current.pauseVideo(); } catch(e) {}
        }

        if (drift > SYNC_THRESHOLD) {
          try { ytPlayerRef.current.seekTo(expected, true); } catch(e) {}
        } else if (drift > 0.5 && playerState.isPlaying) {
          const targetRate = playerState.playbackRate || 1;
          const microAdjust = expected > actual ? 1.05 : 0.95;
          try { ytPlayerRef.current.setPlaybackRate(targetRate * microAdjust); } catch(e) {}
        } else {
          try { ytPlayerRef.current.setPlaybackRate(playerState.playbackRate || 1); } catch(e) {}
        }

        setProgress(actual);
      } catch (e) { }
    }, 1000);

    return () => clearInterval(syncInterval);
  }, [playerState, getExpectedTime]);

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && isReadyRef.current && playerState) {
        const expected = getExpectedTime();
        if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
            try {
                ytPlayerRef.current.seekTo(expected, true);
                if (playerState.isPlaying) ytPlayerRef.current.playVideo();
            } catch(e) {}
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [playerState, getExpectedTime]);

  const onReady = (event: any) => {
    ytPlayerRef.current = event.target;
    isReadyRef.current = true;
    setVideoError(null);
    setDuration(event.target.getDuration());
    try { event.target.setVolume(volume * 100); } catch(e) {}
    
    const startAt = getExpectedTime();
    try {
        event.target.seekTo(startAt, true);
        if (playerState?.isPlaying) event.target.playVideo();
    } catch(e) {}
  };

  const onError = (event: any) => {
    console.error("YouTube Error:", event.data);
    let msg = "حدث خطأ في تشغيل الفيديو.";
    if (event.data === 101 || event.data === 150) msg = "هذا الفيديو محظور من التشغيل في المواقع الأخرى.";
    if (event.data === 2) msg = "معرف الفيديو غير صحيح.";
    setVideoError(msg);
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
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
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
      className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group shadow-2xl border border-white/5"
      onMouseMove={resetControlsTimeout}
    >
      <div className="absolute inset-0 z-10 cursor-pointer" onClick={handleInteraction} />

      {videoId ? (
        <>
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
                origin: typeof window !== 'undefined' ? window.location.origin : undefined,
              }
            }}
            onReady={onReady}
            onEnd={onVideoEnded}
            onError={onError}
            className="w-full h-full pointer-events-none"
          />
          {videoError && (
            <div className="absolute inset-0 z-40 bg-black/90 flex flex-col items-center justify-center p-6 text-center">
              <AlertCircle className="w-16 h-16 text-destructive mb-4 animate-pulse" />
              <h3 className="text-xl font-bold text-white mb-2">خطأ في التشغيل</h3>
              <p className="text-muted-foreground mb-6 max-w-md">{videoError}</p>
              {canControl && <Button onClick={onSearchClick} variant="outline" className="border-accent text-accent hover:bg-accent/10"><RefreshCw className="me-2"/>اختيار فيديو آخر</Button>}
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-4 bg-gradient-to-b from-secondary/20 to-black">
          <Film className="w-16 h-16 opacity-20 animate-pulse" />
          <p className="text-lg font-headline">شاشة السينما تنتظر اختيار فيديو...</p>
          {canControl && <Button onClick={onSearchClick} variant="outline" className="border-accent text-accent hover:bg-accent/10 transition-all"><Search className="me-2"/>بحث عن فيديو</Button>}
        </div>
      )}

      {feedback.visible && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="bg-black/60 p-8 rounded-full animate-in zoom-in duration-300 backdrop-blur-sm border border-white/10">
            {feedback.type === 'play' && <Play className="w-14 h-14 text-white fill-white" />}
            {feedback.type === 'pause' && <Pause className="w-14 h-14 text-white fill-white" />}
            {feedback.type === 'forward' && <FastForward className="w-14 h-14 text-white" />}
            {feedback.type === 'backward' && <Rewind className="w-14 h-14 text-white" />}
          </div>
        </div>
      )}

      {videoId && !videoError && (
        <div className={cn("absolute inset-0 z-20 flex flex-col justify-between p-4 bg-gradient-to-t from-black/90 via-transparent to-black/60 transition-opacity duration-500", showControls ? "opacity-100" : "opacity-0 pointer-events-none")}>
          <div className="flex justify-between items-start">
            <div className="max-w-[70%] bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-sm text-white truncate border border-white/10 flex items-center gap-2">
              <Film className="w-4 h-4 text-accent" />
              {videoDetails?.snippet.title || "جاري التشغيل..."}
            </div>
            <div className="flex items-center gap-2">
                {canControl && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={(e) => { e.stopPropagation(); onSetVideo(''); }}
                        className="text-white hover:text-destructive hover:bg-destructive/20 transition-colors pointer-events-auto"
                        title="إغلاق الفيديو نهائياً"
                    >
                        <XCircle className="w-6 h-6" />
                    </Button>
                )}
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] text-white font-bold uppercase tracking-wider">سحابة أصيل متصلة</span>
                </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-10 pointer-events-auto">
            {canControl && (
              <>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); seekBy(-10); }} className="text-white hover:bg-white/20 transition-transform hover:scale-110"><Rewind className="w-8 h-8" /></Button>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:bg-white/20 w-20 h-20 rounded-full transition-transform hover:scale-110">
                  {playerState?.isPlaying ? <Pause className="w-12 h-12 fill-white" /> : <Play className="w-12 h-12 fill-white ms-1" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); seekBy(10); }} className="text-white hover:bg-white/20 transition-transform hover:scale-110"><FastForward className="w-8 h-8" /></Button>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="flex items-center gap-4 text-white text-xs font-mono bg-black/40 p-2 rounded-lg backdrop-blur-sm border border-white/5">
                <span>{formatTime(progress)}</span>
                <Slider 
                    value={[progress]} 
                    max={duration || 100} 
                    onValueChange={(v) => { if(canControl) setProgress(v[0]); resetControlsTimeout(); }}
                    onValueCommit={(v) => { if(canControl) { ignoreSyncUntilRef.current = Date.now() + 2000; try { ytPlayerRef.current?.seekTo(v[0], true); } catch(e) {} onPlayerStateChange({ seekTime: v[0], timestamp: getServerTime() }); } }}
                    className="flex-grow cursor-pointer"
                    disabled={!canControl}
                />
                <span>{formatTime(duration)}</span>
                
                <Popover>
                <PopoverTrigger asChild><Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={(e) => e.stopPropagation()}><Volume2 className="w-5 h-5"/></Button></PopoverTrigger>
                <PopoverContent className="w-12 p-3 bg-black/90 border-white/10 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}><Slider orientation="vertical" value={[volume]} max={1} step={0.05} onValueChange={handleVolumeChange} className="h-32"/></PopoverContent>
                </Popover>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Player;