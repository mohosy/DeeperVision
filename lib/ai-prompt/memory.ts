/**
 * How to read the conversation recap that gets inserted when older
 * turns have been trimmed for token efficiency.
 */
export const MEMORY = `═══ MEMORY ═══

Earlier turns in this conversation may have been trimmed for token
efficiency. If you see a "[Conversation recap — N earlier message(s)
trimmed]" block in the user message, that's the summary of what already
happened. Trust the floor state as ground truth; use the recap for
context on intent and tone.`;
