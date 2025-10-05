'use server';

/**
 * @fileOverview A flow for searching YouTube videos.
 *
 * - searchYoutube - A function that searches YouTube for videos.
 * - YoutubeSearchInput - The input type for the searchYoutube function.
 * - YoutubeSearchOutput - The return type for the searchYoutube function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const YoutubeSearchInputSchema = z.object({
  query: z.string().describe('The search query for YouTube.'),
});
export type YoutubeSearchInput = z.infer<typeof YoutubeSearchInputSchema>;

const YoutubeVideoSchema = z.object({
  id: z.object({
    videoId: z.string(),
  }),
  snippet: z.object({
    title: z.string(),
    description: z.string(),
    channelTitle: z.string(),
    thumbnails: z.object({
      default: z.object({
        url: z.string(),
      }),
      medium: z.object({
        url: z.string(),
      }),
       high: z.object({
        url: z.string(),
      }),
    }),
  }),
  contentDetails: z.object({
    duration: z.string(),
  }).optional(),
});
export type YouTubeVideo = z.infer<typeof YoutubeVideoSchema>;


const YoutubeSearchOutputSchema = z.object({
  items: z.array(YoutubeVideoSchema),
});
export type YoutubeSearchOutput = z.infer<typeof YoutubeSearchOutputSchema>;

async function doYoutubeSearch(query: string): Promise<YoutubeSearchOutput> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not set');
  }
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(
    query
  )}&key=${apiKey}&type=video`;

  try {
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      const errorBody = await searchResponse.text();
      throw new Error(`YouTube API search request failed with status ${searchResponse.status}: ${errorBody}`);
    }
    const searchData = await searchResponse.json();
    
    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
    
    if (!videoIds) {
      return { items: [] };
    }

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${apiKey}`;
    const detailsResponse = await fetch(detailsUrl);
    if (!detailsResponse.ok) {
        throw new Error(`YouTube API details request failed with status ${detailsResponse.status}`);
    }
    const detailsData = await detailsResponse.json();

    const durationsMap = new Map(detailsData.items.map((item: any) => [item.id, item.contentDetails.duration]));

    const mergedItems = searchData.items.map((item: any) => ({
      ...item,
      contentDetails: {
        duration: durationsMap.get(item.id.videoId) || 'PT0S',
      }
    }));
    
    const parsedData = YoutubeSearchOutputSchema.parse({ items: mergedItems });
    return parsedData;

  } catch (error) {
    console.error('Error searching YouTube:', error);
    throw new Error('Failed to search YouTube.');
  }
}

export const searchYoutubeTool = ai.defineTool(
    {
      name: 'searchYoutubeTool',
      description: 'Searches YouTube for videos based on a query.',
      inputSchema: YoutubeSearchInputSchema,
      outputSchema: YoutubeSearchOutputSchema,
    },
    async (input) => doYoutubeSearch(input.query),
);


const youtubeSearchFlow = ai.defineFlow(
  {
    name: 'youtubeSearchFlow',
    inputSchema: YoutubeSearchInputSchema,
    outputSchema: YoutubeSearchOutputSchema,
  },
  async (input) => {
    return await doYoutubeSearch(input.query);
  }
);

export async function searchYoutube(input: YoutubeSearchInput): Promise<YoutubeSearchOutput> {
  return youtubeSearchFlow(input);
}
