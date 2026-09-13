import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { RecipeDraft } from '@/domain/recipe/types';
import { AiNutritionSchema, AiRecipeSchema, toNutrition, type AiRecipe } from './schemas';
import {
  NUTRITION_PROMPT, PHOTO_DISH_PROMPT, PHOTO_RECIPE_PROMPT, SYSTEM_PROMPT, TEXT_RECIPE_PROMPT,
} from './prompts';
import { describeDraft } from './anthropic';
import type { AiProvider, ImageInput } from './provider';

/**
 * OpenRouter speaks the OpenAI chat-completions dialect, so one adapter covers
 * every model it proxies. Pick the model with CHEFMIND_AI_MODEL, e.g.
 * "anthropic/claude-sonnet-5" or "google/gemini-3-pro".
 *
 * Note that not every OpenRouter model supports images or strict JSON schemas —
 * the failure surfaces as a plain API error, which is why the model is an
 * explicit choice rather than a default.
 */
export function createOpenRouterProvider(): AiProvider {
  const model = process.env.CHEFMIND_AI_MODEL!;
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/ConstantinTi/ChefMind',
      'X-Title': 'ChefMind',
    },
  });

  async function complete<T>(
    content: OpenAI.Chat.Completions.ChatCompletionContentPart[],
    schema: typeof AiRecipeSchema | typeof AiNutritionSchema,
    schemaName: string,
  ): Promise<T> {
    const response = await client.chat.completions.parse({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    });

    const parsed = response.choices[0]?.message.parsed;
    if (!parsed) throw new Error('Die KI hat kein auswertbares Ergebnis zurückgegeben.');
    return parsed as T;
  }

  return {
    name: 'openrouter',
    model,

    async extractFromImages(images: ImageInput[], mode, hint) {
      const prompt = mode === 'dish' ? PHOTO_DISH_PROMPT : PHOTO_RECIPE_PROMPT;
      return complete<AiRecipe>([
        ...images.map((img): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
          type: 'image_url',
          image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
        })),
        { type: 'text', text: hint ? `${prompt}\n\nHinweis des Nutzers: ${hint}` : prompt },
      ], AiRecipeSchema, 'rezept');
    },

    async extractFromText(text, hint) {
      return complete<AiRecipe>([{
        type: 'text',
        text: `${TEXT_RECIPE_PROMPT}${hint ? `\n\nHinweis: ${hint}` : ''}\n\n---\n${text}`,
      }], AiRecipeSchema, 'rezept');
    },

    async estimateNutrition(draft: RecipeDraft) {
      const raw = await complete<z.infer<typeof AiNutritionSchema>>(
        [{ type: 'text', text: `${NUTRITION_PROMPT}\n\n${describeDraft(draft)}` }],
        AiNutritionSchema,
        'naehrwerte',
      );
      return toNutrition(raw);
    },
  };
}
