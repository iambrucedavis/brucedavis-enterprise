# Bruce Davis portfolio

Static HTML, CSS and JavaScript portfolio focused on Technical Project Management.

## Shared editorial theme

Every HTML page loads `portfolio-theme.css` after its page-specific styles. Use the warm-paper (`#FAF8F5`), charcoal (`#20242B`) and crimson (`#B42335`) tokens there for new pages and controls. Newsreader is the heading face; Manrope is the body face. Self-hosted fonts and their SIL Open Font Licenses are in `fonts/`.

`tpm-layout.css` supplies the main reading layouts; `portfolio-chrome.css` supplies shared navigation. `report-theme.css` adapts the three prototype reports. Legacy demos keep their behavior and use the same theme tokens, including their charts and canvas palettes. Wide data tables and code samples scroll inside their own regions on phones. Keep `portfolio-theme.css` last in the cascade.

The former `blueprint-theme.css` URL imports the shared theme for compatibility; current pages do not load it. The old schematic URL is retained, uses neutral ink, and is not used as a page background.

## Local preview

Run `python3 -m http.server 8768` from this directory and open `http://localhost:8768/`. There is no build step. `vercel.json` includes the fonts, reports, videos and Lab modules as static assets.

The primary resume is the user-supplied `Bruce-Davis-Technical-Project_Manager_Resume.pdf` (approved November 2, 2026), served unchanged at `bruce-davis-resume.pdf` and mirrored at `bruce-davis-resume-ats.pdf`. Treat this supplied PDF as the authoritative resume moving forward. Both HTML resume pages reflect its content while retaining the site theme. When a new resume is supplied, replace both primary PDF copies byte-for-byte and synchronize the HTML content; do not regenerate or reformat the supplied PDF.

The optional compact overview is `bruce-davis-resume-overview.pdf`. `tools/resume/build_resume.py` generates only this overview from the HTML and mirrors the supplied primary PDF to the ATS URL. It never rebuilds the primary PDF. The legacy Chrome script refuses to overwrite either primary PDF. These tools are not part of the website runtime. Render and inspect generated overview changes before release.

## Validation history

Dated test results on the site refer to the recorded prototype run, not customer outcomes. Review-process and revalidation notes belong in [project validation documentation](docs/project-validation.md).

## Free experience guide (review branch)

The homepage offers prepared answers with source links, grouped by recruiter questions and topics. It uses native HTML disclosures and a small browser-only enhancement. There is no model, API, shared storage, credential requirement or additional paid service. See [review notes and verification](docs/recruiter-assistant.md). `npm test` checks the guide's source coverage, links and preserved files; `npm run preview` starts a static local preview. Resume downloads are unchanged.
