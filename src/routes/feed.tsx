import { FormEvent, useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";

type FeedPost = {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  created_at: string;
};

type FeedComment = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  created_at: string;
};

type CommentsByPost = Record<string, FeedComment[]>;

export const Route = createFileRoute("/feed")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: FeedPage,
});

function getRelativeTime(value: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );

  if (seconds < 10) return "agora";
  if (seconds < 60) return `há ${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes}min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;

  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function Avatar({
  name,
  url,
  small = false,
}: {
  name: string;
  url: string | null;
  small?: boolean;
}) {
  if (url) {
    return (
      <img
        className={`feed-avatar ${small ? "feed-avatar-small" : ""}`}
        src={url}
        alt={`Avatar de ${name}`}
      />
    );
  }

  return (
    <div
      className={`feed-avatar feed-avatar-placeholder ${small ? "feed-avatar-small" : ""}`}
      aria-label={`Avatar de ${name}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function FeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [comments, setComments] = useState<CommentsByPost>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [postText, setPostText] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [commenting, setCommenting] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("posts")
        .select(
          "id, author_id, author_name, author_avatar_url, content, created_at",
        )
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;
      setPosts((data ?? []) as FeedPost[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  async function publishPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = postText.trim();
    if (!content || publishing) return;

    try {
      setPublishing(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Sua sessão expirou. Entre novamente.");
      }

      const name =
        user.user_metadata?.full_name ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "Usuário";
      const avatarUrl = user.user_metadata?.avatar_url ?? null;

      const { data, error: insertError } = await supabase
        .from("posts")
        .insert({
          author_id: user.id,
          author_name: name,
          author_avatar_url: avatarUrl,
          content,
        })
        .select(
          "id, author_id, author_name, author_avatar_url, content, created_at",
        )
        .single();

      if (insertError) throw insertError;

      setPosts((current) => [data as FeedPost, ...current]);
      setPostText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível publicar.");
    } finally {
      setPublishing(false);
    }
  }

  async function toggleComments(postId: string) {
    const next = !expanded[postId];

    setExpanded((current) => ({ ...current, [postId]: next }));

    if (!next || comments[postId]) return;

    const { data, error: queryError } = await supabase
      .from("comments")
      .select(
        "id, post_id, author_id, author_name, author_avatar_url, content, created_at",
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (queryError) {
      setError(queryError.message);
      return;
    }

    setComments((current) => ({
      ...current,
      [postId]: (data ?? []) as FeedComment[],
    }));
  }

  async function addComment(
    event: FormEvent<HTMLFormElement>,
    postId: string,
  ) {
    event.preventDefault();

    const content = commentText[postId]?.trim();
    if (!content || commenting[postId]) return;

    try {
      setCommenting((current) => ({ ...current, [postId]: true }));
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Sua sessão expirou. Entre novamente.");

      const name =
        user.user_metadata?.full_name ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "Usuário";
      const avatarUrl = user.user_metadata?.avatar_url ?? null;

      const { data, error: insertError } = await supabase
        .from("comments")
        .insert({
          post_id: postId,
          author_id: user.id,
          author_name: name,
          author_avatar_url: avatarUrl,
          content,
        })
        .select(
          "id, post_id, author_id, author_name, author_avatar_url, content, created_at",
        )
        .single();

      if (insertError) throw insertError;

      setComments((current) => ({
        ...current,
        [postId]: [...(current[postId] ?? []), data as FeedComment],
      }));
      setCommentText((current) => ({ ...current, [postId]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível comentar.");
    } finally {
      setCommenting((current) => ({ ...current, [postId]: false }));
    }
  }

  return (
    <main className="feed-page">
      <div className="feed-container">
        <header className="feed-header">
          <div>
            <span className="eyebrow">VIVIAN / FEED</span>
            <h1>Feed</h1>
          </div>

          <div className="feed-header-actions">
            <Link className="btn-ghost" to="/profile">
              Perfil
            </Link>
            <span className="status-pulse">ONLINE</span>
          </div>
        </header>

        <section className="card feed-composer">
          <span className="eyebrow">NOVO POST</span>
          <form onSubmit={publishPost}>
            <textarea
              className="field feed-textarea"
              value={postText}
              onChange={(event) => setPostText(event.target.value)}
              placeholder="O que está acontecendo?"
              maxLength={2000}
              disabled={publishing}
            />
            <div className="feed-composer-footer">
              <span className="muted">{postText.length}/2000</span>
              <button
                className="btn-primary"
                type="submit"
                disabled={!postText.trim() || publishing}
              >
                {publishing ? "Publicando..." : "Publicar"}
              </button>
            </div>
          </form>
        </section>

        {error && (
          <div className="feed-error" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="feed-loading">
            <span className="eyebrow">CARREGANDO FEED</span>
          </div>
        ) : posts.length === 0 ? (
          <section className="card feed-empty">
            <span className="eyebrow">SEM POSTS</span>
            <p className="muted">Seja o primeiro a publicar alguma coisa.</p>
          </section>
        ) : (
          <section className="feed-list" aria-label="Publicações">
            {posts.map((post) => (
              <article className="card feed-post" key={post.id}>
                <div className="feed-post-header">
                  <Avatar
                    name={post.author_name}
                    url={post.author_avatar_url}
                  />
                  <div className="feed-author">
                    <strong>{post.author_name}</strong>
                    <span className="muted">
                      {getRelativeTime(post.created_at)}
                    </span>
                  </div>
                </div>

                <p className="feed-post-content">{post.content}</p>

                <button
                  className="btn-ghost feed-comments-toggle"
                  type="button"
                  onClick={() => void toggleComments(post.id)}
                >
                  {expanded[post.id]
                    ? "Ocultar comentários"
                    : `Comentários${comments[post.id] ? ` · ${comments[post.id].length}` : ""}`}
                </button>

                {expanded[post.id] && (
                  <div className="feed-comments">
                    <div className="feed-comment-list">
                      {(comments[post.id] ?? []).map((comment) => (
                        <div className="feed-comment" key={comment.id}>
                          <Avatar
                            name={comment.author_name}
                            url={comment.author_avatar_url}
                            small
                          />
                          <div>
                            <div className="feed-comment-meta">
                              <strong>{comment.author_name}</strong>
                              <span className="muted">
                                {getRelativeTime(comment.created_at)}
                              </span>
                            </div>
                            <p>{comment.content}</p>
                          </div>
                        </div>
                      ))}
                      {comments[post.id]?.length === 0 && (
                        <p className="muted feed-no-comments">
                          Nenhum comentário ainda.
                        </p>
                      )}
                    </div>

                    <form
                      className="feed-comment-form"
                      onSubmit={(event) => void addComment(event, post.id)}
                    >
                      <input
                        className="field"
                        value={commentText[post.id] ?? ""}
                        onChange={(event) =>
                          setCommentText((current) => ({
                            ...current,
                            [post.id]: event.target.value,
                          }))
                        }
                        placeholder="Escreva um comentário..."
                        maxLength={1000}
                      />
                      <button
                        className="btn-primary"
                        type="submit"
                        disabled={
                          !commentText[post.id]?.trim() ||
                          commenting[post.id]
                        }
                      >
                        {commenting[post.id] ? "Enviando..." : "Comentar"}
                      </button>
                    </form>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
