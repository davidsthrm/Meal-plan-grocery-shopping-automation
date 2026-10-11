import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { extractedRecipeSchema, type ExtractedRecipe } from "@/domain/import/extraction";
import {
  transcriptionForVerification,
  verificationSchema,
  type Verification,
} from "@/domain/import/verification";
import type { PreparedImage } from "./normalize-image";
import { suggestionSchema, toProposals, type Suggestions } from "@/domain/import/proposal";
import { EXTRACTION_PROMPT, SUGGESTION_PROMPT, VERIFICATION_PROMPT } from "./prompt";
import {
  RecipeReadError,
  type CatalogSuggester,
  type RecipeReader,
  type RecipeVerifier,
} from "./read-recipe";

export interface AnthropicReaderOptions {
  /** Model ID. Comes from configuration, never from code. */
  model: string;
  /** How much the model thinks before answering. More costs more output tokens. */
  effort?: "low" | "medium" | "high";
  /** Defaults to a client that reads ANTHROPIC_API_KEY from the environment. */
  client?: Anthropic;
}

function imageBlocks(images: PreparedImage[]): Anthropic.ContentBlockParam[] {
  return images.flatMap((image): Anthropic.ContentBlockParam[] => [
    { type: "text", text: `${image.label}:` },
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: image.data.toString("base64") },
    },
  ]);
}

/** Sends one structured-output request and returns the parsed answer with its token usage. */
async function ask<T>(
  options: AnthropicReaderOptions,
  system: string,
  content: Anthropic.ContentBlockParam[],
  format: ReturnType<typeof zodOutputFormat>,
): Promise<{ output: T; model: string; usage: { inputTokens: number; outputTokens: number } }> {
  const client = options.client ?? new Anthropic();
  const response = await client.messages.parse({
    model: options.model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content }],
    output_config: { effort: options.effort ?? "medium", format },
  });

  // Check why the model stopped before trusting what it returned.
  if (response.stop_reason === "refusal") {
    throw new RecipeReadError("refused", "The model declined to read this photo.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new RecipeReadError("truncated", "The model's answer was cut off.");
  }
  if (!response.parsed_output) {
    throw new RecipeReadError("invalid", "The model's answer did not match the required format.");
  }
  return {
    output: response.parsed_output as T,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

/** Reads a recipe with a Claude model and returns it in the import's strict format. */
export function createAnthropicReader(options: AnthropicReaderOptions): RecipeReader {
  return async (images) => {
    const { output, model, usage } = await ask<ExtractedRecipe>(
      options,
      EXTRACTION_PROMPT,
      [...imageBlocks(images), { type: "text", text: "Read the recipe on these photos." }],
      zodOutputFormat(extractedRecipeSchema),
    );
    return { recipe: output, model, usage };
  };
}

/** Checks a transcription against its photos with a Claude model, in a request of its own. */
export function createAnthropicVerifier(options: AnthropicReaderOptions): RecipeVerifier {
  return async (images, recipe) => {
    const transcription = JSON.stringify(transcriptionForVerification(recipe), null, 1);
    const { output, model, usage } = await ask<Verification>(
      options,
      VERIFICATION_PROMPT,
      [...imageBlocks(images), { type: "text", text: `Transcription to check:\n${transcription}` }],
      zodOutputFormat(verificationSchema),
    );
    return { verification: output, model, usage };
  };
}

/** Suggests catalog entries for unknown ingredients with a Claude model. Text only. */
export function createAnthropicSuggester(options: AnthropicReaderOptions): CatalogSuggester {
  return async (names, index) => {
    if (names.length === 0) return [];
    const { catalog } = index;
    const { output } = await ask<Suggestions>(
      options,
      SUGGESTION_PROMPT,
      [
        {
          type: "text",
          text: [
            `Aisle groups: ${catalog.aisleGroups.map((a) => a.name).join("; ")}`,
            `Catalog: ${catalog.ingredients.map((i) => i.name).join("; ")}`,
            `Unknown ingredients: ${names.join("; ")}`,
          ].join("\n\n"),
        },
      ],
      zodOutputFormat(suggestionSchema(catalog.aisleGroups.map((a) => a.name))),
    );
    return toProposals(names, output.suggestions, index);
  };
}
