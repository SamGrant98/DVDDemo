# DVD Stack Visualizer

A 3D browser-based visualizer for your physical media collection. DVDs animate into a scrollable tower, with click-to-focus and cover art pulled from TMDB.

Built with [Three.js](https://threejs.org/) — no build step required.

## Features

- Animated build sequence — DVDs drop into a stacked tower on load
- Smooth scroll through your collection (drag or mouse wheel)
- Click any DVD to focus on it; click again to flip it over
- Mouse-reactive tilt on the focused disc
- Metadata panel: title, year, director, cast, genre, rating, and Letterboxd link
- Optional TMDB integration for poster art (front cover)
- Configurable explosion/spread, float animation, camera offsets, and more via `js/config.js`

## Setup

### 1. Add your collection CSV

Create a `data/` folder and place your CSV there:

```
data/Sams_Physical_Media.csv
```

Expected columns:

| Column | Description |
|---|---|
| `Movie Title` | Film title |
| `Year` | Release year |
| `Director` | Director name(s) |
| `Starring` | Lead cast |
| `Genre` | Genre(s) |
| `Rating (out of 5)` | Your personal rating |
| `Letterboxd URL` | Link to your Letterboxd entry |

### 2. (Optional) Add a TMDB API key

To fetch poster art, add your [TMDB API key](https://www.themoviedb.org/settings/api) in `js/config.js`:

```js
TMDB_API_KEY: "your_key_here",
```

Without a key the tower still builds using CSV data — covers will just show placeholder geometry.

### 3. Serve locally

The app uses ES module imports so it needs to be served over HTTP (not opened as a file).

```bash
# Python
python -m http.server 8080

# Node (if you have npx)
npx serve .
```

Then open `http://localhost:8080`.

## Controls

| Action | Result |
|---|---|
| Drag / scroll wheel | Scroll the tower |
| Click a DVD | Focus + show details |
| Click focused DVD | Flip it over |
| Click empty space / Esc | Return to tower view |
| Space | Skip the build animation |

## Project Structure

```
index.html
js/
  main.js          # Entry point, scene setup, animation loop
  config.js        # All tunable parameters
  dvdStack.js      # Tower geometry, focus/flip state machine
  cameraRig.js     # Camera animations (build, tower, focus modes)
  towerScroll.js   # Elastic drag + scroll logic
  interaction.js   # Raycasting / click handling
  uiControls.js    # Live control panel (sliders)
  csvLoader.js     # CSV parser
  tmdbClient.js    # TMDB API wrapper
  coverService.js  # Cover resolution (local → TMDB fallback)
data/              # Your CSV and optional local cover images (gitignored)
```

## Configuration

`js/config.js` exposes every visual parameter — camera distances, explosion spread, float speed, build timing, smoothing values, and more. Tweak freely; the UI control panel also exposes a subset of these at runtime.
