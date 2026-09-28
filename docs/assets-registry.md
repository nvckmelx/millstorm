# Реестр ассетов

| Файл | Источник | Лицензия |
| --- | --- | --- |
| Графика прототипа (фигуры на поле, Мельница) | нарисовано в коде проекта | собственная |
| Логотип Millstorm (герб и надпись), `client/public/brand/*` | нарисован кодом в `.claude/skills/millstorm-brand/scripts/brand_exports.py` | собственный |
| `docs/brand/archive-v1/*.webp` — прежний логотип (архив, в игре не используется) | создан владельцем проекта | собственный |
| Шрифт Pirata One (`docs/brand/fonts/`, только как заготовка букв надписи в логотипе) | https://fonts.google.com/specimen/Pirata+One | SIL Open Font License 1.1 |
| `client/src/assets/wall.svg` — пиксельная каменная кладка | нарисована в проекте | собственная |
| Art Pack 01: исходники `art-source/art-pack-01/**/*.png` (29 листов: башни, враги, боссы, Мельница, пушки, тайлы, декор, небо, интерфейс, гуси, снаряды) | сгенерированы для Millstorm с помощью OpenAI image generation (Codex); промпты — `art-source/art-pack-01/generation-prompts.json`, перечень — `asset-registry.csv` | права определяются условиями использованного сервиса; сторонняя лицензия не заявляется |
| Art Pack 01: `art-source/art-pack-01/fx/svg/*.svg` (20 эффектов) | нарисованы вручную как SVG для Millstorm | собственные |
| `client/public/art/**` — уменьшенные атласы, иконки, небо, копии SVG | собраны `tools/build_art.py` из Art Pack 01 | как у исходников выше |
| Шрифт Pixelify Sans (npm `@fontsource/pixelify-sans`, встраивается в сборку) | https://fonts.google.com/specimen/Pixelify+Sans | SIL Open Font License 1.1 |
