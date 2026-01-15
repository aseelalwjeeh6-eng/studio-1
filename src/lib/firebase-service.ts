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
  runTransaction,
} from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { PlaceHolderImages } from './placeholder-images';
import { Gift, Gifts } from './gifts';
import { format } from 'date-fns';

// A simple (and not cryptographically secure) hashing function for demonstration.
// In a real-world app, use a library like bcryptjs.
const simpleHash = async (password: string): Promise<string> => {
  if (typeof window === 'undefined') {
    return Promise.resolve(password); // Should not happen in client-side flow
  }
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

export interface Transaction {
    id: string;
    type: 'purchase' | 'daily' | 'transfer_sent' | 'transfer_received' | 'gift_sent' | 'gift_received' | 'initial' | 'fee';
    amount: number; // positive for credit, negative for debit
    timestamp: number;
    from?: string;
    to?: string;
    description: string;
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
  coins?: number;
  lastDailyLogin?: string; // YYYY-MM-DD
  transactions?: { [key: string]: Transaction };
}


const getUsersRef = (db: Database) => ref(db, 'users');
const getUserRef = (db: Database, username: string) => ref(db, `users/${username}`);

export const getUserData = async (username: string): Promise<AppUser | null> => {
  const userRef = getUserRef(database, username);
  const snapshot = await get(userRef);
  return snapshot.exists() ? snapshot.val() : null;
};

export const registerUser = async (userData: Omit<AppUser, 'password'> & { password?: string }): Promise<AppUser> => {
  const { name, password, avatarId } = userData;
  const userRef = getUserRef(database, name);
  const snapshot = await get(userRef);

  if (snapshot.exists()) {
    throw new Error('اسم المستخدم هذا موجود بالفعل.');
  }
  if (!password) {
    throw new Error('كلمة المرور مطلوبة.');
  }

  const hashedPassword = await simpleHash(password);
  
  const initialCoins = 50000;
  const transactionId = uuidv4();
  const initialTransaction: Transaction = {
      id: transactionId,
      type: 'initial',
      amount: initialCoins,
      timestamp: Date.now(),
      description: 'مكافأة تسجيل مستخدم جديد',
  };
  
  const newUser: AppUser = {
    ...userData,
    name: name,
    password: hashedPassword,
    avatarId: avatarId || 'avatar1',
    coins: initialCoins,
    transactions: { [transactionId]: initialTransaction },
  };

  await set(userRef, newUser);
  
  // Return user data without the password
  const { password: _, ...userToReturn } = newUser;
  return userToReturn;
}

export const loginUser = async (name: string, passwordAttempt: string): Promise<AppUser> => {
    const user = await getUserData(name);

    if (!user) {
        throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }
    
    if (!user.password) {
        // Handle legacy users without a password
        if (passwordAttempt === '') {
            const { password, ...userToReturn } = user;
            return userToReturn;
        } else {
             throw new Error('حساب قديم، لا يتطلب كلمة مرور.');
        }
    }

    const hashedAttempt = await simpleHash(passwordAttempt);
    if (user.password !== hashedAttempt) {
        throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    const { password, ...userToReturn } = user;
    return userToReturn;
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
    // Make sure to return the user object without the password
    const { password, ...userToReturn } = { ...existingUser, ...updates };
    return userToReturn;
  }
};

export const searchUsers = async (nameQuery: string, currentUsername: string): Promise<AppUser[]> => {
    const usersRef = getUsersRef(database);
    const snapshot = await get(usersRef);
    
    const users: AppUser[] = [];
    if (!snapshot.exists()) {
        return [];
    }

    const allUsers = snapshot.val();
    const currentUserData = allUsers[currentUsername];
    if (!currentUserData) return [];

    const friendNames = new Set(Object.keys(currentUserData.friends || {}));
    const sentRequestNames = new Set(); // You might want to track sent requests if needed
    const receivedRequests = new Set(Object.values(currentUserData.friendRequests || {}).map((req: any) => req.senderName));
    
    for (const username in allUsers) {
        const userData = allUsers[username] as AppUser;
        if (
            userData.name &&
            userData.name.toLowerCase().startsWith(nameQuery.toLowerCase()) &&
            userData.name !== currentUsername &&
            !friendNames.has(userData.name) &&
            !receivedRequests.has(userData.name)
        ) {
            const { password, ...userToReturn } = userData;
            users.push(userToReturn);
        }
    }

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
    updates[`users/${recipientName}/friends/${senderName}`] = true;
    updates[`users/${senderName}/friends/${recipientName}`] = true;
    updates[`users/${recipientName}/friendRequests/${reqKey}`] = null; // Remove request

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
    updates[`users/${currentUsername}/friends/${friendNameToRemove}`] = null;
    updates[`users/${friendNameToRemove}/friends/${currentUsername}`] = null;
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


const generateNumericId = async (length = 8): Promise<string> => {
    let id = '';
    let isUnique = false;
    while (!isUnique) {
        id = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
        const roomRef = ref(database, `rooms/${id}`);
        const snapshot = await get(roomRef);
        if (!snapshot.exists()) {
            isUnique = true;
        }
    }
    return id;
};

type CreateRoomInput = {
    hostName: string;
};

export const createRoom = async ({ hostName }: CreateRoomInput): Promise<{ id: string }> => {
    const newRoomId = await generateNumericId();
    const roomRef = ref(database, `rooms/${newRoomId}`);
    
    const roomName = `غرفة ${hostName}`;
    const roomAvatars = PlaceHolderImages.filter(p => p.id.startsWith('room-avatar-'));
    const randomAvatar = roomAvatars[Math.floor(Math.random() * roomAvatars.length)];
    const avatarUrl = randomAvatar ? randomAvatar.imageUrl : `https://picsum.photos/seed/${newRoomId}/200/200`;

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
        isPrivate: false,
    };
    await set(roomRef, roomData);
    return { id: newRoomId };
};

// --- Gifts & Coins System ---

export const claimDailyLogin = async (username: string): Promise<{ success: boolean; message: string; newBalance?: number }> => {
    const userRef = getUserRef(database, username);
    const today = format(new Date(), 'yyyy-MM-dd');

    return runTransaction(userRef, (user: AppUser | null) => {
        if (user) {
            if (user.lastDailyLogin === today) {
                // Abort transaction by returning undefined
                return;
            }
            user.coins = (user.coins || 0) + 10;
            user.lastDailyLogin = today;

            const transactionId = uuidv4();
            const dailyTransaction: Transaction = {
                id: transactionId,
                type: 'daily',
                amount: 10,
                timestamp: Date.now(),
                description: 'مكافأة تسجيل الدخول اليومي',
            };
            if (!user.transactions) user.transactions = {};
            user.transactions[transactionId] = dailyTransaction;
        }
        return user;
    }).then(result => {
        if (!result.committed) {
            return { success: false, message: 'لقد استلمت مكافأتك اليومية بالفعل.' };
        }
        const updatedUser = result.snapshot.val();
        return { success: true, message: 'تمت إضافة 10 كوينز إلى رصيدك!', newBalance: updatedUser.coins };
    });
};

export const sendGift = async (senderName: string, recipientName: string, giftId: string, roomId: string) => {
    const senderRef = getUserRef(database, senderName);
    const recipientRef = getUserRef(database, recipientName);
    const gift = Gifts.find(g => g.id === giftId);

    if (!gift) throw new Error('الهدية غير موجودة.');

    const [senderSnapshot, recipientSnapshot] = await Promise.all([
        get(senderRef),
        get(recipientRef)
    ]);
    
    const sender = senderSnapshot.val() as AppUser;
    const recipient = recipientSnapshot.val() as AppUser;

    if (!sender || (sender.coins || 0) < gift.cost) {
        throw new Error('ليس لديك كوينزات كافية لإرسال هذه الهدية.');
    }
     if (!recipient) {
        throw new Error('المستخدم المستلم غير موجود.');
    }

    const updates: { [key: string]: any } = {};

    // 1. Deduct coins from sender and add transaction
    const newSenderCoins = sender.coins! - gift.cost;
    const senderTxId = uuidv4();
    const senderTx: Transaction = {
        id: senderTxId,
        type: 'gift_sent',
        amount: -gift.cost,
        timestamp: Date.now(),
        to: recipientName,
        description: `إرسال هدية (${gift.name}) إلى ${recipientName}`,
    };
    updates[`users/${senderName}/coins`] = newSenderCoins;
    updates[`users/${senderName}/transactions/${senderTxId}`] = senderTx;

    // 2. Add coins and transaction to recipient
    const newRecipientCoins = (recipient.coins || 0) + gift.cost;
    const recipientTxId = uuidv4();
    const recipientTx: Transaction = {
        id: recipientTxId,
        type: 'gift_received',
        amount: gift.cost,
        timestamp: Date.now(),
        from: senderName,
        description: `استلام هدية (${gift.name}) من ${senderName}`,
    };
    updates[`users/${recipientName}/coins`] = newRecipientCoins;
    updates[`users/${recipientName}/transactions/${recipientTxId}`] = recipientTx;


    // 3. Push gift event to room
    const giftEvent = {
        id: uuidv4(),
        giftId: gift.id,
        senderName,
        recipientName,
        timestamp: serverTimestamp(),
    };
    const giftStreamPath = `rooms/${roomId}/giftStream/${push(ref(database, `rooms/${roomId}/giftStream`)).key}`;
    updates[giftStreamPath] = giftEvent;
    
    // Perform all updates
    await update(ref(database), updates);

    // Return the new coin balance for the sender
    return newSenderCoins;
};

export const transferCoins = async (senderName: string, recipientName: string, amount: number): Promise<number> => {
    if (amount <= 0) throw new Error('يجب أن يكون المبلغ أكبر من صفر.');
    if (senderName === recipientName) throw new Error('لا يمكنك تحويل الكوينزات إلى نفسك.');

    const senderRef = getUserRef(database, senderName);
    const recipientRef = getUserRef(database, recipientName);

    const senderSnapshot = await get(senderRef);
    const sender = senderSnapshot.val() as AppUser;

    const recipientSnapshot = await get(recipientRef);
    if (!recipientSnapshot.exists()) throw new Error('المستخدم الذي تحاول التحويل له غير موجود.');
    const recipient = recipientSnapshot.val() as AppUser;

    const fee = Math.ceil(amount * 0.10);
    const totalDeduction = amount + fee;

    if (!sender || (sender.coins || 0) < totalDeduction) {
        throw new Error(`ليس لديك كوينزات كافية. المبلغ المطلوب: ${amount} + رسوم ${fee} = ${totalDeduction}`);
    }

    const updates: { [key: string]: any } = {};

    // Sender updates
    const newSenderCoins = sender.coins! - totalDeduction;
    const senderTxId = uuidv4();
    const senderTx: Transaction = {
        id: senderTxId,
        type: 'transfer_sent',
        amount: -amount,
        timestamp: Date.now(),
        to: recipientName,
        description: `تحويل ${amount} كوينز إلى ${recipientName}`,
    };
    const feeTxId = uuidv4();
    const feeTx: Transaction = {
        id: feeTxId,
        type: 'fee',
        amount: -fee,
        timestamp: Date.now(),
        description: `رسوم تحويل 10%`,
    };
    updates[`users/${senderName}/coins`] = newSenderCoins;
    updates[`users/${senderName}/transactions/${senderTxId}`] = senderTx;
    updates[`users/${senderName}/transactions/${feeTxId}`] = feeTx;

    // Recipient updates
    const newRecipientCoins = (recipient.coins || 0) + amount;
    const recipientTxId = uuidv4();
    const recipientTx: Transaction = {
        id: recipientTxId,
        type: 'transfer_received',
        amount: amount,
        timestamp: Date.now(),
        from: senderName,
        description: `استلام ${amount} كوينز من ${senderName}`,
    };
    updates[`users/${recipientName}/coins`] = newRecipientCoins;
    updates[`users/${recipientName}/transactions/${recipientTxId}`] = recipientTx;
    
    await update(ref(database), updates);

    return newSenderCoins;
};

export const purchaseCoins = async (username: string, packageId: string, coinsToAdd: number): Promise<number> => {
    const userRef = getUserRef(database, username);
    
    return runTransaction(userRef, (user: AppUser | null) => {
        if (user) {
            user.coins = (user.coins || 0) + coinsToAdd;
            const transactionId = uuidv4();
            const purchaseTx: Transaction = {
                id: transactionId,
                type: 'purchase',
                amount: coinsToAdd,
                timestamp: Date.now(),
                description: `شراء حزمة كوينزات (${packageId})`,
            };
            if (!user.transactions) user.transactions = {};
            user.transactions[transactionId] = purchaseTx;
        }
        return user;
    }).then(result => {
        if (!result.committed) {
            throw new Error('فشل إتمام عملية الشراء. يرجى المحاولة مرة أخرى.');
        }
        const updatedUser = result.snapshot.val();
        return updatedUser.coins;
    });
};
