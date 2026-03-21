export type MediaPreviewItem = {
  altText: string | null;
  gifConvertible: boolean;
  previewUrl: string;
  sourceUrl: string | null;
  type: 'gif' | 'image' | 'video';
};

export type MediaPreview = {
  authorAvatarUrl: string | null;
  authorHandle: string | null;
  authorName: string | null;
  canonicalUrl: string | null;
  likes: number | null;
  media: MediaPreviewItem[];
  platform: string;
  publishedAt: string | null;
  replies: number | null;
  reposts: number | null;
  sensitive: boolean;
  sourceUrl: string;
  text: string | null;
  title: string | null;
  translatedText: string | null;
};

export type MediaGifResult = {
  expiresAt: string | null;
  gifUrl: string | null;
  message: string | null;
  provider: string | null;
  status: 'error' | 'queued' | 'ready';
};

export type TranslateMediaTextResult = {
  provider: string | null;
  translatedText: string;
};
