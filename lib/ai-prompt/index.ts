/**
 * The DeeperVision agent's system prompt — composed from one module per
 * logical section so each piece can be iterated on without scrolling a
 * 270-line string. Order matters: identity first, then the tool catalog,
 * then coordinates, then behavior, then spatial rules, then safety.
 */
import { INTRO } from "./intro";
import { TOOLS } from "./tools";
import { QUOTE } from "./quote";
import { VIEW } from "./view";
import { RESEARCH } from "./research";
import { VERIFY } from "./verify";
import { COORDINATES } from "./coordinates";
import { AGENTIC } from "./agentic";
import { SPATIAL } from "./spatial";
import { COVERAGE } from "./coverage";
import { MEMORY } from "./memory";
import { SAFETY } from "./safety";

export const SYSTEM_PROMPT = [
  INTRO,
  TOOLS,
  QUOTE,
  VIEW,
  RESEARCH,
  VERIFY,
  COORDINATES,
  AGENTIC,
  SPATIAL,
  COVERAGE,
  MEMORY,
  SAFETY,
].join("\n\n");
