'use client';

import useUserSession from '@/hooks/use-user-session';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PlaceHolderImages, ImagePlaceholder } from '@/lib/placeholder-images';
import { User as UserIcon, Loader2, CheckCircle, Image as ImageIcon, Sparkles, Wand2, User, Wallpaper, Trash2, Coins, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { upsertUser, getUserData, deleteUserAccount } from '@/lib/firebase-service';
import { generateAvatar } from '@/ai/flows/generate-avatar-flow';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AppUser } from '@/lib/firebase-service';
import { Separator } from '@/components/ui/separator';
import CoinManagementDialog from '@/components/profile/CoinManagementDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export default function ProfilePage() {
  const { user, setUser, isLoaded } = useUserSession();
  const router = useRouter();
  
  const [currentAvatarId, setCurrentAvatarId] = useState<string | undefined>(user?.avatarId);
  const [selectedImage, setSelectedImage] = useState<ImagePlaceholder | null>(null);
  const [isAvatarUpdatePending, startAvatarUpdateTransition] = useTransition();

  const [generatedAvatars, setGeneratedAvatars] = useState<ImagePlaceholder[]>([]);
  const [avatarPrompt, setAvatarPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [isCoinManagementOpen, setIsCoinManagementOpen] = useState(false);

  // Account Deletion States
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');


  useEffect(() => {
    if (isLoaded && !user) {
      router.push('/');
      return;
    }
    if (user) {
      setCurrentAvatarId(user.avatarId);
      getUserData(user.name).then(fullUser => {
        if (fullUser) {
          if (fullUser.generatedAvatars) {
            setGeneratedAvatars(fullUser.generatedAvatars);
          }
          setUser(prev => ({...prev, ...fullUser}));
        }
      });
    }
  }, [isLoaded, user?.name, router, setUser]);

  const handleUpdateAvatar = (imageToUpdate: ImagePlaceholder) => {
    if (!user || !imageToUpdate) return;
    startAvatarUpdateTransition(async () => {
      try {
        setCurrentAvatarId(imageToUpdate.id);
        const updatedUser = { ...user, avatarId: imageToUpdate.id };
        setUser(updatedUser);
        await upsertUser(updatedUser);
        console.log('تم تحديث الصورة الرمزية بنجاح!');
        setSelectedImage(null);
      } catch (error) {
        console.error('فشل تحديث الصورة الرمزية.');
      }
    });
  };
  
  const handleSetBackground = (imageToSet: ImagePlaceholder) => {
    if (!imageToSet) return;
    document.body.style.setProperty('--app-background-image', `url(${imageToSet.imageUrl})`);
    localStorage.setItem('app-background-image', imageToSet.imageUrl);
    console.log('تم تعيين الخلفية الجديدة!');
    setSelectedImage(null);
  };

  const handleRemoveBackground = () => {
    document.body.style.setProperty('--app-background-image', 'none');
    localStorage.removeItem('app-background-image');
    console.log('تمت إزالة الخلفية والعودة للون الافتراضي!');
  };


  const handleGenerateAvatar = async () => {
    if (!avatarPrompt.trim() || !user) return;
    setIsGenerating(true);
    try {
        const { imageUrl } = await generateAvatar({ prompt: avatarPrompt });
        const newAvatar: ImagePlaceholder = {
            id: `gen-${Date.now()}`,
            description: avatarPrompt,
            imageUrl: imageUrl,
            imageHint: 'generated avatar'
        };
        setGeneratedAvatars(prev => [newAvatar, ...prev]);
        await upsertUser({ name: user.name, newAvatar: newAvatar });
        setAvatarPrompt('');
    } catch (error) {
        console.error("Avatar generation failed:", error);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !deletePassword.trim()) {
        setDeleteError('يرجى إدخال كلمة المرور لتأكيد الحذف.');
        return;
    }
    setDeleteError('');
    setIsDeleting(true);
    try {
        await deleteUserAccount(user.name, deletePassword);
        window.alert('تم حذف حسابك بنجاح. سنفتقدك!');
        setIsDeleteDialogOpen(false);
        setUser(null);
        router.push('/');
    } catch (error: any) {
        setDeleteError(error.message || 'فشلت عملية الحذف. يرجى التأكد من كلمة المرور.');
    } finally {
        setIsDeleting(false);
    }
  };


  const currentAvatarDetails = [...generatedAvatars, ...PlaceHolderImages].find(p => p.id === user?.avatarId) ?? PlaceHolderImages.find(p => p.id === 'avatar1');
  
  const selectableAvatars = useMemo(() => 
    [...generatedAvatars, ...PlaceHolderImages.filter(p => p.id.startsWith('avatar'))],
    [generatedAvatars]
  );
  
  const selectableBackgrounds = useMemo(() => 
    PlaceHolderImages.filter(p => p.id.startsWith('bg') || p.id.startsWith('user-bg') || p.id.startsWith('room-bg')),
    []
  );

  if (!isLoaded || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-accent" />
      </div>
    );
  }

  const isSelectedImageAvatar = selectedImage && (selectedImage.id.startsWith('avatar') || selectedImage.id.startsWith('gen'));
  const isSelectedImageBackground = selectedImage && !isSelectedImageAvatar;


  return (
    <>
    <div className="flex flex-col items-center justify-center pt-8 pb-12 gap-12">
      <Card className="w-full max-w-sm bg-card/50 backdrop-blur-lg border-accent/20 text-center shadow-lg">
        <CardHeader className="flex flex-col items-center">
          <Avatar className="w-32 h-32 border-4 border-accent mb-4">
            <AvatarImage src={currentAvatarDetails?.imageUrl} alt={user.name} data-ai-hint={currentAvatarDetails?.imageHint} />
            <AvatarFallback className="bg-muted">
              <UserIcon className="w-16 h-16" />
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-4xl font-headline font-bold text-foreground">{user.name}</CardTitle>
          <CardDescription className="text-lg text-muted-foreground">"عشاق السينما"</CardDescription>
        </CardHeader>
        <CardContent>
            <Button onClick={() => setIsCoinManagementOpen(true)} className="w-full">
                <Coins className="me-2" />
                <span>{user.coins?.toLocaleString() || 0}</span>
                <span className="ms-2">إدارة الكوينزات</span>
            </Button>
        </CardContent>
      </Card>
      
      <Card className="w-full max-w-4xl bg-card/50 backdrop-blur-lg border-accent/20 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="text-accent" />
            <span>اصنع صورتك الرمزية بالذكاء الاصطناعي</span>
          </CardTitle>
          <CardDescription>
            اكتب وصفًا للصورة التي تتخيلها، ودع الذكاء الاصطناعي يصنعها لك.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex gap-2">
                <Input
                    type="text"
                    placeholder="مثال: رجل فضاء يرتدي خوذة زهرية..."
                    value={avatarPrompt}
                    onChange={(e) => setAvatarPrompt(e.target.value)}
                    disabled={isGenerating}
                    className="bg-input"
                />
                <Button onClick={handleGenerateAvatar} disabled={isGenerating || !avatarPrompt.trim()}>
                    {isGenerating ? <Loader2 className="me-2 animate-spin" /> : <Wand2 className="me-2" />}
                    إنشاء
                </Button>
            </div>
        </CardContent>
      </Card>


      <Card className="w-full max-w-4xl bg-card/50 backdrop-blur-lg border-accent/20 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="text-accent" />
            <span>تخصيص المظهر</span>
          </CardTitle>
          <CardDescription>
            اختر صورة لتعيينها كصورة رمزية أو كخلفية للتطبيق.
          </CardDescription>
        </CardHeader>
        <CardContent>
            {selectedImage && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-4 mb-6 bg-secondary/30 rounded-lg">
                <Image
                  src={selectedImage.imageUrl}
                  alt={selectedImage.description}
                  width={100}
                  height={100}
                  className={cn(
                    "rounded-lg object-cover border-4 border-accent",
                     isSelectedImageAvatar ? 'aspect-square rounded-full' : 'aspect-video'
                  )}
                />
                <div className="flex flex-col sm:flex-row gap-3">
                  {isSelectedImageAvatar && (
                    <Button onClick={() => handleUpdateAvatar(selectedImage)} disabled={isAvatarUpdatePending}>
                      {isAvatarUpdatePending ? <Loader2 className="animate-spin me-2" /> : <User className="me-2" />}
                      تعيين كصورة رمزية
                    </Button>
                  )}
                  {isSelectedImageBackground && (
                    <Button onClick={() => handleSetBackground(selectedImage)} variant="secondary">
                       <Wallpaper className="me-2" />
                      تعيين كخلفية
                    </Button>
                  )}
                </div>
              </div>
            )}
            
            <div className='space-y-6'>
                <div>
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <UserIcon className="text-accent"/>
                    الصور الرمزية
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-4">
                     {selectableAvatars.map((img) => {
                      const isSelectedForAction = selectedImage?.id === img.id;
                      const isCurrentAvatar = currentAvatarId === img.id;
                      return (
                        <div key={img.id} className="relative cursor-pointer group" onClick={() => setSelectedImage(img)}>
                          <Image src={img.imageUrl} alt={img.description} width={100} height={100} className={cn("w-full h-full aspect-square object-cover border-4 transition-all rounded-full", isSelectedForAction ? "border-accent ring-4 ring-accent/50" : "border-transparent group-hover:border-accent/50")} data-ai-hint={img.imageHint} />
                          {isCurrentAvatar && !isSelectedForAction && (
                            <div className="absolute -top-1 -right-1 bg-primary rounded-full p-1 text-primary-foreground" title="الصورة الرمزية الحالية">
                                <CheckCircle className="w-5 h-5" />
                            </div>
                           )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Separator />
                <div>
                   <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Wallpaper className="text-accent"/>
                            خلفيات التطبيق
                        </h3>
                        <Button variant="destructive" size="sm" onClick={handleRemoveBackground}>
                            <Trash2 className="me-2" />
                            إزالة الخلفية
                        </Button>
                   </div>
                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                     {selectableBackgrounds.map((img) => {
                       const isSelectedForAction = selectedImage?.id === img.id;
                       return (
                        <div key={img.id} className="relative cursor-pointer group" onClick={() => setSelectedImage(img)}>
                          <Image src={img.imageUrl} alt={img.description} width={1920} height={1080} className={cn("w-full h-full aspect-video object-cover border-4 transition-all rounded-lg", isSelectedForAction ? "border-accent ring-4 ring-accent/50" : "border-transparent group-hover:border-accent/50")} data-ai-hint={img.imageHint} />
                        </div>
                       );
                     })}
                   </div>
                </div>
            </div>
        </CardContent>
      </Card>

      {/* Danger Zone: Account Deletion */}
      <Card className="w-full max-w-4xl bg-card/50 backdrop-blur-lg border-destructive/20 shadow-lg border-t-4 border-t-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-6 h-6" />
            <span>منطقة الخطر</span>
          </CardTitle>
          <CardDescription>
            هذا القسم يحتوي على إجراءات لا يمكن التراجع عنها. يرجى توخي الحذر.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-right">
                <h4 className="font-bold text-foreground">حذف الحساب نهائياً</h4>
                <p className="text-sm text-muted-foreground">سيتم حذف كافة بياناتك، صورك الرمزية، كوينزاتك، وأصدقائك للأبد.</p>
            </div>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 className="me-2 h-4 w-4" />
                حذف حسابي
            </Button>
        </CardContent>
      </Card>
    </div>

    {/* Delete Confirmation Dialog */}
    <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setIsDeleteDialogOpen(open);
        if(!open) {
            setDeletePassword('');
            setDeleteError('');
        }
    }}>
        <DialogContent className="max-w-md bg-card border-destructive/30">
            <DialogHeader>
                <DialogTitle className="text-2xl text-destructive flex items-center gap-2">
                    <Trash2 className="w-6 h-6" />
                    تأكيد حذف الحساب
                </DialogTitle>
                <DialogDescription className="text-base pt-2">
                    أنت على وشك حذف حسابك نهائياً. يرجى إدخال كلمة المرور الخاصة بك لتأكيد هذا الإجراء.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">كلمة المرور</label>
                    <Input 
                        type="password"
                        placeholder="أدخل كلمة المرور هنا..."
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="h-12 bg-input/50 text-center text-lg focus:ring-destructive border-destructive/20"
                        autoFocus
                    />
                </div>
                {deleteError && (
                    <div className="p-3 rounded bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center font-medium">
                        {deleteError}
                    </div>
                )}
            </div>
            <DialogFooter className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" className="w-full" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>إلغاء</Button>
                <Button variant="destructive" className="w-full" onClick={handleDeleteAccount} disabled={isDeleting || !deletePassword.trim()}>
                    {isDeleting ? <Loader2 className="animate-spin me-2 h-4 w-4" /> : <Trash2 className="me-2 h-4 w-4" />}
                    حذف الحساب نهائياً
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <CoinManagementDialog isOpen={isCoinManagementOpen} onOpenChange={setIsCoinManagementOpen} user={user} />
    </>
  );
}
