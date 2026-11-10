import "server-only";
import {
  createAnthropicFramer,
  createAnthropicReader,
  createAnthropicSuggester,
  createAnthropicSurveyor,
  createAnthropicTagger,
  createAnthropicTextReader,
  createAnthropicUprightFinder,
  createAnthropicVerifier,
} from "./anthropic-reader";

function model(name: "ANTHROPIC_EXTRACT_MODEL" | "ANTHROPIC_VERIFY_MODEL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

/** The model calls of the import, with the models chosen in the environment. */
export function importModels() {
  const reading = { model: model("ANTHROPIC_EXTRACT_MODEL") };
  return {
    look: createAnthropicSurveyor(reading),
    upright: createAnthropicUprightFinder(reading),
    frame: createAnthropicFramer(reading),
    read: createAnthropicReader(reading),
    readText: createAnthropicTextReader(reading),
    verify: createAnthropicVerifier({ model: model("ANTHROPIC_VERIFY_MODEL") }),
    suggest: createAnthropicSuggester(reading),
    tag: createAnthropicTagger(reading),
    readingModel: reading.model,
  };
}
