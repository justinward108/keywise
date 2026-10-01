// ─── Keywise Chords (MIDI Generator) ───────────────────────────────────────
//
// Builds chord progressions from a key, scale/mode and chord type and writes
// them into the clip that is open in Live's piano roll.
//
// Patch wiring (see build_devices.py):
//   inlet 0  : UI messages (root, scale, type, ...) and the notes dictionary
//              from live.miditool.in (left outlet)
//   inlet 1  : context dictionary from live.miditool.in (middle outlet)
//   outlet 0 : "dictionary <name>" -> live.miditool.out
//   outlet 1 : bang -> live.miditool.in (regenerate when a control changes)
//   outlet 2 : UI feedback -> [route readout slot slottype slotlen slotinv preset]

inlets = 2;
outlets = 3;

// Order must match the Length menu in build_devices.py (values in beats)
var LENGTHS = [0.5, 1, 2, 3, 4, 6, 8, 16];

// Per-slot length menu, in beats (4 beats = 1 bar). 0 = use the Length menu.
// Order must match SLOT_LENGTHS in build_devices.py.
var SLOT_LENGTHS = [0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16];

// Play styles and their step rate. Order must match build_devices.py.
var STYLES = ["Block", "Strum Up", "Strum Down", "Arp Up", "Arp Down", "Arp Up-Down", "Arp Random"];
var RATES = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 1 / 6, 1 / 3];  // 1/64 ... 1/4, 1/16T, 1/8T

// Order must match the Presets menu. Degrees are 1-based; 0 = empty slot.
var PRESETS = [
    null, // "Presets…" placeholder
    [1, 5, 6, 4],
    [1, 6, 4, 5],
    [6, 4, 1, 5],
    [2, 5, 1],
    [6, 2, 5, 1],
    [1, 4, 5, 4],
    [1, 6, 3, 7],
    [1, 4, 5],
    [1, 7, 6, 5],
    [1, 5, 6, 3, 4, 1, 4, 5],
    [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5],                 // 12-bar blues
    [1, 5, 6, 4, 1, 5, 6, 4, 6, 4, 1, 5, 6, 4, 5, 5]      // 16-chord pop song
];

var NUM_SLOTS = 16;

// ─── STATE (set by the UI controls) ──────────────────────────────────────────

var state = {
    root: 0,          // 0 = C
    scale: 0,         // index into SCALES
    useClipScale: 0,  // 1 = take key/scale from the clip (Live's Scale Mode)
    type: 0,          // index into CHORD_TYPES
    octave: 3,        // Ableton naming: C3 = MIDI 60
    inversion: 0,
    length: 4,        // index into LENGTHS
    fill: 1,          // repeat progression to fill the time selection
    bass: 0,          // add root an octave below
    velocity: 100,
    style: 0,         // index into STYLES
    rate: 2,          // index into RATES
    voiceLead: 0,     // 1 = pick inversions so chords move smoothly
    slots:    [1, 5, 6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    // Per-slot chord type: 0 = follow Chord Type, n = CHORD_TYPES[n - 1]
    slotTypes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    slotLens: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    // Per-slot inversion: 0 = follow Inversion / Voice Leading, 1-4 = Root, 1st, 2nd, 3rd
    slotInvs: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
};

var context = null;   // last context dictionary from live.miditool.in
var ready = 0;        // becomes 1 once live.thisdevice fires

// ─── PURE CHORD LOGIC (no Max calls — testable in Node) ─────────────────────

// Returns { name, intervals } for the key currently in use.
function currentScale(st, ctx) {
    if (st.useClipScale && ctx && ctx.scale && ctx.scale.scale_intervals &&
        ctx.scale.scale_intervals.length) {
        return {
            root: ctx.scale.root_note || 0,
            name: ctx.scale.scale_name || "Clip scale",
            intervals: ctx.scale.scale_intervals
        };
    }
    return { root: st.root, name: SCALES[st.scale][0], intervals: SCALES[st.scale][1] };
}

// One chord for a 1-based scale degree, or null if the degree doesn't exist
// in this scale (e.g. degree 7 in a pentatonic scale). `inversion` and
// `type` default to the Inversion and Chord Type controls.
function buildChord(st, ctx, degree, inversion, type) {
    if (inversion === undefined) inversion = st.inversion;
    if (type === undefined) type = st.type;
    var sc = currentScale(st, ctx);
    var degIdx = degree - 1;
    if (degIdx < 0 || degIdx >= sc.intervals.length) return null;

    var shape = chordShape(sc.intervals, degIdx, type);
    var def = CHORD_TYPES[type];
    var rootPc = (sc.root + sc.intervals[degIdx]) % 12;
    var rootMidi = (st.octave + 2) * 12 + sc.root + sc.intervals[degIdx];

    var upper = shape.map(function (s) { return rootMidi + s; });
    for (var i = 0; i < inversion % upper.length; i++) {
        upper.push(upper.shift() + 12);
    }

    return {
        name: chordName(rootPc, shape, def),
        roman: romanFor(degIdx, shape),
        upper: upper,                        // the chord voicing
        bass: st.bass ? rootMidi - 12 : null // optional root below it
    };
}

// All notes of a chord, low to high, kept inside the MIDI range.
function chordPitches(chord) {
    var all = chord.upper.slice();
    if (chord.bass !== null) all.push(chord.bass);
    return all.filter(function (p) { return p >= 0 && p <= 127; })
              .sort(function (a, b) { return a - b; });
}

// Voice leading: each chord after the first takes the inversion that moves
// least from the previous one (see smoothestVoicing in theory.js). Chords
// whose inversion was picked by hand keep it.
function voiceLead(chords) {
    if (chords.length < 2) return;
    var anchor = mean(chords[0].upper);
    for (var c = 1; c < chords.length; c++) {
        if (chords[c].fixedInversion) continue;
        chords[c].upper = smoothestVoicing(chords[c - 1].upper, chords[c].upper, anchor);
    }
}

// The list of chords from the slots, skipping empty ones. Each chord gets
// its own chord type, length in beats and inversion where the slot sets
// them, otherwise the Chord Type, Length and Inversion controls'.
function progression(st, ctx) {
    var chords = [];
    for (var i = 0; i < st.slots.length; i++) {
        if (!st.slots[i]) continue;
        var own = st.slotInvs[i];
        var type = st.slotTypes[i] ? st.slotTypes[i] - 1 : st.type;
        var c = buildChord(st, ctx, st.slots[i], own ? own - 1 : st.inversion, type);
        if (!c) continue;
        c.fixedInversion = own > 0;
        c.beats = SLOT_LENGTHS[st.slotLens[i]] || LENGTHS[st.length];
        chords.push(c);
    }
    if (st.voiceLead) voiceLead(chords);
    return chords;
}

// Order of notes for an arpeggio over pitches (low to high).
function arpOrder(pitches, style, count, rand) {
    var up = pitches, down = pitches.slice().reverse();
    var cycle;
    if (style === "Arp Up") cycle = up;
    else if (style === "Arp Down") cycle = down;
    else if (style === "Arp Up-Down") cycle = up.concat(down.slice(1, -1));
    var out = [];
    for (var i = 0; i < count; i++) {
        out.push(cycle ? cycle[i % cycle.length] :
            pitches[Math.floor(rand() * pitches.length)]);
    }
    return out;
}

// Notes for one chord placed at time t for dur beats.
function chordNotes(st, chord, t, dur, index) {
    var pitches = chordPitches(chord);
    var style = STYLES[st.style];
    var rate = RATES[st.rate];
    var notes = [];
    function add(pitch, start, length) {
        notes.push({ pitch: pitch, start_time: start, duration: length,
                     velocity: st.velocity, mute: 0 });
    }

    if (style === "Block") {
        pitches.forEach(function (p) { add(p, t, dur); });
    } else if (style === "Strum Up" || style === "Strum Down") {
        var order = style === "Strum Up" ? pitches : pitches.slice().reverse();
        order.forEach(function (p, k) {
            var offset = Math.min(k * rate, dur * 0.5);  // never strum past half the chord
            add(p, t + offset, dur - offset);
        });
    } else {
        var steps = Math.max(1, Math.ceil(dur / rate - 1e-6));
        var seq = arpOrder(pitches, style, steps, seededRandom(index + 1));
        for (var s = 0; s < steps; s++) {
            var start = t + s * rate;
            add(seq[s], start, Math.min(rate, t + dur - start));
        }
    }
    return notes;
}

// Note list in the format live.miditool.out expects.
function generateNotes(st, ctx) {
    var chords = progression(st, ctx);
    var notes = [];
    if (!chords.length) return notes;

    var total = 0;
    chords.forEach(function (c) { total += c.beats; });

    var range = selectionRange(ctx);
    var start = range ? range.start : 0;
    var end = (range && st.fill) ? range.end : start + total;
    if (range && !st.fill) end = Math.min(end, range.end);

    var t = start, i = 0;
    while (t < end - 1e-6) {
        var chord = chords[i % chords.length];
        var dur = Math.min(chord.beats, end - t);
        notes = notes.concat(chordNotes(st, chord, t, dur, i));
        t += chord.beats;
        i++;
    }
    return notes;
}

function readoutText(st, ctx) {
    var sc = currentScale(st, ctx);
    var chords = progression(st, ctx);
    if (st.useClipScale && !(ctx && ctx.scale)) return "Using the clip's scale: press Generate";
    var head = NOTES[sc.root % 12] + " " + sc.name;
    if (!chords.length) return head + ": pick chords above";
    // Kept short: the Generate panel is narrow.
    return head + ":  " + chords.map(function (c) { return c.name; }).join("  ");
}

// ─── MAX GLUE ────────────────────────────────────────────────────────────────

// Re-run the apply cycle so the clip updates as controls move. Debounced so a
// preset (32 slot changes at once) only rewrites the clip one time.
var regenerate = (typeof Task !== "undefined") ?
    new Task(function () { outlet(1, "bang"); }) : null;

function changed() {
    outlet(2, "readout", "set", readoutText(state, context));
    if (ready && regenerate) {
        regenerate.cancel();
        regenerate.schedule(30);
    }
}

function root(v)      { state.root = v | 0; changed(); }
function scale(v)     { state.scale = v | 0; changed(); }
function clipscale(v) { state.useClipScale = v ? 1 : 0; changed(); }
function type(v)      { state.type = v | 0; changed(); }
function octave(v)    { state.octave = v | 0; changed(); }
function inversion(v) { state.inversion = v | 0; changed(); }
function length(v)    { state.length = v | 0; changed(); }
function fill(v)      { state.fill = v ? 1 : 0; changed(); }
function bass(v)      { state.bass = v ? 1 : 0; changed(); }
function velocity(v)  { state.velocity = Math.max(1, Math.min(127, v | 0)); changed(); }
function style(v)     { state.style = v | 0; changed(); }
function rate(v)      { state.rate = v | 0; changed(); }
function voicelead(v) { state.voiceLead = v ? 1 : 0; changed(); }

function slot(i, v) {
    if (i < 0 || i >= NUM_SLOTS) return;
    state.slots[i] = v | 0;
    changed();
}

function slotlen(i, v) {
    if (i < 0 || i >= NUM_SLOTS) return;
    state.slotLens[i] = v | 0;
    changed();
}

// Picking a preset sets the slot menus (and resets their lengths to "=");
function slottype(i, v) {
    if (i < 0 || i >= NUM_SLOTS) return;
    state.slotTypes[i] = v | 0;
    changed();
}

function slotinv(i, v) {
    if (i < 0 || i >= NUM_SLOTS) return;
    state.slotInvs[i] = v | 0;
    changed();
}

// Picking a preset sets the slot menus (and resets their types, lengths and
// inversions to "="); each menu then reports back via slot() / slottype() / ...
function preset(v) {
    var p = PRESETS[v | 0];
    if (!p) return;
    for (var i = 0; i < NUM_SLOTS; i++) {
        outlet(2, "slot", i, p[i] || 0);
        outlet(2, "slottype", i, 0);
        outlet(2, "slotlen", i, 0);
        outlet(2, "slotinv", i, 0);
    }
    outlet(2, "preset", "set", 0);
}

// Duplicate: each press adds one more copy of your original chords after
// the last filled slot, so 4 chords go 4 -> 8 -> 12 -> 16 (play a phrase
// three times, change the fourth). Each copy keeps the chord's type, length
// and inversion. The first press copies everything up to the last filled
// slot and remembers that length; later presses keep adding that many,
// even if you've edited the copies. The slot menus are set through
// outlet 2 and report back, like a preset.
var dupBlock = 0;   // length of the original pattern, set by the first press

function duplicateSlots(st) {
    var n = 0;
    for (var i = 0; i < NUM_SLOTS; i++) if (st.slots[i]) n = i + 1;
    var copies = [];
    if (n === 0 || n >= NUM_SLOTS) return copies;
    if (!(dupBlock && n > dupBlock && n % dupBlock === 0)) dupBlock = n;  // a new pattern
    for (var j = n; j < Math.min(n + dupBlock, NUM_SLOTS); j++) {
        var from = j - n;
        copies.push([j, st.slots[from], st.slotTypes[from], st.slotLens[from], st.slotInvs[from]]);
    }
    return copies;
}

function duplicate(v) {
    if (!ready || v === 0) return;   // ignore the button's release, and set loading
    var copies = duplicateSlots(state);
    if (!copies.length) {
        outlet(2, "readout", "set", "Nothing to duplicate: fill some chords first, and leave empty slots after them.");
        return;
    }
    copies.forEach(function (c) {
        outlet(2, "slot", c[0], c[1]);
        outlet(2, "slottype", c[0], c[2]);
        outlet(2, "slotlen", c[0], c[3]);
        outlet(2, "slotinv", c[0], c[4]);
    });
}

// live.thisdevice -> "loaded": parameters are restored, safe to write to clips.
function loaded() {
    ready = 1;
    outlet(2, "readout", "set", readoutText(state, context));
}

function dictionary(name) {
    var data = readDict(name);
    if (inlet === 1) {
        context = data;
        return;
    }
    // Left inlet: the clip's notes arrive after the context -> generate.
    outlet(2, "readout", "set", readoutText(state, context));
    sendNotes("keywise_chords_out", generateNotes(state, context));
}
