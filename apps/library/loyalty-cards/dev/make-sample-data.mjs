// Development only (not shipped): prints the listing's sampleData, the made-up cards of package/js/sample.mjs as the
// app stores them (without the record ids and times the phone adds).
//
//   node dev/make-sample-data.mjs
import { sampleCards } from "../package/js/sample.mjs";

const card = sampleCards().map(({ id, createdAt, updatedAt, ...stored }) => stored);
console.log(JSON.stringify({ card }, null, 2));
