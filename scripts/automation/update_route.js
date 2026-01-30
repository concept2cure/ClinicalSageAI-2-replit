import fs from 'fs';

const filePath = 'server/routes.ts';
const fileContent = fs.readFileSync(filePath, 'utf8');

const updatedContent = fileContent.replace(
  /\/\/ Check if OpenAI API key is available\n\s*if \(!process\.env\.OPENAI_API_KEY\) {/g,
  '// Check if Hugging Face API key is available\n      if (!process.env.HF_API_KEY) {'
);

fs.writeFileSync(filePath, updatedContent);
logger.info('File has been updated!');
