'use client';

import {
  LiveKitRoom as LiveKitRoomComponent,
  useRoomContext,
} from '@livekit/components-react';
import { Loader2 } from 'lucide-react';
import type { User } from '@/app/providers';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { useEffect } from 'react';

interface LiveKitRoomProps {
  token: string;
  serverUrl: string;
  user: User;
  isSeated: boolean;
  videoMode: boolean;
  children: React.ReactNode;
}

const RoomLayoutWithConnectivity = ({ isSeated, videoMode, children }: Pick<LiveKitRoomProps, 'isSeated' | 'videoMode' | 'children'>) => {
    const room = useRoomContext();
    const isConnected = room.connectionState === ConnectionState.Connected;

    // Enable audio/video only when the user is seated AND the room is connected.
    room.localParticipant.setCameraEnabled(videoMode && isSeated && isConnected);
    room.localParticipant.setMicrophoneEnabled(isSeated && isConnected);
    
    useEffect(() => {
        const onConnectionStateChanged = (state: ConnectionState) => {
            if (state === ConnectionState.Connected) {
                // When connected, explicitly set the audio output to the default device.
                // This helps in scenarios where browsers (especially on mobile) default to 
                // the earpiece when a microphone is enabled. This call ensures it
                // tries to switch to the main speaker/headphones when possible.
                room.switchActiveDevice('audiooutput', undefined);
            }
        };
        room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
        // Initial check in case we are already connected
        if (room.connectionState === ConnectionState.Connected) {
            room.switchActiveDevice('audiooutput', undefined);
        }
        return () => {
            room.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
        }
    }, [room]);


    return <>{children}</>;
}


const LiveKitRoom = ({ token, serverUrl, user, isSeated, videoMode, children }: LiveKitRoomProps) => {
  if (!token || !serverUrl) {
    return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-accent" />
            <p className="ms-4 text-muted-foreground">Connecting to room...</p>
        </div>
    );
  }

  return (
    <LiveKitRoomComponent
      token={token}
      serverUrl={serverUrl}
      connect={true}
      connectOptions={{ autoSubscribe: true }}
      data-lk-theme="default"
    >
      <RoomLayoutWithConnectivity isSeated={isSeated} videoMode={videoMode}>
        {children}
      </RoomLayoutWithConnectivity>
    </LiveKitRoomComponent>
  );
};

export default LiveKitRoom;
