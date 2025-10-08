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
import { Loader2, MoreVertical, Search, History, X, Youtube, LogOut, Video, Film, Users, Send, Play, Clapperboard, Plus, ListMusic, Wallpaper, Check, Lock, Unlock, Settings, Edit, Clock, EyeOff } from 'lucide-react';
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
import { AppUser, getFriends, sendRoomInvitation, getFriendRequests, areFriends, createRoom } from '@/lib/firebase-service';
import YouTube, { YouTubePlayer } from 'react-youtube';
import Playlist, { PlaylistItem } from './Playlist';
import { cn } from '@/lib/utils';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Switch } from '../ui/switch';

const NumericKeypad = ({ pin, onPinChange, pinLength }: { pin: string, onPinChange: (pin: string) => void; pinLength: number }) => {

    const handleKeyClick = (key: string) => {
        let newPin = pin;
        if (key === 'backspace') {
            newPin = newPin.slice(0, -1);
        } else if (pin.length < pinLength) {
            newPin += key;
        }
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
  joinedAt: any; // Can be a server timestamp object or a number
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
}

const RoomHeader = ({ onSearchClick, onPlaylistClick, roomId, onLeaveRoom, onSwitchToVideo, onSwitchToPlayer, videoMode, onInviteClick, onSettingsClick, roomName, hostName, canControl }: { onSearchClick: () => void; onPlaylistClick: () => void; roomId: string; onLeaveRoom: () => void, onSwitchToVideo: () => void; onSwitchToPlayer: () => void; videoMode: boolean; onInviteClick: () => void; onSettingsClick: () => void; roomName?: string; hostName: string; canControl: boolean; }) => {
    const { user } = useUserSession();
    const avatar = PlaceHolderImages.find(p => p.id === user?.avatarId) ?? PlaceHolderImages[0];

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
                            <Users className="me-2" />
                            دعوة أصدقاء
                        </DropdownMenuItem>
                        {canControl && (
                            <DropdownMenuItem onClick={onSettingsClick}>
                                <Settings className="me-2"/>
                                إعدادات الغرفة
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
                        <ListMusic className="me-1 md:me-2" />
                        <span className='hidden sm:inline'>قائمة التشغيل</span>
                    </Button>
                    <Button onClick={onSearchClick} variant="outline" size="sm">
                        <Youtube className="me-1 md:me-2" />
                         <span className='hidden sm:inline'>إضافة فيديو</span>
                    </Button>
                </div>
            )}
            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                <div className='text-right'>
                    <p className='font-bold text-foreground truncate max-w-[100px] sm:max-w-xs'>{roomName || `غرفة ${hostName}`}</p>
                    <p>ID: {roomId.slice(0,10)}...</p>
                </div>
                <Avatar className="h-8 w-8 md:h-10 md:w-10">
                    <AvatarImage src={avatar?.imageUrl} />
                    <AvatarFallback>{user?.name.charAt(0)}</AvatarFallback>
                </Avatar>
            </div>
        </header>
    )
}

const RoomLayout = ({ roomId, user, sendSystemMessage, roomPassword, onCorrectPassword, isPasswordChecked }: { roomId: string, user: NonNullable<ReturnType<typeof useUserSession>['user']>, sendSystemMessage: (text: string) => void, roomPassword?: string, onCorrectPassword: () => void, isPasswordChecked: boolean; }) => {
  const router = useRouter();
  
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [seatedMembers, setSeatedMembers] = useState<SeatedMember[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [hostName, setHostName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [moderators, setModerators] = useState<string[]>([]);
  const [roomBackground, setRoomBackground] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  
  const [videoMode, setVideoMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isBackgroundOpen, setIsBackgroundOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [searchResults, setResults] = useState<YouTubeVideo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [friends, setFriends] = useState<AppUser[]>([]);
  const [invitedFriends, setInvitedFriends] = useState<Set<string>>(new Set());
  
  const [previewVideo, setPreviewVideo] = useState<YouTubeVideo | null>(null);
  const previewPlayerRef = useRef<YouTubePlayer | null>(null);
  const [recentlyAddedToPlaylist, setRecentlyAddedToPlaylist] = useState<Set<string>>(new Set());

  
  // Room settings state
  const [tempRoomName, setTempRoomName] = useState('');
  const [tempPin, setTempPin] = useState('');
  const [tempIsPrivate, setTempIsPrivate] = useState(false);

  
  const { room } = useLiveKitRoom();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();

  const isHost = user?.name === hostName;
  const isModerator = user ? moderators.includes(user.name) : false;
  const canControl = isHost || isModerator;

  const viewers = useMemo(() => {
    const seatedNames = new Set(seatedMembers.map(m => m.name));
    return allMembers.filter(m => !seatedNames.has(m.name));
  }, [allMembers, seatedMembers]);

  const isSeated = useMemo(() => {
    return seatedMembers.some(m => m.name === user.name);
  }, [seatedMembers, user]);
  
  const isMuted = useMemo(() => {
      const participant = [localParticipant, ...participants].find(p => p.identity === user?.name);
      return participant ? !participant.isMicrophoneEnabled : true;
  }, [localParticipant, participants, user?.name]);

  const [friendData, setFriendData] = useState<{ friends: AppUser[]; requests: AppUser[] }>({ friends: [], requests: [] });

  useEffect(() => {
      if (isPasswordChecked) {
          setIsAuthenticated(!roomPassword);
      }
  }, [isPasswordChecked, roomPassword]);

  useEffect(() => {
    const fetchFriendData = async () => {
        if (!user) return;
        const [friendsList, requestsList] = await Promise.all([
            getFriends(user.name),
            getFriendRequests(user.name)
        ]);
        setFriendData({ friends: friendsList, requests: requestsList });
    };
    fetchFriendData();
  }, [user]);

  const handlePinChange = (pin: string) => {
    setPinInput(pin);
    setPinError(false);
    if (pin.length === 4) {
        if (pin === roomPassword) {
            onCorrectPassword();
            setIsAuthenticated(true);
        } else {
            console.error("كلمة المرور غير صحيحة.");
            setPinError(true);
            setTimeout(() => {
                setPinInput('');
                setPinError(false);
            }, 800);
        }
    }
  }

  const handleLeaveRoom = () => {
    router.push('/lobby');
  };
  
  useEffect(() => {
    let isMounted = true;
    const listeners: Unsubscribe[] = [];

    const setupListeners = async () => {
        const roomRef = ref(database, `rooms/${roomId}`);
        const roomSnapshot = await get(roomRef);
        if (!isMounted) return;

        if (!roomSnapshot.exists()) {
          console.error('الغرفة غير موجودة. تمت إعادة توجيهك إلى الردهة.');
          router.push('/lobby');
          return;
        }
        
        const initialRoomData = roomSnapshot.val();
        setVideoMode(initialRoomData.videoMode || false);

        const membersRef = ref(database, `rooms/${roomId}/members`);
        listeners.push(onValue(membersRef, (snapshot) => setAllMembers(snapshot.exists() ? Object.values(snapshot.val()) : [])));
        
        const seatedMembersRefDb = ref(database, `rooms/${roomId}/seatedMembers`);
        listeners.push(onValue(seatedMembersRefDb, (snapshot) => {
            const seatedData = snapshot.val();
            const seatedArray = seatedData ? Object.values(seatedData) : [];
            setSeatedMembers(seatedArray as SeatedMember[]);
        }));
        
        const videoUrlRef = ref(database, `rooms/${roomId}/videoUrl`);
        listeners.push(onValue(videoUrlRef, (snapshot) => setVideoUrl(snapshot.val() || '')));
        
        const roomNameRef = ref(database, `rooms/${roomId}/name`);
        listeners.push(onValue(roomNameRef, (snapshot) => {
            const name = snapshot.val() || '';
            setRoomName(name);
            setTempRoomName(name);
        }));

        const isPrivateRef = ref(database, `rooms/${roomId}/isPrivate`);
        listeners.push(onValue(isPrivateRef, (snapshot) => {
            const privateState = snapshot.val() || false;
            setIsPrivate(privateState);
            setTempIsPrivate(privateState);
        }));
        
        const backgroundUrlRef = ref(database, `rooms/${roomId}/backgroundUrl`);
        listeners.push(onValue(backgroundUrlRef, (snapshot) => setRoomBackground(snapshot.val() || null)));

        const playlistRef = ref(database, `rooms/${roomId}/playlist`);
        listeners.push(onValue(playlistRef, (snapshot) => setPlaylist(snapshot.exists() ? Object.values(snapshot.val()) : [])));

        const playerStateRef = ref(database, `rooms/${roomId}/playerState`);
        listeners.push(onValue(playerStateRef, (snapshot) => setPlayerState(snapshot.val())));

        const hostRef = ref(database, `rooms/${roomId}/host`);
        listeners.push(onValue(hostRef, (snapshot) => setHostName(snapshot.val() || '')));

        const moderatorsRef = ref(database, `rooms/${roomId}/moderators`);
        listeners.push(onValue(moderatorsRef, (snapshot) => setModerators(snapshot.val() || [])));
        
        const videoModeRef = ref(database, `rooms/${roomId}/videoMode`);
        listeners.push(onValue(videoModeRef, (snapshot) => setVideoMode(snapshot.val() || false)));
    };

    setupListeners();

    return () => {
        isMounted = false;
        listeners.forEach(unsubscribe => unsubscribe());
    };
}, [roomId, router]);

  useEffect(() => {
      if(typeof window !== 'undefined') {
          const storedHistory = localStorage.getItem('youtubeSearchHistory');
          if (storedHistory) {
              setSearchHistory(JSON.parse(storedHistory));
          }
      }
  }, []);

  useEffect(() => {
    if (isSeated) {
        const currentUserSeat = seatedMembers.find(m => m.name === user.name);
        if (currentUserSeat) {
            const updates: { [key: string]: any } = {};
            const avatarId = user.avatarId || 'avatar1';
            updates[`/rooms/${roomId}/seatedMembers/${currentUserSeat.seatId}/avatarId`] = avatarId;
            updates[`/rooms/${roomId}/members/${user.name}/avatarId`] = avatarId;
            update(ref(database), updates);
        }
    }
  }, [user?.avatarId, isSeated, roomId, user, seatedMembers]);
    
  const handleTakeSeat = (seatId: number) => {
      const seatRef = ref(database, `rooms/${roomId}/seatedMembers/${seatId}`);
      const currentUserSeat = seatedMembers.find(m => m.name === user.name);

      runTransaction(seatRef, (currentData) => {
          if (currentData === null) {
              if (currentUserSeat) {
                 const oldSeatRef = ref(database, `rooms/${roomId}/seatedMembers/${currentUserSeat.seatId}`);
                 set(oldSeatRef, null);
              }
              return { name: user.name, avatarId: user.avatarId || 'avatar1', seatId: seatId };
          }
          return; 
      }).catch((error) => {
          console.error("Transaction failed: ", error);
          console.error("المقعد محجوز بالفعل");
      });
  };

  const handleLeaveSeat = () => {
      const currentUserSeat = seatedMembers.find(m => m.name === user.name);
      if (currentUserSeat) {
          const seatRef = ref(database, `rooms/${roomId}/seatedMembers/${currentUserSeat.seatId}`);
          set(seatRef, null);
      }
  };

  const handleToggleMute = () => {
    if (isSeated && localParticipant) {
        localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
    }
  };

  const updateSearchHistory = (query: string) => {
      if(typeof window === 'undefined' || !query) return;
      const newHistory = [query, ...searchHistory.filter(h => h.toLowerCase() !== query.toLowerCase())].slice(0, 10);
      setSearchHistory(newHistory);
      localStorage.setItem('youtubeSearchHistory', JSON.stringify(newHistory));
  };

  const performSearch = async (query: string) => {
      if (!query.trim() || !canControl) return;
      
      setIsSearching(true);
      setSearchError(null);
      setResults([]);
      try {
        const results = await searchYoutube({ query: query.trim() });
        setResults(results.items);
        updateSearchHistory(query.trim());
      } catch (error) {
          console.error("YouTube search failed:", error);
          if (error instanceof Error && error.message.includes('YOUTUBE_API_KEY')) {
              setSearchError("مفتاح واجهة برمجة تطبيقات YouTube غير مهيأ أو غير صحيح. يرجى إضافته إلى ملف .env للمتابعة.");
          } else if (error instanceof Error) {
              setSearchError(`فشل البحث في يوتيوب: ${error.message}`);
          } else {
              setSearchError("فشل البحث في يوتيوب. يرجى المحاولة مرة أخرى.");
          }
      } finally {
          setIsSearching(false);
      }
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    performSearch(searchQuery);
  }

  const handleHistoryClick = (query: string) => {
      setSearchQuery(query);
      performSearch(query);
  };
  
  const onSetVideo = useCallback((videoIdentifier: string, startTime = 0) => {
    if (canControl) {
      const videoUrlRef = ref(database, `rooms/${roomId}/videoUrl`);
      const playerStateRef = ref(database, `rooms/${roomId}/playerState`);
      
      set(videoUrlRef, videoIdentifier);
      set(playerStateRef, { 
        isPlaying: !!videoIdentifier, 
        seekTime: startTime, 
        timestamp: serverTimestamp(),
        volume: playerState?.volume ?? 0.8,
      });
    }
  }, [canControl, roomId, playerState?.volume]);
  
  const handlePlayerStateChange = useCallback((newState: Partial<PlayerState>) => {
    if (!canControl) return;
    const playerStateRef = ref(database, `rooms/${roomId}/playerState`);
    
    // Use a transaction to prevent race conditions from multiple state change events
    runTransaction(playerStateRef, (currentState: PlayerState | null) => {
        const current = currentState || { isPlaying: false, seekTime: 0, volume: 0.8, timestamp: Date.now() };

        // Determine if we need to update the timestamp. Only update on major changes like
        // play/pause or a definitive seek, not on every small update.
        const shouldUpdateTimestamp = (newState.isPlaying !== undefined && newState.isPlaying !== current.isPlaying) || newState.seekTime !== undefined;

        const updatedState = { 
            ...current, 
            ...newState, 
        };

        if (shouldUpdateTimestamp) {
            // Using serverTimestamp() ensures all clients get a consistent time.
            return { ...updatedState, timestamp: serverTimestamp() };
        } else {
            // If just volume is changing, no need to update timestamp
            return updatedState;
        }
    });
}, [canControl, roomId]);


  const handleSetVideoFromPreview = () => {
    if (previewPlayerRef.current && previewVideo) {
      const currentTime = previewPlayerRef.current.getCurrentTime();
      onSetVideo(previewVideo.id.videoId, currentTime);
      setPreviewVideo(null); // Close preview dialog
    }
  };

  const handleAddToPlaylistFromSearch = (video: YouTubeVideo) => {
      const newItem: PlaylistItem = {
        id: video.id.videoId,
        videoId: video.id.videoId,
        title: video.snippet.title,
        thumbnail: video.snippet.thumbnails.high.url,
      };
      const playlistRef = ref(database, `rooms/${roomId}/playlist/${btoa(newItem.id)}`);
      set(playlistRef, newItem);

      setRecentlyAddedToPlaylist(prev => {
        const newSet = new Set(prev);
        newSet.add(video.id.videoId);
        return newSet;
      });
      setTimeout(() => {
        setRecentlyAddedToPlaylist(prev => {
            const newSet = new Set(prev);
            newSet.delete(video.id.videoId);
            return newSet;
        });
      }, 2000);
  };
  
  const handleAddUrlToPlaylist = async (url: string) => {
    if (!url.trim()) return;

    let videoId = null;
    let title = url;
    let thumbnail = `https://picsum.photos/seed/${Math.random()}/320/180`; // generic placeholder
    
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname === 'youtu.be') {
            videoId = parsedUrl.hostname === 'youtu.be'
                ? parsedUrl.pathname.slice(1)
                : parsedUrl.searchParams.get('v');
            
            if (videoId) {
                // Try to fetch title from youtube
                try {
                    const response = await fetch(`https://noembed.com/json?url=${encodeURIComponent(url)}`);
                    const data = await response.json();
                    if(data.title) title = data.title;
                    if(data.thumbnail_url) thumbnail = data.thumbnail_url;
                } catch(e) {
                    console.warn("Could not fetch oEmbed details for youtube URL", e);
                }
            }
        }
    } catch(e) { /* Not a URL, do nothing special */ }

    const newItem: PlaylistItem = {
        id: videoId || url, // Use URL as ID if not youtube
        videoId: videoId || url,
        title: title,
        thumbnail: thumbnail,
    };

    const playlistRef = ref(database, `rooms/${roomId}/playlist/${btoa(newItem.id)}`);
    set(playlistRef, newItem);
    console.log(`تمت إضافة فيديو إلى قائمة التشغيل.`);
    setUrlInput('');
  };

  const handlePlayFromPlaylist = (videoId: string) => {
    onSetVideo(videoId);
    setIsPlaylistOpen(false);
  };

  const handleRemoveFromPlaylist = (itemId: string) => {
      const playlistRef = ref(database, `rooms/${roomId}/playlist/${btoa(itemId)}`);
      remove(playlistRef);
  };

  const handleVideoEnded = () => {
    if (!canControl) return;

    const getYoutubeVideoId = (url: string) => {
        try {
          const urlObj = new URL(url);
          if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
          }
           if (urlObj.hostname === 'youtu.be') {
              return urlObj.pathname.slice(1);
           }
        } catch (e) {
            return url.match(/^[a-zA-Z0-9_-]{11}$/) ? url : null;
        }
        return null;
    }
    
    const currentVideoId = getYoutubeVideoId(videoUrl);
    let currentIndex = -1;
    if (currentVideoId) {
        currentIndex = playlist.findIndex(item => item.videoId === currentVideoId);
    }
    
    if (playlist.length > 0) {
        const nextIndex = (currentIndex + 1);
        if (nextIndex < playlist.length) {
            onSetVideo(playlist[nextIndex].videoId);
        } else {
            // Last video in playlist ended
            onSetVideo('');
        }
    } else {
        onSetVideo('');
    }
  };

  const handleKickUser = (userNameToKick: string) => {
    if (!canControl || !userNameToKick) return;

    const memberRef = ref(database, `rooms/${roomId}/members/${userNameToKick}`);
    set(memberRef, null);

    const userSeat = seatedMembers.find(m => m.name === userNameToKick);
    if (userSeat) {
        const seatRef = ref(database, `rooms/${roomId}/seatedMembers/${userSeat.seatId}`);
        set(seatRef, null);
    }
    console.log(`تم طرد ${userNameToKick}`);
  };
  
  const handleOpenInviteDialog = async () => {
    if (!user) return;
    try {
      const friendsData = await getFriends(user.name);
      setFriends(friendsData);
      setInvitedFriends(new Set()); // Reset invited state on open
      setIsInviteOpen(true);
    } catch(error) {
      console.error("فشل في جلب قائمة الأصدقاء.");
    }
  };
  
  const handleOpenSettingsDialog = async () => {
    if (!canControl) return;
    const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
    if (roomSnapshot.exists()) {
      const roomData = roomSnapshot.val();
      setTempRoomName(roomData.name || `غرفة ${hostName}`);
      setTempPin(roomData.password || '');
      setTempIsPrivate(roomData.isPrivate || false);
    }
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    if (!canControl) return;
    const updates: { [key: string]: any } = {};

    const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
    const currentRoomData = roomSnapshot.val();

    if (tempRoomName !== (currentRoomData.name || '')) {
      updates[`/rooms/${roomId}/name`] = tempRoomName;
    }
    if (tempPin !== (currentRoomData.password || '')) {
      updates[`/rooms/${roomId}/password`] = tempPin;
    }
    if (tempIsPrivate !== (currentRoomData.isPrivate || false)) {
        updates[`/rooms/${roomId}/isPrivate`] = tempIsPrivate;
    }
    
    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
      console.log("تم حفظ إعدادات الغرفة.");
    } else {
      console.log("لا توجد تغييرات لحفظها.");
    }
    setIsSettingsOpen(false);
  };

  const handleSendInvitation = async (recipientName: string) => {
    if (!user) return;
    try {
        await sendRoomInvitation(user.name, recipientName, roomId, roomName || `غرفة ${hostName}`);
        setInvitedFriends(prev => new Set(prev).add(recipientName));
        console.log(`تمت دعوة ${recipientName} إلى الغرفة.`);
    } catch (error: any) {
        console.error(error.message);
    }
  };

  const handlePromote = (userName: string) => {
      if (!isHost) return;
      const roomRef = ref(database, `rooms/${roomId}/moderators`);
      const newModerators = [...moderators, userName];
      set(roomRef, newModerators);
      console.log(`أصبح ${userName} مشرفًا.`);
  }

  const handleDemote = (userName: string) => {
      if (!isHost) return;
      const roomRef = ref(database, `rooms/${roomId}/moderators`);
      const newModerators = moderators.filter(mod => mod !== userName);
      set(roomRef, newModerators);
      console.log(`لم يعد ${userName} مشرفًا.`);
  }

  const handleTransferHost = (userName: string) => {
      if (!isHost || !userName) return;
      const updates: { [key: string]: any } = {};
      updates[`/rooms/${roomId}/host`] = userName;
      // Also make the old host a moderator
      const newModerators = [...moderators.filter(m => m !== userName), hostName];
      updates[`/rooms/${roomId}/moderators`] = newModerators;

      update(ref(database), updates);
      console.log(`أصبحت الغرفة الآن ملك ${userName}.`);
  }

  const getAvatar = (user: AppUser | Member | SeatedMember) => {
    return PlaceHolderImages.find(p => p.id === user.avatarId) ?? PlaceHolderImages[0];
  }
  
  const handleSetBackground = (imageUrl: string) => {
    if (!canControl) return;
    set(ref(database, `rooms/${roomId}/backgroundUrl`), imageUrl);
    setIsBackgroundOpen(false);
  }
  
  const roomBackgrounds = useMemo(() => {
    return PlaceHolderImages.filter(p => p.id.startsWith('room-bg') || p.id.startsWith('user-bg'));
  }, []);
  
  const handleSetVideoMode = (mode: boolean) => {
    if (canControl) {
      set(ref(database, `rooms/${roomId}/videoMode`), mode);
    }
    setVideoMode(mode);
  }

  const handleSwitchToVideoClick = () => {
    console.log('الخدمة قيد التطوير سيتم تجهيزها قريبا');
  };

  const parseDuration = (duration: string) => {
    if (!duration) return '0:00';
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0:00';
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isAuthenticated) {
    return (
        <Dialog open={!isAuthenticated} onOpenChange={(open) => { if(!open) router.push('/lobby')}}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-center text-2xl">الغرفة مقفلة</DialogTitle>
                    <DialogDescription className="text-center">
                        الرجاء إدخال كلمة المرور المكونة من 4 أرقام للدخول.
                    </DialogDescription>
                </DialogHeader>
                <div className={cn("flex justify-center", pinError ? 'animate-shake' : '')}>
                    <NumericKeypad pin={pinInput} onPinChange={handlePinChange} pinLength={4} />
                </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => router.push('/lobby')}>العودة إلى الردهة</Button>
                 </DialogFooter>
            </DialogContent>
        </Dialog>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-background relative">
        {roomBackground && (
            <div className="absolute inset-0 z-0">
                <Image
                    src={roomBackground}
                    alt="Room background"
                    fill
                    className="object-cover"
                />
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            </div>
        )}
        <div className="relative z-10 flex h-full w-full flex-col">
             <RoomHeader 
                onSearchClick={() => setIsSearchOpen(true)} 
                onPlaylistClick={() => setIsPlaylistOpen(true)}
                roomId={roomId}
                onLeaveRoom={handleLeaveRoom}
                onSwitchToVideo={handleSwitchToVideoClick}
                onSwitchToPlayer={() => handleSetVideoMode(false)}
                videoMode={videoMode}
                onInviteClick={handleOpenInviteDialog}
                onSettingsClick={handleOpenSettingsDialog}
                roomName={roomName}
                hostName={hostName}
                canControl={canControl}
            />

            {/* Main Content Area */}
            <main className="w-full flex-1 overflow-y-auto min-h-0 pb-24">
              <div className="w-full max-w-7xl mx-auto flex flex-col gap-2 md:gap-4 px-2 md:px-4 pb-4">
                  {videoMode ? (
                     <div className="flex-grow rounded-lg overflow-hidden h-full">
                       <VideoConference />
                     </div>
                  ) : (
                      <>
                          <div className="flex-shrink-0">
                              <Player 
                                  videoUrl={videoUrl} 
                                  onSetVideo={onSetVideo} 
                                  canControl={canControl} 
                                  onSearchClick={() => setIsSearchOpen(true)}
                                  playerState={playerState}
                                  onPlayerStateChange={handlePlayerStateChange}
                                  onVideoEnded={handleVideoEnded}
                              />
                          </div>
                          <div className="flex-shrink-0">
                               <Seats 
                                  seatedMembers={seatedMembers}
                                  hostName={hostName}
                                  moderators={moderators}
                                  onTakeSeat={handleTakeSeat}
                                  onLeaveSeat={handleLeaveSeat}
                                  currentUser={user}
                                  isHost={isHost}
                                  onKickUser={handleKickUser}
                                  onPromote={handlePromote}
                                  onDemote={handleDemote}
                                  onTransferHost={handleTransferHost}
                                  room={room}
                                  currentUserFriends={friendData.friends}
                                  currentUserRequests={friendData.requests}
                              />
                          </div>
                           <div className="flex-shrink-0">
                              <ViewerInfo members={viewers} />
                           </div>
                           <div className="bg-card/50 backdrop-blur-lg rounded-t-lg flex flex-col">
                             <ChatHeader isHost={isHost} roomId={roomId} />
                             <div className="h-56 md:h-80">
                               <ChatMessages roomId={roomId} user={user} />
                             </div>
                           </div>
                      </>
                  )}
              </div>
            </main>


            {/* Chat Input Area */}
            <footer className="fixed bottom-0 left-0 right-0 z-20">
                 <ChatInput
                    roomId={roomId} 
                    user={user} 
                    isSeated={isSeated}
                    isMuted={isMuted}
                    onToggleMute={handleToggleMute}
                />
            </footer>
        </div>
         <div className="hidden">
            <AudioConference />
        </div>

    <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle>دعوة أصدقاء</DialogTitle>
                <DialogDescription>
                    أرسل دعوات لأصدقائك للانضمام إليك في غرفة المشاهدة.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 max-h-80 overflow-y-auto mt-4">
                {friends.length > 0 ? friends.map((friend) => (
                    <div key={friend.name} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={getAvatar(friend)?.imageUrl} alt={friend.name} />
                                <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="font-semibold">{friend.name}</span>
                        </div>
                        <Button 
                            size="sm" 
                            onClick={() => handleSendInvitation(friend.name)} 
                            disabled={invitedFriends.has(friend.name)}
                        >
                            {invitedFriends.has(friend.name) ? "تمت الدعوة" : "دعوة"}
                            {!invitedFriends.has(friend.name) && <Send className="ms-2 h-4 w-4"/>}
                        </Button>
                    </div>
                )) : (
                    <p className="text-center text-muted-foreground py-4">ليس لديك أصدقاء لدعوتهم بعد.</p>
                )}
            </div>
        </DialogContent>
    </Dialog>
    
    <Dialog open={isPlaylistOpen} onOpenChange={setIsPlaylistOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>قائمة التشغيل</DialogTitle>
            <DialogDescription>طابور الفيديوهات التالية.</DialogDescription>
          </DialogHeader>
          <Playlist 
            items={playlist}
            canControl={canControl}
            onPlay={handlePlayFromPlaylist}
            onRemove={handleRemoveFromPlaylist}
            currentVideoUrl={videoUrl}
           />
           <DialogFooter>
                <Button variant="outline" onClick={() => setIsPlaylistOpen(false)}>إغلاق</Button>
           </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إعدادات الغرفة</DialogTitle>
            <DialogDescription>تعديل اسم الغرفة، الخصوصية، وتعيين كلمة مرور.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="room-name" className="text-right">اسم الغرفة</Label>
                <Input
                    id="room-name"
                    value={tempRoomName}
                    onChange={(e) => setTempRoomName(e.target.value)}
                    className="col-span-3"
                />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                    <Label htmlFor="private-mode">غرفة خاصة</Label>
                    <p className="text-xs text-muted-foreground">
                       إخفاء الغرفة من قائمة الغرف المتاحة في الردهة.
                    </p>
                </div>
                <Switch
                    id="private-mode"
                    checked={tempIsPrivate}
                    onCheckedChange={setTempIsPrivate}
                />
            </div>
            <div className="space-y-2 text-center">
                 <Label htmlFor="room-pin">
                    كلمة المرور (4 أرقام)
                </Label>
                 <div className="flex justify-center flex-col items-center gap-2">
                    <NumericKeypad pin={tempPin} onPinChange={setTempPin} pinLength={4} />
                    {tempPin && (
                        <Button variant="destructive" onClick={() => setTempPin('')} className="w-44">
                            <Unlock className="me-2" />
                            فتح الغرفة (إلغاء القفل)
                        </Button>
                    )}
                </div>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right col-span-1 pt-2">صورة الغلاف</Label>
                 <Button onClick={() => { setIsSettingsOpen(false); setIsBackgroundOpen(true); }} variant="outline" className="col-span-3">
                    <Wallpaper className="me-2"/>
                    اختر صورة غلاف
                </Button>
             </div>
          </div>
           <DialogFooter>
                <Button onClick={handleSaveSettings}>حفظ التغييرات</Button>
                <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>إلغاء</Button>
           </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog open={isBackgroundOpen} onOpenChange={setIsBackgroundOpen}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>اختر خلفية للغرفة</DialogTitle>
                <DialogDescription>ستظهر الخلفية الجديدة لجميع المستخدمين في الغرفة.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-1">
                {roomBackgrounds.map(bg => (
                    <div key={bg.id} className="relative aspect-video rounded-lg overflow-hidden cursor-pointer group" onClick={() => handleSetBackground(bg.imageUrl)}>
                        <Image
                            src={bg.imageUrl}
                            alt={bg.description}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                         <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                         {roomBackground === bg.imageUrl && (
                            <div className="absolute top-2 right-2 bg-accent text-accent-foreground rounded-full p-1">
                                <Check className="w-4 h-4"/>
                            </div>
                         )}
                    </div>
                ))}
            </div>
        </DialogContent>
    </Dialog>


    <Dialog open={isSearchOpen} onOpenChange={(isOpen) => {
        setIsSearchOpen(isOpen);
        if (!isOpen) {
            setPreviewVideo(null); // Close preview if search is closed
        }
    }}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-4 border-b">
                <DialogTitle>البحث عن فيديو وإضافته</DialogTitle>
                <DialogDescription>
                    ابحث في يوتيوب أو الصق رابط فيديو من أي موقع.
                </DialogDescription>
            </DialogHeader>
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <form onSubmit={handleSearchSubmit} className="flex gap-2 md:col-span-2">
                    <Input
                        type="text"
                        placeholder="ابحث في يوتيوب..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-input h-11"
                        disabled={isSearching}
                    />
                    <Button type="submit" disabled={isSearching} size="lg">
                        {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
                    </Button>
                </form>
                <div className="flex gap-2">
                    <Input
                        type="text"
                        placeholder="...أو الصق رابط فيديو هنا"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="bg-input h-11"
                    />
                    <Button onClick={() => handleAddUrlToPlaylist(urlInput)} size="lg" variant="secondary"><Plus/></Button>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto px-6 pb-6">
                {isSearching && (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="h-12 w-12 animate-spin text-accent" />
                    </div>
                )}
                {searchError && (
                    <div className="flex justify-center items-center h-full text-destructive">{searchError}</div>
                )}
                {!isSearching && !searchError && searchResults.length === 0 && (
                    <div className="flex flex-col justify-center items-center h-full text-muted-foreground text-center">
                        {searchHistory.length > 0 ? (
                            <>
                                <History className="w-16 h-16 mb-4" />
                                <h3 className="font-bold text-lg text-foreground mb-2">سجل البحث الأخير</h3>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {searchHistory.map((term, i) => (
                                        <Button
                                            key={i}
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleHistoryClick(term)}
                                        >
                                            {term}
                                        </Button>
                                    ))}
                                </div>
                            </>
                        ) : (
                             <>
                                <Youtube className="w-16 h-16 mb-4" />
                                <p className="text-lg">ابحث عن فيديو للبدء</p>
                                <p>شاهد مع أصدقائك أفضل محتوى من يوتيوب.</p>
                             </>
                        )}
                    </div>
                )}
                {searchResults.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {searchResults.map((video) => (
                            <div key={video.id.videoId}>
                                <div
                                    className="group cursor-pointer"
                                    onClick={() => setPreviewVideo(video)}
                                >
                                    <div className="relative aspect-video rounded-lg overflow-hidden mb-2 shadow-lg transition-transform duration-200 group-hover:scale-105">
                                        <Image
                                            src={video.snippet.thumbnails.high.url}
                                            alt={video.snippet.title}
                                            fill
                                            className="object-cover"
                                        />
                                         <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-2">
                                            {video.contentDetails?.duration && (
                                                <Badge
                                                    variant="secondary"
                                                    className="absolute bottom-2 right-2 backdrop-blur-sm"
                                                >
                                                   {parseDuration(video.contentDetails.duration)}
                                                </Badge>
                                            )}
                                         </div>
                                         <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Play className="w-16 h-16 text-white/80"/>
                                         </div>
                                    </div>
                                    <h3 className="font-semibold text-foreground text-sm line-clamp-2">
                                        {video.snippet.title}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">{video.snippet.channelTitle}</p>
                                </div>
                                <Button 
                                    onClick={() => handleAddToPlaylistFromSearch(video)}
                                    variant="secondary"
                                    size="sm"
                                    className="w-full mt-2"
                                    disabled={recentlyAddedToPlaylist.has(video.id.videoId)}
                                >
                                    {recentlyAddedToPlaylist.has(video.id.videoId) ? (
                                        <>
                                            <Check className="me-2"/>
                                            تمت الإضافة
                                        </>
                                    ) : (
                                        <>
                                            <ListMusic className="me-2"/>
                                            إضافة إلى القائمة
                                        </>
                                    )}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DialogContent>
    </Dialog>


    {previewVideo && (
        <Dialog open={!!previewVideo} onOpenChange={(isOpen) => !isOpen && setPreviewVideo(null)}>
            <DialogContent className="max-w-4xl w-full">
                <DialogHeader>
                    <DialogTitle>{previewVideo.snippet.title}</DialogTitle>
                    <DialogDescription className="line-clamp-2">{previewVideo.snippet.description}</DialogDescription>
                </DialogHeader>
                <div className="aspect-video w-full rounded-lg overflow-hidden shadow-md bg-black relative">
                     <YouTube
                        key={previewVideo.id.videoId}
                        videoId={previewVideo.id.videoId}
                        opts={{
                            height: '100%',
                            width: '100%',
                            playerVars: {
                              autoplay: 1,
                              controls: 1,
                            },
                        }}
                        onReady={(event) => { previewPlayerRef.current = event.target; }}
                        className="w-full h-full"
                    />
                </div>
                 <div className="flex gap-2">
                    <Button onClick={() => { handleAddToPlaylistFromSearch(previewVideo); }} variant="secondary" size="lg" className="w-full" disabled={recentlyAddedToPlaylist.has(previewVideo.id.videoId)}>
                       {recentlyAddedToPlaylist.has(previewVideo.id.videoId) ? (
                           <><Check className="me-2" /> تمت الإضافة</>
                       ) : (
                           <><ListMusic className="me-2" /> إضافة إلى القائمة</>
                       )}
                    </Button>
                    <Button onClick={handleSetVideoFromPreview} size="lg" className="w-full">
                        <Clapperboard className="me-2" />
                        عرض للجميع الآن
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )}
</div>
  );
}


const RoomClient = ({ roomId }: { roomId: string }) => {
  const router = useRouter();
  const { user, isLoaded: isUserLoaded } = useUserSession();
  const [token, setToken] = useState('');
  const seatedMembersRef = useRef<SeatedMember[]>([]);
  const [roomPassword, setRoomPassword] = useState<string | undefined>(undefined);
  const [passwordChecked, setPasswordChecked] = useState(false);
  
  const [isSeated, setIsSeated] = useState(false);
  const [videoMode, setVideoMode] = useState(false);
  
  const sendSystemMessage = useCallback((text: string) => {
    if (!roomId || !user) return;
    const chatRef = ref(database, `rooms/${roomId}/chat`);
    const newMsgRef = push(chatRef);
    const messageData: Message = {
      id: newMsgRef.key!,
      sender: 'System',
      text,
      timestamp: Date.now(),
      isSystemMessage: true,
    };
    set(newMsgRef, messageData);
  }, [roomId, user]);

  useEffect(() => {
    if (!isUserLoaded || !user) return;

    const seatedMembersDbRef = ref(database, `rooms/${roomId}/seatedMembers`);
    const videoModeRef = ref(database, `rooms/${roomId}/videoMode`);

    const seatedListener = onValue(seatedMembersDbRef, (snapshot) => {
        const seatedData = snapshot.val();
        seatedMembersRef.current = seatedData ? Object.values(seatedData) : [];
        const isCurrentlySeated = seatedMembersRef.current.some((member: any) => member.name === user.name);
        setIsSeated(isCurrentlySeated);
    });

    const videoModeListener = onValue(videoModeRef, (snapshot) => {
      setVideoMode(snapshot.val() || false);
    });
    
    return () => {
        off(seatedMembersDbRef, 'value', seatedListener);
        off(videoModeRef, 'value', videoModeListener);
    }
  }, [isUserLoaded, user, roomId, router]);


  useEffect(() => {
    if (!isUserLoaded) return;
    if (!user) {
        router.push('/');
        return;
    }

    let isMounted = true;
    const memberRef = ref(database, `rooms/${roomId}/members/${user.name}`);
    const hostRef = ref(database, `rooms/${roomId}/host`);

    // For Realtime DB presence
    const presenceRef = ref(database, `presence/${user.name}`);
    const connectedRef = ref(database, '.info/connected');
    let roomData: any = null; // To store initial room data

    const setupRoom = async () => {
      try {
        const roomSnapshot = await get(ref(database, `rooms/${roomId}`));

        if (!isMounted) return;
        
        if (!roomSnapshot.exists()) {
            console.error('الغرفة غير موجودة. تمت إعادة توجيهك إلى الردهة.');
            router.push('/lobby');
            return;
        }

        roomData = roomSnapshot.val();
        setRoomPassword(roomData.password);
        setPasswordChecked(true); // Now we know if there is a password or not
        
        const isReturning = roomData.members?.[user.name];

        // Setup presence and fetch LiveKit token in parallel
        const presencePromise = (async () => {
            const memberData = { name: user.name, avatarId: user.avatarId || 'avatar1', joinedAt: serverTimestamp() };
            
            onValue(connectedRef, (snap) => {
              if (snap.val() === true) {
                goOnline(database);
                set(memberRef, memberData);
                onDisconnect(memberRef).remove();
                
                set(presenceRef, { status: 'online', lastChanged: serverTimestamp() });
                onDisconnect(presenceRef).set({ status: 'offline', lastChanged: serverTimestamp() });
              }
            });

            if(!isReturning){
              sendSystemMessage(`${user.name} انضم إلى الغرفة`);
            }

            onDisconnect(memberRef).remove().then(() => {
                 get(ref(database, `rooms/${roomId}`)).then(finalRoomSnapshot => {
                     const finalRoomData = finalRoomSnapshot.val();
                     if (!finalRoomData) return; // Room might have been deleted manually

                     const remainingMembers: Member[] = finalRoomData.members ? Object.values(finalRoomData.members) : [];

                     // If I was the host, transfer host
                     if (remainingMembers.length > 0 && finalRoomData.host === user.name) {
                        const moderators: string[] = finalRoomData.moderators || [];
                        const potentialModeratorHosts = remainingMembers.filter(m => moderators.includes(m.name));
                        
                        let newHostName: string;
                        if (potentialModeratorHosts.length > 0) {
                            potentialModeratorHosts.sort((a, b) => (a.joinedAt as number) - (b.joinedAt as number));
                            newHostName = potentialModeratorHosts[0].name;
                        } else {
                            remainingMembers.sort((a, b) => (a.joinedAt as number) - (b.joinedAt as number));
                            newHostName = remainingMembers[0].name;
                        }
                        set(ref(database, `rooms/${roomId}/host`), newHostName);
                     }
                 });
            });
        })();

        const tokenFetchPromise = (async () => {
            try {
                const res = await fetch(`/api/livekit?room=${roomId}&username=${user.name}`);
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Failed to fetch token: ${res.statusText} - ${errorText}`);
                }
                const data = await res.json();
                if (isMounted) {
                    setToken(data.token);
                }
            } catch (error) {
                console.error('Error fetching LiveKit token:', error);
                if (isMounted) {
                    console.error('فشل في الحصول على رمز الدخول للغرفة. قد يتم عرض الصفحة بشكل غير صحيح.');
                }
            }
        })();
        
        await Promise.all([presencePromise, tokenFetchPromise]);

      } catch (error) {
        if (isMounted) {
            console.error("Error setting up room:", error);
            console.error('فشل في تهيئة الغرفة. قد تكون هناك مشكلة في الاتصال.');
        }
      }
    };

    setupRoom();

    const handleBeforeUnload = () => {
        goOffline(database);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
        isMounted = false;
        window.removeEventListener('beforeunload', handleBeforeUnload);
        
        if (user) {
            const memberRefOnUnmount = ref(database, `rooms/${roomId}/members/${user.name}`);
            const userSeat = seatedMembersRef.current.find(m => m.name === user.name);
            
            // Graceful leave
            if (userSeat) {
                remove(ref(database, `rooms/${roomId}/seatedMembers/${userSeat.seatId}`));
            }
            
            remove(memberRefOnUnmount);
            
            // Cancel all onDisconnect operations for this user
            const allOnDisconnects = [
                onDisconnect(memberRef),
                onDisconnect(hostRef),
                onDisconnect(ref(database, `presence/${user.name}`)),
                onDisconnect(connectedRef),
            ];
            allOnDisconnects.forEach(op => op.cancel());
        }
        goOffline(database);
    };
}, [isUserLoaded, user, roomId, router, sendSystemMessage]);

  if (!isUserLoaded || !user || !passwordChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-accent" />
      </div>
    );
  }
  
  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-accent" />
        <p className="ms-4 text-muted-foreground">جارٍ تهيئة الغرفة...</p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL!}
      user={user}
      isSeated={isSeated}
      videoMode={videoMode}
    >
      <RoomLayout 
        roomId={roomId} 
        user={user} 
        sendSystemMessage={sendSystemMessage}
        roomPassword={roomPassword}
        onCorrectPassword={() => setRoomPassword(undefined)} // Clear password check after correct entry
        isPasswordChecked={passwordChecked}
      />
    </LiveKitRoom>
  );
};

export default RoomClient;
