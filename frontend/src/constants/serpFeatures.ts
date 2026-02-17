export const SERP_FEATURES = [
    'featured_snippet',
    'people_also_ask',
    'top_stories',
    'video',
    'local_pack',
    'image_pack',
    'knowledge_graph',
    'shopping',
] as const;

export type SerpFeature = (typeof SERP_FEATURES)[number];
