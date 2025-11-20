// Stub for @langchain/community/llms/hf
export class HuggingFaceInference {
  constructor(options: any) {
    console.warn('[stub] HuggingFaceInference instantiated – replace with actual implementation');
  }

  async invoke(prompt: string): Promise<string> {
    console.warn('[stub] HuggingFaceInference.invoke called with prompt:', prompt);
    return 'This is a stub response from HuggingFaceInference.';
  }

  async generate(prompts: string[]): Promise<any> {
    console.warn('[stub] HuggingFaceInference.generate called with prompts:', prompts);
    return {
      generations: prompts.map(p => [
        {
          text: `Stub response for: ${p}`,
          generationInfo: { stub: true },
        },
      ]),
    };
  }
}
