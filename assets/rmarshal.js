class RObject {
  constructor(classname) {
    this.classname = classname;
    this.ivars = {};
  }
}

class RUserDefined {
  constructor(classname, payload) {
    this.classname = classname;
    this.payload = payload;
  }
}

class MarshalReader {
  constructor(buffer) {
    this.data = new Uint8Array(buffer);
    this.pos = 0;
    this.symbols = [];
    this.objects = [];
    this.decoder = new TextDecoder("utf-8", { fatal: false });
  }

  readBytes(n) {
    const out = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  readByte() {
    return this.data[this.pos++];
  }

  readSignedByte() {
    const value = this.readByte();
    return value > 127 ? value - 256 : value;
  }

  readLong() {
    const c = this.readSignedByte();
    if (c === 0) return 0;
    if (c >= 5 && c <= 127) return c - 5;
    if (c >= -128 && c <= -5) return c + 5;
    if (c > 0) {
      let result = 0;
      const bytes = this.readBytes(c);
      for (let i = 0; i < c; i += 1) result |= bytes[i] << (8 * i);
      return result;
    }
    const n = -c;
    const bytes = this.readBytes(n);
    let result = 0;
    for (let i = 0; i < n; i += 1) result |= bytes[i] << (8 * i);
    return result - (1 << (8 * n));
  }

  register(obj) {
    this.objects.push(obj);
    return obj;
  }

  readStringBytes() {
    return this.register(this.readBytes(this.readLong()));
  }

  symbolName(value) {
    return typeof value === "string" ? value : String(value);
  }

  readObject() {
    const t = this.readByte();
    const ch = String.fromCharCode(t);
    if (ch === "0") return null;
    if (ch === "T") return true;
    if (ch === "F") return false;
    if (ch === "i") return this.readLong();

    if (ch === ":") {
      const sym = this.decoder.decode(this.readBytes(this.readLong()));
      this.symbols.push(sym);
      return sym;
    }
    if (ch === ";") return this.symbols[this.readLong()];
    if (ch === "@") return this.objects[this.readLong()];
    if (ch === "\"") return this.readStringBytes();

    if (ch === "I") {
      const slot = this.objects.length;
      this.objects.push(null);
      const inner = this.readObject();
      const count = this.readLong();
      for (let i = 0; i < count; i += 1) {
        this.readObject();
        this.readObject();
      }
      const result = inner instanceof Uint8Array ? this.decoder.decode(inner) : inner;
      this.objects[slot] = result;
      return result;
    }

    if (ch === "[") {
      const arr = [];
      this.register(arr);
      const count = this.readLong();
      for (let i = 0; i < count; i += 1) arr.push(this.readObject());
      return arr;
    }

    if (ch === "{" || ch === "}") {
      const obj = {};
      this.register(obj);
      const count = this.readLong();
      for (let i = 0; i < count; i += 1) obj[this.symbolName(this.readObject())] = this.readObject();
      if (ch === "}") this.readObject();
      return obj;
    }

    if (ch === "o" || ch === "S") {
      const slot = this.objects.length;
      this.objects.push(null);
      const classname = this.symbolName(this.readObject());
      const obj = new RObject(classname);
      this.objects[slot] = obj;
      const count = this.readLong();
      for (let i = 0; i < count; i += 1) obj.ivars[this.symbolName(this.readObject())] = this.readObject();
      return obj;
    }

    if (ch === "u") {
      const slot = this.objects.length;
      this.objects.push(null);
      const obj = new RUserDefined(this.symbolName(this.readObject()), this.readBytes(this.readLong()));
      this.objects[slot] = obj;
      return obj;
    }

    if (ch === "U") {
      const slot = this.objects.length;
      this.objects.push(null);
      const obj = new RObject(this.symbolName(this.readObject()));
      obj.ivars.__marshal_load__ = this.readObject();
      this.objects[slot] = obj;
      return obj;
    }

    if (ch === "f") return this.register(Number(this.decoder.decode(this.readBytes(this.readLong()))));
    if (ch === "l") {
      this.readByte();
      const n = this.readLong();
      this.readBytes(n * 2);
      return this.register(0);
    }
    if (ch === "c" || ch === "m") return this.register(this.decoder.decode(this.readBytes(this.readLong())));
    if (ch === "e" || ch === "C") {
      const slot = this.objects.length;
      this.objects.push(null);
      if (ch === "C") this.readObject();
      else this.readObject();
      const obj = this.readObject();
      this.objects[slot] = obj;
      return obj;
    }
    throw new Error(`Unsupported marshal type ${ch} at ${this.pos - 1}`);
  }

  load() {
    if (this.readByte() !== 4 || this.readByte() !== 8) throw new Error("Not a Ruby Marshal 4.8 file");
    return this.readObject();
  }
}

window.RMarshal = {
  load(buffer) {
    return new MarshalReader(buffer).load();
  }
};
