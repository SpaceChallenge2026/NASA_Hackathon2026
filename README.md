# ELSEWHERE — Earth Analog Finder

NASA Space Apps Challenge 2026: *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

Pick a place on the Moon or Mars, or jump to a mission site (Artemis III candidate regions, Shackleton, Jezero, Gale). ELSEWHERE shows the Earth sites that resemble it on six dimensions (terrain, thermal, illumination, water ice, surface material and dust), the months when each Earth site can stand in for the target environment, and an engineering scale-transfer scenario for testing there. A mission card can be downloaded for any site.

**Live site:** https://spacechallenge2026.github.io/NASA_Hackathon2026/

## How it works

- 12,960 Moon and Mars surface cells, grouped into 42 environment types.
- 333 Earth sites and 3,347 Earth–planet pairs. Each dimension is compared separately; there is no weighted total score, and missing data is never counted as similar.
- Monthly test windows from NASA POWER climatology.
- One engineering scenario per pair, from Buckingham Π scale transfer inspired by IT-π (Yuan & Lozano-Durán, 2025).
- These are scenario values from assumed site inputs. They are not site measurements, and this is not an official NASA site selection.

## Data and imagery

- NASA POWER
- NASA Solar System Treks (Viking and LRO WAC mosaics)
- NASA Blue Marble Next Generation and Landsat/WELD via NASA GIBS
- LROC Pits Atlas and the Mars Global Cave Candidate Catalog
- Earth cave records © OpenStreetMap contributors (ODbL)
- Natural Earth
- Mission-site coordinates: IAU Gazetteer of Planetary Nomenclature; Artemis III regions per NASA (28 Oct 2024)

Full credits and references are in the site's **CREDITS** panel.

## Run locally

This is a static site with no build step:

```
python -m http.server 8000
```

Then open http://127.0.0.1:8000/. Sound starts only after you turn it on from **SOUND** in the top bar.

## Use of AI tools

- Background score: AI-generated with Stable Audio 3 from the team's prompts, then looped, layered and compressed by the team. The audio files carry this note in their metadata.
- Code and data processing: AI coding assistants Codex (OpenAI) and Claude Code (Anthropic) assisted with implementation, data processing and browser testing; the team reviewed the results.
