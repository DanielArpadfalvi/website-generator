# Outreach CRM (helyi)

Helyben futó CRM a weboldal-outreach pipeline ügyfeleihez. Ugyanabból a Supabase adatbázisból dolgozik (`audience-first-pipeline` projekt, `leadgen` séma), amibe a napi automatikus futás is ír, így minden új lead azonnal megjelenik.

## Első indítás (Windows)

1. Kell hozzá Node.js 20.6 vagy újabb (https://nodejs.org, LTS).
2. Kattints duplán a `start.bat`-ra. Első alkalommal létrehozza a `.env` fájlt és megnyitja Jegyzettömbben.
3. A Supabase-ben: **audience-first-pipeline → Connect → Session pooler → URI**. Másold be a `DATABASE_URL=` után, a `[YOUR-PASSWORD]` helyére pedig az adatbázis jelszavát. (Ha nem emlékszel rá: Project Settings → Database → Reset database password.)
4. Indítsd újra a `start.bat`-ot. Telepíti a függőségeket, és megnyitja a böngészőben: http://localhost:4310

A `.env` nincs verziókezelve (a jelszó nem kerül fel a GitHubra). A szerver csak a saját gépedről érhető el (127.0.0.1).

## Mit tud

- **Áttekintés:** lejárt és mai utókövetések, aktív ügyek, válaszarány, megnyert bevétel, tölcsér, napi futások naplója, legutóbbi események.
- **Pipeline:** kanban tábla. A kártyát áthúzva változik a státusz. „Megnyert”-nél bekéri az összeget, „Elvesztett”-nél az okát.
- **Ügyfelek:** a teljes lista keresővel, státusz- és kategóriaszűrővel, oszlop szerinti rendezéssel.
- **Utókövetés:** a lejárt, mai és heti teendők, gyors „Kész” és „+3 nap” gombokkal.
- **Ügyfél adatlap (oldalpanel):**
  - linkek: demo oldal, Gmail-piszkozatok, Google Maps, telefon, email
  - szerkeszthető adatok
  - utókövetés ütemezése (holnap / +3 nap / +1 hét / +2 hét vagy pontos időpont)
  - előzmények: jegyzet, hívás, email, találkozó
- **Automatikus szabályok (az adatbázisban):**
  - minden státuszváltás bekerül az előzmények közé
  - „Kiküldve” státusznál magától létrejön egy utókövetés 4 nappal később, 9:00-ra
  - lezárt státusznál (megnyert, elvesztett, leiratkozott, kizárva) törlődik az utókövetés
  - „Leiratkozott” státusznál az email felkerül a tiltólistára (`leadgen.opt_outs`), és a napi futás többet nem keresi meg

## Státuszok

`new` Új → `qualified` Ellenőrizve → `demo_built` Demo kész → `drafted` Piszkozat → `sent` Kiküldve → `replied` Válaszolt → `negotiating` Egyeztetés → `won` Megnyert / `lost` Elvesztett. Mellékágak: `on_hold` Várakozik, `opt_out` Leiratkozott, `excluded` Kizárva (pl. van már weboldala).

## Fájlok

- `server.js`: Express API (Postgres kapcsolat a `pg` csomaggal)
- `public/`: a felület (HTML, CSS, JS, build lépés nélkül)
- `db/schema.sql`: a `leadgen` séma teljes definíciója (dokumentáció, illetve helyi teszt adatbázishoz)
