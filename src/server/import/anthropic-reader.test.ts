import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it, vi } from "vitest";
import { extractedRecipeSchema, type ExtractedRecipe } from "@/domain/import/extraction";
import { createAnthropicReader } from "./anthropic-reader";
import type { PreparedImage } from "./normalize-image";

const page: PreparedImage = {
  label: "Whole page",
  data: Buffer.from("jpeg bytes"),
  width: 10,
  height: 20,
};
const tile: PreparedImage = {
  label: "Enlarged part, row 1 of 1, column 1 of 2",
  data: Buffer.from("x"),
  width: 5,
  height: 5,
};

const recipe: ExtractedRecipe = {
  title: "Pfannkuchen",
  subtitle: "",
  servingsMin: 4,
  servingsMax: 4,
  servingsRaw: "für 4 Personen",
  page: 12,
  prepMinutes: 20,
  dishType: "hauptgericht",
  proteinType: "vegetarian",
  ingredients: [],
  uncertain: [],
  notes: [],
};

/** A stand-in for the API client that records the request and returns a canned answer. */
function fakeClient(answer: Record<string, unknown>) {
  const parse = vi.fn().mockResolvedValue({
    model: "test-model-1",
    stop_reason: "end_turn",
    parsed_output: recipe,
    usage: { input_tokens: 1200, output_tokens: 300 },
    ...answer,
  });
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

describe("createAnthropicReader", () => {
  it("sends every image with its label and asks for the strict recipe format", async () => {
    const { client, parse } = fakeClient({});
    const reading = await createAnthropicReader({ client, model: "configured-model" })([
      page,
      tile,
    ]);

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe("configured-model");
    expect(request.messages[0].content.map((block: { type: string }) => block.type)).toEqual([
      "text",
      "image",
      "text",
      "image",
      "text",
    ]);
    expect(request.messages[0].content[0].text).toBe("Whole page:");
    expect(request.messages[0].content[1].source).toEqual({
      type: "base64",
      media_type: "image/jpeg",
      data: page.data.toString("base64"),
    });
    expect(request.output_config.effort).toBe("medium");
    expect(request.output_config.format.type).toBe("json_schema");
    expect(reading).toEqual({
      recipe,
      model: "test-model-1",
      usage: { inputTokens: 1200, outputTokens: 300 },
    });
  });

  it("reports a declined request instead of returning what came back", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
    await expect(createAnthropicReader({ client, model: "m" })([page])).rejects.toMatchObject({
      name: "RecipeReadError",
      failure: "refused",
    });
  });

  it("reports an answer that was cut off", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens" });
    await expect(createAnthropicReader({ client, model: "m" })([page])).rejects.toMatchObject({
      failure: "truncated",
    });
  });

  it("reports an answer that does not match the format", async () => {
    const { client } = fakeClient({ parsed_output: null });
    await expect(createAnthropicReader({ client, model: "m" })([page])).rejects.toMatchObject({
      failure: "invalid",
    });
  });
});

describe("recipe format as sent to the API", () => {
  it("converts to a JSON schema with every field required and no extra fields allowed", () => {
    const format = zodOutputFormat(extractedRecipeSchema);
    const schema = format.schema as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { items?: { required: string[]; additionalProperties: boolean } }>;
    };
    expect(format.type).toBe("json_schema");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual(Object.keys(extractedRecipeSchema.shape).sort());
    expect(schema.properties.ingredients.items?.additionalProperties).toBe(false);
    expect(schema.properties.ingredients.items?.required).toHaveLength(13);
  });
});
