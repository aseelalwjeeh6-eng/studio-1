
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
      // Not a valid URL, might be youtube ID
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
  } catch (e) {
    // Not a valid URL, could be a video ID
  }
  // Fallback for just ID
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
  const [volume, setVolume] = useState(playerState?.volume ?? 0.8);
  const [quality, setQuality] = useState(playerState?.quality ?? 'auto');
  
  const lastClickTimeRef = useRef(0);
  const lastClickSideRef = useRef<'left' | 'right' | 'center' | null>(null);

  // --- Synchronization Logic ---
  const syncPlayerState = useCallback(() => {
    if (canControl || !isPlayerReady.current || !playerState || !duration || isSeekingRef.current) {
      return;
    }

    let currentPlayerTime = 0;
    try {
        if (ytPlayerRef.current) {
            currentPlayerTime = ytPlayerRef.current.getCurrentTime();
        } else if (htmlPlayerRef.current) {
            currentPlayerTime = htmlPlayerRef.current.currentTime;
        } else {
            return; // No active player
        }
    } catch (e) {
        console.warn("Sync: Could not get current player time", e);
        return;
    }

    const serverTime = playerState.seekTime + (playerState.isPlaying ? (Date.now() - playerState.timestamp) / 1000 : 0);
    const timeDifference = serverTime - currentPlayerTime;

    // Apply Smart Correction Algorithm
    if (Math.abs(timeDifference) > 2) { // Hard Sync for large differences
      try {
        if (ytPlayerRef.current) ytPlayerRef.current.seekTo(serverTime, true);
        if (htmlPlayerRef.current) htmlPlayerRef.current.currentTime = serverTime;
        console.log(`Hard Sync: Correcting by ${timeDifference.toFixed(2)}s`);
      } catch (e) { console.warn("Hard Sync failed", e); }
    } else if (Math.abs(timeDifference) > 0.5) { // Soft Sync for small, noticeable differences
        // Not implemented via playbackRate for YouTube as it can be jarring.
        // Relying on frequent progress updates and hard sync for larger drifts is more stable.
        try {
            if (playerState.isPlaying) {
                if (ytPlayerRef.current) ytPlayerRef.current.seekTo(serverTime, true);
                if (htmlPlayerRef.current) htmlPlayerRef.current.currentTime = serverTime;
            }
        } catch (e) { console.warn("Soft Sync Seek failed", e); }
    }
    // Differences < 0.5s are ignored (tolerance zone)

    // Sync play/pause state
    try {
        if (ytPlayerRef.current) {
            const ytState = ytPlayerRef.current.getPlayerState();
            if (playerState.isPlaying && ytState !== 1) { // Is playing on server, but not locally
                ytPlayerRef.current.playVideo();
            } else if (!playerState.isPlaying && ytState === 1) { // Is paused on server, but playing locally
                ytPlayerRef.current.pauseVideo();
            }
        }
        if (htmlPlayerRef.current) {
            if (playerState.isPlaying && htmlPlayerRef.current.paused) {
                htmlPlayerRef.current.play().catch(console.error);
            } else if (!playerState.isPlaying && !htmlPlayerRef.current.paused) {
                htmlPlayerRef.current.pause();
            }
        }
    } catch (e) { console.warn("Play/Pause Sync failed", e); }

  }, [canControl, playerState, duration]);

  // Main sync loop
  useEffect(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }
    // The sync logic is now more robust and can run for everyone
    syncIntervalRef.current = setInterval(syncPlayerState, 1000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
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
    } catch (e) {
      console.warn("Could not toggle play", e);
    }
  }, [canControl, urlType]);

  // --- Media Session API Integration ---
  useEffect(() => {
    if ('mediaSession' in navigator) {
      if (!videoDetails || urlType === 'empty') {
        (navigator as any).mediaSession.metadata = null;
        (navigator as any).mediaSession.setActionHandler('play', null);
        (navigator as any).mediaSession.setActionHandler('pause', null);
        return;
      }
      
      const artwork = [];
      if (videoDetails.snippet.thumbnails.high) {
        artwork.push({ src: videoDetails.snippet.thumbnails.high.url, sizes: '480x360', type: 'image/jpeg' });
      }
      if (videoDetails.snippet.thumbnails.medium) {
        artwork.push({ src: videoDetails.snippet.thumbnails.medium.url, sizes: '320x180', type: 'image/jpeg' });
      }
      if (videoDetails.snippet.thumbnails.default) {
        artwork.push({ src: videoDetails.snippet.thumbnails.default.url, sizes: '120x90', type: 'image/jpeg' });
      }

      const metadata = {
        title: videoDetails.snippet.title,
        artist: videoDetails.snippet.channelTitle,
        album: 'اصيل سينما',
        artwork: artwork
      };

      (navigator as any).mediaSession.metadata = new MediaMetadata(metadata);
      
      (navigator as any).mediaSession.setActionHandler('play', canControl ? () => togglePlay() : null);
      (navigator as any).mediaSession.setActionHandler('pause', canControl ? () => togglePlay() : null);
      
    }
  }, [videoDetails, canControl, togglePlay, urlType]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
        (navigator as any).mediaSession.playbackState = playerState?.isPlaying ? "playing" : "paused";
    }
  }, [playerState?.isPlaying]);


  // --- This effect is now the single source of truth for the progress bar.
  useEffect(() => {
    let progressInterval: NodeJS.Timeout | null = null;
    const updateProgress = () => {
        if (!playerState || !duration || duration === 0 || isSeekingRef.current) return;
        
        // Mathematical precision: calculate time based on server state.
        const serverTime = playerState.seekTime + (playerState.isPlaying ? (Date.now() - playerState.timestamp) / 1000 : 0);
        
        if (serverTime <= duration) {
            setProgress(serverTime);
        } else {
            setProgress(duration);
        }
    };
    
    // Update immediately, then set interval
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
    } catch(e) { console.warn("Couldn't get player time for seek", e); }

    const newTime = Math.max(0, Math.min(duration, currentTime + amount));
    
    isSeekingRef.current = true;
    try {
        if (ytPlayerRef.current) ytPlayerRef.current.seekTo(newTime, true);
        if (htmlPlayerRef.current) htmlPlayerRef.current.currentTime = newTime;
    } catch (e) {
        console.warn("Could not seek", e);
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
    } catch (e) {
        console.warn("Could not seek on slider change", e);
    }
  };
  
  const handleSliderCommit = (value: number[]) => {
      if (!canControl || !isPlayerReady.current) return;
      const newTime = value[0];
      try {
        if (ytPlayerRef.current) ytPlayerRef.current.seekTo(newTime, true);
      } catch(e) {
        console.warn("Could not commit YouTube seek");
      }
      onPlayerStateChange({ seekTime: newTime });
      setTimeout(() => { isSeekingRef.current = false; }, 200);
  };
  
  const handleVolumeChange = (newVolume: number[]) => {
    const vol = newVolume[0];
    setVolume(vol);

    try {
        if (ytPlayerRef.current) ytPlayerRef.current.setVolume(vol * 100);
        if (htmlPlayerRef.current) htmlPlayerRef.current.volume = vol;
    } catch (e) {
        console.warn("Could not set volume on change", e);
    }
    
    if(canControl) {
        onPlayerStateChange({ volume: vol });
    }
  };
  
  const handleQualityChange = (newQuality: string) => {
    setQuality(newQuality);
    if(canControl) {
        onPlayerStateChange({ quality: newQuality });
    }
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
        if (clickSide === 'left') {
          seek(-5);
        } else if (clickSide === 'right') {
          seek(5);
        }
      }
      lastClickTimeRef.current = 0;
      lastClickSideRef.current = null;
    } else {
      lastClickTimeRef.current = now;
      lastClickSideRef.current = clickSide;

      if (clickSide === 'center') {
        togglePlay();
      }
    }
  };
  
  const onYtReady = (event: { target: YouTubePlayer }) => {
    ytPlayerRef.current = event.target;
    isPlayerReady.current = true;
    const ytDuration = event.target.getDuration();
    setDuration(ytDuration);
    
    const initialVolume = playerState?.volume ?? 0.8;
    event.target.setVolume(initialVolume * 100);
    setVolume(initialVolume);

    // Initial state is now handled by the start/autoplay vars and the sync loop.
    // This prevents race conditions on join.
  };

  const onYtStateChange = (event: { data: number }) => {
    // Only the controller should send state changes.
    if (!canControl || isSeekingRef.current) return;
    
    const currentTime = ytPlayerRef.current?.getCurrentTime();
    if (currentTime === undefined) return;

    if (event.data === 1) { // Playing
      if (!playerState?.isPlaying) {
        onPlayerStateChange({ isPlaying: true, seekTime: currentTime });
      }
    } else if (event.data === 2) { // Paused
       if (playerState?.isPlaying) {
        onPlayerStateChange({ isPlaying: false, seekTime: currentTime });
      }
    }
  };

  const onYtEnd = () => {
    if (canControl) {
      onVideoEnded();
    }
  };

  const onHtmlReady = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    if (!htmlPlayerRef.current) return;
    isPlayerReady.current = true;
    const htmlDuration = htmlPlayerRef.current.duration;
    setDuration(htmlDuration);

    const initialVolume = playerState?.volume ?? 0.8;
    htmlPlayerRef.current.volume = initialVolume;
    setVolume(initialVolume);
    
    // The syncPlayerState will handle setting the correct time and play state
  };
  
  const onHtmlStateChange = () => {
      if (!canControl || isSeekingRef.current || !htmlPlayerRef.current) return;
      
      const isPlaying = !htmlPlayerRef.current.paused;
      if (playerState?.isPlaying !== isPlaying) {
          onPlayerStateChange({ isPlaying: isPlaying, seekTime: htmlPlayerRef.current.currentTime });
      }
  };

  const onHtmlEnded = () => {
    if (canControl) {
        onVideoEnded();
    }
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const date = new Date(0);
    date.setSeconds(seconds);
    const hasHours = date.getUTCHours() > 0;
    return date.toISOString().substr(hasHours ? 11 : 14, hasHours ? 8 : 5);
  };

  const renderContent = () => {
    switch(urlType) {
        case 'youtube':
            if (!videoId) return renderEmptyState('Invalid YouTube URL');
            const startSeconds = (playerState?.seekTime ?? 0) + ((playerState?.isPlaying && playerState?.timestamp) ? (Date.now() - playerState.timestamp) / 1000 : 0);

            return (
                <YouTube
                  key={`${videoId}-${quality}`}
                  videoId={videoId}
                  opts={{
                    height: '100%',
                    width: '100%',
                    playerVars: {
                      autoplay: playerState?.isPlaying ? 1 : 0,
                      start: Math.floor(startSeconds),
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
                  className="w-full h-full"
                />
            );
        
        case 'direct':
             const directStartSeconds = (playerState?.seekTime ?? 0) + ((playerState?.isPlaying && playerState?.timestamp) ? (Date.now() - playerState.timestamp) / 1000 : 0);
            return (
                <video
                    ref={htmlPlayerRef}
                    src={`${videoUrl}#t=${directStartSeconds}`}
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

        case 'empty':
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
        onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to the parent
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
               <Slider
                    value={[progress]}
                    max={duration}
                    step={1}
                    onValueChange={handleSliderChange}
                    onValueCommit={handleSliderCommit}
                />
               <span className="w-12 text-center">{formatTime(duration)}</span>
            </>
           ) : (
             <>
               <span className="w-12 text-center">{formatTime(progress)}</span>
               <div className="w-full h-2 bg-secondary/50 rounded-full relative overflow-hidden">
                 <div className="absolute h-full bg-primary" style={{ width: `${(progress / duration) * 100}%`}}></div>
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
                     <Slider
                        defaultValue={[volume]}
                        max={1}
                        step={0.05}
                        orientation="vertical"
                        className="h-24 w-2"
                        onValueChange={handleVolumeChange}
                    />
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
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="hd1080" id="q1080" />
                      <Label htmlFor="q1080">1080p</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="hd720" id="q720" />
                      <Label htmlFor="q720">720p</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="large" id="q480" />
                      <Label htmlFor="q480">480p</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="medium" id="q360" />
                      <Label htmlFor="q360">360p</Label>
                    </div>
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
            controlsTimeoutRef.current = null;
            setShowControls(false);
        }}
    >
      <div className="absolute inset-0 w-full h-full">
         {renderContent()}
      </div>
      {renderCustomControls()}
    </div>
  );
};

export default Player;
