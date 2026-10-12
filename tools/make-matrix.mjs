// Prints a GitHub Actions matrix: node tools/make-matrix.mjs <chunk_seconds>
const cs = Math.max(10, +process.argv[2] || 45), TOTAL = 900, include = [];
for (let i = 0, s = 0; s < TOTAL; i++, s += cs) {
  include.push({idx: String(i).padStart(3, '0'), start: s, end: Math.min(TOTAL, s + cs)});
}
console.log(JSON.stringify({include}));
