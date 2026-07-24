# Avatar Master Brief (v1)

Goal: expand **true masters** (distinct face/hair/age composition), not recolor clones.
Keep `assignment: explicit` until matchable masters >= `minAutoPool` (6), prefer 8+.

## Hard rules
- Only `source: master` + `matchable: true` enter auto pool.
- `source: variant-recolor` must stay `matchable: false`.
- Same kit recolor is for team color only, never identity.
- Base art is neutral mood; status uses overlay badge.
- Visual contract: SD head, thick outline, same shoulder crop, same pixel grid as procedural faces.

## Minimum set (8 masters)

| Slot | ID (suggested) | Age band | Regions | Skin | Hair color | Hair style | Why |
|------|----------------|----------|---------|------|------------|------------|-----|
| M1 | avatar-0001 (exists) | young_adult | weur/brit/seur | fair | brown | spiky | pilot master |
| M2 | avatar-m02 | youth | easia | light | black | bowl | youth + East Asia |
| M3 | avatar-m03 | young_adult | wafr/usa/fra | deep | black | fade | deep skin + fade |
| M4 | avatar-m04 | prime | nordic/brit | pale | blond | messy | nordic blond |
| M5 | avatar-m05 | prime | seur/tur/nafr | olive | black | sidepart | Mediterranean |
| M6 | avatar-m06 | young_adult | latM/latE | tan | black | short/buzz | LatAm pace |
| M7 | avatar-m07 | veteran | brit/weur | fair | grey | short | grey veteran |
| M8 | avatar-m08 | prime | wafr/usa | dark | black | curl/afro | dark + curl volume |

## Stretch set (optional next 4)
- M9 youth brit redhead (red hair, pale)
- M10 fra mixed light-brown / tan, short crop
- M11 easia prime sidepart
- M12 veteran dark grey fade

## Delivery checklist per master
1. Distinct face silhouette + hairstyle (not recolor of another).
2. Export: 1024 master PNG + 512 portrait webp/png + 96/128 thumbnail webp.
3. Manifest fields: ageMin/ageMax/ageBand/skinTone/hairColor/hairStyle/regions/kitPrimary.
4. `source: "master"`, `matchable: true`.
5. Rebuild module: `node scripts/build-avatar-assets-module.mjs`.
6. Verify page: matchable pool count + uniqueness.

## Open match only when
- matchable masters >= 6 (target 8)
- verify uniqueness on sample nations >= 7 different ids
- no team-wide same-face collisions in same-club sample

## Player data already ready
- `appearanceSeed`, `skinTone`, `hairColor`, `hairStyle` persist on create/migrate.
- Query/scoring already prefers persisted traits + hair match bonuses.
