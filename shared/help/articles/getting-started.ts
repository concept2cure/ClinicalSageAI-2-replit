import type { HelpArticle } from '../types';

/** Getting started. Checked in the running app on 2026-11-12 (human test J1, docs/evidence/HUMAN-TEST/J1/). */
export const GETTING_STARTED_ARTICLES: readonly HelpArticle[] = [
  {
    slug: 'what-is-concept2cure',
    title: 'What Concept2Cure is, and how it is organised',
    collection: 'getting-started',
    summary: 'One product for regulatory work: projects, documents written with AnA, review and signatures, and filing.',
    keywords: ['overview', 'introduction', 'about', 'tour', 'orientation'],
    surfaces: ['home', 'projects', 'project-home'],
    demoScript: 'training-orientation',
    related: ['meet-ana', 'create-your-first-project', 'the-six-steps-of-a-project'],
    checked: '2026-11-12',
    body: `Concept2Cure is where a regulatory team plans a filing, writes its documents with AnA, reviews and signs them, and files the submission. It is one product, not a set of apps.

**How it is organised**

- **Home** is where you start. It greets you, holds AnA's composer, and lists your projects and the items waiting for you.
- **Projects** holds your organisation's projects. A project is one regulatory filing, for example an IND or a 510(k), and everything that goes into it.
- **The project page** works the filing through six steps: Plan, Evidence, Author, Review, Submit and Respond.
- **AnA** is the assistant in every screen. You can ask her anything about your work, and anything about using Concept2Cure.
- The left sidebar also reaches **Tasks**, **Communication**, **Vault**, **Submission Center**, and the work areas your organisation uses (CMC / Module 3, Risk-based monitoring, Quality, Reporting & analytics).

**Where to begin**

1. Create your first project from **Projects → New project**.
2. Open it and follow the **Plan** step: it says what the filing needs, who does it, and by when.
3. Ask AnA when you are unsure. "How do I…?" works for the product as well as for the regulation.`,
  },
  {
    slug: 'sign-in-and-sign-out',
    title: 'Sign in, reset your password, and log out',
    collection: 'getting-started',
    summary: 'Sign in with your work e-mail and password or your organisation’s single sign-on; reset a forgotten password.',
    keywords: ['login', 'log in', 'logout', 'sign out', 'forgot password', 'password reset', 'sso', 'single sign-on'],
    related: ['create-an-account', 'set-up-single-sign-on'],
    checked: '2026-11-12',
    body: `**Sign in**

1. Go to the sign-in page and enter your work e-mail and password.
2. Leave **Keep me signed in** ticked on a computer only you use.
3. Select **Sign in**. If your organisation asks for a second step, enter the code you are sent.

If the e-mail or password is wrong, the page says "Incorrect email or password". It says the same thing whether or not an account exists for that address, so it never tells anyone who has an account.

**If you were invited and have not set a password yet**, open the link in your invitation, or reset your password.

**Reset a forgotten password**

1. On the sign-in page, select **Forgot password?**
2. Enter your account e-mail and select **Send reset link**.
3. Open the link in the e-mail and choose a new password.

**Single sign-on.** If your organisation uses single sign-on, select **Use organization SSO** and enter the organisation identifier your administrator gave you.

**Log out.** Open the account menu at the bottom of the left sidebar (your name) and select **Log out**. Any screen you open afterwards asks you to sign in again.`,
  },
  {
    slug: 'create-an-account',
    title: 'Create an account for your organisation',
    collection: 'getting-started',
    summary: 'Sign up in four steps: you, your organisation, a plan, and the agreements.',
    keywords: ['sign up', 'signup', 'register', 'new organisation', 'new organization', 'trial'],
    related: ['sign-in-and-sign-out', 'set-up-your-organisation'],
    checked: '2026-11-12',
    body: `Select **Create an account** on the sign-in page.

1. **You**: your name, work e-mail, a password and your job title. The password must be at least 12 characters, with an upper-case letter, a lower-case letter, a number and a symbol. It must not contain your name, your e-mail address or your organisation's name.
2. **Your organisation**: its name, its type (pharmaceutical, biotechnology, medical device, CRO and others), its country and your main use. The type decides which filings Concept2Cure offers first, for example a 510(k) for a medical device company.
3. **A plan.**
4. **The agreements**: read the Terms of Service and the Privacy Policy to the end, accept each, and confirm the compliance acknowledgement. Then select **Create Account**.

If the password is refused when you create the account, the page takes you back to the first step, with the reason under the password.

When the account is created, select **Open Concept2Cure**. You arrive on Home, where **Set up your organisation** lists what to do first.`,
  },
  {
    slug: 'meet-ana',
    title: 'Ask AnA: what she can do, and how to ask',
    collection: 'getting-started',
    summary: 'AnA is the assistant in every screen. Ask about your work, or about how to use Concept2Cure.',
    keywords: ['assistant', 'ai', 'chat', 'composer', 'ask', 'conversation', 'anna'],
    surfaces: ['home', 'conversation-thread'],
    related: ['get-help-and-contact-support', 'what-ana-can-and-cannot-do'],
    checked: '2026-11-12',
    body: `AnA is Concept2Cure's assistant. Her composer is on Home ("How can I help with your filing today?"), on each project page ("Ask AnA to draft, reconcile or review…"), and in every conversation.

**What to ask**

- About your work: "What does this IND still need before the Pre-IND meeting?", "Draft the nonclinical overview from the data room."
- About Concept2Cure: "How do I add a market to this project?", "Where do I sign a document?" AnA answers from the Help Center and names the article she used.
- To be shown: "Show me around." With **AnA drives** on, she moves through the screens and explains each one.

**In a project**, a conversation started from the project page stays with that project, and AnA works with its sources, documents and submissions.

**What AnA will not do on her own.** Anything that changes a record (approving, signing, filing, sending) waits for you. Numbers and verdicts come from Concept2Cure's engines; AnA explains them.

**If AnA cannot answer.** If your deployment has no AI provider configured, AnA says so plainly ("No AI provider is configured for this deployment") instead of answering. That is a setting of the deployment, not a fault in your account.`,
  },
  {
    slug: 'get-help-and-contact-support',
    title: 'Get help and contact support',
    collection: 'getting-started',
    summary: 'Ask AnA, read the Help Center, or open a request to the Concept2Cure support team.',
    keywords: ['support', 'help', 'contact', 'ticket', 'request', 'problem', 'bug', 'talk to a person', 'human'],
    surfaces: ['training', 'conversation-thread'],
    related: ['meet-ana', 'what-ana-can-and-cannot-do'],
    checked: '2026-11-12',
    body: `There are two ways to get help, and both are always available.

**1. Ask AnA in any conversation.** Ask how to do something ("How do I invite a colleague?"). AnA answers from the Help Center and names the article, which you can open.

**2. Use Get help.** Select **Get help** in the account menu or the **?** button in the top bar. This opens AnA's support conversation. In it AnA:

- answers questions about using Concept2Cure, from the Help Center;
- can show you a feature by moving through the screens with you;
- offers to **contact a person** when she cannot resolve something. She drafts the request with what you have tried, you read it, and nothing is sent until you confirm.

**Help & training** (account menu) holds the Help Center articles, the training courses, and **Your requests**: every request you have sent to support, its status, and the replies.`,
  },
  {
    slug: 'what-ana-can-and-cannot-do',
    title: 'What AnA can and cannot do',
    collection: 'getting-started',
    summary: 'AnA drafts, explains and finds; engines compute the numbers and verdicts; you approve, sign and send.',
    keywords: ['limits', 'ai', 'accuracy', 'trust', 'governed', 'approve', 'model', 'hallucination', 'verify'],
    surfaces: ['conversation-thread'],
    related: ['meet-ana', 'get-help-and-contact-support'],
    checked: '2026-11-12',
    body: `**AnA can**

- Answer questions about your work and about using Concept2Cure, and name where an answer comes from: a source in the data room, a document, or a Help Center article.
- Draft a section or a document from your project's sources, for you to review and edit.
- Explain a verdict or a figure the product computed: what a readiness check found, why a task is past due.
- Find things: a document, a screen, a setting. With **AnA drives** on, she can move through the screens and show you.

**AnA does not**

- Compute the regulated numbers or verdicts herself. Readiness, validation results, schedules and statistics come from Concept2Cure's engines; AnA reports and explains them.
- Change a record on her own. Approving, signing, filing, sending a submission or a support request, and any governed change wait for you, often with a reason you give and a confirmation you type.
- Replace your review. Everything AnA writes is a draft until a qualified person reviews it; the agreements you accepted say AI-generated content requires qualified human review before regulatory submission.

**When she does not know**, she says so. In the support conversation she offers to contact a person instead of guessing.`,
  },
  {
    slug: 'set-up-your-organisation',
    title: 'Set up your organisation (for administrators)',
    collection: 'getting-started',
    summary: 'Home lists the first things an administrator does: company details, the team, the first project.',
    keywords: ['onboarding', 'setup', 'first steps', 'checklist', 'new client', 'administrator', 'admin'],
    surfaces: ['home', 'admin-console'],
    related: ['invite-members', 'record-company-details', 'create-your-first-project'],
    checked: '2026-11-12',
    body: `When your organisation is new, Home shows **Set up your organisation** to its administrators, with each step's state (To do or Done).

1. **Record your company details**: name, address and contact, used on your documents and letters. Opens the **Settings** tab of Admin.
2. **Invite your team**: the people who write, review and sign with you. Opens the **Members** tab of Admin.
3. **Create your first project**: one regulatory filing, for example an IND or a 510(k), from plan to submission.

The list disappears from Home when every step is done. Members who are not administrators do not see it.`,
  },
];
