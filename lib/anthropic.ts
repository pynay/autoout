import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[anthropic] ANTHROPIC_API_KEY is not set — Claude calls will fail.");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = "claude-sonnet-4-6";
