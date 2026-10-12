import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it, vi } from "vitest";
import { extractedRecipeSchema, type ExtractedRecipe } from "@/domain/import/extraction";
import { createAnthropicReader, createAnthropicVerifier } from "./anthropic-reader";
import type { PreparedImage } from "./normalize-image";

const page: PreparedImage = {
  label: "Page 1",
  data: Buffer.from("jpeg bytes"),
  width: 10,
  height: 20,
};
const tile: PreparedImage = {
  label: "Enlarged part of Page 1, row 1 of 1, column 1 of 2",
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
    expect(request.messages[0].content[0].text).toBe("Page 1:");
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

  it("says which recipe is meant when a photo shows several", async () => {
    const { client, parse } = fakeClient({});
    const read = createAnthropicReader({ client, model: "m" });
    const lastText = () => {
      const content = parse.mock.calls.at(-1)![0].messages[0].content;
      return content[content.length - 1].text as string;
    };
    await read([page]);
    expect(lastText()).toBe("Read the recipe on these photos.");
    await read([page], { focusTitle: "Linsen-Eintopf", focus: { position: 3, count: 4 } });
    expect(lastText()).toContain(
      'Only recipe 3 of the 4 on the page is meant, counted in reading order: the one titled "Linsen-Eintopf".',
    );
    await read([page], { focus: { position: 4, count: 4 } });
    expect(lastText()).toContain(
      "Only recipe 4 of the 4 on the page is meant, counted in reading order: the one whose title is not on the photos.",
    );
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

describe("createAnthropicVerifier", () => {
  it("sends the photos and the values to check, but not the printed lines", async () => {
    const problems = [
      { ingredientIndex: 0, field: "quantity", printed: "3½ EL", transcribed: "0.5 EL" },
    ];
    const { client, parse } = fakeClient({ parsed_output: { problems } });
    const withLine = {
      ...recipe,
      ingredients: [
        {
          raw: "Zitronensaft 3½ EL",
          quantity: 0.5,
          quantityMax: null,
          unit: "EL",
          name: "Zitronensaft",
          note: "",
          approximate: false,
          optional: false,
          secondaryQuantity: null,
          secondaryUnit: null,
          secondaryScope: "none" as const,
          alternativeTo: null,
          unclear: false,
        },
      ],
    };
    const result = await createAnthropicVerifier({ client, model: "configured-model" })(
      [page],
      withLine,
    );

    const content = parse.mock.calls[0][0].messages[0].content;
    const transcription = content[content.length - 1].text as string;
    expect(content.map((block: { type: string }) => block.type)).toEqual(["text", "image", "text"]);
    expect(transcription).toContain('"name": "Zitronensaft"');
    expect(transcription).toContain('"quantity": 0.5');
    // The printed line would let the check pass by comparing the transcription with itself.
    expect(transcription).not.toContain("3½");
    expect(result.verification.problems).toEqual(problems);
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
