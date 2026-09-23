import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type UsernameState = "idle" | "checking" | "available" | "taken";

export const Route = createFileRoute("/profile")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: ProfilePage,
});

const USERNAME_PATTERN = /^[a-z0-9]{3,20}$/;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function validateUsername(value: string) {
  if (!value) return "O username é obrigatório.";
  if (value.length < 3) return "Use pelo menos 3 caracteres.";
  if (value.length > 20) return "Use no máximo 20 caracteres.";
  if (!USERNAME_PATTERN.test(value)) {
    return "Use apenas letras minúsculas e números, sem espaços.";
  }
  return null;
}

function getFileExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && /^[a-z0-9]+$/.test(extension)) {
    return extension;
  }

  const mimeExtension = file.type.split("/")[1]?.toLowerCase();
  return mimeExtension && /^[a-z0-9]+$/.test(mimeExtension)
    ? mimeExtension
    : "jpg";
}

function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [usernameState, setUsernameState] =
    useState<UsernameState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("Sua sessão expirou. Entre novamente.");
        }

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id, username, display_name, bio, avatar_url, created_at, updated_at",
          )
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!cancelled) {
          if (data) {
            const currentProfile = data as Profile;
            setProfile(currentProfile);
            setDisplayName(currentProfile.display_name ?? "");
            setUsername(currentProfile.username ?? "");
            setBio(currentProfile.bio ?? "");
            setAvatarUrl(currentProfile.avatar_url);
          } else {
            setProfile(null);
            setDisplayName(
              user.user_metadata?.full_name ??
                user.user_metadata?.name ??
                "",
            );
            setUsername("");
            setBio("");
            setAvatarUrl(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar seu perfil.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function handleUsernameChange(value: string) {
    const normalized = value.toLowerCase().replace(/\s/g, "");
    setUsername(normalized);
    setUsernameState("idle");
    setError(null);
    setSuccess(null);
  }

  async function checkUsernameAvailability(
    value = username,
  ): Promise<"available" | "taken" | "invalid"> {
    const normalized = value.trim().toLowerCase();
    const validationError = validateUsername(normalized);

    if (validationError) {
      setUsernameState("idle");
      return "invalid";
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Sua sessão expirou. Entre novamente.");
    }

    setUsernameState("checking");

    const { data, error: queryError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalized)
      .neq("id", user.id)
      .maybeSingle();

    if (queryError) throw queryError;

    if (data) {
      setUsernameState("taken");
      return "taken";
    }

    setUsernameState("available");
    return "available";
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Selecione apenas um arquivo de imagem.");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setError("A imagem deve ter no máximo 5 MB.");
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;

    setAvatarFile(file);
    setPreviewUrl(nextPreviewUrl);
    setError(null);
    setSuccess(null);
  }

  async function uploadAvatar(userId: string, file: File) {
    const extension = getFileExtension(file);
    const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    return { filePath, publicUrl: data.publicUrl };
  }

  async function saveProfile() {
    if (saving) return;

    setError(null);
    setSuccess(null);

    const normalizedUsername = username.trim().toLowerCase();
    const usernameError = validateUsername(normalizedUsername);

    if (usernameError) {
      setUsernameState("idle");
      setError(usernameError);
      return;
    }

    setSaving(true);

    let uploadedAvatarPath: string | null = null;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Sua sessão expirou. Entre novamente.");
      }

      const availability = await checkUsernameAvailability(normalizedUsername);

      if (availability !== "available") {
        throw new Error(
          availability === "taken"
            ? "Esse username já está em uso."
            : "O username informado não é válido.",
        );
      }

      let nextAvatarUrl = avatarUrl;

      if (avatarFile) {
        const uploaded = await uploadAvatar(user.id, avatarFile);
        uploadedAvatarPath = uploaded.filePath;
        nextAvatarUrl = uploaded.publicUrl;
      }

      const { data, error: updateError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            username: normalizedUsername,
            display_name: displayName.trim() || null,
            bio: bio.trim() || null,
            avatar_url: nextAvatarUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
        .select(
          "id, username, display_name, bio, avatar_url, created_at, updated_at",
        )
        .single();

      if (updateError) throw updateError;

      setProfile(data as Profile);
      setDisplayName(data.display_name ?? "");
      setUsername(data.username ?? "");
      setBio(data.bio ?? "");
      setAvatarUrl(data.avatar_url);
      setAvatarFile(null);
      setPreviewUrl(null);
      setUsernameState("available");
      setSuccess("Perfil atualizado.");

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    } catch (err) {
      if (uploadedAvatarPath) {
        await supabase.storage.from("avatars").remove([uploadedAvatarPath]);
      }

      const message =
        err instanceof Error ? err.message : "Não foi possível salvar o perfil.";

      setError(
        message.includes("duplicate key") || message.includes("profiles_username")
          ? "Esse username já está em uso."
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setError(null);

    const { error: logoutError } = await supabase.auth.signOut();

    if (logoutError) {
      setError(logoutError.message);
      setLoggingOut(false);
      return;
    }

    void navigate({ to: "/", replace: true });
  }

  const visibleAvatarUrl = previewUrl ?? avatarUrl;

  if (loading) {
    return (
      <main className="profile-page">
        <div className="profile-shell">
          <div className="profile-loading">
            <span className="eyebrow">CARREGANDO PERFIL</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <div className="profile-shell">
        <header className="top-bar profile-top-bar">
          <div>
            <span className="eyebrow">VIVIAN / PROFILE</span>
            <h1>Perfil</h1>
          </div>

          <button
            className="btn-ghost profile-logout"
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
          >
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
        </header>

        {error && (
          <div className="profile-message profile-message-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="profile-message profile-message-success" role="status">
            {success}
          </div>
        )}

        <section className="card profile-card">
          <div className="profile-avatar-section">
            {visibleAvatarUrl ? (
              <img
                className="avatar profile-avatar"
                src={visibleAvatarUrl}
                alt="Foto de perfil"
              />
            ) : (
              <div className="avatar profile-avatar profile-avatar-placeholder">
                {(displayName || username || "V").charAt(0).toUpperCase()}
              </div>
            )}

            <div className="profile-avatar-copy">
              <span className="eyebrow">AVATAR</span>
              <p className="muted">
                JPG, PNG, GIF ou WebP · máximo 5 MB
              </p>
              <input
                ref={fileInputRef}
                className="profile-file-input"
                type="file"
                accept="image/*"
                onChange={(event) => void handleAvatarChange(event)}
              />
              <button
                className="btn-ghost profile-upload-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                {avatarFile ? "Trocar imagem" : "Escolher imagem"}
              </button>
              {avatarFile && (
                <span className="profile-pending">
                  Nova imagem pronta para salvar.
                </span>
              )}
            </div>
          </div>

          <div className="profile-form">
            <label className="profile-field">
              <span className="eyebrow">NOME DE EXIBIÇÃO</span>
              <input
                className="field"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setSuccess(null);
                }}
                maxLength={60}
                placeholder="Como você quer aparecer?"
                disabled={saving}
              />
            </label>

            <label className="profile-field">
              <span className="eyebrow">USERNAME</span>
              <input
                className="field"
                value={username}
                onChange={(event) => handleUsernameChange(event.target.value)}
                onBlur={() =>
                  void checkUsernameAvailability().catch((err) => {
                    setUsernameState("idle");
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Não foi possível verificar o username.",
                    );
                  })
                }
                minLength={3}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="seuusername"
                disabled={saving}
              />
              <span
                className={
                  usernameState === "taken"
                    ? "profile-hint profile-hint-error"
                    : usernameState === "available"
                      ? "profile-hint profile-hint-success"
                      : "profile-hint"
                }
              >
                {usernameState === "checking" && "Verificando disponibilidade..."}
                {usernameState === "available" && "Username disponível."}
                {usernameState === "taken" && "Esse username já está em uso."}
                {usernameState === "idle" &&
                  "3–20 caracteres, somente letras minúsculas e números."}
              </span>
            </label>

            <label className="profile-field">
              <span className="eyebrow">BIO</span>
              <textarea
                className="field profile-bio"
                value={bio}
                onChange={(event) => {
                  setBio(event.target.value);
                  setSuccess(null);
                }}
                maxLength={280}
                placeholder="Conte um pouco sobre você..."
                disabled={saving}
              />
              <span className="profile-counter">{bio.length}/280</span>
            </label>

            <div className="profile-actions">
              <button
                className="btn-primary"
                type="button"
                onClick={() => void saveProfile()}
                disabled={saving || usernameState === "checking"}
              >
                {saving ? "Salvando..." : "Salvar perfil"}
              </button>

              {avatarFile && saving && (
                <span className="profile-upload-status">
                  Enviando imagem...
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="profile-footer">
          <span className="muted">
            {profile?.username ? `@${profile.username}` : "Perfil Vivian"}
          </span>
        </div>
      </div>
    </main>
  );
}
