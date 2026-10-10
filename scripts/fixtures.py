"""Generate comparable long notes for both prototypes; never replace user notes."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "vault" / "Benchmarks"
root.mkdir(exist_ok=True)
for count in (100, 1000, 5000):
    path = root / f"{count}-blocks.htmd"
    if path.exists():
        continue
    path.write_text("".join(
        f"Paragraph {i + 1}: **bold**, *emphasis*, and `code`. Café 🦀.\n\n"
        for i in range(count)
    ))
    print(path)
