
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
  
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [volume, setVolume] = useState(playerState?.volume ?? 0.8);
  const [quality, setQuality] = useState('auto');
  
  const lastClickTimeRef = useRef(0);
  const lastClickSideRef = useRef<'left' | 'right' | 'center' | null>(null);

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
      if (!videoDetails || urlType === 'empty' || !playerState?.isPlaying) {
        (navigator as any).mediaSession.metadata = null;
        (navigator as any).mediaSession.setActionHandler('play', null);
        (navigator as any).mediaSession.setActionHandler('pause', null);
        (navigator as any).mediaSession.playbackState = "none";
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
  }, [videoDetails, canControl, togglePlay, urlType, playerState?.isPlaying]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
        (navigator as any).mediaSession.playbackState = playerState?.isPlaying ? "playing" : "paused";
    }
  }, [playerState?.isPlaying]);


  // --- Generic Player Control ---
  const getCurrentPlayerTime = useCallback(() => {
    try {
        if (ytPlayerRef.current) return ytPlayerRef.current.getCurrentTime();
        if (htmlPlayerRef.current) return htmlPlayerRef.current.currentTime;
    } catch(e) {
        console.warn("Couldn't get player time", e);
    }
    return 0;
  }, []);

  const getPlayerState = useCallback(() => {
     try {
        if (ytPlayerRef.current) return ytPlayerRef.current.getPlayerState();
        if (htmlPlayerRef.current) return htmlPlayerRef.current.paused ? 2 : 1;
     } catch(e) {
        console.warn("Couldn't get player state", e);
     }
     return -1; // unstarted
  }, []);

  // --- Syncing Logic ---
  const handleStateChange = useCallback((newState: Partial<PlayerState>) => {
    if (canControl) {
      onPlayerStateChange(newState);
    }
  }, [canControl, onPlayerStateChange]);

  // Effect for syncing remote state to local player (for viewers)
  useEffect(() => {
    if (!isPlayerReady.current || !playerState) return;
    
    const newVolume = playerState.volume ?? 0.8;
    setVolume(newVolume);
    try {
        if (ytPlayerRef.current) ytPlayerRef.current.setVolume(newVolume * 100);
        if (htmlPlayerRef.current) htmlPlayerRef.current.volume = newVolume;
    } catch (e) {
        console.warn("Could not set volume", e);
    }
    
    if (canControl) return;

    let player: YouTubePlayer | HTMLVideoElement | null = null;
    let getStatus: () => number = () => -1;
    let play: () => void = () => {};
    let pause: () => void = () => {};
    let seek: (time: number) => void = () => {};
    let getCurrentTime: () => number = () => 0;

    if (urlType === 'youtube' && ytPlayerRef.current) {
        player = ytPlayerRef.current;
        getStatus = () => player!.getPlayerState();
        play = () => player!.playVideo();
        pause = () => player!.pauseVideo();
        seek = (time) => player!.seekTo(time, true);
        getCurrentTime = () => player!.getCurrentTime();
    } else if (urlType === 'direct' && htmlPlayerRef.current) {
        player = htmlPlayerRef.current;
        getStatus = () => player!.paused ? 2 : 1;
        play = () => player!.play().catch(console.error);
        pause = () => player!.pause();
        seek = (time) => { player!.currentTime = time; };
        getCurrentTime = () => player!.currentTime;
    }

    if (!player) return;

    try {
        const playerStatus = getStatus();

        if (playerState.isPlaying && playerStatus !== 1 && playerStatus !== 3) {
            play();
        } else if (!playerState.isPlaying && playerStatus === 1) {
            pause();
        }

        const hostTime = playerState.seekTime + (playerState.isPlaying ? (Date.now() - playerState.timestamp) / 1000 : 0);
        const currentTime = getCurrentTime();
        
        // This is the Instant Sync logic.
        // It directly seeks to the calculated host time if the deviation is noticeable.
        // A small threshold prevents jerky corrections on minor network latency.
        if (Math.abs(currentTime - hostTime) > 1.5 && !isSeekingRef.current) {
          isSeekingRef.current = true;
          console.log(`Instant Sync: local=${currentTime.toFixed(2)}s, host=${hostTime.toFixed(2)}s, diff=${(currentTime - hostTime).toFixed(2)}s`);
          seek(hostTime);
          setTimeout(() => { isSeekingRef.current = false; }, 500); // Prevent rapid-fire seeking
        }
    } catch (e) {
        console.warn("Error syncing player state:", e);
    }
  }, [playerState, canControl, urlType]);

  useEffect(() => {
    let progressInterval: NodeJS.Timeout | null = null;
    const updateProgress = () => {
        if (!isPlayerReady.current || !playerState) return;

        const time = getCurrentPlayerTime();
        if (time !== null && !isNaN(time) && time <= duration) {
            setProgress(time);
        }
    };
    
    if (playerState?.isPlaying) {
      progressInterval = setInterval(updateProgress, 500);
    }
    
    return () => {
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [playerState?.isPlaying, duration, getCurrentPlayerTime, playerState]);
  
  useEffect(() => {
    if (playerState && duration > 0) {
        const initialProgress = playerState.seekTime + (playerState.isPlaying ? (Date.now() - playerState.timestamp) / 1000 : 0);
        if (initialProgress <= duration && initialProgress >= 0) {
             setProgress(initialProgress);
        }
    }
  }, [playerState, duration]);

  const seek = useCallback((amount: number) => {
    if (!canControl || !isPlayerReady.current || !duration) return;
    const currentTime = getCurrentPlayerTime();
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
    handleStateChange({ seekTime: newTime });
    
    setTimeout(() => { isSeekingRef.current = false; }, 500);
  }, [canControl, handleStateChange, duration, getCurrentPlayerTime]);

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
      handleStateChange({ seekTime: newTime });
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
        handleStateChange({ volume: vol });
    }
  };
  
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

    if (playerState && playerState.seekTime < ytDuration) {
        const initialSeekTime = canControl || !playerState.isPlaying
            ? playerState.seekTime
            : playerState.seekTime + (Date.now() - playerState.timestamp) / 1000;
        
        event.target.seekTo(Math.min(initialSeekTime, ytDuration), true);
        if (playerState.isPlaying) event.target.playVideo();
        else event.target.pauseVideo();
    }
  };

  const onYtStateChange = (event: { data: number }) => {
    if (!canControl || isSeekingRef.current) return;
    
    const currentTime = ytPlayerRef.current?.getCurrentTime();
    if (currentTime === undefined) return;

    if (event.data === 1) { // Playing
      if (!playerState?.isPlaying) {
        handleStateChange({ isPlaying: true, seekTime: currentTime });
      }
    } else if (event.data === 2) { // Paused
       if (playerState?.isPlaying) {
        handleStateChange({ isPlaying: false, seekTime: currentTime });
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

    if (playerState && playerState.seekTime < htmlDuration) {
        const initialSeekTime = canControl || !playerState.isPlaying
            ? playerState.seekTime
            : playerState.seekTime + (Date.now() - playerState.timestamp) / 1000;
        
        htmlPlayerRef.current.currentTime = Math.min(initialSeekTime, htmlDuration);
        if (playerState.isPlaying) htmlPlayerRef.current.play().catch(console.error);
        else htmlPlayerRef.current.pause();
    }
  };
  
  const onHtmlStateChange = () => {
      if (!canControl || isSeekingRef.current || !htmlPlayerRef.current) return;
      
      const isPlaying = !htmlPlayerRef.current.paused;
      if (playerState?.isPlaying !== isPlaying) {
          handleStateChange({ isPlaying: isPlaying, seekTime: htmlPlayerRef.current.currentTime });
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
            return (
                <YouTube
                  key={`${videoId}-${quality}`}
                  videoId={videoId}
                  opts={{
                    height: '100%',
                    width: '100%',
                    playerVars: {
                      autoplay: playerState?.isPlaying ? 1 : 0,
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
            return (
                <video
                    ref={htmlPlayerRef}
                    src={videoUrl}
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
            "absolute inset-0 z-20 flex flex-col justify-between p-2 md:p-4 bg-black/30 transition-opacity duration-300",
            showControls ? "opacity-100" : "opacity-0"
        )}
        onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to the parent
      >
        <div></div>

        <div className="flex items-center justify-center">
           {canControl && (
            <Button onClick={togglePlay} size="icon" variant="ghost" className="text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 md:w-20 md:h-20">
                {playerState?.isPlaying ? <Pause className="w-8 h-8 md:w-12 md:h-12" /> : <Play className="w-8 h-8 md:w-12 md:h-12" />}
            </Button>
           )}
        </div>

        <div className="flex items-center gap-2 md:gap-4 text-white font-mono text-sm">
           {canControl ? (
            <>
               <span className="text-xs md:text-sm">{formatTime(progress)}</span>
               <Slider
                    value={[progress]}
                    max={duration}
                    step={1}
                    onValueChange={handleSliderChange}
                    onValueCommit={handleSliderCommit}
                />
               <span className="text-xs md:text-sm">{formatTime(duration)}</span>
            </>
           ) : (
             <>
               <span className="text-xs md:text-sm">{formatTime(progress)}</span>
               <div className="w-full h-2 bg-secondary/50 rounded-full relative overflow-hidden">
                 <div className="absolute h-full bg-primary" style={{ width: `${(progress / duration) * 100}%`}}></div>
               </div>
               <span className="text-xs md:text-sm">{formatTime(duration)}</span>
            </>
           )}
           
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white h-8 w-8 md:h-10 md:w-10">
                        <VolumeIcon className="w-5 h-5 md:w-6 md:h-6" />
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

            {urlType === 'youtube' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white h-8 w-8 md:h-10 md:w-10">
                    <Settings className="w-5 h-5 md:w-6 md:h-6" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-auto p-2 bg-black/50 border-none">
                  <RadioGroup value={quality} onValueChange={(value) => setQuality(value)} className="text-white text-sm">
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
