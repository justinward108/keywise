"""Small toolkit for writing Max for Live devices (.amxd) from Python.

A device is described with a Patch (boxes + patch cords) and a DeviceUI,
which adds Live controls (menus, number boxes, toggles) that each send
"<message> <value>" to the device's [js] object, and can split controls
across tabbed pages. write_amxd() wraps the result in Live's file format.
"""

import json
import struct

# Four-letter device types stored in the .amxd header and patcher project.
AMXD_TYPES = {
    "midi_effect": b"mmmm",
    "generator": b"nagg",       # MIDI Tool: Generate panel
    "transformation": b"natt",  # MIDI Tool: Transform panel
}


class Patch:
    """Collects boxes and patch cords, then produces the Max JSON."""

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

    def box(self, box_id):
        return next(b["box"] for b in self.boxes if b["box"]["id"] == box_id)

    def obj(self, text, x, y, inlets=1, outlets=1, width=None):
        return self.add("newobj", [x, y, width or 8 + 6.5 * len(text), 20.0], text=text,
                        numinlets=inlets, numoutlets=outlets, outlettype=[""] * outlets)

    def msg(self, text, x, y, width=None):
        return self.add("message", [x, y, width or min(400.0, 8 + 6.5 * len(text)), 20.0],
                        text=text, numinlets=2, numoutlets=1, outlettype=[""])

    def connect(self, src, dst, outlet=0, inlet=0):
        self.lines.append({"patchline": {"source": [src, outlet], "destination": [dst, inlet]}})

    def to_json(self, amxd_type, width, height, description):
        return {
            "patcher": {
                "fileversion": 1,
                "appversion": {"major": 9, "minor": 0, "revision": 0,
                               "architecture": "x64", "modernui": 1},
                "classnamespace": "box",
                "rect": [100.0, 100.0, 1200.0, 700.0],
                "openrect": [0.0, 0.0, float(width), float(height)],
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
                "devicewidth": float(width),
                "description": description,
                "digest": "",
                "tags": "",
                "style": "",
                "subpatcher_template": "",
                "boxes": self.boxes,
                "lines": self.lines,
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
                    "amxdtype": int.from_bytes(AMXD_TYPES[amxd_type], "big"),
                    "readonly": 0, "devpathtype": 0, "devpath": ".", "sortmode": 0,
                    "viewmode": 0, "includepackages": 0,
                },
                "autosave": 0,
            }
        }


def param(longname, shortname, ptype, initial, mmax=None, mmin=None, enum=None):
    """saved_attribute_attributes block for a Live parameter."""
    v = {
        "parameter_longname": longname,
        "parameter_shortname": shortname,
        "parameter_type": ptype,  # 0 float, 1 int, 2 enum
        "parameter_initial_enable": 1,
        "parameter_initial": [initial],
        "parameter_modmode": 0,
        "parameter_invisible": 0,
    }
    if enum is not None:
        v["parameter_enum"] = enum
        v["parameter_mmax"] = len(enum) - 1
    if mmax is not None:
        v["parameter_mmax"] = mmax
    if mmin is not None:
        v["parameter_mmin"] = mmin
    return {"valueof": v}


class DeviceUI:
    """Adds Live controls wired to a [js] object, optionally on tabbed pages.

    Every control sends "<message> <value>" to the js. Controls added after
    page("Name") belong to that page; call finish_pages() at the end to add
    the tab bar logic that shows one page at a time.
    """

    def __init__(self, patch, js):
        self.p = patch
        self.js = js
        self.control_x = 200            # patching-view column for controls
        self.pages = {}                 # page name -> [varnames]
        self.page_order = []
        self.current = None

    def _y(self):
        return 60 + len(self.p.boxes) * 6

    def _on_page(self, varname):
        if self.current is None:
            return
        self.pages[self.current].append(varname)
        if self.current != self.page_order[0]:
            self.p.boxes[-1]["box"]["hidden"] = 1  # only the first page shows at load

    def _wire(self, ctrl, message, y):
        pre = self.p.obj(f"prepend {message}", self.control_x + 150, y, width=110)
        self.p.connect(ctrl, pre, 0, 0)
        self.p.connect(pre, self.js, 0, 0)

    @staticmethod
    def var(name):
        return name.replace(" ", "_")

    def page(self, name):
        if name not in self.pages:
            self.pages[name] = []
            self.page_order.append(name)
        self.current = name

    def menu(self, name, short, items, initial, rect, message, annotation):
        y = self._y()
        m = self.p.add("live.menu", [self.control_x, y, rect[2], 15.0], rect,
                       varname=self.var(name), parameter_enable=1, numinlets=1, numoutlets=3,
                       outlettype=["", "", "float"], annotation=annotation, annotation_name=name,
                       saved_attribute_attributes=param(name, short, 2, initial, enum=items))
        self._on_page(self.var(name))
        self._wire(m, message, y)
        return m

    def numbox(self, name, short, lo, hi, initial, rect, message, annotation, units):
        """Number box that shows its own label, e.g. units "Oct %d" -> "Oct 3"."""
        y = self._y()
        attrs = param(name, short, 1, initial, mmin=lo, mmax=hi)
        attrs["valueof"]["parameter_unitstyle"] = 9  # custom text
        attrs["valueof"]["parameter_units"] = units
        n = self.p.add("live.numbox", [self.control_x, y, rect[2], 15.0], rect,
                       varname=self.var(name), parameter_enable=1, numinlets=1, numoutlets=2,
                       outlettype=["", "float"], annotation=annotation, annotation_name=name,
                       saved_attribute_attributes=attrs)
        self._on_page(self.var(name))
        self._wire(n, message, y)
        return n

    def dial(self, name, short, lo, hi, initial, rect, message, annotation, units):
        """A Live dial for whole numbers lo..hi; shows `short` above and the value below,
        formatted with `units` (e.g. "C%d" -> "C2")."""
        y = self._y()
        attrs = param(name, short, 1, initial, mmin=lo, mmax=hi)
        attrs["valueof"]["parameter_unitstyle"] = 9  # custom text
        attrs["valueof"]["parameter_units"] = units
        d = self.p.add("live.dial", [self.control_x, y, rect[2], rect[3]], rect,
                       varname=self.var(name), parameter_enable=1, numinlets=1, numoutlets=2,
                       outlettype=["", "float"], annotation=annotation, annotation_name=name,
                       showname=1, shownumber=1, fontsize=8.0,
                       saved_attribute_attributes=attrs)
        self._on_page(self.var(name))
        self._wire(d, message, y)
        return d

    def toggle(self, name, text, initial, rect, message, annotation):
        y = self._y()
        t = self.p.add("live.text", [self.control_x, y, rect[2], 15.0], rect,
                       varname=self.var(name), parameter_enable=1, mode=1, text=text, texton=text,
                       numinlets=1, numoutlets=2, outlettype=["", ""],
                       annotation=annotation, annotation_name=name,
                       saved_attribute_attributes=param(name, name, 2, initial, enum=["off", "on"]))
        self._on_page(self.var(name))
        self._wire(t, message, y)
        return t

    def button(self, name, text, rect, message, annotation):
        """A click-to-act button. Not a Live parameter, so it is never saved,
        automated or fired when a set loads."""
        y = self._y()
        b = self.p.add("live.text", [self.control_x, y, rect[2], 15.0], rect,
                       varname=self.var(name), parameter_enable=0, mode=0, text=text, texton=text,
                       numinlets=1, numoutlets=2, outlettype=["", ""],
                       annotation=annotation, annotation_name=name)
        self._on_page(self.var(name))
        self._wire(b, message, y)
        return b

    def label(self, text, rect, fontsize=8.0, name=None):
        c = self.p.add("live.comment", [self.control_x + 300, self._y(), rect[2], rect[3]], rect,
                       text=text, fontsize=fontsize, numinlets=1, numoutlets=0,
                       textjustification=0, **({"varname": name} if name else {}))
        if name:
            self._on_page(name)
        return c

    def readout(self, rect, fontsize=9.0, linecount=3):
        return self.p.add("live.comment", [self.control_x, 560, rect[2], rect[3]], rect,
                          text="", fontsize=fontsize, linecount=linecount,
                          numinlets=1, numoutlets=0, textjustification=0)

    def finish_pages(self, tab_rect, fontsize=9.0):
        """Tab bar -> [sel] -> "show this page, hide the rest" -> [thispatcher]."""
        names = self.page_order
        tabs = self.p.add("live.tab", [self.control_x, 20, tab_rect[2], tab_rect[3]], tab_rect,
                          varname="Page", parameter_enable=1, numinlets=1, numoutlets=3,
                          outlettype=["", "", "float"], num_lines_patching=1,
                          num_lines_presentation=1, fontsize=fontsize,
                          annotation="Switch between pages of controls.", annotation_name="Page",
                          saved_attribute_attributes=param("Page", "Page", 2, 0, enum=names))
        sel = self.p.obj("sel " + " ".join(map(str, range(len(names)))), 700, 20,
                         inlets=2, outlets=len(names) + 1, width=120)
        this_patcher = self.p.obj("thispatcher", 700, 200, inlets=1, outlets=2)
        self.p.connect(tabs, sel, 0, 0)
        for n, page in enumerate(names):
            commands = []
            for other in names:
                hidden = 0 if other == page else 1
                commands += [f"script sendbox {v} hidden {hidden}" for v in self.pages[other]]
            show = self.p.msg(", ".join(commands), 700, 60 + n * 30)
            self.p.connect(sel, show, n, 0)
            self.p.connect(show, this_patcher, 0, 0)
        return tabs


def write_amxd(patch_json, amxd_type, path):
    """Wrap the patch JSON in the .amxd container Live expects."""
    body = json.dumps(patch_json, indent="\t").encode("utf-8") + b"\n\x00"
    header = (b"ampf" + struct.pack("<I", 4) + AMXD_TYPES[amxd_type]
              + b"meta" + struct.pack("<I", 4) + struct.pack("<I", 0)
              + b"ptch" + struct.pack("<I", len(body)))
    path.write_bytes(header + body)
