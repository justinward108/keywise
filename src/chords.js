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
function filltype(v)  { state.fillType = v | 0; changed(); }
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
// Random, but following the habits of most songs so the result is musical:
// start on I, prefer the common chords (I, IV, V, vi), never the same chord
// twice in a row, and often end on V or IV so the progression wants to loop.

// How likely each scale degree is (7-note scales). Scales with fewer notes
// treat every degree equally.
var DEGREE_WEIGHTS = { 1: 3, 2: 2, 3: 1, 4: 3, 5: 3, 6: 3, 7: 0.5 };

function weightedPick(options, weights, rand) {
    var total = 0;
    options.forEach(function (o) { total += weights[o] || 1; });
    var r = rand() * total;
    for (var i = 0; i < options.length; i++) {
        r -= weights[options[i]] || 1;
        if (r < 0) return options[i];
    }
    return options[options.length - 1];
}

// n random scale degrees (1-based) for the current scale.
function randomDegrees(st, ctx, n, rand) {
    var len = currentScale(st, ctx).intervals.length;
    var weights = len === 7 ? DEGREE_WEIGHTS : {};
    var degrees = [1];
    for (var i = 1; i < n; i++) {
        var prev = degrees[i - 1];
        var options = [];
        for (var d = 1; d <= len; d++) if (d !== prev) options.push(d);
        if (i === n - 1 && n >= 3 && len === 7 && rand() < 0.6) {
            // a cadence: end on V or IV (whichever isn't the previous chord)
            options = [5, 4].filter(function (d) { return d !== prev; });
        }
        degrees.push(weightedPick(options, weights, rand));
    }
    return degrees.slice(0, n);
}

// Fewest chords of 2, 4 or 8 beats that add up to `beats` (an even number).
function fewestChords(beats) {
    var rest = beats % 8;
    return Math.floor(beats / 8) + (rest === 0 ? 0 : rest === 6 ? 2 : 1);
}

// Split totalBeats into chord lengths of half a bar, 1 bar or 2 bars (mostly
// 1 bar), using no more than the 16 slots. Each choice leaves a remainder that
// can still be filled with the slots that are left.
function randomLengths(totalBeats, rand) {
    var lengths = [];
    var left = totalBeats;
    while (left > 1e-6) {
        var slotsLeft = NUM_SLOTS - lengths.length - 1;
        var options = [2, 4, 8].filter(function (b) {
            return b <= left + 1e-6 && fewestChords(left - b) <= slotsLeft;
        });
        if (!options.length) options = [left];
        lengths.push(weightedPick(options, { 2: 1, 4: 2, 8: 1 }, rand));
        left -= lengths[lengths.length - 1];
    }
    return lengths;
}

// Put a progression on the slot menus (like a preset): degrees with their
// lengths (SLOT_LENGTHS indexes), types and inversions back to "=".
function writeProgression(degrees, lengthIndexes) {
    dupBlock = 0;
    for (var i = 0; i < NUM_SLOTS; i++) {
        outlet(2, "slot", i, degrees[i] || 0);
        outlet(2, "slottype", i, 0);
        outlet(2, "slotlen", i, i < degrees.length ? lengthIndexes[i] : 0);
        outlet(2, "slotinv", i, 0);
    }
}

function beatsToSlotLength(beats) {
    var i = SLOT_LENGTHS.indexOf(beats);
    return i > 0 ? i : 0;
}

// Random Chords button: randCount chords, each randLen long.
function randomchords(v) {
    if (!ready || v === 0) return;
    var n = Math.max(1, Math.min(NUM_SLOTS, state.randCount));
    var lens = [];
    for (var i = 0; i < n; i++) lens.push(state.randLen);
    writeProgression(randomDegrees(state, context, n, Math.random), lens);
}

// Random Lengths button: a random number of chords, random lengths, adding
// up to randBars bars.
function randomlengths(v) {
    if (!ready || v === 0) return;
    var lengths = randomLengths(RANDOM_BARS[state.randBars] * 4, Math.random);
    writeProgression(randomDegrees(state, context, lengths.length, Math.random),
                     lengths.map(beatsToSlotLength));
}

function randcount(v) { state.randCount = v | 0; }
function randlen(v)   { state.randLen = (v | 0) + 1; }   // menu has no "Len=" entry
function randbars(v)  { state.randBars = v | 0; }

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
