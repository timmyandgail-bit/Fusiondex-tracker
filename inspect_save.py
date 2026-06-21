from rubymarshal.reader import loads

with open(r"C:\Users\Timothy\AppData\Roaming\infinitefusion-hoenn\File A.rxdata", "rb") as f:
    save = loads(f.read())

print(type(save))

if isinstance(save, list):
    print("Save slots:", len(save))
    for i, obj in enumerate(save[:20]):
        print("\nINDEX:", i)
        print("TYPE:", type(obj))
        print(obj)