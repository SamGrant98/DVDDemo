// js/csvLoader.js

function stripBOM(s) {
  if (s && s.charCodeAt(0) === 0xFEFF) return s.slice(1);
  return s;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  text = stripBOM(text);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (ch !== "\r") {
        cur += ch;
      }
    }
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  return rows.filter(r => r.some(c => c.trim().length));
}

// Parses raw CSV text into the row shape main.js expects, and also returns the
// original header list so callers (e.g. the upload validator) can check which
// columns were present. Used by both loadDVDCSV (URL fetch) and the upload UI.
export function parseCollectionText(text) {
  const grid = parseCSV(text);
  const headers = grid[0] || [];
  const idx = (h) => headers.indexOf(h);

  const iTitle = idx("Movie Title");
  const iYear = idx("Year");
  const iDirector = idx("Director");
  const iStarring = idx("Starring");
  const iGenre = idx("Genre");
  const iRating = idx("Rating (out of 5)");
  const iLetterboxd = idx("Letterboxd URL");
  const iNotes = idx("Notes");

  const rows = grid.slice(1).map(row => ({
    __id: crypto.randomUUID(),
    title: row[iTitle] || "",
    year: row[iYear] || "",
    director: row[iDirector] || "",
    starring: row[iStarring] || "",
    genre: row[iGenre] || "",
    rating: row[iRating] || "",
    letterboxd: row[iLetterboxd] || "",
    notes: row[iNotes] || "",
  })).filter(d => d.title);

  return { headers, rows };
}

export async function loadDVDCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load CSV: ${res.status}`);
  const text = await res.text();
  const { rows } = parseCollectionText(text);
  return rows;
}
