import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type StylePack = {
  html: string;
  css: string;
};

export const stylePacks: Record<string, StylePack> = {
  '510k_v1': {
    html: path.join(__dirname, '510k_v1.html'),
    css: path.join(__dirname, 'print.css'),
  },
  pma_v1: {
    html: path.join(__dirname, 'pma_v1.html'),
    css: path.join(__dirname, 'print.css'),
  },
  cer_mdr_v1: {
    html: path.join(__dirname, 'cer_mdr_v1.html'),
    css: path.join(__dirname, 'print.css'),
  },
};
