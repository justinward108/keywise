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

// Chord fills, played in the last bar of a phrase. Order must match build_devices.py.
var FILLS = ["No Fill", "Turnaround", "Dominant", "Sus", "Walk-up", "Push", "Break"];

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

// Random Lengths: total length choices, in bars. Order must match build_devices.py.
var RANDOM_BARS = [1, 2, 4, 8, 16];

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
    randCount: 4,     // Random Chords: how many chords
    randLen: 5,       // Random Chords: each chord's length, index into SLOT_LENGTHS (5 = 1 bar)
    randBars: 2,      // Random Lengths: total length, index into RANDOM_BARS (2 = 4 bars)
    randMinLen: 3,    // Random Lengths: shortest chord, index into SLOT_LENGTHS (3 = 1/2 bar)
    randMaxLen: 7,    // Random Lengths: longest chord (7 = 2 bars)
    randMinCount: 2,  // Random Lengths: fewest chords
    randMaxCount: 16, // Random Lengths: most chords
    randVariation: 1, // index into VARIATIONS (1 = Varied)
    randSeed: 0,      // 0 = a new progression every press
    lowOct: 2,        // Lowest octave chords may use (C2)
    highOct: 5,       // Highest octave chords may use (up to B5)
    fillType: 0,      // index into FILLS
    fillEvery: 0,     // index into FILL_EVERY (theory.js)
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
        degree: degree,
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
// ─── REGISTER ────────────────────────────────────────────────────────────────
// Keep every chord between the Lowest and Highest octave dials (e.g. C2 to B5).
// A chord moves by whole octaves to fit, so its notes and inversion don't
// change; a chord too big for the window gets as close as it can. The
// + Bass note counts as part of the chord and always stays below it.

function registerWindow(st) {
    var lo = Math.min(st.lowOct, st.highOct), hi = Math.max(st.lowOct, st.highOct);
    return { low: (lo + 2) * 12, high: (hi + 2) * 12 + 11 };   // C of the lowest, B of the highest
}

function keepInRange(st, chord) {
    if (chord.bass !== null) {
        var lowest = Math.min.apply(null, chord.upper);
        while (chord.bass >= lowest) chord.bass -= 12;
        while (chord.bass < lowest - 12) chord.bass += 12;
    }
    var all = chord.upper.concat(chord.bass !== null ? [chord.bass] : []);
    var w = registerWindow(st), middle = (w.low + w.high) / 2;
    var best = 0, bestOut = Infinity, bestDist = Infinity;
    for (var k = -6; k <= 6; k++) {
        var shift = k * 12, out = 0;
        all.forEach(function (p) { if (p + shift < w.low || p + shift > w.high) out++; });
        var dist = Math.abs(mean(all) + shift - middle);
        // fewest notes outside the window first; then the smallest move
        if (out < bestOut || (out === bestOut && Math.abs(shift) < Math.abs(best)) ||
            (out === bestOut && Math.abs(shift) === Math.abs(best) && dist < bestDist)) {
            best = shift; bestOut = out; bestDist = dist;
        }
    }
    if (best) {
        chord.upper = chord.upper.map(function (p) { return p + best; });
        if (chord.bass !== null) chord.bass += best;
    }
    return chord;
}

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
    chords.forEach(function (c) { keepInRange(st, c); });
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

// The progression laid out in time: [{ chord, t, dur, i }], filling the time
// selection (or written once), plus where it starts and ends.
function timeline(st, ctx) {
    var chords = progression(st, ctx);
    var total = 0;
    chords.forEach(function (c) { total += c.beats; });

    var range = selectionRange(ctx);
    var start = range ? range.start : 0;
    var end = (range && st.fill) ? range.end : start + total;
    if (range && !st.fill) end = Math.min(end, range.end);

    var events = [];
    for (var t = start, i = 0; chords.length && t < end - 1e-6; t += chords[i % chords.length].beats, i++) {
        var chord = chords[i % chords.length];
        events.push({ chord: chord, t: t, dur: Math.min(chord.beats, end - t), i: i });
    }
    return { events: events, chords: chords, start: start, end: end, total: total };
}

// ─── CHORD FILLS ─────────────────────────────────────────────────────────────
// A fill rewrites the last bar before a phrase end P, leading into the chord
// at P (or, at the very end, back to chord 1). Fill chords are worked out
// from that chord's scale degree, so they fit any key and mode:
//   Turnaround  two quick chords, ii then V7 of the next chord
//   Dominant    V7 of the next chord for the whole bar
//   Sus         V sus4, resolving to V
// The V chords are always major (dominant), even in minor keys, because
// that's what pulls strongly back home.
//   Walk-up     two chords stepping up into the next chord
//   Push        the next chord arrives an 8th note early
//   Break       two short stabs, then silence

function typeIndex(label) {
    for (var i = 0; i < CHORD_TYPES.length; i++) if (CHORD_TYPES[i].label === label) return i;
    return 0;
}

// Scale degree `steps` away from degree (both 1-based), wrapping round the scale.
function degreeFrom(st, ctx, degree, steps) {
    var len = currentScale(st, ctx).intervals.length;
    return (((degree - 1 + steps) % len) + len) % len + 1;
}

// Remove [a, b) from the timeline, shortening or splitting chords that cross it.
function cutEvents(events, a, b) {
    var out = [];
    events.forEach(function (e) {
        var eEnd = e.t + e.dur;
        if (eEnd <= a + 1e-6 || e.t >= b - 1e-6) { out.push(e); return; }
        if (e.t < a - 1e-6) out.push({ chord: e.chord, t: e.t, dur: a - e.t, i: e.i });
        if (eEnd > b + 1e-6) out.push({ chord: e.chord, t: b, dur: eEnd - b, i: e.i });
    });
    return out;
}

function eventAt(events, t) {
    for (var i = 0; i < events.length; i++) {
        if (t >= events[i].t - 1e-6 && t < events[i].t + events[i].dur - 1e-6) return events[i];
    }
    return null;
}

// Apply the chosen fill at every phrase end.
function applyFills(st, ctx, line) {
    var fill = FILLS[st.fillType];
    if (fill === "No Fill" || !line.events.length) return line.events;
    var events = line.events;
    var points = fillPoints(st.fillEvery, line.start, line.end, line.total, 4);

    points.forEach(function (p, n) {
        var a = p - 4;                                          // the last bar of the phrase
        var next = eventAt(events, p);
        var target = next ? next.chord : line.chords[0];        // the chord the fill leads into
        var before = eventAt(events, a);
        var current = before ? before.chord : target;
        var seed = 1000 + n;                                    // arp seed for fill chords
        // Add a fill chord `steps` scale degrees from the target, voiced
        // close to whatever plays just before it.
        var add = function (steps, type, t, dur) {
            var c = buildChord(st, ctx, degreeFrom(st, ctx, target.degree, steps), 0, type);
            var prev = eventAt(events, t - 0.01);
            c.upper = smoothestVoicing(prev ? prev.chord.upper : current.upper, c.upper, mean(current.upper));
            keepInRange(st, c);
            events.push({ chord: c, t: t, dur: dur, i: seed });
        };

        if (fill === "Push") {
            events = cutEvents(events, p - 0.5, p);
            events.push({ chord: target, t: p - 0.5, dur: 0.5, i: seed });
            return;
        }
        events = cutEvents(events, a, p);
        if (fill === "Break") {
            events.push({ chord: current, t: a, dur: 0.5, i: seed });
            events.push({ chord: current, t: a + 1, dur: 0.5, i: seed });
        } else if (fill === "Turnaround") {
            add(1, st.type, a, 2);                     // ii of the next chord...
            add(4, typeIndex("dominant 7"), a + 2, 2); // ...then V7
        } else if (fill === "Dominant") {
            add(4, typeIndex("dominant 7"), a, 4);     // V7
        } else if (fill === "Sus") {
            add(4, typeIndex("sus4"), a, 2);           // V sus4...
            add(4, typeIndex("dominant"), a + 2, 2);   // ...resolving to V
        } else if (fill === "Walk-up") {
            add(-2, st.type, a, 2);                    // two scale steps below...
            add(-1, st.type, a + 2, 2);                // ...one step below
        }
    });
    return events;
}

// Note list in the format live.miditool.out expects.
function generateNotes(st, ctx) {
    var line = timeline(st, ctx);
    var notes = [];
    applyFills(st, ctx, line).sort(function (x, y) { return x.t - y.t; }).forEach(function (e) {
        notes = notes.concat(chordNotes(st, e.chord, e.t, e.dur, e.i));
    });
    return notes;
}

function readoutText(st, ctx) {
    var sc = currentScale(st, ctx);
    var chords = progression(st, ctx);
    if (st.useClipScale && !(ctx && ctx.scale)) return "Using the clip's scale: press Generate";
    var head = NOTES[sc.root % 12] + " " + sc.name;
    if (!chords.length) return head + ": pick chords above";
    // Kept short: the Generate panel is narrow.
    return (lastSeed ? "Seed " + lastSeed + " · " : "") + head + ":  " +
        chords.map(function (c) { return c.name; }).join("  ");
}

// ─── MAX GLUE ────────────────────────────────────────────────────────────────

// Re-run the apply cycle so the clip updates as controls move. Debounced so a
// preset (32 slot changes at once) only rewrites the clip one time.
var regenerate = (typeof Task !== "undefined") ?
    new Task(function () { outlet(1, "bang"); }) : null;

function changed() {
    if (!writingRandom) lastSeed = 0;   // the progression no longer matches the seed
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
function filltype(v)  { state.fillType = v | 0; changed(); }
function lowoct(v)    { state.lowOct = v | 0; changed(); }
function highoct(v)   { state.highOct = v | 0; changed(); }
function fillevery(v) { state.fillEvery = v | 0; changed(); }

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

// ─── RANDOM PROGRESSIONS ─────────────────────────────────────────────────────
// Two generators (Rand tab) that write into the chord slots:
//   Random Chords:  a set number of chords, all the same length
//   Random Lengths: a total length split into a random number of chords of
//                   random lengths, within shortest/longest and fewest/most
// Both follow the same harmony rules, so the results sound like songs:
//   - start on I, never the same chord twice in a row
//   - pick each next chord by how naturally the root moves (works in any mode):
//       down a fifth (V-I, ii-V, vi-ii)   strongest
//       down a third (I-vi, vi-IV)         strong
//       up a step / up a fifth (IV-V, IV-I) medium
//       down a step / up a third (V-IV)    weak
//   - no ping-ponging between two chords (A B A B); going straight back to
//     the chord before last is allowed but discouraged
//   - diminished chords are rare (none in Conservative), only where they
//     resolve (up a step or down a fifth), never at the end
//   - end on a chord that leads home: V, IV, or a major bVII (as in Dorian,
//     Mixolydian, minor), so the loop pulls back to I
//   - chord changes on beats 1 and 3 (Random Lengths)
// Variation sets how far it wanders: Conservative keeps to I, IV, V and vi;
// Varied uses every chord, favouring the common ones; Chaotic treats all
// chords and moves alike and also randomizes chord types and inversions.
// A Seed makes the result repeatable: 0 = a new one every press, and the
// seed used is shown in the readout so a good result can be brought back.

var VARIATIONS = ["Conservative", "Varied", "Chaotic"];   // order must match build_devices.py

// Root motion in scale steps up (0-6) -> how natural it sounds.
var ROOT_MOTION = { 3: 4, 5: 3, 1: 2, 4: 2, 6: 1, 2: 1 };

// How much each scale degree is wanted, per variation (7-note scales).
var DEGREE_PREFERENCE = {
    Conservative: { 1: 3, 4: 3, 5: 3, 6: 2 },
    Varied:       { 1: 3, 2: 2, 3: 1, 4: 3, 5: 3, 6: 3, 7: 1 },
    Chaotic:      { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }
};

function weightedPick(options, weights, rand) {
    var total = 0;
    options.forEach(function (o) { total += weights[o]; });
    var r = rand() * total;
    for (var i = 0; i < options.length; i++) {
        r -= weights[options[i]];
        if (r < 0) return options[i];
    }
    return options[options.length - 1];
}

// Triad quality of each degree in the current scale: "dim", "maj", "min"...
function degreeQualities(st, ctx) {
    var iv = currentScale(st, ctx).intervals;
    var q = {};
    for (var d = 1; d <= iv.length; d++) {
        var shape = chordShape(iv, d - 1, 0);
        var third = shape[1] % 12, fifth = shape[2] % 12;
        q[d] = third === 3 && fifth === 6 ? "dim" : third === 4 && fifth === 7 ? "maj" :
               third === 3 && fifth === 7 ? "min" : "other";
    }
    return q;
}

// n random scale degrees (1-based) following the harmony rules above.
function randomDegrees(st, ctx, n, rand) {
    var len = currentScale(st, ctx).intervals.length;
    var variation = VARIATIONS[st.randVariation] || "Varied";
    var degrees = [1];
    if (len !== 7) {
        // Pentatonic, blues, whole tone...: no functional harmony, just no repeats.
        for (var i = 1; i < n; i++) {
            var opts = [];
            for (var d = 1; d <= len; d++) if (d !== degrees[i - 1] && !(i === n - 1 && d === 1)) opts.push(d);
            degrees.push(opts[Math.floor(rand() * opts.length)] || 1);
        }
        return degrees.slice(0, n);
    }

    var quality = degreeQualities(st, ctx);
    var prefer = DEGREE_PREFERENCE[variation];
    var chaotic = variation === "Chaotic";
    var motion = function (from, to) { return ROOT_MOTION[((to - from) % 7 + 7) % 7] || 0; };
    // Chords that lead home at the end of a loop.
    var cadence = [5, 4, 7].filter(function (d) { return quality[d] === "maj" && prefer[d]; });
    if (!cadence.length) cadence = [5, 4];

    for (var i = 1; i < n; i++) {
        var prev = degrees[i - 1];
        var last = i === n - 1;
        var weights = {}, options = [];
        for (var d = 1; d <= 7; d++) {
            if (d === prev || !prefer[d]) continue;
            if (!chaotic) {
                if (variation === "Conservative" && quality[d] === "dim") continue;
                if (!last && i >= 3 && d === degrees[i - 2] && prev === degrees[i - 3]) continue;   // A B A B (the ending wins)
                // a diminished chord must resolve: up a step or down a fifth
                if (quality[prev] === "dim" && d !== prev % 7 + 1 && d !== (prev + 2) % 7 + 1) continue;
                if (quality[d] === "dim" && (last || i === n - 2)) continue;
                if (last && cadence.indexOf(d) < 0) continue;
                // leave an ending chord available for the last slot
                if (i === n - 2 && cadence.length === 1 && cadence[0] === d) continue;
            }
            var w = prefer[d] * (chaotic ? 1 : motion(prev, d));
            if (!chaotic && quality[d] === "dim") w *= 0.15;                  // rare
            if (!chaotic && i >= 2 && d === degrees[i - 2]) w *= 0.3;        // straight back: discouraged
            if (w > 0) { weights[d] = w; options.push(d); }
        }
        if (!options.length) {                    // nothing fits the rules: any other chord
            for (var e = 1; e <= 7; e++) if (e !== prev) { weights[e] = 1; options.push(e); }
        }
        degrees.push(weightedPick(options, weights, rand));
    }
    return degrees.slice(0, n);
}

// Chord lengths (in beats) adding up to exactly totalBeats, each between
// minBeats and maxBeats, with between minCount and maxCount chords (16 at
// most). Unless chaotic, chords change only on beats 1 and 3, so only
// lengths of whole half-bars are used. Returns null if it can't be done.
function randomLengths(totalBeats, rand, opts) {
    opts = opts || {};
    var minB = opts.minBeats || 2, maxB = opts.maxBeats || 8;
    var minC = Math.max(1, opts.minCount || 1), maxC = Math.min(NUM_SLOTS, opts.maxCount || NUM_SLOTS);
    var sizes = SLOT_LENGTHS.filter(function (b) { return b > 0 && b >= minB - 1e-6 && b <= maxB + 1e-6; });
    if (!opts.chaotic) {
        var onBeats = sizes.filter(function (b) { return b % 2 === 0; });
        if (onBeats.length) sizes = onBeats;
    }
    // Work in half-beats. can[k][u]: u half-beats can be made from exactly k chords.
    var units = Math.round(totalBeats * 2);
    var parts = sizes.map(function (b) { return Math.round(b * 2); });
    var can = [[true]];
    for (var u = 1; u <= units; u++) can[0][u] = false;
    for (var k = 1; k <= maxC; k++) {
        can[k] = [];
        for (u = 0; u <= units; u++) {
            can[k][u] = parts.some(function (p) { return p <= u && can[k - 1][u - p]; });
        }
    }
    var counts = [];
    for (k = minC; k <= maxC; k++) if (can[k][units]) counts.push(k);
    if (!counts.length) return null;

    var count = counts[Math.floor(rand() * counts.length)];
    var lengths = [], left = units;
    var likes = { 8: 3, 16: 2, 4: 2 };          // 1 bar is the most common chord length
    for (var c = count; c > 0; c--) {
        var weights = {}, options = [];
        parts.forEach(function (p) {
            if (p <= left && can[c - 1][left - p]) { options.push(p); weights[p] = likes[p] || 1; }
        });
        var pick = weightedPick(options, weights, rand);
        lengths.push(pick / 2);
        left -= pick;
    }
    return lengths;
}

// Put a progression on the slot menus (like a preset): degrees, lengths
// (SLOT_LENGTHS indexes), and optionally types and inversions (slot menu
// values; 0 = "=").
function writeProgression(degrees, lengthIndexes, types, inversions) {
    dupBlock = 0;
    writingRandom = 1;
    for (var i = 0; i < NUM_SLOTS; i++) {
        var used = i < degrees.length;
        outlet(2, "slot", i, used ? degrees[i] : 0);
        outlet(2, "slottype", i, used && types ? types[i] : 0);
        outlet(2, "slotlen", i, used ? lengthIndexes[i] : 0);
        outlet(2, "slotinv", i, used && inversions ? inversions[i] : 0);
    }
    writingRandom = 0;
}

function beatsToSlotLength(beats) {
    var i = SLOT_LENGTHS.indexOf(beats);
    return i > 0 ? i : 0;
}

// Chaotic also randomizes chord types (7th, 9th, sus2, sus4, add9 or the
// Key tab's type) and inversions, as slot menu values.
var CHAOS_TYPES = ["7th", "9th", "sus2", "sus4", "add9"];
function chaosColours(n, rand) {
    var types = [], invs = [];
    for (var i = 0; i < n; i++) {
        types.push(rand() < 0.5 ? 0 : typeIndex(CHAOS_TYPES[Math.floor(rand() * CHAOS_TYPES.length)]) + 1);
        invs.push(rand() < 0.5 ? 0 : 2 + Math.floor(rand() * 2));     // 1st or 2nd inversion
    }
    return { types: types, invs: invs };
}

var lastSeed = 0;       // seed of the last random progression, shown in the readout
var writingRandom = 0;  // 1 while a random progression is being written

// The random generator for one press: the chosen Seed, or a new one.
function seededForPress() {
    lastSeed = state.randSeed > 0 ? state.randSeed : 1 + Math.floor(Math.random() * 9999);
    return seededRandom(lastSeed);
}

function finishRandom(degrees, lengthIndexes, rand) {
    var chaos = VARIATIONS[state.randVariation] === "Chaotic" ? chaosColours(degrees.length, rand) : null;
    writeProgression(degrees, lengthIndexes, chaos && chaos.types, chaos && chaos.invs);
    outlet(2, "readout", "set", readoutText(state, context));
}

// Random Chords button: randCount chords, each randLen long.
function randomchords(v) {
    if (!ready || v === 0) return;
    var rand = seededForPress();
    var n = Math.max(1, Math.min(NUM_SLOTS, state.randCount));
    var lens = [];
    for (var i = 0; i < n; i++) lens.push(state.randLen);
    finishRandom(randomDegrees(state, context, n, rand), lens, rand);
}

// Random Lengths button: a random number of chords with random lengths,
// adding up to randBars bars, within the shortest/longest and fewest/most limits.
function randomlengths(v) {
    if (!ready || v === 0) return;
    var rand = seededForPress();
    var lengths = randomLengths(RANDOM_BARS[state.randBars] * 4, rand, {
        minBeats: SLOT_LENGTHS[state.randMinLen], maxBeats: SLOT_LENGTHS[state.randMaxLen],
        minCount: state.randMinCount, maxCount: state.randMaxCount,
        chaotic: VARIATIONS[state.randVariation] === "Chaotic"
    });
    if (!lengths) {
        lastSeed = 0;
        outlet(2, "readout", "set", "Can't fill " + RANDOM_BARS[state.randBars] +
            " bars with those limits. Widen the shortest/longest chord or the fewest/most chords.");
        return;
    }
    finishRandom(randomDegrees(state, context, lengths.length, rand), lengths.map(beatsToSlotLength), rand);
}

function randcount(v)     { state.randCount = v | 0; }
function randlen(v)       { state.randLen = (v | 0) + 1; }      // menus have no "Len=" entry
function randbars(v)      { state.randBars = v | 0; }
function randminlen(v)    { state.randMinLen = (v | 0) + 1; }
function randmaxlen(v)    { state.randMaxLen = (v | 0) + 1; }
function randmincount(v)  { state.randMinCount = v | 0; }
function randmaxcount(v)  { state.randMaxCount = v | 0; }
function randvariation(v) { state.randVariation = v | 0; }
function randseed(v)      { state.randSeed = Math.max(0, v | 0); }

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
