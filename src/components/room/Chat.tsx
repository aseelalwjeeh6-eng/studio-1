'use client';

import { useState, useEffect, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, push, set, off } from 'firebase/database';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { User } from '@/app/providers';
import { Trash2, Send, Mic, MicOff, MessageCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';

interface ChatProps {
  roomId: string;
  user: User;
  isHost: boolean;
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isSystemMessage?: boolean;
}

const ChatMessages = ({ roomId, user }: { roomId: string; user: User }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const viewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!roomId) return;
        const chatRef = ref(database, `rooms/${roomId}/chat`);
        const listener = onValue(chatRef, (snapshot) => {
            const data = snapshot.val();
            const loadedMessages: Message[] = data ? Object.values(data) : [];
            setMessages(loadedMessages.sort((a, b) => a.timestamp - b.timestamp));
        });
        return () => off(chatRef, 'value', listener);
    }, [roomId]);

    useEffect(() => {
        if (viewportRef.current) {
            viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <ScrollArea className="h-full w-full" viewportRef={viewportRef}>
            <div className="p-4 space-y-4">
                {messages.map((msg) => {
                    const isCurrentUser = msg.sender === user.name;
                    if (msg.isSystemMessage) {
                        return (
                            <p key={msg.id} className="text-sm text-muted-foreground italic text-center py-1">
                                {msg.text}
                            </p>
                        );
                    }
                    return (
                        <div key={msg.id} className={cn("flex flex-col", isCurrentUser ? "items-end" : "items-start")}>
                            {!isCurrentUser && (
                                <span className="text-xs text-muted-foreground px-3">{msg.sender}</span>
                            )}
                             <div className={cn(
                                "max-w-xs md:max-w-md p-3 rounded-2xl break-words",
                                isCurrentUser 
                                    ? "bg-primary text-primary-foreground rounded-br-none" 
                                    : "bg-secondary text-secondary-foreground rounded-bl-none"
                            )}>
                                <p className="text-md">{msg.text}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
};

const ChatInput = ({ roomId, user, isSeated, isMuted, onToggleMute }: { roomId: string; user: User; isSeated: boolean; isMuted: boolean; onToggleMute: () => void; }) => {
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() === '' || isSending) return;

        setIsSending(true);
        try {
            const chatRef = ref(database, `rooms/${roomId}/chat`);
            const newMsgRef = push(chatRef);
            const messageData: Message = {
                id: newMsgRef.key!,
                sender: user.name,
                text: newMessage,
                timestamp: Date.now(),
            };
            await set(newMsgRef, messageData);
            setNewMessage('');
        } catch(error) {
            console.error("Error sending message:", error);
        } finally {
            setIsSending(false);
        }
    };
    
    return (
        <div className="p-4 border-t border-border flex-shrink-0 bg-card/80 backdrop-blur-lg">
            <form onSubmit={handleSendMessage} className="flex w-full items-center gap-2">
                {isSeated && (
                    <Button type="button" size="icon" variant="ghost" onClick={onToggleMute}>
                    {isMuted ? <MicOff className="w-5 h-5 text-destructive" /> : <Mic className="w-5 h-5 text-accent" />}
                    </Button>
                )}
                <Input
                    type="text"
                    placeholder="اكتب رسالتك..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="bg-input/80 backdrop-blur-sm border-border focus:ring-accent"
                    disabled={isSending}
                />
                <Button type="submit" size="icon" disabled={isSending || !newMessage.trim()}>
                    <Send className="h-4 w-4" />
                </Button>
            </form>
        </div>
    );
};

const ChatHeader = ({ isHost, roomId }: { isHost: boolean, roomId: string }) => {
    const handleClearChat = async () => {
        const chatRef = ref(database, `rooms/${roomId}/chat`);
        await set(chatRef, null);
    };

    return (
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <h2 className="text-lg font-semibold flex items-center gap-2"><MessageCircle className="text-accent" /><span>الدردشة</span></h2>
            {isHost && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                            <Trash2 className="me-2 text-destructive" />
                            مسح
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                            <AlertDialogDescription>
                                هذا الإجراء سيقوم بحذف سجل الدردشة بالكامل لجميع المستخدمين في الغرفة. لا يمكن التراجع عن هذا الإجراء.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={handleClearChat} className="bg-destructive hover:bg-destructive/90">
                                نعم، قم بالمسح
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    );
};


export { ChatMessages, ChatInput, ChatHeader };
