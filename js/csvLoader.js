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

// ✅ THIS is what main.js is importing
export async function loadDVDCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load CSV: ${res.status}`);

  const text = await res.text();
  const grid = parseCSV(text);

  const headers = grid[0];
  const idx = (h) => headers.indexOf(h);

  const iTitle = idx("Movie Title");
  const iYear = idx("Year");
  const iDirector = idx("Director");
  const iStarring = idx("Starring");
  const iGenre = idx("Genre");
  const iRating = idx("Rating (out of 5)");
  const iLetterboxd = idx("Letterboxd URL");

  return grid.slice(1).map(row => ({
    title: row[iTitle] || "",
    year: row[iYear] || "",
    director: row[iDirector] || "",
    starring: row[iStarring] || "",
    genre: row[iGenre] || "",
    rating: row[iRating] || "",
    letterboxd: row[iLetterboxd] || ""
  })).filter(d => d.title);
}
