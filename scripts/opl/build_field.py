"""Build the competition field file for the app's Competition tab.

Reads OpenPowerlifting's bulk CSV export (the zip from
https://openpowerlifting.gitlab.io/opl-csv/files/openpowerlifting-latest.zip),
keeps only full-power (SBD) results from the federations the coach compares
against, from the last few years, and writes a compact JSON file:

    {"updated": "<export date>", "columns": [...], "rows": [[...], ...]}

Federations (OpenPowerlifting codes):
    APLA  = Australian Powerlifting Alliance (APA)
    AusPL = Australian Powerlifting League (APL)
    IPF   = IPF international competitions (Worlds etc.)

Usage: python3 build_field.py <openpowerlifting.zip> <out.json>
Standard library only, streams the CSV, so memory stays small.
OpenPowerlifting data is public domain (see the LICENSE in the zip).
"""

import csv
import datetime as dt
import io
import json
import sys
import zipfile

FEDERATIONS = {"APLA", "AusPL", "IPF"}
YEARS_KEPT = 3

COLUMNS = [
    "Name", "Sex", "Equipment", "Age", "Division", "BodyweightKg", "WeightClassKg",
    "Squat1Kg", "Squat2Kg", "Squat3Kg", "Best3SquatKg",
    "Bench1Kg", "Bench2Kg", "Bench3Kg", "Best3BenchKg",
    "Deadlift1Kg", "Deadlift2Kg", "Deadlift3Kg", "Best3DeadliftKg",
    "TotalKg", "Place", "Goodlift", "Tested", "Federation", "Date", "MeetName", "MeetCountry",
]
NUMERIC = {c for c in COLUMNS if c.endswith("Kg") or c in ("Age", "Goodlift")}
NUMERIC.discard("WeightClassKg")  # "120+" etc. stays text


def value(col, raw):
    if raw == "":
        return None
    if col in NUMERIC:
        try:
            num = float(raw)
        except ValueError:
            return None
        return int(num) if num.is_integer() else num
    return raw


def main(zip_path, out_path):
    cutoff = (dt.date.today() - dt.timedelta(days=365 * YEARS_KEPT)).isoformat()
    zf = zipfile.ZipFile(zip_path)
    csv_name = next(n for n in zf.namelist() if n.endswith(".csv"))
    updated = csv_name.rsplit("/", 1)[-1].split("-", 1)[-1][:10]  # openpowerlifting-YYYY-MM-DD-hash.csv
    rows = []
    with zf.open(csv_name) as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
            if row["Federation"] not in FEDERATIONS or row["Event"] != "SBD":
                continue
            if row["Date"] < cutoff or not row["TotalKg"]:
                continue
            rows.append([value(c, row[c]) for c in COLUMNS])
    rows.sort(key=lambda r: r[COLUMNS.index("Date")], reverse=True)
    with open(out_path, "w", encoding="utf-8") as out:
        json.dump({"updated": updated, "columns": COLUMNS, "rows": rows}, out, separators=(",", ":"))
    print(f"wrote {len(rows)} results (since {cutoff}) to {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
