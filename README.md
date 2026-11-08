# website-generator – Redpunk Studio Kft.

Demo landing page-ek kis, weboldal nélküli szegedi vállalkozásoknak, napi outreach pipeline-nal és helyi CRM-mel.

- `pipeline/PIPELINE.md` – a napi automatikus futás leírása
- `pipeline/email-template.html` – az outreach levél sablonja
- `crm/` – helyi CRM (indítás: `crm/start.bat`)

- Minden demo külön mappában: `/<ugyfel-slug>/index.html`
- GitHub Pages: `https://danielarpadfalvi.github.io/website-generator/<ugyfel-slug>/`
- Az oldalak `noindex`-esek és „Demo” sávval jelöltek.
- Lead adatbázis: Supabase `audience-first-pipeline` projekt, `leadgen` séma.
