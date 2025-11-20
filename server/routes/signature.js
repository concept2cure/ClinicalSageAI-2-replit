import { Router } from 'express';
import prisma from '../prisma/client.js';
import * as ds from '../services/docushare.js';
import * as dsn from '../services/docusign.js';
import axios from 'axios';

const sig = Router();

// POST /api/signature/request  { objectId, email, name }
sig.post('/signature/request', async (req, res, next) => {
  try {
    const { objectId, email, name } = req.body;
    const pdf = await ds.download(objectId);

    const { envelopeId } = await dsn.createEnvelope({
      name: `${name}.pdf`,
      signerEmail: email,
      signerName: name,
      pdfBuffer: pdf,
    });

    await prisma.signature.create({ data: { envelopeId, objectId, status: 'sent' } });
    res.json({ envelopeId });
  } catch (err) {
    next(err);
  }
});

// DocuSign CONNECT webhook → /api/docusign/hook
sig.post('/docusign/hook', async (req, res, next) => {
  try {
    const xml = req.body; // DocuSign posts XML; parse as needed
    const envelopeId = xml?.EnvelopeStatus?.EnvelopeID;
    const status = xml?.EnvelopeStatus?.Status;

    await prisma.signature.update({ where: { envelopeId }, data: { status } });

    if (status === 'Completed') {
      // pull completed envelope docs
      const token = await dsn.getJWT();
      const { data } = await axios.get(
        `${process.env.DSN_BASE_URL}/v2.1/accounts/${process.env.DSN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer' }
      );
      // version back into DocuShare → Signed folder
      await ds.upload(Buffer.from(data), `${envelopeId}-signed.pdf`, process.env.DS_SIGNED_FOLDER);
    }
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

export default sig;
