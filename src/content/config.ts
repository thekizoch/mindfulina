// mindfulina/src/content/config.ts
import { defineCollection, z } from 'astro:content';

export const collections = {
  events: defineCollection({
    schema: z.object({
      title: z.string(),
      date: z.string(),         // ISO8601 e.g. "2025-05-10T18:00:00-10:00"
      location: z.string(),
      cover: z.string().optional(),    // image path under /public
      description: z.string().optional(), // Description in frontmatter, if any
      googleCalendarEventId: z.string().optional(), // For tracking/linking
      isAllDay: z.boolean().optional(),         // From GCal
      eventbriteLink: z.string().optional()   // For the Eventbrite "Buy Tickets" link
    })
  })
  // If you have other collections, like 'brand', and want to stop the auto-generation warning,
  // you would define them here too. For example:
  // brand: defineCollection({
  //   schema: z.object({
  //     // define brand schema fields here if needed, e.g.,
  //     // title: z.string(), 
  //     // etc.
  //   })
  // })
};
