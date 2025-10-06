

import { database } from './firebase';
import type { Database } from 'firebase/database';
import {
  ref,
  get,
  set,
  update,
  push,
  query,
  orderByChild,
  equalTo,
  serverTimestamp,
  remove,
} from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { PlaceHolderImages } from './placeholder-images';

// A simple (and not cryptographically secure) hashing function for demonstration.
// In a real-world app, use a library like bcryptjs.
const simpleHash = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export interface PresenceStatus {
    status: 'online' | 'offline';
    lastChanged: number;
}

export interface RoomInvitation {
  id: string;
  roomId: string;
  roomName: string;
  senderName: string;
  timestamp: number;
  read?: boolean;
}

export interface FriendRequest {
  id: string;
  senderName: string;
  timestamp: number;
  read?: boolean;
}

export interface AppUser {
  name: string;
  password?: string; // Hashed password
  age?: number;
  gender?: 'male' | 'female';
  dob?: string; // Date of birth
  avatarId?: string;
  friends?: { [key: string]: boolean }; // Using object for easier add/remove
  friendRequests?: { [key: string]: FriendRequest };
  invitations?: { [key: string]: RoomInvitation };
  generatedAvatars?: { id: string; imageUrl: string; description: string; imageHint: string }[];
}


const getUsersRef = (db: Database) => ref(db, 'users');
const getUserRef = (db: Database, username: string) => ref(db, `users/${username}`);

export const getUserData = async (username: string): Promise<AppUser | null> => {
  const userRef = getUserRef(database, username);
  const snapshot = await get(userRef);
  return snapshot.exists() ? snapshot.val() : null;
};

export const upsertUser = async (user: { name: string, avatarId?: string, newAvatar?: any }): Promise<AppUser> => {
  const userRef = getUserRef(database, user.name);
  const snapshot = await get(userRef);

  if (!snapshot.exists()) {
    const defaultAvatar = PlaceHolderImages.find(p => p.id === 'avatar1') || PlaceHolderImages[0];
    const newUser: AppUser = {
      name: user.name,
      avatarId: user.avatarId || defaultAvatar.id,
      generatedAvatars: user.newAvatar ? [user.newAvatar] : []
    };
    await set(userRef, newUser);
    return newUser;
  } else {
    const existingUser = snapshot.val() as AppUser;
    const updates: any = {};
    if (user.avatarId && user.avatarId !== existingUser.avatarId) {
      updates.avatarId = user.avatarId;
    }
    if (user.newAvatar) {
        const existingAvatars = existingUser.generatedAvatars || [];
        updates.generatedAvatars = [...existingAvatars, user.newAvatar];
    }
    if (Object.keys(updates).length > 0) {
      await update(userRef, updates);
    }
    return { ...existingUser, ...updates };
  }
};

export const searchUsers = async (nameQuery: string, currentUsername: string): Promise<AppUser[]> => {
    const usersRef = getUsersRef(database);
    const usersQuery = query(usersRef, orderByChild('name'), equalTo(nameQuery));
    const snapshot = await get(usersQuery);
    
    const users: AppUser[] = [];
    if (!snapshot.exists()) {
        return [];
    }

    const currentUserData = await getUserData(currentUsername);
    if (!currentUserData) return [];

    const friendNames = new Set(Object.keys(currentUserData.friends || {}));
    const receivedRequests = new Set(Object.values(currentUserData.friendRequests || {}).map(req => req.senderName));
    
    snapshot.forEach((childSnapshot) => {
        const userData = childSnapshot.val() as AppUser;
        if (userData.name !== currentUsername && !friendNames.has(userData.name) && !receivedRequests.has(userData.name)) {
            users.push(userData);
        }
    });

    return users;
};

export const sendFriendRequest = async (senderName: string, recipientName: string) => {
    if (senderName === recipientName) throw new Error("لا يمكنك إضافة نفسك كصديق.");

    const recipientData = await getUserData(recipientName);
    if (!recipientData) throw new Error('المستخدم الذي تحاول إضافته غير موجود.');

    const senderData = await getUserData(senderName);
    if (senderData?.friends && senderData.friends[recipientName]) {
        throw new Error('هذا المستخدم صديقك بالفعل.');
    }
    
    const recipientRequestsRef = ref(database, `users/${recipientName}/friendRequests`);
    const snapshot = await get(recipientRequestsRef);
    if (snapshot.exists()) {
        const requests = snapshot.val();
        const existingRequest = Object.values(requests).find((req: any) => req.senderName === senderName);
        if (existingRequest) {
            throw new Error('لقد أرسلت طلب صداقة لهذا المستخدم بالفعل.');
        }
    }

    const requestId = uuidv4();
    const newRequestRef = ref(database, `users/${recipientName}/friendRequests/${btoa(requestId)}`);
    const newRequest: FriendRequest = {
        id: requestId,
        senderName,
        timestamp: Date.now(),
        read: false,
    };
    await set(newRequestRef, newRequest);
};

export const acceptFriendRequest = async (senderName: string, recipientName: string) => {
    const recipientData = await getUserData(recipientName);
    if (!recipientData || !recipientData.friendRequests) return;

    const reqKey = Object.keys(recipientData.friendRequests).find(
        key => recipientData.friendRequests![key].senderName === senderName
    );

    if (!reqKey) return;

    const updates: { [key: string]: any } = {};
    updates[`/users/${recipientName}/friends/${senderName}`] = true;
    updates[`/users/${senderName}/friends/${recipientName}`] = true;
    updates[`/users/${recipientName}/friendRequests/${reqKey}`] = null; // Remove request

    await update(ref(database), updates);
};

export const rejectFriendRequest = async (senderName: string, recipientName: string) => {
    const recipientData = await getUserData(recipientName);
    if (!recipientData || !recipientData.friendRequests) return;

    const reqKey = Object.keys(recipientData.friendRequests).find(
        key => recipientData.friendRequests![key].senderName === senderName
    );

    if (reqKey) {
        await remove(ref(database, `users/${recipientName}/friendRequests/${reqKey}`));
    }
};

export const getFriendRequests = async (username: string): Promise<AppUser[]> => {
    const userData = await getUserData(username);
    if (!userData || !userData.friendRequests) return [];
    
    const requestSenders = Object.values(userData.friendRequests).map(req => req.senderName);
    const users: AppUser[] = [];
    for (const sender of requestSenders) {
        const senderData = await getUserData(sender);
        if (senderData) users.push(senderData);
    }
    return users;
};

export const getFriends = async (username: string): Promise<AppUser[]> => {
    const userData = await getUserData(username);
    if (!userData || !userData.friends) return [];

    const friendNames = Object.keys(userData.friends);
    const users: AppUser[] = [];
    for (const name of friendNames) {
        const friendData = await getUserData(name);
        if (friendData) users.push(friendData);
    }
    return users;
};

export const areFriends = async (username1: string, username2: string): Promise<boolean> => {
    const user1Data = await getUserData(username1);
    return user1Data?.friends?.[username2] === true;
};

export const removeFriend = async (currentUsername: string, friendNameToRemove: string) => {
    const updates: { [key: string]: any } = {};
    updates[`/users/${currentUsername}/friends/${friendNameToRemove}`] = null;
    updates[`/users/${friendNameToRemove}/friends/${currentUsername}`] = null;
    await update(ref(database), updates);
};

export const sendRoomInvitation = async (senderName: string, recipientName: string, roomId: string, roomName: string) => {
    const recipientData = await getUserData(recipientName);
    if (!recipientData) throw new Error('المستخدم الذي تحاول دعوته غير موجود.');

    // Check if a non-expired invitation to the same room already exists
    if (recipientData.invitations) {
      const existingInvites = Object.values(recipientData.invitations);
      const oneHourAgo = Date.now() - 3600 * 1000;
      const recentInvite = existingInvites.find(inv => inv.roomId === roomId && inv.timestamp > oneHourAgo);
      if (recentInvite) {
        throw new Error(`لقد قمت بالفعل بدعوة ${recipientName} إلى هذه الغرفة مؤخرًا.`);
      }
    }

    const invitationId = uuidv4();
    const invitationsRef = ref(database, `users/${recipientName}/invitations/${btoa(invitationId)}`);
    const newInvitation: RoomInvitation = {
        id: invitationId,
        roomId,
        roomName,
        senderName,
        timestamp: Date.now(),
        read: false,
    };
    await set(invitationsRef, newInvitation);
};


type CreateRoomInput = {
    hostName: string;
    roomId: string;
};

export const createRoom = async ({ hostName, roomId }: CreateRoomInput): Promise<void> => {
    const roomRef = ref(database, `rooms/${roomId}`);
    const snapshot = await get(roomRef);

    // Only create the room if it doesn't already exist.
    if (!snapshot.exists()) {
        const roomName = `غرفة ${hostName}`;
        
        // Select a random room avatar from placeholders
        const roomAvatars = PlaceHolderImages.filter(p => p.id.startsWith('room-avatar-'));
        const randomAvatar = roomAvatars[Math.floor(Math.random() * roomAvatars.length)];
        const avatarUrl = randomAvatar ? randomAvatar.imageUrl : `https://picsum.photos/seed/${roomId}/200/200`;

        const roomData = {
          host: hostName,
          name: roomName,
          createdAt: serverTimestamp(),
          videoUrl: '',
          backgroundUrl: '',
          avatarUrl: avatarUrl,
          seatedMembers: {},
          members: {},
          moderators: [],
          playlist: {},
        };
        await set(roomRef, roomData);
    }
};
