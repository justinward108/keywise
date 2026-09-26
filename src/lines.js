// ─── MetaMuse Bass / MetaMuse Melody (MIDI Transformations) ─────────────────
//
// Reads the chords in the selected notes of a clip and replaces them with a
// bassline or a melody that follows those chords. The same script runs both
// devices; the patch passes "bass" or "melody" as its argument:
//   [js metamuse_lines.js bass]
//
// Typical use: duplicate a chord clip onto a bass (or lead) track, select all
// notes, apply the transformation.
//
// Patch wiring (see build_devices.py):
//   inlet 0  : UI messages and the notes dictionary from live.miditool.in
//   inlet 1  : context dictionary from live.miditool.in
//   outlet 0 : "dictionary <name>" -> live.miditool.out
//   outlet 1 : bang -> live.miditool.in (re-apply when a control changes)
//   outlet 2 : UI feedback -> [route readout]

inlets = 2;
outlets = 3;

var MODE = (typeof jsarguments !== "undefined" && jsarguments[1]) ? String(jsarguments[1]) : "bass";

// Order must match the menus in build_devices.py.
var BASS_PATTERNS = ["Held", "Pulse", "Root-Fifth", "Octaves", "Walking", "Syncopated", "Push"];
var BASS_RATES = [1, 1 / 2, 1 / 4, 1 / 3];            // 1/4, 1/8, 1/16, 1/8T in beats
var MELODY_RHYTHMS = ["Quarters", "8ths", "16ths", "Mixed"];

var state = {
    // bass
    pattern: 1,
    rate: 1,
    bassOctave: 1,     // Live naming: C1 = MIDI 36
    gate: 90,          // % of each step the note lasts
    // melody
    rhythm: 1,
    density: 60,       // % chance of a note on each weak step
    melodyOctave: 4,   // C4 = MIDI 72
    variation: 1,      // seed: change it for a different melody
    repeat: 1,         // reuse one bar of rhythm so the melody has a motif
    // both
    velocity: 100
};

var context = null;
var ready = 0;

// ─── CHORD DETECTION ─────────────────────────────────────────────────────────
// Notes that start within 1/8 beat of each other belong to the same chord
// (so strummed chords still count as one). Each chord lasts until the next
// one starts. Works best on block or strummed chords, not arpeggios.

var TOGETHER = 0.125;

function detectChords(notes) {
    var list = notes.filter(function (n) { return !n.mute; })
                    .sort(function (a, b) { return a.start_time - b.start_time; });
    var groups = [];
    list.forEach(function (n) {
        var g = groups[groups.length - 1];
        if (g && n.start_time - g.start < TOGETHER) g.notes.push(n);
        else groups.push({ start: n.start_time, notes: [n] });
    });

    return groups.map(function (g, i) {
        var lastEnd = 0;
        g.notes.forEach(function (n) { lastEnd = Math.max(lastEnd, n.start_time + n.duration); });
        var end = i + 1 < groups.length ? groups[i + 1].start : lastEnd;
        var pitches = ascending(g.notes.map(function (n) { return n.pitch; }));
        var info = chordRoot(pitches);
        return {
            start: g.start,
            end: end,
            pitches: pitches,
            pcs: info.pcs,
            root: info.root,          // pitch class 0-11
            third: info.third,        // 3 or 4 semitones (or null)
            fifth: info.fifth,        // usually 7
            name: info.name
        };
    });
}

// Work out the root of a chord, even when it's in an inversion: the root is
// the note that has a 5th and a 3rd above it among the chord's notes.
function chordRoot(pitches) {
    var pcs = [];
    pitches.forEach(function (p) { if (pcs.indexOf(p % 12) < 0) pcs.push(p % 12); });
    var lowest = pitches[0] % 12;
    var best = lowest, bestScore = -1;
    pcs.forEach(function (r) {
        var has = function (iv) { return pcs.indexOf((r + iv) % 12) >= 0; };
        // A perfect 5th is the strongest clue. A b5 (diminished) counts a
        // little; a #5 barely, since B-D-G is far more often G/B than B+.
        var score = (has(7) ? 3 : has(6) ? 1 : has(8) ? 0.5 : 0) +
                    (has(3) || has(4) ? 2 : 0) +
                    (has(10) || has(11) ? 1 : 0) +
                    (r === lowest ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = r; }
    });
    var has = function (iv) { return pcs.indexOf((best + iv) % 12) >= 0; };
    var third = has(4) ? 4 : has(3) ? 3 : null;
    var fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
    var shape = [0];
    if (third) shape.push(third);
    shape.push(fifth);
    var suffix = shape.length === 3 ? qualityName(shape) : "5";
    return { pcs: pcs, root: best, third: third, fifth: fifth, name: NOTES[best] + (suffix || "") };
}

// The scale to use for passing notes: the clip's Scale if it has one,
// otherwise every note that appears in the chords.
function scaleFor(chords, ctx) {
    if (ctx && ctx.scale && ctx.scale.scale_intervals && ctx.scale.scale_intervals.length) {
        var r = ctx.scale.root_note || 0;
        return ctx.scale.scale_intervals.map(function (iv) { return (r + iv) % 12; });
    }
    var pcs = [];
    chords.forEach(function (c) {
        c.pcs.forEach(function (pc) { if (pcs.indexOf(pc) < 0) pcs.push(pc); });
    });
    return pcs;
}

// Nearest pitch at or near `target` whose pitch class is in `pcs`.
function nearestIn(pcs, target) {
    for (var d = 0; d < 12; d++) {
        if (pcs.indexOf(((target - d) % 12 + 12) % 12) >= 0) return target - d;
        if (pcs.indexOf((target + d) % 12) >= 0) return target + d;
    }
    return target;
}

// Next note of the scale going up (dir 1) or down (dir -1) from pitch.
function scaleStep(pcs, pitch, dir) {
    var p = pitch;
    for (var i = 0; i < 12; i++) {
        p += dir;
        if (pcs.indexOf(((p % 12) + 12) % 12) >= 0) return p;
    }
    return pitch + dir;
}

// ─── BASS ────────────────────────────────────────────────────────────────────

function bassLine(st, chords, scalePcs) {
    var notes = [];
    var pattern = BASS_PATTERNS[st.pattern];
    var step = BASS_RATES[st.rate];
    var gate = st.gate / 100;
    function add(pitch, start, len) {
        if (len <= 0.001 || pitch < 0 || pitch > 127) return;
        notes.push({ pitch: pitch, start_time: start, duration: len, velocity: st.velocity, mute: 0 });
    }

    chords.forEach(function (c, ci) {
        var root = (st.bassOctave + 2) * 12 + c.root;
        var fifth = root + c.fifth;
        var dur = c.end - c.start;
        var next = chords[ci + 1];
        var nextRoot = next ? (st.bassOctave + 2) * 12 + next.root : root;
        var steps = Math.max(1, Math.round(dur / step));

        if (pattern === "Held") {
            add(root, c.start, dur * gate);
        } else if (pattern === "Pulse" || pattern === "Root-Fifth" || pattern === "Octaves") {
            for (var s = 0; s < steps; s++) {
                var p = root;
                if (pattern === "Root-Fifth" && s % 2) p = fifth;
                if (pattern === "Octaves" && s % 2) p = root + 12;
                add(p, c.start + s * step, Math.min(step * gate, c.end - (c.start + s * step)));
            }
        } else if (pattern === "Walking") {
            // One note per step: root, then chord/scale tones, and the last
            // step walks a half step into the next chord's root.
            var line = [root];
            var tones = [root + (c.third || 4), fifth, root + 12];
            for (var w = 1; w < steps; w++) {
                if (w === steps - 1 && next) {
                    line.push(nextRoot + (nextRoot > line[w - 1] ? -1 : 1));
                } else {
                    line.push(w % 2 ? tones[(w - 1) % tones.length] :
                        scaleStep(scalePcs, line[w - 1], line[w - 1] < root + 7 ? 1 : -1));
                }
            }
            line.forEach(function (p, k) { add(p, c.start + k * step, Math.min(step * gate, c.end - (c.start + k * step))); });
        } else if (pattern === "Syncopated") {
            // 3 + 3 + 2 steps (the "tresillo"), repeated through the chord.
            var cell = [[0, 3, root], [3, 3, root], [6, 2, fifth]];
            for (var bar = 0; bar * 8 < steps; bar++) {
                cell.forEach(function (h) {
                    var at = bar * 8 + h[0];
                    if (at < steps) add(h[2], c.start + at * step, Math.min(h[1] * step * gate, c.end - (c.start + at * step)));
                });
            }
        } else if (pattern === "Push") {
            // Hold the root, then hit the next chord's root one step early.
            if (next && dur > step) {
                add(root, c.start, (dur - step) * gate);
                add(nextRoot, c.end - step, step * gate);
            } else {
                add(root, c.start, dur * gate);
            }
        }
    });
    return notes;
}

// ─── MELODY ──────────────────────────────────────────────────────────────────
// A rhythm is made for one bar (reused every bar when Repeat Motif is on).
// Notes on the beat land on chord tones; notes between beats move by scale
// steps. The line wanders up and down but is pulled back towards its centre.

function melodyRhythm(st, rand) {
    var kind = MELODY_RHYTHMS[st.rhythm];
    var onsets = [];
    for (var beat = 0; beat < 4; beat++) {
        var div = kind === "Quarters" ? 1 : kind === "8ths" ? 2 : kind === "16ths" ? 4 :
                  [1, 2, 2, 4][Math.floor(rand() * 4)];
        for (var k = 0; k < div; k++) {
            var onBeat = k === 0;
            var chance = (st.density / 100) + (onBeat ? 0.25 : 0);
            if ((beat === 0 && onBeat) || rand() < chance) onsets.push(beat + k / div);
        }
    }
    return onsets;
}

function melodyLine(st, chords, scalePcs) {
    var notes = [];
    if (!chords.length) return notes;
    var start = chords[0].start, end = chords[chords.length - 1].end;
    var centre = (st.melodyOctave + 2) * 12 + 4;
    var dirRand = seededRandom(st.variation * 7 + 3);
    var pitch = centre;
    var dir = 1;

    for (var bar = 0; start + bar * 4 < end - 1e-6; bar++) {
        var barStart = start + bar * 4;
        var rhythmSeed = st.repeat ? st.variation : st.variation * 100 + bar;
        var onsets = melodyRhythm(st, seededRandom(rhythmSeed));
        for (var i = 0; i < onsets.length; i++) {
            var t = barStart + onsets[i];
            if (t >= end - 1e-6) break;
            var nextT = i + 1 < onsets.length ? barStart + onsets[i + 1] : barStart + 4;
            var chord = chordAt(chords, t);
            if (!chord) continue;

            // Change direction now and then, and always when far from centre.
            if (dirRand() < 0.3) dir = -dir;
            if (pitch > centre + 7) dir = -1;
            if (pitch < centre - 7) dir = 1;

            var onBeat = Math.abs(onsets[i] - Math.round(onsets[i])) < 1e-6;
            if (onBeat) {
                pitch = nearestIn(chord.pcs, pitch + dir * 2);
            } else {
                pitch = scaleStep(scalePcs, pitch, dir);
                if (dirRand() < 0.25) pitch = scaleStep(scalePcs, pitch, dir);  // occasional skip
            }
            var len = Math.min(nextT, end, chord.end) - t;
            if (len > 0.01) {
                notes.push({ pitch: pitch, start_time: t, duration: len * 0.95,
                             velocity: onBeat ? st.velocity : Math.round(st.velocity * 0.85), mute: 0 });
            }
        }
    }
    return notes;
}

function chordAt(chords, t) {
    for (var i = 0; i < chords.length; i++) {
        if (t >= chords[i].start - 1e-6 && t < chords[i].end - 1e-6) return chords[i];
    }
    return null;
}

// ─── BOTH ────────────────────────────────────────────────────────────────────

var lastChords = [];

function transform(st, notes, ctx) {
    var chords = detectChords(notes);
    lastChords = chords;
    var scalePcs = scaleFor(chords, ctx);
    return MODE === "melody" ? melodyLine(st, chords, scalePcs) : bassLine(st, chords, scalePcs);
}

function readoutText() {
    if (!lastChords.length) {
        return MODE === "melody" ?
            "Select chord notes, then Transform to write a melody over them." :
            "Select chord notes, then Transform to turn them into a bassline.";
    }
    return "Chords found:  " + lastChords.map(function (c) { return c.name; }).join("  ");
}

// ─── MAX GLUE ────────────────────────────────────────────────────────────────

var reapply = (typeof Task !== "undefined") ?
    new Task(function () { outlet(1, "bang"); }) : null;

function changed() {
    // Only re-apply once the user has pressed Transform at least once, so
    // moving a control never rewrites a clip by surprise.
    if (ready && lastChords.length && reapply) {
        reapply.cancel();
        reapply.schedule(30);
    }
}

function pattern(v)   { state.pattern = v | 0; changed(); }
function rate(v)      { state.rate = v | 0; changed(); }
function octave(v)    { if (MODE === "melody") state.melodyOctave = v | 0; else state.bassOctave = v | 0; changed(); }
function gate(v)      { state.gate = Math.max(10, Math.min(100, v | 0)); changed(); }
function rhythm(v)    { state.rhythm = v | 0; changed(); }
function density(v)   { state.density = Math.max(0, Math.min(100, v | 0)); changed(); }
function variation(v) { state.variation = v | 0; changed(); }
function repeat(v)    { state.repeat = v ? 1 : 0; changed(); }
function velocity(v)  { state.velocity = Math.max(1, Math.min(127, v | 0)); changed(); }

function loaded() {
    ready = 1;
    outlet(2, "readout", "set", readoutText());
}

function dictionary(name) {
    var data = readDict(name);
    if (inlet === 1) { context = data; return; }
    var out = transform(state, data.notes || [], context);
    outlet(2, "readout", "set", readoutText());
    sendNotes("metamuse_" + MODE + "_out", out);
}
