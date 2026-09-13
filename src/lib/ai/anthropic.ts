import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { RecipeDraft } from '@/domain/recipe/types';
import { AiNutritionSchema, AiRecipeSchema, toNutrition, type AiRecipe } from './schemas';
import {
  NUTRITION_PROMPT, PHOTO_DISH_PROMPT, PHOTO_RECIPE_PROMPT, SYSTEM_PROMPT, TEXT_RECIPE_PROMPT,
} from './prompts';
import type { AiProvider, ImageInput } from './provider';

const DEFAULT_MODEL = 'claude-opus-5';

export function createAnthropicProvider(): AiProvider {
  const client = new Anthropic();
  const model = process.env.CHEFMIND_AI_MODEL ?? DEFAULT_MODEL;

  async function parseRecipe(content: Anthropic.ContentBlockParam[]): Promise<AiRecipe> {
    const response = await client.messages.parse({
      model,
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content }],
      // Structured outputs mean the response is schema-valid on arrival —
      // no JSON repair, no retry loop, no "the model wrapped it in markdown".
      output_config: { format: zodOutputFormat(AiRecipeSchema) },
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Die KI hat die Verarbeitung dieses Bildes abgelehnt.');
    }
    if (!response.parsed_output) {
      throw new Error('Die KI hat kein auswertbares Rezept zurückgegeben.');
    }
    return response.parsed_output;
  }

  return {
    name: 'anthropic',
    model,

    async extractFromImages(images: ImageInput[], mode, hint) {
      const prompt = mode === 'dish' ? PHOTO_DISH_PROMPT : PHOTO_RECIPE_PROMPT;
      return parseRecipe([
        ...images.map((img): Anthropic.ContentBlockParam => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
        })),
        { type: 'text', text: hint ? `${prompt}\n\nHinweis des Nutzers: ${hint}` : prompt },
      ]);
    },

    async extractFromText(text, hint) {
      return parseRecipe([{
        type: 'text',
        text: `${TEXT_RECIPE_PROMPT}${hint ? `\n\nHinweis: ${hint}` : ''}\n\n---\n${text}`,
      }]);
    },

    async estimateNutrition(draft: RecipeDraft) {
      const response = await client.messages.parse({
        model,
        max_tokens: 2_000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `${NUTRITION_PROMPT}\n\n${describeDraft(draft)}` }],
        output_config: { format: zodOutputFormat(AiNutritionSchema) },
      });
      return response.parsed_output ? toNutrition(response.parsed_output) : null;
    },
  };
}

export function describeDraft(draft: RecipeDraft): string {
  const lines = draft.ingredients.map((i) => {
    const q = i.quantity;
    const amount =
      q.kind === 'exact' || q.kind === 'approx' ? `${q.amount} ${q.unit ?? 'Stück'}`
      : q.kind === 'range' ? `${q.min}-${q.max} ${q.unit ?? 'Stück'}`
      : q.kind === 'toTaste' ? 'nach Geschmack'
      : '';
    return `- ${amount} ${i.name}`.replace(/\s+/g, ' ');
  });
  return [`Titel: ${draft.title}`, `Portionen: ${draft.baseServings}`, 'Zutaten:', ...lines].join('\n');
}
