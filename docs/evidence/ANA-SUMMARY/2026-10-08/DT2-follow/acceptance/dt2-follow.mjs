// AnA detach DT2 acceptance, in the browser: a phone (390x844) follows a turn
// started on a desktop (1280x800), on a private instance with the stand-in model.
//
//   1. Desktop: a new conversation, Manual, the S5 four-part request.
//   2. Phone (the same person): opens that conversation -> the followed turn after
//      its question, the phase line, the Summary sheet's rows.
//   3. A second desktop page (the same person): the side panel's plan rail and
//      Summary rows for the followed turn.
//   4. An admin of the organisation: follows with no Stop, no Pause, and a composer
//      that says only the asker can steer.
//   5. A colleague: the transcript, and the run read refused with the sentence.
//   6. Phone reload mid-turn: rejoins.
//   7. Phone Resume -> the desktop proceeds. Phone Stop -> the desktop stops.
//
// Usage (no credential is written anywhere):
//   APP_URL=http://127.0.0.1:5097 SERVER_LOG=<app log> PW_FILE=<file> OUT=<dir> node dt2-follow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium, signIn, sleep, BASE, OUT, watchedPage, writeLog } from '../../../../QA-2026-10-08/rate-limits/scripts/lib.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = fs.readFileSync(process.env.PW_FILE, 'utf8').trim();
const ASKER = { email: 'dt1-asker@example.invalid', password: PW };
const ADMIN = { email: 'dt1-admin@example.invalid', password: PW };
const COLLEAGUE = { email: 'dt1-colleague@example.invalid', password: PW };
const ASK = 's5 tasks: find the stability reports, list the project documents, read the two archived reports, and summarise the shelf-life claims';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const say = (...a) => console.info(new Date().toISOString().slice(11, 19), ...a);
const shots = path.join(OUT, 'screens');
fs.mkdirSync(shots, { recursive: true });
let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = path.join(shots, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return path.basename(file);
};

// Tee every /api/ana-ri/stream body into window.__frames.
const TEE = `
  (() => {
    window.__frames = [];
    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await orig(...args);
      const url = String(args[0] && args[0].url ? args[0].url : args[0]);
      if (!/\\/api\\/ana-ri\\/stream$/.test(url) || !res.body) return res;
      const [a, b] = res.body.tee();
      (async () => {
        try {
          const reader = b.getReader(); const dec = new TextDecoder(); let buf = '';
          for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
            let i; while ((i = buf.indexOf('\\n\\n')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i + 2);
              if (f.startsWith('data: ')) { try { window.__frames.push({ at: Date.now(), ...JSON.parse(f.slice(6)) }); } catch {} } } }
        } catch {}
      })();
      return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  })();`;

/** What a page shows of the AnA turn: the phase line, the alert, the strip, the composer, the rows. */
const READ_VIEW = () => {
  const text = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
  const all = (sel) => [...document.querySelectorAll(sel)].map(text);
  const box = document.querySelector('.ct-composer textarea');
  return {
    userTurns: all('.ct-user-b'),
    phase: all('.ana-activity-phase'),
    alerts: all('.ana-activity-unrecorded'),
    stopped: all('.ana-activity-stopped'),
    strip: text(document.querySelector('.ana-runctl')),
    stripButtons: [...document.querySelectorAll('.ana-runctl button')].map((b) => b.innerText.trim()),
    composer: box ? { disabled: box.disabled, placeholder: box.placeholder, label: box.getAttribute('aria-label') } : null,
    composerNotes: all('.ct-composer-wrap [role="note"]'),
    rail: all('.ana-rail[aria-label="Plan"] > li'),
    summaryRows: all('.ana-summary-list > li'),
    summaryFoot: all('.ana-summary-foot'),
    sheetOpen: Boolean(document.querySelector('.ana-sheet')),
  };
};

const browser = await chromium.launch({ executablePath: EXE });
const log = [];
const result = { checks: {}, views: {}, shots: {} };

const deskCtx = await signIn(browser, ASKER);
await deskCtx.addInitScript(TEE);
const desk = await watchedPage(deskCtx, log);
await desk.setViewportSize(DESKTOP);

// 1. Desktop: a new conversation, Manual, the four-part request.
await desk.goto(`${BASE}/concept2cure/conversation-thread`, { waitUntil: 'domcontentloaded' });
await desk.waitForSelector('.ct-composer textarea', { timeout: 120000 });
await desk.getByRole('radio', { name: /Manual/ }).first().click().catch(() => say('no Manual radio'));
await desk.fill('.ct-composer textarea', ASK);
await desk.keyboard.press('Enter');
say('desktop sent');
let threadId = null;
let runId = null;
for (let i = 0; i < 120 && !(threadId && runId); i++) {
  await sleep(500);
  const frames = await desk.evaluate(() => window.__frames);
  threadId = frames.find((f) => f.type === 'thread_id')?.thread_id ?? threadId;
  runId = frames.find((f) => f.type === 'run_started')?.runId ?? runId;
}
say('thread', threadId, 'run', runId);
// Wait for the first Manual hold on the desktop.
await desk.waitForSelector('text=Waiting for you before the next step', { timeout: 60000 }).catch(() => say('no hold on desktop'));
result.views.desktopAtHold = await desk.evaluate(READ_VIEW);
result.shots.desktopAtHold = await shot(desk, 'desktop-started-manual-hold');

const conversationUrl = `${BASE}/concept2cure/conversation-thread/${encodeURIComponent(threadId)}`;

// 2. Phone, the same person.
const phoneCtx = await signIn(browser, ASKER);
const phone = await watchedPage(phoneCtx, log);
await phone.setViewportSize(PHONE);
await phone.goto(conversationUrl, { waitUntil: 'domcontentloaded' });
await phone.waitForSelector('.ana-activity-phase', { timeout: 60000 }).catch(() => say('phone: no phase line'));
await sleep(2500);
result.views.phoneFollowing = await phone.evaluate(READ_VIEW);
result.shots.phoneFollowing = await shot(phone, 'phone-following');
// On a phone the plan is the record's "Plan · N steps" row (the side panel's rail is the desktop's): open it.
await phone.locator('.ana-activity-step button.ana-activity-row', { hasText: 'Plan' }).first().click().catch(() => say('phone: no Plan row'));
await sleep(400);
result.views.phonePlanOpen = await phone.evaluate(() => [...document.querySelectorAll('.ana-activity-plan li')].map((li) => li.innerText.trim()));
result.shots.phonePlanOpen = await shot(phone, 'phone-following-plan-open');
await phone.locator('.ana-activity-phase button.ana-activity-summary').first().click().catch(() => say('phone: no Summary button'));
await phone.waitForSelector('.ana-sheet .ana-summary-list', { timeout: 15000 }).catch(() => say('phone: no sheet rows'));
await sleep(1200); // the sheet's own transition
result.views.phoneSheet = await phone.evaluate(READ_VIEW);
result.shots.phoneSheet = await shot(phone, 'phone-summary-sheet-rows');
await phone.locator('.ana-sheet-close').click().catch(() => undefined);

// 3. A second desktop page of the same person: the plan rail and the rows in the side panel.
const desk2 = await watchedPage(deskCtx, log);
await desk2.setViewportSize(DESKTOP);
await desk2.goto(conversationUrl, { waitUntil: 'domcontentloaded' });
await desk2.waitForSelector('.ana-activity-phase', { timeout: 60000 }).catch(() => say('desk2: no phase line'));
await sleep(2500);
await desk2.locator('.ana-activity-phase button.ana-activity-summary').first().click().catch(() => say('desk2: no Summary button'));
await sleep(1500);
result.views.desktopFollower = await desk2.evaluate(READ_VIEW);
result.shots.desktopFollower = await shot(desk2, 'desktop-follower-plan-rail-and-rows');
await desk2.close();

// 4. An admin of the organisation.
const adminCtx = await signIn(browser, ADMIN);
const admin = await watchedPage(adminCtx, log);
await admin.setViewportSize(PHONE);
await admin.goto(conversationUrl, { waitUntil: 'domcontentloaded' });
await admin.waitForSelector('.ana-activity-phase', { timeout: 60000 }).catch(() => say('admin: no phase line'));
await sleep(2500);
result.views.adminFollower = await admin.evaluate(READ_VIEW);
result.shots.adminFollower = await shot(admin, 'admin-phone-no-stop-composer-disabled');
await admin.close();

// 5. A colleague: the transcript, and the live read refused.
const colleagueCtx = await signIn(browser, COLLEAGUE);
const colleague = await watchedPage(colleagueCtx, log);
await colleague.setViewportSize(PHONE);
await colleague.goto(conversationUrl, { waitUntil: 'domcontentloaded' });
await sleep(5000);
result.views.colleague = await colleague.evaluate(READ_VIEW);
result.colleagueRead = await colleague.evaluate(async (id) => {
  // The app's own bearer token (client/src/utils/authToken.ts), read in the page; never written out.
  const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const r = await fetch(`/api/ana-ri/runs/${encodeURIComponent(id)}/events`, { headers, credentials: 'include' });
  const listed = await fetch(`/api/ana-ri/runs?thread_id=${encodeURIComponent(location.pathname.split('/').pop())}`, { headers, credentials: 'include' });
  return { status: r.status, body: await r.json().catch(() => null), listing: await listed.json().catch(() => null) };
}, runId);
result.shots.colleague = await shot(colleague, 'colleague-transcript-only');
await colleague.close();

// 6. The phone reloads mid-turn and rejoins.
await phone.reload({ waitUntil: 'domcontentloaded' });
await phone.waitForSelector('.ana-activity-phase', { timeout: 60000 }).catch(() => say('phone reload: no phase line'));
await sleep(2500);
result.views.phoneAfterReload = await phone.evaluate(READ_VIEW);
result.shots.phoneAfterReload = await shot(phone, 'phone-after-reload-rejoined');

// 7a. Phone: Resume (the hold's "Run this step") -> the desktop proceeds.
const framesBefore = (await desk.evaluate(() => window.__frames)).length;
const resume = phone.getByRole('button', { name: /^(Resume|Run this step)$/ });
await resume.first().click({ timeout: 15000 }).catch(() => say('phone: no Resume'));
let resumedOnDesktop = false;
for (let i = 0; i < 40 && !resumedOnDesktop; i++) {
  await sleep(500);
  const frames = await desk.evaluate(() => window.__frames);
  resumedOnDesktop = frames.slice(framesBefore).some((f) => f.type === 'resumed');
}
result.checks.resumeFromPhoneReachedDesktop = resumedOnDesktop;
await sleep(4000);
result.views.desktopAfterPhoneResume = await desk.evaluate(READ_VIEW);
result.shots.desktopAfterPhoneResume = await shot(desk, 'desktop-after-phone-resume');
result.views.phoneAfterResume = await phone.evaluate(READ_VIEW);
result.shots.phoneAfterResume = await shot(phone, 'phone-after-resume');

// 7b. Phone: Stop -> the desktop stops.
await phone.getByRole('button', { name: 'Stop' }).first().click({ timeout: 15000 }).catch(() => say('phone: no Stop'));
let stoppedOnDesktop = false;
for (let i = 0; i < 60 && !stoppedOnDesktop; i++) {
  await sleep(500);
  const frames = await desk.evaluate(() => window.__frames);
  stoppedOnDesktop = frames.some((f) => f.type === 'cancelled' || (f.type === 'done' && f.stoppedReason === 'cancelled'));
}
result.checks.stopFromPhoneReachedDesktop = stoppedOnDesktop;
await sleep(6000);
result.views.desktopAfterPhoneStop = await desk.evaluate(READ_VIEW);
result.shots.desktopAfterPhoneStop = await shot(desk, 'desktop-stopped-from-phone');
// The phone hands over to the record once the owner seals it.
await phone.waitForSelector('.ana-activity-phase', { state: 'detached', timeout: 30000 }).catch(() => undefined);
await sleep(4000);
result.views.phoneAfterStop = await phone.evaluate(READ_VIEW);
result.shots.phoneAfterStop = await shot(phone, 'phone-after-stop-handed-over');
await phone.locator('button.ana-activity-summary').last().click().catch(() => say('phone: no Summary after stop'));
await sleep(3000);
result.views.phoneSheetAfterStop = await phone.evaluate(READ_VIEW);
result.shots.phoneSheetAfterStop = await shot(phone, 'phone-summary-after-hand-over');

result.threadId = threadId;
result.runId = runId;
result.desktopFrames = (await desk.evaluate(() => window.__frames)).map((f) => ({ at: f.at, type: f.type, ...(f.type === 'timeline' ? { seq: f.event?.seq, kind: f.event?.kind } : {}), ...(f.stoppedReason ? { stoppedReason: f.stoppedReason } : {}) }));
fs.writeFileSync(path.join(OUT, 'dt2-follow.json'), JSON.stringify(result, null, 2));
writeLog('dt2-follow-console-and-http', log);
say('done', JSON.stringify(result.checks));
await browser.close();
