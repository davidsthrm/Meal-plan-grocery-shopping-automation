import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { extractedRecipeSchema, type ExtractedRecipe } from "@/domain/import/extraction";
import {
  pageFrameSchema,
  uprightChoiceSchema,
  type PageFrame,
  type UprightChoice,
} from "@/domain/import/frame";
import {
  transcriptionForVerification,
  verificationSchema,
  type Verification,
} from "@/domain/import/verification";
import type { PreparedImage } from "./normalize-image";
import { suggestionSchema, toProposals, type Suggestions } from "@/domain/import/proposal";
import { stepsReadingSchema, type StepsReading } from "@/domain/import/steps";
import { pageSurveySchema, type PageSurvey } from "@/domain/import/survey";
import { taggingLine, taggingSchema } from "@/domain/library/tagging";
import {
  EXTRACTION_PROMPT,
  FRAME_PROMPT,
  PASTED_TEXT_NOTE,
  STEPS_PROMPT,
  STEPS_VERIFICATION_PROMPT,
  SUGGESTION_PROMPT,
  SURVEY_PROMPT,
  TAGGING_PROMPT,
  UPRIGHT_PROMPT,
  VERIFICATION_PROMPT,
} from "./prompt";
import {
  RecipeReadError,
  type CatalogSuggester,
  type PageFramer,
  type PageSurveyor,
  type ReadOptions,
  type RecipeReader,
  type RecipeTagger,
  type RecipeVerifier,
  type StepsReader,
  type StepsVerifier,
  type TextRecipeReader,
  type UprightFinder,
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

/** Tells the model which recipe is meant when the photos show more than one. */
function focus(read: ReadOptions | undefined): string {
  if (!read?.focus && !read?.focusTitle) return "";
  const which = read.focus
    ? `Only recipe ${read.focus.position} of the ${read.focus.count} on the page is meant, counted in reading order`
    : "Only one of them is meant";
  const named = read.focusTitle
    ? `: the one titled "${read.focusTitle}".`
    : ": the one whose title is not on the photos.";
  return ` The photos show more than one recipe. ${which}${named}`;
}

/**
 * The client every request goes through unless a test brings its own. A function on Vercel
 * has 300 seconds, and one import step can make three requests: each gives up after 90
 * seconds and is tried once more only when the service asks for a pause or is busy. The
 * batch page then hears "throttled" and carries on by itself.
 */
let shared: Anthropic | null = null;
const sharedClient = () => (shared ??= new Anthropic({ timeout: 90_000, maxRetries: 1 }));

/** Sends one structured-output request and returns the parsed answer with its token usage. */
async function ask<T>(
  options: AnthropicReaderOptions,
  system: string,
  content: Anthropic.ContentBlockParam[],
  format: ReturnType<typeof zodOutputFormat>,
): Promise<{ output: T; model: string; usage: { inputTokens: number; outputTokens: number } }> {
  const client = options.client ?? sharedClient();
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
  return async (images, read) => {
    const { output, model, usage } = await ask<ExtractedRecipe>(
      options,
      EXTRACTION_PROMPT,
      [
        ...imageBlocks(images),
        { type: "text", text: `Read the recipe on these photos.${focus(read)}` },
      ],
      zodOutputFormat(extractedRecipeSchema),
    );
    return { recipe: output, model, usage };
  };
}

/** Reads a recipe from pasted text with a Claude model, by the same rules as from photos. */
export function createAnthropicTextReader(options: AnthropicReaderOptions): TextRecipeReader {
  return async (text) => {
    const { output, model, usage } = await ask<ExtractedRecipe>(
      options,
      `${EXTRACTION_PROMPT}\n\n${PASTED_TEXT_NOTE}`,
      [{ type: "text", text: `Read the recipe in this text.\n\n<text>\n${text}\n</text>` }],
      zodOutputFormat(extractedRecipeSchema),
    );
    return { recipe: output, model, usage };
  };
}

/** Suggests tags for recipes with a Claude model, from what is known about them as text. */
export function createAnthropicTagger(options: AnthropicReaderOptions): RecipeTagger {
  return async (recipes) => {
    if (recipes.length === 0)
      return { suggestions: [], usage: { inputTokens: 0, outputTokens: 0 } };
    const { output, usage } = await ask<z.infer<typeof taggingSchema>>(
      { effort: "low", ...options },
      TAGGING_PROMPT,
      [{ type: "text", text: recipes.map((recipe, i) => taggingLine(recipe, i + 1)).join("\n") }],
      zodOutputFormat(taggingSchema),
    );
    return {
      suggestions: recipes.map((_, i) => output.recipes.find((entry) => entry.n === i + 1) ?? null),
      usage,
    };
  };
}

/** Takes the first look at a page with a Claude model. Low effort: it only sorts pages. */
export function createAnthropicSurveyor(options: AnthropicReaderOptions): PageSurveyor {
  return async (image) => {
    const { output, usage } = await ask<PageSurvey>(
      { effort: "low", ...options },
      SURVEY_PROMPT,
      [...imageBlocks([image]), { type: "text", text: "Which recipes are on this photo?" }],
      zodOutputFormat(pageSurveySchema),
    );
    return { survey: output, usage };
  };
}

/** Says how a page lies and where its recipes are, with a Claude model. Low effort. */
export function createAnthropicFramer(options: AnthropicReaderOptions): PageFramer {
  return async (image, titles) => {
    const { output, usage } = await ask<PageFrame>(
      { effort: "low", ...options },
      FRAME_PROMPT,
      [
        ...imageBlocks([image]),
        {
          type: "text",
          text: `Recipes on this photo: ${titles.map((title) => JSON.stringify(title)).join(", ")}`,
        },
      ],
      zodOutputFormat(pageFrameSchema),
    );
    return { frame: output, usage };
  };
}

/** Picks the upright one of four copies of a page with a Claude model. Low effort. */
export function createAnthropicUprightFinder(options: AnthropicReaderOptions): UprightFinder {
  return async (copies) => {
    const { output, usage } = await ask<UprightChoice>(
      { effort: "low", ...options },
      UPRIGHT_PROMPT,
      [...imageBlocks(copies), { type: "text", text: "Which copy is upright?" }],
      zodOutputFormat(uprightChoiceSchema),
    );
    return { upright: output.upright, usage };
  };
}

/** Checks a transcription against its photos with a Claude model, in a request of its own. */
export function createAnthropicVerifier(options: AnthropicReaderOptions): RecipeVerifier {
  return async (images, recipe, read) => {
    const transcription = JSON.stringify(transcriptionForVerification(recipe), null, 1);
    const { output, model, usage } = await ask<Verification>(
      options,
      VERIFICATION_PROMPT,
      [
        ...imageBlocks(images),
        { type: "text", text: `Transcription to check.${focus(read)}\n${transcription}` },
      ],
      zodOutputFormat(verificationSchema),
    );
    return { verification: output, model, usage };
  };
}

/** Reads only the steps of a recipe in the library with a Claude model. */
export function createAnthropicStepsReader(options: AnthropicReaderOptions): StepsReader {
  return async (images, read) => {
    const { output, usage } = await ask<StepsReading>(
      options,
      STEPS_PROMPT,
      [
        ...imageBlocks(images),
        {
          type: "text",
          text: `Read the preparation steps of the recipe on these photos.${focus(read)}`,
        },
      ],
      zodOutputFormat(stepsReadingSchema),
    );
    return { reading: output, usage };
  };
}

/** Checks steps read by `createAnthropicStepsReader` against the photos, in a request of its own. */
export function createAnthropicStepsVerifier(options: AnthropicReaderOptions): StepsVerifier {
  return async (images, steps, read) => {
    const transcription = JSON.stringify(
      { steps: steps.map((text, index) => ({ index, text })) },
      null,
      1,
    );
    const { output, model, usage } = await ask<Verification>(
      options,
      STEPS_VERIFICATION_PROMPT,
      [
        ...imageBlocks(images),
        { type: "text", text: `Steps to check.${focus(read)}\n${transcription}` },
      ],
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
