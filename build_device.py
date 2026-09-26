#!/usr/bin/env python3
"""Build "MetaMuse Chords.amxd", a Max for Live MIDI Generator for Live 12+.

The device patch is described in plain Python below, so it can be read,
edited and rebuilt without opening Max. The chord logic lives in
metamuse_chords.js, which must sit in the same folder as the .amxd
(or be embedded by freezing the device in Live).

Usage:
    python3 build_device.py [output_folder]
"""

import json
import struct
import sys
from pathlib import Path

OUT_NAME = "MetaMuse Chords.amxd"
JS_FILE = "metamuse_chords.js"
DEVICE_WIDTH = 152  # the MIDI Tools Generate panel is ~152 x 146 px

# Menu contents. Order must match the arrays in metamuse_chords.js.
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
SCALES = ["Major", "Natural Minor", "Harmonic Minor", "Melodic Minor", "Dorian",
          "Phrygian", "Lydian", "Mixolydian", "Locrian", "Pentatonic Major",
          "Pentatonic Minor", "Blues", "Whole Tone", "Diminished (W-H)"]
CHORD_TYPES = ["Triad (3)", "7th (4)", "9th (5)", "11th (6)", "13th (7)", "5th", "add9", "sus2", "sus4", "maj9", "min9",
               "9 (dom)", "add11", "m/maj7", "dim7", "aug"]
LENGTHS = ["1/2 beat", "1 beat", "2 beats", "3 beats", "1 bar", "6 beats", "2 bars", "4 bars"]
DEGREES = ["-", "I", "II", "III", "IV", "V", "VI", "VII"]
PRESETS = ["Presets…", "I V vi IV", "I vi IV V", "vi IV I V", "ii V I", "vi ii V I",
           "I IV V IV", "i VI III VII", "i iv v", "i VII VI V", "Canon (8)"]
DEFAULT_SLOTS = [1, 5, 6, 4, 0, 0, 0, 0]


class Patch:
    """Collects boxes and patch cords, then writes the Max JSON."""

    def __init__(self):
        self.boxes = []
        self.lines = []
        self._next = 1

    def add(self, maxclass, patching_rect, presentation_rect=None, **attrs):
        box_id = f"obj-{self._next}"
        self._next += 1
        box = {"id": box_id, "maxclass": maxclass, "patching_rect": patching_rect}
        if presentation_rect:
            box["presentation"] = 1
            box["presentation_rect"] = presentation_rect
        box.update(attrs)
        self.boxes.append({"box": box})
        return box_id

    def obj(self, text, x, y, inlets=1, outlets=1, width=None):
        return self.add("newobj", [x, y, width or 8 + 6.5 * len(text), 20.0], text=text,
                        numinlets=inlets, numoutlets=outlets, outlettype=[""] * outlets)

    def msg(self, text, x, y):
        return self.add("message", [x, y, 8 + 6.5 * len(text), 20.0], text=text,
                        numinlets=2, numoutlets=1, outlettype=[""])

    def connect(self, src, dst, outlet=0, inlet=0):
        self.lines.append({"patchline": {"source": [src, outlet], "destination": [dst, inlet]}})


def param(longname, shortname, ptype, initial, mmax=None, mmin=None, enum=None, invisible=0):
    """saved_attribute_attributes block for a Live parameter."""
    v = {
        "parameter_longname": longname,
        "parameter_shortname": shortname,
        "parameter_type": ptype,  # 0 float, 1 int, 2 enum
        "parameter_initial_enable": 1,
        "parameter_initial": [initial],
        "parameter_modmode": 0,
        "parameter_invisible": invisible,
    }
    if enum is not None:
        v["parameter_enum"] = enum
        v["parameter_mmax"] = len(enum) - 1
    if mmax is not None:
        v["parameter_mmax"] = mmax
    if mmin is not None:
        v["parameter_mmin"] = mmin
    return {"valueof": v}


def build():
    p = Patch()

    # ── Core objects (patching view only) ──────────────────────────────────
    tool_in = p.obj("live.miditool.in", 20, 20, inlets=1, outlets=3)
    tool_out = p.obj("live.miditool.out", 20, 420, inlets=1, outlets=0)
    js = p.obj(f"js {JS_FILE}", 20, 380, inlets=2, outlets=3, width=160)
    this_device = p.obj("live.thisdevice", 520, 20, inlets=1, outlets=3)
    loaded = p.msg("loaded", 520, 50)
    feedback = p.obj("route readout slot preset", 200, 420, inlets=1, outlets=4, width=150)
    slot_router = p.obj("route 0 1 2 3 4 5 6 7", 200, 450, inlets=1, outlets=9, width=150)

    p.connect(tool_in, js, 0, 0)       # notes -> generate
    p.connect(tool_in, js, 1, 1)       # context (key, grid, time selection)
    p.connect(js, tool_out, 0, 0)      # new notes -> clip
    p.connect(js, tool_in, 1, 0)       # control changed -> regenerate
    p.connect(js, feedback, 2, 0)
    p.connect(feedback, slot_router, 1, 0)
    p.connect(this_device, loaded, 0, 0)
    p.connect(loaded, js, 0, 0)

    control_x = 200  # patching-view column for controls

    def wire(ctrl, message, y):
        pre = p.obj(f"prepend {message}", control_x + 150, y, width=110)
        p.connect(ctrl, pre, 0, 0)
        p.connect(pre, js, 0, 0)

    def menu(name, short, items, initial, rect, message, annotation):
        y = 60 + len(p.boxes) * 6
        m = p.add("live.menu", [control_x, y, rect[2], 15.0], rect,
                  varname=name, parameter_enable=1, numinlets=1, numoutlets=3,
                  outlettype=["", "", "float"], annotation=annotation, annotation_name=name,
                  saved_attribute_attributes=param(name, short, 2, initial, enum=items))
        wire(m, message, y)
        return m

    def numbox(name, short, lo, hi, initial, rect, message, annotation, units):
        y = 60 + len(p.boxes) * 6
        attrs = param(name, short, 1, initial, mmin=lo, mmax=hi)
        attrs["valueof"]["parameter_unitstyle"] = 9  # custom text, e.g. "Oct 3"
        attrs["valueof"]["parameter_units"] = units
        n = p.add("live.numbox", [control_x, y, rect[2], 15.0], rect,
                  varname=name, parameter_enable=1, numinlets=1, numoutlets=2,
                  outlettype=["", "float"], annotation=annotation, annotation_name=name,
                  saved_attribute_attributes=attrs)
        wire(n, message, y)
        return n

    def toggle(name, text, initial, rect, message, annotation):
        y = 60 + len(p.boxes) * 6
        t = p.add("live.text", [control_x, y, rect[2], 15.0], rect,
                  varname=name, parameter_enable=1, mode=1, text=text, texton=text,
                  numinlets=1, numoutlets=2, outlettype=["", ""],
                  annotation=annotation, annotation_name=name,
                  saved_attribute_attributes=param(name, name, 2, initial, enum=["off", "on"]))
        wire(t, message, y)
        return t

    # The Generate panel is only ~152 x 146 px, so controls are packed in
    # rows with no separate labels: menus show their value, numboxes carry
    # their own label ("Oct 3"), and toggles are labelled buttons.
    # Hover any control to see its description in Live's Info View.

    # ── Row 1: key + scale ────────────────────────────────────────────────
    menu("Root", "Root", NOTES, 0, [0, 0, 32, 16], "root",
         "Key root note.")
    menu("Scale", "Scale", SCALES, 0, [34, 0, 118, 16], "scale",
         "Scale or mode the chords are built from.")

    # ── Row 2: chord type + length ────────────────────────────────────────
    menu("Chord Type", "Type", CHORD_TYPES, 0, [0, 19, 76, 16], "type",
         "Triad (3 notes) to 13th (7 notes) stack notes from the scale, so they follow the mode. The others use a fixed shape on each degree.")
    menu("Length", "Len", LENGTHS, 4, [78, 19, 74, 16], "length",
         "How long each chord lasts.")

    # ── Row 3: voicing ────────────────────────────────────────────────────
    numbox("Octave", "Oct", 0, 6, 3, [0, 38, 48, 16], "octave",
           "Octave of the chord roots (Live naming: C3 = middle C).", "Oct %d")
    numbox("Inversion", "Inv", 0, 3, 0, [50, 38, 48, 16], "inversion",
           "Moves the lowest notes up an octave.", "Inv %d")
    toggle("Bass", "+ Bass", 0, [100, 38, 52, 16], "bass",
           "Adds the chord root an octave below.")

    # ── Row 4: options + presets ──────────────────────────────────────────
    toggle("Clip Scale", "Clip Key", 0, [0, 57, 48, 16], "clipscale",
           "Ignore Key and Scale and use the clip's Scale setting instead.")
    toggle("Fill", "Fill", 1, [50, 57, 48, 16], "fill",
           "On: repeat the progression until the end of the time selection / loop. Off: write it once.")
    preset = menu("Preset", "Preset", PRESETS, 0, [100, 57, 52, 16], "preset",
                  "Load a common progression into the chord slots.")
    p.connect(feedback, preset, 2, 0)

    # ── Rows 5-6: the 8 chord slots (scale degrees) ───────────────────────
    for i in range(8):
        x = (i % 4) * 38
        y = 78 + (i // 4) * 19
        slot = menu(f"Slot {i + 1}", f"Slot{i + 1}", DEGREES, DEFAULT_SLOTS[i],
                    [x, y, 36, 16], f"slot {i}",
                    f"Chord {i + 1} of the progression, as a scale degree. '-' skips it.")
        p.connect(slot_router, slot, i, 0)

    # ── Readout ───────────────────────────────────────────────────────────
    readout = p.add("live.comment", [control_x, 520, DEVICE_WIDTH, 30.0],
                    [0, 116, DEVICE_WIDTH, 30.0],
                    text="MetaMuse Chords", fontsize=9.0, linecount=3,
                    numinlets=1, numoutlets=0, textjustification=0)
    p.connect(feedback, readout, 0, 0)

    p.add("live.line", [0, 146, DEVICE_WIDTH, 5.0], numinlets=1, numoutlets=0)

    return {
        "patcher": {
            "fileversion": 1,
            "appversion": {"major": 9, "minor": 0, "revision": 0,
                           "architecture": "x64", "modernui": 1},
            "classnamespace": "box",
            "rect": [100.0, 100.0, 1100.0, 640.0],
            "openrect": [0.0, 0.0, float(DEVICE_WIDTH), 146.0],
            "openinpresentation": 1,
            "default_fontsize": 10.0,
            "default_fontface": 0,
            "default_fontname": "Arial Bold",
            "gridonopen": 1,
            "gridsize": [8.0, 8.0],
            "gridsnaponopen": 1,
            "objectsnaponopen": 1,
            "statusbarvisible": 2,
            "toolbarvisible": 1,
            "devicewidth": float(DEVICE_WIDTH),
            "description": "Chord progressions from any key and mode, written into the clip. From METAMUSE.",
            "digest": "",
            "tags": "",
            "style": "",
            "subpatcher_template": "",
            "boxes": p.boxes,
            "lines": p.lines,
            "dependency_cache": [],
            "latency": 0,
            "is_mpe": 0,
            "minimum_live_version": "",
            "minimum_max_version": "",
            "platform_compatibility": 0,
            "project": {
                "version": 1, "creationdate": 3590052493, "modificationdate": 3590052493,
                "viewrect": [0.0, 0.0, 300.0, 500.0], "autoorganize": 1,
                "hideprojectwindow": 1, "showdependencies": 1, "autolocalize": 0,
                "contents": {"patchers": {}}, "layout": {}, "searchpath": {},
                "detailsvisible": 0,
                "amxdtype": 1851877223,  # 'nagg' = MIDI Generator
                "readonly": 0, "devpathtype": 0, "devpath": ".", "sortmode": 0,
                "viewmode": 0, "includepackages": 0,
            },
            "autosave": 0,
        }
    }


def write_amxd(patch, path):
    """Wrap the patch JSON in the .amxd container Live expects."""
    body = json.dumps(patch, indent="\t").encode("utf-8") + b"\n\x00"
    header = (b"ampf" + struct.pack("<I", 4) + b"nagg"
              + b"meta" + struct.pack("<I", 4) + struct.pack("<I", 0)
              + b"ptch" + struct.pack("<I", len(body)))
    path.write_bytes(header + body)


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else here / "build"
    out_dir.mkdir(parents=True, exist_ok=True)
    write_amxd(build(), out_dir / OUT_NAME)
    (out_dir / JS_FILE).write_bytes((here / JS_FILE).read_bytes())
    print(f"Wrote {out_dir / OUT_NAME} and {JS_FILE}")
