"use client";

import { FileX } from "lucide-react";
import { useRouter } from "next/navigation";
import { use } from "react";
import type { FeedPost } from "@vereine/shared";
import { PostCard } from "@/components/post-card";
import { ArrowLink, CardSkeletons, EmptyState, ErrorState } from "@/components/ui";
import { BackButton } from "@/components/ui-client";
import { useApi } from "@/lib/use-api";
import { usePageTitle } from "@/lib/use-page-title";
import { titleFromBody } from "@/lib/post-title";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const post = useApi<FeedPost>(`/posts/${id}`);
  usePageTitle(post.data ? titleFromBody(post.data.body) ?? `Beitrag von ${post.data.org?.name ?? post.data.author.name}` : null);

  let content;
  if (post.errorStatus === 404 || post.errorStatus === 400) {
    content = (
      <EmptyState icon={FileX} title="Diesen Beitrag gibt es nicht (mehr)." action={<ArrowLink href="/feed">Zum Feed</ArrowLink>}>
        Er wurde gelöscht, ausgeblendet oder ist nur für Follower sichtbar.
      </EmptyState>
    );
  } else if (post.error && !post.data) content = <ErrorState message={post.error} onRetry={post.reload} />;
  else if (!post.data) content = <CardSkeletons count={1} />;
  else content = <PostCard post={post.data} initialCommentsOpen onDeleted={() => router.push("/feed")} onHidden={() => router.push("/feed")} />;

  return (
    <div className="mx-auto max-w-2xl">
      <BackButton fallback="/feed" className="mb-3">Zurück</BackButton>
      {content}
    </div>
  );
}
