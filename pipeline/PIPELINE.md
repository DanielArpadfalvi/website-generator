# Napi outreach pipeline – futtatási leírás

Ezt a leírást követi a minden reggel 7:00-kor (Europe/Budapest) induló ütemezett feladat. A cél: kis, minőségi, de weboldal nélküli szegedi vállalkozások felkutatása, pontozása, és a legjobb 5-nek demo oldal, valamint **Gmail-piszkozat** készítése. **Emailt soha nem küldünk ki automatikusan, csak piszkozatot írunk.** A kiküldést Dani végzi kézzel, és a CRM-ben jelöli.

Cég: **Redpunk Studio Kft.**, aláíró: **Árpádfalvi Dániel, ügyvezető**, daniel.arpadfalvi@redpunk.hu

## Erőforrások

| Mi | Hol |
|---|---|
| Adatbázis | Supabase projekt `audience-first-pipeline` (id: `wuuhponfyvhjyvitbllw`), séma: `leadgen` (táblák: `leads`, `outreach`, `activities`, `opt_outs`, `runs`, `search_log`) – Supabase MCP `execute_sql` |
| Domain-ellenőrzés | Edge function `leadgen-domain-check` – SQL-ből hívható `pg_net`-tel (lásd lent) |
| Demo oldalak | Ez a repó (`DanielArpadfalvi/website-generator`), `main` branch, mappánként egy ügyfél: `/<slug>/index.html` → `https://danielarpadfalvi.github.io/website-generator/<slug>/` |
| Email | Gmail MCP `create_draft` – **csak piszkozat**, egyetlen beágyazott előnézeti képpel. A feladó a Gmailben alapértelmezettként beállított „Küldés másként” cím: `daniel.arpadfalvi@redpunk.hu` |
| Sablonok | `pipeline/email-template.html`, referencia demo: `tokaji-nagy-anna/index.html` |
| Séma | `crm/db/schema.sql` |

## Lépések

### 1. Állapot és célzás
- `select query, created_at from leadgen.search_log order by created_at desc limit 40;` Válassz **3–4 olyan keresést**, ami még nem, vagy 14 napnál régebben futott. Rotáld a szakmákat és a városrészeket. Szakmák például: fodrász, kozmetikus, műkörmös, szempilla, masszőr, barber, kutyakozmetika, gyógytornász, személyi edző, jógaoktató, fotós, esküvői dekoratőr, torta / cukrász, villanyszerelő, vízszerelő, burkoló, festő, asztalos, kertész, autószerelő, autókozmetika, takarító, órás, varroda, cipész, nyelvtanár, korrepetáló, könyvelő. Városrészek: Belváros, Újszeged, Tarján, Rókus, Móraváros, Szőreg, Kiskundorozsma, Petőfitelep, Baktó.
- `select email from leadgen.opt_outs;` Ezeket soha ne keresd meg.

### 2. Felkutatás
- Használd a `places_search` eszközt, ha elérhető (pl. „fodrász Újszeged”). Ha nincs, akkor `WebSearch`-öt és a Google Maps-et vagy a cylex / aranyvallalkozas listákat.
- Minden találatból: név, kategória, cím, telefon, értékelés, értékelések száma, place_id (`google_maps_url = https://www.google.com/maps/place/?q=place_id:<id>`).
- Láncok, plázás franchise-ok, 3 alatti értékelésszám (kivéve, ha nagyon friss és aktív), és 4,5 alatti átlag: kihagyni.
- Beszúrás duplikáció nélkül: `dedupe_key` = a név kisbetűs, csak betű-szám része (max 40 karakter) + a telefonszám utolsó 7 számjegye; `on conflict (dedupe_key) do nothing`; `source='google_places'`, `status='new'`.
- Minden kereséshez írj egy sort a `leadgen.search_log`-ba (query, results, new_leads).

### 3. Ellenőrzés (a legjobb ~15 `new` lead, pontszám szerint)
- **Van-e weboldala?**
  1. A névből képzett 2–4 domain ellenőrzése (lásd: Domain-ellenőrzés). Ha foglalt, `WebFetch`-csel nézd meg, hogy az övék-e.
  2. `WebSearch`: „<név> Szeged”. Ha saját weboldalt találsz (nem Facebook, Instagram vagy foglalási platform), akkor `status='excluded'`, `has_website=true`, és a `notes`-ba írd be a címét.
  3. A Google-értékelések szövegében is figyelj a „weboldalukon” típusú utalásokra.
- **Elérhetőség:** keress emailt (Facebook-oldal „Intro” részében, foglalási platformokon, cégadatbázisban), Facebook- és Instagram-linket. Az emailt csak akkor mentsd, ha nyilvánosan, üzleti célra van feltüntetve.
- **Cégforma:** ha kideríthető (companywall, e-cegjegyzek, nemzeticegtar): `kft` / `bt` / `ev`.
- Ha nincs saját weboldala: `status='qualified'`.

### 4. Pontozás (0–100), `score_total` = az összeg
- `score_quality` (max 35): `clamp(rating-4, 0, 1) * 20 + min(review_count,150)/150 * 15`
- `score_digital_gap` (max 25): 25, ha semmi; 22, ha csak foglalási platform; 18, ha másik cég oldalán szerepel
- `score_growth` (max 15): +8, ha 120-nál kevesebb értékelés (kis, növekvő); +4, ha prémium árszint; +3, ha 4,9 feletti átlag
- `score_contactability` (max 15): +5 telefon, +10 email
- `score_activity` (opcionális, max 10): friss vélemény vagy aktív közösségi oldal (az elmúlt 30 napban)

### 5. Kiválasztás
- A **5 legmagasabb `score_total`-ú `qualified` lead, akinek VAN email-címe**, és az nincs az `opt_outs`-ban. Akinek nincs emailje, az is kaphat demót (max. +3/nap), de neki nem készül piszkozat: `status='demo_built'`, `followup_note='Email hiányzik – telefonon / Facebookon megkeresni'`, `next_followup_at` = holnap 9:00. Így a CRM utókövetés listáján megjelenik. Előnyben részesítendő, akinek van emailje, és a Kft. / Bt. (jogi kockázat: természetes személynek, például egyéni vállalkozónak reklám-email csak hozzájárulással küldhető; ezt Dani dönti el kiküldéskor, de a piszkozatban jelezd a CRM `notes` mezőjében: „egyéni vállalkozó – kiküldés előtt mérlegelni”).

### 6. Demo oldal (mindegyik kiválasztottnak)
- Slug: ékezet nélküli, kötőjeles név (pl. `tokaji-nagy-anna`). Fájl: `/<slug>/index.html`, önálló HTML (inline CSS, Google Fonts megengedett).
- Kötelező elemek:
  - `<meta name="robots" content="noindex, nofollow">`
  - felső sáv: „**Demo oldal** – a Redpunk Studio Kft. készítette bemutató céllal <Név> részére. Ez nem a vállalkozás hivatalos weboldala.”
- Tartalom **csak valós, nyilvános adatokból**: szolgáltatások és árak (a saját listájukról vagy foglalási oldalukról), nyitvatartás, cím, telefon, a meglévő foglalási linkjük, Google-értékelésszám és átlag. A vendégvélemények **saját szavakkal**, rövid összefoglalásként jelenjenek meg, „Google-értékelés” jelöléssel. Ne legyen kitalált vélemény, név vagy idézet.
- **Fotót ne másolj** tőlük vagy máshonnan. Helyőrző (gradient vagy monogram) legyen, a láblécben: „a végleges oldalon saját fotók szerepelnének”.
- Design: a referencia (`tokaji-nagy-anna`) struktúráját követheted, de a **színvilág, a betűtípus és a hangulat a szakmához illeszkedjen** (pl. villanyszerelő: hideg, megbízható kék vagy sárga; kutyakozmetika: játékos, meleg). A szöveg magyar, tegező vagy magázó a szakmához illően.
- Ellenőrzés: headless Chrome-mal képernyőkép asztali (1280) és mobil (390) nézetben. Legyen olvasható, ne lógjon ki semmi.
- **Előnézeti kép az emailbe:** `cd pipeline/tools && npm install` (első alkalommal), majd `node preview.mjs ../../<slug>/index.html ../../<slug>/preview.jpg`. A kép az oldal első képernyője (1200×720). Nézd meg, mielőtt felhasználod. A levélbe **beágyazott mellékletként** kerül (lásd 8. lépés), mert a Gmail-csatoló a külső képhivatkozásokat kiszedi.
- `git add`, `git commit` („Demo: <név>”), `git push origin main`. Pár perc múlva `WebFetch`-csel ellenőrizd, hogy él-e az URL.

### 7. Domain-ellenőrzés (3 szabad .hu domain ügyfelenként)
```sql
select net.http_post(
  url:='https://wuuhponfyvhjyvitbllw.supabase.co/functions/v1/leadgen-domain-check',
  headers:='{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
  body:='{"domains":["pelda.hu","pelda-szeged.hu"]}'::jsonb,
  timeout_milliseconds:=30000) as req_id;
-- pár másodperc múlva:
select r->>'domain', r->>'available', r->>'dns' from net._http_response, jsonb_array_elements(content::jsonb) r where id = <req_id>;
```
Az anon kulcs: Supabase MCP `get_publishable_keys` (legacy anon). Rövid, könnyen megjegyezhető neveket javasolj (név, név+szakma, név+szeged). Csak `available=true` (whois „No match”) mehet a levélbe.

### 8. Gmail-piszkozat
- Sablon: `pipeline/email-template.html`. Minden helyőrzőt tölts ki. A dicséret konkrét és őszinte legyen, a valós értékelésekből.
- `create_draft`: `to` = a lead emailje, `subject` = „Demo weboldal a(z) <Név> részére”, `htmlBody` és egy egyszerű szöveges `body`, valamint **egyetlen beágyazott kép**:
  `attachments: [{"content": "sha256:<sha256sum>:<abszolút út>/<slug>/preview.jpg", "filename": "demo-elonezet.jpg", "mimeType": "image/jpeg", "inline": true}]`. A HTML-ben `<img src="cid:att0">` hivatkozik rá. Ez csak akkor működik, ha van `to` címzett.
- **Formázási csapdák (a Gmail-csatoló kiszedi):** külső `<img src="http…">`, illetve a `background:` rövidített CSS. Helyette `background-color:` és táblázatcella `bgcolor` (a sablon már így készült).

### 9. Adatbázis frissítése
```sql
update leadgen.leads set status='drafted' where id=...;
insert into leadgen.outreach (lead_id, demo_url, suggested_domains, email_subject, gmail_draft_id) values (...);
insert into leadgen.activities (lead_id, type, body) values (..., 'system', 'Demo + Gmail piszkozat elkészült (napi futás)');
insert into leadgen.runs (leads_found, leads_new, drafted, log) values (..., ..., ..., '<rövid összefoglaló: keresések, kizártak, kiválasztottak>');
```

### 10. Összefoglaló
A futás végén írj egy rövid összefoglalót: hány új lead jött, hány lett kizárva (és miért), kik kaptak demót és piszkozatot (linkekkel), és kinél hiányzik az email.

## Szabályok
- Soha ne küldj emailt, csak piszkozatot írj. Napi legfeljebb 5 piszkozat, és csak olyan leadnek, akinek van email-címe.
- Egy vállalkozást csak egyszer keress meg: ha már van `outreach` sora, kihagyandó.
- Az `opt_outs` tiltólista mindent felülír.
- Ne találj ki adatot. Ha valami nem derül ki, hagyd üresen.
- Ha egy lépés hibára fut (pl. a GitHub push), a többit végezd el, és a hibát írd bele a `runs.log`-ba.
