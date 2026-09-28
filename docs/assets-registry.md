# Реестр ассетов

| Файл | Источник | Лицензия |
| --- | --- | --- |
| Оверлеи поля (круги радиуса, подсветка клеток, полосы HP, метки пингов) | рисуются кодом в `FieldScene.ts` | собственные |
| `docs/brand/archive-v1/*.webp` — прежний логотип (архив, в игре не используется) | создан владельцем проекта | собственный |
| Art Pack 01: исходники `art-source/art-pack-01/**/*.png` (29 листов: башни, враги, боссы, Мельница, пушки, тайлы, декор, небо, интерфейс, гуси, снаряды) | сгенерированы для Millstorm с помощью OpenAI image generation (Codex); промпты — `art-source/art-pack-01/generation-prompts.json`, перечень — `asset-registry.csv` | права определяются условиями использованного сервиса; сторонняя лицензия не заявляется |
| Art Pack 01: `art-source/art-pack-01/fx/svg/*.svg` (20 эффектов) | нарисованы вручную как SVG для Millstorm | собственные |
| `client/public/art/**` — уменьшенные атласы, иконки, небо, копии SVG | собраны `tools/build_art.py` из Art Pack 01 | как у исходников выше |
| Логотип Millstorm (мельница и надпись): `docs/brand/source/millstorm-logo.webp`, экспорты `client/public/brand/*` | рисунок предоставлен владельцем проекта; экспорты — `.claude/skills/millstorm-brand/scripts/brand_exports.py` | права у владельца проекта |
| `docs/brand/archive-v2-armorial/*` — пиксельный герб (архив, в игре не используется) и шрифт Pirata One для его надписи | нарисован кодом в проекте; шрифт — https://fonts.google.com/specimen/Pirata+One | собственный; шрифт — SIL Open Font License 1.1 |
| Шрифт Rubik (npm `@fontsource/rubik`, встраивается в сборку) | https://fonts.google.com/specimen/Rubik | SIL Open Font License 1.1 |
| Шрифт Yeseva One (npm `@fontsource/yeseva-one`, встраивается в сборку) | https://fonts.google.com/specimen/Yeseva+One | SIL Open Font License 1.1 |
