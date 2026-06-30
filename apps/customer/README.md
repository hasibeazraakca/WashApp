# WashApp — Müşteri App (`@washapp/customer`)

Kapıda mobil oto yıkama pazaryeri — **müşteri** uygulaması. React Native (Expo prebuild + dev-client), monorepo `apps/customer`.

## Kapsam (docs/03-yazilim-mimarisi.md §1)
Sipariş ver, takip (canlı), öncesi/sonrası kanıt görüntüleme, onay/itiraz, abonelik, cüzdan.

## Mimari kurallar
- **Okuma** → Supabase RLS (`@washapp/supabase`), hızlı/ucuz.
- **Yazma + para + durum geçişi** → FastAPI (`@washapp/api-client`). Mobil app `money.*`/`audit.*` tablolarına **asla** dokunmaz.
- Fiyat sabitleri `@washapp/config`'ten (komisyon 0.22, koruma fonu 15, AOV 450) — yalnızca gösterim; otorite backend.

## Geliştirme
```bash
pnpm install                 # repo kökünden
pnpm --filter @washapp/customer prebuild   # ios/ + android/ üret (Expo prebuild)
pnpm --filter @washapp/customer start      # dev-client (Metro monorepo ayarlı)
```

## Env (`EXPO_PUBLIC_*` — istemcide gömülür, sır içermez)
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL`

> `app.json` mevcut; `app.config.ts`'e (dinamik config + config plugin'ler) Faz-1'de geçilebilir (docs/03 §1.1).
