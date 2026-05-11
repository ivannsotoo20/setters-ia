'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { User, Camera, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  updateOwnProfileAction,
  updateOwnAvatarUrlAction,
  type ProfileSnapshot,
} from '@/lib/actions/profile';

interface ProfileFormProps {
  initial: ProfileSnapshot;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB (alineado con bucket policy).
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function ProfileForm({ initial }: ProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileSnapshot>(initial);
  const [fullName, setFullName] = useState(initial.fullName ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [bio, setBio] = useState(initial.bio ?? '');
  const [savingProfile, startSaveProfile] = useTransition();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const dirty =
    (profile.fullName ?? '') !== fullName ||
    (profile.phone ?? '') !== phone ||
    (profile.bio ?? '') !== bio;

  function onPickAvatar() {
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      toast.error('Formato no soportado. Usa JPG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Imagen demasiado grande (máx 2 MB).');
      return;
    }

    setUploadingAvatar(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      // path = <user_id>/<timestamp>.<ext> — coincide con la policy de Storage
      // que valida (storage.foldername(name))[1] = auth.uid()::text
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        });
      if (uploadError) {
        toast.error(`No se pudo subir la foto: ${uploadError.message}`);
        return;
      }

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      // Cache-bust en la URL para que el browser muestre la nueva imagen.
      const finalUrl = `${publicUrl}?v=${Date.now()}`;

      const updateResult = await updateOwnAvatarUrlAction(publicUrl);
      if (!updateResult.ok) {
        toast.error(updateResult.error);
        return;
      }

      setProfile((prev) => ({ ...prev, avatarUrl: finalUrl }));
      toast.success('Foto de perfil actualizada');
      router.refresh();
    } finally {
      setUploadingAvatar(false);
      // reset input para permitir re-subir mismo archivo
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function onRemoveAvatar() {
    if (!profile.avatarUrl) return;
    if (!confirm('¿Eliminar la foto de perfil?')) return;
    setUploadingAvatar(true);
    try {
      const result = await updateOwnAvatarUrlAction(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setProfile((prev) => ({ ...prev, avatarUrl: null }));
      toast.success('Foto eliminada');
      router.refresh();
    } finally {
      setUploadingAvatar(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingProfile || !dirty) return;
    startSaveProfile(async () => {
      const result = await updateOwnProfileAction({ fullName, phone, bio });
      if (result.ok) {
        setProfile(result.profile);
        setFullName(result.profile.fullName ?? '');
        setPhone(result.profile.phone ?? '');
        setBio(result.profile.bio ?? '');
        toast.success('Perfil actualizado');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col sm:flex-row sm:items-center gap-6 rounded-lg border border-border bg-muted/40 p-6">
        <div className="relative shrink-0">
          <div className="size-24 rounded-full overflow-hidden border border-border bg-background flex items-center justify-center">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt="Avatar"
                className="size-full object-cover"
              />
            ) : (
              <User className="size-12 text-muted-foreground" aria-hidden />
            )}
          </div>
          {uploadingAvatar ? (
            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
              <Loader2 className="size-6 text-white animate-spin" />
            </div>
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 className="text-lg font-semibold tracking-tight">
              {profile.fullName ?? 'Sin nombre'}
            </h2>
            {profile.isAgencyAdmin ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
              >
                Admin Fyzon
              </Badge>
            ) : (
              <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
                {profile.role === 'owner' ? 'Owner' : profile.role === 'admin' ? 'Colaborador' : 'Viewer'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
          <div className="flex gap-2 mt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={onFileChange}
            />
            <Button size="sm" variant="outline" onClick={onPickAvatar} disabled={uploadingAvatar}>
              <Camera className="size-3.5" />
              {profile.avatarUrl ? 'Cambiar foto' : 'Subir foto'}
            </Button>
            {profile.avatarUrl ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onRemoveAvatar}
                disabled={uploadingAvatar}
                className="text-muted-foreground"
              >
                <Trash2 className="size-3.5" />
                Eliminar
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            JPG, PNG o WebP · máx 2 MB.
          </p>
        </div>
      </section>

      <form onSubmit={onSubmit} className="flex flex-col gap-5 max-w-2xl">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-full-name">Nombre completo</Label>
          <Input
            id="profile-full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre y apellidos"
            required
            maxLength={120}
            disabled={savingProfile}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            value={profile.email}
            disabled
            readOnly
            className="opacity-70"
          />
          <p className="text-xs text-muted-foreground">
            El email lo gestiona Supabase Auth. Si necesitas cambiarlo, contacta con un admin.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-phone">Teléfono</Label>
          <Input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+34 600 123 456"
            maxLength={32}
            disabled={savingProfile}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-bio">Biografía</Label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Una descripción corta sobre ti (opcional)."
            rows={4}
            maxLength={500}
            disabled={savingProfile}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-[11px] text-muted-foreground">
            {bio.length} / 500
          </p>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={savingProfile || !dirty}>
            {savingProfile ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar cambios'
            )}
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              disabled={savingProfile}
              onClick={() => {
                setFullName(profile.fullName ?? '');
                setPhone(profile.phone ?? '');
                setBio(profile.bio ?? '');
              }}
            >
              Descartar
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
