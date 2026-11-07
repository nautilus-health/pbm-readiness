# Embedding the PBM Rule Navigator

Paste `snippet.html` into a Code (Squarespace), Custom HTML (WordPress), or Embed block on nautilushealth.org/PBM.

What it does:
- Loads the Navigator from GitHub Pages in an iframe.
- Resizes the iframe to fit its content, so the page never shows a second scroll bar.
- Scrolls the page back to the top of the Navigator when it moves to a new screen.

When embedded, the Navigator hides its own Nautilus logo and footer branding (the host page already has them) but keeps the legal notice. Links inside it open in a new tab.

The Worker already accepts requests from nautilushealth.org and www.nautilushealth.org. If the page lives on another domain, add it to ALLOWED_ORIGINS in worker/wrangler.toml.

The "80" in the script is the height of a sticky site header, in pixels. Change it if the site header is taller or shorter.
