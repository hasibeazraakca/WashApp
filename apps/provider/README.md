# WashApp — Hizmet Veren App (`@washapp/provider`)

Kapıda mobil oto yıkama pazaryeri — **hizmet veren** uygulaması. React Native (Expo prebuild + dev-client), monorepo `apps/provider`.

## Kapsam (docs/03-yazilim-mimarisi.md §1)
İş havuzu, varış (geofence "VARDIM"), **öncesi/sonrası in-app kamera kanıtı** (anti-fraud omurgası, PR-2/3/4), kazanç/cüzdan.

## Neden ayrı app (docs/03 §1.4)
Hizmet veren app'i sürekli **arka plan konum + kamera** izni ister; bunu müşteriden istemek güveni düşürür. Kod paylaşımı `packages/*` ile sağlanır.

## Anti-fraud notu
Öncesi/sonrası fotoğraflar **yalnızca canlı in-app kamerayla** (`react-native-vision-camera`, Faz-1) çekilir — galeri yüklemesi teknik olarak imkânsız. Çekim anında GPS + SHA-256, sunucu re-hash doğrular (docs/03 §3). Bu yüzden saf Expo Go yerine **Expo prebuild + dev-client**.

## Mimari kurallar
- **Yazma + durum geçişi + kanıt INSERT** → FastAPI (`@washapp/api-client`). `money.*`/`audit.*` mobile **kapalı**.
- Okuma (kendi işleri) → Supabase RLS (`@washapp/supabase`).

## Geliştirme
```bash
pnpm install
pnpm --filter @washapp/provider prebuild
pnpm --filter @washapp/provider start
```

## Env (`EXPO_PUBLIC_*`)
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL`
