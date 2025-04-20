import { defineCollection, z } from 'astro:content';

export const collections = {
  events: defineCollection({
    schema: z.object({
      title: z.string(),
      date: z.string(),         // ISO8601 e.g. "2025-05-10T18:00:00-10:00"
      location: z.string(),
      cover: z.string().optional(),    // image path under /public
      description: z.string().optional()
    })
  })
};
