"use strict";
var BestpadFeatures = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // mobile/node_modules/fast-text-encoding/text.min.js
  var require_text_min = __commonJS({
    "mobile/node_modules/fast-text-encoding/text.min.js"(exports) {
      (function(scope) {
        "use strict";
        function B(r, e) {
          var f;
          return r instanceof Buffer ? f = r : f = Buffer.from(r.buffer, r.byteOffset, r.byteLength), f.toString(e);
        }
        var w = function(r) {
          return Buffer.from(r);
        };
        function h(r) {
          for (var e = 0, f = Math.min(256 * 256, r.length + 1), n = new Uint16Array(f), i = [], o = 0; ; ) {
            var t = e < r.length;
            if (!t || o >= f - 1) {
              var s = n.subarray(0, o), m = s;
              if (i.push(String.fromCharCode.apply(null, m)), !t) return i.join("");
              r = r.subarray(e), e = 0, o = 0;
            }
            var a = r[e++];
            if ((a & 128) === 0) n[o++] = a;
            else if ((a & 224) === 192) {
              var d = r[e++] & 63;
              n[o++] = (a & 31) << 6 | d;
            } else if ((a & 240) === 224) {
              var d = r[e++] & 63, l = r[e++] & 63;
              n[o++] = (a & 31) << 12 | d << 6 | l;
            } else if ((a & 248) === 240) {
              var d = r[e++] & 63, l = r[e++] & 63, R = r[e++] & 63, c = (a & 7) << 18 | d << 12 | l << 6 | R;
              c > 65535 && (c -= 65536, n[o++] = c >>> 10 & 1023 | 55296, c = 56320 | c & 1023), n[o++] = c;
            }
          }
        }
        function F(r) {
          for (var e = 0, f = r.length, n = 0, i = Math.max(32, f + (f >>> 1) + 7), o = new Uint8Array(i >>> 3 << 3); e < f; ) {
            var t = r.charCodeAt(e++);
            if (t >= 55296 && t <= 56319) {
              if (e < f) {
                var s = r.charCodeAt(e);
                (s & 64512) === 56320 && (++e, t = ((t & 1023) << 10) + (s & 1023) + 65536);
              }
              if (t >= 55296 && t <= 56319) continue;
            }
            if (n + 4 > o.length) {
              i += 8, i *= 1 + e / r.length * 2, i = i >>> 3 << 3;
              var m = new Uint8Array(i);
              m.set(o), o = m;
            }
            if ((t & 4294967168) === 0) {
              o[n++] = t;
              continue;
            } else if ((t & 4294965248) === 0) o[n++] = t >>> 6 & 31 | 192;
            else if ((t & 4294901760) === 0) o[n++] = t >>> 12 & 15 | 224, o[n++] = t >>> 6 & 63 | 128;
            else if ((t & 4292870144) === 0) o[n++] = t >>> 18 & 7 | 240, o[n++] = t >>> 12 & 63 | 128, o[n++] = t >>> 6 & 63 | 128;
            else continue;
            o[n++] = t & 63 | 128;
          }
          return o.slice ? o.slice(0, n) : o.subarray(0, n);
        }
        var u = "Failed to ", p = function(r, e, f) {
          if (r) throw new Error("".concat(u).concat(e, ": the '").concat(f, "' option is unsupported."));
        };
        var x = typeof Buffer == "function" && Buffer.from;
        var A = x ? w : F;
        function v() {
          this.encoding = "utf-8";
        }
        v.prototype.encode = function(r, e) {
          return p(e && e.stream, "encode", "stream"), A(r);
        };
        function U(r) {
          var e;
          try {
            var f = new Blob([r], { type: "text/plain;charset=UTF-8" });
            e = URL.createObjectURL(f);
            var n = new XMLHttpRequest();
            return n.open("GET", e, false), n.send(), n.responseText;
          } finally {
            e && URL.revokeObjectURL(e);
          }
        }
        var O = !x && typeof Blob == "function" && typeof URL == "function" && typeof URL.createObjectURL == "function", S = ["utf-8", "utf8", "unicode-1-1-utf-8"], T = h;
        x ? T = B : O && (T = function(r) {
          try {
            return U(r);
          } catch (e) {
            return h(r);
          }
        });
        var y = "construct 'TextDecoder'", E = "".concat(u, " ").concat(y, ": the ");
        function g(r, e) {
          p(e && e.fatal, y, "fatal"), r = r || "utf-8";
          var f;
          if (x ? f = Buffer.isEncoding(r) : f = S.indexOf(r.toLowerCase()) !== -1, !f) throw new RangeError("".concat(E, " encoding label provided ('").concat(r, "') is invalid."));
          this.encoding = r, this.fatal = false, this.ignoreBOM = false;
        }
        g.prototype.decode = function(r, e) {
          p(e && e.stream, "decode", "stream");
          var f;
          return r instanceof Uint8Array ? f = r : r.buffer instanceof ArrayBuffer ? f = new Uint8Array(r.buffer) : f = new Uint8Array(r), T(f, this.encoding);
        };
        scope.TextEncoder = scope.TextEncoder || v;
        scope.TextDecoder = scope.TextDecoder || g;
      })(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : exports);
    }
  });

  // mobile/src/web-features.ts
  var web_features_exports = {};
  __export(web_features_exports, {
    canMove: () => canMove,
    decryptNote: () => decryptNote,
    deriveKey: () => deriveKey,
    encryptNote: () => encryptNote,
    entries: () => entries,
    isProtected: () => isProtected,
    moveEntry: () => moveEntry,
    projectVerticalDrag: () => projectVerticalDrag,
    protectNote: () => protectNote,
    removeFolder: () => removeFolder,
    treeEntries: () => treeEntries,
    unlockNote: () => unlockNote
  });

  // mobile/src/security.ts
  var import_fast_text_encoding = __toESM(require_text_min());

  // mobile/node_modules/@noble/ciphers/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function abool(b) {
    if (typeof b !== "boolean")
      throw new Error(`boolean expected, not ${b}`);
  }
  function abytes(value, length, title = "") {
    const bytes = isBytes(value);
    const len = value?.length;
    const needsLen = length !== void 0;
    if (!bytes || needsLen && len !== length) {
      const prefix = title && `"${title}" `;
      const ofLen = needsLen ? ` of length ${length}` : "";
      const got = bytes ? `length=${len}` : `type=${typeof value}`;
      throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
    }
    return value;
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "output");
    const min = instance.outputLen;
    if (out.length < min) {
      throw new Error("digestInto() expects output buffer of length at least " + min);
    }
  }
  function u8(arr) {
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
  function equalBytes(a, b) {
    if (a.length !== b.length)
      return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
      diff |= a[i] ^ b[i];
    return diff === 0;
  }
  var wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, constructor) => {
    function wrappedCipher(key, ...args) {
      abytes(key, void 0, "key");
      if (!isLE)
        throw new Error("Non little-endian hardware is not yet supported");
      if (params.nonceLength !== void 0) {
        const nonce = args[0];
        abytes(nonce, params.varSizeNonce ? void 0 : params.nonceLength, "nonce");
      }
      const tagl = params.tagLength;
      if (tagl && args[1] !== void 0)
        abytes(args[1], void 0, "AAD");
      const cipher = constructor(key, ...args);
      const checkOutput = (fnLength, output) => {
        if (output !== void 0) {
          if (fnLength !== 2)
            throw new Error("cipher output not supported");
          abytes(output, void 0, "output");
        }
      };
      let called = false;
      const wrCipher = {
        encrypt(data, output) {
          if (called)
            throw new Error("cannot encrypt() twice with same key + nonce");
          called = true;
          abytes(data);
          checkOutput(cipher.encrypt.length, output);
          return cipher.encrypt(data, output);
        },
        decrypt(data, output) {
          abytes(data);
          if (tagl && data.length < tagl)
            throw new Error('"ciphertext" expected length bigger than tagLength=' + tagl);
          checkOutput(cipher.decrypt.length, output);
          return cipher.decrypt(data, output);
        }
      };
      return wrCipher;
    }
    Object.assign(wrappedCipher, params);
    return wrappedCipher;
  };
  function getOutput(expectedLength, out, onlyAligned = true) {
    if (out === void 0)
      return new Uint8Array(expectedLength);
    if (out.length !== expectedLength)
      throw new Error('"output" expected Uint8Array of length ' + expectedLength + ", got: " + out.length);
    if (onlyAligned && !isAligned32(out))
      throw new Error("invalid output, must be aligned");
    return out;
  }
  function u64Lengths(dataLength, aadLength, isLE2) {
    abool(isLE2);
    const num = new Uint8Array(16);
    const view = createView(num);
    view.setBigUint64(0, BigInt(aadLength), isLE2);
    view.setBigUint64(8, BigInt(dataLength), isLE2);
    return num;
  }
  function isAligned32(bytes) {
    return bytes.byteOffset % 4 === 0;
  }
  function copyBytes(bytes) {
    return Uint8Array.from(bytes);
  }

  // mobile/node_modules/@noble/ciphers/_polyval.js
  var BLOCK_SIZE = 16;
  var ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
  var ZEROS32 = u32(ZEROS16);
  var POLY = 225;
  var mul2 = (s0, s1, s2, s3) => {
    const hiBit = s3 & 1;
    return {
      s3: s2 << 31 | s3 >>> 1,
      s2: s1 << 31 | s2 >>> 1,
      s1: s0 << 31 | s1 >>> 1,
      s0: s0 >>> 1 ^ POLY << 24 & -(hiBit & 1)
      // reduce % poly
    };
  };
  var swapLE = (n) => (n >>> 0 & 255) << 24 | (n >>> 8 & 255) << 16 | (n >>> 16 & 255) << 8 | n >>> 24 & 255 | 0;
  function _toGHASHKey(k) {
    k.reverse();
    const hiBit = k[15] & 1;
    let carry = 0;
    for (let i = 0; i < k.length; i++) {
      const t = k[i];
      k[i] = t >>> 1 | carry;
      carry = (t & 1) << 7;
    }
    k[0] ^= -hiBit & 225;
    return k;
  }
  var estimateWindow = (bytes) => {
    if (bytes > 64 * 1024)
      return 8;
    if (bytes > 1024)
      return 4;
    return 2;
  };
  var GHASH = class {
    // We select bits per window adaptively based on expectedLength
    constructor(key, expectedLength) {
      __publicField(this, "blockLen", BLOCK_SIZE);
      __publicField(this, "outputLen", BLOCK_SIZE);
      __publicField(this, "s0", 0);
      __publicField(this, "s1", 0);
      __publicField(this, "s2", 0);
      __publicField(this, "s3", 0);
      __publicField(this, "finished", false);
      __publicField(this, "t");
      __publicField(this, "W");
      __publicField(this, "windowSize");
      abytes(key, 16, "key");
      key = copyBytes(key);
      const kView = createView(key);
      let k0 = kView.getUint32(0, false);
      let k1 = kView.getUint32(4, false);
      let k2 = kView.getUint32(8, false);
      let k3 = kView.getUint32(12, false);
      const doubles = [];
      for (let i = 0; i < 128; i++) {
        doubles.push({ s0: swapLE(k0), s1: swapLE(k1), s2: swapLE(k2), s3: swapLE(k3) });
        ({ s0: k0, s1: k1, s2: k2, s3: k3 } = mul2(k0, k1, k2, k3));
      }
      const W = estimateWindow(expectedLength || 1024);
      if (![1, 2, 4, 8].includes(W))
        throw new Error("ghash: invalid window size, expected 2, 4 or 8");
      this.W = W;
      const bits = 128;
      const windows = bits / W;
      const windowSize = this.windowSize = 2 ** W;
      const items = [];
      for (let w = 0; w < windows; w++) {
        for (let byte = 0; byte < windowSize; byte++) {
          let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
          for (let j = 0; j < W; j++) {
            const bit = byte >>> W - j - 1 & 1;
            if (!bit)
              continue;
            const { s0: d0, s1: d1, s2: d2, s3: d3 } = doubles[W * w + j];
            s0 ^= d0, s1 ^= d1, s2 ^= d2, s3 ^= d3;
          }
          items.push({ s0, s1, s2, s3 });
        }
      }
      this.t = items;
    }
    _updateBlock(s0, s1, s2, s3) {
      s0 ^= this.s0, s1 ^= this.s1, s2 ^= this.s2, s3 ^= this.s3;
      const { W, t, windowSize } = this;
      let o0 = 0, o1 = 0, o2 = 0, o3 = 0;
      const mask = (1 << W) - 1;
      let w = 0;
      for (const num of [s0, s1, s2, s3]) {
        for (let bytePos = 0; bytePos < 4; bytePos++) {
          const byte = num >>> 8 * bytePos & 255;
          for (let bitPos = 8 / W - 1; bitPos >= 0; bitPos--) {
            const bit = byte >>> W * bitPos & mask;
            const { s0: e0, s1: e1, s2: e2, s3: e3 } = t[w * windowSize + bit];
            o0 ^= e0, o1 ^= e1, o2 ^= e2, o3 ^= e3;
            w += 1;
          }
        }
      }
      this.s0 = o0;
      this.s1 = o1;
      this.s2 = o2;
      this.s3 = o3;
    }
    update(data) {
      aexists(this);
      abytes(data);
      data = copyBytes(data);
      const b32 = u32(data);
      const blocks = Math.floor(data.length / BLOCK_SIZE);
      const left = data.length % BLOCK_SIZE;
      for (let i = 0; i < blocks; i++) {
        this._updateBlock(b32[i * 4 + 0], b32[i * 4 + 1], b32[i * 4 + 2], b32[i * 4 + 3]);
      }
      if (left) {
        ZEROS16.set(data.subarray(blocks * BLOCK_SIZE));
        this._updateBlock(ZEROS32[0], ZEROS32[1], ZEROS32[2], ZEROS32[3]);
        clean(ZEROS32);
      }
      return this;
    }
    destroy() {
      const { t } = this;
      for (const elm of t) {
        elm.s0 = 0, elm.s1 = 0, elm.s2 = 0, elm.s3 = 0;
      }
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { s0, s1, s2, s3 } = this;
      const o32 = u32(out);
      o32[0] = s0;
      o32[1] = s1;
      o32[2] = s2;
      o32[3] = s3;
      return out;
    }
    digest() {
      const res = new Uint8Array(BLOCK_SIZE);
      this.digestInto(res);
      this.destroy();
      return res;
    }
  };
  var Polyval = class extends GHASH {
    constructor(key, expectedLength) {
      abytes(key);
      const ghKey = _toGHASHKey(copyBytes(key));
      super(ghKey, expectedLength);
      clean(ghKey);
    }
    update(data) {
      aexists(this);
      abytes(data);
      data = copyBytes(data);
      const b32 = u32(data);
      const left = data.length % BLOCK_SIZE;
      const blocks = Math.floor(data.length / BLOCK_SIZE);
      for (let i = 0; i < blocks; i++) {
        this._updateBlock(swapLE(b32[i * 4 + 3]), swapLE(b32[i * 4 + 2]), swapLE(b32[i * 4 + 1]), swapLE(b32[i * 4 + 0]));
      }
      if (left) {
        ZEROS16.set(data.subarray(blocks * BLOCK_SIZE));
        this._updateBlock(swapLE(ZEROS32[3]), swapLE(ZEROS32[2]), swapLE(ZEROS32[1]), swapLE(ZEROS32[0]));
        clean(ZEROS32);
      }
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { s0, s1, s2, s3 } = this;
      const o32 = u32(out);
      o32[0] = s0;
      o32[1] = s1;
      o32[2] = s2;
      o32[3] = s3;
      return out.reverse();
    }
  };
  function wrapConstructorWithKey(hashCons) {
    const hashC = (msg, key) => hashCons(key, msg.length).update(msg).digest();
    const tmp = hashCons(new Uint8Array(16), 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (key, expectedLength) => hashCons(key, expectedLength);
    return hashC;
  }
  var ghash = wrapConstructorWithKey((key, expectedLength) => new GHASH(key, expectedLength));
  var polyval = wrapConstructorWithKey((key, expectedLength) => new Polyval(key, expectedLength));

  // mobile/node_modules/@noble/ciphers/aes.js
  var BLOCK_SIZE2 = 16;
  var BLOCK_SIZE32 = 4;
  var EMPTY_BLOCK = /* @__PURE__ */ new Uint8Array(BLOCK_SIZE2);
  var POLY2 = 283;
  function validateKeyLength(key) {
    if (![16, 24, 32].includes(key.length))
      throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + key.length);
  }
  function mul22(n) {
    return n << 1 ^ POLY2 & -(n >> 7);
  }
  function mul(a, b) {
    let res = 0;
    for (; b > 0; b >>= 1) {
      res ^= a & -(b & 1);
      a = mul22(a);
    }
    return res;
  }
  var sbox = /* @__PURE__ */ (() => {
    const t = new Uint8Array(256);
    for (let i = 0, x = 1; i < 256; i++, x ^= mul22(x))
      t[i] = x;
    const box = new Uint8Array(256);
    box[0] = 99;
    for (let i = 0; i < 255; i++) {
      let x = t[255 - i];
      x |= x << 8;
      box[t[i]] = (x ^ x >> 4 ^ x >> 5 ^ x >> 6 ^ x >> 7 ^ 99) & 255;
    }
    clean(t);
    return box;
  })();
  var rotr32_8 = (n) => n << 24 | n >>> 8;
  var rotl32_8 = (n) => n << 8 | n >>> 24;
  function genTtable(sbox2, fn) {
    if (sbox2.length !== 256)
      throw new Error("Wrong sbox length");
    const T0 = new Uint32Array(256).map((_, j) => fn(sbox2[j]));
    const T1 = T0.map(rotl32_8);
    const T2 = T1.map(rotl32_8);
    const T3 = T2.map(rotl32_8);
    const T01 = new Uint32Array(256 * 256);
    const T23 = new Uint32Array(256 * 256);
    const sbox22 = new Uint16Array(256 * 256);
    for (let i = 0; i < 256; i++) {
      for (let j = 0; j < 256; j++) {
        const idx = i * 256 + j;
        T01[idx] = T0[i] ^ T1[j];
        T23[idx] = T2[i] ^ T3[j];
        sbox22[idx] = sbox2[i] << 8 | sbox2[j];
      }
    }
    return { sbox: sbox2, sbox2: sbox22, T0, T1, T2, T3, T01, T23 };
  }
  var tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => mul(s, 3) << 24 | s << 16 | s << 8 | mul(s, 2));
  var xPowers = /* @__PURE__ */ (() => {
    const p = new Uint8Array(16);
    for (let i = 0, x = 1; i < 16; i++, x = mul22(x))
      p[i] = x;
    return p;
  })();
  function expandKeyLE(key) {
    abytes(key);
    const len = key.length;
    validateKeyLength(key);
    const { sbox2 } = tableEncoding;
    const toClean = [];
    if (!isAligned32(key))
      toClean.push(key = copyBytes(key));
    const k32 = u32(key);
    const Nk = k32.length;
    const subByte = (n) => applySbox(sbox2, n, n, n, n);
    const xk = new Uint32Array(len + 28);
    xk.set(k32);
    for (let i = Nk; i < xk.length; i++) {
      let t = xk[i - 1];
      if (i % Nk === 0)
        t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
      else if (Nk > 6 && i % Nk === 4)
        t = subByte(t);
      xk[i] = xk[i - Nk] ^ t;
    }
    clean(...toClean);
    return xk;
  }
  function apply0123(T01, T23, s0, s1, s2, s3) {
    return T01[s0 << 8 & 65280 | s1 >>> 8 & 255] ^ T23[s2 >>> 8 & 65280 | s3 >>> 24 & 255];
  }
  function applySbox(sbox2, s0, s1, s2, s3) {
    return sbox2[s0 & 255 | s1 & 65280] | sbox2[s2 >>> 16 & 255 | s3 >>> 16 & 65280] << 16;
  }
  function encrypt(xk, s0, s1, s2, s3) {
    const { sbox2, T01, T23 } = tableEncoding;
    let k = 0;
    s0 ^= xk[k++], s1 ^= xk[k++], s2 ^= xk[k++], s3 ^= xk[k++];
    const rounds = xk.length / 4 - 2;
    for (let i = 0; i < rounds; i++) {
      const t02 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
      const t12 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
      const t22 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
      const t32 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
      s0 = t02, s1 = t12, s2 = t22, s3 = t32;
    }
    const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
    const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
    const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
    const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
    return { s0: t0, s1: t1, s2: t2, s3: t3 };
  }
  function ctr32(xk, isLE2, nonce, src, dst) {
    abytes(nonce, BLOCK_SIZE2, "nonce");
    abytes(src);
    dst = getOutput(src.length, dst);
    const ctr = nonce;
    const c32 = u32(ctr);
    const view = createView(ctr);
    const src32 = u32(src);
    const dst32 = u32(dst);
    const ctrPos = isLE2 ? 0 : 12;
    const srcLen = src.length;
    let ctrNum = view.getUint32(ctrPos, isLE2);
    let { s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]);
    for (let i = 0; i + 4 <= src32.length; i += 4) {
      dst32[i + 0] = src32[i + 0] ^ s0;
      dst32[i + 1] = src32[i + 1] ^ s1;
      dst32[i + 2] = src32[i + 2] ^ s2;
      dst32[i + 3] = src32[i + 3] ^ s3;
      ctrNum = ctrNum + 1 >>> 0;
      view.setUint32(ctrPos, ctrNum, isLE2);
      ({ s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]));
    }
    const start = BLOCK_SIZE2 * Math.floor(src32.length / BLOCK_SIZE32);
    if (start < srcLen) {
      const b32 = new Uint32Array([s0, s1, s2, s3]);
      const buf = u8(b32);
      for (let i = start, pos = 0; i < srcLen; i++, pos++)
        dst[i] = src[i] ^ buf[pos];
      clean(b32);
    }
    return dst;
  }
  function computeTag(fn, isLE2, key, data, AAD) {
    const aadLength = AAD ? AAD.length : 0;
    const h = fn.create(key, data.length + aadLength);
    if (AAD)
      h.update(AAD);
    const num = u64Lengths(8 * data.length, 8 * aadLength, isLE2);
    h.update(data);
    h.update(num);
    const res = h.digest();
    clean(num);
    return res;
  }
  var gcm = /* @__PURE__ */ wrapCipher({ blockSize: 16, nonceLength: 12, tagLength: 16, varSizeNonce: true }, function aesgcm(key, nonce, AAD) {
    if (nonce.length < 8)
      throw new Error("aes/gcm: invalid nonce length");
    const tagLength = 16;
    function _computeTag(authKey, tagMask, data) {
      const tag = computeTag(ghash, false, authKey, data, AAD);
      for (let i = 0; i < tagMask.length; i++)
        tag[i] ^= tagMask[i];
      return tag;
    }
    function deriveKeys() {
      const xk = expandKeyLE(key);
      const authKey = EMPTY_BLOCK.slice();
      const counter = EMPTY_BLOCK.slice();
      ctr32(xk, false, counter, counter, authKey);
      if (nonce.length === 12) {
        counter.set(nonce);
      } else {
        const nonceLen = EMPTY_BLOCK.slice();
        const view = createView(nonceLen);
        view.setBigUint64(8, BigInt(nonce.length * 8), false);
        const g = ghash.create(authKey).update(nonce).update(nonceLen);
        g.digestInto(counter);
        g.destroy();
      }
      const tagMask = ctr32(xk, false, counter, EMPTY_BLOCK);
      return { xk, authKey, counter, tagMask };
    }
    return {
      encrypt(plaintext) {
        const { xk, authKey, counter, tagMask } = deriveKeys();
        const out = new Uint8Array(plaintext.length + tagLength);
        const toClean = [xk, authKey, counter, tagMask];
        if (!isAligned32(plaintext))
          toClean.push(plaintext = copyBytes(plaintext));
        ctr32(xk, false, counter, plaintext, out.subarray(0, plaintext.length));
        const tag = _computeTag(authKey, tagMask, out.subarray(0, out.length - tagLength));
        toClean.push(tag);
        out.set(tag, plaintext.length);
        clean(...toClean);
        return out;
      },
      decrypt(ciphertext) {
        const { xk, authKey, counter, tagMask } = deriveKeys();
        const toClean = [xk, authKey, tagMask, counter];
        if (!isAligned32(ciphertext))
          toClean.push(ciphertext = copyBytes(ciphertext));
        const data = ciphertext.subarray(0, -tagLength);
        const passedTag = ciphertext.subarray(-tagLength);
        const tag = _computeTag(authKey, tagMask, data);
        toClean.push(tag);
        if (!equalBytes(tag, passedTag))
          throw new Error("aes/gcm: invalid ghash tag");
        const out = ctr32(xk, false, counter, data);
        clean(...toClean);
        return out;
      }
    };
  });
  function isBytes32(a) {
    return a instanceof Uint32Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint32Array";
  }
  function encryptBlock(xk, block) {
    abytes(block, 16, "block");
    if (!isBytes32(xk))
      throw new Error("_encryptBlock accepts result of expandKeyLE");
    const b32 = u32(block);
    let { s0, s1, s2, s3 } = encrypt(xk, b32[0], b32[1], b32[2], b32[3]);
    b32[0] = s0, b32[1] = s1, b32[2] = s2, b32[3] = s3;
    return block;
  }
  function dbl(block) {
    let carry = 0;
    for (let i = BLOCK_SIZE2 - 1; i >= 0; i--) {
      const newCarry = (block[i] & 128) >>> 7;
      block[i] = block[i] << 1 | carry;
      carry = newCarry;
    }
    if (carry) {
      block[BLOCK_SIZE2 - 1] ^= 135;
    }
    return block;
  }
  function xorBlock(a, b) {
    if (a.length !== b.length)
      throw new Error("xorBlock: blocks must have same length");
    for (let i = 0; i < a.length; i++) {
      a[i] = a[i] ^ b[i];
    }
    return a;
  }
  var _CMAC = class {
    constructor(key) {
      __publicField(this, "buffer");
      __publicField(this, "destroyed");
      __publicField(this, "k1");
      __publicField(this, "k2");
      __publicField(this, "xk");
      abytes(key);
      validateKeyLength(key);
      this.xk = expandKeyLE(key);
      this.buffer = new Uint8Array(0);
      this.destroyed = false;
      const L = new Uint8Array(BLOCK_SIZE2);
      encryptBlock(this.xk, L);
      this.k1 = dbl(L);
      this.k2 = dbl(new Uint8Array(this.k1));
    }
    update(data) {
      const { destroyed, buffer } = this;
      if (destroyed)
        throw new Error("CMAC instance was destroyed");
      abytes(data);
      const newBuffer = new Uint8Array(buffer.length + data.length);
      newBuffer.set(buffer);
      newBuffer.set(data, buffer.length);
      this.buffer = newBuffer;
      return this;
    }
    // see https://www.rfc-editor.org/rfc/rfc4493.html#section-2.4
    digest() {
      if (this.destroyed)
        throw new Error("CMAC instance was destroyed");
      const { buffer } = this;
      const msgLen = buffer.length;
      let n = Math.ceil(msgLen / BLOCK_SIZE2);
      let flag;
      if (n === 0) {
        n = 1;
        flag = false;
      } else {
        flag = msgLen % BLOCK_SIZE2 === 0;
      }
      const lastBlockStart = (n - 1) * BLOCK_SIZE2;
      const lastBlockData = buffer.subarray(lastBlockStart);
      let m_last;
      if (flag) {
        m_last = xorBlock(new Uint8Array(lastBlockData), this.k1);
      } else {
        const padded = new Uint8Array(BLOCK_SIZE2);
        padded.set(lastBlockData);
        padded[lastBlockData.length] = 128;
        m_last = xorBlock(padded, this.k2);
      }
      let x = new Uint8Array(BLOCK_SIZE2);
      for (let i = 0; i < n - 1; i++) {
        const m_i = buffer.subarray(i * BLOCK_SIZE2, (i + 1) * BLOCK_SIZE2);
        xorBlock(x, m_i);
        encryptBlock(this.xk, x);
      }
      xorBlock(x, m_last);
      encryptBlock(this.xk, x);
      clean(m_last);
      return x;
    }
    destroy() {
      const { buffer, destroyed, xk, k1, k2 } = this;
      if (destroyed)
        return;
      this.destroyed = true;
      clean(buffer, xk, k1, k2);
    }
  };
  var cmac = (key, message) => new _CMAC(key).update(message).digest();
  cmac.create = (key) => new _CMAC(key);

  // mobile/node_modules/@noble/hashes/utils.js
  function isBytes2(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function anumber2(n, title = "") {
    if (!Number.isSafeInteger(n) || n < 0) {
      const prefix = title && `"${title}" `;
      throw new Error(`${prefix}expected integer >= 0, got ${n}`);
    }
  }
  function abytes2(value, length, title = "") {
    const bytes = isBytes2(value);
    const len = value?.length;
    const needsLen = length !== void 0;
    if (!bytes || needsLen && len !== length) {
      const prefix = title && `"${title}" `;
      const ofLen = needsLen ? ` of length ${length}` : "";
      const got = bytes ? `length=${len}` : `type=${typeof value}`;
      throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
    }
    return value;
  }
  function ahash(h) {
    if (typeof h !== "function" || typeof h.create !== "function")
      throw new Error("Hash must wrapped by utils.createHasher");
    anumber2(h.outputLen);
    anumber2(h.blockLen);
  }
  function aexists2(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput2(out, instance) {
    abytes2(out, void 0, "digestInto() output");
    const min = instance.outputLen;
    if (out.length < min) {
      throw new Error('"digestInto() output" expected to be of length >=' + min);
    }
  }
  function clean2(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView2(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function rotr(word, shift) {
    return word << 32 - shift | word >>> shift;
  }
  var hasHexBuiltin = /* @__PURE__ */ (() => (
    // @ts-ignore
    typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
  ))();
  var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  function bytesToHex(bytes) {
    abytes2(bytes);
    if (hasHexBuiltin)
      return bytes.toHex();
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += hexes[bytes[i]];
    }
    return hex;
  }
  var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
  function asciiToBase16(ch) {
    if (ch >= asciis._0 && ch <= asciis._9)
      return ch - asciis._0;
    if (ch >= asciis.A && ch <= asciis.F)
      return ch - (asciis.A - 10);
    if (ch >= asciis.a && ch <= asciis.f)
      return ch - (asciis.a - 10);
    return;
  }
  function hexToBytes(hex) {
    if (typeof hex !== "string")
      throw new Error("hex string expected, got " + typeof hex);
    if (hasHexBuiltin)
      return Uint8Array.fromHex(hex);
    const hl = hex.length;
    const al = hl / 2;
    if (hl % 2)
      throw new Error("hex string expected, got unpadded hex of length " + hl);
    const array = new Uint8Array(al);
    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
      const n1 = asciiToBase16(hex.charCodeAt(hi));
      const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
      if (n1 === void 0 || n2 === void 0) {
        const char = hex[hi] + hex[hi + 1];
        throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
      }
      array[ai] = n1 * 16 + n2;
    }
    return array;
  }
  var nextTick = async () => {
  };
  async function asyncLoop(iters, tick, cb) {
    let ts = Date.now();
    for (let i = 0; i < iters; i++) {
      cb(i);
      const diff = Date.now() - ts;
      if (diff >= 0 && diff < tick)
        continue;
      await nextTick();
      ts += diff;
    }
  }
  function utf8ToBytes(str) {
    if (typeof str !== "string")
      throw new Error("string expected");
    return new Uint8Array(new TextEncoder().encode(str));
  }
  function kdfInputToBytes(data, errorTitle = "") {
    if (typeof data === "string")
      return utf8ToBytes(data);
    return abytes2(data, void 0, errorTitle);
  }
  function checkOpts(defaults, opts) {
    if (opts !== void 0 && {}.toString.call(opts) !== "[object Object]")
      throw new Error("options must be object or undefined");
    const merged = Object.assign(defaults, opts);
    return merged;
  }
  function createHasher(hashCons, info = {}) {
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(void 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  var oidNist = (suffix) => ({
    oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
  });

  // mobile/node_modules/@noble/hashes/hmac.js
  var _HMAC = class {
    constructor(hash, key) {
      __publicField(this, "oHash");
      __publicField(this, "iHash");
      __publicField(this, "blockLen");
      __publicField(this, "outputLen");
      __publicField(this, "finished", false);
      __publicField(this, "destroyed", false);
      ahash(hash);
      abytes2(key, void 0, "key");
      this.iHash = hash.create();
      if (typeof this.iHash.update !== "function")
        throw new Error("Expected instance of class which extends utils.Hash");
      this.blockLen = this.iHash.blockLen;
      this.outputLen = this.iHash.outputLen;
      const blockLen = this.blockLen;
      const pad = new Uint8Array(blockLen);
      pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54;
      this.iHash.update(pad);
      this.oHash = hash.create();
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54 ^ 92;
      this.oHash.update(pad);
      clean2(pad);
    }
    update(buf) {
      aexists2(this);
      this.iHash.update(buf);
      return this;
    }
    digestInto(out) {
      aexists2(this);
      abytes2(out, this.outputLen, "output");
      this.finished = true;
      this.iHash.digestInto(out);
      this.oHash.update(out);
      this.oHash.digestInto(out);
      this.destroy();
    }
    digest() {
      const out = new Uint8Array(this.oHash.outputLen);
      this.digestInto(out);
      return out;
    }
    _cloneInto(to) {
      to || (to = Object.create(Object.getPrototypeOf(this), {}));
      const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
      to = to;
      to.finished = finished;
      to.destroyed = destroyed;
      to.blockLen = blockLen;
      to.outputLen = outputLen;
      to.oHash = oHash._cloneInto(to.oHash);
      to.iHash = iHash._cloneInto(to.iHash);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
    destroy() {
      this.destroyed = true;
      this.oHash.destroy();
      this.iHash.destroy();
    }
  };
  var hmac = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
  hmac.create = (hash, key) => new _HMAC(hash, key);

  // mobile/node_modules/@noble/hashes/pbkdf2.js
  function pbkdf2Init(hash, _password, _salt, _opts) {
    ahash(hash);
    const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
    const { c, dkLen, asyncTick } = opts;
    anumber2(c, "c");
    anumber2(dkLen, "dkLen");
    anumber2(asyncTick, "asyncTick");
    if (c < 1)
      throw new Error("iterations (c) must be >= 1");
    const password = kdfInputToBytes(_password, "password");
    const salt = kdfInputToBytes(_salt, "salt");
    const DK = new Uint8Array(dkLen);
    const PRF = hmac.create(hash, password);
    const PRFSalt = PRF._cloneInto().update(salt);
    return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
  }
  function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
    PRF.destroy();
    PRFSalt.destroy();
    if (prfW)
      prfW.destroy();
    clean2(u);
    return DK;
  }
  async function pbkdf2Async(hash, password, salt, opts) {
    const { c, dkLen, asyncTick, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
    let prfW;
    const arr = new Uint8Array(4);
    const view = createView2(arr);
    const u = new Uint8Array(PRF.outputLen);
    for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
      const Ti = DK.subarray(pos, pos + PRF.outputLen);
      view.setInt32(0, ti, false);
      (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
      Ti.set(u.subarray(0, Ti.length));
      await asyncLoop(c - 1, asyncTick, () => {
        PRF._cloneInto(prfW).update(u).digestInto(u);
        for (let i = 0; i < Ti.length; i++)
          Ti[i] ^= u[i];
      });
    }
    return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
  }

  // mobile/node_modules/@noble/hashes/_md.js
  function Chi(a, b, c) {
    return a & b ^ ~a & c;
  }
  function Maj(a, b, c) {
    return a & b ^ a & c ^ b & c;
  }
  var HashMD = class {
    constructor(blockLen, outputLen, padOffset, isLE2) {
      __publicField(this, "blockLen");
      __publicField(this, "outputLen");
      __publicField(this, "padOffset");
      __publicField(this, "isLE");
      // For partial updates less than block size
      __publicField(this, "buffer");
      __publicField(this, "view");
      __publicField(this, "finished", false);
      __publicField(this, "length", 0);
      __publicField(this, "pos", 0);
      __publicField(this, "destroyed", false);
      this.blockLen = blockLen;
      this.outputLen = outputLen;
      this.padOffset = padOffset;
      this.isLE = isLE2;
      this.buffer = new Uint8Array(blockLen);
      this.view = createView2(this.buffer);
    }
    update(data) {
      aexists2(this);
      abytes2(data);
      const { view, buffer, blockLen } = this;
      const len = data.length;
      for (let pos = 0; pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        if (take === blockLen) {
          const dataView = createView2(data);
          for (; blockLen <= len - pos; pos += blockLen)
            this.process(dataView, pos);
          continue;
        }
        buffer.set(data.subarray(pos, pos + take), this.pos);
        this.pos += take;
        pos += take;
        if (this.pos === blockLen) {
          this.process(view, 0);
          this.pos = 0;
        }
      }
      this.length += data.length;
      this.roundClean();
      return this;
    }
    digestInto(out) {
      aexists2(this);
      aoutput2(out, this);
      this.finished = true;
      const { buffer, view, blockLen, isLE: isLE2 } = this;
      let { pos } = this;
      buffer[pos++] = 128;
      clean2(this.buffer.subarray(pos));
      if (this.padOffset > blockLen - pos) {
        this.process(view, 0);
        pos = 0;
      }
      for (let i = pos; i < blockLen; i++)
        buffer[i] = 0;
      view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE2);
      this.process(view, 0);
      const oview = createView2(out);
      const len = this.outputLen;
      if (len % 4)
        throw new Error("_sha2: outputLen must be aligned to 32bit");
      const outLen = len / 4;
      const state = this.get();
      if (outLen > state.length)
        throw new Error("_sha2: outputLen bigger than state");
      for (let i = 0; i < outLen; i++)
        oview.setUint32(4 * i, state[i], isLE2);
    }
    digest() {
      const { buffer, outputLen } = this;
      this.digestInto(buffer);
      const res = buffer.slice(0, outputLen);
      this.destroy();
      return res;
    }
    _cloneInto(to) {
      to || (to = new this.constructor());
      to.set(...this.get());
      const { blockLen, buffer, length, finished, destroyed, pos } = this;
      to.destroyed = destroyed;
      to.finished = finished;
      to.length = length;
      to.pos = pos;
      if (length % blockLen)
        to.buffer.set(buffer);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
  };
  var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);

  // mobile/node_modules/@noble/hashes/sha2.js
  var SHA256_K = /* @__PURE__ */ Uint32Array.from([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
  var SHA2_32B = class extends HashMD {
    constructor(outputLen) {
      super(64, outputLen, 8, false);
    }
    get() {
      const { A, B, C, D, E, F, G, H } = this;
      return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
      this.A = A | 0;
      this.B = B | 0;
      this.C = C | 0;
      this.D = D | 0;
      this.E = E | 0;
      this.F = F | 0;
      this.G = G | 0;
      this.H = H | 0;
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4)
        SHA256_W[i] = view.getUint32(offset, false);
      for (let i = 16; i < 64; i++) {
        const W15 = SHA256_W[i - 15];
        const W2 = SHA256_W[i - 2];
        const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
        const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
        SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
      }
      let { A, B, C, D, E, F, G, H } = this;
      for (let i = 0; i < 64; i++) {
        const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
        const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
        const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
        const T2 = sigma0 + Maj(A, B, C) | 0;
        H = G;
        G = F;
        F = E;
        E = D + T1 | 0;
        D = C;
        C = B;
        B = A;
        A = T1 + T2 | 0;
      }
      A = A + this.A | 0;
      B = B + this.B | 0;
      C = C + this.C | 0;
      D = D + this.D | 0;
      E = E + this.E | 0;
      F = F + this.F | 0;
      G = G + this.G | 0;
      H = H + this.H | 0;
      this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
      clean2(SHA256_W);
    }
    destroy() {
      this.set(0, 0, 0, 0, 0, 0, 0, 0);
      clean2(this.buffer);
    }
  };
  var _SHA256 = class extends SHA2_32B {
    constructor() {
      super(32);
      // We cannot use array here since array allows indexing by variable
      // which means optimizer/compiler cannot use registers.
      __publicField(this, "A", SHA256_IV[0] | 0);
      __publicField(this, "B", SHA256_IV[1] | 0);
      __publicField(this, "C", SHA256_IV[2] | 0);
      __publicField(this, "D", SHA256_IV[3] | 0);
      __publicField(this, "E", SHA256_IV[4] | 0);
      __publicField(this, "F", SHA256_IV[5] | 0);
      __publicField(this, "G", SHA256_IV[6] | 0);
      __publicField(this, "H", SHA256_IV[7] | 0);
    }
  };
  var sha256 = /* @__PURE__ */ createHasher(
    () => new _SHA256(),
    /* @__PURE__ */ oidNist(1)
  );

  // mobile/src/security.ts
  var random = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length));
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();
  function isProtected(note) {
    return Boolean(note.sealed);
  }
  async function deriveKey(password, sealed) {
    if (sealed.iterations !== 6e5 || !/^[a-f0-9]{32}$/.test(sealed.salt)) throw new Error("Unsupported protected note.");
    return pbkdf2Async(sha256, encoder.encode(password), hexToBytes(sealed.salt), { c: sealed.iterations, dkLen: 32, asyncTick: 10 });
  }
  function encryptNote(note, key, settings, bytes = random) {
    const iv = bytes(12);
    const value = { text: note.text, content: note.content, filename: note.filename, customName: note.customName };
    const encoded = encoder.encode(JSON.stringify(value));
    if (encoded.length > 19999984) throw new Error("This note is too large to password protect.");
    const ciphertext = gcm(key, iv, encoder.encode(`bestpad:${note.id}:1`)).encrypt(encoded);
    const sealed = { v: 1, ...settings, iv: bytesToHex(iv), ciphertext: bytesToHex(ciphertext) };
    return { ...note, text: "", filename: "Locked note", customName: "Locked note", content: void 0, sealed };
  }
  async function protectNote(note, password, bytes = random) {
    if (password.length < 8) throw new Error("Use at least 8 characters.");
    const settings = { salt: bytesToHex(bytes(16)), iterations: 6e5 };
    const key = await deriveKey(password, settings);
    return { note: encryptNote(note, key, settings, bytes), key };
  }
  async function unlockNote(note, password) {
    const sealed = note.sealed;
    if (!sealed || sealed.v !== 1 || !/^[a-f0-9]{24}$/.test(sealed.iv) || typeof sealed.ciphertext !== "string" || sealed.ciphertext.length > 4e7) throw new Error("Invalid protected note.");
    const key = await deriveKey(password, sealed);
    try {
      return { note: decryptNote(note, key), key };
    } catch {
      key.fill(0);
      throw new Error("Incorrect password or damaged note.");
    }
  }
  function decryptNote(note, key) {
    const sealed = note.sealed;
    const data = JSON.parse(decoder.decode(gcm(key, hexToBytes(sealed.iv), encoder.encode(`bestpad:${note.id}:1`)).decrypt(hexToBytes(sealed.ciphertext))));
    if (typeof data.text !== "string" || typeof data.filename !== "string") throw new Error("Invalid note");
    const plain = { ...note, text: data.text, content: data.content, filename: data.filename, customName: data.customName };
    delete plain.sealed;
    return plain;
  }

  // mobile/src/model.ts
  var noteName = (note) => typeof note.customName === "string" && note.customName || note.text.split(/\r?\n/, 1)[0].trim().slice(0, 80) || "Untitled";
  var isTrashed = (note) => typeof note.deletedAt === "string" && note.deletedAt.length > 0;

  // mobile/src/organization.ts
  function entries(workspace, parentId) {
    const folders = workspace.folders || [];
    const folderIds = new Set(folders.map((folder) => folder.id));
    const visibleParent = (id) => id && folderIds.has(id) ? id : null;
    return [
      ...folders.filter((folder) => visibleParent(folder.parentId) === parentId).map((folder) => ({ id: folder.id, kind: "folder", name: folder.name, order: Number(folder.order) || 0, pinned: Boolean(folder.pinned) })),
      ...workspace.tabs.filter((note) => !isTrashed(note) && visibleParent(note.folderId) === parentId).map((note) => ({ id: note.id, kind: "note", name: noteName(note), order: Number(note.order) || 0, pinned: Boolean(note.pinned) }))
    ].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
  }
  function canMove(workspace, id, parentId) {
    if (!parentId) return true;
    const folders = workspace.folders || [];
    let current = folders.find((folder) => folder.id === parentId);
    const visited = /* @__PURE__ */ new Set();
    if (!current) return false;
    while (current) {
      if (current.id === id || visited.has(current.id)) return false;
      visited.add(current.id);
      current = folders.find((folder) => folder.id === current.parentId);
    }
    return true;
  }
  function moveEntry(workspace, id, parentId, beforeId) {
    if (beforeId === id) return workspace;
    if (!workspace.tabs.some((note) => note.id === id && !isTrashed(note)) && !workspace.folders?.some((folder) => folder.id === id)) return workspace;
    if (!canMove(workspace, id, parentId)) return workspace;
    const siblings = entries(workspace, parentId).filter((entry) => entry.id !== id);
    const at = beforeId ? siblings.findIndex((entry) => entry.id === beforeId) : -1;
    const ids = siblings.map((entry) => entry.id);
    ids.splice(at < 0 ? ids.length : at, 0, id);
    const order = (entryId) => ids.indexOf(entryId);
    const tabs = workspace.tabs.map((note) => note.id === id ? { ...note, folderId: parentId, order: order(id) } : order(note.id) >= 0 ? { ...note, order: order(note.id) } : note);
    const folders = (workspace.folders || []).map((folder) => folder.id === id ? { ...folder, parentId, order: order(id) } : order(folder.id) >= 0 ? { ...folder, order: order(folder.id) } : folder);
    return { ...workspace, tabs, folders };
  }
  function removeFolder(workspace, id) {
    const folder = workspace.folders?.find((item) => item.id === id);
    if (!folder) return workspace;
    return { ...workspace, folders: workspace.folders.filter((item) => item.id !== id).map((item) => item.parentId === id ? { ...item, parentId: folder.parentId || null } : item), tabs: workspace.tabs.map((note) => note.folderId === id ? { ...note, folderId: folder.parentId || null } : note) };
  }
  function treeEntries(workspace, expanded) {
    const result = [], visited = /* @__PURE__ */ new Set();
    function walk(parentId, depth) {
      for (const item of entries(workspace, parentId)) {
        if (visited.has(item.id)) continue;
        visited.add(item.id);
        result.push({ ...item, depth, parentId });
        if (item.kind === "folder" && expanded.has(item.id)) walk(item.id, depth + 1);
      }
    }
    walk(null, 0);
    for (const folder of workspace.folders || []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      result.push({ id: folder.id, kind: "folder", name: folder.name, order: Number(folder.order) || 0, pinned: Boolean(folder.pinned), depth: 0, parentId: null });
      if (expanded.has(folder.id)) walk(folder.id, 1);
    }
    return result;
  }

  // mobile/src/dragGeometry.ts
  function projectVerticalDrag(source, delta, bounds, slots, gap) {
    const top = Math.max(bounds.top, Math.min(source.top + delta, Math.max(bounds.top, bounds.bottom - source.height)));
    const center = top + source.height / 2, original = source.top + source.height / 2;
    const atTop = top <= bounds.top + 0.5, atBottom = top + source.height >= bounds.bottom - 0.5;
    const direction = center >= original ? 1 : -1;
    const shifts = {};
    let over = null, settleTop = source.top;
    for (const slot of slots) {
      if (slot.id === source.id) continue;
      const crosses = direction > 0 ? slot.top >= source.top + source.height && (center > slot.top + slot.height / 2 || atBottom && slot.top + slot.height <= bounds.bottom) : slot.top + slot.height <= source.top && (center < slot.top + slot.height / 2 || atTop && slot.top >= bounds.top);
      shifts[slot.id] = crosses ? -direction * (source.height + gap) : 0;
      if (crosses && (over === null || (direction > 0 ? slot.top > settleTop : slot.top < settleTop))) {
        over = slot.id;
        settleTop = direction > 0 ? slot.top + slot.height - source.height : slot.top;
      }
    }
    return { top, delta: top - source.top, shifts, over, direction, settleTop };
  }
  return __toCommonJS(web_features_exports);
})();
/*! Bundled license information:

@noble/ciphers/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)

@noble/hashes/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
