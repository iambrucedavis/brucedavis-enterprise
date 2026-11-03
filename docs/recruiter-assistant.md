# Free guided experience — review notes

The user chose a free guided experience instead of an AI assistant. This replaces the previous integration on `review/grounded-recruiter-assistant`; no merge or production release is authorized.

## Behavior and costs

The homepage section is titled “Explore my experience.” Four recruiter questions and seven topic links open prepared, source-linked answers. Seven native HTML disclosures contain 17 reviewed factual records from the previous evidence catalog. All answer text is in the HTML and readable without JavaScript. The small JavaScript enhancement opens the requested disclosure and moves keyboard focus to its summary; direct fragment links work as well.

There is no question field, chat, model call, Redis, API endpoint, external provider dependency or credential requirement. The section makes no network requests and uses no browser storage. The site's existing hosting terms and usage limits still apply; this feature adds no paid service or per-answer AI charge. All original site content and downloadable resumes are preserved byte for byte outside the added homepage section/link/assets.

The unused AI endpoint, shared limiter, model selection code, credential template and model fixtures have been removed. `vercel.json` is restored to the existing static-only configuration. The secret generated during the earlier setup discussion remains outside the repository in a private owner-only directory. It is unused and was not read, printed, logged, committed or uploaded as part of this change. No OpenAI or Upstash resource was created.

## Content and scope

`docs/experience-guide-evidence.json` preserves the 17 source records used in the HTML for review and regression verification. The text is unchanged from the curated review catalog; the contact record is replaced by the existing email link. Sources include the current approved resume and site cases. Employer work remains distinct from AI-assisted personal prototypes, and planning, pilots and completed rollouts remain distinguished. No new career claims were added. Model-driven unsupported-question handling is unnecessary because visitors choose prepared topics rather than submitting free text.

## Design and marketing check

Visitor task: recruiters find a relevant example, read a concise prepared answer, then follow its source or contact Bruce. Preserve: editorial paper/charcoal/crimson colors, fonts, page order, case URLs and downloads. Adapt the quiet-UI lens through native disclosures and clear source links. Other visual trend treatments are unnecessary. The marketing proof/deeper-explanation lens is supported by existing factual source links, with honest prepared-answer labeling; lead capture, paid service setup and a redesign are out of scope. Browser checks establish functional behavior, not recruiter comprehension or conversion improvements.

## Verification

`npm test` checks all 17 unchanged answers and their citation targets, the four questions/seven topic links, no AI endpoint/network/storage path, static hosting configuration, and exact preservation of existing site/resume files. `npm run preview` serves static files only.

Before handoff: check desktop and 390 px layouts; all questions/topics; native keyboard disclosure activation and visible focus; a direct topic fragment; no-JavaScript answers; source/case links; contact and resume downloads. Verify anonymous access to the Vercel review preview and confirm production still points to base commit `56f5b4dbbdbc570e392f84c2dd536984a22295ee`. No live model/provider verification is needed for this implementation.
