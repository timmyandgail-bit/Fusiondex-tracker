// Minimal Ruby Marshal 4.8 reader, ported for in-browser parsing of
// Pokemon Essentials (RPG Maker XP) save files (File A.rxdata).
// Returns a plain JS tree: objects -> {__class, ivars:{...}}, arrays -> [],
// hashes -> Map, symbols -> strings prefixed with ':', strings -> strings.

class RMarshalReader {
  constructor(bytes) {
    this.buf = bytes;
    this.pos = 0;
    this.objects = [];   // backreference table (for @)
    this.symbols = [];   // symbol table (for ;)
  }

  eof() { return this.pos >= this.buf.length; }

  readByte() {
    if (this.pos >= this.buf.length) throw new Error('Unexpected EOF in marshal stream');
    return this.buf[this.pos++];
  }

  readBytes(n) {
    const out = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  // Ruby's variable-length integer encoding used throughout marshal format
  readLong() {
    let c = this.readByte();
    if (c === 0) return 0;
    // signed byte
    let sc = c < 128 ? c : c - 256;
    if (sc > 0) {
      if (sc < 5) {
        let result = 0;
        for (let i = 0; i < sc; i++) {
          result |= this.readByte() << (8 * i);
        }
        return result;
      }
      return sc - 5;
    } else {
      if (sc > -5) {
        let n = -sc;
        let result = -1;
        for (let i = 0; i < n; i++) {
          const b = this.readByte();
          result &= ~(0xff << (8 * i));
          result |= b << (8 * i);
        }
        return result;
      }
      return sc + 5;
    }
  }

  readRawString(len) {
    const bytes = this.readBytes(len);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    // Try UTF-8 decode; fall back to latin1-ish raw if it fails
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (e) {
      return s;
    }
  }

  registerObject(placeholder) {
    this.objects.push(placeholder);
    return this.objects.length - 1;
  }

  readObject() {
    const tag = String.fromCharCode(this.readByte());
    switch (tag) {
      case '0': return null;
      case 'T': return true;
      case 'F': return false;
      case 'i': return this.readLong();
      case 'l': return this.readBignum();
      case 'f': return this.readFloatObj();
      case '"': return this.readStringObj();
      case ':': return this.readSymbolDef();
      case ';': return this.readSymbolLink();
      case '@': return this.readObjectLink();
      case '[': return this.readArray();
      case '{': case '}': return this.readHash(tag === '}');
      case 'o': return this.readRObject();
      case 'I': return this.readIvarWrapped();
      case 'u': return this.readUserDefined();
      case 'U': return this.readUserMarshal();
      case 'e': return this.readExtended();
      case 'C': return this.readUserClass();
      case 'S': return this.readStruct();
      case 'c': return { __class_ref: this.readLengthPrefixedString() };
      case 'm': return { __module_ref: this.readLengthPrefixedString() };
      default:
        throw new Error(`Unsupported marshal tag '${tag}' (0x${tag.charCodeAt(0).toString(16)}) at pos ${this.pos - 1}`);
    }
  }

  readLengthPrefixedString() {
    const len = this.readLong();
    return this.readRawString(len);
  }

  readBignum() {
    const slot = this.registerObject(null);
    const sign = String.fromCharCode(this.readByte()) === '-' ? -1n : 1n;
    const size = this.readLong();
    let result = 0n;
    for (let i = 0; i < size; i++) {
      const halfword = BigInt(this.readByte()) | (BigInt(this.readByte()) << 8n);
      result |= halfword << BigInt(16 * i);
    }
    const value = sign * result;
    this.objects[slot] = value;
    return value;
  }

  readFloatObj() {
    const slot = this.registerObject(null);
    const s = this.readLengthPrefixedString();
    const value = parseFloat(s);
    this.objects[slot] = value;
    return value;
  }

  readStringObj() {
    const slot = this.registerObject(null);
    const s = this.readLengthPrefixedString();
    this.objects[slot] = s;
    return s;
  }

  readSymbolDef() {
    const s = this.readLengthPrefixedString();
    this.symbols.push(s);
    return ':' + s;
  }

  readSymbolLink() {
    const idx = this.readLong();
    return ':' + this.symbols[idx];
  }

  readObjectLink() {
    const idx = this.readLong();
    return this.objects[idx];
  }

  readArray() {
    const slot = this.registerObject(null);
    const len = this.readLong();
    const arr = [];
    this.objects[slot] = arr;
    for (let i = 0; i < len; i++) arr.push(this.readObject());
    return arr;
  }

  readHash(hasDefault) {
    const slot = this.registerObject(null);
    const len = this.readLong();
    const map = new Map();
    this.objects[slot] = map;
    for (let i = 0; i < len; i++) {
      const k = this.readObject();
      const v = this.readObject();
      map.set(k, v);
    }
    if (hasDefault) this.readObject(); // default value, discarded
    return map;
  }

  readIvars(count, target) {
    for (let i = 0; i < count; i++) {
      const key = this.readObject(); // symbol like ':@foo'
      const val = this.readObject();
      target[key] = val;
    }
  }

  readRObject() {
    const slot = this.registerObject(null);
    const className = this.readObject(); // symbol
    const obj = { __rtype: 'object', __class: className, ivars: {} };
    this.objects[slot] = obj;
    const ivarCount = this.readLong();
    this.readIvars(ivarCount, obj.ivars);
    return obj;
  }

  readIvarWrapped() {
    const slot = this.registerObject(null);
    const inner = this.readObject();
    const wrapper = { __rtype: 'ivar_wrapped', value: inner, ivars: {} };
    this.objects[slot] = wrapper;
    const ivarCount = this.readLong();
    this.readIvars(ivarCount, wrapper.ivars);
    // For strings (the common case), flatten: return the inner value but
    // stash ivars on a side channel via a String wrapper isn't trivial in JS,
    // so we keep wrapper.value as canonical and ivars are rarely needed for
    // our use case (encoding info etc). Return inner directly when it's a
    // plain string, attaching ivars non-enumerably for inspection if needed.
    if (typeof inner === 'string') {
      return inner;
    }
    return wrapper;
  }

  readUserDefined() {
    const slot = this.registerObject(null);
    const className = this.readObject();
    const len = this.readLong();
    const data = this.readBytes(len);
    const obj = { __rtype: 'user_defined', __class: className, data };
    this.objects[slot] = obj;
    return obj;
  }

  readUserMarshal() {
    const slot = this.registerObject(null);
    const className = this.readObject();
    const wrapped = this.readObject();
    const obj = { __rtype: 'user_marshal', __class: className, value: wrapped };
    this.objects[slot] = obj;
    return obj;
  }

  readExtended() {
    // module name then the extended object
    this.readObject(); // module symbol, discarded
    return this.readObject();
  }

  readUserClass() {
    const slot = this.registerObject(null);
    const className = this.readObject();
    const base = this.readObject();
    const obj = { __rtype: 'user_class', __class: className, value: base };
    this.objects[slot] = obj;
    return obj;
  }

  readStruct() {
    const slot = this.registerObject(null);
    const className = this.readObject();
    const memberCount = this.readLong();
    const obj = { __rtype: 'struct', __class: className, members: {} };
    this.objects[slot] = obj;
    for (let i = 0; i < memberCount; i++) {
      const key = this.readObject();
      const val = this.readObject();
      obj.members[key] = val;
    }
    return obj;
  }

  parseTopLevel() {
    const major = this.readByte();
    const minor = this.readByte();
    if (major !== 4 || minor !== 8) {
      console.warn(`Unexpected marshal version ${major}.${minor} (expected 4.8)`);
    }
    return this.readObject();
  }
}

// Helper: get an ivar off an RObject by bare name, e.g. get(obj, '@party')
function rget(obj, name) {
if (!obj || !obj.ivars) return undefined;

const atKey = ':@' + name;
const plainKey = ':' + name;

if (Object.prototype.hasOwnProperty.call(obj.ivars, atKey)) {
return obj.ivars[atKey];
}

if (Object.prototype.hasOwnProperty.call(obj.ivars, plainKey)) {
return obj.ivars[plainKey];
}

return undefined;
}


function parseMarshal(arrayBufferOrUint8) {
  const bytes = arrayBufferOrUint8 instanceof Uint8Array
    ? arrayBufferOrUint8
    : new Uint8Array(arrayBufferOrUint8);
  const reader = new RMarshalReader(bytes);
  return reader.parseTopLevel();
}

window.RMarshal = { parseMarshal, rget };
