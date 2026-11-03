# Bruce Davis portfolio

Static HTML, CSS and JavaScript portfolio focused on Technical Project Management.

## Shared editorial theme

Every HTML page loads `portfolio-theme.css` after its page-specific styles. Use the warm-paper (`#FAF8F5`), charcoal (`#20242B`) and crimson (`#B42335`) tokens there for new pages and controls. Newsreader is the heading face; Manrope is the body face. Self-hosted fonts and their SIL Open Font Licenses are in `fonts/`.

`tpm-layout.css` supplies the main reading layouts; `portfolio-chrome.css` supplies shared navigation. `report-theme.css` adapts the three prototype reports. Legacy demos keep their behavior and use the same theme tokens, including their charts and canvas palettes. Wide data tables and code samples scroll inside their own regions on phones. Keep `portfolio-theme.css` last in the cascade.

The former `blueprint-theme.css` URL imports the shared theme for compatibility; current pages do not load it. The old schematic URL is retained, uses neutral ink, and is not used as a page background.

## Local preview

Run `python3 -m http.server 8768` from this directory and open `http://localhost:8768/`. There is no build step. `vercel.json` includes the fonts, reports, videos and Lab modules as static assets.

The existing standard and ATS PDF URLs serve the same readable two-page application resume. A compact one-page overview is available at `bruce-davis-resume-overview.pdf`. The public HTML resume is the editable source for both downloads. After an approved content update, `tools/resume/build_resume.py` regenerates both layouts from the same content using ReportLab and embedded Arial fonts from the local macOS system. This authoring tool is not part of the website runtime. Render and inspect the result before releasing it; keep the supplied original PDF unchanged. HTML resume pages offer the site-styled reading alternative.

## Validation history

Dated test results on the site refer to the recorded prototype run, not customer outcomes. Review-process and revalidation notes belong in [project validation documentation](docs/project-validation.md).
