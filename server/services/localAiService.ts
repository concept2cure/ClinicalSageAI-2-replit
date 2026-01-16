let generatorPromise: Promise<any> | null = null;

export async function generateLocalTextResponse(opts: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ text: string; modelUsed: string }>
{
  const { pipeline } = await import('@xenova/transformers');

  // Small, instruction-tuned model that can run locally.
  const modelUsed = 'Xenova/flan-t5-small';

  if (!generatorPromise) {
    generatorPromise = pipeline('text2text-generation', modelUsed);
  }

  const generator = await generatorPromise;
  const prompt =
    `Instruction: You are a senior regulatory affairs assistant. Answer the user's question with accurate, actionable guidance. ` +
    `If the user asks for one sentence, respond with exactly one sentence.\n` +
    `Input: ${opts.userPrompt}\n` +
    `Output:`;

  const result = await generator(prompt, {
    max_new_tokens: 256,
    temperature: 0.0,
    repetition_penalty: 1.1,
  });

  const text =
    (Array.isArray(result) && (result[0]?.generated_text || result[0]?.summary_text)) ||
    (typeof result === 'string' ? result : '') ||
    '';

  return { text: String(text || '').trim(), modelUsed };
}
