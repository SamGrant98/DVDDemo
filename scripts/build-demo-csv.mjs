// scripts/build-demo-csv.mjs
//
// Transforms data/Sams_Physical_Media.csv (the gitignored master) into
// data/demo.csv (checked in, served as the bundled first-visit demo).
//
// What it does:
//   1. Reads the master CSV
//   2. Drops the "Letterboxd URL" column (we don't want to publish account linkage)
//   3. Adds an empty "Notes" column (placeholder for back-of-DVD notes feature)
//   4. Writes data/demo.csv
//
// Run with:
//   node scripts/build-demo-csv.mjs
//
// Re-run any time Sam updates the master CSV.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const INPUT = resolve(root, "data/Sams_Physical_Media.csv");
const OUTPUT = resolve(root, "data/demo.csv");

const DROP_COLUMNS = new Set(["Letterboxd URL"]);
const ADD_COLUMNS = ["Notes"];

function stripBOM(s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
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
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch !== "\r") cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim().length));
}

function csvEscape(field) {
  const s = String(field ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToCSV(cells) {
  return cells.map(csvEscape).join(",");
}

const text = readFileSync(INPUT, "utf8");
const grid = parseCSV(text);
if (!grid.length) {
  console.error(`No rows parsed from ${INPUT}`);
  process.exit(1);
}

const inHeaders = grid[0];
const keepIdx = inHeaders
  .map((h, i) => (DROP_COLUMNS.has(h) ? -1 : i))
  .filter(i => i !== -1);

const outHeaders = [...keepIdx.map(i => inHeaders[i]), ...ADD_COLUMNS];
const outRows = grid.slice(1).map(row => [
  ...keepIdx.map(i => row[i] ?? ""),
  ...ADD_COLUMNS.map(() => ""),
]);

const out = [rowToCSV(outHeaders), ...outRows.map(rowToCSV)].join("\n") + "\n";
writeFileSync(OUTPUT, out, "utf8");

console.log(`Wrote ${OUTPUT}`);
console.log(`  rows:    ${outRows.length}`);
console.log(`  columns: ${outHeaders.join(", ")}`);
