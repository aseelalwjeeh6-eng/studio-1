'use server';
/**
 * @fileOverview A flow for generating room avatars from a room name.
 *
 * - generateRoomAvatar - A function that handles the room avatar generation process.
 * - GenerateRoomAvatarInput - The input type for the generateRoomAvatar function.
 * - GenerateRoomAvatarOutput - The return type for the generateRoomAvatar function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateRoomAvatarInputSchema = z.object({
  roomName: z.string().describe('The name of the room to generate an avatar for.'),
});
export type GenerateRoomAvatarInput = z.infer<typeof GenerateRoomAvatarInputSchema>;

const GenerateRoomAvatarOutputSchema = z.object({
    imageUrl: z.string().describe("The data URI of the generated avatar image. Expected format: 'data:image/png;base64,<encoded_data>'."),
});
export type GenerateRoomAvatarOutput = z.infer<typeof GenerateRoomAvatarOutputSchema>;

export async function generateRoomAvatar(input: GenerateRoomAvatarInput): Promise<GenerateRoomAvatarOutput> {
  return generateRoomAvatarFlow(input);
}

const generateRoomAvatarFlow = ai.defineFlow(
  {
    name: 'generateRoomAvatarFlow',
    inputSchema: GenerateRoomAvatarInputSchema,
    outputSchema: GenerateRoomAvatarOutputSchema,
  },
  async ({roomName}) => {
    const {media} = await ai.generate({
      model: 'googleai/imagen-4.0-fast-generate-001',
      prompt: `A cool, modern, cinematic logo for a movie room named '${roomName}'. Vector style, on a clean background. Should be visually appealing as a small icon.`,
      config: {
        aspectRatio: '1:1',
      },
    });

    if (!media.url) {
        throw new Error('Image generation failed to produce a URL.');
    }
    
    return {
      imageUrl: media.url,
    };
  }
);
