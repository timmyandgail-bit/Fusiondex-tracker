"""Minimal pure-python Ruby Marshal 4.8 deserializer for Pokemon Essentials save files."""
import struct

class RObject:
    __slots__ = ('classname', 'ivars')
    def __init__(self, classname):
        self.classname = classname
        self.ivars = {}
    def __repr__(self):
        return f"<{self.classname} ivars={list(self.ivars.keys())}>"

class RUserDefined:
    __slots__ = ('classname', 'payload')
    def __init__(self, classname, payload):
        self.classname = classname
        self.payload = payload
    def __repr__(self):
        return f"<UserDef {self.classname}>"

class Sym(str):
    pass

class MarshalReader:
    def __init__(self, data):
        self.data = data
        self.pos = 0
        self.symbols = []
        self.objects = []  # the main object backreference table

    def read_bytes(self, n):
        b = self.data[self.pos:self.pos+n]
        self.pos += n
        return b

    def read_long(self):
        c = struct.unpack('b', self.read_bytes(1))[0]
        if c == 0:
            return 0
        elif 5 <= c <= 127:
            return c - 5
        elif -128 <= c <= -5:
            return c + 5
        elif c > 0:
            n = c
            bs = self.read_bytes(n)
            result = 0
            for i in range(n):
                result |= bs[i] << (8 * i)
            return result
        else:
            n = -c
            bs = self.read_bytes(n)
            result = 0
            for i in range(n):
                result |= bs[i] << (8 * i)
            result -= (1 << (8 * n))
            return result

    def reg(self, obj):
        """Register an object in the backreference table, return obj for chaining."""
        self.objects.append(obj)
        return obj

    def read_object(self):
        t = self.read_bytes(1)[0]
        ch = chr(t)

        if ch == '0':
            return None
        elif ch == 'T':
            return True
        elif ch == 'F':
            return False
        elif ch == 'i':
            return self.read_long()

        elif ch == ':':
            n = self.read_long()
            s = self.read_bytes(n).decode('utf-8', errors='replace')
            sym = Sym(s)
            self.symbols.append(sym)
            return sym
        elif ch == ';':
            idx = self.read_long()
            return self.symbols[idx]

        elif ch == '@':
            idx = self.read_long()

            if idx >= len(self.objects):
                print(f"BAD REF {idx} >= {len(self.objects)}")
                return None

            obj = self.objects[idx]

            if obj is None:
                print(f"NONE REF {idx}")

            return obj

        elif ch == '"':
            n = self.read_long()
            s = self.read_bytes(n)
            return self.reg(s)

        elif ch == 'I':
            # Reserve slot first (Ruby registers the IVAR'd object itself at this point)
            slot_index = len(self.objects)
            self.objects.append(None)  # placeholder
            inner = self.read_object()
            n = self.read_long()
            ivars = {}
            for _ in range(n):
                k = self.read_object()
                v = self.read_object()
                ivars[k] = v
            if isinstance(inner, bytes):
                try:
                    result = inner.decode('utf-8')
                except Exception:
                    result = inner
            else:
                result = inner
            self.objects[slot_index] = result
            return result

        elif ch == '[':
            n = self.read_long()
            arr = []
            self.reg(arr)
            for _ in range(n):
                arr.append(self.read_object())
            return arr

        elif ch == '{':
            n = self.read_long()
            d = {}
            self.reg(d)
            for _ in range(n):
                k = self.read_object()
                v = self.read_object()
                if isinstance(k, (list, dict)):
                    k = repr(k)
                d[k] = v
            return d

        elif ch == '}':  # hash with default value
            n = self.read_long()
            d = {}
            self.reg(d)
            for _ in range(n):
                k = self.read_object()
                v = self.read_object()
                if isinstance(k, (list, dict)):
                    k = repr(k)
                d[k] = v
            default = self.read_object()
            return d

        elif ch == 'o':
            slot_index = len(self.objects)
            self.objects.append(None)
            classname = self.read_object()
            n = self.read_long()
            obj = RObject(str(classname))
            self.objects[slot_index] = obj
            for _ in range(n):
                k = self.read_object()
                v = self.read_object()
                key = str(k) if isinstance(k, Sym) else k
                obj.ivars[key] = v
            return obj

        elif ch == 'u':
            slot_index = len(self.objects)
            self.objects.append(None)
            classname = self.read_object()
            n = self.read_long()
            payload = self.read_bytes(n)
            obj = RUserDefined(str(classname), payload)
            self.objects[slot_index] = obj
            return obj

        elif ch == 'U':
            slot_index = len(self.objects)
            self.objects.append(None)
            classname = self.read_object()
            inner = self.read_object()
            obj = RObject(str(classname))
            obj.ivars['__marshal_load__'] = inner
            self.objects[slot_index] = obj
            return obj

        elif ch == 'l':
            sign = self.read_bytes(1)
            n = self.read_long()
            bs = self.read_bytes(n * 2)
            val = 0
            for i in range(len(bs)):
                val |= bs[i] << (8 * i)
            if sign == b'-':
                val = -val
            return self.reg(val)

        elif ch == 'f':
            n = self.read_long()
            s = self.read_bytes(n)
            return self.reg(float(s))

        elif ch == 'c':
            n = self.read_long()
            return self.reg(('class', self.read_bytes(n).decode()))

        elif ch == 'm':
            n = self.read_long()
            return self.reg(('module', self.read_bytes(n).decode()))

        elif ch == 'e':
            slot_index = len(self.objects)
            self.objects.append(None)
            mod = self.read_object()
            obj = self.read_object()
            self.objects[slot_index] = obj
            return obj

        elif ch == 'C':
            slot_index = len(self.objects)
            self.objects.append(None)
            classname = self.read_object()
            obj = self.read_object()
            self.objects[slot_index] = obj
            return obj

        elif ch == 'S':  # Struct
            slot_index = len(self.objects)
            self.objects.append(None)
            classname = self.read_object()
            n = self.read_long()
            obj = RObject(str(classname))
            self.objects[slot_index] = obj
            for _ in range(n):
                k = self.read_object()
                v = self.read_object()
                key = str(k) if isinstance(k, Sym) else k
                obj.ivars[key] = v
            return obj

        else:
            raise ValueError(f"Unsupported marshal type byte: {ch!r} (0x{t:02x}) at pos {self.pos-1}")


def load(data):
    r = MarshalReader(data)
    ver = r.read_bytes(2)
    assert ver == b'\x04\x08', f"Not Marshal 4.8 (got {ver})"
    return r.read_object()


