'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import YouTube, { YouTubePlayer } from 'react-youtube';
import { Button } from '@/components/ui/button';
import { Play, Search, Film, Pause, Volume2, Volume1, VolumeX, Settings, YoutubeIcon } from 'lucide-react';
import { PlayerState } from './RoomClient';
import { Slider } from '../ui/slider';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { YouTubeVideo } from '@/ai/flows/youtube-search-flow';
import { getCachedState, setCachedState } from '@/lib/cache-utils';

/**
 * TECHNICAL ANALYSIS - PLAYER SYNC SYSTEM (PHASE 5: HARDENED SYNC)
 * ---------------------------------------------------------------------
 * Robust synchronization with error boundaries and state protection.
 */

interface PlayerProps {
  videoUrl: string;
  onSetVideo: (url: string, startTime?: number) => void;
  canControl: boolean;
  onSearchClick: () => void;
  playerState: PlayerState | null;
  onPlayerStateChange: (newState: Partial<PlayerState>) => void;
  onVideoEnded: () => void;
  videoDetails: YouTubeVideo | null;
}

type UrlType = 'youtube' | 'direct' | 'iframe' | 'empty';

function getUrlType(url: string): UrlType {
    if (!url) return 'empty';
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname;
        
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            return 'youtube';
        }
        if (pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.ogv') || pathname.endsWith('.m3u8')) {
            return 'direct';
        }

    } catch (e) {
      if (url.match(/^[a-zA-Z0-9_-]{11}$/)) {
        return 'youtube';
      }
    }
    return 'iframe';
}


function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    if (hostname === 'youtu.be') {
      return urlObj.pathname.slice(1).split('?')[0];
    }
    if (hostname === 'www.youtube.com' || hostname === 'youtube.com') {
      if (urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }
      if (urlObj.pathname.startsWith('/embed/')) {
        return urlObj.pathname.split('/embed/')[1].split('?')[0];
      }
    }
  } catch (e) {}
  if (url.match(/^[a-zA-Z0-9_-]{11}$/)) {
    return url;
  }
  return null;
}

const Player = ({ videoUrl, onSetVideo, canControl, onSearchClick, playerState, onPlayerStateChange, onVideoEnded, videoDetails }: PlayerProps) => {
  const urlType = useMemo(() => getUrlType(videoUrl), [videoUrl]);
  const videoId = useMemo(() => (urlType === 'youtube' ? getYouTubeVideoId(videoUrl) : null), [videoUrl, urlType]);

  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const htmlPlayerRef = useRef<HTMLVideoElement | null>(null);
  const isPlayerReady = useRef(false);
  const isSeekingRef = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [volume, setVolume] = useState(() => getCachedState('global', 'volume', 0.8));
  const [quality, setQuality] = useState(() => getCachedState('global', 'quality', 'auto'));
  
  const lastClickTimeRef = useRef(0);
  const lastClickSideRef = useRef<'left' | 'right' | 'center' | null>(null);

  /**
   * SYNCHRONIZATION LOOP PROTECTION (PHASE 5)
   * Hardened sync logic with extensive error boundaries.
   */
  const syncPlayerState = useCallback(() => {
    // 1. Safety Checks
    if (typeof window === 'undefined' || document.visibilityState === 'hidden' || !isPlayerReady.current || !playerState || !duration || isSeekingRef.current) {
      return;
    }
  
    let currentPlayerTime = 0;
    let localPlayer: any = null;
  
    try {
      if (ytPlayerRef.current && urlType === 'youtube') {
        localPlayer = ytPlayerRef.current;
        const ytState = localPlayer.getPlayerState();
        if (ytState === 3 || ytState === -1) return; // Buffering or Unstarted
        currentPlayerTime = localPlayer.getCurrentTime();
      } else if (htmlPlayerRef.current && urlType === 'direct') {
        localPlayer = htmlPlayerRef.current;
        if (localPlayer.readyState < 2) return; // Not enough data
        currentPlayerTime = localPlayer.currentTime;
      } else {
        return;
      }
    } catch (e) {
      console.warn('[Sync] Player ref access failed:', e);
      return;
    }
  
    // 2. Reference Time Calculation
    const serverTime = (playerState.seekTime || 0) + (playerState.isPlaying ? (Date.now() - (playerState.timestamp || Date.now())) / 1000 : 0);
    const timeDifference = serverTime - currentPlayerTime;
    const absDifference = Math.abs(timeDifference);
  
    try {
      // 3. Correction Strategies
      
      // Hard Sync (> 2s)
      if (absDifference > 2) { 
        if (urlType === 'youtube') {
            localPlayer.seekTo(serverTime, true);
            localPlayer.setPlaybackRate(1);
        } else {
            localPlayer.currentTime = serverTime;
            localPlayer.playbackRate = 1;
        }
      } 
      // Soft Sync (0.5s - 2s)
      else if (absDifference > 0.5) { 
        const playbackRate = timeDifference > 0 ? 1.05 : 0.95;
        if (urlType === 'youtube') {
            if (localPlayer.getPlaybackRate() !== playbackRate) localPlayer.setPlaybackRate(playbackRate);
        } else {
            if (localPlayer.playbackRate !== playbackRate) localPlayer.playbackRate = playbackRate;
        }
      } 
      // In Sync (< 0.5s)
      else { 
         if (urlType === 'youtube') {
            if (localPlayer.getPlaybackRate() !== 1) localPlayer.setPlaybackRate(1);
        } else {
            if (localPlayer.playbackRate !== 1) localPlayer.playbackRate = 1;
        }
      }
  
      // 4. Play/Pause State Sync
      if (urlType === 'youtube') {
        const ytState = localPlayer.getPlayerState();
        if (playerState.isPlaying && ytState !== 1 && ytState !== 3) { 
          localPlayer.playVideo();
        } else if (!playerState.isPlaying && ytState === 1) {
          localPlayer.pauseVideo();
        }
      } else {
        if (playerState.isPlaying && localPlayer.paused) {
          localPlayer.play().catch(() => {});
        } else if (!playerState.isPlaying && !localPlayer.paused) {
          localPlayer.pause();
        }
      }
    } catch (e) {
        console.warn('[Sync] Application failed:', e);
    }
  
  }, [playerState, duration, urlType]);

  useEffect(() => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = setInterval(syncPlayerState, 1000);
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [syncPlayerState]);


  const togglePlay = useCallback(() => {
    if (!canControl || !isPlayerReady.current) return;
  
    try {
      if (urlType === 'youtube' && ytPlayerRef.current) {
        const state = ytPlayerRef.current.getPlayerState();
        if (state === 1) ytPlayerRef.current.pauseVideo();
        else ytPlayerRef.current.playVideo();
      } else if (urlType === 'direct' && htmlPlayerRef.current) {
        if (htmlPlayerRef.current.paused) htmlPlayerRef.current.play().catch(console.error);
        else htmlPlayerRef.current.pause();
      }
    } catch (e) {}
  }, [canControl, urlType]);

  // Media Session metadata & controls
  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      if (!videoDetails || urlType === 'empty') {
        navigator.mediaSession.metadata = null;
        return;
      }
      
      try {
          const artwork = [];
          if (videoDetails.snippet.thumbnails.high) artwork.push({ src: videoDetails.snippet.thumbnails.high.url, sizes: '480x360', type: 'image/jpeg' });
          if (videoDetails.snippet.thumbnails.medium) artwork.push({ src: videoDetails.snippet.thumbnails.medium.url, sizes: '320x180', type: 'image/jpeg' });

          navigator.mediaSession.metadata = new MediaMetadata({
            title: videoDetails.snippet.title,
            artist: videoDetails.snippet.channelTitle,
            album: 'اصيل سينما',
            artwork: artwork
          });
          
          navigator.mediaSession.setActionHandler('play', canControl ? () => togglePlay() : null);
          navigator.mediaSession.setActionHandler('pause', canControl ? () => togglePlay() : null);
      } catch (e) {}
    }
  }, [videoDetails, canControl, togglePlay, urlType]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = playerState?.isPlaying ? "playing" : "paused";
    }
  }, [playerState?.isPlaying]);


  useEffect(() => {
    let progressInterval: NodeJS.Timeout | null = null;
    const updateProgress = () => {
        if (!playerState || !duration || duration === 0 || isSeekingRef.current) return;
        const serverTime = (playerState.seekTime || 0) + (playerState.isPlaying ? (Date.now() - (playerState.timestamp || Date.now())) / 1000 : 0);
        setProgress(Math.max(0, Math.min(serverTime, duration)));
    };
    
    updateProgress();
    if (playerState?.isPlaying) {
      progressInterval = setInterval(updateProgress, 500);
    }
    return () => {
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [playerState, duration]);

  const seek = useCallback((amount: number) => {
    if (!canControl || !isPlayerReady.current || !duration) return;
    
    let currentTime = 0;
    try {
        if (ytPlayerRef.current) currentTime = ytPlayerRef.current.getCurrentTime();
        if (htmlPlayerRef.current) currentTime = htmlPlayerRef.current.currentTime;
    } catch(e) {}

    const newTime = Math.max(0, Math.min(duration, currentTime + amount));
    isSeekingRef.current = true;
    try {
        if (ytPlayerRef.current) ytPlayerRef.current.seekTo(newTime, true);
        if (htmlPlayerRef.current) htmlPlayerRef.current.currentTime = newTime;
    } catch (e) {
        isSeekingRef.current = false;
        return;
    }
    setProgress(newTime);
    onPlayerStateChange({ seekTime: newTime });
    setTimeout(() => { isSeekingRef.current = false; }, 500);
  }, [canControl, duration, onPlayerStateChange]);

  const handleSliderChange = (value: number[]) => {
    if (!canControl || !isPlayerReady.current) return;
    const newTime = value[0];
    setProgress(newTime);
    isSeekingRef.current = true;
    try {
        if (ytPlayerRef.current) ytPlayerRef.current.seekTo(newTime, false);
        if (htmlPlayerRef.current) htmlPlayerRef.current.currentTime = newTime;
    } catch (e) {}
  };
  
  const handleSliderCommit = (value: number[]) => {
      if (!canControl || !isPlayerReady.current) return;
      const newTime = value[0];
      try { 
          if (ytPlayerRef.current) ytPlayerRef.current.seekTo(newTime, true); 
          if (htmlPlayerRef.current) htmlPlayerRef.current.currentTime = newTime;
      } catch(e) {}
      onPlayerStateChange({ seekTime: newTime });
      setTimeout(() => { isSeekingRef.current = false; }, 200);
  };
  
  const handleVolumeChange = (newVolume: number[]) => {
    const vol = newVolume[0];
    setVolume(vol);
    setCachedState('global', 'volume', vol);
    try {
        if (ytPlayerRef.current) ytPlayerRef.current.setVolume(vol * 100);
        if (htmlPlayerRef.current) htmlPlayerRef.current.volume = vol;
    } catch (e) {}
  };
  
  const handleQualityChange = (newQuality: string) => {
    setQuality(newQuality);
    setCachedState('global', 'quality', newQuality);
  }

  const handlePlayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (urlType === 'empty' || urlType === 'iframe') {
        if(canControl) onSearchClick();
        return;
    };

    const DOUBLE_CLICK_THRESHOLD = 300;
    const now = Date.now();
    const clickX = e.clientX;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const clickSide = clickX < left + width / 3 ? 'left' : (clickX > left + width * 2 / 3 ? 'right' : 'center');

    if (now - lastClickTimeRef.current < DOUBLE_CLICK_THRESHOLD && clickSide === lastClickSideRef.current) {
      if (canControl) {
        if (clickSide === 'left') seek(-10);
        else if (clickSide === 'right') seek(10);
      }
      lastClickTimeRef.current = 0;
      lastClickSideRef.current = null;
    } else {
      lastClickTimeRef.current = now;
      lastClickSideRef.current = clickSide;
      if (clickSide === 'center' && canControl) togglePlay();
    }
  };
  
  const onYtReady = (event: { target: YouTubePlayer }) => {
    ytPlayerRef.current = event.target;
    isPlayerReady.current = true;
    setDuration(event.target.getDuration());
    event.target.setVolume(volume * 100);
  };

  const onYtStateChange = (event: { data: number }) => {
    if (!canControl || isSeekingRef.current) return;
    const currentTime = ytPlayerRef.current?.getCurrentTime();
    if (currentTime === undefined) return;

    if (event.data === 1) { // Playing
      if (!playerState?.isPlaying) onPlayerStateChange({ isPlaying: true, seekTime: currentTime });
    } else if (event.data === 2) { // Paused
       if (playerState?.isPlaying) onPlayerStateChange({ isPlaying: false, seekTime: currentTime });
    }
  };

  const onYtError = (event: { data: number }) => {
    console.warn(`YouTube Error: ${event.data}`);
    if (canControl) onVideoEnded();
  };

  const onYtEnd = () => { if (canControl) onVideoEnded(); };

  const onHtmlReady = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    if (!htmlPlayerRef.current) return;
    isPlayerReady.current = true;
    setDuration(htmlPlayerRef.current.duration);
    htmlPlayerRef.current.volume = volume;
  };
  
  const onHtmlStateChange = () => {
      if (!canControl || isSeekingRef.current || !htmlPlayerRef.current) return;
      const isPlaying = !htmlPlayerRef.current.paused;
      if (playerState?.isPlaying !== isPlaying) onPlayerStateChange({ isPlaying: isPlaying, seekTime: htmlPlayerRef.current.currentTime });
  };

  const onHtmlEnded = () => { if (canControl) onVideoEnded(); }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const date = new Date(0);
    date.setSeconds(seconds);
    const hasHours = date.getUTCHours() > 0;
    return date.toISOString().substr(hasHours ? 11 : 14, hasHours ? 8 : 5);
  };

  // Cleanup effects
  useEffect(() => {
      return () => {
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }
  }, []);

  const renderContent = () => {
    switch(urlType) {
        case 'youtube':
            if (!videoId) return renderEmptyState('Invalid YouTube URL');
            const serverTs = playerState?.timestamp || Date.now();
            const startSeconds = (playerState?.seekTime ?? 0) + (playerState?.isPlaying ? (Date.now() - serverTs) / 1000 : 0);
            return (
                <YouTube
                  key={`${videoId}-${quality}`}
                  videoId={videoId}
                  opts={{
                    height: '100%',
                    width: '100%',
                    playerVars: {
                      autoplay: playerState?.isPlaying ? 1 : 0,
                      start: Math.floor(Math.max(0, startSeconds)),
                      controls: 0,
                      rel: 0,
                      showinfo: 0,
                      modestbranding: 1,
                      iv_load_policy: 3,
                      disablekb: 1,
                      playsinline: 1,
                      ...(quality !== 'auto' && {vq: quality})
                    },
                  }}
                  onReady={onYtReady}
                  onStateChange={onYtStateChange}
                  onEnd={onYtEnd}
                  onError={onYtError}
                  className="w-full h-full"
                />
            );
        case 'direct':
             const directTs = playerState?.timestamp || Date.now();
             const directStartSeconds = (playerState?.seekTime ?? 0) + (playerState?.isPlaying ? (Date.now() - directTs) / 1000 : 0);
            return (
                <video
                    ref={htmlPlayerRef}
                    src={`${videoUrl}#t=${Math.max(0, directStartSeconds)}`}
                    className="w-full h-full object-contain"
                    onLoadedData={onHtmlReady}
                    onPlay={onHtmlStateChange}
                    onPause={onHtmlStateChange}
                    onEnded={onHtmlEnded}
                    playsInline
                    autoPlay={playerState?.isPlaying}
                />
            );
        case 'iframe':
             return (
              <iframe
                src={videoUrl}
                title="Shared Content"
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-presentation"
              ></iframe>
            );
        default:
            return renderEmptyState();
    }
  };

  const renderEmptyState = (message?: string) => (
    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
      {canControl ? (
        <div className='w-full max-w-lg'>
          <Film className="h-16 w-16 mb-4 mx-auto" />
          <h3 className="text-xl font-bold text-foreground">شاشة السينما فارغة</h3>
          <p className='mb-4'>{message || 'أضف فيديو من يوتيوب أو الصق رابط فيلم لبدء العرض.'}</p>
          <Button onClick={onSearchClick} className="w-full" variant="secondary">
            <Search className="me-2 h-4 w-4" />
            إضافة فيديو
          </Button>
        </div>
      ) : (
        <>
          <Film className="h-16 w-16 mb-4" />
          <p className="text-lg">ينتظر المضيف لبدء الفيلم...</p>
        </>
      )}
    </div>
  );

  const VolumeIcon = useMemo(() => {
    if (volume === 0) return VolumeX;
    if (volume < 0.5) return Volume1;
    return Volume2;
  }, [volume]);


  const renderCustomControls = () => {
    if (urlType === 'empty' || urlType === 'iframe') return null;

    return (
      <div 
        className={cn(
            "absolute inset-0 z-20 flex flex-col justify-between p-1 md:p-2 bg-black/30 transition-opacity duration-300",
            showControls ? "opacity-100" : "opacity-0"
        )}
        onClick={(e) => e.stopPropagation()} 
      >
        <div></div>
        <div className="flex items-center justify-center">
           {canControl && (
            <Button onClick={togglePlay} size="icon" variant="ghost" className="text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 md:w-16 md:h-16">
                {playerState?.isPlaying ? <Pause className="w-8 h-8 md:w-10 md:h-10" /> : <Play className="w-8 h-8 md:w-10 md:h-10" />}
            </Button>
           )}
        </div>
        <div className="flex items-center gap-1 md:gap-2 text-white font-mono text-xs md:text-sm">
           {canControl ? (
            <>
               <span className="w-12 text-center">{formatTime(progress)}</span>
               <Slider value={[progress]} max={duration || 100} step={1} onValueChange={handleSliderChange} onValueCommit={handleSliderCommit} />
               <span className="w-12 text-center">{formatTime(duration)}</span>
            </>
           ) : (
             <>
               <span className="w-12 text-center">{formatTime(progress)}</span>
               <div className="w-full h-2 bg-secondary/50 rounded-full relative overflow-hidden">
                 <div className="absolute h-full bg-primary" style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%`}}></div>
               </div>
               <span className="w-12 text-center">{formatTime(duration)}</span>
            </>
           )}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white h-8 w-8 md:h-9 md:w-9">
                        <VolumeIcon className="w-4 h-4 md:w-5 md:h-5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className="w-auto p-2 bg-black/50 border-none">
                     <Slider defaultValue={[volume]} max={1} step={0.05} orientation="vertical" className="h-24 w-2" onValueChange={handleVolumeChange} />
                </PopoverContent>
            </Popover>
            {urlType === 'youtube' && canControl && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white h-8 w-8 md:h-9 md:w-9">
                    <Settings className="w-4 h-4 md:w-5 md:h-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-auto p-2 bg-black/50 border-none">
                  <RadioGroup value={quality} onValueChange={handleQualityChange} className="text-white text-sm">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="auto" id="qauto" />
                      <Label htmlFor="qauto">Auto</Label>
                    </div>
                    {['hd1080', 'hd720', 'large', 'medium'].map(q => (
                      <div key={q} className="flex items-center space-x-2">
                        <RadioGroupItem value={q} id={`q${q}`} />
                        <Label htmlFor={`q${q}`}>{q.replace('hd', '').replace('large', '480p').replace('medium', '360p')}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </PopoverContent>
              </Popover>
            )}
        </div>
      </div>
    );
  };

  return (
    <div 
        className="w-full max-w-full rounded-lg overflow-hidden shadow-md bg-black relative aspect-video"
        onMouseMove={() => {
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            setShowControls(true);
            controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
        }}
        onClick={handlePlayerClick}
        onMouseLeave={() => {
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            setShowControls(false);
        }}
    >
      <div className="absolute inset-0 w-full h-full">{renderContent()}</div>
      {renderCustomControls()}
    </div>
  );
};

export default Player;
