'use client';

import { useState, useEffect, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, push, set, off } from 'firebase/database';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { User } from '@/app/providers';
import { Trash2, Send, Mic, MicOff, MessageCircle, Gift, CornerUpLeft, X } from 'lucide-react';
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
  quotedMessage?: string;
  quotedSender?: string;
}

const ChatMessages = ({ roomId, user, onReply }: { roomId: string; user: User; onReply: (message: Message) => void; }) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    useEffect(() => {
        if (!roomId) return;
        const chatRef = ref(database, `rooms/${roomId}/chat`);
        const listener = onValue(chatRef, (snapshot) => {
            const data = snapshot.val();
            const loadedMessages: Message[] = data ? Object.values(data) : [];
            const sortedMessages = loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
            setMessages(sortedMessages);
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
            <div className="p-2 md:p-4 space-y-3 flex flex-col">
                {messages.map((msg) => {
                    const isCurrentUser = msg.sender === user.name;
                    if (msg.isSystemMessage) {
                        return (
                            <p key={msg.id} className="text-xs text-muted-foreground italic text-center py-1 w-full self-center">
                                {msg.text}
                            </p>
                        );
                    }
                    return (
                        <div key={msg.id} className={cn("flex items-center gap-2 group w-full", "justify-end")}>
                             {!msg.isSystemMessage && (
                                <button onClick={() => onReply(msg)} className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-black/20 self-center">
                                    <CornerUpLeft className="w-4 h-4" />
                                </button>
                            )}
                            <div className={cn("flex flex-col max-w-[80%]")}>
                                <span className="text-xs text-muted-foreground px-3">{msg.sender}</span>
                                <div className={cn(
                                    "p-2 md:p-3 rounded-xl break-words",
                                    isCurrentUser 
                                        ? "bg-primary text-primary-foreground" 
                                        : "bg-secondary text-secondary-foreground"
                                )}>
                                    {msg.quotedMessage && (
                                        <div className="p-2 rounded-md bg-black/20 border-b border-white/20 mb-2">
                                            <p className="text-xs font-bold">{msg.quotedSender}</p>
                                            <p className="text-sm opacity-80 line-clamp-2">{msg.quotedMessage}</p>
                                        </div>
                                    )}
                                    <p className="text-sm">{msg.text}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
};

const ChatInput = ({ roomId, user, isSeated, isMuted, onToggleMute, inputRef, onFocus, onBlur, onSend, isSending, onOpenGiftShop, replyingTo, onCancelReply }: { roomId: string; user: User; isSeated: boolean; isMuted: boolean; onToggleMute: () => void; inputRef: React.RefObject<HTMLInputElement>; onFocus: () => void; onBlur: () => void; onSend: (value: string) => Promise<void>; isSending: boolean; onOpenGiftShop: () => void; replyingTo: Message | null; onCancelReply: () => void; }) => {
    const [newMessage, setNewMessage] = useState('');

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() === '' || isSending) return;
        await onSend(newMessage);
        setNewMessage('');
    };
    
    return (
        <div className="p-2 md:p-4 border-t border-border flex-shrink-0 bg-card/80 backdrop-blur-lg">
            {replyingTo && (
                <div className="px-3 py-2 bg-secondary/50 rounded-t-md flex justify-between items-center mx-1">
                    <div className="text-xs overflow-hidden">
                        <p className="font-bold text-accent">الرد على {replyingTo.sender}</p>
                        <p className="truncate text-muted-foreground">{replyingTo.text}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={onCancelReply}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}
            <form onSubmit={handleSendMessage} className="flex w-full items-center gap-2">
                {isSeated && (
                     <Button type="button" size="icon" variant="ghost" onClick={onToggleMute} className="h-11 w-11 flex-shrink-0">
                        {isMuted ? <MicOff className="w-5 h-5 text-destructive" /> : <Mic className="w-5 h-5 text-accent" />}
                    </Button>
                )}
                 <Button type="button" size="icon" variant="ghost" onClick={onOpenGiftShop} className="h-12 w-12 flex-shrink-0 text-pink-400 hover:text-pink-500 hover:bg-pink-400/10">
                    <Gift className="h-6 w-6" />
                </Button>
                <Input
                    ref={inputRef}
                    type="text"
                    placeholder="اكتب رسالتك..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className={cn("bg-input/80 backdrop-blur-sm border-border focus:ring-accent h-12 flex-grow", replyingTo && "rounded-t-none")}
                    disabled={isSending}
                    onFocus={onFocus}
                    onBlur={onBlur}
                />
                <Button type="submit" size="icon" disabled={isSending || !newMessage.trim()} className="h-12 w-12 flex-shrink-0">
                    <Send className="h-5 w-5" />
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
        <div className="flex items-center justify-between p-2 md:p-4 border-b border-border flex-shrink-0">
            <h2 className="text-md md:text-lg font-semibold flex items-center gap-2"><MessageCircle className="text-accent" /><span>الدردشة</span></h2>
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

      