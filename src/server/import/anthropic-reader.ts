import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { extractedRecipeSchema } from "@/domain/import/extraction";
import type { PreparedImage } from "./normalize-image";
import { EXTRACTION_PROMPT } from "./prompt";
import { RecipeReadError, type RecipeReader } from "./read-recipe";

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

/** Reads a recipe with a Claude model and returns it in the import's strict format. */
export function createAnthropicReader(options: AnthropicReaderOptions): RecipeReader {
  const client = options.client ?? new Anthropic();

  return async (images) => {
    const response = await client.messages.parse({
      model: options.model,
      max_tokens: 16000,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks(images),
            { type: "text", text: "Read the recipe on this page." },
          ],
        },
      ],
      output_config: {
        effort: options.effort ?? "medium",
        format: zodOutputFormat(extractedRecipeSchema),
      },
    });

    // Check why the model stopped before trusting what it returned.
    if (response.stop_reason === "refusal") {
      throw new RecipeReadError("refused", "The model declined to read this photo.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new RecipeReadError("truncated", "The model's answer was cut off.");
    }
    if (!response.parsed_output) {
      throw new RecipeReadError("invalid", "The model's answer did not match the recipe format.");
    }
    return {
      recipe: response.parsed_output,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  };
}
