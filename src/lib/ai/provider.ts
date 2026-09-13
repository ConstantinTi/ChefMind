import type { RecipeDraft } from '@/domain/recipe/types';
import type { AiRecipe, NutritionEstimate } from './schemas';

export interface ImageInput {
  /** Raw base64, without a data: prefix. */
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export type ExtractMode = 'recipe' | 'dish' | 'text';

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  extractFromImages(images: ImageInput[], mode: 'recipe' | 'dish', hint?: string): Promise<AiRecipe>;
  extractFromText(text: string, hint?: string): Promise<AiRecipe>;
  estimateNutrition(draft: RecipeDraft): Promise<NutritionEstimate>;
}

export class AiNotConfiguredError extends Error {
  constructor(message = 'Kein KI-Anbieter konfiguriert. Setze CHEFMIND_AI_PROVIDER und den passenden API-Key.') {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

/**
 * Resolves the provider from the environment. Kept lazy so the app starts (and
 * the URL importer, which needs no LLM at all, keeps working) without any key.
 */
export async function getAiProvider(): Promise<AiProvider> {
  const provider = (process.env.CHEFMIND_AI_PROVIDER ?? 'anthropic').toLowerCase();

  switch (provider) {
    case 'anthropic': {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new AiNotConfiguredError('ANTHROPIC_API_KEY fehlt.');
      }
      const { createAnthropicProvider } = await import('./anthropic');
      return createAnthropicProvider();
    }
    case 'openrouter': {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new AiNotConfiguredError('OPENROUTER_API_KEY fehlt.');
      }
      if (!process.env.CHEFMIND_AI_MODEL) {
        throw new AiNotConfiguredError(
          'Bei OpenRouter muss CHEFMIND_AI_MODEL gesetzt sein, z. B. anthropic/claude-sonnet-5.',
        );
      }
      const { createOpenRouterProvider } = await import('./openrouter');
      return createOpenRouterProvider();
    }
    case 'none':
      throw new AiNotConfiguredError('KI-Import ist deaktiviert (CHEFMIND_AI_PROVIDER=none).');
    default:
      throw new AiNotConfiguredError(`Unbekannter KI-Anbieter: ${provider}`);
  }
}

export function isAiConfigured(): boolean {
  const provider = (process.env.CHEFMIND_AI_PROVIDER ?? 'anthropic').toLowerCase();
  if (provider === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === 'openrouter') return Boolean(process.env.OPENROUTER_API_KEY && process.env.CHEFMIND_AI_MODEL);
  return false;
}
