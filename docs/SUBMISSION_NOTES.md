# Submission notes — PAYLOAD ZERO

Draft material for the Space Apps project page. All fields and attachments must be in English; a video may be in Ukrainian with English subtitles. **Check the current deadline and rules with the organizers before submitting.** The provided manual contains conflicting dates (a November 14–15 programme with a 23:55 submission deadline on November 15, and an older fragment that mentions October 6). These notes do not choose between them.

## High-level project summary (draft)

PAYLOAD ZERO is a browser game in which students design a whole NASA-style science mission — goal, launcher, orbit, seven spacecraft subsystems and up to four real NASA instruments — under limits on budget, mass, power, battery, data downlink, schedule and radiation. They fly it through three phases and a crisis, then get a post-flight analysis that separates design flaws from bad luck and explains the score. It runs in Ukrainian and English, supports a local team of up to four players with distinct roles, and marks every number as NASA-sourced or a game assumption.

## Link to the final project

Not published yet. Publishing (for example GitHub Pages) is the owner’s decision; see “Run the game” in the README. The link must be public and work without login.

## NASA data used — what, where from, where in the game

| NASA resource | Where it is used in the game |
| --- | --- |
| LRO mission and instruments pages (science.nasa.gov/mission/lro/…) | LRO mission card (launch date, 50 km science orbit, launch mass); LOLA, LEND and LROC instruments; lunar orbit |
| MRO mission, science instruments and arrival press kit (science.nasa.gov/mission/mars-reconnaissance-orbiter/…, 44745_mro-arrival.pdf) | MRO mission card; HiRISE, CRISM and SHARAD with verified mass/power/band specs; Mars science orbit (periapsis, apoapsis, period); MRO solar power reference |
| Landsat 9 page (science.nasa.gov/mission/landsat-9/) | Landsat 9 mission card; OLI-2 and TIRS-2 specs; sun-synchronous orbit (705 km, 98.2°, 99 min) |
| NASA Earth Observatory orbit catalog | Low Earth orbit option |
| NTRS HU-CAS seminar (2024), NASA routine-payloads EA (2024), SLS reference page | LEO capacities of Falcon 9, Falcon Heavy, Atlas V 551 and SLS Block 1 |
| NASA Small Spacecraft Technology State of the Art (sst-soa) | Subsystem categories and reference links for the bus parts |
| SOHO space-weather resources; Kepler reaction-wheel release; Voyager 2 communications-pause update | Inspiration for the three crisis scenarios |
| Design and Develop Science Missions (Space Apps resource PDF) | Mission flow and the four mission segments (launch, space, ground, user) reflected in the game structure |
| CubeSat 101 (Space Apps resource PDF) | Margin, lead-time, ground-station and pre-launch-review ideas in the rules and advice texts |

Values taken from these sources are shown with a ✓ mark. Every other number is a game assumption (◇) and is labelled as such on screen and in `nasa_data.js` (`gameOnlyFields`).

## Space Agency Partner & other data

None used.

## AI usage (must be disclosed)

- **Claude Code (Anthropic)** was used for an implementation pass. It read the challenge materials, restored the game loop, added the uk/en localization, rebalanced game-only data, added the tutorial, presets, preview, drafts and team mode, wrote the automated tests and the README.
- *Team: add any other AI tools you actually used and what for. Do not list tools you did not use.*

## Demo options (official limit: ≤ 7 slides **or** ≤ 30-second video)

### 30-second video script (problem → one trade-off → flight/crisis → explanation)

| Time | Shot | Voice-over / subtitle |
| --- | --- | --- |
| 0:00–0:03 | Team name + logo | “We are <team>, and this is PAYLOAD ZERO.” |
| 0:03–0:07 | Briefing screen | “Students rarely get to design a whole space mission and see how every choice collides.” |
| 0:07–0:15 | Builder, Mars: press **Preview** on a Ka-band antenna, then load the SLS preset | “One trade-off: a faster link saves our data, but costs mass and power. SLS lifts everything, yet its long lead time makes us two months late.” |
| 0:15–0:23 | Flight phases → crisis dialog showing the real survival chances → confirm safe mode | “In flight, a reaction wheel fails. Safe mode keeps the spacecraft; the bold option keeps more science.” |
| 0:23–0:30 | Report: science path, design-vs-luck verdict, NASA sources | “The report shows why we scored 89, which choices cost points, and the NASA data behind every part. Ukrainian and English, solo or teams of four.” |

### 7-slide outline

1. Title: PAYLOAD ZERO, team name and members, challenge “Space Mission Design Game”.
2. Problem: mission trade-offs are abstract for students.
3. Solution: design → check → fly → crisis → explained report (screenshot `docs/screenshots/en-02-builder.png`).
4. How it works: eight resources, errors vs warnings, the actual survival formula, preview of any swap.
5. User experience: tutorial, presets, local team of four with roles, uk/en (screenshots `en-03-crisis.png`, `uk-06-team.png`).
6. NASA data: real missions, instruments and specs marked ✓, with game assumptions marked ◇ (screenshot `en-04-report.png`).
7. Next steps: ground-network and test-campaign choices with real cost and time consequences, more missions, classroom mode.

The local defence (5-minute pitch) is a separate format and must not be mixed with the official demo limits.

## Screenshots

All in `docs/screenshots/`. They are regenerated by `npm run test:e2e`.

- `uk-01-briefing.png`, `en-01-briefing.png`: mission briefing
- `uk-02-builder.png`, `en-02-builder.png`: builder (Mars, SLS preset)
- `uk-03-crisis.png`, `en-03-crisis.png`: crisis dialog with actual survival chances
- `uk-04-report.png`, `en-04-report.png` (+ `-full` versions): post-flight report
- `uk-05-mobile-builder.png`, `en-05-mobile-builder.png`: 390 px phone layout with the quick-launch bar
- `uk-06-team.png`: local team mode
- `uk-07-no-google-fonts-report.png`: report rendered with Google Fonts blocked
