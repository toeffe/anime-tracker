"""Build Windows ICO files from build/icon.ico.

- icon.ico: BMP 16–64 + PNG 256 (window / extra-large Explorer)
- nsis-icon.ico: BMP 16/32/48/256 (NSIS portable wrapper rejects PNG ICO)
"""

from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "build" / "icon.ico"
ICON = ROOT / "build" / "icon.ico"
NSIS = ROOT / "build" / "nsis-icon.ico"
PNG_MAGIC = bytes([0x89, 0x50, 0x4E, 0x47])


def load_master() -> Image.Image:
    with Image.open(SRC) as opened:
        return opened.convert("RGBA").copy()


def dib(im: Image.Image, size: int) -> bytes:
    rgba = im.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    header = struct.pack(
        "<IiiHHIIiiII",
        40,
        size,
        size * 2,
        1,
        32,
        0,
        size * size * 4,
        0,
        0,
        0,
        0,
    )
    src = rgba.tobytes()
    xor = bytearray()
    for y in range(size - 1, -1, -1):
        row = y * size * 4
        for x in range(size):
            i = row + x * 4
            r, g, b, a = src[i : i + 4]
            xor.extend((b, g, r, a))
    and_row = ((size + 31) // 32) * 4
    and_mask = bytes(and_row * size)
    return header + bytes(xor) + and_mask


def png(im: Image.Image, size: int) -> bytes:
    buf = io.BytesIO()
    im.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS).save(
        buf, format="PNG", optimize=True
    )
    return buf.getvalue()


def write_ico(path: Path, entries: list[tuple[int, bytes]]) -> None:
    count = len(entries)
    offset = 6 + 16 * count
    out = bytearray(struct.pack("<HHH", 0, 1, count))
    for size, blob in entries:
        dim = 0 if size >= 256 else size
        out += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    out += b"".join(blob for _, blob in entries)
    path.write_bytes(out)
    kinds = ",".join(
        f"{size}={'PNG' if blob.startswith(PNG_MAGIC) else 'BMP'}"
        for size, blob in entries
    )
    print(f"Wrote {path} ({len(out)} bytes: {kinds})")


def main() -> None:
    img = load_master()
    write_ico(
        ICON,
        [(s, dib(img, s)) for s in (16, 24, 32, 48, 64)] + [(256, png(img, 256))],
    )
    write_ico(NSIS, [(s, dib(img, s)) for s in (16, 32, 48, 256)])


if __name__ == "__main__":
    main()
