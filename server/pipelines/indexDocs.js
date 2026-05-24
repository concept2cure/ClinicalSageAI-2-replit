import * as ds from '../services/docushare.js';
import * as ss from '../services/semanticSearch.js';
import pdf from '../utils/pdfParse';

(async () => {
  const docs = await ds.list();
  for (const d of docs) {
    if (!d.mimeType?.includes('pdf')) continue;
    const buf = await ds.download(d.objectId);
    const text = (await pdf(buf)).text;
    await ss.upsertDoc({ objectId: d.objectId, title: d.displayName, text });
    console.log(`Indexed ${d.displayName}`);
  }
  process.exit(0);
})();
