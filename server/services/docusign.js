import axios from 'axios';
import jwt from 'jsonwebtoken';

let jwtToken, jwtExpiry;

// Helper function to create signed JWT token
function createSignedJWT() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.DSN_INTEGRATION_KEY,
    sub: process.env.DSN_USER_ID,
    aud: process.env.DSN_BASE_URL.split('/')[2],
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  };

  return jwt.sign(payload, process.env.DSN_SECRET, { algorithm: 'HS256' });
}

export async function getJWT() {
  if (jwtToken && Date.now() < jwtExpiry) return jwtToken;
  const body = {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: createSignedJWT(),
  };
  const { data } = await axios.post(`${process.env.DSN_BASE_URL}/v2/oauth/token`, body);
  jwtToken = data.access_token;
  jwtExpiry = Date.now() + (data.expires_in - 60) * 1_000;
  return jwtToken;
}

export async function createEnvelope({ name, signerEmail, signerName, pdfBuffer }) {
  const b64 = pdfBuffer.toString('base64');
  const env = {
    emailSubject: `Signature requested: ${name}`,
    status: 'sent',
    recipients: {
      signers: [{ email: signerEmail, name: signerName, recipientId: '1', routingOrder: '1' }],
    },
    documents: [{ documentBase64: b64, name, fileExtension: 'pdf', documentId: '1' }],
    eventNotification: {
      url: process.env.DSN_WEBHOOK_URL,
      loggingEnabled: 'true',
      requireAcknowledgment: 'true',
      includeDocumentFields: 'true',
      includeDocuments: 'false',
      envelopeEvents: [
        { envelopeEventStatusCode: 'completed' },
        { envelopeEventStatusCode: 'declined' },
      ],
    },
  };
  const token = await getJWT();
  const { data } = await axios.post(
    `${process.env.DSN_BASE_URL}/v2.1/accounts/${process.env.DSN_ACCOUNT_ID}/envelopes`,
    env,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data; // { envelopeId, status }
}

export async function getEnvelope(envelopeId) {
  const token = await getJWT();
  const { data } = await axios.get(
    `${process.env.DSN_BASE_URL}/v2.1/accounts/${process.env.DSN_ACCOUNT_ID}/envelopes/${envelopeId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}
