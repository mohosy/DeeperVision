import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import {
  runAdvisorAgent,
  type AdvisorRequestBody,
} from "@/lib/ai-advisor-runner";

/**
 * AI Coverage Advisor endpoint.
 *
 * Thin wrapper around runAdvisorAgent (lib/ai-advisor-runner.ts) — the
 * actual multi-turn Claude loop lives there so the chat agent's
 * `run_advisor` tool can invoke the same code in-process.
 */

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY env var." },
      { status: 500 },
    );
  }

  let body: AdvisorRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.floor || !Array.isArray(body.floor.devices)) {
    return Response.json(
      { error: "floor and floor.devices are required." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const result = await runAdvisorAgent(client, body);
    return Response.json(result);
  } catch (err) {
    const { message, status } = extractAnthropicError(err);
    return Response.json({ error: message }, { status });
  }
}

function extractAnthropicError(err: unknown): {
  message: string;
  status: number;
} {
  if (err instanceof Anthropic.APIError) {
    const upstream = err.error as
      | { error?: { message?: string } }
      | undefined;
    const msg =
      upstream?.error?.message ??
      err.message ??
      "Unknown Anthropic API error.";
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return { message: msg, status };
  }
  return {
    message: err instanceof Error ? err.message : "Unknown error.",
    status: 502,
  };
}
