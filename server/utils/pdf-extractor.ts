import pdf from 'pdf-parse';

export const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  try {
    const data = await pdf(buffer);
    return data.text.replace(/\n\s*\n/g, '\n').substring(0, 50000);
  } catch (error) {
    throw new Error('PDF Parse Failed');
  }
};
