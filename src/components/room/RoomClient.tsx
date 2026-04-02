'use client';

import { useEffect, useState, useMemo, FormEvent, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { database } from '@/lib/firebase';
import { ref, onValue, set, onDisconnect, serverTimestamp, get, goOnline, goOffline, runTransaction, update, off, Unsubscribe, remove, push } from 'firebase/database';
import useUserSession from '@/hooks/use-user-session';
import Player from './Player';
import { ChatMessages, ChatInput, ChatHeader } from './Chat';
import type { Message } from './Chat';
import ViewerInfo from './ViewerInfo';
import { Button } from '../ui/button';
import { Loader2, MoreVertical, Search, History, X, Youtube, LogOut, Video, Film, Users, Send, Play, Clapperboard, Plus, ListMusic, Wallpaper, Check, Lock, Unlock, Settings, Edit, Clock, EyeOff, Copy, Gift } from 'lucide-react';
import { AudioConference, useLiveKitRoom, useLocalParticipant, useParticipants } from '@livekit/components-react';
import LiveKitRoom from './LiveKitRoom';
import Seats from './Seats';
import { searchYoutube, YouTubeVideo } from '@/ai/flows/youtube-search-flow';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '../ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { PlaceHolderImages, ImagePlaceholder } from '@/lib/placeholder-images';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../ui/dropdown-menu';
import VideoConference from './VideoConference';
import { AppUser, getFriends, sendRoomInvitation, getFriendRequests, areFriends, createRoom, sendGift } from '@/lib/firebase-service';
import YouTube, { YouTubePlayer } from 'react-youtube';
import Playlist, { PlaylistItem } from './Playlist';
import { cn } from '@/lib/utils';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Switch } from '../ui/switch';
import { useIsMobile } from '@/hooks/use-mobile';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import GiftShopDialog from './GiftShopDialog';
import GiftAnimationOverlay from './GiftAnimationOverlay';
import { Gifts } from '@/lib/gifts';
import { getCachedState, setCachedState } from '@/lib/cache-utils';

/**
 * TECHNICAL ANALYSIS - ROOM ARCHITECTURE (PHASE 2: CACHING LAYER)
 * -------------------------------------------------------------
 * Implementation of a non-blocking cache layer using getCachedState and setCachedState.
 * Goal: Instant UI responsiveness and resilience to network drops.
 */

const NumericKeypad = ({ pin, onPinChange, pinLength }: { pin: string, onPinChange: (pin: string) => void; pinLength: number }) => {
    const handleKeyClick = (key: string) => {
        let newPin = pin;
        if (key === 'backspace') newPin = newPin.slice(0, -1);
        else if (pin.length < pinLength) newPin += key;
        onPinChange(newPin);
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="flex gap-3">
                {Array.from({ length: pinLength }).map((_, i) => (
                    <div key={i} className={`w-10 h-12 rounded-md border-2 flex items-center justify-center text-2xl ${pin.length > i ? 'bg-accent/30 border-accent' : 'bg-input'}`}>
                       {pin.length > i ? '•' : ''}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
                {[...Array(9).keys()].map(i => i + 1).map(num => (
                    <Button key={num} variant="outline" className="w-16 h-16 text-2xl" onClick={() => handleKeyClick(num.toString())}>{num}</Button>
                ))}
                <div />
                <Button variant="outline" className="w-16 h-16 text-2xl" onClick={() => handleKeyClick('0')}>0</Button>
                <Button variant="outline" className="w-16 h-16 text-2xl" onClick={() => handleKeyClick('backspace')}>⌫</Button>
            </div>
        </div>
    );
};

export type Member = { 
  name: string;
  avatarId?: string;
  joinedAt: any; 
};

export type SeatedMember = {
    name: string;
    avatarId?: string;
    seatId: number;
}

export type PlayerState = {
    isPlaying: boolean;
    seekTime: number;
    timestamp: number;
    volume: number;
    quality: string;
}

const RoomHeader = ({ onSearchClick, onPlaylistClick, roomId, onLeaveRoom, onSwitchToVideo, onSwitchToPlayer, videoMode, onInviteClick, onSettingsClick, roomName, hostName, canControl }: { onSearchClick: () => void; onPlaylistClick: () => void; roomId: string; onLeaveRoom: () => void, onSwitchToVideo: () => void; onSwitchToPlayer: () => void; videoMode: boolean; onInviteClick: () => void; onSettingsClick: () => void; roomName?: string; hostName: string; canControl: boolean; }) => {
    const { user } = useUserSession();
    const avatar = PlaceHolderImages.find(p => p.id === user?.avatarId) ?? PlaceHolderImages[0];
    const [isCopied, setIsCopied] = useState(false);
    
    const handleCopy = () => {
        navigator.clipboard.writeText(roomId).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    }

    return (
        <header className="flex items-center justify-between p-2 md:p-4 w-full flex-shrink-0">
            <div className="flex items-center gap-1 md:gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <MoreVertical className="h-6 w-6 md:h-8 md:w-8" strokeWidth={2.5} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="bg-card/80 backdrop-blur-lg">
                         <DropdownMenuItem onClick={onInviteClick}>
                            <Users className="me-2" /> دعوة أصدقاء
                        </DropdownMenuItem>
                        {canControl && (
                            <DropdownMenuItem onClick={onSettingsClick}>
                                <Settings className="me-2"/> إعدادات الغرفة
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {videoMode ? (
                            <DropdownMenuItem onClick={onSwitchToPlayer}>
                                <Film className="me-2" /> العودة للمشاهدة
                            </DropdownMenuItem>
                        ) : (
                            <DropdownMenuItem onClick={onSwitchToVideo}>
                                <Video className="me-2" /> مكالمة فيديو
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={onLeaveRoom} className="text-destructive">
                            <LogOut className="me-2" /> مغادرة الغرفة
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {!videoMode && canControl && (
                <div className='flex items-center gap-1 md:gap-2'>
                    <Button onClick={onPlaylistClick} variant="outline" size="sm">
                        <ListMusic className="me-1 md:me-2" /> <span className='hidden sm:inline'>قائمة التشغيل</span>
                    </Button>
                    <Button onClick={onSearchClick} variant="outline" size="sm">
                        <Youtube className="me-1 md:me-2" /> <span className='hidden sm:inline'>إضافة فيديو</span>
                    </Button>
                </div>
            )}
            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                <div className='text-right'>
                    <p className='font-bold text-foreground truncate max-w-[100px] sm:max-w-xs'>{roomName || `غرفة ${hostName}`}</p>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button onClick={handleCopy} className="flex items-center gap-1 hover:text-accent transition-colors">
                                    <span>ID: {roomId}</span>
                                    {isCopied ? <Check className="w-3 h-3 text-green-500"/> : <Copy className="w-3 h-3"/>}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent><p>{isCopied ? 'تم النسخ!' : 'انسخ للمشاركة'}</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <Avatar className="h-8 w-8 md:h-10 md:h-10">
                    <AvatarImage src={avatar?.imageUrl} />
                    <AvatarFallback>{user?.name.charAt(0)}</AvatarFallback>
                </Avatar>
            </div>
        </header>
    )
}

const RoomLayout = ({ roomId, user, sendSystemMessage, roomPassword, onCorrectPassword, isPasswordChecked }: { roomId: string, user: NonNullable<ReturnType<typeof useUserSession>['user']>, sendSystemMessage: (text: string) => void, roomPassword?: string, onCorrectPassword: () => void, isPasswordChecked: boolean; }) => {
  const router = useRouter();
  const chatInputRef = useRef<HTMLInputElement>(null);
  
  // Logical state grouping with caching layer
  const [roomBasicInfo, setRoomBasicInfo] = useState(() => getCachedState(roomId, 'roomBasicInfo', { 
    name: '', 
    hostName: '', 
    moderators: [] as string[], 
    isPrivate: false, 
    background: null as string | null 
  }));

  const [videoState, setVideoState] = useState(() => getCachedState(roomId, 'videoState', { 
    url: '', 
    details: null as YouTubeVideo | null, 
    playlist: [] as PlaylistItem[], 
    mode: false 
  }));

  const [membersState, setMembersState] = useState(() => getCachedState(roomId, 'membersState', { 
    all: [] as Member[], 
    seated: [] as SeatedMember[] 
  }));

  const [playerState, setPlayerState] = useState<PlayerState | null>(() => getCachedState(roomId, 'playerState', null));
  
  const [auth, setAuth] = useState({ isAuthenticating: false, pinInput: '', pinError: false, isFullyAuthed: false });
  const [chatState, setChatState] = useState({ isSending: false, replyingTo: null as Message | null });
  const [dialogs, setDialogs] = useState({ search: false, playlist: false, background: false, settings: false, invite: false, giftShop: false });
  
  const [search, setSearch] = useState({ query: '', urlInput: '', results: [] as YouTubeVideo[], isSearching: false, error: null as string | null, history: [] as string[] });
  const [friendData, setFriendData] = useState({ friends: [] as AppUser[], requests: [] as AppUser[], invited: new Set<string>() });
  const [preview, setPreview] = useState({ video: null as YouTubeVideo | null, recentlyAdded: new Set<string>() });
  
  const [giftData, setGiftData] = useState({ target: '', stream: [] as any[] });
  const previewPlayerRef = useRef<YouTubePlayer | null>(null);

  const { room } = useLiveKitRoom();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();

  const isHost = user?.name === roomBasicInfo.hostName;
  const isModerator = roomBasicInfo.moderators.includes(user.name);
  const canControl = isHost || isModerator;

  const viewers = useMemo(() => {
    const seatedNames = new Set(membersState.seated.map(m => m.name));
    return membersState.all.filter(m => !seatedNames.has(m.name));
  }, [membersState.all, membersState.seated]);

  const isSeated = useMemo(() => membersState.seated.some(m => m.name === user.name), [membersState.seated, user.name]);
  
  const isMuted = useMemo(() => {
      const participant = [localParticipant, ...participants].find(p => p.identity === user?.name);
      return participant ? !participant.isMicrophoneEnabled : true;
  }, [localParticipant, participants, user?.name]);

  // Wake Lock for background playback persistence
  const wakeLockRef = useRef<any>(null);
  useEffect(() => {
    const handleWakeLock = async () => {
      if ('wakeLock' in navigator) {
        if (playerState?.isPlaying && !wakeLockRef.current) {
          try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (err) {}
        } else if (!playerState?.isPlaying && wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      }
    };
    handleWakeLock();
    return () => { if(wakeLockRef.current) wakeLockRef.current.release(); };
  }, [playerState?.isPlaying]);

  useEffect(() => { if (isPasswordChecked) setAuth(prev => ({ ...prev, isFullyAuthed: !roomPassword })); }, [isPasswordChecked, roomPassword]);

  useEffect(() => {
    const fetchFriends = async () => {
        if (!user) return;
        const [friendsList, requestsList] = await Promise.all([getFriends(user.name), getFriendRequests(user.name)]);
        setFriendData(prev => ({ ...prev, friends: friendsList, requests: requestsList }));
    };
    fetchFriends();
  }, [user]);

  const handlePinChange = (pin: string) => {
    setAuth(prev => ({ ...prev, pinInput: pin, pinError: false }));
    if (pin.length === 4) {
        if (pin === roomPassword) {
            onCorrectPassword();
            setAuth(prev => ({ ...prev, isFullyAuthed: true }));
        } else {
            setAuth(prev => ({ ...prev, pinError: true }));
            setTimeout(() => setAuth(prev => ({ ...prev, pinInput: '', pinError: false })), 800);
        }
    }
  }

  const handleLeaveRoom = async () => {
    if (!user) { router.push('/lobby'); return; }
    goOffline(database);
    const roomRef = ref(database, `rooms/${roomId}`);
    const membersRef = ref(database, `rooms/${roomId}/members`);
    const userSeat = membersState.seated.find(m => m.name === user.name);
    if (userSeat) await remove(ref(database, `rooms/${roomId}/seatedMembers/${userSeat.seatId}`));
    const membersSnapshot = await get(membersRef);
    if (membersSnapshot.exists() && Object.keys(membersSnapshot.val()).length <= 1) await remove(roomRef);
    else await remove(ref(database, `rooms/${roomId}/members/${user.name}`));
    router.push('/lobby');
  };
  
  useEffect(() => {
    let isMounted = true;
    const listeners: Unsubscribe[] = [];
    const setupListeners = async () => {
        const roomRef = ref(database, `rooms/${roomId}`);
        const roomSnapshot = await get(roomRef);
        if (!isMounted || !roomSnapshot.exists()) { if(isMounted) router.push('/lobby'); return; }
        
        const initialRoomData = roomSnapshot.val();
        setVideoState(prev => {
            const next = { ...prev, mode: initialRoomData.videoMode || false };
            setCachedState(roomId, 'videoState', next);
            return next;
        });

        listeners.push(onValue(ref(database, `rooms/${roomId}/members`), snap => {
            const val = snap.exists() ? Object.values(snap.val()) as Member[] : [];
            setMembersState(prev => {
                const next = { ...prev, all: val };
                setCachedState(roomId, 'membersState', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/seatedMembers`), snap => {
            const val = snap.exists() ? Object.values(snap.val()) as SeatedMember[] : [];
            setMembersState(prev => {
                const next = { ...prev, seated: val };
                setCachedState(roomId, 'membersState', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/videoUrl`), snap => {
            const val = snap.val() || '';
            setVideoState(prev => {
                const next = { ...prev, url: val };
                setCachedState(roomId, 'videoState', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/currentVideoDetails`), snap => {
            const val = snap.val() || null;
            setVideoState(prev => {
                const next = { ...prev, details: val };
                setCachedState(roomId, 'videoState', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/name`), snap => {
            const val = snap.val() || '';
            setRoomBasicInfo(prev => {
                const next = { ...prev, name: val };
                setCachedState(roomId, 'roomBasicInfo', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/isPrivate`), snap => {
            const val = snap.val() || false;
            setRoomBasicInfo(prev => {
                const next = { ...prev, isPrivate: val };
                setCachedState(roomId, 'roomBasicInfo', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/backgroundUrl`), snap => {
            const val = snap.val() || null;
            setRoomBasicInfo(prev => {
                const next = { ...prev, background: val };
                setCachedState(roomId, 'roomBasicInfo', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/playlist`), snap => {
            const val = snap.exists() ? Object.values(snap.val()) as PlaylistItem[] : [];
            setVideoState(prev => {
                const next = { ...prev, playlist: val };
                setCachedState(roomId, 'videoState', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/playerState`), snap => {
            const val = snap.val();
            setPlayerState(val);
            setCachedState(roomId, 'playerState', val);
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/host`), snap => {
            const val = snap.val() || '';
            setRoomBasicInfo(prev => {
                const next = { ...prev, hostName: val };
                setCachedState(roomId, 'roomBasicInfo', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/moderators`), snap => {
            const val = snap.val() || [];
            setRoomBasicInfo(prev => {
                const next = { ...prev, moderators: val };
                setCachedState(roomId, 'roomBasicInfo', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/videoMode`), snap => {
            const val = snap.val() || false;
            setVideoState(prev => {
                const next = { ...prev, mode: val };
                setCachedState(roomId, 'videoState', next);
                return next;
            });
        }));

        listeners.push(onValue(ref(database, `rooms/${roomId}/giftStream`), snap => {
            if (snap.exists()) {
                const allGifts = Object.values(snap.val());
                setGiftData(prev => ({ ...prev, stream: allGifts }));
            }
        }));
    };
    setupListeners();
    return () => { isMounted = false; listeners.forEach(unsub => unsub()); };
  }, [roomId, router]);

  // Heartbeat - Ensure room clock advances regardless of host activity
  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    if (canControl && playerState?.isPlaying) {
        heartbeatInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                runTransaction(ref(database, `rooms/${roomId}/playerState`), (curr: PlayerState | null) => {
                    if (curr && curr.isPlaying) return { ...curr, timestamp: serverTimestamp() };
                    return curr;
                }).catch(() => {});
            }
        }, 5000);
    }
    return () => { if(heartbeatInterval) clearInterval(heartbeatInterval); };
  }, [canControl, playerState?.isPlaying, roomId]);

  useEffect(() => {
      if(typeof window !== 'undefined') {
          const stored = localStorage.getItem('youtubeSearchHistory');
          if (stored) setSearch(prev => ({ ...prev, history: JSON.parse(stored) }));
      }
  }, []);

  const handleTakeSeat = (seatId: number) => {
      const seatRef = ref(database, `rooms/${roomId}/seatedMembers/${seatId}`);
      const currentUserSeat = membersState.seated.find(m => m.name === user.name);
      runTransaction(seatRef, (curr) => {
          if (curr === null) {
              if (currentUserSeat) set(ref(database, `rooms/${roomId}/seatedMembers/${currentUserSeat.seatId}`), null);
              return { name: user.name, avatarId: user.avatarId || 'avatar1', seatId };
          }
          return; 
      }).catch(() => {});
  };

  const handleLeaveSeat = () => {
      const currentUserSeat = membersState.seated.find(m => m.name === user.name);
      if (currentUserSeat) set(ref(database, `rooms/${roomId}/seatedMembers/${currentUserSeat.seatId}`), null);
  };

  const handleSendMessage = async (text: string) => {
        if (chatState.isSending) return;
        setChatState(prev => ({ ...prev, isSending: true }));
        try {
            const newMsgRef = push(ref(database, `rooms/${roomId}/chat`));
            const msg: Message = { id: newMsgRef.key!, sender: user.name, text, timestamp: serverTimestamp() as any };
            if (chatState.replyingTo) { msg.quotedMessage = chatState.replyingTo.text; msg.quotedSender = chatState.replyingTo.sender; }
            await set(newMsgRef, msg);
            setChatState(prev => ({ ...prev, replyingTo: null, isSending: false }));
            chatInputRef.current?.blur();
        } catch(e) { setChatState(prev => ({ ...prev, isSending: false })); }
    };

  const performSearch = async (query: string) => {
      if (!query.trim() || !canControl) return;
      setSearch(prev => ({ ...prev, isSearching: true, error: null, results: [] }));
      try {
        const results = await searchYoutube({ query: query.trim() });
        setSearch(prev => {
            const newHistory = [query.trim(), ...prev.history.filter(h => h.toLowerCase() !== query.trim().toLowerCase())].slice(0, 10);
            localStorage.setItem('youtubeSearchHistory', JSON.stringify(newHistory));
            return { ...prev, results: results.items, history: newHistory, isSearching: false };
        });
      } catch (e: any) {
          setSearch(prev => ({ ...prev, isSearching: false, error: e.message || "Search failed" }));
      }
  };

  const onSetVideo = useCallback((videoIdentifier: string, startTime = 0, videoDetails?: YouTubeVideo) => {
    if (canControl) {
      const updates: any = {};
      updates[`/rooms/${roomId}/videoUrl`] = videoIdentifier;
      updates[`/rooms/${roomId}/currentVideoDetails`] = videoDetails || null;
      updates[`/rooms/${roomId}/playerState`] = { 
        isPlaying: !!videoIdentifier, seekTime: startTime, timestamp: serverTimestamp(),
        volume: playerState?.volume ?? 0.8, quality: playerState?.quality ?? 'auto'
      };
      update(ref(database), updates);
    }
  }, [canControl, roomId, playerState?.volume, playerState?.quality]);
  
  const handlePlayerStateChange = useCallback((newState: Partial<PlayerState>) => {
    if (!canControl) return;
    runTransaction(ref(database, `rooms/${roomId}/playerState`), (curr: PlayerState | null) => {
        const c = curr || { isPlaying: false, seekTime: 0, volume: 0.8, quality: 'auto', timestamp: Date.now() };
        const updated = { ...c, ...newState };
        const shouldStamp = (newState.isPlaying !== undefined && newState.isPlaying !== c.isPlaying) || newState.seekTime !== undefined;
        return shouldStamp ? { ...updated, timestamp: serverTimestamp() } : updated;
    });
  }, [canControl, roomId]);

  const handleAddToPlaylistFromSearch = (video: YouTubeVideo) => {
      const newItem: PlaylistItem = { id: video.id.videoId, videoId: video.id.videoId, title: video.snippet.title, thumbnail: video.snippet.high.url };
      set(ref(database, `rooms/${roomId}/playlist/${btoa(newItem.id)}`), newItem);
      setPreview(prev => ({ ...prev, recentlyAdded: new Set(prev.recentlyAdded).add(video.id.videoId) }));
      setTimeout(() => setPreview(prev => { const n = new Set(prev.recentlyAdded); n.delete(video.id.videoId); return { ...prev, recentlyAdded: n }; }), 2000);
  };
  
  const handlePlayFromPlaylist = async (vId: string) => {
    try {
        const results = await searchYoutube({ query: vId });
        const details = results.items.find(item => item.id.videoId === vId);
        onSetVideo(vId, 0, details);
    } catch(e) { onSetVideo(vId); }
    setDialogs(prev => ({ ...prev, playlist: false }));
  };

  const handleVideoEnded = () => {
    if (!canControl) return;
    const currentVidId = videoState.url.match(/^[a-zA-Z0-9_-]{11}$/) ? videoState.url : (new URL(videoState.url).searchParams.get('v'));
    const idx = videoState.playlist.findIndex(item => item.videoId === currentVidId);
    if (idx !== -1 && idx + 1 < videoState.playlist.length) handlePlayFromPlaylist(videoState.playlist[idx + 1].videoId);
    else onSetVideo('');
  };

  if (!auth.isFullyAuthed) {
    return (
        <Dialog open={true} onOpenChange={(open) => !open && router.push('/lobby')}>
            <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle className="text-center text-2xl">الغرفة مقفلة</DialogTitle><DialogDescription className="text-center">أدخل كلمة المرور المكونة من 4 أرقام.</DialogDescription></DialogHeader>
                <div className={cn("flex justify-center", auth.pinError && 'animate-shake')}><NumericKeypad pin={auth.pinInput} onPinChange={handlePinChange} pinLength={4} /></div>
                <DialogFooter><Button variant="outline" onClick={() => router.push('/lobby')}>العودة للردهة</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
  }

  return (
    <div className="relative flex flex-col w-full bg-background overflow-hidden h-screen">
        {roomBasicInfo.background && (
            <div className="absolute inset-0 z-0">
                <Image src={roomBasicInfo.background} alt="BG" fill className="object-cover" />
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            </div>
        )}
        <GiftAnimationOverlay latestGift={giftData.stream[giftData.stream.length - 1]} currentUser={user.name} />
        <div className="relative z-10 flex h-full w-full flex-col">
             <RoomHeader 
                onSearchClick={() => setDialogs(prev => ({...prev, search: true}))} onPlaylistClick={() => setDialogs(prev => ({...prev, playlist: true}))}
                roomId={roomId} onLeaveRoom={handleLeaveRoom} onSwitchToVideo={() => onSetVideo('', 0)} 
                onSwitchToPlayer={() => setVideoState(p => ({...prev, mode: false}))} videoMode={videoState.mode}
                onInviteClick={() => setDialogs(prev => ({...prev, invite: true}))} onSettingsClick={() => setDialogs(prev => ({...prev, settings: true}))}
                roomName={roomBasicInfo.name} hostName={roomBasicInfo.hostName} canControl={canControl}
            />
            <main className="w-full max-w-7xl mx-auto flex h-full flex-col gap-2 md:gap-4 px-2 md:px-4 flex-1 min-h-0">
                  {videoState.mode ? <div className="flex-grow rounded-lg overflow-hidden h-full"><VideoConference /></div> : (
                      <>
                          <div className="flex-shrink-0"><Player videoUrl={videoState.url} onSetVideo={onSetVideo} canControl={canControl} onSearchClick={() => setDialogs(p => ({...p, search: true}))} playerState={playerState} onPlayerStateChange={handlePlayerStateChange} onVideoEnded={handleVideoEnded} videoDetails={videoState.details} /></div>
                          <div className="flex-shrink-0"><Seats seatedMembers={membersState.seated} hostName={roomBasicInfo.hostName} moderators={roomBasicInfo.moderators} onTakeSeat={handleTakeSeat} onLeaveSeat={handleLeaveSeat} currentUser={user} isHost={isHost} onKickUser={() => {}} onPromote={() => {}} onDemote={() => {}} onTransferHost={() => {}} room={room as any} currentUserFriends={friendData.friends} currentUserRequests={friendData.requests} onSendGift={(t) => { setGiftData(p => ({...p, target: t})); setDialogs(p => ({...p, giftShop: true})); }} /></div>
                          <div className="flex-shrink-0 mt-2 md:mt-4"><ViewerInfo members={viewers} /></div>
                          <div className="flex-grow flex flex-col bg-transparent rounded-t-lg min-h-0 mt-2 md:mt-4"><ChatHeader isHost={isHost} roomId={roomId} /><div className="flex-grow min-h-0 pb-20"><ChatMessages roomId={roomId} user={user} onReply={(m) => setChatState(p => ({...p, replyingTo: m}))} /></div></div>
                      </>
                  )}
            </main>
             <footer className="fixed bottom-0 left-0 right-0 z-20"><ChatInput roomId={roomId} user={user} isSeated={isSeated} isMuted={isMuted} onToggleMute={() => localParticipant?.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)} inputRef={chatInputRef} onFocus={() => {}} onBlur={() => {}} onSend={handleSendMessage} isSending={chatState.isSending} replyingTo={chatState.replyingTo} onCancelReply={() => setChatState(p => ({...p, replyingTo: null}))} onOpenGiftShop={() => { setGiftData(p => ({...p, target: ''})); setDialogs(p => ({...p, giftShop: true})); }} /></footer>
        </div>
        <div className="hidden"><AudioConference /></div>
    
    <GiftShopDialog isOpen={dialogs.giftShop} onOpenChange={(o) => setDialogs(p => ({...p, giftShop: o}))} recipientName={giftData.target} onSendGift={async (r, g) => { await sendGift(user.name, r, g, roomId); const gift = Gifts.find(x => x.id === g); if(gift) sendSystemMessage(`🎁 ${user.name} أرسل ${gift.name} إلى ${r}`); }} seatedMembers={membersState.seated} />
    <Dialog open={dialogs.invite} onOpenChange={(o) => setDialogs(p => ({...p, invite: o}))}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>دعوة أصدقاء</DialogTitle></DialogHeader><div className="space-y-3 max-h-80 overflow-y-auto mt-4">{friendData.friends.length > 0 ? friendData.friends.map(f => <div key={f.name} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30"><div className="flex items-center gap-3"><Avatar className="h-10 w-10"><AvatarImage src={PlaceHolderImages.find(p => p.id === f.avatarId)?.imageUrl} /></Avatar><span className="font-semibold">{f.name}</span></div><Button size="sm" onClick={async () => { await sendRoomInvitation(user.name, f.name, roomId, roomBasicInfo.name); setFriendData(p => ({...p, invited: new Set(p.invited).add(f.name)})); }} disabled={friendData.invited.has(f.name)}>{friendData.invited.has(f.name) ? "تمت الدعوة" : "دعوة"}</Button></div>) : <p className="text-center text-muted-foreground py-4">لا يوجد أصدقاء.</p>}</div></DialogContent></Dialog>
    <Dialog open={dialogs.playlist} onOpenChange={(o) => setDialogs(p => ({...p, playlist: o}))}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>قائمة التشغيل</DialogTitle></DialogHeader><Playlist items={videoState.playlist} canControl={canControl} onPlay={handlePlayFromPlaylist} onRemove={(id) => remove(ref(database, `rooms/${roomId}/playlist/${btoa(id)}`))} currentVideoUrl={videoState.url} /><DialogFooter><Button variant="outline" onClick={() => setDialogs(p => ({...p, playlist: false}))}>إغلاق</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialogs.search} onOpenChange={(o) => setDialogs(p => ({...p, search: o}))}><DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0"><DialogHeader className="p-6 pb-4 border-b"><DialogTitle>البحث عن فيديو</DialogTitle></DialogHeader><div className="p-6 flex gap-4"><form onSubmit={(e) => { e.preventDefault(); performSearch(search.query); }} className="flex-1 flex gap-2"><Input placeholder="يوتيوب..." value={search.query} onChange={(e) => setSearch(p => ({...p, query: e.target.value}))} className="bg-input" /><Button type="submit">{search.isSearching ? <Loader2 className="animate-spin" /> : <Search />}</Button></form></div><div className="flex-grow overflow-y-auto px-6 pb-6">{search.results.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{search.results.map(v => <div key={v.id.videoId} className="group cursor-pointer" onClick={() => setPreview(p => ({...p, video: v}))}><div className="relative aspect-video rounded-lg overflow-hidden mb-2"><Image src={v.snippet.thumbnails.high.url} alt="V" fill className="object-cover" /></div><h3 className="font-semibold text-sm line-clamp-2">{v.snippet.title}</h3><Button onClick={(e) => { e.stopPropagation(); handleAddToPlaylistFromSearch(v); }} variant="secondary" size="sm" className="w-full mt-2">{preview.recentlyAdded.has(v.id.videoId) ? "تمت الإضافة" : "إضافة للقائمة"}</Button></div>)}</div>}</div></DialogContent></Dialog>
    {preview.video && <Dialog open={true} onOpenChange={() => setPreview(p => ({...p, video: null}))}><DialogContent className="max-w-4xl w-full"><DialogHeader><DialogTitle>{preview.video.snippet.title}</DialogTitle></DialogHeader><div className="aspect-video bg-black rounded-lg overflow-hidden"><YouTube videoId={preview.video.id.videoId} opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }} onReady={e => previewPlayerRef.current = e.target} className="w-full h-full" /></div><div className="flex gap-2"><Button onClick={() => handleAddToPlaylistFromSearch(preview.video!)} variant="secondary" className="w-full">إضافة للقائمة</Button><Button onClick={() => { onSetVideo(preview.video!.id.videoId, previewPlayerRef.current?.getCurrentTime() || 0, preview.video!); setPreview(p => ({...p, video: null})); setDialogs(p => ({...p, search: false})); }} className="w-full">عرض الآن</Button></div></DialogContent></Dialog>}
</div>
  );
}

const RoomClient = ({ roomId }: { roomId: string }) => {
  const router = useRouter();
  const { user, isLoaded } = useUserSession();
  const [roomData, setRoomData] = useState(() => ({ 
    token: '', 
    password: undefined as string | undefined, 
    checked: false, 
    seated: false, 
    videoMode: getCachedState(roomId, 'videoMode', false)
  }));
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  
  useEffect(() => {
    if (!isLoaded || !user) return;
    const listeners = [
        onValue(ref(database, `rooms/${roomId}/seatedMembers`), snap => setRoomData(p => ({ ...p, seated: snap.exists() && Object.values(snap.val()).some((m: any) => m.name === user.name) }))),
        onValue(ref(database, `rooms/${roomId}/videoMode`), snap => {
            const val = snap.val() || false;
            setRoomData(p => ({ ...p, videoMode: val }));
            setCachedState(roomId, 'videoMode', val);
        })
    ];
    return () => listeners.forEach(off);
  }, [isLoaded, user, roomId]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) { router.push('/'); return; }
    let active = true;
    const setup = async () => {
      try {
        const snap = await get(ref(database, `rooms/${roomId}`));
        if (!active) return;
        if (!snap.exists()) { router.push('/lobby'); return; }
        const data = snap.val();
        setRoomData(p => ({ ...p, password: data.password, checked: true }));
        
        onValue(ref(database, '.info/connected'), s => {
          if (s.val() === true) {
            goOnline(database);
            const mRef = ref(database, `rooms/${roomId}/members/${user.name}`);
            set(mRef, { name: user.name, avatarId: user.avatarId || 'avatar1', joinedAt: serverTimestamp() });
            onDisconnect(mRef).remove();
            const pRef = ref(database, `presence/${user.name}`);
            set(pRef, { status: 'online', lastChanged: serverTimestamp() });
            onDisconnect(pRef).set({ status: 'offline', lastChanged: serverTimestamp() });
          }
        });

        const res = await fetch(`/api/livekit?room=${roomId}&username=${user.name}`);
        const tokenData = await res.json();
        if (active) setRoomData(p => ({ ...p, token: tokenData.token }));
      } catch (e) { console.error("Setup error", e); }
    };
    setup();
    return () => { active = false; };
  }, [isLoaded, user, roomId, router]);

  if (!isLoaded || !user || !roomData.checked) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-16 w-16 animate-spin text-accent" /></div>;
  if (!livekitUrl) return <div className="flex h-screen items-center justify-center text-center p-4 bg-background"><div className='max-w-md bg-card/50 p-8 rounded-lg border border-destructive'><h1 className="text-2xl font-bold text-destructive mb-4">خطأ إعدادات</h1><p>LIVEKIT_URL مفقود.</p><Button onClick={() => router.push('/lobby')} className="mt-6 w-full">العودة للردهة</Button></div></div>;
  if (!roomData.token) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-16 w-16 animate-spin text-accent" /><p className="ms-4 text-muted-foreground">تهيئة...</p></div>;

  return (
    <LiveKitRoom token={roomData.token} serverUrl={livekitUrl} user={user} isSeated={roomData.seated} videoMode={roomData.videoMode}>
      <RoomLayout roomId={roomId} user={user} sendSystemMessage={() => {}} roomPassword={roomData.password} onCorrectPassword={() => setRoomData(p => ({ ...p, password: undefined }))} isPasswordChecked={roomData.checked} />
    </LiveKitRoom>
  );
};

export default RoomClient;
