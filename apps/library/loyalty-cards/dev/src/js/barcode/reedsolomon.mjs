// Reed-Solomon error correction over GF(2^m) with the field's reducing polynomial, whose degree m sets the field's
// size (QR 0x11D and Data Matrix 0x12D: GF(256); Aztec 0x13, 0x43, 0x12D, 0x409 and 0x1069: GF(16) for its mode
// message, GF(64), GF(256), GF(1024) and GF(4096) for its data), and α = 2. The generator of degree n has the roots
// α^firstRoot … α^(firstRoot + n − 1) (QR starts at α⁰, Data Matrix and Aztec at α¹).

export class ReedSolomon {
  constructor(polynomial, firstRoot) {
    let field = 1;
    while (field * 2 <= polynomial) field *= 2;
    this.field = field;
    this.firstRoot = firstRoot;
    this.exp = new Int32Array(field * 2);
    this.log = new Int32Array(field);
    let x = 1;
    for (let i = 0; i < field - 1; i++) {
      this.exp[i] = x;
      this.log[x] = i;
      x <<= 1;
      if (x >= field) x ^= polynomial;
    }
    for (let i = field - 1; i < this.exp.length; i++) this.exp[i] = this.exp[i - (field - 1)];
    this.generators = new Map();
  }

  multiply(a, b) {
    return a === 0 || b === 0 ? 0 : this.exp[this.log[a] + this.log[b]];
  }

  /** The generator's coefficients below its leading 1, highest power first. */
  generator(degree) {
    const known = this.generators.get(degree);
    if (known) return known;
    let coefficients = [];
    for (let k = 0; k < degree; k++) {
      const root = this.exp[this.firstRoot + k];
      const next = new Array(coefficients.length + 1);
      // (x^m + c₀x^(m−1) + … + c_(m−1)) · (x + root)
      for (let i = 0; i < next.length; i++) {
        const shifted = i < coefficients.length ? coefficients[i] : 0;
        next[i] = shifted ^ this.multiply(i === 0 ? 1 : coefficients[i - 1], root);
      }
      coefficients = next;
    }
    this.generators.set(degree, coefficients);
    return coefficients;
  }

  /** The error correction codewords of `data` for a generator of `degree`, highest power first. */
  remainder(data, degree) {
    const generator = this.generator(degree);
    const result = new Array(degree).fill(0);
    for (const word of data) {
      const factor = word ^ result[0];
      result.copyWithin(0, 1);
      result[degree - 1] = 0;
      for (let i = 0; i < degree; i++) result[i] ^= this.multiply(generator[i], factor);
    }
    return result;
  }
}
